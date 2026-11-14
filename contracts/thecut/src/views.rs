//! Read-only views that are not tied to one feature.

use near_sdk::json_types::U128;
use near_sdk::{NearToken, env, near};
use near_sdk_contract_tools::ft::Nep141Controller;

use crate::types::{Params, StatsView};
use crate::{Contract, ContractExt, TOTAL_SUPPLY};

#[near]
impl Contract {
    /// Launch parameters (fixed forever).
    pub fn get_params(&self) -> Params {
        self.params.clone()
    }

    /// Supply and accounting totals, for the Audit page: `minted - burned == total_supply`,
    /// and the contract's $CUT balance covers the pool, the piles, the next prize and the
    /// unclaimed prizes.
    pub fn get_stats(&self) -> StatsView {
        let total_supply = Nep141Controller::total_supply(self);
        StatsView {
            minted: U128(TOTAL_SUPPLY),
            burned: U128(TOTAL_SUPPLY.saturating_sub(total_supply)),
            total_supply: U128(total_supply),
            total_saved: U128(self.total_saved),
            fees_since_cut: U128(self.fees_since_cut),
            prizes_outstanding: U128(self.prizes_outstanding),
            pool_near_reserve: U128(self.pool.near_reserve),
            pool_cut_reserve: U128(self.pool.cut_reserve),
            contract_balance: U128(self.balance_of(&env::current_account_id())),
            creator_deposits_held: NearToken::from_yoctonear(self.creator_deposits_held),
            stage_count: self.stage.len() as u32,
            bench_count: self.bench.len() as u32,
            cuts_run: self.next_cut_index.saturating_sub(1),
        }
    }
}
