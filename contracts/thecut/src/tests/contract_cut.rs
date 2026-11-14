//! The cut inside a season: timing, score and tie rule, attacks, rescues, the cut agent's
//! wallet, the capped day prize, claims and the agent account deletion.

use super::*;
use crate::types::{AgentStatusView, DeleteState};

/// A season of gamblers `r0..`, with `piles[i]` saved on `r<i>` by `whale.near`.
fn stage_with(piles: &[u128]) -> World {
    let names: Vec<String> = (0..piles.len()).map(|i| format!("r{i}")).collect();
    let agents: Vec<(&str, &str, u128)> = names
        .iter()
        .zip(piles)
        .map(|(name, pile)| (name.as_str(), "gambler", *pile))
        .collect();
    season_with(&agents)
}

fn burns() -> Vec<(String, u128)> {
    events()
        .into_iter()
        .filter(|(standard, event, _)| standard == "nep141" && event == "ft_burn")
        .map(|(_, _, data)| {
            (
                data[0]["memo"].as_str().unwrap().to_string(),
                data[0]["amount"].as_str().unwrap().parse().unwrap(),
            )
        })
        .collect()
}

#[test]
#[should_panic(expected = "Too early: cut 1 opens at")]
fn an_early_cut_is_refused() {
    let mut w = World::daily();
    w.now = FIRST_CUT - 1;
    w.call("runner.near", zero(), |c| c.run_cut());
}

#[test]
#[should_panic(expected = "Attach at least 100 TGas to run the cut")]
fn the_cut_needs_enough_gas() {
    let mut w = World::daily();
    w.at_next_cut();
    w.call_with_gas("runner.near", zero(), Gas::from_tgas(60), |c| c.run_cut());
}

#[test]
fn the_lowest_score_is_cut_and_the_runner_gets_the_account() {
    let mut w = stage_with(&[cut(300), cut(100), cut(200), cut(400)]);
    w.buy("fan.near", near(1_000));
    w.boo("fan.near", "r2", cut(150));
    let boo = event("boo").unwrap();
    assert_eq!(boo[0]["agent_id"], "r2");
    assert_eq!(boo[0]["boos"], cut(150).to_string());
    assert_eq!(w.agent("r2").score.0, cut(50) as i128);
    let next = w.view(|c| c.get_next_cut());
    assert_eq!(next.lowest_id.as_deref(), Some("r2"));
    // r2 (seq 2) is newer than r1 (seq 1): it needs one unit past r1's score.
    assert_eq!(next.gap_to_next.0, cut(50) + 1);

    let record = w.run_cut("runner.near");
    assert_eq!((record.index, record.season, record.day), (2, 1, 1));
    assert_eq!(record.deleted_id.as_deref(), Some("r2"));
    assert_eq!((record.score.0, record.pile.0), (cut(50) as i128, cut(200)));
    assert_eq!(record.runner.as_str(), "runner.near");
    assert_eq!(record.prize, next.prize_so_far);
    assert_eq!(record.slice, next.slice_so_far);
    assert_eq!(record.agent_slice, next.agent_slice_so_far);
    assert_eq!(record.creator_slice, next.creator_slice_so_far);
    assert_eq!(record.survivors, 3);

    // The agent account deletes itself in favor of the runner.
    let calls = function_calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].0.as_str(), "r2.thecut.near");
    assert_eq!(calls[0].1, "self_delete");
    assert_eq!(calls[0].2, r#"{"beneficiary":"runner.near"}"#);
    assert_eq!(calls[1].1, "on_agent_deleted");
    // The creator gets 1 - 0.3 = 0.7 NEAR back.
    assert_eq!(
        transfers(),
        vec![(
            creator_of("r2"),
            NearToken::from_millinear(700).as_yoctonear()
        )]
    );

    let r2 = w.agent("r2");
    assert_eq!(r2.status, AgentStatusView::Deleted);
    assert_eq!(r2.cut_index, Some(2));
    assert_eq!(r2.delete_state, Some(DeleteState::Requested));
    // Its wallet is closed: a gift to it now fails instead of being lost.
    assert_eq!(r2.wallet.0, 0);
    assert!(
        w.view(|c| c.storage_balance_of(id("r2.thecut.near")))
            .is_none()
    );
    assert_eq!(w.stage_ids(), vec!["r3", "r0", "r1"]);
    // Boos last one cut.
    assert_eq!(w.agent("r0").boos.0, 0);
    w.assert_books();
}

#[test]
#[should_panic(expected = "is not registered")]
fn gifts_to_a_cut_agent_fail() {
    let mut w = stage_with(&[cut(300), cut(100), cut(200)]);
    w.run_cut("runner.near");
    w.buy("fan.near", near(10));
    w.call("fan.near", NearToken::from_yoctonear(1), |c| {
        c.ft_transfer(id("r1.thecut.near"), U128(cut(1)), None)
    });
}

#[test]
fn on_a_tie_the_newer_agent_is_cut() {
    let mut w = stage_with(&[cut(100), cut(100), cut(100)]);
    let next = w.view(|c| c.get_next_cut());
    assert_eq!(next.lowest_id.as_deref(), Some("r2"));
    assert_eq!(next.gap_to_next.0, 1);
    assert_eq!(w.run_cut("runner.near").deleted_id.as_deref(), Some("r2"));
}

#[test]
fn attacks_burn_and_lower_the_target_score() {
    let mut w = stage_with(&[cut(300), cut(250), cut(200)]);
    w.submit("r0", &answer("attack", Some("r1"), "100", None));
    assert_eq!(w.agent("r1").damage.0, cut(100));
    assert_eq!(
        w.view(|c| c.get_next_cut().lowest_id),
        Some("r1".to_string())
    );
    let supply = w.supply();
    let record = w.run_cut("runner.near");
    let burned = burns();
    let prizes = event("prize").unwrap();
    let attack = event("attack").unwrap();
    assert_eq!(attack[0]["agent_id"], "r0");
    assert_eq!(attack[0]["target"], "r1");
    assert_eq!(attack[0]["amount"], cut(100).to_string());
    assert_eq!(record.deleted_id.as_deref(), Some("r1"));
    assert_eq!(record.score.0, cut(150) as i128);

    // Burned: the attack, half the pile, the capped prize excess, the heirless wallet.
    let excess: u128 = prizes
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["burned"].as_str().unwrap().parse::<u128>().unwrap())
        .sum();
    assert!(
        excess > 0,
        "the fees make slices bigger than these small piles"
    );
    assert_eq!(
        burned,
        vec![
            ("heirless wallet".to_string(), cut(1_000)),
            ("cut 2".to_string(), cut(100) + cut(125) + excess),
        ]
    );
    assert_eq!(record.burned.0, cut(100) + cut(125) + excess + cut(1_000));
    assert_eq!(w.supply(), supply - record.burned.0);
    assert_eq!(w.agent("r0").damage.0, 0);
    assert_eq!(w.view(|c| c.get_stats().committed.0), 0);
    w.assert_books();
}

#[test]
fn rescues_pay_savers_at_most_their_pile_and_the_rest_comes_back() {
    let mut w = stage_with(&[0, cut(300), cut(200)]);
    w.buy("fan.near", near(1_000));
    w.save("fan.near", "r0", cut(20));
    w.boo("fan.near", "r2", cut(500));
    w.submit("r0", &answer("rescue", None, "100", None));
    w.submit("r2", &answer("rescue", None, "50", None));
    assert_eq!(w.agent("r0").bounty.0, cut(100));
    let record = w.run_cut("runner.near");
    assert_eq!(record.deleted_id.as_deref(), Some("r2"));
    let rescues = event("rescue").unwrap();
    let r0 = rescues
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["agent_id"] == "r0")
        .unwrap();
    assert_eq!(r0["offered"], cut(100).to_string());
    assert_eq!(r0["paid"], cut(20).to_string());
    assert_eq!(r0["returned"], cut(80).to_string());
    // The cut agent's bounty went back to its wallet before the wallet burned.
    let r2 = rescues
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["agent_id"] == "r2")
        .unwrap();
    assert_eq!(
        (r2["paid"].as_str(), r2["returned"].as_str()),
        (Some("0"), Some(cut(50).to_string().as_str()))
    );
    assert!(burns().contains(&("heirless wallet".to_string(), cut(990))));

    // fan: 20 from the rescue plus at most 20 from the prize slice (each capped at 1 per
    // $CUT saved).
    assert_eq!(w.claimable("fan.near"), cut(40));
    assert_eq!(
        w.wallet("r0"),
        cut(1_000) - cut(10) - cut(100) + cut(80) + record.agent_slice.0
    );
    assert_eq!(w.agent("r0").bounty.0, 0);
    w.assert_books();
}

#[test]
fn an_heir_inherits_the_cut_agent_wallet() {
    let mut w = stage_with(&[cut(100), cut(300), cut(200)]);
    w.submit("r0", &answer("hold", None, "0", Some("r2")));
    let r2_before = w.wallet("r2");
    let record = w.run_cut("runner.near");
    assert_eq!(record.deleted_id.as_deref(), Some("r0"));
    assert_eq!(record.inherited_by.as_deref(), Some("r2"));
    assert_eq!(record.inherited.0, cut(990));
    let inherit = event("inherit").unwrap();
    assert_eq!(inherit[0]["agent_id"], "r0");
    assert_eq!(inherit[0]["heir"], "r2");
    assert_eq!(inherit[0]["amount"], cut(990).to_string());
    assert!(!burns().iter().any(|(memo, _)| memo == "heirless wallet"));
    assert_eq!(w.wallet("r2"), r2_before + cut(990) + record.agent_slice.0);
    w.assert_books();
}

#[test]
fn an_heirless_wallet_burns() {
    let mut w = stage_with(&[cut(100), cut(300), cut(200)]);
    let supply = w.supply();
    let record = w.run_cut("runner.near");
    assert_eq!(record.inherited_by, None);
    assert!(event("inherit").is_none());
    assert!(burns().contains(&("heirless wallet".to_string(), cut(1_000))));
    assert_eq!(w.supply(), supply - record.burned.0);
    w.assert_books();
}

#[test]
fn the_prize_slice_is_capped_at_the_pile_and_the_excess_burns() {
    // The sniper: 0.1 $CUT saved on an otherwise empty survivor.
    let mut w = stage_with(&[cut(1_000), cut(1_000), 0]);
    w.buy("sniper.near", near(10));
    w.save("sniper.near", "r2", cut(1) / 10);
    w.buy("fan.near", near(1_000));
    w.boo("fan.near", "r0", cut(1_500));
    let record = w.run_cut("runner.near");
    assert_eq!(record.deleted_id.as_deref(), Some("r0"));
    assert!(
        record.slice.0 > cut(1_000),
        "a big slice: {}",
        record.slice.0
    );
    let prizes = event("prize").unwrap();
    let r2 = prizes
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["agent_id"] == "r2")
        .unwrap();
    assert_eq!(r2["slice"], (cut(1) / 10).to_string());
    assert_eq!(r2["burned"], (record.slice.0 - cut(1) / 10).to_string());
    // The sniper gets at most 1 $CUT per $CUT saved.
    assert_eq!(w.claimable("sniper.near"), cut(1) / 10);
    // r1's pile of 1,000 takes its slice up to 1,000.
    let r1 = prizes
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["agent_id"] == "r1")
        .unwrap();
    assert_eq!(r1["slice"], record.slice.0.min(cut(1_000)).to_string());
    w.assert_books();
}

#[test]
fn survivors_get_the_agents_share_and_creators_claim_theirs() {
    let mut w = stage_with(&[cut(100), cut(200), cut(300)]);
    let record = w.run_cut("runner.near");
    let split = crate::math::split_prize(record.prize.0, 9_000, 500, 2).unwrap();
    assert_eq!(
        (record.slice.0, record.agent_slice.0, record.creator_slice.0),
        (split.slice, split.agent_slice, split.creator_slice)
    );
    assert!(record.agent_slice.0 > 0);
    assert_eq!(w.wallet("r1"), cut(1_000) + record.agent_slice.0);
    assert_eq!(w.wallet("r2"), cut(1_000) + record.agent_slice.0);
    let creator = creator_of("r2");
    assert_eq!(w.claimable(creator.as_str()), record.creator_slice.0);
    assert_eq!(w.claimable(creator_of("r0").as_str()), 0);
    let before = w.balance(creator.as_str());
    let claimed = w.call(creator.as_str(), zero(), |c| c.claim()).0;
    assert_eq!(claimed, record.creator_slice.0);
    assert_eq!(event("claim").unwrap()[0]["amount"], claimed.to_string());
    assert_eq!(w.balance(creator.as_str()), before + claimed);
    assert_eq!(w.claimable(creator.as_str()), 0);
    w.assert_books();
}

#[test]
fn claim_clears_a_save_on_a_cut_agent_even_with_no_prize() {
    let mut w = stage_with(&[cut(1_000), cut(2_000), cut(3_000)]);
    w.buy("mika.near", near(1_000));
    w.save("mika.near", "r0", cut(1));
    // r0 is the lowest: mika's save on it is lost and earned nothing.
    assert_eq!(w.run_cut("runner.near").deleted_id.as_deref(), Some("r0"));
    assert_eq!(w.claimable("mika.near"), 0);
    let available =
        |w: &mut World| w.view(|c| c.storage_balance_of(id("mika.near")).unwrap().available);
    let before = available(&mut w);
    let claimed = w.call("mika.near", zero(), |c| c.claim()).0;
    assert_eq!(claimed, 0);
    assert!(event("claim").is_none(), "nothing paid, no claim event");
    assert!(w.view(|c| c.get_saves(id("mika.near"))).is_empty());
    assert!(
        available(&mut w) > before,
        "the record's storage is released"
    );
    w.assert_books();
}

#[test]
#[should_panic(expected = "Nothing to claim")]
fn claiming_nothing_fails() {
    let mut w = World::daily();
    w.buy("mika.near", near(10));
    w.call("mika.near", zero(), |c| c.claim());
}

#[test]
fn savers_of_the_cut_agent_lose_the_save_but_keep_earlier_prizes() {
    let mut w = stage_with(&[cut(1_000), cut(5_000), cut(2_000), cut(3_000)]);
    w.buy("mika.near", near(1_000));
    w.save("mika.near", "r1", cut(100));
    // Cut 2: r0 is the lowest; mika earns a share of r1's slice.
    assert_eq!(w.run_cut("runner.near").deleted_id.as_deref(), Some("r0"));
    let earned = w.claimable("mika.near");
    assert!(earned > 0);

    // Cut 3: r1 (only mika's 100 left) is the lowest after the whale leaves it.
    w.call("whale.near", zero(), |c| c.unsave("r1".into()));
    assert_eq!(w.run_cut("runner.near").deleted_id.as_deref(), Some("r1"));
    // mika's 100 on r1 is gone; the prize from cut 2 is still there.
    assert_eq!(w.claimable("mika.near"), earned);
    let saves = w.view(|c| c.get_saves(id("mika.near")));
    assert_eq!(saves[0].agent_status, AgentStatusView::Deleted);
    assert!(!saves[0].unlocked);
    let refused = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        w.call("mika.near", zero(), |c| c.unsave("r1".into()))
    }));
    assert!(refused.is_err());
    let claimed = w.call("mika.near", zero(), |c| c.claim()).0;
    assert_eq!(claimed, earned);
    assert!(
        w.view(|c| c.get_saves(id("mika.near"))).is_empty(),
        "claim clears cut saves"
    );
    w.assert_books();
}

#[test]
fn the_delete_callback_records_success() {
    let mut w = stage_with(&[cut(100), cut(200), cut(300)]);
    let record = w.run_cut("runner.near");
    let agent = record.deleted_id.unwrap();
    assert!(w.callback(PromiseResult::Successful(vec![]), |c| {
        c.on_agent_deleted(record.index, agent.clone())
    }));
    let delete = event("delete").unwrap();
    assert_eq!(delete[0]["account_id"], "r0.thecut.near");
    assert_eq!(delete[0]["beneficiary"], "runner.near");
    assert_eq!(w.agent(&agent).delete_state, Some(DeleteState::Done));
}

#[test]
#[should_panic(expected = "Only a cut agent whose account deletion failed can be retried")]
fn a_successful_delete_cannot_be_retried() {
    let mut w = stage_with(&[cut(100), cut(200), cut(300)]);
    let record = w.run_cut("runner.near");
    let agent = record.deleted_id.unwrap();
    w.callback(PromiseResult::Successful(vec![]), |c| {
        c.on_agent_deleted(record.index, agent.clone())
    });
    w.call("anyone.near", zero(), |c| {
        c.retry_delete(agent.clone()).detach()
    });
}

#[test]
fn a_failed_delete_changes_nothing_else_and_can_be_retried() {
    let mut w = stage_with(&[cut(100), cut(200), cut(300)]);
    let record = w.run_cut("runner.near");
    let agent = record.deleted_id.clone().unwrap();
    let stage = w.stage_ids();
    assert!(!w.callback(PromiseResult::Failed, |c| {
        c.on_agent_deleted(record.index, agent.clone())
    }));
    assert!(event("delete").is_none());
    assert_eq!(w.agent(&agent).delete_state, Some(DeleteState::Failed));
    // The cut itself stands.
    assert_eq!(w.stage_ids(), stage);
    assert_eq!(w.view(|c| c.get_cut(record.index)), Some(record));
    w.assert_books();

    // Anyone can retry; the balance still goes to the original runner.
    w.call("anyone.near", zero(), |c| {
        c.retry_delete(agent.clone()).detach()
    });
    let calls = function_calls();
    assert_eq!(calls[0].0.as_str(), "r0.thecut.near");
    assert_eq!(calls[0].2, r#"{"beneficiary":"runner.near"}"#);
    assert_eq!(w.agent(&agent).delete_state, Some(DeleteState::Requested));
}

#[test]
fn a_late_cut_keeps_the_daily_grid() {
    let mut w = stage_with(&[cut(100), cut(200), cut(300)]);
    let at = w.view(|c| c.get_next_cut().at.0);
    w.now = at + 2 * DAY + 5 * SEC;
    w.call("runner.near", zero(), |c| c.run_cut());
    assert_eq!(w.view(|c| c.get_next_cut().at.0), at + 3 * DAY);
}

#[test]
#[should_panic(expected = "Only agents on the stage can be booed")]
fn only_stage_agents_can_be_booed() {
    let mut w = stage_with(&[cut(100), cut(200), cut(300)]);
    w.register("late");
    w.buy("fan.near", near(10));
    w.boo("fan.near", "late", cut(1));
}

#[test]
#[should_panic(expected = "A boo must be at least")]
fn tiny_boos_are_refused() {
    let mut w = stage_with(&[cut(100), cut(200), cut(300)]);
    w.buy("fan.near", near(10));
    w.boo("fan.near", "r0", cut(1) / 10 - 1);
}

#[test]
#[should_panic(expected = "No season is running: boos open")]
fn nobody_boos_without_a_season() {
    let mut w = World::daily();
    w.register("r0");
    w.buy("fan.near", near(10));
    w.boo("fan.near", "r0", cut(1));
}
