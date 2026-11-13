//! The Cut robot account.
//!
//! Deployed by `thecut` on `<id>.thecut.near` in the same batch that creates the account,
//! so the account never has an access key. Nobody can sign for it: the only thing it can
//! do is delete itself when its owner (the main contract) asks, at the cut. The deleted
//! account's whole balance (the 0.5 NEAR funding) goes to the beneficiary, which `thecut`
//! sets to whoever ran the cut.
//!
//! Why no `#[near]` macros here: the robot account is funded with 0.5 NEAR, which pays the
//! storage staking for its code (1 NEAR per 100 KB). A macro-based near-sdk build of this
//! contract is about 96 KB (0.96 NEAR of staking), so account creation would fail with
//! `LackBalanceForState`. Using `near_sdk::env` directly keeps the wasm a few KB, so the
//! account fits in its funding and the cut runner receives almost all of the 0.5 NEAR.
//!
//! Interface (JSON arguments, same as a macro-based contract):
//! - `new({ "owner": AccountId })`: init, once.
//! - `self_delete({ "beneficiary": AccountId })`: owner only; deletes this account.
//! - `get_owner()`: view, returns the owner as a JSON string.

use near_sdk::{AccountId, env};

/// Storage key that holds the owner account id.
const OWNER_KEY: &[u8] = b"owner";

/// Extracts the string value of `key` from a flat JSON object such as `{"owner":"a.near"}`.
///
/// Account ids never contain quotes or backslashes, so a value with an escape is rejected
/// instead of being decoded.
pub fn json_string_field<'a>(input: &'a str, key: &str) -> Option<&'a str> {
    let mut rest = input;
    loop {
        let quote = rest.find('"')?;
        rest = &rest[quote + 1..];
        let end = rest.find('"')?;
        let name = &rest[..end];
        rest = &rest[end + 1..];
        let after = rest.trim_start();
        let Some(after_colon) = after.strip_prefix(':') else {
            // This string was a value, not a key: keep scanning.
            continue;
        };
        let value = after_colon.trim_start();
        if name != key {
            rest = value;
            continue;
        }
        let value = value.strip_prefix('"')?;
        let close = value.find('"')?;
        let found = &value[..close];
        if found.contains('\\') {
            return None;
        }
        return Some(found);
    }
}

/// Reads `key` from the JSON call arguments as an account id, or aborts with a clear message.
fn account_arg(key: &str) -> AccountId {
    let input = env::input().unwrap_or_default();
    let text = core::str::from_utf8(&input)
        .unwrap_or_else(|_| env::panic_str("Arguments must be UTF-8 JSON"));
    let value = json_string_field(text, key)
        .unwrap_or_else(|| env::panic_str("Missing account id argument"));
    value
        .parse()
        .unwrap_or_else(|_| env::panic_str("Invalid account id argument"))
}

fn stored_owner() -> AccountId {
    let raw = env::storage_read(OWNER_KEY)
        .unwrap_or_else(|| env::panic_str("Robot is not initialized"));
    let text = String::from_utf8(raw).unwrap_or_else(|_| env::panic_str("Corrupt owner"));
    text.parse()
        .unwrap_or_else(|_| env::panic_str("Corrupt owner"))
}

/// Called once by the main contract in the batch that creates and deploys the account.
pub fn init() {
    if env::storage_has_key(OWNER_KEY) {
        env::panic_str("Robot is already initialized");
    }
    let owner = account_arg("owner");
    env::storage_write(OWNER_KEY, owner.as_bytes());
}

/// Deletes this account and sends its whole balance to `beneficiary`. Owner only.
///
/// The beneficiary must exist or the balance is lost: the main contract always passes the
/// account that ran the cut, which signed a transaction and so exists. The deletion promise
/// is returned so the caller's callback sees whether the deletion itself succeeded.
pub fn delete_self() {
    if env::predecessor_account_id() != stored_owner() {
        env::panic_str("Only the owner can delete this robot");
    }
    let beneficiary = account_arg("beneficiary");
    let promise = env::promise_batch_create(&env::current_account_id());
    env::promise_batch_action_delete_account(promise, &beneficiary);
    env::promise_return(promise);
}

/// Returns the owner as a JSON string.
pub fn owner_json() -> String {
    format!("\"{}\"", stored_owner())
}

#[cfg(target_arch = "wasm32")]
mod exports {
    #[unsafe(no_mangle)]
    pub extern "C" fn new() {
        super::init();
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn self_delete() {
        super::delete_self();
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn get_owner() {
        near_sdk::env::value_return(super::owner_json().as_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts, get_created_receipts};
    use near_sdk::testing_env;

    fn call(predecessor: AccountId, input: &str) {
        let mut context = VMContextBuilder::new()
            .current_account_id("kiko.thecut.near".parse().unwrap())
            .predecessor_account_id(predecessor)
            .build();
        context.input = std::rc::Rc::from(input.as_bytes());
        testing_env!(context);
    }

    #[test]
    fn parses_flat_json() {
        assert_eq!(
            json_string_field(r#"{"owner":"thecut.near"}"#, "owner"),
            Some("thecut.near")
        );
        assert_eq!(
            json_string_field(r#"{ "beneficiary" : "bob.near" }"#, "beneficiary"),
            Some("bob.near")
        );
        assert_eq!(
            json_string_field(r#"{"a":"owner","owner":"x.near"}"#, "owner"),
            Some("x.near")
        );
        assert_eq!(json_string_field(r#"{"owner":"x\"y"}"#, "owner"), None);
        assert_eq!(json_string_field(r#"{"other":"x.near"}"#, "owner"), None);
        assert_eq!(json_string_field("", "owner"), None);
    }

    #[test]
    fn init_stores_owner() {
        call(accounts(0), r#"{"owner":"thecut.near"}"#);
        init();
        assert_eq!(owner_json(), "\"thecut.near\"");
    }

    #[test]
    #[should_panic(expected = "Robot is already initialized")]
    fn init_runs_once() {
        call(accounts(0), r#"{"owner":"thecut.near"}"#);
        init();
        init();
    }

    #[test]
    #[should_panic(expected = "Invalid account id argument")]
    fn init_rejects_bad_owner() {
        call(accounts(0), r#"{"owner":"NOT VALID"}"#);
        init();
    }

    #[test]
    fn owner_can_self_delete() {
        call("thecut.near".parse().unwrap(), r#"{"owner":"thecut.near"}"#);
        init();
        call("thecut.near".parse().unwrap(), r#"{"beneficiary":"runner.near"}"#);
        delete_self();
        let receipts = get_created_receipts();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0].receiver_id.as_str(), "kiko.thecut.near");
    }

    #[test]
    #[should_panic(expected = "Only the owner can delete this robot")]
    fn stranger_cannot_self_delete() {
        call("thecut.near".parse().unwrap(), r#"{"owner":"thecut.near"}"#);
        init();
        call(accounts(1), r#"{"beneficiary":"bob.near"}"#);
        delete_self();
    }
}
