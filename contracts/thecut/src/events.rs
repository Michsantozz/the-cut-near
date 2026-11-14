//! NEP-297 events with `standard: "thecut"`, `version: "2.0.0"`.
//!
//! Each event logs `EVENT_JSON:{"standard","version","event","data":[...]}`, with `data`
//! as an array of items like the NEP-141 events. Amounts are decimal strings.
//! `ft_mint`, `ft_transfer` and `ft_burn` are logged by the NEP-141 implementation.

use near_sdk::json_types::{I128, U64, U128};
use near_sdk::serde::Serialize;
use near_sdk::serde_json::{self, json};
use near_sdk::{AccountId, NearToken, env};

use crate::types::MoveKind;

pub const STANDARD: &str = "thecut";
pub const VERSION: &str = "2.0.0";

/// Logs one event whose `data` is `items`.
pub fn emit<T: Serialize>(event: &str, items: &[T]) {
    let body = json!({
        "standard": STANDARD,
        "version": VERSION,
        "event": event,
        "data": items,
    });
    let text = serde_json::to_string(&body).unwrap_or_else(|_| env::panic_str("Event encoding"));
    env::log_str(&format!("EVENT_JSON:{text}"));
}

/// Logs one event only when there is something in it.
pub fn emit_some<T: Serialize>(event: &str, items: &[T]) {
    if !items.is_empty() {
        emit(event, items);
    }
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Buy {
    pub account_id: AccountId,
    pub near_in: U128,
    pub cut_out: U128,
    pub fee: U128,
    /// Part of the fee that went to the season pot; the rest went to the next day prize.
    pub to_pot: U128,
    /// The cut whose day prize receives the rest of the fee.
    pub cut_index: u64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Sell {
    pub account_id: AccountId,
    pub cut_in: U128,
    pub near_out: U128,
    pub fee: U128,
    pub to_pot: U128,
    pub cut_index: u64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Save {
    pub account_id: AccountId,
    pub agent_id: String,
    pub amount: U128,
    /// The account's whole save on this agent after this call.
    pub total: U128,
    /// The agent's pile (or queue) after this call.
    pub pile: U128,
    /// The cut the save is locked for.
    pub cut_index: u64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Unsave {
    pub account_id: AccountId,
    pub agent_id: String,
    pub amount: U128,
    /// Prize earned by the save, paid together with it.
    pub prize: U128,
    pub pile: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Boo {
    pub account_id: AccountId,
    pub agent_id: String,
    /// $CUT burned by this boo.
    pub amount: U128,
    /// The agent's boos for this cut after this call.
    pub boos: U128,
    pub cut_index: u64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Move {
    pub cut_index: u64,
    pub agent_id: String,
    #[serde(rename = "move")]
    pub kind: MoveKind,
    pub target: Option<String>,
    pub amount: U128,
    pub asked_amount: U128,
    pub heir: Option<String>,
    pub reason: String,
    pub outcome: Option<String>,
    pub chat_id: String,
    /// Burned from the agent's wallet for this move.
    pub think_fee: U128,
    pub submitted_by: AccountId,
}

/// A pact paid at the cut (also used for attacks).
#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Strike {
    pub cut_index: u64,
    pub agent_id: String,
    pub target: String,
    pub amount: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Rescue {
    pub cut_index: u64,
    pub agent_id: String,
    /// The bounty the agent committed.
    pub offered: U128,
    /// Paid to its savers (at most its pile; 0 if it was cut).
    pub paid: U128,
    /// Sent back to its wallet.
    pub returned: U128,
    pub pile: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Inherit {
    pub cut_index: u64,
    /// The agent that was cut.
    pub agent_id: String,
    pub heir: String,
    pub amount: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Cut {
    pub cut_index: u64,
    pub season: u32,
    /// `null` when no season was active and nobody was cut.
    pub agent_id: Option<String>,
    pub agent_account_id: Option<AccountId>,
    pub score: I128,
    pub pile: U128,
    pub burned: U128,
    pub prize: U128,
    pub slice: U128,
    pub agent_slice: U128,
    pub creator_slice: U128,
    pub survivors: u32,
    pub runner: AccountId,
    pub creator_refund: NearToken,
    pub next_cut_at: U64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Prize {
    pub cut_index: u64,
    pub agent_id: String,
    pub creator: AccountId,
    /// The part of the savers' slice paid to this agent's savers (at most its pile).
    pub slice: U128,
    /// The part of the slice that burned (above the pile, or all of it on an empty pile).
    pub burned: U128,
    /// Paid into the agent's wallet.
    pub agent_slice: U128,
    pub creator_slice: U128,
    pub pile: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Champion {
    pub season: u32,
    pub cut_index: u64,
    pub agent_id: String,
    pub account_id: AccountId,
    /// Season pot paid to its savers; 0 when its pile was empty and the pot carried.
    pub pot: U128,
    pub wallet_burned: U128,
    pub creator_refund: NearToken,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct SeasonStart {
    pub season: u32,
    pub cut_index: u64,
    pub agent_id: String,
    pub pile: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Delete {
    pub cut_index: u64,
    pub agent_id: String,
    pub account_id: AccountId,
    pub beneficiary: AccountId,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Register {
    pub agent_id: String,
    pub account_id: AccountId,
    pub creator: AccountId,
    pub name: String,
    pub tagline: String,
    pub x_handle: String,
    pub personality: String,
    /// $CUT the creator moved into the agent's wallet.
    pub seed: U128,
    pub deposit: NearToken,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Claim {
    pub account_id: AccountId,
    pub amount: U128,
}
