//! Saves, unsaves and prize claims.
//!
//! Prizes use a reward-per-unit accumulator per robot: at each cut, a surviving robot's
//! accumulator grows by `slice / pile`. A save's prize is `amount * (accumulator now -
//! accumulator when it last settled)`. So the cut touches each robot once and never
//! loops over savers, and `claim` only loops over the caller's own saves (at most
//! `MAX_SAVES_PER_ACCOUNT`).
//!
//! Every save record is paid for by the saver through NEP-145: the storage it adds is
//! locked from the saver's storage balance (attach NEAR to `save` to top it up) and
//! unlocked when the record goes away. Nobody can make the contract pay for their records.

use near_sdk::json_types::U128;
use near_sdk::{AccountId, env, near, require};

use crate::types::{RobotId, RobotStatus, RobotStatusView, SaveRecord, SaveView};
use crate::{Contract, ContractExt, MAX_SAVES_PER_ACCOUNT, MIN_SAVE, checked, events, math};

impl Contract {
    /// Prize earned by `record` on a robot whose accumulator is `acc_now`, including what
    /// was already settled on the record.
    pub(crate) fn record_prize(record: &SaveRecord, acc_now: u128) -> u128 {
        let pending = checked(math::pending_reward(
            record.amount,
            acc_now,
            record.reward_snapshot,
        ));
        checked(record.owed.checked_add(pending))
    }

    fn remove_saver_robot(&mut self, account_id: &AccountId, robot_id: &str) {
        let Some(list) = self.saver_robots.get_mut(account_id) else {
            return;
        };
        list.retain(|id| id != robot_id);
        if list.is_empty() {
            self.saver_robots.remove(account_id);
        }
    }
}

#[near]
impl Contract {
    /// Locks `amount` $CUT into a stage robot's pile or a bench robot's queue until the
    /// next cut. Adding to an existing save locks the whole save again until the next cut.
    ///
    /// The save record's storage is paid from the caller's NEP-145 storage balance; any
    /// NEAR attached is added to that balance first.
    #[payable]
    pub fn save(&mut self, robot_id: RobotId, amount: U128) -> U128 {
        let account_id = env::predecessor_account_id();
        require!(
            !self.cut_is_due(),
            "The cut is due: piles are frozen until someone calls run_cut (anyone can, and keeps the robot's 0.5 NEAR)"
        );
        require!(amount.0 > 0, "amount must be positive");
        let robot = self.robot(&robot_id);
        match robot.status {
            RobotStatus::Stage | RobotStatus::Bench => {}
            RobotStatus::Pending => env::panic_str("This robot is still being created"),
            RobotStatus::Deleted => env::panic_str("This robot was cut"),
        }
        let acc_now = robot.reward_per_unit;
        let balance = near_sdk_contract_tools::ft::Nep141Controller::balance_of(self, &account_id);
        require!(
            balance >= amount.0,
            format!(
                "Not enough $CUT: you have {balance} units, this needs {}",
                amount.0
            )
        );

        let start = env::storage_usage();
        self.top_up_storage(&account_id, env::attached_deposit());
        self.require_registered(&account_id);

        let key = (account_id.clone(), robot_id.clone());
        let lock = self.next_cut_index;
        let total = match self.saves.get_mut(&key) {
            Some(record) => {
                let owed = Self::record_prize(record, acc_now);
                record.owed = owed;
                record.reward_snapshot = acc_now;
                record.amount = checked(record.amount.checked_add(amount.0));
                record.locked_for = lock;
                record.amount
            }
            None => {
                require!(
                    amount.0 >= MIN_SAVE,
                    format!("A new save must be at least {MIN_SAVE} units (0.1 $CUT)")
                );
                let list = self.saver_robots.entry(account_id.clone()).or_default();
                require!(
                    list.len() < MAX_SAVES_PER_ACCOUNT,
                    format!(
                        "You already have saves on {MAX_SAVES_PER_ACCOUNT} robots: unsave or claim first"
                    )
                );
                list.push(robot_id.clone());
                self.saves.insert(
                    key,
                    SaveRecord {
                        amount: amount.0,
                        locked_for: lock,
                        reward_snapshot: acc_now,
                        owed: 0,
                    },
                );
                let robot = self.robot_mut(&robot_id);
                robot.savers = checked(robot.savers.checked_add(1));
                amount.0
            }
        };
        let robot = self.robot_mut(&robot_id);
        robot.pile = checked(robot.pile.checked_add(amount.0));
        let pile = robot.pile;
        self.total_saved = checked(self.total_saved.checked_add(amount.0));
        self.settle_storage(&account_id, start);

        self.take_cut(&account_id, amount.0, "save");
        events::emit(
            "save",
            &[events::Save {
                account_id,
                robot_id,
                amount,
                total: U128(total),
                pile: U128(pile),
                cut_index: lock,
            }],
        );
        U128(total)
    }

    /// Takes back a whole save, with the prize it earned. Allowed once the cut it was
    /// locked for has run, on a robot that survived it or a bench robot that is still
    /// waiting. A save on a cut robot is gone; `claim` collects what it earned before.
    pub fn unsave(&mut self, robot_id: RobotId) -> U128 {
        let account_id = env::predecessor_account_id();
        require!(
            !self.cut_is_due(),
            "The cut is due: piles are frozen until someone calls run_cut"
        );
        let key = (account_id.clone(), robot_id.clone());
        let record = *self
            .saves
            .get(&key)
            .unwrap_or_else(|| env::panic_str("You have no save on this robot"));
        let robot = self.robot(&robot_id);
        require!(
            robot.status != RobotStatus::Deleted,
            "This robot was cut: its saves are gone. Call claim() for the prizes it earned before"
        );
        require!(
            self.next_cut_index > record.locked_for,
            format!(
                "Locked until cut {} has run",
                record.locked_for
            )
        );
        let prize = Self::record_prize(&record, robot.reward_per_unit);

        let start = env::storage_usage();
        self.saves.remove(&key);
        self.remove_saver_robot(&account_id, &robot_id);
        let robot = self.robot_mut(&robot_id);
        robot.pile = checked(robot.pile.checked_sub(record.amount));
        robot.savers = robot.savers.saturating_sub(1);
        let pile = robot.pile;
        self.total_saved = checked(self.total_saved.checked_sub(record.amount));
        self.prizes_outstanding = checked(self.prizes_outstanding.checked_sub(prize));
        self.settle_storage(&account_id, start);

        let payout = checked(record.amount.checked_add(prize));
        self.send_cut(&account_id, payout, "unsave");
        events::emit(
            "unsave",
            &[events::Unsave {
                account_id,
                robot_id,
                amount: U128(record.amount),
                prize: U128(prize),
                pile: U128(pile),
            }],
        );
        U128(payout)
    }

    /// Sends the caller every prize it can collect: prizes earned by its saves (which keep
    /// riding) and its creator slices. Clears its records on cut robots. Any NEAR
    /// attached is added to the caller's storage balance (needed once to receive $CUT).
    #[payable]
    pub fn claim(&mut self) -> U128 {
        let account_id = env::predecessor_account_id();
        self.top_up_storage(&account_id, env::attached_deposit());
        self.require_registered(&account_id);

        let start = env::storage_usage();
        let mut total: u128 = 0;
        let robot_ids = self
            .saver_robots
            .get(&account_id)
            .cloned()
            .unwrap_or_default();
        for robot_id in robot_ids {
            let key = (account_id.clone(), robot_id.clone());
            let Some(record) = self.saves.get(&key).copied() else {
                continue;
            };
            let robot = self.robot(&robot_id);
            let (acc_now, deleted) = (robot.reward_per_unit, robot.status == RobotStatus::Deleted);
            let prize = Self::record_prize(&record, acc_now);
            total = checked(total.checked_add(prize));
            if deleted {
                self.saves.remove(&key);
                self.remove_saver_robot(&account_id, &robot_id);
            } else if let Some(record) = self.saves.get_mut(&key) {
                record.owed = 0;
                record.reward_snapshot = acc_now;
            }
        }
        self.settle_storage(&account_id, start);

        // Creator slices live in contract-paid storage, so freeing them credits nobody.
        if let Some(slices) = self.creator_claimable.remove(&account_id) {
            total = checked(total.checked_add(slices));
        }
        require!(total > 0, "Nothing to claim");
        self.prizes_outstanding = checked(self.prizes_outstanding.checked_sub(total));
        self.send_cut(&account_id, total, "claim");
        events::emit(
            "claim",
            &[events::Claim {
                account_id,
                amount: U128(total),
            }],
        );
        U128(total)
    }

    /// The account's saves, including records on cut robots that `claim` has not cleared.
    pub fn get_saves(&self, account_id: AccountId) -> Vec<SaveView> {
        let Some(robot_ids) = self.saver_robots.get(&account_id) else {
            return Vec::new();
        };
        robot_ids
            .iter()
            .filter_map(|robot_id| {
                let record = self.saves.get(&(account_id.clone(), robot_id.clone()))?;
                let robot = self.robots.get(robot_id)?;
                let robot_status = match robot.status {
                    RobotStatus::Stage => RobotStatusView::Stage,
                    RobotStatus::Deleted => RobotStatusView::Deleted,
                    RobotStatus::Bench | RobotStatus::Pending => RobotStatusView::Bench,
                };
                Some(SaveView {
                    robot_id: robot_id.clone(),
                    amount: U128(record.amount),
                    since_cut: record.locked_for,
                    unlocked: self.next_cut_index > record.locked_for
                        && robot.status != RobotStatus::Deleted,
                    prize: U128(
                        math::pending_reward(
                            record.amount,
                            robot.reward_per_unit,
                            record.reward_snapshot,
                        )
                        .and_then(|p| p.checked_add(record.owed))
                        .unwrap_or(0),
                    ),
                    robot_status,
                })
            })
            .collect()
    }

    /// Prizes the account can collect with `claim`: save prizes plus creator slices.
    pub fn get_claimable(&self, account_id: AccountId) -> U128 {
        let creator = self
            .creator_claimable
            .get(&account_id)
            .copied()
            .unwrap_or(0);
        let saves: u128 = self
            .get_saves(account_id)
            .iter()
            .map(|save| save.prize.0)
            .fold(0u128, u128::saturating_add);
        U128(creator.saturating_add(saves))
    }
}
