//! Unit tests on a mocked blockchain. `World` drives the contract the way transactions
//! would: it sets the caller, deposit and block time before each call, and carries the
//! storage usage over between calls like the real runtime does.

use near_sdk::json_types::{U64, U128};
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{VMContextBuilder, get_created_receipts, get_logs};
use near_sdk::{AccountId, Gas, NearToken, PromiseResult, VMContext, env, testing_env};
use near_sdk_contract_tools::ft::{Nep141, Nep141Controller, Nep145};

use crate::Contract;
use crate::types::{CutRecord, RobotView};

mod contract_cut;
mod contract_pool;
mod contract_robots_saves;
mod math_rules;
mod spec_day;

pub const SEC: u64 = 1_000_000_000;
pub const DAY: u64 = 86_400 * SEC;
/// Thu Nov 12 2026, 15:01 UTC (the sample launch).
pub const LAUNCH: u64 = 1_794_495_660 * SEC;
/// Fri Nov 13 2026, 18:00 UTC (the sample first cut).
pub const FIRST_CUT: u64 = 1_794_592_800 * SEC;

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

pub fn creator_of(robot: &str) -> AccountId {
    id(&format!("creator-{robot}.near"))
}

/// Events logged by the last call, as `(standard, event, data)`.
pub fn events() -> Vec<(String, String, near_sdk::serde_json::Value)> {
    get_logs()
        .iter()
        .filter_map(|line| line.strip_prefix("EVENT_JSON:"))
        .map(|json| {
            let value: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(json).unwrap();
            (
                value["standard"].as_str().unwrap().to_string(),
                value["event"].as_str().unwrap().to_string(),
                value["data"].clone(),
            )
        })
        .collect()
}

pub fn event(name: &str) -> Option<near_sdk::serde_json::Value> {
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
}

pub struct Launch {
    pub stage_size: u32,
    pub first_cut_at: u64,
    pub cut_interval: u64,
    pub pool_near: NearToken,
}

impl Default for Launch {
    /// Mainnet-like: daily cuts, first one at the sample time, and a deep pool so test
    /// accounts can buy a lot of $CUT (about 0.1 NEAR each).
    fn default() -> Self {
        Self {
            stage_size: 10,
            first_cut_at: FIRST_CUT,
            cut_interval: DAY,
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
            9_500,
            launch.stage_size,
            U64(launch.first_cut_at),
            U64(launch.cut_interval),
            NearToken::from_millinear(500),
            near(5),
        );
        let usage = env::storage_usage();
        Self {
            c,
            now: LAUNCH,
            usage,
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

    /// Registers a robot created by `creator-<id>.near` and confirms its account.
    pub fn register(&mut self, robot: &str) {
        let creator = creator_of(robot);
        self.call(creator.as_str(), near(5), |c| {
            c.register_robot(
                robot.to_string(),
                format!("Robot {robot}"),
                "AI robot".to_string(),
                format!("@{robot}"),
            )
            .detach()
        });
        let created = self.callback(PromiseResult::Successful(vec![]), |c| {
            c.on_robot_created(robot.to_string())
        });
        assert!(created);
    }

    pub fn buy(&mut self, who: &str, amount: NearToken) -> u128 {
        self.call(who, amount, |c| c.buy(U128(0))).0
    }

    /// Saves `amount` on `robot`, attaching 0.005 NEAR for the record's storage like the
    /// app does.
    pub fn save(&mut self, who: &str, robot: &str, amount: u128) {
        self.call(who, NearToken::from_millinear(5), |c| {
            c.save(robot.to_string(), U128(amount))
        });
    }

    /// Registers `to` if needed and sends it `amount` $CUT from `from`.
    pub fn transfer(&mut self, from: &str, to: &str, amount: u128) {
        let registered = self.view(|c| c.storage_balance_of(id(to)).is_some());
        if !registered {
            self.call(to, NearToken::from_millinear(50), |c| {
                c.storage_deposit(None, None);
            });
        }
        self.call(from, NearToken::from_yoctonear(1), |c| {
            c.ft_transfer(id(to), U128(amount), None)
        });
    }

    pub fn balance(&mut self, who: &str) -> u128 {
        self.view(|c| c.ft_balance_of(id(who)).0)
    }

    pub fn claimable(&mut self, who: &str) -> u128 {
        self.view(|c| c.get_claimable(id(who)).0)
    }

    pub fn robot(&mut self, robot: &str) -> RobotView {
        self.view(|c| c.get_robot(robot.to_string()).expect("robot"))
    }

    pub fn stage_ids(&mut self) -> Vec<String> {
        self.view(|c| c.get_stage().into_iter().map(|r| r.id).collect())
    }

    pub fn bench_ids(&mut self) -> Vec<String> {
        self.view(|c| c.get_bench().into_iter().map(|r| r.id).collect())
    }

    /// Moves the clock to the next cut.
    pub fn at_next_cut(&mut self) {
        self.now = self.view(|c| c.get_next_cut().at.0);
    }

    pub fn run_cut(&mut self, runner: &str) -> CutRecord {
        self.at_next_cut();
        self.call(runner, zero(), |c| c.run_cut())
    }

    /// The contract's $CUT balance equals the pool, the piles, the next prize and the
    /// unclaimed prizes; the supply equals minted minus burned; the piles add up.
    pub fn assert_books(&mut self) {
        let stats = self.view(|c| c.get_stats());
        assert_eq!(
            stats.contract_balance.0,
            stats.pool_cut_reserve.0
                + stats.total_saved.0
                + stats.fees_since_cut.0
                + stats.prizes_outstanding.0,
            "contract balance must match its books: {stats:?}"
        );
        assert_eq!(stats.minted.0 - stats.burned.0, stats.total_supply.0);
        let supply = self.view(|c| c.ft_total_supply().0);
        assert_eq!(supply, stats.total_supply.0);
        assert_eq!(supply, self.view(|c| Nep141Controller::total_supply(c)));
        let piles: u128 = self.view(|c| {
            c.get_stage()
                .iter()
                .chain(c.get_bench().iter())
                .map(|r| r.pile.0)
                .sum()
        });
        assert_eq!(piles, stats.total_saved.0, "sum of piles = saved total");
    }
}
