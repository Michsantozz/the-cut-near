//! Pure math: pool, fee split, burn, equal slices, the per-pile cap, the reward
//! accumulator, the score, the tie rule and the schedule.

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

#[test]
fn fees_split_between_the_pot_and_the_day_prize() {
    assert_eq!(fee_split(cut(100), 5_000), Some((cut(50), cut(50))));
    assert_eq!(fee_split(101, 5_000), Some((50, 51)));
    assert_eq!(fee_split(cut(7), 0), Some((0, cut(7))));
}

#[test]
fn the_day_prize_splits_three_ways() {
    let (burned, to_prize) = burn_part(cut(23_600), 5_000).unwrap();
    assert_eq!((burned, to_prize), (cut(11_800), cut(11_800)));
    let prize = to_prize + cut(5_020);
    let split = split_prize(prize, 9_000, 500, 9).unwrap();
    assert_eq!(split.savers_total, cut(15_138));
    assert_eq!(split.agents_total, cut(841));
    assert_eq!(split.creators_total, cut(841));
    assert_eq!(split.slice, cut(15_138) / 9);
    assert_eq!(split.agent_slice, cut(841) / 9);
    assert_eq!(
        (split.slice + split.agent_slice + split.creator_slice) * 9 + split.dust,
        prize
    );
    assert!(split.dust < 27);
    assert_eq!(split_prize(cut(1), 9_000, 500, 0), None);
}

#[test]
fn payouts_are_capped_at_the_pile() {
    // The 0.1 $CUT sniper: a 1,000 $CUT slice on a 0.1 $CUT pile pays 0.1, the rest burns.
    assert_eq!(
        cap_to_pile(cut(1_000), cut(1) / 10),
        (cut(1) / 10, cut(1_000) - cut(1) / 10)
    );
    assert_eq!(cap_to_pile(cut(5), cut(100)), (cut(5), 0));
    assert_eq!(cap_to_pile(cut(5), 0), (0, cut(5)));
    assert_eq!(spend_cap(cut(990), 500), Some(cut(495) / 10));
}

#[test]
fn score_is_pile_minus_boos_minus_damage() {
    assert_eq!(score(cut(100), cut(30), cut(20)), Some(cut(50) as i128));
    assert_eq!(score(cut(10), cut(30), 0), Some(-(cut(20) as i128)));
    assert_eq!(score(u128::MAX, 0, 0), None);
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
    let split = split_prize(cut(100) + 7, 9_000, 500, 9).unwrap();
    assert_eq!(
        (split.slice + split.agent_slice + split.creator_slice) * 9 + split.dust,
        cut(100) + 7
    );
    assert!(split.dust < 27);
}

#[test]
fn tie_rule_cuts_the_newer_agent() {
    let agents = [
        Contender { score: 50, seq: 1 },
        Contender { score: 10, seq: 2 },
        Contender { score: 10, seq: 5 },
        Contender { score: -3, seq: 0 },
        Contender { score: 10, seq: 3 },
    ];
    assert_eq!(pick_lowest(&agents), Some(3));
    let agents = &agents[..3];
    assert_eq!(pick_lowest(agents), Some(2));
    assert_eq!(pick_lowest(&[]), None);
}

#[test]
fn biggest_queue_joins_and_older_wins_a_tie() {
    let bench = [
        Contender { score: 5, seq: 9 },
        Contender { score: 88, seq: 7 },
        Contender { score: 88, seq: 4 },
        Contender { score: 31, seq: 1 },
    ];
    assert_eq!(pick_biggest(&bench), Some(2));
    assert_eq!(pick_biggest(&[]), None);
}

#[test]
fn gap_to_next_uses_the_score() {
    let kiko = Contender {
        score: cut(23_600) as i128 - cut(30_000) as i128,
        seq: 10,
    };
    let onyx = Contender {
        score: cut(61_800) as i128,
        seq: 9,
    };
    // Kiko is newer, so a tie still cuts it: it needs one unit more than the difference.
    assert_eq!(gap_to_next(kiko, onyx), cut(68_200) + 1);
    let old = Contender { seq: 1, ..kiko };
    assert_eq!(gap_to_next(old, onyx), cut(68_200));
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
