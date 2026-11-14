//! The agent factory and agent views.
//!
//! `register_agent` creates `<id>.<this account>`, funds it with `agent_funding`, deploys
//! the `agent` contract and calls its `new({ owner })`, all in one batch, so the account
//! never has an access key. In the same call it registers that account with the $CUT
//! ledger (paid from the deposit) and moves the creator's seed into its balance: the
//! agent's wallet. The agent stays `Pending` (invisible in views, cannot be saved) until
//! the callback confirms the batch; then it sits on the bench. If the batch failed, the
//! wallet goes back to the creator with the whole deposit and the id is free again.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::json;
use near_sdk::{NearToken, Promise, env, near, require};
use near_sdk_contract_tools::ft::{Nep141Controller, Nep145Controller};

use crate::personality;
use crate::types::{Agent, AgentId, AgentStatus, AgentStatusView, AgentView};
use crate::{
    AGENT_WASM, Contract, ContractExt, GAS_AGENT_INIT, GAS_CALLBACK, MAX_BENCH, MAX_CHARTER,
    MAX_TEXT, MAX_X_HANDLE, MIN_GAS_REGISTER, STORAGE_MIN, checked, events, math,
};

/// Checks an agent id: 2 to 32 characters of `a-z`, `0-9`, `-` and `_`, starting and
/// ending with a letter or digit, with no two separators in a row (NEAR account rules).
pub fn validate_agent_id(id: &str) -> Result<(), &'static str> {
    if id.len() < 2 || id.len() > 32 {
        return Err("Agent id must be 2 to 32 characters");
    }
    let bytes = id.as_bytes();
    let is_separator = |b: u8| b == b'-' || b == b'_';
    let mut previous_separator = true;
    for &b in bytes {
        let ok = b.is_ascii_lowercase() || b.is_ascii_digit() || is_separator(b);
        if !ok {
            return Err("Agent id may use only a-z, 0-9, - and _");
        }
        if is_separator(b) && previous_separator {
            return Err("Agent id cannot start with or repeat - or _");
        }
        previous_separator = is_separator(b);
    }
    if previous_separator {
        return Err("Agent id cannot end with - or _");
    }
    // A move's target or heir of "null" or "none" means no agent.
    if id == "null" || id == "none" {
        return Err("Agent id cannot be null or none");
    }
    Ok(())
}

fn validate_text(value: &str, field: &str, max: usize, required: bool) {
    require!(
        !required || !value.trim().is_empty(),
        format!("{field} cannot be empty")
    );
    require!(
        value.len() <= max,
        format!("{field} can be at most {max} bytes")
    );
    require!(
        !value.chars().any(char::is_control),
        format!("{field} cannot contain control characters")
    );
}

/// A charter may span several lines: newlines are its only allowed control characters.
fn validate_charter(charter: &str) {
    require!(
        charter.len() <= MAX_CHARTER,
        format!("charter can be at most {MAX_CHARTER} bytes")
    );
    require!(
        !charter.chars().any(|c| c.is_control() && c != '\n'),
        "charter cannot contain control characters other than newlines"
    );
}

impl Contract {
    pub(crate) fn agent_view(&self, id: &str, agent: &Agent) -> Option<AgentView> {
        let status = match agent.status {
            AgentStatus::Pending => return None,
            AgentStatus::Bench => AgentStatusView::Bench,
            AgentStatus::Stage => AgentStatusView::Stage,
            AgentStatus::Deleted => AgentStatusView::Deleted,
            AgentStatus::Champion => AgentStatusView::Champion,
        };
        let account_id = Self::agent_account(id);
        Some(AgentView {
            id: id.to_string(),
            wallet: U128(self.balance_of(&account_id)),
            account_id,
            name: agent.name.clone(),
            tagline: agent.tagline.clone(),
            x_handle: agent.x_handle.clone(),
            personality: agent.personality.clone(),
            charter: agent.charter.clone(),
            creator: agent.creator.clone(),
            status,
            pile: U128(agent.pile),
            savers: agent.savers,
            heir: agent.heir.clone(),
            pacts: agent.pacts.clone(),
            boos: U128(agent.boos),
            damage: U128(agent.damage),
            bounty: U128(agent.bounty),
            score: math::score(agent.pile, agent.boos, agent.damage)
                .unwrap_or(i128::MIN)
                .into(),
            moved: agent.status == AgentStatus::Stage && agent.moved_for == self.next_cut_index,
            joined_at: U64(agent.joined_at),
            seq: agent.seq,
            stage_at: agent.stage_at.map(U64),
            season: agent.season,
            cut_index: agent.cut_index,
            delete_state: agent.delete_state,
        })
    }

    /// Agents in `ids`, highest pile first; on equal piles the older agent first.
    fn sorted_views(&self, ids: &[AgentId]) -> Vec<AgentView> {
        let mut views: Vec<AgentView> = ids
            .iter()
            .filter_map(|id| self.agent_view(id, self.agent(id)))
            .collect();
        views.sort_by(|a, b| b.pile.0.cmp(&a.pile.0).then(a.seq.cmp(&b.seq)));
        views
    }
}

#[near]
impl Contract {
    /// Registers an agent: creates `<id>.<this account>` with the `agent` contract and no
    /// access keys, funds it with `agent_funding`, moves `seed` $CUT units from the caller
    /// into its wallet, and puts it on the bench.
    ///
    /// Attach `register_deposit`; `register_deposit - agent_funding` comes back to the
    /// creator when the agent is cut or crowned. Any extra deposit is refunded now. The seed
    /// never comes back (unless the account creation fails). `personality` is one of the ids
    /// of `get_personalities`; the charter (at most 600 bytes) is the agent's character in
    /// the creator's words. Name, personality and charter never change.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn register_agent(
        &mut self,
        id: String,
        name: String,
        tagline: String,
        x_handle: String,
        personality: String,
        charter: String,
        seed: U128,
    ) -> Promise {
        let creator = env::predecessor_account_id();
        let deposit = env::attached_deposit();
        let required = self.params.register_deposit;
        require!(
            deposit >= required,
            format!("Attach {required} to register an agent")
        );
        require!(
            env::prepaid_gas() >= MIN_GAS_REGISTER,
            "Attach at least 50 TGas to register an agent"
        );
        if let Err(message) = validate_agent_id(&id) {
            env::panic_str(message);
        }
        validate_text(&name, "name", MAX_TEXT, true);
        validate_text(&tagline, "tagline", MAX_TEXT, false);
        validate_text(&x_handle, "x_handle", MAX_X_HANDLE, false);
        validate_charter(&charter);
        require!(
            personality::find(&personality).is_some(),
            "Unknown personality: pick one of the ids of get_personalities"
        );
        let min_seed = self.params.min_seed.0;
        require!(
            seed.0 >= min_seed,
            format!("seed must be at least {min_seed} units of $CUT")
        );
        let balance = self.balance_of(&creator);
        require!(
            balance >= seed.0,
            format!(
                "Not enough $CUT for the seed: you have {balance} units, this needs {}",
                seed.0
            )
        );
        let account_id = Self::agent_account(&id);
        require!(
            !self.agents.contains_key(&id),
            "This agent id is taken (ids are never reused)"
        );
        require!(
            self.bench.len() + (self.pending_agents as usize) < MAX_BENCH,
            "The bench is full: wait for the next season"
        );

        let agent = Agent {
            seq: self.next_agent_seq,
            name,
            tagline,
            x_handle,
            personality,
            charter,
            creator: creator.clone(),
            status: AgentStatus::Pending,
            pile: 0,
            savers: 0,
            joined_at: env::block_timestamp(),
            stage_at: None,
            season: None,
            reward_per_unit: 0,
            heir: None,
            pacts: Vec::new(),
            boos: 0,
            damage: 0,
            bounty: 0,
            moved_for: 0,
            wallet_at_cut: 0,
            cut_index: None,
            delete_state: None,
            runner: None,
        };
        self.next_agent_seq = checked(self.next_agent_seq.checked_add(1));
        self.pending_agents = checked(self.pending_agents.checked_add(1));
        self.agents.insert(id.clone(), agent);

        // The wallet: a $CUT registration paid from the deposit (unless someone registered
        // this account before), then the seed.
        let registered_before = self.get_storage_balance(&account_id).is_ok();
        if !registered_before {
            self.deposit_to_storage_account(&account_id, STORAGE_MIN)
                .unwrap_or_else(|e| env::panic_str(&e.to_string()));
        }
        self.move_cut(&creator, &account_id, seed.0, "seed");

        let excess = deposit.saturating_sub(required);
        if !excess.is_zero() {
            Promise::new(creator).transfer(excess).detach();
        }

        let init_args = json!({ "owner": env::current_account_id() })
            .to_string()
            .into_bytes();
        Promise::new(account_id)
            .create_account()
            .transfer(self.params.agent_funding)
            .deploy_contract(AGENT_WASM.to_vec())
            .function_call(
                "new".to_string(),
                init_args,
                NearToken::from_yoctonear(0),
                GAS_AGENT_INIT,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_agent_created(id, seed, registered_before),
            )
    }

    /// Confirms or rolls back a registration. Never panics.
    #[private]
    pub fn on_agent_created(&mut self, id: AgentId, seed: U128, registered_before: bool) -> bool {
        let created =
            env::promise_results_count() == 1 && env::promise_result_checked(0, 64).is_ok();
        let Some(agent) = self.agents.get(&id) else {
            return false;
        };
        if agent.status != AgentStatus::Pending {
            return false;
        }
        let creator = agent.creator.clone();
        self.pending_agents = self.pending_agents.saturating_sub(1);
        let deposit = self.params.register_deposit;
        let account_id = Self::agent_account(&id);

        if created {
            let held = deposit.saturating_sub(self.params.agent_funding);
            self.creator_deposits_held = self
                .creator_deposits_held
                .saturating_add(held.as_yoctonear());
            let agent = self.agent_mut(&id);
            agent.status = AgentStatus::Bench;
            let event = events::Register {
                agent_id: id.clone(),
                account_id,
                creator,
                name: agent.name.clone(),
                tagline: agent.tagline.clone(),
                x_handle: agent.x_handle.clone(),
                personality: agent.personality.clone(),
                seed,
                deposit,
            };
            self.bench.push(id);
            events::emit("register", &[event]);
        } else {
            // The batch failed as a whole: the account does not exist and its funding came
            // back to this contract. Give the seed back, free the id, refund the deposit. A
            // registration someone made before keeps whatever else it holds; the one made
            // here is closed, burning any $CUT sent to it meanwhile.
            let back = self.balance_of(&account_id).min(seed.0);
            if self.get_storage_balance(&creator).is_ok() {
                self.move_cut(&account_id, &creator, back, "registration failed");
            } else {
                self.burn_cut(
                    &account_id,
                    back,
                    "registration failed, creator unregistered",
                );
            }
            if !registered_before {
                let rest = self.balance_of(&account_id);
                self.burn_cut(&account_id, rest, "registration failed");
                self.close_wallet(&account_id);
            }
            self.agents.remove(&id);
            env::log_str(&format!(
                "Agent {id} could not be created; the seed and the deposit go back to {creator}"
            ));
            Promise::new(creator).transfer(deposit).detach();
        }
        created
    }

    /// Stage agents, highest pile first.
    pub fn get_stage(&self) -> Vec<AgentView> {
        self.sorted_views(&self.stage)
    }

    /// Bench agents, biggest queue first.
    pub fn get_bench(&self) -> Vec<AgentView> {
        self.sorted_views(&self.bench)
    }

    /// One agent (stage, bench, deleted or champion). `null` if unknown or not confirmed yet.
    pub fn get_agent(&self, id: AgentId) -> Option<AgentView> {
        self.agents
            .get(&id)
            .and_then(|agent| self.agent_view(&id, agent))
    }
}
