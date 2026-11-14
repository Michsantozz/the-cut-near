//! Unit tests on a mocked blockchain. `World` drives the contract the way transactions
//! would: it sets the caller, deposit and block time before each call, and carries the
//! storage usage over between calls like the real runtime does. Moves are signed with a
//! test Ed25519 key that the test launch lists in `model_signers`.

use ed25519_dalek::{Signer, SigningKey};
use near_sdk::json_types::{U64, U128};
use near_sdk::mock::MockAction;
use near_sdk::serde_json::{self, json};
use near_sdk::test_utils::{VMContextBuilder, get_created_receipts, get_logs};
use near_sdk::{AccountId, Gas, NearToken, PromiseResult, VMContext, env, testing_env};
use near_sdk_contract_tools::ft::{Nep141, Nep141Controller, Nep145};

use crate::Contract;
use crate::moves::to_hex;
use crate::types::{AgentView, CutRecord, MoveView};

mod contract_agents_saves;
mod contract_cut;
mod contract_moves;
mod contract_pool;
mod math_rules;
mod moves_rules;
mod seasons;

pub const SEC: u64 = 1_000_000_000;
pub const HOUR: u64 = 3_600 * SEC;
pub const DAY: u64 = 86_400 * SEC;
/// Sat Nov 14 2026, 18:00 UTC (the launch).
pub const LAUNCH: u64 = 1_794_679_200 * SEC;
/// Sun Nov 15 2026, 18:00 UTC (the testnet daily first cut).
pub const FIRST_CUT: u64 = 1_794_765_600 * SEC;
pub const MODEL_ID: &str = "z-ai/glm-5.3-flash";

pub const fn cut(whole: u128) -> u128 {
    whole * crate::ONE_CUT
}

pub fn near(whole: u128) -> NearToken {
    NearToken::from_near(whole)
}

pub fn zero() -> NearToken {
    NearToken::from_yoctonear(0)
}

pub fn id(name: &str) -> AccountId {
    name.parse().unwrap()
}

pub fn contract_id() -> AccountId {
    id("thecut.near")
}

pub fn creator_of(agent: &str) -> AccountId {
    id(&format!("creator-{agent}.near"))
}

pub fn agent_account(agent: &str) -> String {
    format!("{agent}.thecut.near")
}

/// The model's TEE key in these tests.
pub fn model_key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}

/// Some other key, not in `model_signers`.
pub fn stranger_key() -> SigningKey {
    SigningKey::from_bytes(&[9u8; 32])
}

pub fn key_hex(key: &SigningKey) -> String {
    to_hex(&key.verifying_key().to_bytes())
}

/// A chat completion as NEAR AI Cloud returns it, with `content` as the answer.
pub fn completion(chat_id: &str, content: &str) -> String {
    json!({
        "id": chat_id,
        "object": "chat.completion",
        "created": 1_794_700_000,
        "model": MODEL_ID,
        "choices": [{
            "index": 0,
            "message": { "role": "assistant", "content": content },
            "finish_reason": "stop"
        }],
        "usage": { "prompt_tokens": 900, "completion_tokens": 60, "total_tokens": 960 }
    })
    .to_string()
}

/// A move object as the model writes it.
pub fn answer(kind: &str, target: Option<&str>, amount: &str, heir: Option<&str>) -> String {
    json!({
        "move": kind,
        "target": target,
        "amount": amount,
        "heir": heir,
        "reason": format!("I {kind}."),
    })
    .to_string()
}

/// `"<model_id>:<hex sha256(request)>:<hex sha256(response)>"` signed by `key`, in hex.
pub fn sign(key: &SigningKey, request: &str, response: &str) -> String {
    let text = format!(
        "{MODEL_ID}:{}:{}",
        to_hex(&env::sha256_array(request.as_bytes())),
        to_hex(&env::sha256_array(response.as_bytes()))
    );
    to_hex(&key.sign(text.as_bytes()).to_bytes())
}

/// Events logged by the last call, as `(standard, event, data)`.
pub fn events() -> Vec<(String, String, serde_json::Value)> {
    get_logs()
        .iter()
        .filter_map(|line| line.strip_prefix("EVENT_JSON:"))
        .map(|json| {
            let value: serde_json::Value = serde_json::from_str(json).unwrap();
            (
                value["standard"].as_str().unwrap().to_string(),
                value["event"].as_str().unwrap().to_string(),
                value["data"].clone(),
            )
        })
        .collect()
}

pub fn event(name: &str) -> Option<serde_json::Value> {
    events()
        .into_iter()
        .find(|(_, event, _)| event == name)
        .map(|(_, _, data)| data)
}

/// Transfers created by the last call, as `(receiver, yoctoNEAR)`.
pub fn transfers() -> Vec<(AccountId, u128)> {
    get_created_receipts()
        .into_iter()
        .flat_map(|receipt| {
            let to = receipt.receiver_id.clone();
            receipt
                .actions
                .into_iter()
                .filter_map(move |action| match action {
                    MockAction::Transfer { deposit, .. } => {
                        Some((to.clone(), deposit.as_yoctonear()))
                    }
                    _ => None,
                })
        })
        .collect()
}

/// Function calls created by the last call, as `(receiver, method, args)`.
pub fn function_calls() -> Vec<(AccountId, String, String)> {
    get_created_receipts()
        .into_iter()
        .flat_map(|receipt| {
            let to = receipt.receiver_id.clone();
            receipt
                .actions
                .into_iter()
                .filter_map(move |action| match action {
                    MockAction::FunctionCallWeight {
                        method_name, args, ..
                    } => Some((
                        to.clone(),
                        String::from_utf8(method_name).unwrap(),
                        String::from_utf8(args).unwrap(),
                    )),
                    _ => None,
                })
        })
        .collect()
}

pub struct World {
    pub c: Contract,
    pub now: u64,
    usage: u64,
    /// Every account that ever held $CUT in this world, for the supply check.
    holders: Vec<String>,
}

pub struct Launch {
    pub stage_size: u32,
    pub min_season: u32,
    pub first_cut_at: u64,
    pub cut_interval: u64,
    pub move_lead: u64,
    pub pool_near: NearToken,
}

impl Default for Launch {
    /// The testnet daily launch, with a deep pool so test accounts can buy a lot of $CUT
    /// (about 0.1 NEAR each).
    fn default() -> Self {
        Self {
            stage_size: 10,
            min_season: 3,
            first_cut_at: FIRST_CUT,
            cut_interval: DAY,
            move_lead: HOUR,
            pool_near: near(1_000_000),
        }
    }
}

fn context(
    predecessor: &AccountId,
    deposit: NearToken,
    now: u64,
    usage: u64,
    gas: Gas,
) -> VMContext {
    VMContextBuilder::new()
        .current_account_id(contract_id())
        .predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor.clone())
        .attached_deposit(deposit)
        .block_timestamp(now)
        .storage_usage(usage)
        .account_balance(near(100_000_000))
        .prepaid_gas(gas)
        .build()
}

impl World {
    pub fn launch(launch: Launch) -> Self {
        testing_env!(context(
            &contract_id(),
            launch.pool_near,
            LAUNCH,
            1_000,
            Gas::from_tgas(300)
        ));
        let c = Contract::new(
            100,
            5_000,
            5_000,
            9_000,
            500,
            launch.stage_size,
            launch.min_season,
            U64(launch.first_cut_at),
            U64(launch.cut_interval),
            U64(launch.move_lead),
            U128(cut(10)),
            U128(cut(1_000)),
            NearToken::from_millinear(300),
            near(1),
            MODEL_ID.to_string(),
            vec![key_hex(&model_key()).to_uppercase()],
            1_200,
            Some("low".to_string()),
        );
        let usage = env::storage_usage();
        Self {
            c,
            now: LAUNCH,
            usage,
            holders: vec![contract_id().to_string()],
        }
    }

    pub fn daily() -> Self {
        Self::launch(Launch::default())
    }

    /// Calls `f` as `who`, attaching `deposit`, at the current time.
    pub fn call<R>(
        &mut self,
        who: &str,
        deposit: NearToken,
        f: impl FnOnce(&mut Contract) -> R,
    ) -> R {
        self.call_with_gas(who, deposit, Gas::from_tgas(300), f)
    }

    pub fn call_with_gas<R>(
        &mut self,
        who: &str,
        deposit: NearToken,
        gas: Gas,
        f: impl FnOnce(&mut Contract) -> R,
    ) -> R {
        testing_env!(context(&id(who), deposit, self.now, self.usage, gas));
        let result = f(&mut self.c);
        self.usage = env::storage_usage();
        result
    }

    /// Runs a private callback as the contract itself, with one promise result.
    pub fn callback<R>(&mut self, result: PromiseResult, f: impl FnOnce(&mut Contract) -> R) -> R {
        testing_env!(
            context(
                &contract_id(),
                zero(),
                self.now,
                self.usage,
                Gas::from_tgas(300)
            ),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![result],
        );
        let r = f(&mut self.c);
        self.usage = env::storage_usage();
        r
    }

    pub fn view<R>(&mut self, f: impl FnOnce(&Contract) -> R) -> R {
        testing_env!(context(
            &id("viewer.near"),
            zero(),
            self.now,
            self.usage,
            Gas::from_tgas(300)
        ));
        f(&self.c)
    }

    fn holds(&mut self, account: &str) {
        if !self.holders.iter().any(|h| h == account) {
            self.holders.push(account.to_string());
        }
    }

    /// Registers a `personality` agent created by `creator-<id>.near` with a 1,000 $CUT
    /// seed, and confirms its account.
    pub fn register_as(&mut self, agent: &str, personality: &str) {
        let creator = creator_of(agent);
        self.buy(creator.as_str(), near(250));
        self.call(creator.as_str(), near(1), |c| {
            c.register_agent(
                agent.to_string(),
                format!("Agent {agent}"),
                format!("The {agent} tagline"),
                format!("@{agent}"),
                personality.to_string(),
                format!("I am {agent}.\nI never give up."),
                U128(cut(1_000)),
            )
            .detach()
        });
        let created = self.callback(PromiseResult::Successful(vec![]), |c| {
            c.on_agent_created(agent.to_string(), U128(cut(1_000)), false)
        });
        assert!(created);
        self.holds(&agent_account(agent));
    }

    /// Registers a gambler.
    pub fn register(&mut self, agent: &str) {
        self.register_as(agent, "gambler");
    }

    pub fn buy(&mut self, who: &str, amount: NearToken) -> u128 {
        self.holds(who);
        self.call(who, amount, |c| c.buy(U128(0))).0
    }

    /// Saves `amount` on `agent`, attaching 0.005 NEAR for the record's storage like the
    /// app does.
    pub fn save(&mut self, who: &str, agent: &str, amount: u128) {
        self.call(who, NearToken::from_millinear(5), |c| {
            c.save(agent.to_string(), U128(amount))
        });
    }

    pub fn boo(&mut self, who: &str, agent: &str, amount: u128) {
        self.call(who, zero(), |c| c.boo(agent.to_string(), U128(amount)));
    }

    /// Registers `to` if needed and sends it `amount` $CUT from `from`.
    pub fn transfer(&mut self, from: &str, to: &str, amount: u128) {
        let registered = self.view(|c| c.storage_balance_of(id(to)).is_some());
        if !registered {
            self.call(to, NearToken::from_millinear(50), |c| {
                c.storage_deposit(None, None);
            });
        }
        self.holds(to);
        self.call(from, NearToken::from_yoctonear(1), |c| {
            c.ft_transfer(id(to), U128(amount), None)
        });
    }

    pub fn balance(&mut self, who: &str) -> u128 {
        self.view(|c| c.ft_balance_of(id(who)).0)
    }

    pub fn wallet(&mut self, agent: &str) -> u128 {
        self.balance(&agent_account(agent))
    }

    pub fn claimable(&mut self, who: &str) -> u128 {
        self.view(|c| c.get_claimable(id(who)).0)
    }

    pub fn agent(&mut self, agent: &str) -> AgentView {
        self.view(|c| c.get_agent(agent.to_string()).expect("agent"))
    }

    pub fn stage_ids(&mut self) -> Vec<String> {
        self.view(|c| c.get_stage().into_iter().map(|r| r.id).collect())
    }

    pub fn bench_ids(&mut self) -> Vec<String> {
        self.view(|c| c.get_bench().into_iter().map(|r| r.id).collect())
    }

    pub fn supply(&mut self) -> u128 {
        self.view(|c| c.ft_total_supply().0)
    }

    /// Moves the clock to the next cut.
    pub fn at_next_cut(&mut self) {
        self.now = self.view(|c| c.get_next_cut().at.0);
    }

    pub fn run_cut(&mut self, runner: &str) -> CutRecord {
        self.at_next_cut();
        self.call(runner, zero(), |c| c.run_cut())
    }

    /// Signs the answer `content` to the request the contract expects from `agent` and
    /// relays it as `relay.near`.
    pub fn submit(&mut self, agent: &str, content: &str) -> MoveView {
        let request = self
            .view(|c| c.get_move_request(agent.to_string()))
            .expect("agent can move");
        let response = completion(&format!("chatcmpl-{agent}"), content);
        let signature = sign(&model_key(), &request, &response);
        self.call("relay.near", zero(), |c| {
            c.submit_move(
                agent.to_string(),
                response,
                signature,
                key_hex(&model_key()),
            )
        })
    }

    /// The contract's $CUT balance equals the pool, the piles, the next prize, the season
    /// pot, the committed moves and the unclaimed prizes; the supply equals minted minus
    /// burned, and burned plus every holder's balance equals minted; the piles add up.
    pub fn assert_books(&mut self) {
        let stats = self.view(|c| c.get_stats());
        assert_eq!(
            stats.contract_balance.0,
            stats.pool_cut_reserve.0
                + stats.total_saved.0
                + stats.fees_since_cut.0
                + stats.season_pot.0
                + stats.committed.0
                + stats.prizes_outstanding.0,
            "contract balance must match its books: {stats:?}"
        );
        assert_eq!(stats.minted.0 - stats.burned.0, stats.total_supply.0);
        let supply = self.supply();
        assert_eq!(supply, stats.total_supply.0);
        assert_eq!(supply, self.view(Nep141Controller::total_supply));
        let holders = self.holders.clone();
        let held: u128 = holders.iter().map(|h| self.balance(h)).sum();
        assert_eq!(
            stats.burned.0 + held,
            stats.minted.0,
            "burned + held == minted"
        );
        let piles: u128 = self.view(|c| {
            let champions: u128 = c
                .get_champions(None, None)
                .iter()
                .filter_map(|champion| c.get_agent(champion.agent_id.clone()))
                .map(|agent| agent.pile.0)
                .sum();
            c.get_stage()
                .iter()
                .chain(c.get_bench().iter())
                .map(|r| r.pile.0)
                .sum::<u128>()
                + champions
        });
        assert_eq!(piles, stats.total_saved.0, "sum of piles = saved total");
    }
}

/// A season seated at cut 1: agents `(id, personality, pile)`, the piles saved by
/// `whale.near`. The stage has exactly one seat per agent.
pub fn season_with(agents: &[(&str, &str, u128)]) -> World {
    let mut w = World::launch(Launch {
        stage_size: agents.len() as u32,
        min_season: agents.len().min(3) as u32,
        ..Launch::default()
    });
    for (agent, personality, _) in agents {
        w.register_as(agent, personality);
    }
    w.buy("whale.near", near(100_000));
    for (agent, _, pile) in agents {
        if *pile > 0 {
            w.save("whale.near", agent, *pile);
        }
    }
    let record = w.run_cut("runner.near");
    assert_eq!(record.seated_ids.len(), agents.len());
    w
}
