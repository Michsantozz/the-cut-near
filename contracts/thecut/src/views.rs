//! Read-only views that are not tied to one feature.

use near_sdk::json_types::U128;
use near_sdk::{NearToken, env, near};
use near_sdk_contract_tools::ft::Nep141Controller;

use crate::personality::PERSONALITIES;
use crate::types::{ChampionRecord, Params, PersonalityView, SeasonView, StatsView};
use crate::{Contract, ContractExt, TOTAL_SUPPLY};

/// Most champions `get_champions` returns at once.
const MAX_CHAMPIONS_PAGE: u32 = 100;

#[near]
impl Contract {
    /// Launch parameters (fixed forever).
    pub fn get_params(&self) -> Params {
        self.params.clone()
    }

    /// The fixed personality table.
    pub fn get_personalities(&self) -> Vec<PersonalityView> {
        PERSONALITIES.iter().map(|p| p.view()).collect()
    }

    /// The current (or last) season.
    pub fn get_season(&self) -> SeasonView {
        SeasonView {
            index: self.season.index,
            active: self.season.active,
            day: self.season.day,
            alive: self.stage.len() as u32,
            pot: U128(self.season.pot),
            champion: self.season.champion.clone(),
            next_start_needs: self
                .params
                .min_season
                .saturating_sub(self.bench.len() as u32),
        }
    }

    /// Champions in season order, from season `from_index + 1`; at most `limit` (default
    /// and maximum 100).
    pub fn get_champions(
        &self,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<ChampionRecord> {
        let limit = limit.unwrap_or(MAX_CHAMPIONS_PAGE).min(MAX_CHAMPIONS_PAGE);
        self.champions
            .iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit as usize)
            .cloned()
            .collect()
    }

    /// Supply and accounting totals, for the Audit page: `minted - burned == total_supply`,
    /// and the contract's $CUT balance covers the pool, the piles, the next day prize, the
    /// season pot, the committed moves and the unclaimed prizes.
    pub fn get_stats(&self) -> StatsView {
        let total_supply = Nep141Controller::total_supply(self);
        StatsView {
            minted: U128(TOTAL_SUPPLY),
            burned: U128(TOTAL_SUPPLY.saturating_sub(total_supply)),
            total_supply: U128(total_supply),
            total_saved: U128(self.total_saved),
            fees_since_cut: U128(self.fees_since_cut),
            season_pot: U128(self.season.pot),
            committed: U128(self.committed),
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
