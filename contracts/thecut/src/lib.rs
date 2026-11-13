//! The Cut: one memecoin, ten AI robots, and a daily cut.
//!
//! This contract is the whole game:
//! - `$CUT`, a NEP-141 token (18 decimals, 10,000,000 minted once in `new`), with NEP-145
//!   storage management and NEP-148 metadata (via `near-sdk-contract-tools`).
//! - A NEAR/$CUT constant-product pool. 1% of every buy and sell goes to the next prize.
//! - A stage of robots and a bench. Fans save $CUT into a robot's pile (or a bench robot's
//!   queue); a save is locked until the next cut.
//! - `run_cut`, callable by anyone once the cut is due: the lowest pile is cut, half of it
//!   burns, the rest plus the fees is split into equal slices per surviving robot, the
//!   robot account is deleted (the runner keeps its balance), and the biggest bench queue
//!   takes the seat.
//! - The robot factory: `register_robot` creates `<id>.<this account>` with the `robot`
//!   contract and no access keys.
//!
//! There is no owner and no admin method. Parameters are fixed in `new`.
//! See `contracts/README.md` for a map from every rule to the code.

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, env, near, require,
};
use near_sdk_contract_tools::ft::{
    FungibleToken, Nep141Controller, Nep141Mint, Nep141Transfer, Nep145Controller,
    Nep148Controller, StorageBalanceBounds, nep148::ContractMetadata,
};

pub mod events;
pub mod math;
pub mod types;

mod cut;
mod pool;
mod robots;
mod saves;
mod views;

use types::{CutRecord, Params, Pool, Robot, RobotId, SaveRecord};

/// One whole $CUT in units (18 decimals).
pub const ONE_CUT: u128 = 1_000_000_000_000_000_000;
/// $CUT minted once, in `new`: 10,000,000.
pub const TOTAL_SUPPLY: u128 = 10_000_000 * ONE_CUT;
/// Smallest new save. Keeps the reward accumulator far from overflow (see `math`).
pub const MIN_SAVE: u128 = ONE_CUT / 10;
/// Most robots one account can have a save on at once (records on cut robots count
/// until `claim` clears them). Bounds the work of `claim` and `get_claimable`.
pub const MAX_SAVES_PER_ACCOUNT: usize = 20;
/// Most robots waiting on the bench (including registrations not yet confirmed).
/// Bounds the work of `run_cut`.
pub const MAX_BENCH: usize = 50;
/// Most seats on the stage.
pub const MAX_STAGE: u32 = 20;
/// Cut records kept on chain; older ones are pruned (the events stay in the chain history).
pub const CUT_HISTORY: u64 = 366;
/// NEP-145 registration minimum: covers the $CUT balance entry and a couple of saves.
pub const STORAGE_MIN: NearToken = NearToken::from_millinear(10);
/// Smallest allowed `robot_funding`: the robot account must pay its own code storage.
pub const MIN_ROBOT_FUNDING: NearToken = NearToken::from_millinear(300);
/// Longest name / kind, in bytes.
pub const MAX_TEXT: usize = 32;
/// Longest X handle, in bytes (15 characters plus an optional `@`).
pub const MAX_X_HANDLE: usize = 16;

/// Gas for the robot's `new` call in the creation batch.
pub const GAS_ROBOT_INIT: Gas = Gas::from_tgas(5);
/// Gas for the robot's `self_delete` call (and the delete action it returns).
pub const GAS_SELF_DELETE: Gas = Gas::from_tgas(10);
/// Gas reserved for each callback.
pub const GAS_CALLBACK: Gas = Gas::from_tgas(10);
/// Least prepaid gas for `register_robot`.
pub const MIN_GAS_REGISTER: Gas = Gas::from_tgas(50);
/// Least prepaid gas for `run_cut` and `retry_delete`.
pub const MIN_GAS_RUN_CUT: Gas = Gas::from_tgas(60);

/// The robot contract, built from `contracts/robot` and copied here by `contracts/build.sh`.
pub const ROBOT_WASM: &[u8] = include_bytes!("../res/robot.wasm");

/// Token icon (SVG data URL).
const ICON: &str = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAzMiAzMic+PGNpcmNsZSBjeD0nMTYnIGN5PScxNicgcj0nMTQnIGZpbGw9JyNGRkQ0M0InIHN0cm9rZT0nIzBBMEIwRCcgc3Ryb2tlLXdpZHRoPScyJy8+PHBhdGggZD0nTTEwIDIyIDIyIDEwJyBzdHJva2U9JyMwQTBCMEQnIHN0cm9rZS13aWR0aD0nMycgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJy8+PC9zdmc+";

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Robots,
    Saves,
    SaverRobots,
    CreatorClaimable,
    Cuts,
}

#[derive(PanicOnDefault, FungibleToken)]
#[near(contract_state)]
pub struct Contract {
    params: Params,
    pool: Pool,
    /// Every robot ever registered, including cut ones (ids are never reused).
    robots: LookupMap<RobotId, Robot>,
    /// Robot ids on the stage (at most `stage_size`).
    stage: Vec<RobotId>,
    /// Robot ids on the bench (at most `MAX_BENCH`).
    bench: Vec<RobotId>,
    /// Registrations whose account creation is not confirmed yet.
    pending_robots: u32,
    next_robot_seq: u64,
    /// Saves by (account, robot).
    saves: LookupMap<(AccountId, RobotId), SaveRecord>,
    /// Robots each account has a save record on (at most `MAX_SAVES_PER_ACCOUNT`).
    saver_robots: LookupMap<AccountId, Vec<RobotId>>,
    /// Creator slices not yet claimed.
    creator_claimable: LookupMap<AccountId, u128>,
    /// The last `CUT_HISTORY` cuts.
    cuts: LookupMap<u64, CutRecord>,
    /// Index of the next cut. Cut 1 is the first.
    next_cut_index: u64,
    /// When the next cut opens (ns).
    next_cut_at: u64,
    /// $CUT for the next prize: fees since the last cut plus carried rounding dust.
    fees_since_cut: u128,
    /// $CUT in all piles and queues of live robots.
    total_saved: u128,
    /// $CUT allocated as prizes and not yet claimed. Rounding makes it a slight
    /// over-estimate of what can actually be claimed, never an under-estimate.
    prizes_outstanding: u128,
    /// yoctoNEAR held for creators, returned when their robots are cut.
    creator_deposits_held: u128,
}

#[near]
impl Contract {
    /// Launches The Cut. Attach the pool's initial NEAR reserve.
    ///
    /// Mints the whole supply once, straight into the pool. Times are nanoseconds.
    #[init]
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        fee_bps: u16,
        burn_bps: u16,
        savers_bps: u16,
        stage_size: u32,
        first_cut_at: near_sdk::json_types::U64,
        cut_interval: near_sdk::json_types::U64,
        robot_funding: NearToken,
        register_deposit: NearToken,
    ) -> Self {
        let pool_near = env::attached_deposit();
        require!(
            !pool_near.is_zero(),
            "Attach the pool's initial NEAR reserve to new()"
        );
        require!(fee_bps < 10_000, "fee_bps must be below 10000");
        require!(burn_bps <= 10_000, "burn_bps must be at most 10000");
        require!(savers_bps <= 10_000, "savers_bps must be at most 10000");
        require!(
            (2..=MAX_STAGE).contains(&stage_size),
            format!("stage_size must be between 2 and {MAX_STAGE}")
        );
        require!(cut_interval.0 > 0, "cut_interval must be positive");
        require!(
            first_cut_at.0 > env::block_timestamp(),
            "first_cut_at must be in the future"
        );
        require!(
            robot_funding >= MIN_ROBOT_FUNDING,
            "robot_funding must cover the robot account's storage (at least 0.3 NEAR)"
        );
        require!(
            register_deposit >= robot_funding,
            "register_deposit must be at least robot_funding"
        );

        let mut contract = Self {
            params: Params {
                total_supply: U128(TOTAL_SUPPLY),
                fee_bps,
                burn_bps,
                savers_bps,
                stage_size,
                first_cut_at,
                cut_interval,
                robot_funding,
                register_deposit,
                pool_cut_reserve: U128(TOTAL_SUPPLY),
                pool_near_reserve: pool_near,
            },
            pool: Pool {
                near_reserve: pool_near.as_yoctonear(),
                cut_reserve: TOTAL_SUPPLY,
            },
            robots: LookupMap::new(StorageKey::Robots),
            stage: Vec::new(),
            bench: Vec::new(),
            pending_robots: 0,
            next_robot_seq: 0,
            saves: LookupMap::new(StorageKey::Saves),
            saver_robots: LookupMap::new(StorageKey::SaverRobots),
            creator_claimable: LookupMap::new(StorageKey::CreatorClaimable),
            cuts: LookupMap::new(StorageKey::Cuts),
            next_cut_index: 1,
            next_cut_at: first_cut_at.0,
            fees_since_cut: 0,
            total_saved: 0,
            prizes_outstanding: 0,
            creator_deposits_held: 0,
        };

        contract.set_metadata(&ContractMetadata::new("The Cut", "CUT", 18).icon(ICON));
        contract.set_storage_balance_bounds(&StorageBalanceBounds {
            min: STORAGE_MIN,
            max: None,
        });
        // The contract holds the pool, the piles, the fees and unclaimed prizes, so it is
        // registered as a holder of its own token. Its own balance pays for that entry.
        let me = env::current_account_id();
        contract
            .deposit_to_storage_account(&me, STORAGE_MIN)
            .unwrap_or_else(|e| env::panic_str(&e.to_string()));
        Nep141Controller::mint(
            &mut contract,
            &Nep141Mint::new(TOTAL_SUPPLY, me).memo("launch: every $CUT starts in the pool"),
        )
        .unwrap_or_else(|e| env::panic_str(&e.to_string()));
        contract
    }
}

/// Internal helpers shared by the modules.
impl Contract {
    pub(crate) fn robot(&self, id: &str) -> &Robot {
        self.robots
            .get(id)
            .unwrap_or_else(|| env::panic_str(&format!("Unknown robot {id}")))
    }

    pub(crate) fn robot_mut(&mut self, id: &str) -> &mut Robot {
        self.robots
            .get_mut(id)
            .unwrap_or_else(|| env::panic_str(&format!("Unknown robot {id}")))
    }

    /// `<id>.<this account>`.
    pub(crate) fn robot_account(id: &str) -> AccountId {
        format!("{id}.{}", env::current_account_id())
            .parse()
            .unwrap_or_else(|_| env::panic_str("Robot id does not make a valid account id"))
    }

    pub(crate) fn require_registered(&self, account_id: &AccountId) {
        if self.get_storage_balance(account_id).is_err() {
            env::panic_str(&format!(
                "{account_id} is not registered: call storage_deposit (at least {STORAGE_MIN}) or attach it to this call"
            ));
        }
    }

    /// Credits an attached deposit to the caller's NEP-145 storage balance.
    pub(crate) fn top_up_storage(&mut self, account_id: &AccountId, deposit: NearToken) {
        if deposit.is_zero() {
            return;
        }
        self.deposit_to_storage_account(account_id, deposit)
            .unwrap_or_else(|e| env::panic_str(&format!("Storage deposit error: {e}")));
    }

    /// Moves $CUT from the contract to `to` (an NEP-141 transfer with its event).
    pub(crate) fn send_cut(&mut self, to: &AccountId, amount: u128, memo: &str) {
        if amount == 0 {
            return;
        }
        self.require_registered(to);
        let me = env::current_account_id();
        Nep141Controller::transfer(self, &Nep141Transfer::new(amount, me, to.clone()).memo(memo))
            .unwrap_or_else(|e| env::panic_str(&e.to_string()));
    }

    /// Moves $CUT from `from` to the contract (an NEP-141 transfer with its event).
    pub(crate) fn take_cut(&mut self, from: &AccountId, amount: u128, memo: &str) {
        let balance = self.balance_of(from);
        require!(
            balance >= amount,
            format!("Not enough $CUT: you have {balance} units, this needs {amount}")
        );
        let me = env::current_account_id();
        Nep141Controller::transfer(self, &Nep141Transfer::new(amount, from.clone(), me).memo(memo))
            .unwrap_or_else(|e| env::panic_str(&e.to_string()));
    }

    /// Charges (or credits) `account_id` for the storage its own records used since
    /// `start` (from `env::storage_usage()`). Flushes the per-account maps first so the
    /// measurement sees their writes.
    pub(crate) fn settle_storage(&mut self, account_id: &AccountId, start: u64) {
        self.saves.flush();
        self.saver_robots.flush();
        let end = env::storage_usage();
        let byte_cost = env::storage_byte_cost();
        if end > start {
            let fee = byte_cost.saturating_mul(u128::from(end - start));
            if self.lock_storage(account_id, fee).is_err() {
                let available = self
                    .get_storage_balance(account_id)
                    .map(|b| b.available)
                    .unwrap_or(NearToken::from_yoctonear(0));
                env::panic_str(&format!(
                    "Not enough storage deposit: this needs {} yoctoNEAR more. Attach it to this call or call storage_deposit",
                    fee.saturating_sub(available).as_yoctonear()
                ));
            }
        } else if start > end
            && let Ok(balance) = self.get_storage_balance(account_id)
        {
            // Credit back at most what this account has locked: records it did not pay
            // for (none today) never turn into withdrawable NEAR.
            let credit = byte_cost.saturating_mul(u128::from(start - end));
            let locked = balance.total.saturating_sub(balance.available);
            let credit = credit.min(locked);
            if !credit.is_zero() {
                let _ = self.unlock_storage(account_id, credit);
            }
        }
    }

    /// True when the cut is due: piles are frozen until someone runs it.
    pub(crate) fn cut_is_due(&self) -> bool {
        env::block_timestamp() >= self.next_cut_at
    }
}

/// Unwraps math results. Overflow is impossible within the supply bounds; if it ever
/// happened the call aborts and nothing changes.
pub(crate) fn checked<T>(value: Option<T>) -> T {
    value.unwrap_or_else(|| env::panic_str("Math overflow"))
}


#[cfg(test)]
mod tests;
