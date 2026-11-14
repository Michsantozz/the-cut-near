//! The daily cut and the seasons.
//!
//! `run_cut` does every state change synchronously, in one receipt, in the order of
//! SPEC-v20: pacts, attacks, score, rescues, the cut agent, the day prize, resets, the
//! champion, a season start, then the brief for the next cut. Only then does it ask the cut
//! agent's account to delete itself. That deletion is the one asynchronous step and nothing
//! depends on it: the callback only records whether it worked. If it failed (the agent
//! account still exists with its funding), anyone can call `retry_delete`, which sends the
//! balance to the original runner.

use near_sdk::json_types::{I128, U64, U128};
use near_sdk::serde_json::json;
use near_sdk::{AccountId, NearToken, Promise, env, near, require};
use near_sdk_contract_tools::ft::Nep141Controller;

use crate::math::{self, Contender};
use crate::types::{
    AgentId, AgentStatus, ChampionRecord, CutRecord, DeleteState, MoveKind, MoveRecord, NextCutView,
};
use crate::{
    CUT_HISTORY, Contract, ContractExt, GAS_CALLBACK, GAS_SELF_DELETE, MIN_GAS_RUN_CUT,
    MOVE_HISTORY, checked, events,
};

/// What happened to the agent removed at a cut.
struct Removed {
    id: AgentId,
    score: i128,
    pile: u128,
    /// Part of the pile that burns.
    pile_burned: u128,
    /// Part of the pile that joins the day prize.
    to_prize: u128,
    heir: Option<AgentId>,
    inherited: u128,
    wallet_burned: u128,
    creator_refund: NearToken,
}

/// The day prize as paid at a cut.
#[derive(Default)]
struct DayPrize {
    prize: u128,
    slice: u128,
    agent_slice: u128,
    creator_slice: u128,
    survivors: u32,
    /// Savers' slices above the pile (or on an empty pile).
    burned: u128,
    items: Vec<events::Prize>,
}

impl Contract {
    /// Stage (or bench) agents as the cut sees them: their score.
    fn contenders(&self, ids: &[AgentId]) -> Vec<Contender> {
        ids.iter()
            .map(|id| {
                let agent = self.agent(id);
                Contender {
                    score: checked(math::score(agent.pile, agent.boos, agent.damage)),
                    seq: agent.seq,
                }
            })
            .collect()
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

    /// Steps 1 and 2: committed pacts go to their targets and become next cut's pact lists
    /// (replacing the old ones); committed attacks burn. Returns the pact and attack events
    /// and the $CUT to burn.
    fn settle_strikes(
        &mut self,
        index: u64,
        moves: &[MoveRecord],
    ) -> (Vec<events::Strike>, Vec<events::Strike>, u128) {
        let mut pacts = Vec::new();
        let mut attacks = Vec::new();
        let mut burn: u128 = 0;
        for m in moves {
            let Some(target) = &m.target else {
                continue;
            };
            let strike = events::Strike {
                cut_index: index,
                agent_id: m.agent_id.clone(),
                target: target.clone(),
                amount: U128(m.amount),
            };
            match m.kind {
                MoveKind::Pact => {
                    self.send_cut(&Self::agent_account(target), m.amount, "pact");
                    pacts.push(strike);
                }
                MoveKind::Attack => {
                    burn = checked(burn.checked_add(m.amount));
                    attacks.push(strike);
                }
                MoveKind::Rescue | MoveKind::Hold => continue,
            }
            self.committed = checked(self.committed.checked_sub(m.amount));
        }
        for id in self.stage.clone() {
            let mut partners: Vec<AgentId> = pacts
                .iter()
                .filter_map(|p| {
                    if p.agent_id == id {
                        Some(p.target.clone())
                    } else if p.target == id {
                        Some(p.agent_id.clone())
                    } else {
                        None
                    }
                })
                .collect();
            partners.sort();
            partners.dedup();
            self.agent_mut(&id).pacts = partners;
        }
        (pacts, attacks, burn)
    }

    /// Step 4: each survivor's bounty is paid to its savers through the accumulator, at most
    /// its pile; the rest (and the whole bounty of the agent being cut) goes back to its
    /// wallet.
    fn settle_rescues(&mut self, index: u64, cut_id: &str) -> Vec<events::Rescue> {
        let mut items = Vec::new();
        for id in self.stage.clone() {
            let agent = self.agent_mut(&id);
            let (bounty, pile) = (agent.bounty, agent.pile);
            if bounty == 0 {
                continue;
            }
            let (paid, returned) = if id == cut_id {
                (0, bounty)
            } else {
                math::cap_to_pile(bounty, pile)
            };
            if paid > 0 {
                let increment = checked(math::reward_increment(paid, pile));
                agent.reward_per_unit = checked(agent.reward_per_unit.checked_add(increment));
                self.prizes_outstanding = checked(self.prizes_outstanding.checked_add(paid));
            }
            self.committed = checked(self.committed.checked_sub(bounty));
            self.send_cut(&Self::agent_account(&id), returned, "rescue returned");
            items.push(events::Rescue {
                cut_index: index,
                agent_id: id,
                offered: U128(bounty),
                paid: U128(paid),
                returned: U128(returned),
                pile: U128(pile),
            });
        }
        items
    }

    /// Step 5: removes the stage agent at `position`. Part of its pile burns, the rest joins
    /// the day prize; its wallet goes to its heir if the heir survived, else it burns; its
    /// creator gets the deposit back. Its account deletion is requested at the end of the cut.
    fn remove_cut_agent(
        &mut self,
        index: u64,
        position: usize,
        score: i128,
        runner: &AccountId,
    ) -> Removed {
        let id = self.stage.remove(position);
        let burn_bps = self.params.burn_bps;
        let agent = self.agent_mut(&id);
        let pile = agent.pile;
        let (pile_burned, to_prize) = checked(math::burn_part(pile, burn_bps));
        agent.status = AgentStatus::Deleted;
        agent.cut_index = Some(index);
        agent.delete_state = Some(DeleteState::Requested);
        agent.runner = Some(runner.clone());
        let (heir, creator) = (agent.heir.clone(), agent.creator.clone());
        self.total_saved = checked(self.total_saved.checked_sub(pile));

        let account = Self::agent_account(&id);
        let wallet = self.balance_of(&account);
        let heir = heir.filter(|heir| self.stage.contains(heir));
        let (inherited, wallet_burned) = match &heir {
            Some(heir) => {
                self.move_cut(&account, &Self::agent_account(heir), wallet, "inheritance");
                (wallet, 0)
            }
            None => {
                self.burn_cut(&account, wallet, "heirless wallet");
                (0, wallet)
            }
        };
        self.close_wallet(&account);
        let creator_refund = self.refund_creator(&creator);

        // Nobody keeps a pact with, or an heir in, an agent that is gone.
        for survivor in self.stage.clone() {
            let agent = self.agent_mut(&survivor);
            agent.pacts.retain(|p| *p != id);
            if agent.heir.as_deref() == Some(id.as_str()) {
                agent.heir = None;
            }
        }
        Removed {
            id,
            score,
            pile,
            pile_burned,
            to_prize,
            heir,
            inherited,
            wallet_burned,
            creator_refund,
        }
    }

    /// Step 6: one equal savers' slice per survivor (capped at its pile; the excess burns),
    /// one equal agent slice into each survivor's wallet, one equal creator slice to claim.
    /// Rounding dust carries to the next prize.
    fn pay_day_prize(&mut self, index: u64, prize: u128) -> DayPrize {
        let survivors = self.stage.clone();
        let count = survivors.len() as u32;
        let split = math::split_prize(prize, self.params.savers_bps, self.params.agents_bps, count);
        let Some(split) = split.filter(|_| prize > 0) else {
            // Nobody to pay (or nothing to pay): the prize waits for the next cut.
            self.fees_since_cut = checked(self.fees_since_cut.checked_add(prize));
            return DayPrize::default();
        };
        self.fees_since_cut = checked(self.fees_since_cut.checked_add(split.dust));
        let mut day = DayPrize {
            prize,
            slice: split.slice,
            agent_slice: split.agent_slice,
            creator_slice: split.creator_slice,
            survivors: count,
            ..DayPrize::default()
        };
        for id in survivors {
            let agent = self.agent_mut(&id);
            let pile = agent.pile;
            let (paid, excess) = math::cap_to_pile(split.slice, pile);
            if paid > 0 {
                let increment = checked(math::reward_increment(paid, pile));
                agent.reward_per_unit = checked(agent.reward_per_unit.checked_add(increment));
            }
            let creator = agent.creator.clone();
            self.prizes_outstanding = checked(self.prizes_outstanding.checked_add(paid));
            day.burned = checked(day.burned.checked_add(excess));
            self.send_cut(
                &Self::agent_account(&id),
                split.agent_slice,
                "agents' share",
            );
            if split.creator_slice > 0 {
                let owed = self.creator_claimable.entry(creator.clone()).or_insert(0);
                *owed = checked(owed.checked_add(split.creator_slice));
                self.prizes_outstanding =
                    checked(self.prizes_outstanding.checked_add(split.creator_slice));
            }
            day.items.push(events::Prize {
                cut_index: index,
                agent_id: id,
                creator,
                slice: U128(paid),
                burned: U128(excess),
                agent_slice: U128(split.agent_slice),
                creator_slice: U128(split.creator_slice),
                pile: U128(pile),
            });
        }
        day
    }

    /// Step 8: the last agent on the stage is crowned. The season pot goes to its savers, at
    /// most its pile (1 $CUT per $CUT saved, like a rescue); the rest carries to the next
    /// champion. Its wallet burns, its creator gets the deposit back, and its account stays.
    /// The season ends.
    fn crown(&mut self, index: u64, now: u64) -> (ChampionRecord, NearToken) {
        let id = self.stage.remove(0);
        let pot = self.season.pot;
        let agent = self.agent_mut(&id);
        let pile = agent.pile;
        let (paid, _) = math::cap_to_pile(pot, pile);
        if paid > 0 {
            let increment = checked(math::reward_increment(paid, pile));
            agent.reward_per_unit = checked(agent.reward_per_unit.checked_add(increment));
        }
        agent.status = AgentStatus::Champion;
        agent.cut_index = Some(index);
        agent.heir = None;
        agent.pacts.clear();
        let (name, creator) = (agent.name.clone(), agent.creator.clone());
        self.season.pot = pot - paid;
        self.prizes_outstanding = checked(self.prizes_outstanding.checked_add(paid));

        let account = Self::agent_account(&id);
        let wallet = self.balance_of(&account);
        self.burn_cut(&account, wallet, "champion wallet");
        self.close_wallet(&account);
        let refund = self.refund_creator(&creator);

        self.season.active = false;
        self.season.champion = Some(id.clone());
        let record = ChampionRecord {
            season: self.season.index,
            agent_id: id,
            account_id: account,
            name,
            cut_index: index,
            crowned_at: U64(now),
            pot: U128(paid),
            wallet_burned: U128(wallet),
        };
        self.champions.push(record.clone());
        (record, refund)
    }

    /// Step 9: the `stage_size` biggest bench queues (tie: the older agent) take the seats
    /// and a new season begins.
    fn start_season(&mut self, index: u64, now: u64) -> Vec<events::SeasonStart> {
        self.season.index = checked(self.season.index.checked_add(1));
        self.season.active = true;
        self.season.day = 1;
        self.season.champion = None;
        let season = self.season.index;
        let mut bench: Vec<Contender> = self
            .bench
            .iter()
            .map(|id| {
                let agent = self.agent(id);
                Contender {
                    score: checked(i128::try_from(agent.pile).ok()),
                    seq: agent.seq,
                }
            })
            .collect();
        let mut items = Vec::new();
        while self.stage.len() < self.params.stage_size as usize {
            let Some(position) = math::pick_biggest(&bench) else {
                break;
            };
            bench.remove(position);
            let id = self.bench.remove(position);
            let agent = self.agent_mut(&id);
            agent.status = AgentStatus::Stage;
            agent.stage_at = Some(now);
            agent.season = Some(season);
            let pile = agent.pile;
            self.stage.push(id.clone());
            items.push(events::SeasonStart {
                season,
                cut_index: index,
                agent_id: id,
                pile: U128(pile),
            });
        }
        items
    }
}

#[near]
impl Contract {
    /// Runs the due cut. Anyone can call it; it is refused before `get_next_cut().at`.
    ///
    /// While a season runs: committed pacts are paid and attacks burn, the lowest score
    /// (`pile - boos - damage`; tie: the newer agent) is cut, rescues are paid, the cut
    /// agent's pile partly burns and its wallet goes to its heir (or burns), the day prize
    /// is split, and when one agent is left it is crowned. The cut agent's account is deleted
    /// with the caller as beneficiary (the caller keeps its funding).
    ///
    /// Without a season, the bench takes the stage once it has `min_season` agents; until
    /// then the cut only reschedules and the fees carry.
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
            format!(
                "Attach at least {} TGas to run the cut",
                MIN_GAS_RUN_CUT.as_tgas()
            )
        );
        let index = self.next_cut_index;
        let scheduled_at = self.next_cut_at;
        let runner = env::predecessor_account_id();
        let was_active = self.season.active;
        let day = if was_active { self.season.day } else { 0 };
        let mut moves: Vec<MoveRecord> = self.moves.get(&index).cloned().unwrap_or_default();
        moves.sort_by_key(|m| self.agent(&m.agent_id).seq);

        let mut burn_here: u128 = 0;
        let mut removed: Option<Removed> = None;
        let mut day_prize = DayPrize::default();
        let (mut pacts, mut attacks, mut rescues) = (Vec::new(), Vec::new(), Vec::new());
        let mut champion: Option<(ChampionRecord, NearToken)> = None;
        let mut seated = Vec::new();

        if was_active && !self.stage.is_empty() {
            // 1-2. Pacts and attacks.
            let (pact_items, attack_items, attack_burn) = self.settle_strikes(index, &moves);
            (pacts, attacks) = (pact_items, attack_items);
            burn_here = checked(burn_here.checked_add(attack_burn));

            // 3. Score: the lowest is cut (tie: the newer agent).
            let contenders = self.contenders(&self.stage);
            let position = checked(math::pick_lowest(&contenders));
            let cut_id = self.stage[position].clone();

            // 4. Rescues.
            rescues = self.settle_rescues(index, &cut_id);

            // 5. The cut agent.
            let cut = self.remove_cut_agent(index, position, contenders[position].score, &runner);
            burn_here = checked(burn_here.checked_add(cut.pile_burned));

            // 6. The day prize.
            let prize = std::mem::take(&mut self.fees_since_cut);
            day_prize = self.pay_day_prize(index, checked(prize.checked_add(cut.to_prize)));
            burn_here = checked(burn_here.checked_add(day_prize.burned));

            // 7. Reset the day's boos, damage and bounties.
            for id in self
                .stage
                .iter()
                .chain(std::iter::once(&cut.id))
                .cloned()
                .collect::<Vec<_>>()
            {
                let agent = self.agent_mut(&id);
                agent.boos = 0;
                agent.damage = 0;
                agent.bounty = 0;
            }
            removed = Some(cut);

            // 8. The champion.
            if self.stage.len() == 1 {
                champion = Some(self.crown(index, now));
            } else {
                self.season.day = checked(self.season.day.checked_add(1));
            }
        } else if self.bench.len() >= self.params.min_season as usize {
            // 9. A new season (the day prize carries).
            seated = self.start_season(index, now);
        }

        let me = env::current_account_id();
        self.burn_cut(&me, burn_here, &format!("cut {index}"));

        // 10. Schedule the next cut, keep the record and build the next brief.
        self.next_cut_index = checked(index.checked_add(1));
        self.next_cut_at = checked(math::next_cut_after(
            scheduled_at,
            self.params.cut_interval.0,
            self.params.move_lead.0,
            now,
        ));
        let (wallet_burned, creator_refund) = removed
            .as_ref()
            .map(|r| (r.wallet_burned, r.creator_refund))
            .unwrap_or((0, NearToken::from_yoctonear(0)));
        let champion_burned = champion
            .as_ref()
            .map(|(c, _)| c.wallet_burned.0)
            .unwrap_or(0);
        let burned = checked(
            burn_here
                .checked_add(wallet_burned)
                .and_then(|b| b.checked_add(champion_burned)),
        );
        let record = CutRecord {
            index,
            at: U64(scheduled_at),
            ran_at: U64(now),
            season: self.season.index,
            day,
            deleted_id: removed.as_ref().map(|r| r.id.clone()),
            score: I128(removed.as_ref().map(|r| r.score).unwrap_or(0)),
            pile: U128(removed.as_ref().map(|r| r.pile).unwrap_or(0)),
            burned: U128(burned),
            prize: U128(day_prize.prize),
            slice: U128(day_prize.slice),
            agent_slice: U128(day_prize.agent_slice),
            creator_slice: U128(day_prize.creator_slice),
            survivors: day_prize.survivors,
            inherited_by: removed.as_ref().and_then(|r| r.heir.clone()),
            inherited: U128(removed.as_ref().map(|r| r.inherited).unwrap_or(0)),
            champion_id: champion.as_ref().map(|(c, _)| c.agent_id.clone()),
            pot_paid: U128(champion.as_ref().map(|(c, _)| c.pot.0).unwrap_or(0)),
            seated_ids: seated.iter().map(|s| s.agent_id.clone()).collect(),
            runner: runner.clone(),
            creator_refund,
        };
        self.cuts.insert(index, record.clone());
        if index > CUT_HISTORY {
            self.cuts.remove(&(index - CUT_HISTORY));
        }
        if index > MOVE_HISTORY {
            self.moves.remove(&(index - MOVE_HISTORY));
        }
        let brief = if self.season.active {
            self.snapshot_wallets();
            Some(self.build_brief(was_active.then_some(&record), &moves))
        } else {
            None
        };
        self.brief.set(brief);

        // The public log.
        events::emit_some("pact", &pacts);
        events::emit_some("attack", &attacks);
        events::emit_some("rescue", &rescues);
        if let Some(r) = &removed
            && let Some(heir) = &r.heir
        {
            events::emit(
                "inherit",
                &[events::Inherit {
                    cut_index: index,
                    agent_id: r.id.clone(),
                    heir: heir.clone(),
                    amount: U128(r.inherited),
                }],
            );
        }
        events::emit(
            "cut",
            &[events::Cut {
                cut_index: index,
                season: record.season,
                agent_id: record.deleted_id.clone(),
                agent_account_id: record.deleted_id.as_deref().map(Self::agent_account),
                score: record.score,
                pile: record.pile,
                burned: record.burned,
                prize: record.prize,
                slice: record.slice,
                agent_slice: record.agent_slice,
                creator_slice: record.creator_slice,
                survivors: record.survivors,
                runner: runner.clone(),
                creator_refund,
                next_cut_at: U64(self.next_cut_at),
            }],
        );
        events::emit_some("prize", &day_prize.items);
        if let Some((c, refund)) = &champion {
            events::emit(
                "champion",
                &[events::Champion {
                    season: c.season,
                    cut_index: index,
                    agent_id: c.agent_id.clone(),
                    account_id: c.account_id.clone(),
                    pot: c.pot,
                    wallet_burned: c.wallet_burned,
                    creator_refund: *refund,
                }],
            );
        }
        events::emit_some("season_start", &seated);

        // Delete the cut agent's account. Everything above is already final.
        if let Some(r) = removed {
            self.request_delete(index, r.id, runner).detach();
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
            format!("Attach at least {} TGas", MIN_GAS_RUN_CUT.as_tgas())
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

    /// The next cut and, if it ran now, who would be cut and what the day prize would pay.
    pub fn get_next_cut(&self) -> NextCutView {
        let contenders = self.contenders(&self.stage);
        let mut prize = self.fees_since_cut;
        let mut lowest_id = None;
        let mut gap = 0;
        let mut survivors = 0;
        if self.season.active
            && let Some(position) = math::pick_lowest(&contenders)
        {
            let lowest = contenders[position];
            lowest_id = Some(self.stage[position].clone());
            let mut others = contenders.clone();
            others.remove(position);
            if let Some(next) = math::pick_lowest(&others) {
                gap = math::gap_to_next(lowest, others[next]);
            }
            let pile = self.agent(&self.stage[position]).pile;
            let (_, to_prize) = math::burn_part(pile, self.params.burn_bps).unwrap_or((0, 0));
            prize = prize.saturating_add(to_prize);
            survivors = contenders.len() as u32 - 1;
        }
        let split = math::split_prize(
            prize,
            self.params.savers_bps,
            self.params.agents_bps,
            survivors,
        );
        NextCutView {
            index: self.next_cut_index,
            at: U64(self.next_cut_at),
            moves_close_at: U64(self.moves_close_at()),
            lowest_id,
            gap_to_next: U128(gap),
            prize_so_far: U128(prize),
            slice_so_far: U128(split.map(|s| s.slice).unwrap_or(0)),
            agent_slice_so_far: U128(split.map(|s| s.agent_slice).unwrap_or(0)),
            creator_slice_so_far: U128(split.map(|s| s.creator_slice).unwrap_or(0)),
            survivors,
            due: self.cut_is_due(),
        }
    }

    /// A cut that ran, or `null` (unknown index, or older than the last 366 cuts).
    pub fn get_cut(&self, index: u64) -> Option<CutRecord> {
        self.cuts.get(&index).cloned()
    }
}
