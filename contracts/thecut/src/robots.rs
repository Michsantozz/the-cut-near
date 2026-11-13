//! The robot factory and robot views.
//!
//! `register_robot` creates `<id>.<this account>`, funds it with `robot_funding`, deploys
//! the `robot` contract and calls its `new({ owner })`, all in one batch, so the account
//! never has an access key. The robot stays `Pending` (invisible in views, cannot be saved)
//! until the callback confirms the batch; then it sits on the bench. If the batch failed,
//! the record is removed and the whole deposit goes back to the creator.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::json;
use near_sdk::{NearToken, Promise, env, near, require};

use crate::types::{Robot, RobotId, RobotStatus, RobotStatusView, RobotView};
use crate::{
    Contract, ContractExt, GAS_CALLBACK, GAS_ROBOT_INIT, MAX_BENCH, MAX_TEXT, MAX_X_HANDLE,
    MIN_GAS_REGISTER, ROBOT_WASM, checked, events,
};

/// Checks a robot id: 2 to 32 characters of `a-z`, `0-9`, `-` and `_`, starting and
/// ending with a letter or digit, with no two separators in a row (NEAR account rules).
pub fn validate_robot_id(id: &str) -> Result<(), &'static str> {
    if id.len() < 2 || id.len() > 32 {
        return Err("Robot id must be 2 to 32 characters");
    }
    let bytes = id.as_bytes();
    let is_separator = |b: u8| b == b'-' || b == b'_';
    let mut previous_separator = true;
    for &b in bytes {
        let ok = b.is_ascii_lowercase() || b.is_ascii_digit() || is_separator(b);
        if !ok {
            return Err("Robot id may use only a-z, 0-9, - and _");
        }
        if is_separator(b) && previous_separator {
            return Err("Robot id cannot start with or repeat - or _");
        }
        previous_separator = is_separator(b);
    }
    if previous_separator {
        return Err("Robot id cannot end with - or _");
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
    pub(crate) fn robot_view(&self, id: &str, robot: &Robot) -> Option<RobotView> {
        let status = match robot.status {
            RobotStatus::Pending => return None,
            RobotStatus::Bench => RobotStatusView::Bench,
            RobotStatus::Stage => RobotStatusView::Stage,
            RobotStatus::Deleted => RobotStatusView::Deleted,
        };
        Some(RobotView {
            id: id.to_string(),
            account_id: Self::robot_account(id),
            name: robot.name.clone(),
            kind: robot.kind.clone(),
            x_handle: robot.x_handle.clone(),
            creator: robot.creator.clone(),
            status,
            pile: U128(robot.pile),
            savers: robot.savers,
            joined_at: U64(robot.joined_at),
            seq: robot.seq,
            stage_at: robot.stage_at.map(U64),
            cut_index: robot.cut_index,
            delete_state: robot.delete_state,
        })
    }

    /// Robots in `ids`, highest pile first; on equal piles the older robot first (so the
    /// last row is the one the cut would delete).
    fn sorted_views(&self, ids: &[RobotId]) -> Vec<RobotView> {
        let mut views: Vec<RobotView> = ids
            .iter()
            .filter_map(|id| self.robot_view(id, self.robot(id)))
            .collect();
        views.sort_by(|a, b| b.pile.0.cmp(&a.pile.0).then(a.seq.cmp(&b.seq)));
        views
    }
}

#[near]
impl Contract {
    /// Registers a robot: creates `<id>.<this account>` with the `robot` contract and no
    /// access keys, funds it with `robot_funding`, and puts it on the bench.
    /// Attach `register_deposit` (5 NEAR); `register_deposit - robot_funding` (4.5 NEAR)
    /// comes back to the creator when the robot is cut. Any extra deposit is refunded now.
    #[payable]
    pub fn register_robot(
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
            format!("Attach {required} to register a robot")
        );
        require!(
            env::prepaid_gas() >= MIN_GAS_REGISTER,
            "Attach at least 100 TGas to register a robot"
        );
        if let Err(message) = validate_robot_id(&id) {
            env::panic_str(message);
        }
        validate_text(&name, "name", MAX_TEXT, true);
        validate_text(&kind, "kind", MAX_TEXT, true);
        validate_text(&x_handle, "x_handle", MAX_X_HANDLE, false);
        let account_id = Self::robot_account(&id);
        require!(
            !self.robots.contains_key(&id),
            "This robot id is taken (ids are never reused)"
        );
        require!(
            self.bench.len() + (self.pending_robots as usize) < MAX_BENCH,
            "The bench is full: wait for the next cut"
        );

        let robot = Robot {
            seq: self.next_robot_seq,
            name,
            kind,
            x_handle,
            creator: creator.clone(),
            status: RobotStatus::Pending,
            pile: 0,
            savers: 0,
            joined_at: env::block_timestamp(),
            stage_at: None,
            reward_per_unit: 0,
            cut_index: None,
            delete_state: None,
            runner: None,
        };
        self.next_robot_seq = checked(self.next_robot_seq.checked_add(1));
        self.pending_robots = checked(self.pending_robots.checked_add(1));
        self.robots.insert(id.clone(), robot);

        let excess = deposit.saturating_sub(required);
        if !excess.is_zero() {
            Promise::new(creator).transfer(excess).detach();
        }

        let init_args = json!({ "owner": env::current_account_id() })
            .to_string()
            .into_bytes();
        Promise::new(account_id)
            .create_account()
            .transfer(self.params.robot_funding)
            .deploy_contract(ROBOT_WASM.to_vec())
            .function_call(
                "new".to_string(),
                init_args,
                NearToken::from_yoctonear(0),
                GAS_ROBOT_INIT,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_robot_created(id),
            )
    }

    /// Confirms or rolls back a registration. Never panics.
    #[private]
    pub fn on_robot_created(&mut self, id: RobotId) -> bool {
        let created =
            env::promise_results_count() == 1 && env::promise_result_checked(0, 64).is_ok();
        let Some(robot) = self.robots.get(&id) else {
            return false;
        };
        if robot.status != RobotStatus::Pending {
            return false;
        }
        let creator = robot.creator.clone();
        self.pending_robots = self.pending_robots.saturating_sub(1);
        let deposit = self.params.register_deposit;

        if created {
            let held = deposit.saturating_sub(self.params.robot_funding);
            self.creator_deposits_held = self
                .creator_deposits_held
                .saturating_add(held.as_yoctonear());
            let robot = self.robot_mut(&id);
            robot.status = RobotStatus::Bench;
            let (name, kind, x_handle) =
                (robot.name.clone(), robot.kind.clone(), robot.x_handle.clone());
            self.bench.push(id.clone());
            events::emit(
                "register",
                &[events::Register {
                    account_id: Self::robot_account(&id),
                    robot_id: id,
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
            self.robots.remove(&id);
            env::log_str(&format!(
                "Robot {id} could not be created; the deposit goes back to {creator}"
            ));
            Promise::new(creator).transfer(deposit).detach();
        }
        created
    }

    /// Stage robots, highest pile first.
    pub fn get_stage(&self) -> Vec<RobotView> {
        self.sorted_views(&self.stage)
    }

    /// Bench robots, biggest queue first.
    pub fn get_bench(&self) -> Vec<RobotView> {
        self.sorted_views(&self.bench)
    }

    /// One robot (stage, bench or deleted). `null` if unknown or not confirmed yet.
    pub fn get_robot(&self, id: RobotId) -> Option<RobotView> {
        self.robots
            .get(&id)
            .and_then(|robot| self.robot_view(&id, robot))
    }
}
