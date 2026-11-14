//! The Cut: one memecoin, ten AI agents, and a daily cut.
//!
//! This contract is the whole game:
//! - `$CUT`, a NEP-141 token (18 decimals, 10,000,000 minted once in `new`), with NEP-145
//!   storage management and NEP-148 metadata (via `near-sdk-contract-tools`).
//! - A NEAR/$CUT constant-product pool. 1% of every buy and sell is the fee: part goes to
//!   the season pot, the rest to the next day prize.
//! - The agent factory: `register_agent` creates `<id>.<this account>` with the `agent`
//!   contract and no access keys, and moves the creator's seed into that account's $CUT
//!   balance: the agent's wallet. Only the game rules move it.
//! - Seasons: the biggest bench queues take the stage; every day each agent makes one move
//!   (rescue, pact, attack or hold), chosen by a TEE-hosted model whose signature the
//!   contract checks; fans save and boo; `run_cut` deletes the lowest score until one
//!   champion is left, and the champion's savers take the season pot.
//!
//! There is no owner and no admin method. Parameters are fixed in `new`.
//! See `RULES.md` for the rules and `docs/contract-interface.md` for the API.

use near_sdk::json_types::{U64, U128};
use near_sdk::store::{LazyOption, LookupMap, Vector};
use near_sdk::{AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, env, near, require};
use near_sdk_contract_tools::ft::{
    FungibleToken, Nep141Burn, Nep141Controller, Nep141ControllerInternal, Nep141Mint,
    Nep141Transfer, Nep145Controller, Nep145ControllerInternal, Nep148Controller,
    StorageBalanceBounds, nep148::ContractMetadata,
};

pub mod events;
pub mod math;
pub mod moves;
pub mod personality;
pub mod types;

mod agents;
mod cut;
mod pool;
mod saves;
mod views;

use types::{
    Agent, AgentId, ChampionRecord, CutRecord, MoveRecord, Params, Pool, SaveRecord, Season,
};

/// One whole $CUT in units (18 decimals).
pub const ONE_CUT: u128 = 1_000_000_000_000_000_000;
/// $CUT minted once, in `new`: 10,000,000.
pub const TOTAL_SUPPLY: u128 = 10_000_000 * ONE_CUT;
/// Smallest new save, and smallest boo. Keeps the reward accumulator far from overflow
/// (see `math`).
pub const MIN_SAVE: u128 = ONE_CUT / 10;
/// Most agents one account can have a save on at once (records on cut agents count
/// until `claim` clears them). Bounds the work of `claim` and `get_claimable`.
pub const MAX_SAVES_PER_ACCOUNT: usize = 20;
/// Most agents waiting on the bench (including registrations not yet confirmed).
/// Bounds the work of `run_cut`.
pub const MAX_BENCH: usize = 50;
/// Most seats on the stage.
pub const MAX_STAGE: u32 = 12;
/// Cut records kept on chain; older ones are pruned (the events stay in the chain history).
pub const CUT_HISTORY: u64 = 366;
/// Cuts whose moves are kept on chain; older ones are pruned.
pub const MOVE_HISTORY: u64 = 30;
/// NEP-145 registration minimum: covers the $CUT balance entry and a couple of saves.
pub const STORAGE_MIN: NearToken = NearToken::from_millinear(10);
/// Smallest allowed `agent_funding`: the agent account must pay its own code storage.
pub const MIN_AGENT_FUNDING: NearToken = NearToken::from_millinear(300);
/// Longest name / tagline, in bytes.
pub const MAX_TEXT: usize = 32;
/// Longest X handle, in bytes (15 characters plus an optional `@`).
pub const MAX_X_HANDLE: usize = 16;
/// Longest charter, in bytes.
pub const MAX_CHARTER: usize = 600;
/// Longest model answer `submit_move` accepts, in bytes.
pub const MAX_RESPONSE: usize = 32 * 1024;
/// Longest move reason kept, in bytes.
pub const MAX_REASON: usize = 280;
/// Longest chat id kept, in bytes.
pub const MAX_CHAT_ID: usize = 128;
/// Longest `model_id`, in bytes.
pub const MAX_MODEL_ID: usize = 64;
/// Most model signing keys.
pub const MAX_MODEL_SIGNERS: usize = 4;
/// Allowed `max_tokens` of the move requests.
pub const MAX_TOKENS_RANGE: std::ops::RangeInclusive<u32> = 64..=4096;
/// Allowed `reasoning_effort` values of the move requests.
pub const REASONING_EFFORTS: [&str; 3] = ["low", "medium", "high"];

/// Gas for the agent's `new` call in the creation batch.
pub const GAS_AGENT_INIT: Gas = Gas::from_tgas(5);
/// Gas for the agent's `self_delete` call (and the delete action it returns).
pub const GAS_SELF_DELETE: Gas = Gas::from_tgas(10);
/// Gas reserved for each callback.
pub const GAS_CALLBACK: Gas = Gas::from_tgas(10);
/// Least prepaid gas for `register_agent`.
pub const MIN_GAS_REGISTER: Gas = Gas::from_tgas(50);
/// Least prepaid gas for `run_cut` and `retry_delete`.
pub const MIN_GAS_RUN_CUT: Gas = Gas::from_tgas(100);

/// The agent contract, built from `contracts/agent` and copied here by `contracts/build.sh`.
pub const AGENT_WASM: &[u8] = include_bytes!("../res/agent.wasm");

/// Token icon (SVG data URL).
const ICON: &str = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAzMiAzMic+PGNpcmNsZSBjeD0nMTYnIGN5PScxNicgcj0nMTQnIGZpbGw9JyNGRkQ0M0InIHN0cm9rZT0nIzBBMEIwRCcgc3Ryb2tlLXdpZHRoPScyJy8+PHBhdGggZD0nTTEwIDIyIDIyIDEwJyBzdHJva2U9JyMwQTBCMEQnIHN0cm9rZS13aWR0aD0nMycgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJy8+PC9zdmc+";

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Agents,
    Saves,
    SaverAgents,
    CreatorClaimable,
    Cuts,
    Moves,
    Brief,
    Champions,
}

#[derive(PanicOnDefault, FungibleToken)]
#[near(contract_state)]
pub struct Contract {
    params: Params,
    pool: Pool,
    season: Season,
    /// Every agent ever registered, including cut ones (ids are never reused).
    agents: LookupMap<AgentId, Agent>,
    /// Agent ids on the stage (at most `stage_size`).
    stage: Vec<AgentId>,
    /// Agent ids on the bench (at most `MAX_BENCH`).
    bench: Vec<AgentId>,
    /// Registrations whose account creation is not confirmed yet.
    pending_agents: u32,
    next_agent_seq: u64,
    /// Saves by (account, agent).
    saves: LookupMap<(AccountId, AgentId), SaveRecord>,
    /// Agents each account has a save record on (at most `MAX_SAVES_PER_ACCOUNT`).
    saver_agents: LookupMap<AccountId, Vec<AgentId>>,
    /// Creator slices not yet claimed.
    creator_claimable: LookupMap<AccountId, u128>,
    /// The last `CUT_HISTORY` cuts.
    cuts: LookupMap<u64, CutRecord>,
    /// Moves by the cut they are for, for the last `MOVE_HISTORY` cuts and the next one.
    moves: LookupMap<u64, Vec<MoveRecord>>,
    /// The board the agents see, as JSON, built at the last cut while a season is active.
    brief: LazyOption<String>,
    /// Every season's champion, in order.
    champions: Vector<ChampionRecord>,
    /// Index of the next cut. Cut 1 is the first.
    next_cut_index: u64,
    /// When the next cut opens (ns).
    next_cut_at: u64,
    /// $CUT for the next day prize: fees since the last cut plus carried rounding dust.
    fees_since_cut: u128,
    /// $CUT in all piles and queues of live agents (and champions, until unsaved).
    total_saved: u128,
    /// $CUT agents committed with their moves, held until the cut.
    committed: u128,
    /// $CUT allocated as prizes and not yet claimed. Rounding makes it a slight
    /// over-estimate of what can actually be claimed, never an under-estimate.
    prizes_outstanding: u128,
    /// yoctoNEAR held for creators, returned when their agents are cut or crowned.
    creator_deposits_held: u128,
}

/// Parses 64 hex characters into a 32-byte key, or `None`.
pub(crate) fn parse_key(hex: &str) -> Option<[u8; 32]> {
    moves::from_hex(hex)?.try_into().ok()
}

#[near]
impl Contract {
    /// Launches The Cut. Attach the pool's initial NEAR reserve.
    ///
    /// Mints the whole supply once, straight into the pool. Times are nanoseconds, $CUT
    /// amounts are units (18 decimals), `model_signers` are Ed25519 public keys in hex.
    #[init]
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        fee_bps: u16,
        pot_bps: u16,
        burn_bps: u16,
        savers_bps: u16,
        agents_bps: u16,
        stage_size: u32,
        min_season: u32,
        first_cut_at: U64,
        cut_interval: U64,
        move_lead: U64,
        think_fee: U128,
        min_seed: U128,
        agent_funding: NearToken,
        register_deposit: NearToken,
        model_id: String,
        model_signers: Vec<String>,
        max_tokens: u32,
        reasoning_effort: Option<String>,
    ) -> Self {
        let pool_near = env::attached_deposit();
        require!(
            !pool_near.is_zero(),
            "Attach the pool's initial NEAR reserve to new()"
        );
        require!(fee_bps < 10_000, "fee_bps must be below 10000");
        require!(pot_bps <= 10_000, "pot_bps must be at most 10000");
        require!(burn_bps <= 10_000, "burn_bps must be at most 10000");
        require!(
            u32::from(savers_bps) + u32::from(agents_bps) <= 10_000,
            "savers_bps + agents_bps must be at most 10000"
        );
        require!(
            (2..=MAX_STAGE).contains(&stage_size),
            format!("stage_size must be between 2 and {MAX_STAGE}")
        );
        require!(
            (2..=stage_size).contains(&min_season),
            "min_season must be between 2 and stage_size"
        );
        require!(cut_interval.0 > 0, "cut_interval must be positive");
        require!(
            move_lead.0 < cut_interval.0,
            "move_lead must be shorter than cut_interval"
        );
        require!(
            first_cut_at.0 > env::block_timestamp(),
            "first_cut_at must be in the future"
        );
        require!(min_seed.0 > 0, "min_seed must be positive");
        require!(
            agent_funding >= MIN_AGENT_FUNDING,
            "agent_funding must cover the agent account's storage (at least 0.3 NEAR)"
        );
        require!(
            register_deposit >= agent_funding.saturating_add(STORAGE_MIN),
            "register_deposit must cover agent_funding plus the agent's $CUT registration (0.01 NEAR)"
        );
        require!(
            !model_id.is_empty()
                && model_id.len() <= MAX_MODEL_ID
                && !model_id.chars().any(char::is_control),
            format!("model_id must be 1 to {MAX_MODEL_ID} bytes without control characters")
        );
        require!(
            (1..=MAX_MODEL_SIGNERS).contains(&model_signers.len()),
            format!("model_signers must hold 1 to {MAX_MODEL_SIGNERS} keys")
        );
        require!(
            MAX_TOKENS_RANGE.contains(&max_tokens),
            "max_tokens must be between 64 and 4096"
        );
        require!(
            reasoning_effort
                .as_deref()
                .is_none_or(|effort| REASONING_EFFORTS.contains(&effort)),
            "reasoning_effort must be low, medium or high (or null to leave it out)"
        );
        let model_signers: Vec<String> = model_signers
            .iter()
            .map(|key| {
                let key = key.to_ascii_lowercase();
                require!(
                    parse_key(&key).is_some(),
                    "Each model signer must be an Ed25519 public key as 64 hex characters"
                );
                key
            })
            .collect();

        let mut contract = Self {
            params: Params {
                total_supply: U128(TOTAL_SUPPLY),
                fee_bps,
                pot_bps,
                burn_bps,
                savers_bps,
                agents_bps,
                stage_size,
                min_season,
                first_cut_at,
                cut_interval,
                move_lead,
                think_fee,
                min_seed,
                agent_funding,
                register_deposit,
                model_id,
                model_signers,
                max_tokens,
                reasoning_effort,
                pool_cut_reserve: U128(TOTAL_SUPPLY),
                pool_near_reserve: pool_near,
            },
            pool: Pool {
                near_reserve: pool_near.as_yoctonear(),
                cut_reserve: TOTAL_SUPPLY,
            },
            season: Season::default(),
            agents: LookupMap::new(StorageKey::Agents),
            stage: Vec::new(),
            bench: Vec::new(),
            pending_agents: 0,
            next_agent_seq: 0,
            saves: LookupMap::new(StorageKey::Saves),
            saver_agents: LookupMap::new(StorageKey::SaverAgents),
            creator_claimable: LookupMap::new(StorageKey::CreatorClaimable),
            cuts: LookupMap::new(StorageKey::Cuts),
            moves: LookupMap::new(StorageKey::Moves),
            brief: LazyOption::new(StorageKey::Brief, None),
            champions: Vector::new(StorageKey::Champions),
            next_cut_index: 1,
            next_cut_at: first_cut_at.0,
            fees_since_cut: 0,
            total_saved: 0,
            committed: 0,
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
    pub(crate) fn agent(&self, id: &str) -> &Agent {
        self.agents
            .get(id)
            .unwrap_or_else(|| env::panic_str(&format!("Unknown agent {id}")))
    }

    pub(crate) fn agent_mut(&mut self, id: &str) -> &mut Agent {
        self.agents
            .get_mut(id)
            .unwrap_or_else(|| env::panic_str(&format!("Unknown agent {id}")))
    }

    /// `<id>.<this account>`.
    pub(crate) fn agent_account(id: &str) -> AccountId {
        format!("{id}.{}", env::current_account_id())
            .parse()
            .unwrap_or_else(|_| env::panic_str("Agent id does not make a valid account id"))
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
        self.require_registered(to);
        self.move_cut(&env::current_account_id(), to, amount, memo);
    }

    /// Moves $CUT between two registered accounts (an NEP-141 transfer with its event).
    /// Nothing happens for a zero amount.
    pub(crate) fn move_cut(&mut self, from: &AccountId, to: &AccountId, amount: u128, memo: &str) {
        if amount == 0 {
            return;
        }
        Nep141Controller::transfer(
            self,
            &Nep141Transfer::new(amount, from.clone(), to.clone()).memo(memo),
        )
        .unwrap_or_else(|e| env::panic_str(&e.to_string()));
    }

    /// Burns $CUT held by `owner` (an NEP-141 burn with its event). Nothing happens for a
    /// zero amount.
    pub(crate) fn burn_cut(&mut self, owner: &AccountId, amount: u128, memo: &str) {
        if amount == 0 {
            return;
        }
        Nep141Controller::burn(self, &Nep141Burn::new(amount, owner.clone()).memo(memo))
            .unwrap_or_else(|e| env::panic_str(&e.to_string()));
    }

    /// Removes an empty agent wallet's $CUT registration once the agent's run is over, so
    /// a gift sent to it later fails (and stays with the sender) instead of being lost. Frees
    /// the registration the creator's deposit paid for.
    pub(crate) fn close_wallet(&mut self, account_id: &AccountId) {
        <Self as Nep141ControllerInternal>::slot_account(account_id).remove();
        <Self as Nep145ControllerInternal>::slot_account(account_id).remove();
    }

    /// Sends a creator its deposit back, minus the agent account's funding.
    pub(crate) fn refund_creator(&mut self, creator: &AccountId) -> NearToken {
        let refund = self
            .params
            .register_deposit
            .saturating_sub(self.params.agent_funding);
        self.creator_deposits_held = self
            .creator_deposits_held
            .saturating_sub(refund.as_yoctonear());
        near_sdk::Promise::new(creator.clone())
            .transfer(refund)
            .detach();
        refund
    }

    /// Moves $CUT from `from` to the contract (an NEP-141 transfer with its event).
    pub(crate) fn take_cut(&mut self, from: &AccountId, amount: u128, memo: &str) {
        let balance = self.balance_of(from);
        require!(
            balance >= amount,
            format!("Not enough $CUT: you have {balance} units, this needs {amount}")
        );
        let me = env::current_account_id();
        Nep141Controller::transfer(
            self,
            &Nep141Transfer::new(amount, from.clone(), me).memo(memo),
        )
        .unwrap_or_else(|e| env::panic_str(&e.to_string()));
    }

    /// Charges (or credits) `account_id` for the storage its own records used since
    /// `start` (from `env::storage_usage()`). Flushes the per-account maps first so the
    /// measurement sees their writes.
    pub(crate) fn settle_storage(&mut self, account_id: &AccountId, start: u64) {
        self.saves.flush();
        self.saver_agents.flush();
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

    /// Moves for the next cut are refused from this time on (ns).
    pub(crate) fn moves_close_at(&self) -> u64 {
        self.next_cut_at.saturating_sub(self.params.move_lead.0)
    }
}

/// Unwraps math results. Overflow is impossible within the supply bounds; if it ever
/// happened the call aborts and nothing changes.
pub(crate) fn checked<T>(value: Option<T>) -> T {
    value.unwrap_or_else(|| env::panic_str("Math overflow"))
}

#[cfg(test)]
mod tests;
