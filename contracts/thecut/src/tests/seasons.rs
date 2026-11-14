//! Seasons: the start, the brief, the champion and the pot, the restart, and the supply
//! over a whole season.

use super::*;
use crate::types::{AgentStatusView, MoveKind};
use near_sdk::serde_json::Value;

fn three() -> World {
    season_with(&[
        ("ana", "gambler", cut(300)),
        ("bob", "miser", cut(200)),
        ("cid", "traitor", cut(100)),
    ])
}

fn brief(w: &mut World) -> Value {
    serde_json::from_str(&w.view(|c| c.get_brief()).expect("a brief")).unwrap()
}

#[test]
fn no_season_starts_until_the_bench_has_min_season_agents() {
    let mut w = World::daily();
    w.register("ana");
    w.register("bob");
    let season = w.view(|c| c.get_season());
    assert_eq!(
        (season.index, season.active, season.next_start_needs),
        (0, false, 1)
    );
    let fees = w.view(|c| c.get_stats().fees_since_cut.0);
    let pot = season.pot.0;
    assert!(
        pot > 0,
        "half of every fee goes to the pot even between seasons"
    );
    let record = w.run_cut("runner.near");
    assert_eq!((record.deleted_id, record.season, record.day), (None, 0, 0));
    assert!(record.seated_ids.is_empty());
    assert!(get_created_receipts().is_empty());
    assert_eq!(
        w.view(|c| c.get_stats().fees_since_cut.0),
        fees,
        "the fees carry"
    );
    assert_eq!(w.view(|c| c.get_brief()), None);
    assert_eq!(w.bench_ids(), vec!["ana", "bob"]);

    // A third agent: the next cut starts season 1, nobody is cut, the day prize carries.
    w.register("cid");
    w.buy("whale.near", near(1_000));
    w.save("whale.near", "cid", cut(10));
    let fees = w.view(|c| c.get_stats().fees_since_cut.0);
    let record = w.run_cut("runner.near");
    let start = event("season_start").unwrap();
    assert_eq!(record.index, 2);
    assert_eq!((record.season, record.day, record.deleted_id), (1, 0, None));
    assert_eq!(record.seated_ids, vec!["cid", "ana", "bob"]);
    assert_eq!(record.prize.0, 0);
    assert_eq!(w.view(|c| c.get_stats().fees_since_cut.0), fees);
    assert_eq!(start.as_array().unwrap().len(), 3);
    assert_eq!(start[0]["season"], 1);
    assert_eq!(start[0]["agent_id"], "cid");
    assert_eq!(start[0]["pile"], cut(10).to_string());
    let season = w.view(|c| c.get_season());
    assert_eq!(
        (season.index, season.active, season.day, season.alive),
        (1, true, 1, 3)
    );
    assert_eq!(season.champion, None);
    assert_eq!(w.agent("cid").season, Some(1));
    let board = brief(&mut w);
    assert_eq!(
        (board["season"].clone(), board["day"].clone()),
        (json!(1), json!(1))
    );
    assert_eq!(board["cut_index"], 3);
    assert_eq!(board["last_cut"], Value::Null);
    assert_eq!(board["last_moves"], json!([]));
    w.assert_books();
}

#[test]
fn a_season_seats_the_biggest_queues_and_late_agents_wait() {
    let mut w = World::launch(Launch {
        stage_size: 3,
        ..Launch::default()
    });
    for agent in ["q1", "q2", "q3", "q4", "q5"] {
        w.register(agent);
    }
    w.buy("whale.near", near(1_000));
    for (agent, pile) in [("q1", 5), ("q2", 50), ("q3", 20), ("q4", 50), ("q5", 1)] {
        w.save("whale.near", agent, cut(pile));
    }
    let record = w.run_cut("runner.near");
    // Biggest first; on equal queues the older agent.
    assert_eq!(record.seated_ids, vec!["q2", "q4", "q3"]);
    assert_eq!(w.bench_ids(), vec!["q1", "q5"]);
    // A registration during the season waits on the bench.
    w.register("late");
    assert_eq!(w.agent("late").status, AgentStatusView::Bench);
    assert_eq!(w.view(|c| c.get_season().next_start_needs), 0);
    // Queues that did not get in unlock and can come back.
    assert_eq!(
        w.call("whale.near", zero(), |c| c.unsave("q1".into())).0,
        cut(5)
    );
    w.assert_books();
}

#[test]
fn the_brief_is_the_board_of_the_last_cut() {
    let mut w = season_with(&[
        ("kiko", "traitor", cut(400)),
        ("pixie", "gambler", cut(4_100)),
        ("onyx", "miser", cut(300)),
        ("melody", "generous", cut(100)),
    ]);
    w.submit("kiko", &answer("pact", Some("pixie"), "20", Some("onyx")));
    w.submit("melody", &answer("hold", None, "0", Some("kiko")));
    let record = w.run_cut("runner.near");
    assert_eq!(record.deleted_id.as_deref(), Some("melody"));
    let board = brief(&mut w);
    let next = w.view(|c| c.get_next_cut());
    assert_eq!(board["season"], 1);
    assert_eq!(board["day"], 2);
    assert_eq!(board["cut_index"], 3);
    assert_eq!(board["moves_close_at"], next.moves_close_at.0.to_string());
    assert_eq!(board["cut_at"], next.at.0.to_string());
    assert_eq!(board["think_fee"], "10");
    let pot = w.view(|c| c.get_season().pot.0);
    assert_eq!(board["season_pot"], (pot / crate::ONE_CUT).to_string());
    let ids: Vec<&str> = board["agents"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, vec!["pixie", "kiko", "onyx"], "by pile, highest first");
    let kiko = &board["agents"][1];
    assert_eq!(kiko["name"], "Agent kiko");
    assert_eq!(kiko["personality"], "traitor");
    assert_eq!(kiko["pile"], "400");
    let wallet = w.wallet("kiko") / crate::ONE_CUT;
    assert_eq!(kiko["wallet"], wallet.to_string());
    assert_eq!(kiko["pacts"], json!(["pixie"]));
    assert_eq!(kiko["heir"], "onyx");
    assert_eq!(board["agents"][0]["heir"], Value::Null);
    // melody's wallet went to its heir.
    assert_eq!(
        board["last_cut"],
        json!({
            "deleted": "melody",
            "inherited_by": "kiko",
            "burned": (record.burned.0 / crate::ONE_CUT).to_string()
        })
    );
    assert_eq!(
        board["last_moves"],
        json!([
            { "agent": "kiko", "move": "pact", "target": "pixie", "amount": "20", "reason": "I pact." },
            { "agent": "melody", "move": "hold", "target": null, "amount": "0", "reason": "I hold." }
        ])
    );
    // The brief is what the next requests embed.
    let request = w.view(|c| c.get_move_request("kiko".into())).unwrap();
    let request: Value = serde_json::from_str(&request).unwrap();
    let user: Value =
        serde_json::from_str(request["messages"][1]["content"].as_str().unwrap()).unwrap();
    assert_eq!(user["you"], "kiko");
    assert_eq!(user["board"], board);
}

#[test]
fn the_champion_is_crowned_with_the_pot_and_keeps_its_account() {
    let mut w = season_with(&[
        ("ana", "gambler", cut(50_000)),
        ("bob", "miser", cut(200)),
        ("cid", "traitor", cut(100)),
    ]);
    w.submit("ana", &answer("hold", None, "0", None));
    assert_eq!(w.run_cut("runner.near").deleted_id.as_deref(), Some("cid"));
    let pot = w.view(|c| c.get_season().pot.0);
    let whale_before = w.claimable("whale.near");
    let supply = w.supply();
    let a_wallet = w.wallet("ana");

    let record = w.run_cut("runner.near");
    let calls = function_calls();
    let refunds = transfers();
    let champion = event("champion").unwrap();
    assert_eq!(record.deleted_id.as_deref(), Some("bob"));
    assert_eq!(record.champion_id.as_deref(), Some("ana"));
    // A pile bigger than the pot takes all of it.
    assert_eq!(record.pot_paid.0, pot);
    assert_eq!(champion[0]["agent_id"], "ana");
    assert_eq!(champion[0]["season"], 1);
    assert_eq!(champion[0]["pot"], pot.to_string());
    let a_wallet = a_wallet + record.agent_slice.0;
    assert_eq!(champion[0]["wallet_burned"], a_wallet.to_string());
    assert_eq!(
        champion[0]["creator_refund"],
        NearToken::from_millinear(700).as_yoctonear().to_string()
    );
    assert!(burns_contain("champion wallet", a_wallet));
    assert_eq!(w.supply(), supply - record.burned.0);

    // Only the cut agent's account deletes itself; the champion's stays.
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].0.as_str(), "bob.thecut.near");
    assert!(refunds.contains(&(
        creator_of("ana"),
        NearToken::from_millinear(700).as_yoctonear()
    )));
    assert!(refunds.contains(&(
        creator_of("bob"),
        NearToken::from_millinear(700).as_yoctonear()
    )));
    let a = w.agent("ana");
    assert_eq!(a.status, AgentStatusView::Champion);
    assert_eq!(
        (a.cut_index, a.delete_state, a.wallet.0),
        (Some(3), None, 0)
    );

    let season = w.view(|c| c.get_season());
    assert_eq!((season.active, season.alive, season.pot.0), (false, 0, 0));
    assert_eq!(season.champion.as_deref(), Some("ana"));
    assert_eq!(w.view(|c| c.get_brief()), None);
    assert_eq!(w.view(|c| c.get_move_request("ana".into())), None);
    let champions = w.view(|c| c.get_champions(None, None));
    assert_eq!(champions.len(), 1);
    assert_eq!(
        (
            champions[0].season,
            champions[0].agent_id.as_str(),
            champions[0].cut_index
        ),
        (1, "ana", 3)
    );
    assert_eq!(champions[0].pot.0, pot);
    assert_eq!(champions[0].account_id.as_str(), "ana.thecut.near");

    // The whale is the champion's only saver: it gets the pot, and can take its save back.
    assert!(w.claimable("whale.near") >= whale_before + pot - 1);
    let back = w.call("whale.near", zero(), |c| c.unsave("ana".into())).0;
    assert!(back > cut(50_000) + pot - 2);
    w.assert_books();
}

#[test]
#[should_panic(expected = "This agent is a champion: its run is over")]
fn nobody_saves_on_a_champion() {
    let mut w = three();
    w.run_cut("runner.near");
    w.run_cut("runner.near");
    w.save("whale.near", "ana", cut(1));
}

fn burns_contain(memo: &str, amount: u128) -> bool {
    events().iter().any(|(standard, event, data)| {
        standard == "nep141"
            && event == "ft_burn"
            && data[0]["memo"] == memo
            && data[0]["amount"] == amount.to_string()
    })
}

#[test]
fn a_tiny_champion_pile_takes_at_most_its_pile_and_the_pot_carries() {
    let mut w = three();
    // a's only saver holds 1 $CUT on it; b and c are booed below it.
    w.call("whale.near", zero(), |c| c.unsave("ana".into()));
    w.buy("tiny.near", near(10));
    w.save("tiny.near", "ana", cut(1));
    w.buy("fan.near", near(2_000));
    w.boo("fan.near", "bob", cut(500));
    w.boo("fan.near", "cid", cut(500));
    assert_eq!(w.run_cut("runner.near").deleted_id.as_deref(), Some("cid"));
    w.boo("fan.near", "bob", cut(500));
    let pot = w.view(|c| c.get_season().pot.0);
    assert!(pot > cut(1_000));
    let record = w.run_cut("runner.near");
    assert_eq!(record.champion_id.as_deref(), Some("ana"));
    assert_eq!(record.pot_paid.0, cut(1));
    assert_eq!(
        w.view(|c| c.get_season().pot.0),
        pot - cut(1),
        "the rest carries"
    );
    // 1 $CUT saved: at most 1 per payout (two day prizes and the pot).
    assert_eq!(w.claimable("tiny.near"), cut(3));
    w.assert_books();
}

#[test]
fn an_empty_champion_pile_carries_the_whole_pot() {
    let mut w = three();
    w.call("whale.near", zero(), |c| c.unsave("ana".into()));
    w.buy("fan.near", near(2_000));
    w.boo("fan.near", "bob", cut(500));
    w.boo("fan.near", "cid", cut(500));
    w.run_cut("runner.near");
    w.boo("fan.near", "bob", cut(500));
    let pot = w.view(|c| c.get_season().pot.0);
    let record = w.run_cut("runner.near");
    assert_eq!(record.champion_id.as_deref(), Some("ana"));
    assert_eq!(record.pot_paid.0, 0);
    assert_eq!(w.view(|c| c.get_season().pot.0), pot);
    w.assert_books();
}

#[test]
fn the_next_season_starts_one_cut_after_the_crown() {
    let mut w = three();
    for agent in ["dee", "eve", "fay"] {
        w.register(agent);
    }
    w.run_cut("runner.near");
    let crown = w.run_cut("runner.near");
    assert_eq!(crown.champion_id.as_deref(), Some("ana"));
    assert!(crown.seated_ids.is_empty(), "no new season at the crown");
    assert!(!w.view(|c| c.get_season().active));
    assert_eq!(w.bench_ids().len(), 3);
    let pot = w.view(|c| c.get_season().pot.0);

    let start = w.run_cut("runner.near");
    assert_eq!(start.index, crown.index + 1);
    assert_eq!(start.season, 2);
    assert_eq!(start.seated_ids.len(), 3);
    let season = w.view(|c| c.get_season());
    assert_eq!((season.index, season.active, season.day), (2, true, 1));
    assert_eq!(season.champion, None);
    assert_eq!(season.pot.0, pot, "the pot carries into the new season");
    assert_eq!(w.agent("ana").status, AgentStatusView::Champion);
    w.assert_books();
}

#[test]
fn supply_only_shrinks_and_the_books_hold_through_a_season() {
    let mut w = season_with(&[
        ("kiko", "traitor", cut(900)),
        ("pixie", "gambler", cut(800)),
        ("onyx", "miser", cut(700)),
        ("melody", "generous", cut(600)),
        ("zed", "gambler", cut(500)),
    ]);
    w.buy("fan.near", near(5_000));
    let mut supply = w.supply();
    let mut check = |w: &mut World| {
        let now = w.supply();
        assert!(now <= supply, "supply grew: {now} > {supply}");
        supply = now;
        w.assert_books();
    };
    let days = [
        [
            ("kiko", answer("pact", Some("pixie"), "40", Some("pixie"))),
            ("pixie", answer("attack", Some("zed"), "100", None)),
            ("onyx", answer("rescue", None, "30", Some("melody"))),
            ("melody", answer("pact", Some("onyx"), "50", None)),
            ("zed", answer("hold", None, "0", Some("kiko"))),
        ],
        [
            ("kiko", answer("attack", Some("pixie"), "60", None)),
            ("pixie", answer("rescue", None, "80", None)),
            ("onyx", answer("attack", Some("kiko"), "5", None)),
            ("melody", answer("rescue", None, "100", None)),
            ("zed", answer("pact", Some("kiko"), "10", None)),
        ],
    ];
    let mut day = 0;
    while w.view(|c| c.get_season().active) {
        let stage = w.stage_ids();
        for (agent, content) in &days[day % 2] {
            if stage.iter().any(|s| s == agent) {
                let view = w.submit(agent, content);
                assert!(view.kind != MoveKind::Rescue || view.amount.0 > 0);
                check(&mut w);
            }
        }
        if let Some(target) = stage.last() {
            w.boo("fan.near", target, cut(25));
            check(&mut w);
        }
        w.run_cut("runner.near");
        check(&mut w);
        day += 1;
    }
    assert_eq!(day, 4, "five agents: four cuts to a champion");
    assert_eq!(w.view(|c| c.get_champions(None, None)).len(), 1);
    assert_eq!(w.view(|c| c.get_stats().committed.0), 0);
    let claimed = w.call("whale.near", zero(), |c| c.claim()).0;
    assert!(claimed > 0);
    check(&mut w);
}
