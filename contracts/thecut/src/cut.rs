//! The daily cut.
//!
//! `run_cut` does every state change synchronously, in one receipt: it picks and removes
//! the agent, burns, splits the prize, refunds the creator, seats the bench agent and
//! schedules the next cut. Only then does it ask the agent account to delete itself.
//! That deletion is the one asynchronous step and nothing depends on it: the callback
//! only records whether it worked. If it failed (the agent account still exists with its
//! 0.5 NEAR), anyone can call `retry_delete`, which sends the balance to the original
//! runner.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::json;
use near_sdk::{AccountId, NearToken, Promise, env, near, require};
use near_sdk_contract_tools::ft::{Nep141Burn, Nep141Controller};

use crate::math::{self, Contender};
use crate::types::{CutRecord, DeleteState, NextCutView, AgentId, AgentStatus};
use crate::{
    CUT_HISTORY, Contract, ContractExt, GAS_CALLBACK, GAS_SELF_DELETE, MIN_GAS_RUN_CUT, checked,
    events,
};

impl Contract {
    fn contenders(&self, ids: &[AgentId]) -> Vec<Contender> {
        ids.iter()
            .map(|id| {
                let agent = self.agent(id);
                Contender {
                    pile: agent.pile,
                    seq: agent.seq,
                }
            })
            .collect()
    }

    fn stage_is_full(&self) -> bool {
        self.stage.len() as u32 >= self.params.stage_size
    }

    /// Asks a cut agent's account to delete itself, sending its balance to `beneficiary`.
    fn request_delete(&self, cut_index: u64, agent_id: AgentId, beneficiary: AccountId) -> Promise {
        let args = json!({ "beneficiary": beneficiary })
            .to_string()
            .into_bytes();
        Promise::new(Self::agent_account(&agent_id))
            .function_call(
                "self_delete".to_string(),
                args,
                NearToken::from_yoctonear(0),
                GAS_SELF_DELETE,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_agent_deleted(cut_index, agent_id),
            )
    }
}

#[near]
impl Contract {
    /// Runs the due cut. Anyone can call it; it is refused before `get_next_cut().at`.
    ///
    /// When every seat is taken: the lowest pile is cut (tie: the newer agent), `burn_bps`
    /// of it burns, and the rest plus the fees since the last cut is the prize. The
    /// savers' share is cut into one equal slice per surviving agent, shared by that
    /// agent's savers by $CUT saved; the creators' share into equal creator slices; a
    /// survivor with an empty pile burns its slice. The agent account is deleted with the
    /// caller as beneficiary (the caller keeps its 0.5 NEAR), the creator gets the rest of
    /// its deposit back, and the biggest bench queue takes the seat.
    ///
    /// While the stage is not full nobody is cut: the fees are split among the agents on
    /// the stage and free seats are filled from the bench.
    pub fn run_cut(&mut self) -> CutRecord {
        let now = env::block_timestamp();
        require!(
            now >= self.next_cut_at,
            format!(
                "Too early: cut {} opens at {} ({} s from now)",
                self.next_cut_index,
                self.next_cut_at,
                self.next_cut_at.saturating_sub(now) / 1_000_000_000
            )
        );
        require!(
            env::prepaid_gas() >= MIN_GAS_RUN_CUT,
            "Attach at least 60 TGas to run the cut"
        );
        let index = self.next_cut_index;
        let scheduled_at = self.next_cut_at;
        let runner = env::predecessor_account_id();
        let mut prize = std::mem::take(&mut self.fees_since_cut);
        let mut burned: u128 = 0;

        // 1. The cut: lowest pile on a full stage.
        let mut cut: Option<(AgentId, u128, AccountId)> = None;
        if self.stage_is_full() {
            let contenders = self.contenders(&self.stage);
            let position = checked(math::pick_lowest(&contenders));
            let agent_id = self.stage.remove(position);
            let burn_bps = self.params.burn_bps;
            let agent = self.agent_mut(&agent_id);
            let pile = agent.pile;
            let (pile_burned, to_prize) = checked(math::burn_part(pile, burn_bps));
            agent.status = AgentStatus::Deleted;
            agent.cut_index = Some(index);
            agent.delete_state = Some(DeleteState::Requested);
            agent.runner = Some(runner.clone());
            let creator = agent.creator.clone();
            burned = checked(burned.checked_add(pile_burned));
            prize = checked(prize.checked_add(to_prize));
            self.total_saved = checked(self.total_saved.checked_sub(pile));
            cut = Some((agent_id, pile, creator));
        }

        // 2. The prize: equal slices per surviving agent.
        let survivors = self.stage.clone();
        let survivor_count = survivors.len() as u32;
        let mut slice = 0;
        let mut creator_slice = 0;
        let mut paid_prize = 0;
        let mut prize_items = Vec::with_capacity(survivors.len());
        match math::split_prize(prize, self.params.savers_bps, survivor_count) {
            Some(split) if prize > 0 => {
                slice = split.slice;
                creator_slice = split.creator_slice;
                paid_prize = prize;
                self.fees_since_cut = checked(self.fees_since_cut.checked_add(split.dust));
                for agent_id in &survivors {
                    let agent = self.agent_mut(agent_id);
                    let empty = agent.pile == 0;
                    if !empty {
                        let increment = checked(math::reward_increment(slice, agent.pile));
                        agent.reward_per_unit =
                            checked(agent.reward_per_unit.checked_add(increment));
                    }
                    let (creator, pile) = (agent.creator.clone(), agent.pile);
                    if empty {
                        burned = checked(burned.checked_add(slice));
                    } else {
                        self.prizes_outstanding =
                            checked(self.prizes_outstanding.checked_add(slice));
                    }
                    if creator_slice > 0 {
                        let owed = self.creator_claimable.entry(creator.clone()).or_insert(0);
                        *owed = checked(owed.checked_add(creator_slice));
                        self.prizes_outstanding =
                            checked(self.prizes_outstanding.checked_add(creator_slice));
                    }
                    prize_items.push(events::Prize {
                        cut_index: index,
                        agent_id: agent_id.clone(),
                        creator,
                        slice: U128(slice),
                        creator_slice: U128(creator_slice),
                        pile: U128(pile),
                        burned: empty,
                    });
                }
            }
            // Nobody on the stage (or nothing to pay): the prize waits for the next cut.
            _ => {
                self.fees_since_cut = checked(self.fees_since_cut.checked_add(prize));
            }
        }

        // 3. Burn half the cut pile and the slices of empty piles.
        if burned > 0 {
            Nep141Controller::burn(
                self,
                &Nep141Burn::new(burned, env::current_account_id()).memo(format!("cut {index}")),
            )
            .unwrap_or_else(|e| env::panic_str(&e.to_string()));
        }

        // 4. The creator of the cut agent gets the rest of its deposit back.
        let mut creator_refund = NearToken::from_yoctonear(0);
        if let Some((_, _, creator)) = &cut {
            creator_refund = self
                .params
                .register_deposit
                .saturating_sub(self.params.agent_funding);
            self.creator_deposits_held = self
                .creator_deposits_held
                .saturating_sub(creator_refund.as_yoctonear());
            Promise::new(creator.clone())
                .transfer(creator_refund)
                .detach();
        }

        // 5. Free seats go to the biggest bench queues. Other queues stay and unlock,
        //    because their lock was for this cut.
        let mut joined = Vec::new();
        let mut bench = self.contenders(&self.bench);
        while !self.stage_is_full() {
            let Some(position) = math::pick_biggest(&bench) else {
                break;
            };
            bench.remove(position);
            let agent_id = self.bench.remove(position);
            let agent = self.agent_mut(&agent_id);
            agent.status = AgentStatus::Stage;
            agent.stage_at = Some(now);
            let pile = agent.pile;
            self.stage.push(agent_id.clone());
            joined.push((agent_id, pile));
        }

        // 6. Schedule the next cut and keep the record.
        self.next_cut_index = checked(index.checked_add(1));
        self.next_cut_at = checked(math::next_cut_after(
            scheduled_at,
            self.params.cut_interval.0,
            now,
        ));
        let (deleted_id, pile) = match &cut {
            Some((id, pile, _)) => (Some(id.clone()), *pile),
            None => (None, 0),
        };
        let record = CutRecord {
            index,
            at: U64(scheduled_at),
            ran_at: U64(now),
            deleted_id: deleted_id.clone(),
            pile: U128(pile),
            burned: U128(burned),
            prize: U128(paid_prize),
            slice: U128(slice),
            creator_slice: U128(creator_slice),
            survivors: if paid_prize > 0 { survivor_count } else { 0 },
            joined_id: joined.first().map(|(id, _)| id.clone()),
            joined_ids: joined.iter().map(|(id, _)| id.clone()).collect(),
            runner: runner.clone(),
            creator_refund,
        };
        self.cuts.insert(index, record.clone());
        if index > CUT_HISTORY {
            self.cuts.remove(&(index - CUT_HISTORY));
        }

        // 7. The public log.
        events::emit(
            "cut",
            &[events::Cut {
                cut_index: index,
                agent_id: deleted_id.clone(),
                agent_account_id: deleted_id.as_deref().map(Self::agent_account),
                pile: U128(pile),
                burned: U128(burned),
                prize: U128(paid_prize),
                slice: U128(slice),
                creator_slice: U128(creator_slice),
                survivors: record.survivors,
                runner: runner.clone(),
                creator_refund,
                next_cut_at: U64(self.next_cut_at),
            }],
        );
        if !prize_items.is_empty() {
            events::emit("prize", &prize_items);
        }
        if !joined.is_empty() {
            let items: Vec<events::Join> = joined
                .into_iter()
                .map(|(agent_id, pile)| events::Join {
                    cut_index: index,
                    agent_id,
                    pile: U128(pile),
                })
                .collect();
            events::emit("join", &items);
        }

        // 8. Delete the agent account. Everything above is already final.
        if let Some(agent_id) = deleted_id {
            self.request_delete(index, agent_id, runner).detach();
        }
        record
    }

    /// Records whether an agent account deletion worked. Never panics.
    #[private]
    pub fn on_agent_deleted(&mut self, cut_index: u64, agent_id: AgentId) -> bool {
        let deleted =
            env::promise_results_count() == 1 && env::promise_result_checked(0, 64).is_ok();
        let Some(agent) = self.agents.get_mut(&agent_id) else {
            return false;
        };
        agent.delete_state = Some(if deleted {
            DeleteState::Done
        } else {
            DeleteState::Failed
        });
        let beneficiary = agent.runner.clone();
        if deleted {
            if let Some(beneficiary) = beneficiary {
                events::emit(
                    "delete",
                    &[events::Delete {
                        cut_index,
                        account_id: Self::agent_account(&agent_id),
                        agent_id,
                        beneficiary,
                    }],
                );
            }
        } else {
            env::log_str(&format!(
                "Agent {agent_id} account was not deleted; anyone can call retry_delete"
            ));
        }
        deleted
    }

    /// Asks a cut agent's account to delete itself again, after a failed attempt.
    /// Anyone can call it; the balance still goes to the account that ran the cut.
    pub fn retry_delete(&mut self, agent_id: AgentId) -> Promise {
        require!(
            env::prepaid_gas() >= MIN_GAS_RUN_CUT,
            "Attach at least 60 TGas"
        );
        let agent = self.agent_mut(&agent_id);
        require!(
            agent.status == AgentStatus::Deleted && agent.delete_state == Some(DeleteState::Failed),
            "Only a cut agent whose account deletion failed can be retried"
        );
        agent.delete_state = Some(DeleteState::Requested);
        let cut_index = checked(agent.cut_index);
        let runner = checked(agent.runner.clone());
        self.request_delete(cut_index, agent_id, runner)
    }

    /// The next cut and, if it ran now, who would be cut and what it would pay.
    pub fn get_next_cut(&self) -> NextCutView {
        let full = self.stage_is_full();
        let contenders = self.contenders(&self.stage);
        let mut prize = self.fees_since_cut;
        let mut lowest_id = None;
        let mut gap = 0;
        let mut survivors = contenders.len() as u32;
        if full && let Some(position) = math::pick_lowest(&contenders) {
            let lowest = contenders[position];
            lowest_id = Some(self.stage[position].clone());
            let mut others = contenders.clone();
            others.remove(position);
            if let Some(next) = math::pick_lowest(&others) {
                gap = math::gap_to_next(lowest, others[next]);
            }
            let (_, to_prize) =
                math::burn_part(lowest.pile, self.params.burn_bps).unwrap_or((0, 0));
            prize = prize.saturating_add(to_prize);
            survivors = survivors.saturating_sub(1);
        }
        let (slice, creator_slice) = math::split_prize(prize, self.params.savers_bps, survivors)
            .map(|split| (split.slice, split.creator_slice))
            .unwrap_or((0, 0));
        NextCutView {
            index: self.next_cut_index,
            at: U64(self.next_cut_at),
            lowest_id,
            gap_to_next: U128(gap),
            prize_so_far: U128(prize),
            slice_so_far: U128(slice),
            creator_slice_so_far: U128(creator_slice),
            survivors,
            due: self.cut_is_due(),
        }
    }

    /// A cut that ran, or `null` (unknown index, or older than the last 366 cuts).
    pub fn get_cut(&self, index: u64) -> Option<CutRecord> {
        self.cuts.get(&index).cloned()
    }
}
