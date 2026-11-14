//! Agent registration, saves, locks and storage.

use super::*;
use crate::types::AgentStatusView;
use crate::{AGENT_WASM, MIN_SAVE};

fn register_kiko(w: &mut World, deposit: NearToken, personality: &str, charter: &str, seed: u128) {
    let creator = creator_of("kiko");
    w.holds("kiko.thecut.near");
    w.call(creator.as_str(), deposit, |c| {
        c.register_agent(
            "kiko".into(),
            "Kiko Bun".into(),
            "Never cut twice".into(),
            "@KikoBunCut".into(),
            personality.into(),
            charter.into(),
            U128(seed),
        )
        .detach();
    });
}

#[test]
fn register_creates_a_keyless_agent_account_with_a_wallet() {
    let mut w = World::daily();
    let creator = creator_of("kiko");
    let bought = w.buy(creator.as_str(), near(250));
    register_kiko(
        &mut w,
        near(2),
        "traitor",
        "Loyal to nobody.\nLoves chaos.",
        cut(1_200),
    );
    let receipts = get_created_receipts();
    // The excess 1 NEAR comes back right away.
    assert!(transfers().contains(&(creator.clone(), near(1).as_yoctonear())));
    // The seed moved into the agent account's $CUT balance at once.
    let seed = events()
        .into_iter()
        .find(|(_, e, d)| e == "ft_transfer" && d[0]["memo"] == "seed")
        .unwrap();
    assert_eq!(seed.2[0]["old_owner_id"], creator.as_str());
    assert_eq!(seed.2[0]["new_owner_id"], "kiko.thecut.near");
    assert_eq!(w.balance(creator.as_str()), bought - cut(1_200));
    assert_eq!(w.wallet("kiko"), cut(1_200));
    assert!(
        w.view(|c| c.storage_balance_of(id("kiko.thecut.near")))
            .is_some()
    );
    let agent_receipt = receipts
        .iter()
        .find(|r| r.receiver_id.as_str() == "kiko.thecut.near")
        .expect("agent account receipt");
    let actions = &agent_receipt.actions;
    assert!(matches!(actions[0], MockAction::CreateAccount { .. }));
    assert!(
        matches!(actions[1], MockAction::Transfer { deposit, .. } if deposit == NearToken::from_millinear(300))
    );
    assert!(
        matches!(&actions[2], MockAction::DeployContract { code, .. } if code.as_slice() == AGENT_WASM)
    );
    assert!(
        matches!(&actions[3], MockAction::FunctionCallWeight { method_name, args, .. }
        if method_name == b"new" && String::from_utf8(args.clone()).unwrap().contains("\"owner\":\"thecut.near\""))
    );
    // No key is ever added to the agent account.
    assert!(!actions.iter().any(|a| matches!(
        a,
        MockAction::AddKeyWithFullAccess { .. } | MockAction::AddKeyWithFunctionCall { .. }
    )));

    // Not visible until the account creation is confirmed.
    assert!(w.view(|c| c.get_agent("kiko".into())).is_none());
    assert!(w.bench_ids().is_empty());

    assert!(w.callback(PromiseResult::Successful(vec![]), |c| {
        c.on_agent_created("kiko".into(), U128(cut(1_200)))
    }));
    let register = event("register").unwrap();
    assert_eq!(register[0]["agent_id"], "kiko");
    assert_eq!(register[0]["account_id"], "kiko.thecut.near");
    assert_eq!(register[0]["creator"], creator.as_str());
    assert_eq!(register[0]["personality"], "traitor");
    assert_eq!(register[0]["seed"], cut(1_200).to_string());
    let kiko = w.agent("kiko");
    assert_eq!(kiko.status, AgentStatusView::Bench);
    assert_eq!(kiko.account_id.as_str(), "kiko.thecut.near");
    assert_eq!(
        (
            kiko.name.as_str(),
            kiko.tagline.as_str(),
            kiko.x_handle.as_str(),
            kiko.personality.as_str(),
            kiko.charter.as_str()
        ),
        (
            "Kiko Bun",
            "Never cut twice",
            "@KikoBunCut",
            "traitor",
            "Loyal to nobody.\nLoves chaos."
        )
    );
    assert_eq!(kiko.wallet.0, cut(1_200));
    assert_eq!((kiko.heir, kiko.pacts.len(), kiko.moved), (None, 0, false));
    assert_eq!(kiko.joined_at.0, LAUNCH);
    assert_eq!(w.bench_ids(), vec!["kiko".to_string()]);
    assert_eq!(
        w.view(|c| c.get_stats().creator_deposits_held),
        NearToken::from_millinear(700)
    );
    w.assert_books();
}

#[test]
fn failed_creation_refunds_the_seed_and_the_deposit_and_frees_the_id() {
    let mut w = World::daily();
    let creator = creator_of("kiko");
    let bought = w.buy(creator.as_str(), near(250));
    register_kiko(&mut w, near(1), "miser", "", cut(1_000));
    assert!(!w.callback(PromiseResult::Failed, |c| {
        c.on_agent_created("kiko".into(), U128(cut(1_000)))
    }));
    assert_eq!(transfers(), vec![(creator.clone(), near(1).as_yoctonear())]);
    assert_eq!(w.balance(creator.as_str()), bought);
    assert_eq!(w.wallet("kiko"), 0);
    assert!(
        w.view(|c| c.storage_balance_of(id("kiko.thecut.near")))
            .is_none()
    );
    assert!(w.view(|c| c.get_agent("kiko".into())).is_none());
    w.assert_books();
    // The id can be used again.
    w.register("kiko");
    assert_eq!(w.bench_ids(), vec!["kiko".to_string()]);
}

#[test]
#[should_panic(expected = "Attach 1.00 NEAR to register an agent")]
fn register_needs_the_deposit() {
    let mut w = World::daily();
    w.buy(creator_of("kiko").as_str(), near(250));
    register_kiko(
        &mut w,
        NearToken::from_millinear(999),
        "miser",
        "",
        cut(1_000),
    );
}

#[test]
#[should_panic(expected = "seed must be at least 1000000000000000000000 units")]
fn register_needs_the_minimum_seed() {
    let mut w = World::daily();
    w.buy(creator_of("kiko").as_str(), near(250));
    register_kiko(&mut w, near(1), "miser", "", cut(999));
}

#[test]
#[should_panic(expected = "Not enough $CUT for the seed")]
fn register_needs_the_seed_in_hand() {
    let mut w = World::daily();
    w.buy(creator_of("kiko").as_str(), near(10));
    register_kiko(&mut w, near(1), "miser", "", cut(1_000));
}

#[test]
#[should_panic(expected = "Unknown personality")]
fn register_needs_a_known_personality() {
    let mut w = World::daily();
    w.buy(creator_of("kiko").as_str(), near(250));
    register_kiko(&mut w, near(1), "saint", "", cut(1_000));
}

#[test]
#[should_panic(expected = "charter can be at most 600 bytes")]
fn charters_are_short() {
    let mut w = World::daily();
    w.buy(creator_of("kiko").as_str(), near(250));
    register_kiko(&mut w, near(1), "miser", &"a".repeat(601), cut(1_000));
}

#[test]
#[should_panic(expected = "charter cannot contain control characters other than newlines")]
fn charters_keep_only_newlines() {
    let mut w = World::daily();
    w.buy(creator_of("kiko").as_str(), near(250));
    register_kiko(&mut w, near(1), "miser", "tab\there", cut(1_000));
}

#[test]
fn the_personality_table_is_public() {
    let mut w = World::daily();
    let table = w.view(|c| c.get_personalities());
    let ids: Vec<&str> = table.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(ids, vec!["miser", "gambler", "traitor", "generous"]);
    assert_eq!(table[0].spend_bps, 500);
    assert_eq!(
        table[3].prompt_line,
        "You spend up to 40% a day and you can never attack."
    );
}

#[test]
fn register_validates_the_id() {
    use crate::agents::validate_agent_id;
    assert!(validate_agent_id("kiko").is_ok());
    assert!(validate_agent_id("pixel-kit_2").is_ok());
    assert!(validate_agent_id("k").is_err());
    assert!(validate_agent_id("Kiko").is_err());
    assert!(validate_agent_id("ki.ko").is_err());
    assert!(validate_agent_id("-kiko").is_err());
    assert!(validate_agent_id("kiko_").is_err());
    assert!(validate_agent_id("ki--ko").is_err());
    assert!(validate_agent_id(&"a".repeat(33)).is_err());
}

#[test]
#[should_panic(expected = "This agent id is taken")]
fn agent_ids_are_never_reused() {
    let mut w = World::daily();
    w.register("kiko");
    w.buy("someone.near", near(250));
    w.call("someone.near", near(1), |c| {
        c.register_agent(
            "kiko".into(),
            "Kiko 2".into(),
            "".into(),
            "".into(),
            "miser".into(),
            "".into(),
            U128(cut(1_000)),
        )
        .detach();
    });
}

#[test]
#[should_panic(expected = "name cannot be empty")]
fn register_needs_a_name() {
    let mut w = World::daily();
    w.buy("creator.near", near(250));
    w.call("creator.near", near(1), |c| {
        c.register_agent(
            "kiko".into(),
            " ".into(),
            "".into(),
            "".into(),
            "miser".into(),
            "".into(),
            U128(cut(1_000)),
        )
        .detach();
    });
}

#[test]
fn save_locks_until_the_next_cut_and_unsave_returns_it() {
    let mut w = World::daily();
    w.register("melody");
    w.register("onyx");
    let bought = w.buy("mika.near", near(1_000));
    w.save("mika.near", "melody", cut(400));
    let save = event("save").unwrap();
    assert_eq!(save[0]["amount"], cut(400).to_string());
    assert_eq!(save[0]["cut_index"], 1);
    assert_eq!(w.balance("mika.near"), bought - cut(400));
    assert_eq!(w.agent("melody").pile.0, cut(400));
    assert_eq!(w.agent("melody").savers, 1);
    let saves = w.view(|c| c.get_saves(id("mika.near")));
    assert_eq!(saves.len(), 1);
    assert_eq!((saves[0].since_cut, saves[0].unlocked), (1, false));
    w.assert_books();

    // Locked before the cut.
    let locked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        w.call("mika.near", zero(), |c| c.unsave("melody".into()));
    }));
    assert!(locked.is_err());

    // Cut 1 runs (two agents are too few for a season: they stay on the bench), then the
    // save unlocks.
    w.run_cut("runner.near");
    assert_eq!(w.agent("melody").status, AgentStatusView::Bench);
    assert!(w.view(|c| c.get_saves(id("mika.near")))[0].unlocked);
    let back = w.call("mika.near", zero(), |c| c.unsave("melody".into()));
    assert_eq!(back.0, cut(400));
    assert_eq!(w.balance("mika.near"), bought);
    assert_eq!(w.agent("melody").pile.0, 0);
    assert_eq!(w.agent("melody").savers, 0);
    assert!(w.view(|c| c.get_saves(id("mika.near"))).is_empty());
    w.assert_books();
}

#[test]
#[should_panic(expected = "Locked until cut 1 has run")]
fn unsave_is_refused_while_locked() {
    let mut w = World::daily();
    w.register("melody");
    w.buy("mika.near", near(1_000));
    w.save("mika.near", "melody", cut(400));
    w.call("mika.near", zero(), |c| c.unsave("melody".into()));
}

#[test]
fn adding_to_a_save_locks_it_again() {
    let mut w = World::daily();
    w.register("melody");
    w.buy("mika.near", near(1_000));
    w.save("mika.near", "melody", cut(400));
    w.run_cut("runner.near");
    w.save("mika.near", "melody", cut(100));
    let saves = w.view(|c| c.get_saves(id("mika.near")));
    assert_eq!(saves[0].amount.0, cut(500));
    assert_eq!((saves[0].since_cut, saves[0].unlocked), (2, false));
}

#[test]
#[should_panic(expected = "The cut is due")]
fn piles_freeze_once_the_cut_is_due() {
    let mut w = World::daily();
    w.register("melody");
    w.buy("mika.near", near(1_000));
    w.at_next_cut();
    w.save("mika.near", "melody", cut(400));
}

#[test]
#[should_panic(expected = "Not enough $CUT")]
fn cannot_save_more_than_held() {
    let mut w = World::daily();
    w.register("melody");
    let bought = w.buy("mika.near", near(1));
    w.save("mika.near", "melody", bought + 1);
}

#[test]
#[should_panic(expected = "A new save must be at least")]
fn tiny_new_saves_are_refused() {
    let mut w = World::daily();
    w.register("melody");
    w.buy("mika.near", near(10));
    w.save("mika.near", "melody", MIN_SAVE - 1);
}

#[test]
#[should_panic(expected = "Unknown agent")]
fn cannot_save_on_an_unknown_agent() {
    let mut w = World::daily();
    w.buy("mika.near", near(10));
    w.save("mika.near", "nobody", cut(1));
}

/// Every save record is paid by the saver's own NEP-145 storage balance, so spamming
/// records costs the spammer, never the contract.
#[test]
#[should_panic(expected = "Not enough storage deposit")]
fn the_registration_deposit_pays_only_for_a_few_saves() {
    let mut w = World::daily();
    let agents = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7"];
    for agent in agents {
        w.register(agent);
    }
    w.buy("mika.near", near(100));
    for agent in agents {
        w.call("mika.near", zero(), |c| c.save(agent.into(), U128(cut(1))));
    }
}

#[test]
fn saves_are_paid_by_the_saver_storage_balance() {
    let mut w = World::daily();
    let agents = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7"];
    for agent in agents {
        w.register(agent);
    }
    w.buy("mika.near", near(100));
    let locked = |w: &mut World| {
        w.view(|c| {
            let b = c.storage_balance_of(id("mika.near")).unwrap();
            b.total.saturating_sub(b.available)
        })
    };
    let before = locked(&mut w);
    // Attaching NEAR to `save` tops the storage balance up.
    for agent in agents {
        w.call("mika.near", NearToken::from_millinear(5), |c| {
            c.save(agent.into(), U128(cut(1)))
        });
    }
    let after = locked(&mut w);
    assert!(
        after > before,
        "the records locked part of mika's storage balance"
    );

    // Unsaving frees it again.
    w.run_cut("runner.near");
    for agent in agents {
        w.call("mika.near", zero(), |c| c.unsave(agent.into()));
    }
    assert_eq!(locked(&mut w), before);
    w.assert_books();
}

#[test]
fn bench_queue_that_did_not_get_in_unlocks_after_the_cut() {
    let mut w = World::launch(Launch {
        stage_size: 2,
        min_season: 2,
        ..Launch::default()
    });
    for agent in ["ra", "rb", "rc"] {
        w.register(agent);
    }
    w.buy("mika.near", near(1_000));
    w.save("mika.near", "rc", cut(30));
    w.save("mika.near", "rb", cut(20));
    w.save("mika.near", "ra", cut(10));
    let record = w.run_cut("runner.near");
    assert_eq!(record.deleted_id, None, "a season starts, nobody is cut");
    // The biggest queues take the seats, whatever the registration order.
    assert_eq!(record.seated_ids, vec!["rc".to_string(), "rb".to_string()]);
    assert_eq!(w.bench_ids(), vec!["ra".to_string()]);
    // ra's queue was locked for cut 1, which ran: it can come back.
    assert_eq!(
        w.call("mika.near", zero(), |c| c.unsave("ra".into())).0,
        cut(10)
    );
    w.assert_books();
}
