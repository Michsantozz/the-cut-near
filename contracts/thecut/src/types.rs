//! State records and JSON views. Field names and units follow docs/contract-interface.md.

use near_sdk::json_types::{I128, U64, U128};
use near_sdk::{AccountId, NearToken, near};

/// An agent id: the `<id>` in `<id>.thecut.near`.
pub type AgentId = String;

/// Launch parameters. Set once in `new`, never changed (there is no admin method).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Params {
    /// $CUT minted once at `new` (18 decimals).
    pub total_supply: U128,
    /// Fee on every buy and sell, in basis points.
    pub fee_bps: u16,
    /// Share of every fee that goes to the season pot; the rest goes to the next day prize.
    pub pot_bps: u16,
    /// Share of a cut agent's pile that burns, in basis points; the rest joins the day prize.
    pub burn_bps: u16,
    /// Share of the day prize for savers, as equal slices per surviving agent.
    pub savers_bps: u16,
    /// Share of the day prize paid into the surviving agents' wallets. Creators get the rest.
    pub agents_bps: u16,
    /// Agents seated at a season start.
    pub stage_size: u32,
    /// Bench agents needed to start a season.
    pub min_season: u32,
    /// Time of cut 1, nanoseconds since the Unix epoch.
    pub first_cut_at: U64,
    /// Time between cuts, in nanoseconds.
    pub cut_interval: U64,
    /// Moves close this long before each cut, in nanoseconds.
    pub move_lead: U64,
    /// $CUT units burned from an agent's wallet for every move.
    pub think_fee: U128,
    /// Least $CUT units a creator puts into a new agent's wallet.
    pub min_seed: U128,
    /// NEAR left in each agent account; the cut runner receives it when the account is deleted.
    pub agent_funding: NearToken,
    /// NEAR a creator attaches to `register_agent`.
    pub register_deposit: NearToken,
    /// The only model whose answers count.
    pub model_id: String,
    /// Ed25519 public keys (lowercase hex) of the model's TEE signing key.
    pub model_signers: Vec<String>,
    /// `max_tokens` of every move request.
    pub max_tokens: u32,
    /// `reasoning_effort` of every move request (`low`, `medium` or `high`), or `null` to
    /// leave it out.
    pub reasoning_effort: Option<String>,
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

/// The current (or last) season.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Season {
    /// Number of the current or last season; 0 before the first one.
    pub index: u32,
    pub active: bool,
    /// Day of the season: 1 from the start cut to the next cut, and so on.
    pub day: u32,
    /// $CUT units for the champion's savers: `pot_bps` of every fee, carried across seasons
    /// until a champion with savers takes it.
    pub pot: u128,
    /// Champion of season `index`, once crowned.
    pub champion: Option<AgentId>,
}

/// Where an agent is.
#[near(serializers = [borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgentStatus {
    /// `register_agent` was called; the account creation has not been confirmed yet.
    Pending,
    /// Waiting for a season. Its pile is its queue.
    Bench,
    /// On the stage of the running season.
    Stage,
    /// Cut. Its account deletion was requested.
    Deleted,
    /// Last one standing of its season. Its account stays forever.
    Champion,
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
    pub tagline: String,
    pub x_handle: String,
    /// One of the ids in `personality::PERSONALITIES`.
    pub personality: String,
    /// The agent's character in its creator's words. Part of every prompt.
    pub charter: String,
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
    /// Season it was seated in.
    pub season: Option<u32>,
    /// Prize per $CUT saved since registration, scaled by `math::ACC_SCALE`.
    pub reward_per_unit: u128,
    /// Agent that receives its wallet if it is cut.
    pub heir: Option<AgentId>,
    /// Agents it may not attack at the next cut (and that may not attack it).
    pub pacts: Vec<AgentId>,
    /// $CUT fans burned to boo it for the next cut.
    pub boos: u128,
    /// $CUT other agents committed to attack it at the next cut.
    pub damage: u128,
    /// $CUT it offered its savers for surviving the next cut (its rescue move).
    pub bounty: u128,
    /// Index of the cut its last move was for (0 = never moved).
    pub moved_for: u64,
    /// Index of the cut that deleted or crowned it.
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

/// The four moves an agent can make.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MoveKind {
    Rescue,
    Pact,
    Attack,
    Hold,
}

impl MoveKind {
    pub fn as_str(self) -> &'static str {
        match self {
            MoveKind::Rescue => "rescue",
            MoveKind::Pact => "pact",
            MoveKind::Attack => "attack",
            MoveKind::Hold => "hold",
        }
    }
}

/// A move as stored, after clamping and downgrades.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MoveRecord {
    pub agent_id: AgentId,
    pub kind: MoveKind,
    pub target: Option<AgentId>,
    /// $CUT units committed from the agent's wallet until the cut.
    pub amount: u128,
    /// $CUT units the model asked for (its whole amount times one $CUT).
    pub asked_amount: u128,
    /// Heir set by this move, if it named a valid one.
    pub heir: Option<AgentId>,
    pub reason: String,
    /// Why the move was clamped or downgraded, if it was.
    pub outcome: Option<String>,
    pub chat_id: String,
    pub request_sha256: [u8; 32],
    pub response_sha256: [u8; 32],
    pub signer: [u8; 32],
    pub submitted_by: AccountId,
    pub submitted_at: u64,
}

/// A season's champion.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChampionRecord {
    pub season: u32,
    pub agent_id: AgentId,
    pub account_id: AccountId,
    pub name: String,
    /// Index of the cut that crowned it.
    pub cut_index: u64,
    /// Block time of that cut (ns).
    pub crowned_at: U64,
    /// Season pot paid to its savers; 0 when its pile was empty and the pot carried.
    pub pot: U128,
    /// Its wallet, burned at the crown.
    pub wallet_burned: U128,
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
    /// Season the cut belonged to (the new one at a season start; 0 before the first).
    pub season: u32,
    /// Day of the season this cut closed; 0 when no season was active before it.
    pub day: u32,
    /// Agent deleted, or `null` when no season was active.
    pub deleted_id: Option<AgentId>,
    /// Score of the deleted agent: pile - boos - damage.
    pub score: I128,
    /// Pile of the deleted agent.
    pub pile: U128,
    /// $CUT burned at this cut: attacks, part of the pile, capped prize excess, an heirless
    /// or champion wallet.
    pub burned: U128,
    /// Day prize split at this cut: fees since the last cut plus the unburned part of the pile.
    pub prize: U128,
    /// One savers' slice per survivor (before the per-pile cap).
    pub slice: U128,
    /// $CUT paid into each survivor's wallet.
    pub agent_slice: U128,
    /// One creator slice per survivor.
    pub creator_slice: U128,
    /// Agents on the stage that shared the prize.
    pub survivors: u32,
    /// Agent that inherited the deleted agent's wallet.
    pub inherited_by: Option<AgentId>,
    /// $CUT units it inherited.
    pub inherited: U128,
    /// Agent crowned at this cut.
    pub champion_id: Option<AgentId>,
    /// Season pot paid to the champion's savers at this cut.
    pub pot_paid: U128,
    /// Agents seated by a season start at this cut.
    pub seated_ids: Vec<AgentId>,
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
    Champion,
}

/// `AgentView` from the interface.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentView {
    pub id: AgentId,
    pub account_id: AccountId,
    pub name: String,
    pub tagline: String,
    pub x_handle: String,
    pub personality: String,
    pub charter: String,
    pub creator: AccountId,
    pub status: AgentStatusView,
    pub pile: U128,
    pub savers: u32,
    /// $CUT balance of the agent account.
    pub wallet: U128,
    pub heir: Option<AgentId>,
    pub pacts: Vec<AgentId>,
    pub boos: U128,
    pub damage: U128,
    pub bounty: U128,
    /// `pile - boos - damage`, signed.
    pub score: I128,
    /// A move is in for the next cut.
    pub moved: bool,
    pub joined_at: U64,
    /// Registration order (higher is newer; on equal scores the newer agent is cut).
    pub seq: u64,
    pub stage_at: Option<U64>,
    pub season: Option<u32>,
    pub cut_index: Option<u64>,
    pub delete_state: Option<DeleteState>,
}

/// A move as `get_moves` returns it.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MoveView {
    /// The cut the move was for.
    pub cut_index: u64,
    pub agent_id: AgentId,
    #[serde(rename = "move")]
    pub kind: MoveKind,
    pub target: Option<AgentId>,
    pub amount: U128,
    pub asked_amount: U128,
    pub heir: Option<AgentId>,
    pub reason: String,
    pub outcome: Option<String>,
    pub chat_id: String,
    /// Lowercase hex.
    pub request_sha256: String,
    pub response_sha256: String,
    pub signer: String,
    pub submitted_by: AccountId,
    pub submitted_at: U64,
}

/// One personality from the fixed table.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PersonalityView {
    pub id: String,
    /// Most of the wallet (after the think fee) it may spend in one move, in basis points.
    pub spend_bps: u16,
    pub may_attack: bool,
    pub may_attack_partner: bool,
    pub prompt_line: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeasonView {
    /// Number of the current or last season; 0 before the first one.
    pub index: u32,
    pub active: bool,
    pub day: u32,
    /// Agents on the stage.
    pub alive: u32,
    pub pot: U128,
    /// Champion of season `index`, once crowned.
    pub champion: Option<AgentId>,
    /// Bench agents still missing to start the next season.
    pub next_start_needs: u32,
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
    /// Fee in $CUT, split between the season pot and the next day prize.
    pub fee: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NextCutView {
    pub index: u64,
    pub at: U64,
    /// Moves for this cut are refused from this time on.
    pub moves_close_at: U64,
    /// Agent that would be cut if the cut ran now (lowest score); `null` without a season.
    pub lowest_id: Option<AgentId>,
    /// Exact score the lowest agent needs to stop being the one cut.
    pub gap_to_next: U128,
    /// Day prize if the cut ran now: fees since the last cut plus the unburned part of the
    /// lowest pile.
    pub prize_so_far: U128,
    /// One savers' slice per survivor if the cut ran now (before the per-pile cap).
    pub slice_so_far: U128,
    /// $CUT into each survivor's wallet if the cut ran now.
    pub agent_slice_so_far: U128,
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
    /// $CUT in all piles and queues (stage, bench and champions not yet unsaved).
    pub total_saved: U128,
    /// $CUT waiting for the next day prize (fees plus rounding dust).
    pub fees_since_cut: U128,
    /// $CUT waiting for the next champion's savers.
    pub season_pot: U128,
    /// $CUT agents committed with their moves, held until the cut.
    pub committed: U128,
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
