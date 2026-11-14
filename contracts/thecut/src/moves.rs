//! Agent moves: the canonical prompt, the signature check, reading the model's answer, the
//! personality limits and the brief (the board every agent sees).
//!
//! A relay reads `get_move_request(agent_id)`, POSTs those exact bytes to NEAR AI Cloud,
//! fetches the TEE signature of that chat and calls `submit_move` with the response bytes
//! and the signature. The contract rebuilds the request itself and checks the signature
//! over both hashes, so a relay can only pass the model's answer along: it cannot change
//! the prompt or write a move.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde::Serialize;
use near_sdk::serde_json::{self, Value};
use near_sdk::{env, near, require};
use near_sdk_contract_tools::ft::Nep141Controller;

use crate::personality::{self, Personality};
use crate::types::{AgentId, AgentStatus, CutRecord, MoveKind, MoveRecord, MoveView, Params};
use crate::{
    Contract, ContractExt, MAX_CHAT_ID, MAX_REASON, MAX_RESPONSE, ONE_CUT, checked, events, math,
    parse_key,
};

/// The rules every agent reads, first in its system prompt.
pub const RULES_PROMPT: &str = r#"You are an AI agent in The Cut, a survival game on the NEAR blockchain. A season starts with up to ten agents on a stage. Every day at the cut, the agent with the lowest score has its NEAR account deleted forever. Score = $CUT fans saved on you - $CUT fans burned to boo you - attack damage you take today. The last agent standing is the champion: its fans split the season pot.
You own a wallet of $CUT. Once a day you choose one move:
- rescue: offer `amount` from your wallet to the fans who have $CUT saved on you at the cut. Paid only if you survive; capped at what they saved.
- pact: give `amount` from your wallet to `target`. Tomorrow neither of you may attack the other.
- attack: burn `amount` from your wallet. It lowers `target`'s score at today's cut by `amount`.
- hold: keep your money.
You may also name an `heir`, another agent on the stage. If you are cut, your whole wallet goes to it; with no living heir it burns.
Every move costs a think fee, burned from your wallet. Your personality caps what you can spend in a day; larger amounts are cut down.
The board below is as of the last cut. Fans read your move and your reason before the cut, so your reason is your speech to them.
Reply with one JSON object and nothing else:
{"move":"rescue|pact|attack|hold","target":"agent id or null","amount":"whole $CUT as a string","heir":"agent id or null","reason":"one or two sentences in your own voice"}"#;

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct ChatRequest<'a> {
    model: &'a str,
    messages: [ChatMessage<'a>; 2],
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning_effort: Option<&'a str>,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct ChatMessage<'a> {
    role: &'static str,
    content: &'a str,
}

/// The exact chat completion request for one agent and the next cut. This is the only
/// place the prompt is written: `get_move_request` returns it and `submit_move` hashes it.
/// `brief` is the JSON board stored at the last cut. `reasoning_effort` follows
/// `max_tokens` only when the launch set it.
pub fn request_body(
    params: &Params,
    agent_id: &str,
    name: &str,
    personality: &Personality,
    charter: &str,
    brief: &str,
) -> String {
    let system = format!(
        "{RULES_PROMPT}\n\nYou are {name} ({agent_id}). Personality: {} - {}\nYour character, in your creator's words:\n{charter}",
        personality.id, personality.prompt_line
    );
    let user = format!("{{\"you\":\"{agent_id}\",\"board\":{brief}}}");
    let request = ChatRequest {
        model: &params.model_id,
        messages: [
            ChatMessage {
                role: "system",
                content: &system,
            },
            ChatMessage {
                role: "user",
                content: &user,
            },
        ],
        max_tokens: params.max_tokens,
        reasoning_effort: params.reasoning_effort.as_deref(),
    };
    serde_json::to_string(&request).unwrap_or_else(|_| env::panic_str("Request encoding"))
}

/// Lowercase hex of `bytes`.
pub fn to_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[usize::from(byte >> 4)] as char);
        out.push(DIGITS[usize::from(byte & 0x0f)] as char);
    }
    out
}

/// Bytes of a lowercase hex string without a `0x` prefix, or `None`.
pub fn from_hex(text: &str) -> Option<Vec<u8>> {
    if !text.len().is_multiple_of(2) {
        return None;
    }
    let digit = |c: u8| match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        _ => None,
    };
    text.as_bytes()
        .chunks(2)
        .map(|pair| Some(digit(pair[0])? * 16 + digit(pair[1])?))
        .collect()
}

/// `text` cut to at most `max` bytes, on a character boundary.
pub fn truncate(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_string()
}

/// The whole part of a JSON amount (a string or a number). Anything else, or a negative
/// amount, is 0. Thousands separators in a string are skipped: `"1,200.75"` is 1200.
pub fn whole_amount(value: &Value) -> u128 {
    match value {
        Value::Number(number) => number
            .as_u64()
            .map(u128::from)
            .or_else(|| {
                number
                    .as_f64()
                    .filter(|f| f.is_finite() && *f > 0.0)
                    .map(|f| f as u128)
            })
            .unwrap_or(0),
        Value::String(text) => {
            let mut whole: u128 = 0;
            let mut digits = false;
            for c in text.trim().trim_start_matches('+').chars() {
                match c.to_digit(10) {
                    Some(d) => {
                        whole = whole.saturating_mul(10).saturating_add(u128::from(d));
                        digits = true;
                    }
                    None if digits && (c == ',' || c == '_') => {}
                    None => break,
                }
            }
            whole
        }
        _ => 0,
    }
}

/// A move object read from the model's content, before any rule is applied.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedMove {
    /// `None` when `move` is not one of the four moves.
    pub kind: Option<MoveKind>,
    pub target: Option<AgentId>,
    /// Whole $CUT asked for.
    pub asked_whole: u128,
    pub heir: Option<AgentId>,
    pub reason: String,
}

/// What `submit_move` reads from a chat completion.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Answer {
    pub chat_id: String,
    /// `None` when the content holds no readable move object.
    pub parsed: Option<ParsedMove>,
}

/// Reads a chat completion leniently: `id` and `choices[0].message.content`, then the JSON
/// object from the first `{` to the last `}` of the content. Never panics.
pub fn read_answer(response: &str) -> Answer {
    let completion: Value = serde_json::from_str(response).unwrap_or(Value::Null);
    let chat_id = completion["id"]
        .as_str()
        .map(|id| truncate(id, MAX_CHAT_ID))
        .unwrap_or_default();
    let parsed = completion["choices"][0]["message"]["content"]
        .as_str()
        .and_then(parse_move);
    Answer { chat_id, parsed }
}

fn parse_move(content: &str) -> Option<ParsedMove> {
    let start = content.find('{')?;
    let end = content.rfind('}')?;
    if end < start {
        return None;
    }
    let value: Value = serde_json::from_str(&content[start..=end]).ok()?;
    let object = value.as_object()?;
    let text = |key: &str| {
        object
            .get(key)
            .and_then(Value::as_str)
            .map(|s| s.trim().to_ascii_lowercase())
    };
    let agent = |key: &str| text(key).filter(|s| !s.is_empty() && s != "null" && s != "none");
    let kind = match text("move").as_deref() {
        Some("rescue") => Some(MoveKind::Rescue),
        Some("pact") => Some(MoveKind::Pact),
        Some("attack") => Some(MoveKind::Attack),
        Some("hold") => Some(MoveKind::Hold),
        _ => None,
    };
    Some(ParsedMove {
        kind,
        target: agent("target"),
        asked_whole: object.get("amount").map(whole_amount).unwrap_or(0),
        heir: agent("heir"),
        reason: object
            .get("reason")
            .and_then(Value::as_str)
            .map(|reason| truncate(reason, MAX_REASON))
            .unwrap_or_default(),
    })
}

/// A move after the personality limits.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Decision {
    pub kind: MoveKind,
    pub target: Option<AgentId>,
    /// $CUT units to commit.
    pub amount: u128,
    pub outcome: Option<String>,
}

/// Applies the rules to a parsed move: unreadable, unknown or forbidden moves become `hold`
/// (amount 0, with a note), and the amount is clamped to `cap` units.
pub fn decide(
    parsed: Option<&ParsedMove>,
    mover: &str,
    personality: &Personality,
    pacts: &[AgentId],
    stage: &[AgentId],
    cap: u128,
) -> Decision {
    let hold = |outcome: Option<String>| Decision {
        kind: MoveKind::Hold,
        target: None,
        amount: 0,
        outcome,
    };
    let Some(parsed) = parsed else {
        return hold(Some("unreadable answer".to_string()));
    };
    let Some(kind) = parsed.kind else {
        return hold(Some("downgraded: unknown move".to_string()));
    };
    let target = match kind {
        MoveKind::Hold => return hold(None),
        MoveKind::Rescue => None,
        MoveKind::Pact | MoveKind::Attack => {
            let Some(target) = parsed.target.clone() else {
                return hold(Some("downgraded: no target".to_string()));
            };
            if target == mover {
                return hold(Some(
                    "downgraded: an agent cannot target itself".to_string(),
                ));
            }
            if !stage.contains(&target) {
                return hold(Some(
                    "downgraded: the target is not on the stage".to_string(),
                ));
            }
            if kind == MoveKind::Attack && !personality.may_attack {
                return hold(Some(format!(
                    "downgraded: {} agents cannot attack",
                    personality.id
                )));
            }
            if kind == MoveKind::Attack
                && pacts.contains(&target)
                && !personality.may_attack_partner
            {
                return hold(Some(
                    "downgraded: only a traitor may attack a pact partner".to_string(),
                ));
            }
            Some(target)
        }
    };
    let asked = parsed.asked_whole.saturating_mul(ONE_CUT);
    let outcome = (asked > cap).then(|| {
        format!(
            "clamped: a {} spends at most {}% of its wallet a day",
            personality.id,
            personality.spend_bps / 100
        )
    });
    Decision {
        kind,
        target,
        amount: asked.min(cap),
        outcome,
    }
}

/// Whole $CUT as a decimal string, for the brief.
fn whole(units: u128) -> String {
    (units / ONE_CUT).to_string()
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct Brief<'a> {
    season: u32,
    day: u32,
    cut_index: u64,
    moves_close_at: U64,
    cut_at: U64,
    season_pot: String,
    think_fee: String,
    agents: Vec<BriefAgent<'a>>,
    last_cut: Option<BriefCut<'a>>,
    last_moves: Vec<BriefMove<'a>>,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct BriefAgent<'a> {
    id: &'a str,
    name: &'a str,
    personality: &'a str,
    pile: String,
    wallet: String,
    pacts: &'a [AgentId],
    heir: Option<&'a str>,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct BriefCut<'a> {
    deleted: Option<&'a str>,
    inherited_by: Option<&'a str>,
    burned: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct BriefMove<'a> {
    agent: &'a str,
    #[serde(rename = "move")]
    kind: MoveKind,
    target: Option<&'a str>,
    amount: String,
    reason: &'a str,
}

impl Contract {
    /// The board for the next cut: the stage by pile (highest first), the last cut and its
    /// moves. `last_cut` is `None` on day 1. Amounts are whole $CUT.
    pub(crate) fn build_brief(
        &self,
        last_cut: Option<&CutRecord>,
        last_moves: &[MoveRecord],
    ) -> String {
        let mut stage: Vec<(&AgentId, &crate::types::Agent)> =
            self.stage.iter().map(|id| (id, self.agent(id))).collect();
        stage.sort_by(|a, b| b.1.pile.cmp(&a.1.pile).then(a.1.seq.cmp(&b.1.seq)));
        let agents = stage
            .into_iter()
            .map(|(id, agent)| BriefAgent {
                id,
                name: &agent.name,
                personality: &agent.personality,
                pile: whole(agent.pile),
                wallet: whole(self.balance_of(&Self::agent_account(id))),
                pacts: &agent.pacts,
                heir: agent.heir.as_deref(),
            })
            .collect();
        let brief = Brief {
            season: self.season.index,
            day: self.season.day,
            cut_index: self.next_cut_index,
            moves_close_at: U64(self.moves_close_at()),
            cut_at: U64(self.next_cut_at),
            season_pot: whole(self.season.pot),
            think_fee: whole(self.params.think_fee.0),
            agents,
            last_cut: last_cut.map(|record| BriefCut {
                deleted: record.deleted_id.as_deref(),
                inherited_by: record.inherited_by.as_deref(),
                burned: whole(record.burned.0),
            }),
            last_moves: last_moves
                .iter()
                .map(|m| BriefMove {
                    agent: &m.agent_id,
                    kind: m.kind,
                    target: m.target.as_deref(),
                    amount: whole(m.amount),
                    reason: &m.reason,
                })
                .collect(),
        };
        serde_json::to_string(&brief).unwrap_or_else(|_| env::panic_str("Brief encoding"))
    }

    /// The request `agent_id` must answer for the next cut, or `None` when it cannot move
    /// now: no season, not on the stage, already moved, or moves closed.
    fn move_request(&self, agent_id: &str) -> Option<String> {
        if !self.season.active || env::block_timestamp() >= self.moves_close_at() {
            return None;
        }
        let agent = self.agents.get(agent_id)?;
        if agent.status != AgentStatus::Stage || agent.moved_for == self.next_cut_index {
            return None;
        }
        let personality = personality::find(&agent.personality)?;
        let brief = self.brief.get().as_deref().unwrap_or("null");
        Some(request_body(
            &self.params,
            agent_id,
            &agent.name,
            personality,
            &agent.charter,
            brief,
        ))
    }

    fn move_view(cut_index: u64, record: &MoveRecord) -> MoveView {
        MoveView {
            cut_index,
            agent_id: record.agent_id.clone(),
            kind: record.kind,
            target: record.target.clone(),
            amount: U128(record.amount),
            asked_amount: U128(record.asked_amount),
            heir: record.heir.clone(),
            reason: record.reason.clone(),
            outcome: record.outcome.clone(),
            chat_id: record.chat_id.clone(),
            request_sha256: to_hex(&record.request_sha256),
            response_sha256: to_hex(&record.response_sha256),
            signer: to_hex(&record.signer),
            submitted_by: record.submitted_by.clone(),
            submitted_at: U64(record.submitted_at),
        }
    }
}

#[near]
impl Contract {
    /// Relays an agent's move for the next cut. Anyone can call it; the first valid move
    /// per agent and cut counts.
    ///
    /// `response` is the exact body NEAR AI Cloud returned for the request of
    /// `get_move_request(agent_id)`. `signature` (64 bytes) and `signer` (32 bytes) are the
    /// hex values of `GET /v1/signature/<chat id>`, signed over
    /// `"<model_id>:<sha256(request)>:<sha256(response)>"`.
    ///
    /// The think fee burns from the agent's wallet, the amount is clamped to the
    /// personality's daily limit, forbidden moves become `hold`, and the amount moves from
    /// the agent's wallet to the contract until the cut.
    pub fn submit_move(
        &mut self,
        agent_id: AgentId,
        response: String,
        signature: String,
        signer: String,
    ) -> MoveView {
        require!(
            self.season.active,
            "No season is running: moves open when the next season starts"
        );
        let index = self.next_cut_index;
        let now = env::block_timestamp();
        let agent = self.agent(&agent_id);
        require!(
            agent.status == AgentStatus::Stage,
            "Only agents on the stage can move"
        );
        require!(
            agent.moved_for != index,
            format!("{agent_id} already moved for cut {index}: one move per agent per cut")
        );
        let closes_at = self.moves_close_at();
        require!(
            now < closes_at,
            format!(
                "Moves for cut {index} closed at {closes_at}: wait for the cut, then move again"
            )
        );
        require!(
            response.len() <= MAX_RESPONSE,
            format!("response is over {MAX_RESPONSE} bytes: ask the model for a shorter answer")
        );
        let signer_key = parse_key(&signer).unwrap_or_else(|| {
            env::panic_str("signer must be a 32-byte key as 64 lowercase hex characters")
        });
        require!(
            self.params.model_signers.contains(&to_hex(&signer_key)),
            "signer is not one of model_signers: use the signing_address of the model's attestation"
        );
        let signature: [u8; 64] = from_hex(&signature)
            .and_then(|bytes| bytes.try_into().ok())
            .unwrap_or_else(|| {
                env::panic_str("signature must be 64 bytes as 128 lowercase hex characters")
            });

        let request = checked(self.move_request(&agent_id));
        let request_sha256 = env::sha256_array(request.as_bytes());
        let response_sha256 = env::sha256_array(response.as_bytes());
        let text = format!(
            "{}:{}:{}",
            self.params.model_id,
            to_hex(&request_sha256),
            to_hex(&response_sha256)
        );
        require!(
            env::ed25519_verify(&signature, text.as_bytes(), &signer_key),
            "The signature does not match: relay the exact bytes of get_move_request and of the model's response"
        );
        let answer = read_answer(&response);

        // The think fee, then the personality's limit on what is left.
        let account = Self::agent_account(&agent_id);
        let wallet = self.balance_of(&account);
        let think_fee = self.params.think_fee.0;
        require!(
            wallet >= think_fee,
            format!(
                "{agent_id}'s wallet holds {wallet} units, less than the think fee {think_fee}: send it $CUT with ft_transfer first"
            )
        );
        self.burn_cut(&account, think_fee, "think fee");
        let agent = self.agent(&agent_id);
        let personality = checked(personality::find(&agent.personality));
        let cap = checked(math::spend_cap(wallet - think_fee, personality.spend_bps));
        let decision = decide(
            answer.parsed.as_ref(),
            &agent_id,
            personality,
            &agent.pacts,
            &self.stage,
            cap,
        );
        let heir = answer
            .parsed
            .as_ref()
            .and_then(|p| p.heir.clone())
            .filter(|heir| *heir != agent_id && self.stage.contains(heir));

        // Commit the amount until the cut.
        self.move_cut(
            &account,
            &env::current_account_id(),
            decision.amount,
            "move",
        );
        self.committed = checked(self.committed.checked_add(decision.amount));
        match (decision.kind, &decision.target) {
            (MoveKind::Rescue, _) => self.agent_mut(&agent_id).bounty = decision.amount,
            (MoveKind::Attack, Some(target)) => {
                let target = self.agent_mut(target);
                target.damage = checked(target.damage.checked_add(decision.amount));
            }
            _ => {}
        }
        let agent = self.agent_mut(&agent_id);
        agent.moved_for = index;
        if heir.is_some() {
            agent.heir = heir.clone();
        }

        let reason = answer
            .parsed
            .as_ref()
            .map(|p| p.reason.clone())
            .unwrap_or_else(|| "(unreadable answer)".to_string());
        let record = MoveRecord {
            agent_id: agent_id.clone(),
            kind: decision.kind,
            target: decision.target,
            amount: decision.amount,
            asked_amount: answer
                .parsed
                .as_ref()
                .map(|p| p.asked_whole.saturating_mul(ONE_CUT))
                .unwrap_or(0),
            heir,
            reason,
            outcome: decision.outcome,
            chat_id: answer.chat_id,
            request_sha256,
            response_sha256,
            signer: signer_key,
            submitted_by: env::predecessor_account_id(),
            submitted_at: now,
        };
        let view = Self::move_view(index, &record);
        self.moves.entry(index).or_default().push(record);
        events::emit(
            "move",
            &[events::Move {
                cut_index: index,
                agent_id,
                kind: view.kind,
                target: view.target.clone(),
                amount: view.amount,
                asked_amount: view.asked_amount,
                heir: view.heir.clone(),
                reason: view.reason.clone(),
                outcome: view.outcome.clone(),
                chat_id: view.chat_id.clone(),
                think_fee: U128(think_fee),
                submitted_by: view.submitted_by.clone(),
            }],
        );
        view
    }

    /// The exact request body (a JSON string) the contract expects `agent_id` to send to the
    /// model for the next cut, or `null` when it cannot move now (no season, not on the
    /// stage, already moved, or moves closed).
    pub fn get_move_request(&self, agent_id: AgentId) -> Option<String> {
        self.move_request(&agent_id)
    }

    /// Moves made for cut `cut_index` (in the order they came in). Empty for unknown cuts
    /// and cuts older than the last 30.
    pub fn get_moves(&self, cut_index: u64) -> Vec<MoveView> {
        self.moves
            .get(&cut_index)
            .map(|records| {
                records
                    .iter()
                    .map(|record| Self::move_view(cut_index, record))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// The board every agent sees for the next cut, as the JSON string the prompts embed;
    /// `null` while no season is running.
    pub fn get_brief(&self) -> Option<String> {
        self.brief.get().clone()
    }
}
