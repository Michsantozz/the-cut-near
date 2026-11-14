//! Launch, the token and the pool.

use super::context;
use super::*;
use crate::{Contract, STORAGE_MIN, TOTAL_SUPPLY, math};
use near_sdk::testing_env;
use near_sdk_contract_tools::ft::Nep148;

#[test]
fn launch_mints_the_whole_supply_into_the_pool_once() {
    let mut w = World::daily();
    assert!(
        events()
            .iter()
            .any(|(standard, event, data)| standard == "nep141"
                && event == "ft_mint"
                && data[0]["amount"] == TOTAL_SUPPLY.to_string())
    );
    assert_eq!(w.view(|c| c.ft_total_supply().0), TOTAL_SUPPLY);
    assert_eq!(w.balance("thecut.near"), TOTAL_SUPPLY);
    let pool = w.view(|c| c.get_pool());
    assert_eq!(pool.cut_reserve.0, TOTAL_SUPPLY);
    assert_eq!(pool.near_reserve.0, near(1_000_000).as_yoctonear());
    assert_eq!(pool.fee_bps, 100);
    let params = w.view(|c| c.get_params());
    assert_eq!(params.total_supply.0, cut(10_000_000));
    assert_eq!(
        (
            params.fee_bps,
            params.pot_bps,
            params.burn_bps,
            params.savers_bps,
            params.agents_bps,
            params.stage_size,
            params.min_season
        ),
        (100, 5_000, 5_000, 9_000, 500, 10, 3)
    );
    assert_eq!(params.cut_interval.0, DAY);
    assert_eq!(params.move_lead.0, HOUR);
    assert_eq!(
        (params.think_fee.0, params.min_seed.0),
        (cut(10), cut(1_000))
    );
    assert_eq!(params.agent_funding, NearToken::from_millinear(300));
    assert_eq!(params.register_deposit, near(1));
    assert_eq!(params.model_id, MODEL_ID);
    // Keys are stored in lowercase, whatever case `new` got.
    assert_eq!(params.model_signers, vec![key_hex(&model_key())]);
    assert_eq!(
        (params.max_tokens, params.reasoning_effort.as_deref()),
        (1_200, Some("low"))
    );
    let metadata = w.view(|c| c.ft_metadata());
    assert_eq!((metadata.symbol.as_str(), metadata.decimals), ("CUT", 18));
    w.assert_books();
}

#[test]
#[should_panic(expected = "first_cut_at must be in the future")]
fn launch_rejects_a_past_first_cut() {
    World::launch(Launch {
        first_cut_at: LAUNCH - 1,
        ..Launch::default()
    });
}

#[test]
#[should_panic(expected = "stage_size must be between 2 and 12")]
fn launch_rejects_a_tiny_stage() {
    World::launch(Launch {
        stage_size: 1,
        ..Launch::default()
    });
}

#[test]
#[should_panic(expected = "stage_size must be between 2 and 12")]
fn launch_rejects_a_stage_whose_cut_logs_could_overflow() {
    World::launch(Launch {
        stage_size: 13,
        ..Launch::default()
    });
}

#[test]
#[should_panic(expected = "min_season must be between 2 and stage_size")]
fn launch_rejects_a_season_bigger_than_the_stage() {
    World::launch(Launch {
        stage_size: 3,
        min_season: 4,
        ..Launch::default()
    });
}

#[test]
#[should_panic(expected = "move_lead must be shorter than cut_interval")]
fn launch_rejects_moves_that_never_open() {
    World::launch(Launch {
        move_lead: DAY,
        ..Launch::default()
    });
}

#[test]
#[should_panic(expected = "Each model signer must be an Ed25519 public key")]
fn launch_rejects_a_bad_model_signer() {
    testing_env!(context(
        &contract_id(),
        near(10),
        LAUNCH,
        1_000,
        Gas::from_tgas(300)
    ));
    Contract::new(
        100,
        5_000,
        5_000,
        9_000,
        500,
        10,
        3,
        U64(FIRST_CUT),
        U64(DAY),
        U64(HOUR),
        U128(cut(10)),
        U128(cut(1_000)),
        NearToken::from_millinear(300),
        near(1),
        MODEL_ID.to_string(),
        vec!["abcd".to_string()],
        1_200,
        None,
    );
}

#[test]
#[should_panic(expected = "Attach the pool's initial NEAR reserve")]
fn launch_needs_pool_liquidity() {
    World::launch(Launch {
        pool_near: zero(),
        ..Launch::default()
    });
}

#[test]
fn first_buy_registers_the_buyer_and_pays_the_quote() {
    let mut w = World::daily();
    let quote =
        w.view(|c| c.quote_buy(U128(near(100).as_yoctonear() - STORAGE_MIN.as_yoctonear())));
    let out = w.buy("mika.near", near(100));
    assert_eq!(out, quote.amount_out.0);
    let buy = event("buy").unwrap();
    assert_eq!(buy[0]["account_id"], "mika.near");
    assert_eq!(buy[0]["cut_out"], out.to_string());
    assert_eq!(buy[0]["cut_index"], 1);
    assert_eq!(buy[0]["fee"], quote.fee.0.to_string());
    // Half the fee goes to the season pot, the rest to the next day prize.
    let to_pot = quote.fee.0 / 2;
    assert_eq!(buy[0]["to_pot"], to_pot.to_string());
    assert_eq!(w.balance("mika.near"), out);
    assert!(w.view(|c| c.storage_balance_of(id("mika.near"))).is_some());
    let stats = w.view(|c| c.get_stats());
    assert_eq!(stats.season_pot.0, to_pot);
    assert_eq!(stats.fees_since_cut.0, quote.fee.0 - to_pot);
    assert_eq!(w.view(|c| c.get_season().pot.0), to_pot);
    assert_eq!(
        w.view(|c| c.get_next_cut().prize_so_far.0),
        quote.fee.0 - to_pot
    );
    w.assert_books();

    // A registered buyer swaps the whole deposit.
    let quote = w.view(|c| c.quote_buy(U128(near(10).as_yoctonear())));
    assert_eq!(w.buy("mika.near", near(10)), quote.amount_out.0);
    w.assert_books();
}

#[test]
#[should_panic(expected = "Slippage")]
fn buy_respects_min_out() {
    let mut w = World::daily();
    w.call("mika.near", near(10), |c| c.buy(U128(cut(1_000_000))));
}

#[test]
#[should_panic(expected = "Your first buy also registers your account")]
fn first_buy_must_cover_registration() {
    let mut w = World::daily();
    w.call("mika.near", STORAGE_MIN, |c| c.buy(U128(0)));
}

#[test]
fn sell_pays_near_and_feeds_the_prize() {
    let mut w = World::daily();
    let bought = w.buy("mika.near", near(100));
    let stats_before = w.view(|c| c.get_stats());
    let quote = w.view(|c| c.quote_sell(U128(bought / 2)));
    let pool = w.view(|c| c.get_pool());
    let near_out = w.call("mika.near", zero(), |c| c.sell(U128(bought / 2), U128(0)));
    assert_eq!(near_out, quote.amount_out);
    assert_eq!(transfers(), vec![(id("mika.near"), near_out.0)]);
    let sell = event("sell").unwrap();
    assert_eq!(sell[0]["fee"], quote.fee.0.to_string());
    assert_eq!(w.balance("mika.near"), bought - bought / 2);
    let after = w.view(|c| c.get_pool());
    let expected =
        math::quote_sell(pool.near_reserve.0, pool.cut_reserve.0, bought / 2, 100).unwrap();
    assert_eq!(
        after.near_reserve.0,
        pool.near_reserve.0 - expected.near_out
    );
    assert_eq!(after.cut_reserve.0, pool.cut_reserve.0 + expected.net_in);
    let stats = w.view(|c| c.get_stats());
    let (to_pot, to_prize) = math::fee_split(expected.fee, 5_000).unwrap();
    assert_eq!(stats.season_pot.0, stats_before.season_pot.0 + to_pot);
    assert_eq!(
        stats.fees_since_cut.0,
        stats_before.fees_since_cut.0 + to_prize
    );
    w.assert_books();
}

#[test]
#[should_panic(expected = "Slippage")]
fn sell_respects_min_out() {
    let mut w = World::daily();
    let bought = w.buy("mika.near", near(100));
    w.call("mika.near", zero(), |c| {
        c.sell(U128(bought), U128(near(1_000).as_yoctonear()))
    });
}

#[test]
#[should_panic(expected = "Not enough $CUT")]
fn cannot_sell_more_than_held() {
    let mut w = World::daily();
    let bought = w.buy("mika.near", near(100));
    w.call("mika.near", zero(), |c| c.sell(U128(bought + 1), U128(0)));
}

#[test]
fn transfers_need_a_registered_receiver() {
    let mut w = World::daily();
    let bought = w.buy("mika.near", near(100));
    w.transfer("mika.near", "bob.near", bought / 4);
    assert_eq!(w.balance("bob.near"), bought / 4);
    w.assert_books();
}

#[test]
#[should_panic(expected = "not registered")]
fn transfer_to_an_unregistered_account_fails() {
    let mut w = World::daily();
    let bought = w.buy("mika.near", near(100));
    w.call("mika.near", NearToken::from_yoctonear(1), |c| {
        c.ft_transfer(id("ghost.near"), U128(bought), None)
    });
}
