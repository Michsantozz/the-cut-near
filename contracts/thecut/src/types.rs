//! State records and JSON views. Field names and units follow docs/contract-interface.md.

use near_sdk::json_types::{U64, U128};
use near_sdk::{AccountId, NearToken, near};

/// An agent id: the `<id>` in `<id>.thecut.near`.
pub type AgentId = String;

/// Launch parameters. Set once in `new`, never changed (there is no admin method).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Params {
    /// $CUT minted once at `new` (18 decimals).
    pub total_supply: U128,
    /// Fee on every buy and sell, in basis points, credited to the next prize.
    pub fee_bps: u16,
    /// Share of the cut pile that burns, in basis points.
    pub burn_bps: u16,
    /// Share of the prize that goes to savers (the rest goes to creators), in basis points.
    pub savers_bps: u16,
    /// Seats on the stage.
    pub stage_size: u32,
    /// Time of cut 1, nanoseconds since the Unix epoch.
    pub first_cut_at: U64,
    /// Time between cuts, in nanoseconds.
    pub cut_interval: U64,
    /// NEAR left in each agent account; the cut runner receives it when the account is deleted.
    pub agent_funding: NearToken,
    /// NEAR a creator attaches to `register_agent`.
    pub register_deposit: NearToken,
    /// $CUT in the pool at launch (the whole supply).
    pub pool_cut_reserve: U128,
    /// NEAR in the pool at launch (the deposit attached to `new`).
    pub pool_near_reserve: NearToken,
}

/// The NEAR/$CUT constant-product pool.
#[near(serializers = [borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Pool {
    /// yoctoNEAR in the pool.
    pub near_reserve: u128,
    /// $CUT units in the pool.
    pub cut_reserve: u128,
}

/// Where an agent is.
#[near(serializers = [borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgentStatus {
    /// `register_agent` was called; the account creation has not been confirmed yet.
    Pending,
    /// Waiting for a seat. Its pile is its queue.
    Bench,
    /// On the stage.
    Stage,
    /// Cut. Its account deletion was requested.
    Deleted,
}

/// What happened to a cut agent's NEAR account.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeleteState {
    /// `self_delete` was sent; the callback has not run yet.
    Requested,
    /// The account is gone and the runner received its balance.
    Done,
    /// The deletion failed. Anyone can call `retry_delete`.
    Failed,
}

/// An agent as stored.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Agent {
    /// Registration order. A higher number is a newer agent (tie rule).
    pub seq: u64,
    pub name: String,
    pub kind: String,
    pub x_handle: String,
    pub creator: AccountId,
    pub status: AgentStatus,
    /// $CUT saved on it. On the bench, its queue. After its cut, the pile it had.
    pub pile: u128,
    /// Accounts with a save on it (for show; money never depends on it).
    pub savers: u32,
    /// Registration time (ns).
    pub joined_at: u64,
    /// Time it took a seat on the stage (ns).
    pub stage_at: Option<u64>,
    /// Prize per $CUT saved since registration, scaled by `math::ACC_SCALE`.
    pub reward_per_unit: u128,
    /// Index of the cut that deleted it.
    pub cut_index: Option<u64>,
    /// Account deletion progress, once cut.
    pub delete_state: Option<DeleteState>,
    /// Who ran the cut: the beneficiary of the account deletion.
    pub runner: Option<AccountId>,
}

/// One account's save on one agent.
#[near(serializers = [borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SaveRecord {
    /// $CUT saved.
    pub amount: u128,
    /// Index of the cut this save is locked for. It unlocks once that cut ran.
    pub locked_for: u64,
    /// The agent's accumulator when the record last settled.
    pub reward_snapshot: u128,
    /// Prize already settled on this record and not yet claimed.
    pub owed: u128,
}

/// A cut that ran.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CutRecord {
    pub index: u64,
    /// Scheduled time of this cut (ns).
    pub at: U64,
    /// Block time when it ran (ns).
    pub ran_at: U64,
    /// Agent deleted, or `null` when the stage was not full (no agent is cut then).
    pub deleted_id: Option<AgentId>,
    /// Pile of the deleted agent.
    pub pile: U128,
    /// $CUT burned at this cut: half the pile plus the slices of survivors with empty piles.
    pub burned: U128,
    /// Prize paid at this cut: the unburned half of the pile plus fees since the last cut.
    pub prize: U128,
    /// One savers' slice per surviving agent.
    pub slice: U128,
    /// One creator slice per surviving agent.
    pub creator_slice: U128,
    /// Agents on the stage that shared the prize.
    pub survivors: u32,
    /// First bench agent that took a seat (usually the only one).
    pub joined_id: Option<AgentId>,
    /// Every bench agent that took a seat (several only while the stage fills up).
    pub joined_ids: Vec<AgentId>,
    /// Account that ran the cut; it receives the deleted agent account's balance.
    pub runner: AccountId,
    /// NEAR sent back to the deleted agent's creator.
    pub creator_refund: NearToken,
}

/// Agent status as the app reads it.
#[near(serializers = [json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatusView {
    Stage,
    Bench,
    Deleted,
}

/// `AgentView` from the interface, plus a few extra fields.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentView {
    pub id: AgentId,
    pub account_id: AccountId,
    pub name: String,
    pub kind: String,
    pub x_handle: String,
    pub creator: AccountId,
    pub status: AgentStatusView,
    pub pile: U128,
    pub savers: u32,
    pub joined_at: U64,
    /// Registration order (higher is newer; on equal piles the newer agent is cut).
    pub seq: u64,
    pub stage_at: Option<U64>,
    pub cut_index: Option<u64>,
    pub delete_state: Option<DeleteState>,
}

/// One save of an account, as `get_saves` returns it.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SaveView {
    pub agent_id: AgentId,
    pub amount: U128,
    /// Index of the cut this save is locked for.
    pub since_cut: u64,
    /// True once that cut ran: `unsave` is allowed (unless the agent was cut).
    pub unlocked: bool,
    /// Prize earned on this save and not yet claimed.
    pub prize: U128,
    pub agent_status: AgentStatusView,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PoolView {
    pub near_reserve: U128,
    pub cut_reserve: U128,
    pub fee_bps: u16,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QuoteView {
    /// $CUT (buy) or yoctoNEAR (sell) the trader receives.
    pub amount_out: U128,
    /// Fee in $CUT, credited to the next prize.
    pub fee: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NextCutView {
    pub index: u64,
    pub at: U64,
    /// Agent that would be cut if the cut ran now; `null` while the stage is not full.
    pub lowest_id: Option<AgentId>,
    /// Exact $CUT units the lowest agent needs to stop being the one cut.
    pub gap_to_next: U128,
    /// Prize if the cut ran now: half the lowest pile plus fees since the last cut.
    pub prize_so_far: U128,
    /// One savers' slice per survivor if the cut ran now.
    pub slice_so_far: U128,
    /// One creator slice per survivor if the cut ran now.
    pub creator_slice_so_far: U128,
    /// Agents that would share the prize.
    pub survivors: u32,
    /// True once `at` has passed: anyone can call `run_cut` now.
    pub due: bool,
}

/// Totals for the Audit page.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StatsView {
    /// $CUT minted at launch (never again).
    pub minted: U128,
    /// $CUT burned so far: `minted - total_supply`.
    pub burned: U128,
    pub total_supply: U128,
    /// $CUT in all piles and queues (sum of every live agent's pile).
    pub total_saved: U128,
    /// $CUT waiting for the next prize (fees plus rounding dust).
    pub fees_since_cut: U128,
    /// $CUT allocated to savers and creators and not yet claimed (rounded up).
    pub prizes_outstanding: U128,
    pub pool_near_reserve: U128,
    pub pool_cut_reserve: U128,
    /// $CUT held by the contract account.
    pub contract_balance: U128,
    /// NEAR held for creators until their agents leave.
    pub creator_deposits_held: NearToken,
    pub stage_count: u32,
    pub bench_count: u32,
    pub cuts_run: u64,
}
