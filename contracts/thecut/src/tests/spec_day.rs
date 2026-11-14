//! The SPEC-v19 sample day, run through the contract.
//!
//! Stage (pile): Pixie Volt 182,400 · Lila Loop 151,200 · Oracle Toad 139,800 ·
//! Mabel Market 121,500 · Melody-9 112,300 (mika 400 of it) · Yuna Star 98,700 ·
//! Glitch Gremlin 86,900 · Velvet Vee 74,200 · Onyx Moon 61,800 · Kiko Bun 23,600.
//! Bench (queue): Chartwise 88,400 · Bloop 31,200 · Pixel Kit 12,600. Fees today: 5,020.
//!
//! "Kiko Bun 23,600 → 11,800 burned. Prize = 11,800 + 5,020 fees = 16,820. 95% = 15,979
//! to savers → 9 slices of 1,775.4. 5% = 841 → 93.4 per creator. mika: 400 of Melody-9's
//! 112,300 × 1,775.4 = 6.32 $CUT. Runner keeps 0.5 NEAR. Chartwise takes the seat with
//! 88,400."
//!
//! To reach that stage through the public methods, a placeholder robot (`zed`) holds the
//! tenth seat at cut 1 and is cut at cut 2, which also pays out the fees of the launch
//! buys. Kiko takes its seat at cut 2. The day's fees are then exactly 5,020 $CUT: one
//! sell of 502,000 $CUT (the sell fee is exactly 1% of the input).

use super::*;
use crate::types::RobotStatusView;

const STAGE: [(&str, u128); 9] = [
    ("pixie", 182_400),
    ("lila", 151_200),
    ("oracle", 139_800),
    ("mabel", 121_500),
    ("melody", 112_300),
    ("yuna", 98_700),
    ("gremlin", 86_900),
    ("velvet", 74_200),
    ("onyx", 61_800),
];

#[test]
fn the_sample_cut() {
    let mut w = World::daily();
    w.register("zed");
    for (robot, _) in STAGE {
        w.register(robot);
    }
    for robot in ["kiko", "chartwise", "bloop", "pixelkit"] {
        w.register(robot);
    }

    // Launch day: the whale and mika buy; queues fill.
    w.buy("whale.near", near(250_000));
    w.buy("mika.near", near(100));
    for (robot, pile) in STAGE {
        let whale_part = if robot == "melody" { pile - 400 } else { pile };
        w.save("whale.near", robot, cut(whale_part));
    }
    w.save("mika.near", "melody", cut(400));
    w.save("whale.near", "zed", cut(1));

    // Cut 1 (stage empty): the ten biggest queues take the seats; zed holds the tenth.
    let cut1 = w.run_cut("runner.near");
    assert_eq!(cut1.deleted_id, None);
    assert_eq!(cut1.joined_ids.len(), 10);
    assert!(cut1.joined_ids.contains(&"zed".to_string()));

    // Cut 2: zed (1 $CUT) is cut, the launch fees are paid out, Kiko takes the seat.
    w.save("whale.near", "kiko", cut(23_600));
    let cut2 = w.run_cut("runner.near");
    assert_eq!(cut2.deleted_id.as_deref(), Some("zed"));
    assert_eq!(cut2.joined_id.as_deref(), Some("kiko"));
    w.save("whale.near", "chartwise", cut(88_400));
    w.save("whale.near", "bloop", cut(31_200));
    w.save("whale.near", "pixelkit", cut(12_600));

    // The sample day's fees: exactly 5,020 $CUT.
    let dust = w.view(|c| c.get_stats().fees_since_cut.0);
    assert!(dust < 18, "only rounding dust carried from cut 2");
    w.call("whale.near", zero(), |c| {
        c.sell(U128(cut(502_000)), U128(0))
    });
    assert_eq!(
        w.view(|c| c.get_stats().fees_since_cut.0),
        dust + cut(5_020)
    );

    // The stage matches the sample, Kiko on the block.
    let stage = w.view(|c| c.get_stage());
    let expected: Vec<(&str, u128)> = STAGE
        .iter()
        .map(|(robot, pile)| (*robot, cut(*pile)))
        .chain([("kiko", cut(23_600))])
        .collect();
    let actual: Vec<(&str, u128)> = stage.iter().map(|r| (r.id.as_str(), r.pile.0)).collect();
    assert_eq!(actual, expected);
    assert_eq!(w.bench_ids(), vec!["chartwise", "bloop", "pixelkit"]);
    let saved_on_stage: u128 = stage.iter().map(|r| r.pile.0).sum();
    assert_eq!(saved_on_stage, cut(1_052_400));

    // Before the cut: "Lift Kiko past Onyx Moon (38,201 $CUT)", prize so far 16,820.
    let next = w.view(|c| c.get_next_cut());
    assert_eq!(next.index, 3);
    assert_eq!(next.lowest_id.as_deref(), Some("kiko"));
    assert_eq!(next.gap_to_next.0, cut(38_200) + 1);
    assert_eq!(next.gap_to_next.0.div_ceil(crate::ONE_CUT), 38_201);
    assert_eq!(next.prize_so_far.0, cut(16_820) + dust);
    assert_eq!(next.slice_so_far.0 * 10 / crate::ONE_CUT, 17_754); // 1,775.4
    assert_eq!(next.survivors, 9);
    // "Pays per 100 saved, if the cut ran now": Onyx Moon 2.87, Pixie Volt 0.97.
    assert_eq!(next.slice_so_far.0 * 100 * 100 / cut(61_800), 287);
    assert_eq!(next.slice_so_far.0 * 100 * 100 / cut(182_400), 97);

    let mika_before = w.claimable("mika.near");
    let creator_before = w.claimable(creator_of("melody").as_str());
    let supply_before = w.view(|c| c.ft_total_supply().0);

    // The sample cut, run by a third account.
    let record = w.run_cut("runner.near");
    let calls = function_calls();
    let refunds = transfers();
    assert_eq!(record.index, 3);
    assert_eq!(record.deleted_id.as_deref(), Some("kiko"));
    assert_eq!(record.pile.0, cut(23_600));
    assert_eq!(record.burned.0, cut(11_800));
    assert_eq!(record.prize.0, cut(16_820) + dust);
    assert_eq!(record.survivors, 9);
    assert_eq!(record.slice.0 * 10 / crate::ONE_CUT, 17_754); // 1,775.4 each
    assert_eq!(record.creator_slice.0 * 10 / crate::ONE_CUT, 934); // 93.4 each
    assert_eq!(record.joined_id.as_deref(), Some("chartwise"));
    assert_eq!(record.runner.as_str(), "runner.near");
    assert_eq!(record.creator_refund, NearToken::from_millinear(4_500));

    // mika: 400 of Melody-9's 112,300 × 1,775.4 = 6.32 $CUT.
    let mika_prize = w.claimable("mika.near") - mika_before;
    assert_eq!(mika_prize * 100 / crate::ONE_CUT, 632);
    assert_eq!(
        w.claimable(creator_of("melody").as_str()) - creator_before,
        record.creator_slice.0
    );

    // Half the pile burned: supply drops by 11,800.
    assert_eq!(
        w.view(|c| c.ft_total_supply().0),
        supply_before - cut(11_800)
    );

    // Kiko is deleted, its account deletion goes to the runner, its creator gets 4.5 NEAR.
    assert_eq!(w.robot("kiko").status, RobotStatusView::Deleted);
    assert_eq!(calls[0].0.as_str(), "kiko.thecut.near");
    assert_eq!(calls[0].2, r#"{"beneficiary":"runner.near"}"#);
    assert!(refunds.contains(&(
        creator_of("kiko"),
        NearToken::from_millinear(4_500).as_yoctonear()
    )));

    // Chartwise takes the seat with 88,400; the other queues stay and are unlocked.
    let chartwise = w.robot("chartwise");
    assert_eq!(chartwise.status, RobotStatusView::Stage);
    assert_eq!(chartwise.pile.0, cut(88_400));
    assert_eq!(w.stage_ids().len(), 10);
    assert_eq!(w.bench_ids(), vec!["bloop", "pixelkit"]);
    let whale_saves = w.view(|c| c.get_saves(id("whale.near")));
    let bloop = whale_saves.iter().find(|s| s.robot_id == "bloop").unwrap();
    assert!(bloop.unlocked);

    // mika collects; her 400 keeps riding on Melody-9.
    let claimed = w.call("mika.near", zero(), |c| c.claim()).0;
    assert_eq!(claimed, mika_before + mika_prize);
    assert_eq!(w.robot("melody").pile.0, cut(112_300));

    // The next cut is the next day at 18:00 UTC.
    assert_eq!(w.view(|c| c.get_next_cut().at.0), FIRST_CUT + 3 * DAY);
    w.assert_books();
}
