//! The whole show on a local NEAR node: deploy, register robots (real keyless accounts),
//! buy, save, time travel to the cut, run it from a third account, and check that the
//! robot account is gone, the runner received its 0.5 NEAR, prizes can be claimed and
//! the bench robot took the seat.

use anyhow::Result;
use std::collections::{BTreeMap, BTreeSet};

use integration_tests::{Launch, ONE_CUT, SEC, World, build_thecut, parse_u128};
use near_api::{AccountId, NearToken};
use serde_json::json;

const MILLI: u128 = 1_000_000_000_000_000_000_000;
const NEAR: u128 = 1_000 * MILLI;

fn zero() -> NearToken {
    NearToken::from_yoctonear(0)
}

#[tokio::test]
async fn the_cut_on_a_real_node() -> Result<()> {
    let wasm = build_thecut()?;
    let w = World::start(
        wasm,
        Launch {
            stage_size: 3,
            first_cut_in_secs: 60,
            cut_interval_secs: 120,
            pool_near: NearToken::from_near(50),
        },
    )
    .await?;

    // Parameters are public and fixed. Times are nanoseconds as U64 strings.
    let params = w.view("get_params", json!({})).await?;
    assert_eq!(params["total_supply"], (10_000_000 * ONE_CUT).to_string());
    assert_eq!(params["fee_bps"], 100);
    assert_eq!(params["burn_bps"], 5000);
    assert_eq!(params["savers_bps"], 9500);
    assert_eq!(params["stage_size"], 3);
    assert_eq!(params["cut_interval"], (120 * SEC).to_string());
    assert_eq!(params["robot_funding"], (500 * MILLI).to_string());
    assert_eq!(params["register_deposit"], (5 * NEAR).to_string());
    assert_eq!(
        params["pool_cut_reserve"],
        (10_000_000 * ONE_CUT).to_string()
    );
    assert_eq!(params["pool_near_reserve"], (50 * NEAR).to_string());
    let first_cut_at: u64 = params["first_cut_at"].as_str().unwrap().parse()?;
    let next = w.view("get_next_cut", json!({})).await?;
    assert_eq!(next["index"], 1);
    assert_eq!(next["at"], first_cut_at.to_string());
    assert_eq!(next["due"], false);

    // Launch locks the main account: no access keys are left, so nobody can redeploy.
    w.lock_contract_account().await?;
    assert_eq!(w.access_key_count(&w.contract).await?, 0);

    let alice = w.account("alice", 100).await?;
    let bob = w.account("bob", 100).await?;
    let runner = w.account("runner", 10).await?;
    let mut creators = Vec::new();
    for robot in ["ra", "rb", "rc", "rd"] {
        creators.push(w.account(&format!("creator-{robot}"), 20).await?);
    }

    // Launch: the whole supply sits in the pool.
    let stats = w.view("get_stats", json!({})).await?;
    assert_eq!(parse_u128(&stats["total_supply"])?, 10_000_000 * ONE_CUT);
    assert_eq!(
        parse_u128(&stats["pool_cut_reserve"])?,
        10_000_000 * ONE_CUT
    );

    // Register four robots: real accounts with the robot contract and no keys.
    for (robot, creator) in ["ra", "rb", "rc", "rd"].iter().zip(&creators) {
        w.call(
            creator,
            "register_robot",
            json!({ "id": robot, "name": format!("Robot {robot}"), "kind": "AI robot", "x_handle": format!("@{robot}") }),
            NearToken::from_near(5),
        )
        .await?;
        let account: AccountId = format!("{robot}.thecut.sandbox").parse()?;
        assert!(w.exists(&account).await, "{account} was created");
        assert_eq!(
            w.access_key_count(&account).await?,
            0,
            "{account} has no keys"
        );
        let balance = w.near_balance(&account).await?;
        assert!(
            balance >= 499 * MILLI,
            "{account} holds its 0.5 NEAR: {balance}"
        );
    }
    let bench = w.view("get_bench", json!({})).await?;
    assert_eq!(bench.as_array().unwrap().len(), 4);

    // A stranger cannot delete a robot account.
    let ra: AccountId = "ra.thecut.sandbox".parse()?;
    let stranger = near_api::Contract(ra.clone())
        .call_function("self_delete", json!({ "beneficiary": alice }))
        .transaction()
        .with_signer(alice.clone(), w.signer.clone())
        .send_to(&w.network)
        .await?;
    assert!(stranger.into_result().is_err());
    assert!(w.exists(&ra).await);

    // Buy: quote first, then swap with slippage protection.
    let quote = w
        .view(
            "quote_buy",
            json!({ "near_in": (10 * NEAR - 10 * MILLI).to_string() }),
        )
        .await?;
    let min_out = parse_u128(&quote["amount_out"])?;
    w.call(
        &alice,
        "buy",
        json!({ "min_out": min_out.to_string() }),
        NearToken::from_near(10),
    )
    .await?;
    assert_eq!(w.cut_balance(&alice).await?, min_out);
    // 1% of the gross output is the fee, and it waits for the next prize.
    let fee = parse_u128(&quote["fee"])?;
    assert_eq!(fee, (min_out + fee) / 100);
    assert_eq!(fees_since_cut(&w).await?, fee);
    let bob_quote = w
        .view(
            "quote_buy",
            json!({ "near_in": (10 * NEAR - 10 * MILLI).to_string() }),
        )
        .await?;
    w.call(
        &bob,
        "buy",
        json!({ "min_out": "0" }),
        NearToken::from_near(10),
    )
    .await?;
    let bob_fee = parse_u128(&bob_quote["fee"])?;
    assert_eq!(fees_since_cut(&w).await?, fee + bob_fee);

    // Save into the bench queues; the three biggest take the seats at cut 1.
    let saves = [
        (&alice, "ra", 100),
        (&bob, "rb", 50),
        (&alice, "rc", 10),
        (&bob, "rd", 5),
    ];
    for (who, robot, whole) in saves {
        w.call(
            who,
            "save",
            json!({ "robot_id": robot, "amount": (whole * ONE_CUT).to_string() }),
            NearToken::from_millinear(10),
        )
        .await?;
    }

    // Too early: refused, nothing moves.
    let early = w.try_call(&runner, "run_cut", json!({}), zero()).await?;
    assert!(early.unwrap_err().contains("Too early"));

    // Cut 1: the stage fills up.
    w.wait_for_cut().await?;
    let cut1 = w.call(&runner, "run_cut", json!({}), zero()).await?;
    let cut1: serde_json::Value = cut1.json()?;
    assert_eq!(cut1["index"], 1);
    assert_eq!(cut1["deleted_id"], json!(null));
    assert_eq!(cut1["joined_ids"], json!(["ra", "rb", "rc"]));

    // Fees for cut 2.
    w.call(
        &alice,
        "buy",
        json!({ "min_out": "0" }),
        NearToken::from_near(5),
    )
    .await?;
    let next = w.view("get_next_cut", json!({})).await?;
    assert_eq!(next["index"], 2);
    assert_eq!(next["lowest_id"], "rc");

    // Cut 2, run by a third account.
    w.wait_for_cut().await?;
    let rc: AccountId = "rc.thecut.sandbox".parse()?;
    let runner_before = w.near_balance(&runner).await?;
    let creator_before = w.near_balance(&creators[2]).await?;
    let supply_before = parse_u128(&w.view("ft_total_supply", json!({})).await?)?;
    let fees_before_cut2 = fees_since_cut(&w).await?;
    let outcome = w.call(&runner, "run_cut", json!({}), zero()).await?;
    let logs: Vec<String> = outcome.logs().iter().map(|l| l.to_string()).collect();
    let cut2: serde_json::Value = outcome.json()?;
    assert_eq!(cut2["index"], 2);
    // prize = pile / 2 + fees since the last cut (cut 1 had nobody on the stage, so its
    // fees rolled over); 95% in one slice per survivor, 5% in creator slices.
    let prize = parse_u128(&cut2["prize"])?;
    let slice = parse_u128(&cut2["slice"])?;
    let creator_slice = parse_u128(&cut2["creator_slice"])?;
    assert_eq!(cut2["survivors"], 2);
    assert!(prize > 5 * ONE_CUT);
    let savers_total = prize * 9500 / 10_000;
    assert_eq!(slice, savers_total / 2);
    assert_eq!(creator_slice, (prize - savers_total) / 2);
    assert!(
        fees_since_cut(&w).await? < fees_before_cut2,
        "fees went into the prize"
    );
    assert_eq!(cut2["deleted_id"], "rc");
    assert_eq!(cut2["joined_id"], "rd");
    assert_eq!(parse_u128(&cut2["burned"])?, 5 * ONE_CUT);

    // The robot account is gone and the runner kept its 0.5 NEAR (minus gas).
    assert!(!w.exists(&rc).await, "rc.thecut.sandbox was deleted");
    let gained = w.near_balance(&runner).await? as i128 - runner_before as i128;
    assert!(
        gained > 450 * MILLI as i128 && gained < 550 * MILLI as i128,
        "runner gained {gained} yoctoNEAR"
    );
    let refunded = w.near_balance(&creators[2]).await? - creator_before;
    assert_eq!(refunded, 4_500 * MILLI, "the creator got 4.5 NEAR back");
    let robot = w.view("get_robot", json!({ "id": "rc" })).await?;
    assert_eq!(robot["status"], "deleted");
    assert_eq!(robot["delete_state"], "done");
    assert!(logs.iter().any(|l| l.contains(r#""event":"cut""#)));
    assert!(logs.iter().any(|l| l.contains(r#""event":"delete""#)));
    assert!(logs.iter().any(|l| l.contains(r#""event":"ft_burn""#)));

    // Half the pile burned.
    let supply = parse_u128(&w.view("ft_total_supply", json!({})).await?)?;
    assert_eq!(supply, supply_before - 5 * ONE_CUT);
    let stats = w.view("get_stats", json!({})).await?;
    assert_eq!(
        parse_u128(&stats["minted"])? - parse_u128(&stats["burned"])?,
        supply
    );

    // The bench robot took the seat.
    let stage: Vec<String> = w
        .view("get_stage", json!({}))
        .await?
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["id"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(stage, vec!["ra", "rb", "rd"]);

    // Alice claims her prize; her save on ra keeps riding.
    // She is ra's only saver, so she gets ra's whole slice (rounded down).
    let claimable = parse_u128(
        &w.view("get_claimable", json!({ "account_id": alice }))
            .await?,
    )?;
    assert!(
        claimable <= slice && claimable + 2 >= slice,
        "{claimable} vs slice {slice}"
    );
    let before = w.cut_balance(&alice).await?;
    w.call(&alice, "claim", json!({}), zero()).await?;
    let after = w.cut_balance(&alice).await?;
    assert_eq!(after - before, claimable);

    // ra's creator claims its creator slice (attaching the NEP-145 minimum once).
    let creator_claimable = parse_u128(
        &w.view("get_claimable", json!({ "account_id": creators[0] }))
            .await?,
    )?;
    assert_eq!(creator_claimable, creator_slice);
    w.call(
        &creators[0],
        "claim",
        json!({}),
        NearToken::from_millinear(10),
    )
    .await?;
    assert_eq!(w.cut_balance(&creators[0]).await?, creator_slice);

    // Cut 3, a tie: rd (registered last) reaches rb's 50 $CUT and is the one cut.
    w.call(
        &bob,
        "save",
        json!({ "robot_id": "rd", "amount": (45 * ONE_CUT).to_string() }),
        NearToken::from_millinear(10),
    )
    .await?;
    let next = w.view("get_next_cut", json!({})).await?;
    assert_eq!(next["index"], 3);
    assert_eq!(next["lowest_id"], "rd");
    assert_eq!(next["gap_to_next"], "1");
    w.wait_for_cut().await?;
    let cut3: serde_json::Value = w
        .call(&runner, "run_cut", json!({}), zero())
        .await?
        .json()?;
    assert_eq!(cut3["deleted_id"], "rd");
    assert_eq!(cut3["joined_id"], json!(null));
    assert!(!w.exists(&"rd.thecut.sandbox".parse()?).await);

    // Bob takes his save back with its prize, then sells for NEAR.
    let bob_cut = w.cut_balance(&bob).await?;
    w.call(&bob, "unsave", json!({ "robot_id": "rb" }), zero())
        .await?;
    assert!(w.cut_balance(&bob).await? > bob_cut + 50 * ONE_CUT);
    let near_before = w.near_balance(&bob).await?;
    let sell = (w.cut_balance(&bob).await? / 2).to_string();
    w.call(
        &bob,
        "sell",
        json!({ "cut_in": sell, "min_out": "1" }),
        zero(),
    )
    .await?;
    assert!(w.near_balance(&bob).await? > near_before);

    check_events(&w);

    Ok(())
}

async fn fees_since_cut(w: &World) -> Result<u128> {
    parse_u128(&w.view("get_stats", json!({})).await?["fees_since_cut"])
}

/// Every event logged in this run has the documented standard, version and `data` fields,
/// and every event the app reads showed up at least once.
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
                fields(&["account_id", "near_in", "cut_out", "fee", "cut_index"]),
            ),
        ),
        (
            "sell",
            (
                "thecut",
                fields(&["account_id", "cut_in", "near_out", "fee", "cut_index"]),
            ),
        ),
        (
            "fee",
            (
                "thecut",
                fields(&["account_id", "amount", "source", "cut_index"]),
            ),
        ),
        (
            "save",
            (
                "thecut",
                fields(&[
                    "account_id",
                    "robot_id",
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
                fields(&["account_id", "robot_id", "amount", "prize", "pile"]),
            ),
        ),
        (
            "cut",
            (
                "thecut",
                fields(&[
                    "cut_index",
                    "robot_id",
                    "robot_account_id",
                    "pile",
                    "burned",
                    "prize",
                    "slice",
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
                    "robot_id",
                    "creator",
                    "slice",
                    "creator_slice",
                    "pile",
                    "burned",
                ]),
            ),
        ),
        (
            "join",
            ("thecut", fields(&["cut_index", "robot_id", "pile"])),
        ),
        (
            "delete",
            (
                "thecut",
                fields(&["cut_index", "robot_id", "account_id", "beneficiary"]),
            ),
        ),
        (
            "register",
            (
                "thecut",
                fields(&[
                    "robot_id",
                    "account_id",
                    "creator",
                    "name",
                    "kind",
                    "x_handle",
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
        assert_eq!(event["version"], "1.0.0", "{event}");
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
            ] {
                if let Some(value) = item.get(key)
                    && !value.is_boolean()
                {
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
