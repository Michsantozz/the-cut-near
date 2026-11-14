//! Pure math: pool, fee, burn, equal slices (with the SPEC sample numbers), the reward
//! accumulator, the tie rule and the schedule.

use super::cut;
use crate::math::*;

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

fn k(near_reserve: u128, cut_reserve: u128) -> U256 {
    U256::from(near_reserve) * U256::from(cut_reserve)
}

#[test]
fn mul_div_rounds_down_and_never_overflows() {
    assert_eq!(mul_div(7, 3, 2), Some(10));
    assert_eq!(mul_div(u128::MAX, u128::MAX, u128::MAX), Some(u128::MAX));
    assert_eq!(mul_div(u128::MAX, 2, 1), None);
    assert_eq!(mul_div(1, 1, 0), None);
    assert_eq!(bps_of(cut(5_020), 100), Some(cut(5_020) / 100));
}

#[test]
fn buy_follows_constant_product_with_one_percent_fee() {
    let (x, y) = (1_000 * NEAR, cut(10_000_000));
    let q = quote_buy(x, y, 10 * NEAR, 100).unwrap();
    // 10,000,000 * 10 / 1,010 = 99,009.9 $CUT leave the pool.
    assert_eq!(q.gross_out, mul_div(y, 10 * NEAR, x + 10 * NEAR).unwrap());
    assert_eq!(q.gross_out / crate::ONE_CUT, 99_009);
    assert_eq!(q.fee, q.gross_out / 100);
    assert_eq!(q.amount_out, q.gross_out - q.fee);
    // The product never decreases.
    assert!(k(x + 10 * NEAR, y - q.gross_out) >= k(x, y));
}

#[test]
fn sell_takes_the_fee_from_the_input() {
    let (x, y) = (1_000 * NEAR, cut(10_000_000));
    let q = quote_sell(x, y, cut(100_000), 100).unwrap();
    assert_eq!(q.fee, cut(1_000));
    assert_eq!(q.net_in, cut(99_000));
    assert_eq!(
        q.near_out,
        mul_div(x, cut(99_000), y + cut(99_000)).unwrap()
    );
    assert!(k(x - q.near_out, y + q.net_in) >= k(x, y));
}

#[test]
fn a_round_trip_loses_both_fees() {
    let (x, y) = (1_000 * NEAR, cut(10_000_000));
    let near_in = 10 * NEAR;
    let b = quote_buy(x, y, near_in, 100).unwrap();
    let s = quote_sell(x + near_in, y - b.gross_out, b.amount_out, 100).unwrap();
    assert!(s.near_out < near_in);
    // About 98% comes back: the price impact cancels out, the two 1% fees do not.
    let kept = s.near_out * 10_000 / near_in;
    assert!((9_795..=9_805).contains(&kept), "kept {kept} bps");
}

#[test]
fn zero_fee_and_tiny_amounts() {
    let q = quote_buy(NEAR, cut(1), 1, 100).unwrap();
    assert_eq!(q.amount_out, 0);
    let q = quote_buy(NEAR, cut(10), NEAR, 0).unwrap();
    assert_eq!((q.fee, q.amount_out), (0, cut(5)));
}

/// SPEC-v19 §2: "Kiko Bun 23,600 → 11,800 burned. Prize = 11,800 + 5,020 fees = 16,820.
/// 95% = 15,979 to savers → 9 slices of 1,775.4. 5% = 841 → 93.4 per creator.
/// mika: 400 of Melody-9's 112,300 × 1,775.4 = 6.32 $CUT."
#[test]
fn spec_sample_cut_numbers() {
    let (burned, to_prize) = burn_part(cut(23_600), 5_000).unwrap();
    assert_eq!(burned, cut(11_800));
    assert_eq!(to_prize, cut(11_800));

    let prize = to_prize + cut(5_020);
    assert_eq!(prize, cut(16_820));

    let split = split_prize(prize, 9_500, 9).unwrap();
    assert_eq!(split.savers_total, cut(15_979));
    assert_eq!(split.creators_total, cut(841));
    assert_eq!(split.slice, cut(15_979) / 9);
    assert_eq!(split.slice * 10 / crate::ONE_CUT, 17_754); // 1,775.4
    assert_eq!(split.creator_slice * 10 / crate::ONE_CUT, 934); // 93.4
    assert_eq!(
        split.slice * 9 + split.creator_slice * 9 + split.dust,
        prize
    );

    // mika's share of Melody-9's slice.
    let increment = reward_increment(split.slice, cut(112_300)).unwrap();
    let mika = pending_reward(cut(400), increment, 0).unwrap();
    assert_eq!(mika * 100 / crate::ONE_CUT, 632); // 6.32
    let exact = split.slice * 400 / 112_300;
    assert!(
        exact - mika <= 1,
        "accumulator rounding stays within one unit"
    );

    // "Pays per 100 $CUT saved, if the cut ran now".
    let pays_per_100 = |pile: u128| split.slice * 100 * 100 / pile;
    assert_eq!(pays_per_100(cut(182_400)), 97); // Pixie Volt 0.97
    assert_eq!(pays_per_100(cut(112_300)), 158); // Melody-9 1.58
    assert_eq!(pays_per_100(cut(61_800)), 287); // Onyx Moon 2.87

    // Supply after the cut.
    assert_eq!(cut(10_000_000) - burned, cut(9_988_200));
}

#[test]
fn accumulator_splits_a_slice_pro_rata() {
    let pile = cut(400);
    let increment = reward_increment(cut(1_000), pile).unwrap();
    assert_eq!(pending_reward(cut(300), increment, 0), Some(cut(750)));
    assert_eq!(pending_reward(cut(100), increment, 0), Some(cut(250)));
    // A save made after the increment earns nothing from it.
    assert_eq!(pending_reward(cut(100), increment, increment), Some(0));
}

#[test]
fn accumulator_never_pays_more_than_the_slice() {
    let saves = [7u128, 13, 1_000_003, 99_999_999_999, 3];
    let pile: u128 = saves.iter().sum();
    let slice = 1_000_000_007u128;
    let mut acc = 0u128;
    for _ in 0..5 {
        acc += reward_increment(slice, pile).unwrap();
    }
    let paid: u128 = saves
        .iter()
        .map(|a| pending_reward(*a, acc, 0).unwrap())
        .sum();
    assert!(paid <= slice * 5);
    assert!(slice * 5 - paid < 5 * saves.len() as u128 + 5);
}

#[test]
fn split_carries_rounding_dust() {
    let split = split_prize(cut(100) + 7, 9_500, 9).unwrap();
    assert_eq!(
        split.slice * 9 + split.creator_slice * 9 + split.dust,
        cut(100) + 7
    );
    assert!(split.dust < 18);
    assert_eq!(split_prize(cut(1), 9_500, 0), None);
}

#[test]
fn tie_rule_cuts_the_newer_agent() {
    let agents = [
        Contender { pile: 50, seq: 1 },
        Contender { pile: 10, seq: 2 },
        Contender { pile: 10, seq: 5 },
        Contender { pile: 10, seq: 3 },
    ];
    assert_eq!(pick_lowest(&agents), Some(2));
    assert_eq!(pick_lowest(&[]), None);
}

#[test]
fn biggest_queue_joins_and_older_wins_a_tie() {
    let bench = [
        Contender { pile: 5, seq: 9 },
        Contender { pile: 88, seq: 7 },
        Contender { pile: 88, seq: 4 },
        Contender { pile: 31, seq: 1 },
    ];
    assert_eq!(pick_biggest(&bench), Some(2));
    assert_eq!(pick_biggest(&[]), None);
}

#[test]
fn gap_to_next_matches_the_rescue_line() {
    // "Lift Kiko past Onyx Moon (38,201 $CUT)": Kiko is newer, so a tie still cuts it.
    let kiko = Contender {
        pile: cut(23_600),
        seq: 10,
    };
    let onyx = Contender {
        pile: cut(61_800),
        seq: 9,
    };
    assert_eq!(gap_to_next(kiko, onyx), cut(38_200) + 1);
    // An older agent only needs to tie.
    let old = Contender {
        pile: cut(23_600),
        seq: 1,
    };
    assert_eq!(gap_to_next(old, onyx), cut(38_200));
}

#[test]
fn schedule_keeps_the_grid() {
    let at = 1_000;
    assert_eq!(next_cut_after(at, 100, at), Some(1_100));
    assert_eq!(next_cut_after(at, 100, at + 99), Some(1_100));
    // A cut run 2.5 intervals late skips the missed slots and keeps the grid.
    assert_eq!(next_cut_after(at, 100, at + 250), Some(1_300));
    assert_eq!(next_cut_after(at, 0, at), None);
}
