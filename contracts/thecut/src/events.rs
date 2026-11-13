//! NEP-297 events with `standard: "thecut"`, `version: "1.0.0"`.
//!
//! Each event logs `EVENT_JSON:{"standard","version","event","data":[...]}`, with `data`
//! as an array of items like the NEP-141 events. Amounts are decimal strings.
//! `ft_mint`, `ft_transfer` and `ft_burn` are logged by the NEP-141 implementation.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde::Serialize;
use near_sdk::serde_json::{self, json};
use near_sdk::{AccountId, NearToken, env};

pub const STANDARD: &str = "thecut";
pub const VERSION: &str = "1.0.0";

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

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Buy {
    pub account_id: AccountId,
    pub near_in: U128,
    pub cut_out: U128,
    pub fee: U128,
    /// The cut whose prize receives the fee.
    pub cut_index: u64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Sell {
    pub account_id: AccountId,
    pub cut_in: U128,
    pub near_out: U128,
    pub fee: U128,
    pub cut_index: u64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Fee {
    pub account_id: AccountId,
    pub amount: U128,
    /// `"buy"` or `"sell"`.
    pub source: &'static str,
    pub cut_index: u64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Save {
    pub account_id: AccountId,
    pub robot_id: String,
    pub amount: U128,
    /// The account's whole save on this robot after this call.
    pub total: U128,
    /// The robot's pile (or queue) after this call.
    pub pile: U128,
    /// The cut the save is locked for.
    pub cut_index: u64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Unsave {
    pub account_id: AccountId,
    pub robot_id: String,
    pub amount: U128,
    /// Prize earned by the save, paid together with it.
    pub prize: U128,
    pub pile: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Cut {
    pub cut_index: u64,
    /// `null` when the stage was not full and nobody was cut.
    pub robot_id: Option<String>,
    pub robot_account_id: Option<AccountId>,
    pub pile: U128,
    pub burned: U128,
    pub prize: U128,
    pub slice: U128,
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
    pub robot_id: String,
    pub creator: AccountId,
    /// The savers' slice this robot received (or burned).
    pub slice: U128,
    pub creator_slice: U128,
    pub pile: U128,
    /// True when the pile was empty and the slice burned.
    pub burned: bool,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Join {
    pub cut_index: u64,
    pub robot_id: String,
    pub pile: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Delete {
    pub cut_index: u64,
    pub robot_id: String,
    pub account_id: AccountId,
    pub beneficiary: AccountId,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Register {
    pub robot_id: String,
    pub account_id: AccountId,
    pub creator: AccountId,
    pub name: String,
    pub kind: String,
    pub x_handle: String,
    pub deposit: NearToken,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Claim {
    pub account_id: AccountId,
    pub amount: U128,
}
