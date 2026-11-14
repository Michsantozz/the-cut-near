//! The agent factory and agent views.
//!
//! `register_agent` creates `<id>.<this account>`, funds it with `agent_funding`, deploys
//! the `agent` contract and calls its `new({ owner })`, all in one batch, so the account
//! never has an access key. The agent stays `Pending` (invisible in views, cannot be saved)
//! until the callback confirms the batch; then it sits on the bench. If the batch failed,
//! the record is removed and the whole deposit goes back to the creator.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::json;
use near_sdk::{NearToken, Promise, env, near, require};

use crate::types::{Agent, AgentId, AgentStatus, AgentStatusView, AgentView};
use crate::{
    Contract, ContractExt, GAS_CALLBACK, GAS_AGENT_INIT, MAX_BENCH, MAX_TEXT, MAX_X_HANDLE,
    MIN_GAS_REGISTER, AGENT_WASM, checked, events,
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

impl Contract {
    pub(crate) fn agent_view(&self, id: &str, agent: &Agent) -> Option<AgentView> {
        let status = match agent.status {
            AgentStatus::Pending => return None,
            AgentStatus::Bench => AgentStatusView::Bench,
            AgentStatus::Stage => AgentStatusView::Stage,
            AgentStatus::Deleted => AgentStatusView::Deleted,
        };
        Some(AgentView {
            id: id.to_string(),
            account_id: Self::agent_account(id),
            name: agent.name.clone(),
            kind: agent.kind.clone(),
            x_handle: agent.x_handle.clone(),
            creator: agent.creator.clone(),
            status,
            pile: U128(agent.pile),
            savers: agent.savers,
            joined_at: U64(agent.joined_at),
            seq: agent.seq,
            stage_at: agent.stage_at.map(U64),
            cut_index: agent.cut_index,
            delete_state: agent.delete_state,
        })
    }

    /// Agents in `ids`, highest pile first; on equal piles the older agent first (so the
    /// last row is the one the cut would delete).
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
    /// access keys, funds it with `agent_funding`, and puts it on the bench.
    /// Attach `register_deposit` (5 NEAR); `register_deposit - agent_funding` (4.5 NEAR)
    /// comes back to the creator when the agent is cut. Any extra deposit is refunded now.
    #[payable]
    pub fn register_agent(
        &mut self,
        id: String,
        name: String,
        kind: String,
        x_handle: String,
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
        validate_text(&kind, "kind", MAX_TEXT, true);
        validate_text(&x_handle, "x_handle", MAX_X_HANDLE, false);
        let account_id = Self::agent_account(&id);
        require!(
            !self.agents.contains_key(&id),
            "This agent id is taken (ids are never reused)"
        );
        require!(
            self.bench.len() + (self.pending_agents as usize) < MAX_BENCH,
            "The bench is full: wait for the next cut"
        );

        let agent = Agent {
            seq: self.next_agent_seq,
            name,
            kind,
            x_handle,
            creator: creator.clone(),
            status: AgentStatus::Pending,
            pile: 0,
            savers: 0,
            joined_at: env::block_timestamp(),
            stage_at: None,
            reward_per_unit: 0,
            cut_index: None,
            delete_state: None,
            runner: None,
        };
        self.next_agent_seq = checked(self.next_agent_seq.checked_add(1));
        self.pending_agents = checked(self.pending_agents.checked_add(1));
        self.agents.insert(id.clone(), agent);

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
                    .on_agent_created(id),
            )
    }

    /// Confirms or rolls back a registration. Never panics.
    #[private]
    pub fn on_agent_created(&mut self, id: AgentId) -> bool {
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

        if created {
            let held = deposit.saturating_sub(self.params.agent_funding);
            self.creator_deposits_held = self
                .creator_deposits_held
                .saturating_add(held.as_yoctonear());
            let agent = self.agent_mut(&id);
            agent.status = AgentStatus::Bench;
            let (name, kind, x_handle) = (
                agent.name.clone(),
                agent.kind.clone(),
                agent.x_handle.clone(),
            );
            self.bench.push(id.clone());
            events::emit(
                "register",
                &[events::Register {
                    account_id: Self::agent_account(&id),
                    agent_id: id,
                    creator,
                    name,
                    kind,
                    x_handle,
                    deposit,
                }],
            );
        } else {
            // The batch failed as a whole: the account does not exist and its funding came
            // back to this contract. Free the id and refund the whole deposit.
            self.agents.remove(&id);
            env::log_str(&format!(
                "Agent {id} could not be created; the deposit goes back to {creator}"
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

    /// One agent (stage, bench or deleted). `null` if unknown or not confirmed yet.
    pub fn get_agent(&self, id: AgentId) -> Option<AgentView> {
        self.agents
            .get(&id)
            .and_then(|agent| self.agent_view(&id, agent))
    }
}
