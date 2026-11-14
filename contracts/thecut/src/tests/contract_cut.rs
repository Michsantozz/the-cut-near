//! The cut: timing, tie rule, burns, slices, claims, the robot account deletion and the
//! bench.

use super::*;
use crate::types::{DeleteState, RobotStatusView};

/// A stage of `n` robots `r0..`, seated by cut 1, with `piles[i]` saved by `whale.near`.
fn stage_with(piles: &[u128]) -> World {
    let mut w = World::launch(Launch {
        stage_size: piles.len() as u32,
        ..Launch::default()
    });
    for i in 0..piles.len() {
        w.register(&format!("r{i}"));
    }
    w.buy("whale.near", near(100_000));
    w.run_cut("runner.near");
    for (i, pile) in piles.iter().enumerate() {
        if *pile > 0 {
            w.save("whale.near", &format!("r{i}"), *pile);
        }
    }
    w
}

#[test]
#[should_panic(expected = "Too early: cut 1 opens at")]
fn an_early_cut_is_refused() {
    let mut w = World::daily();
    w.now = FIRST_CUT - 1;
    w.call("runner.near", zero(), |c| c.run_cut());
}

#[test]
#[should_panic(expected = "Attach at least 60 TGas")]
fn the_cut_needs_enough_gas() {
    let mut w = World::daily();
    w.at_next_cut();
    w.call_with_gas("runner.near", zero(), Gas::from_tgas(20), |c| c.run_cut());
}

#[test]
fn the_first_cut_fills_the_stage_and_carries_the_fees() {
    let mut w = World::launch(Launch {
        stage_size: 3,
        ..Launch::default()
    });
    for robot in ["ra", "rb", "rc", "rd"] {
        w.register(robot);
    }
    w.buy("mika.near", near(100));
    let fees = w.view(|c| c.get_stats().fees_since_cut.0);
    assert!(w.view(|c| c.get_next_cut().lowest_id).is_none());
    let record = w.run_cut("runner.near");
    assert_eq!(record.index, 1);
    assert_eq!(record.deleted_id, None);
    assert_eq!(record.burned.0, 0);
    assert_eq!(record.prize.0, 0, "nobody was on the stage to share it");
    assert_eq!(record.joined_ids, vec!["ra", "rb", "rc"]);
    assert_eq!(record.joined_id.as_deref(), Some("ra"));
    assert!(
        get_created_receipts().is_empty(),
        "no robot to delete, no refund"
    );
    assert_eq!(w.view(|c| c.get_stats().fees_since_cut.0), fees);
    assert_eq!(w.stage_ids().len(), 3);
    assert_eq!(w.bench_ids(), vec!["rd"]);
    assert_eq!(w.view(|c| c.get_cut(1)), Some(record));
    let next = w.view(|c| c.get_next_cut());
    assert_eq!((next.index, next.at.0), (2, FIRST_CUT + DAY));
    w.assert_books();
}

#[test]
fn the_lowest_pile_is_cut_and_the_runner_gets_the_account() {
    let mut w = stage_with(&[cut(300), cut(100), cut(200)]);
    w.register("bench");
    let next = w.view(|c| c.get_next_cut());
    assert_eq!(next.lowest_id.as_deref(), Some("r1"));
    // r1 (seq 1) is older than r2 (seq 2): it only needs to tie r2's pile.
    assert_eq!(next.gap_to_next.0, cut(100));

    let record = w.run_cut("runner.near");
    assert_eq!(record.index, 2);
    assert_eq!(record.deleted_id.as_deref(), Some("r1"));
    assert_eq!(record.pile.0, cut(100));
    assert_eq!(record.runner.as_str(), "runner.near");
    assert_eq!(record.joined_id.as_deref(), Some("bench"));

    // The robot account deletes itself in favor of the runner.
    let calls = function_calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].0.as_str(), "r1.thecut.near");
    assert_eq!(calls[0].1, "self_delete");
    assert_eq!(calls[0].2, r#"{"beneficiary":"runner.near"}"#);
    assert_eq!(calls[1].1, "on_robot_deleted");
    // The creator gets 4.5 NEAR back.
    assert_eq!(
        transfers(),
        vec![(
            creator_of("r1"),
            NearToken::from_millinear(4_500).as_yoctonear()
        )]
    );

    let r1 = w.robot("r1");
    assert_eq!(r1.status, RobotStatusView::Deleted);
    assert_eq!(r1.cut_index, Some(2));
    assert_eq!(r1.delete_state, Some(DeleteState::Requested));
    assert_eq!(w.stage_ids(), vec!["r0", "r2", "bench"]);
    w.assert_books();
}

#[test]
fn on_a_tie_the_newer_robot_is_cut() {
    let mut w = stage_with(&[cut(100), cut(100), cut(100)]);
    let next = w.view(|c| c.get_next_cut());
    assert_eq!(next.lowest_id.as_deref(), Some("r2"));
    assert_eq!(next.gap_to_next.0, 1);
    assert_eq!(w.run_cut("runner.near").deleted_id.as_deref(), Some("r2"));
}

#[test]
fn half_the_pile_burns_and_the_rest_is_split_in_equal_slices() {
    let mut w = stage_with(&[cut(1_000), cut(100), cut(3_000)]);
    let fees = w.view(|c| c.get_stats().fees_since_cut.0);
    let supply = w.view(|c| c.ft_total_supply().0);
    let preview = w.view(|c| c.get_next_cut());
    let record = w.run_cut("runner.near");
    let burn = events()
        .into_iter()
        .find(|(standard, event, _)| standard == "nep141" && event == "ft_burn")
        .unwrap();
    assert_eq!(burn.2[0]["amount"], cut(50).to_string());
    assert!(event("cut").is_some());
    assert_eq!(event("prize").unwrap().as_array().unwrap().len(), 2);
    assert_eq!(record.burned.0, cut(50));
    assert_eq!(record.prize.0, cut(50) + fees);
    assert_eq!(record.prize, preview.prize_so_far);
    assert_eq!(record.slice, preview.slice_so_far);
    assert_eq!(record.survivors, 2);
    let split = crate::math::split_prize(record.prize.0, 9_500, 2).unwrap();
    assert_eq!(record.slice.0, split.slice);
    assert_eq!(record.creator_slice.0, split.creator_slice);
    assert_eq!(w.view(|c| c.ft_total_supply().0), supply - cut(50));

    // Same slice for both survivors, whatever their piles: the whale holds both saves.
    assert!(w.claimable("whale.near") + 2 >= split.slice * 2);
    assert!(w.claimable("whale.near") <= split.slice * 2);
    assert_eq!(w.claimable(creator_of("r0").as_str()), split.creator_slice);
    assert_eq!(w.claimable(creator_of("r2").as_str()), split.creator_slice);
    assert_eq!(w.claimable(creator_of("r1").as_str()), 0);
    w.assert_books();
}

#[test]
fn small_piles_pay_more_per_cut() {
    // Two savers, one on a small pile, one on a big pile: same slice, so the small pile
    // pays more per $CUT saved.
    let mut w = stage_with(&[0, 0, 0]);
    w.buy("small.near", near(1_000));
    w.buy("big.near", near(10_000));
    w.save("whale.near", "r0", cut(10));
    w.save("small.near", "r1", cut(100));
    w.save("big.near", "r2", cut(10_000));
    let record = w.run_cut("runner.near");
    assert_eq!(record.deleted_id.as_deref(), Some("r0"));
    let small = w.claimable("small.near");
    let big = w.claimable("big.near");
    assert!(
        small.abs_diff(big) <= 1,
        "each survivor's savers share one equal slice"
    );
    assert!(small * 1_000 / cut(100) > big * 1_000 / cut(10_000) * 99);
    w.assert_books();
}

#[test]
fn empty_pile_slices_burn() {
    // On a full stage an empty pile is always the lowest and gets cut, so an empty
    // survivor happens when a pile is emptied and the next cut has a free seat (nobody
    // is cut, every stage robot survives).
    let mut w = stage_with(&[0, cut(100), cut(500)]);
    let record = w.run_cut("runner.near");
    assert_eq!(record.deleted_id.as_deref(), Some("r0"));
    // Now the stage has r1, r2 and a free seat (no bench robot). Empty r1.
    w.call("whale.near", zero(), |c| c.unsave("r1".into()));
    w.buy("mika.near", near(1_000)); // fresh fees for cut 3
    let supply = w.view(|c| c.ft_total_supply().0);
    let preview = w.view(|c| c.get_next_cut());
    assert_eq!(preview.lowest_id, None, "stage not full: nobody is cut");
    assert_eq!(preview.survivors, 2);
    let record = w.run_cut("runner.near");
    let prizes = event("prize").unwrap();
    let r1 = prizes
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["robot_id"] == "r1")
        .unwrap();
    assert_eq!(r1["burned"], true);
    assert_eq!(record.deleted_id, None);
    assert_eq!(record.survivors, 2);
    // r1's slice burned, r2's slice went to its savers.
    assert_eq!(record.burned.0, record.slice.0);
    assert_eq!(w.view(|c| c.ft_total_supply().0), supply - record.slice.0);
    w.assert_books();
}

#[test]
fn savers_of_the_cut_robot_lose_the_save_but_keep_earlier_prizes() {
    let mut w = stage_with(&[cut(1_000), cut(500), cut(2_000)]);
    w.register("spare");
    w.save("whale.near", "spare", cut(300));
    w.buy("mika.near", near(1_000));
    w.save("mika.near", "r1", cut(100));
    w.save("whale.near", "r1", cut(5_000));
    // Cut 2: r0 (1,000) is the lowest; mika earns a share of r1's slice; spare joins.
    let record = w.run_cut("runner.near");
    assert_eq!(record.deleted_id.as_deref(), Some("r0"));
    let earned = w.claimable("mika.near");
    assert!(earned > 0);

    // Cut 3: r1 (only mika's 100 left) is the lowest after the whale leaves it.
    w.call("whale.near", zero(), |c| c.unsave("r1".into()));
    let record = w.run_cut("runner.near");
    assert_eq!(record.deleted_id.as_deref(), Some("r1"));
    // mika's 100 on r1 is gone; the prize from cut 2 is still there.
    assert_eq!(w.claimable("mika.near"), earned);
    let saves = w.view(|c| c.get_saves(id("mika.near")));
    assert_eq!(saves[0].robot_status, RobotStatusView::Deleted);
    assert!(!saves[0].unlocked);
    let refused = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        w.call("mika.near", zero(), |c| c.unsave("r1".into()))
    }));
    assert!(refused.is_err());

    let balance = w.balance("mika.near");
    let claimed = w.call("mika.near", zero(), |c| c.claim()).0;
    assert_eq!(claimed, earned);
    assert_eq!(event("claim").unwrap()[0]["amount"], earned.to_string());
    assert_eq!(w.balance("mika.near"), balance + earned);
    assert!(
        w.view(|c| c.get_saves(id("mika.near"))).is_empty(),
        "claim clears cut saves"
    );
    w.assert_books();
}

#[test]
fn creators_claim_their_slices() {
    let mut w = stage_with(&[cut(100), cut(200), cut(300)]);
    let record = w.run_cut("runner.near");
    let creator = creator_of("r2");
    assert_eq!(w.claimable(creator.as_str()), record.creator_slice.0);
    // A creator that never held $CUT registers by attaching the minimum to claim().
    let claimed = w
        .call(creator.as_str(), crate::STORAGE_MIN, |c| c.claim())
        .0;
    assert_eq!(claimed, record.creator_slice.0);
    assert_eq!(w.balance(creator.as_str()), claimed);
    assert_eq!(w.claimable(creator.as_str()), 0);
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
fn prizes_keep_riding_and_accumulate() {
    let mut w = stage_with(&[cut(100), cut(1_000), cut(1_000), cut(1_000)]);
    w.register("b1");
    w.register("b2");
    w.save("whale.near", "b1", cut(50));
    w.save("whale.near", "b2", cut(40));
    w.run_cut("runner.near"); // cuts r0, b1 joins
    let first = w.claimable(creator_of("r1").as_str());
    let whale_first = w.claimable("whale.near");
    w.buy("mika.near", near(1_000));
    w.run_cut("runner.near"); // cuts b1 (50), b2 joins
    assert!(w.claimable(creator_of("r1").as_str()) > first);
    assert!(w.claimable("whale.near") > whale_first);
    let claimed = w.call("whale.near", zero(), |c| c.claim()).0;
    assert!(claimed > whale_first);
    // The whale's saves on survivors keep riding after the claim.
    assert_eq!(w.robot("r1").pile.0, cut(1_000));
    w.assert_books();
}

#[test]
fn the_delete_callback_records_success() {
    let mut w = stage_with(&[cut(100), cut(200)]);
    let record = w.run_cut("runner.near");
    let robot = record.deleted_id.unwrap();
    assert!(w.callback(PromiseResult::Successful(vec![]), |c| {
        c.on_robot_deleted(record.index, robot.clone())
    }));
    let delete = event("delete").unwrap();
    assert_eq!(delete[0]["account_id"], "r0.thecut.near");
    assert_eq!(delete[0]["beneficiary"], "runner.near");
    assert_eq!(w.robot(&robot).delete_state, Some(DeleteState::Done));
}

#[test]
#[should_panic(expected = "Only a cut robot whose account deletion failed can be retried")]
fn a_successful_delete_cannot_be_retried() {
    let mut w = stage_with(&[cut(100), cut(200)]);
    let record = w.run_cut("runner.near");
    let robot = record.deleted_id.unwrap();
    w.callback(PromiseResult::Successful(vec![]), |c| {
        c.on_robot_deleted(record.index, robot.clone())
    });
    w.call("anyone.near", zero(), |c| {
        c.retry_delete(robot.clone()).detach()
    });
}

#[test]
fn a_failed_delete_changes_nothing_else_and_can_be_retried() {
    let mut w = stage_with(&[cut(100), cut(200)]);
    let record = w.run_cut("runner.near");
    let robot = record.deleted_id.clone().unwrap();
    let stage = w.stage_ids();
    assert!(!w.callback(PromiseResult::Failed, |c| {
        c.on_robot_deleted(record.index, robot.clone())
    }));
    assert!(event("delete").is_none());
    assert_eq!(w.robot(&robot).delete_state, Some(DeleteState::Failed));
    // The cut itself stands.
    assert_eq!(w.stage_ids(), stage);
    assert_eq!(w.view(|c| c.get_cut(record.index)), Some(record));
    w.assert_books();

    // Anyone can retry; the balance still goes to the original runner.
    w.call("anyone.near", zero(), |c| {
        c.retry_delete(robot.clone()).detach()
    });
    let calls = function_calls();
    assert_eq!(calls[0].0.as_str(), "r0.thecut.near");
    assert_eq!(calls[0].2, r#"{"beneficiary":"runner.near"}"#);
    assert_eq!(w.robot(&robot).delete_state, Some(DeleteState::Requested));
}

#[test]
fn a_late_cut_keeps_the_daily_grid() {
    let mut w = stage_with(&[cut(100), cut(200)]);
    let at = w.view(|c| c.get_next_cut().at.0);
    w.now = at + 2 * DAY + 5 * SEC;
    w.call("runner.near", zero(), |c| c.run_cut());
    assert_eq!(w.view(|c| c.get_next_cut().at.0), at + 3 * DAY);
}

#[test]
fn supply_is_minted_minus_burned_after_many_cuts() {
    let mut w = stage_with(&[cut(100), cut(200), cut(300)]);
    for i in 0..6 {
        let robot = format!("n{i}");
        w.register(&robot);
        w.save("whale.near", &robot, cut(150 + i * 10));
        w.buy("mika.near", near(100));
        w.run_cut("runner.near");
        w.assert_books();
    }
    let stats = w.view(|c| c.get_stats());
    assert_eq!(stats.cuts_run, 7);
    assert!(stats.burned.0 > 0);
    assert_eq!(stats.minted.0 - stats.burned.0, stats.total_supply.0);
    let claimed = w.call("whale.near", zero(), |c| c.claim()).0;
    assert!(claimed > 0);
    w.assert_books();
}
