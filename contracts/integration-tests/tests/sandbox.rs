//! A whole season on a local NEAR node: launch, register ten agents with seeds (real keyless
//! accounts whose $CUT balance is the agent's wallet), start a season, relay signed moves
//! every day, run the cuts down to a champion, and check that the cut accounts are gone, the
//! champion's account stays, the books hold and every event matches the interface.
//!
//! Prints the gas of the heaviest `submit_move` (a ~32 KB pretty-printed response with
//! reasoning) and of `run_cut` with ten moves in, and the contract's storage. Run with
//! `cargo test -p integration-tests -- --nocapture` to see them.

use anyhow::Result;
use std::collections::{BTreeMap, BTreeSet};

use integration_tests::{
    Launch, MODEL_ID, ONE_CUT, SEC, World, build_thecut, hex, model_key, parse_u128, sign,
};
use near_api::{AccountId, NearToken};
use serde_json::{Value, json};

const MILLI: u128 = 1_000_000_000_000_000_000_000;
const TGAS: u64 = 1_000_000_000_000;
const PERSONALITIES: [&str; 4] = ["miser", "gambler", "traitor", "generous"];

fn zero() -> NearToken {
    NearToken::from_yoctonear(0)
}

/// A chat completion body as NEAR AI Cloud returns it: pretty-printed, with the model's
/// reasoning, padded to about `size` bytes.
fn completion(chat_id: &str, content: &str, size: usize) -> String {
    let body = |reasoning: &str| {
        serde_json::to_string_pretty(&json!({
            "id": chat_id,
            "object": "chat.completion",
            "created": 1_794_700_000,
            "model": MODEL_ID,
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": content,
                    "reasoning_content": reasoning,
                },
                "finish_reason": "stop"
            }],
            "usage": { "prompt_tokens": 2100, "completion_tokens": 900, "total_tokens": 3000 }
        }))
        .unwrap()
    };
    let bare = body("Thinking.");
    let pad = size.saturating_sub(bare.len());
    body(&format!(
        "Thinking.{}",
        " Let me weigh the board.".repeat(pad / 24)
    ))
}

/// The move for the agent at `rank` on a stage sorted by pile: rescues, attacks on the last
/// agent, pacts with the leader and holds, everyone naming the leader as heir. The stage
/// keeps the order agent9, agent8, ..., so ranks 1 and 5 are misers, which may attack.
fn content_for(rank: usize, stage: &[String]) -> String {
    let me = &stage[rank];
    let leader = &stage[0];
    let last = &stage[stage.len() - 1];
    let heir = if me == leader { &stage[1] } else { leader };
    let (kind, target, amount) = match rank % 4 {
        0 => ("rescue", None, "50"),
        1 if me != last => ("attack", Some(last), "30"),
        2 => ("pact", Some(leader), "20"),
        _ => ("hold", None, "0"),
    };
    json!({
        "move": kind,
        "target": target,
        "amount": amount,
        "heir": heir,
        "reason": format!("{me} plays {kind} to stay alive."),
    })
    .to_string()
}

#[tokio::test]
async fn a_season_on_a_real_node() -> Result<()> {
    let wasm = build_thecut()?;
    let w = World::start(
        wasm,
        Launch {
            stage_size: 10,
            min_season: 3,
            first_cut_in_secs: 60,
            cut_interval_secs: 600,
            move_lead_secs: 60,
            pool_near: NearToken::from_near(50),
        },
    )
    .await?;
    let storage_at_launch = w.storage_usage(&w.contract).await?;

    // Parameters are public and fixed. Times are nanoseconds as U64 strings.
    let params = w.view("get_params", json!({})).await?;
    assert_eq!(params["total_supply"], (10_000_000 * ONE_CUT).to_string());
    assert_eq!(
        (params["pot_bps"].clone(), params["agents_bps"].clone()),
        (json!(5000), json!(500))
    );
    assert_eq!(params["model_id"], MODEL_ID);
    assert_eq!(
        params["model_signers"],
        json!([hex(model_key().verifying_key().as_bytes())])
    );
    assert_eq!(params["max_tokens"], 1200);
    assert_eq!(params["reasoning_effort"], "low");
    assert_eq!(params["move_lead"], (60 * SEC).to_string());
    assert_eq!(params["agent_funding"], (300 * MILLI).to_string());
    let personalities = w.view("get_personalities", json!({})).await?;
    assert_eq!(personalities.as_array().unwrap().len(), 4);

    // Launch locks the main account: no access keys are left, so nobody can redeploy.
    w.lock_contract_account().await?;
    assert_eq!(w.access_key_count(&w.contract).await?, 0);

    let fan = w.account("fan", 100).await?;
    let runner = w.account("runner", 10).await?;
    let relay = w.account("relay", 10).await?;
    let ids: Vec<String> = (0..10).map(|i| format!("agent{i}")).collect();

    // Ten agents: real keyless accounts holding their creators' seeds as $CUT.
    let mut creators = Vec::new();
    for (i, agent) in ids.iter().enumerate() {
        let creator = w.account(&format!("creator{i}"), 10).await?;
        w.call(
            &creator,
            "buy",
            json!({ "min_out": "0" }),
            NearToken::from_near(1),
        )
        .await?;
        w.call(
            &creator,
            "register_agent",
            json!({
                "id": agent,
                "name": format!("Agent {i}"),
                "tagline": "Built to last",
                "x_handle": format!("@agent{i}"),
                "personality": PERSONALITIES[i % 4],
                "charter": format!("I am agent {i}.\nI protect my fans."),
                "seed": (1_000 * ONE_CUT).to_string(),
            }),
            NearToken::from_near(1),
        )
        .await?;
        let account: AccountId = format!("{agent}.thecut.sandbox").parse()?;
        assert!(w.exists(&account).await, "{account} was created");
        assert_eq!(
            w.access_key_count(&account).await?,
            0,
            "{account} has no keys"
        );
        assert_eq!(
            w.cut_balance(&account).await?,
            1_000 * ONE_CUT,
            "the seed is its wallet"
        );
        assert!(w.near_balance(&account).await? >= 299 * MILLI);
        creators.push(creator);
    }
    assert_eq!(
        w.view("get_bench", json!({}))
            .await?
            .as_array()
            .unwrap()
            .len(),
        10
    );

    // A stranger cannot delete an agent account.
    let first: AccountId = "agent0.thecut.sandbox".parse()?;
    let stranger = near_api::Contract(first.clone())
        .call_function("self_delete", json!({ "beneficiary": fan }))
        .transaction()
        .with_signer(fan.clone(), w.signer.clone())
        .send_to(&w.network)
        .await?;
    assert!(stranger.into_result().is_err());

    // Fans fill the queues: agent9 gets the biggest.
    w.call(
        &fan,
        "buy",
        json!({ "min_out": "0" }),
        NearToken::from_near(20),
    )
    .await?;
    for (i, agent) in ids.iter().enumerate() {
        w.call(
            &fan,
            "save",
            json!({ "agent_id": agent, "amount": ((i as u128 + 1) * 100 * ONE_CUT).to_string() }),
            NearToken::from_millinear(10),
        )
        .await?;
    }
    let season = w.view("get_season", json!({})).await?;
    assert_eq!(
        (season["active"].clone(), season["next_start_needs"].clone()),
        (json!(false), json!(0))
    );
    let early = w.try_call(&runner, "run_cut", json!({}), zero()).await?;
    assert!(early.unwrap_err().contains("Too early"));

    // Cut 1 starts season 1 with all ten.
    w.wait_for_cut().await?;
    let start: Value = w
        .call(&runner, "run_cut", json!({}), zero())
        .await?
        .json()?;
    assert_eq!(start["seated_ids"].as_array().unwrap().len(), 10);
    assert_eq!(start["seated_ids"][0], "agent9");
    let season = w.view("get_season", json!({})).await?;
    assert_eq!(
        (
            season["index"].clone(),
            season["active"].clone(),
            season["alive"].clone()
        ),
        (json!(1), json!(true), json!(10))
    );

    let mut max_submit_gas = 0u64;
    let mut first_cut_gas = None;
    let mut max_cut_gas = 0u64;
    let mut cut_accounts = Vec::new();
    let mut day = 0;
    loop {
        day += 1;
        let stage: Vec<String> = w
            .view("get_stage", json!({}))
            .await?
            .as_array()
            .unwrap()
            .iter()
            .map(|a| a["id"].as_str().unwrap().to_string())
            .collect();
        // Every agent on the stage moves; on day 1 the first answer is ~32 KB.
        for (rank, agent) in stage.iter().enumerate() {
            let request = w
                .view("get_move_request", json!({ "agent_id": agent }))
                .await?;
            let request = request
                .as_str()
                .expect("a request while moves are open")
                .to_string();
            let size = if day == 1 && rank == 0 { 32_000 } else { 1_500 };
            let response = completion(
                &format!("chatcmpl-{day}-{agent}"),
                &content_for(rank, &stage),
                size,
            );
            assert!(response.len() <= 32 * 1024);
            let signature = sign(&request, &response);
            let outcome = w
                .call(
                    &relay,
                    "submit_move",
                    json!({
                        "agent_id": agent,
                        "response": response,
                        "signature": signature,
                        "signer": hex(model_key().verifying_key().as_bytes()),
                    }),
                    zero(),
                )
                .await?;
            let gas = outcome.total_gas_burnt.as_gas();
            if size > 30_000 {
                println!(
                    "submit_move with a {} byte response: {:.1} TGas",
                    response.len(),
                    gas as f64 / TGAS as f64
                );
            }
            max_submit_gas = max_submit_gas.max(gas);
            let agent_view = w.view("get_agent", json!({ "id": agent })).await?;
            assert_eq!(agent_view["moved"], true);
            assert_eq!(
                w.view("get_move_request", json!({ "agent_id": agent }))
                    .await?,
                Value::Null
            );
        }
        let next = w.view("get_next_cut", json!({})).await?;
        let moves = w
            .view("get_moves", json!({ "cut_index": next["index"] }))
            .await?;
        assert_eq!(moves.as_array().unwrap().len(), stage.len());
        if day == 1 {
            // Fans boo the leader a little.
            w.call(
                &fan,
                "boo",
                json!({ "agent_id": stage[0], "amount": (5 * ONE_CUT).to_string() }),
                zero(),
            )
            .await?;
        }

        w.wait_for_cut().await?;
        let runner_before = w.near_balance(&runner).await?;
        let outcome = w.call(&runner, "run_cut", json!({}), zero()).await?;
        let gas = outcome.total_gas_burnt.as_gas();
        let main_receipt = outcome.receipt_outcomes()[0].gas_burnt.as_gas();
        if first_cut_gas.is_none() {
            first_cut_gas = Some((gas, main_receipt));
        }
        max_cut_gas = max_cut_gas.max(gas);
        let record: Value = outcome.json()?;
        let deleted = record["deleted_id"]
            .as_str()
            .expect("a cut agent")
            .to_string();
        let account: AccountId = format!("{deleted}.thecut.sandbox").parse()?;
        assert!(!w.exists(&account).await, "{account} was deleted");
        let gained = w.near_balance(&runner).await? as i128 - runner_before as i128;
        assert!(
            gained > 250 * MILLI as i128,
            "the runner kept the agent's funding: {gained}"
        );
        let agent = w.view("get_agent", json!({ "id": deleted })).await?;
        assert_eq!(
            (agent["status"].clone(), agent["delete_state"].clone()),
            (json!("deleted"), json!("done"))
        );
        cut_accounts.push(account);
        if record["champion_id"].is_string() {
            break;
        }
        let brief: Value =
            serde_json::from_str(w.view("get_brief", json!({})).await?.as_str().unwrap())?;
        assert_eq!(brief["last_cut"]["deleted"], deleted);
    }
    assert_eq!(day, 9, "ten agents: nine cuts to a champion");

    // The champion: crowned, its account kept, its wallet burned.
    let season = w.view("get_season", json!({})).await?;
    assert_eq!(season["active"], false);
    let champion = season["champion"].as_str().unwrap().to_string();
    let champion_account: AccountId = format!("{champion}.thecut.sandbox").parse()?;
    assert!(
        w.exists(&champion_account).await,
        "the champion's account stays"
    );
    assert_eq!(w.access_key_count(&champion_account).await?, 0);
    assert_eq!(w.cut_balance(&champion_account).await?, 0);
    let agent = w.view("get_agent", json!({ "id": champion })).await?;
    assert_eq!(agent["status"], "champion");
    let champions = w.view("get_champions", json!({})).await?;
    assert_eq!(champions.as_array().unwrap().len(), 1);
    assert_eq!(champions[0]["agent_id"], champion);
    for account in &cut_accounts {
        assert!(!w.exists(account).await, "{account} stays deleted");
    }

    // The fan collects its prizes, takes its save back from the champion and sells.
    let claimable = parse_u128(
        &w.view("get_claimable", json!({ "account_id": fan }))
            .await?,
    )?;
    assert!(claimable > 0);
    w.call(&fan, "claim", json!({}), zero()).await?;
    w.call(&fan, "unsave", json!({ "agent_id": champion }), zero())
        .await?;
    let held = w.cut_balance(&fan).await?;
    w.call(
        &fan,
        "sell",
        json!({ "cut_in": (held / 2).to_string(), "min_out": "1" }),
        zero(),
    )
    .await?;

    // The books.
    let stats = w.view("get_stats", json!({})).await?;
    let n = |key: &str| parse_u128(&stats[key]).unwrap();
    assert_eq!(
        n("contract_balance"),
        n("pool_cut_reserve")
            + n("total_saved")
            + n("fees_since_cut")
            + n("season_pot")
            + n("committed")
            + n("prizes_outstanding")
    );
    assert_eq!(n("minted") - n("burned"), n("total_supply"));
    assert_eq!(n("committed"), 0);
    assert!(n("burned") > 0);

    check_events(&w);

    let storage_at_end = w.storage_usage(&w.contract).await?;
    let (cut_gas, cut_receipt) = first_cut_gas.unwrap();
    println!(
        "submit_move, heaviest: {:.1} TGas",
        max_submit_gas as f64 / TGAS as f64
    );
    println!(
        "run_cut with ten moves in: {:.1} TGas in all receipts, {:.1} TGas in run_cut itself",
        cut_gas as f64 / TGAS as f64,
        cut_receipt as f64 / TGAS as f64
    );
    println!(
        "run_cut, heaviest: {:.1} TGas",
        max_cut_gas as f64 / TGAS as f64
    );
    println!(
        "contract storage: {storage_at_launch} bytes at launch, {storage_at_end} bytes after one season"
    );
    assert!(max_submit_gas < 100 * TGAS);
    assert!(cut_gas < 150 * TGAS);
    Ok(())
}

/// Every event logged in this run has the documented standard, version and `data` fields,
/// and every event of the interface showed up at least once.
fn check_events(w: &World) {
    let fields = |names: &[&str]| names.iter().map(|n| n.to_string()).collect::<BTreeSet<_>>();
    let expected: BTreeMap<&str, (&str, BTreeSet<String>)> = BTreeMap::from([
        (
            "ft_mint",
            ("nep141", fields(&["owner_id", "amount", "memo"])),
        ),
        (
            "ft_burn",
            ("nep141", fields(&["owner_id", "amount", "memo"])),
        ),
        (
            "ft_transfer",
            (
                "nep141",
                fields(&["old_owner_id", "new_owner_id", "amount", "memo"]),
            ),
        ),
        (
            "buy",
            (
                "thecut",
                fields(&[
                    "account_id",
                    "near_in",
                    "cut_out",
                    "fee",
                    "to_pot",
                    "cut_index",
                ]),
            ),
        ),
        (
            "sell",
            (
                "thecut",
                fields(&[
                    "account_id",
                    "cut_in",
                    "near_out",
                    "fee",
                    "to_pot",
                    "cut_index",
                ]),
            ),
        ),
        (
            "save",
            (
                "thecut",
                fields(&[
                    "account_id",
                    "agent_id",
                    "amount",
                    "total",
                    "pile",
                    "cut_index",
                ]),
            ),
        ),
        (
            "unsave",
            (
                "thecut",
                fields(&["account_id", "agent_id", "amount", "prize", "pile"]),
            ),
        ),
        (
            "boo",
            (
                "thecut",
                fields(&["account_id", "agent_id", "amount", "boos", "cut_index"]),
            ),
        ),
        (
            "move",
            (
                "thecut",
                fields(&[
                    "cut_index",
                    "agent_id",
                    "move",
                    "target",
                    "amount",
                    "asked_amount",
                    "heir",
                    "reason",
                    "outcome",
                    "chat_id",
                    "think_fee",
                    "submitted_by",
                ]),
            ),
        ),
        (
            "pact",
            (
                "thecut",
                fields(&["cut_index", "agent_id", "target", "amount"]),
            ),
        ),
        (
            "attack",
            (
                "thecut",
                fields(&["cut_index", "agent_id", "target", "amount"]),
            ),
        ),
        (
            "rescue",
            (
                "thecut",
                fields(&[
                    "cut_index",
                    "agent_id",
                    "offered",
                    "paid",
                    "returned",
                    "pile",
                ]),
            ),
        ),
        (
            "inherit",
            (
                "thecut",
                fields(&["cut_index", "agent_id", "heir", "amount"]),
            ),
        ),
        (
            "cut",
            (
                "thecut",
                fields(&[
                    "cut_index",
                    "season",
                    "agent_id",
                    "agent_account_id",
                    "score",
                    "pile",
                    "burned",
                    "prize",
                    "slice",
                    "agent_slice",
                    "creator_slice",
                    "survivors",
                    "runner",
                    "creator_refund",
                    "next_cut_at",
                ]),
            ),
        ),
        (
            "prize",
            (
                "thecut",
                fields(&[
                    "cut_index",
                    "agent_id",
                    "creator",
                    "slice",
                    "burned",
                    "agent_slice",
                    "creator_slice",
                    "pile",
                ]),
            ),
        ),
        (
            "champion",
            (
                "thecut",
                fields(&[
                    "season",
                    "cut_index",
                    "agent_id",
                    "account_id",
                    "pot",
                    "wallet_burned",
                    "creator_refund",
                ]),
            ),
        ),
        (
            "season_start",
            (
                "thecut",
                fields(&["season", "cut_index", "agent_id", "pile"]),
            ),
        ),
        (
            "delete",
            (
                "thecut",
                fields(&["cut_index", "agent_id", "account_id", "beneficiary"]),
            ),
        ),
        (
            "register",
            (
                "thecut",
                fields(&[
                    "agent_id",
                    "account_id",
                    "creator",
                    "name",
                    "tagline",
                    "x_handle",
                    "personality",
                    "seed",
                    "deposit",
                ]),
            ),
        ),
        ("claim", ("thecut", fields(&["account_id", "amount"]))),
    ]);

    let events = w.events();
    let mut seen = BTreeSet::new();
    for event in &events {
        let name = event["event"].as_str().expect("event name");
        let (standard, keys) = expected
            .get(name)
            .unwrap_or_else(|| panic!("undocumented event {event}"));
        assert_eq!(event["standard"], *standard, "{event}");
        if *standard == "thecut" {
            assert_eq!(event["version"], "2.0.0", "{event}");
        }
        let data = event["data"].as_array().expect("data is an array");
        assert!(!data.is_empty(), "{event}");
        for item in data {
            let item_keys: BTreeSet<String> = item
                .as_object()
                .expect("data item is an object")
                .keys()
                .filter(|k| *k != "memo")
                .cloned()
                .collect();
            // NEP-141 makes `memo` optional.
            let mut want = keys.clone();
            want.remove("memo");
            assert_eq!(item_keys, want, "{event}");
            // Amounts and times cross the boundary as strings.
            for key in [
                "amount",
                "pile",
                "prize",
                "fee",
                "slice",
                "next_cut_at",
                "deposit",
                "score",
                "seed",
            ] {
                if let Some(value) = item.get(key) {
                    assert!(value.is_string(), "{name}.{key} is a string: {event}");
                }
            }
        }
        seen.insert(name.to_string());
    }
    for name in expected.keys() {
        assert!(seen.contains(*name), "event {name} was never logged");
    }
}
