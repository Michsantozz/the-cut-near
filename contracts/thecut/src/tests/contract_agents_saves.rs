//! Agent registration, saves, locks and storage.

use super::*;
use crate::types::AgentStatusView;
use crate::{MIN_SAVE, AGENT_WASM};

#[test]
fn register_creates_a_keyless_agent_account_on_the_bench() {
    let mut w = World::daily();
    let creator = creator_of("kiko");
    let promise_made = w.call(creator.as_str(), near(6), |c| {
        c.register_agent(
            "kiko".into(),
            "Kiko Bun".into(),
            "VTuber".into(),
            "@KikoBunCut".into(),
        )
        .detach();
    });
    let _ = promise_made;
    // The excess 1 NEAR comes back right away.
    assert!(transfers().contains(&(creator.clone(), near(1).as_yoctonear())));
    let receipts = get_created_receipts();
    let agent_receipt = receipts
        .iter()
        .find(|r| r.receiver_id.as_str() == "kiko.thecut.near")
        .expect("agent account receipt");
    let actions = &agent_receipt.actions;
    assert!(matches!(actions[0], MockAction::CreateAccount { .. }));
    assert!(
        matches!(actions[1], MockAction::Transfer { deposit, .. } if deposit == NearToken::from_millinear(500))
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
        c.on_agent_created("kiko".into())
    }));
    let register = event("register").unwrap();
    assert_eq!(register[0]["agent_id"], "kiko");
    assert_eq!(register[0]["account_id"], "kiko.thecut.near");
    assert_eq!(register[0]["creator"], creator.as_str());
    let kiko = w.agent("kiko");
    assert_eq!(kiko.status, AgentStatusView::Bench);
    assert_eq!(kiko.account_id.as_str(), "kiko.thecut.near");
    assert_eq!(
        (
            kiko.name.as_str(),
            kiko.kind.as_str(),
            kiko.x_handle.as_str()
        ),
        ("Kiko Bun", "VTuber", "@KikoBunCut")
    );
    assert_eq!(kiko.joined_at.0, LAUNCH);
    assert_eq!(w.bench_ids(), vec!["kiko".to_string()]);
    assert_eq!(
        w.view(|c| c.get_stats().creator_deposits_held),
        NearToken::from_millinear(4_500)
    );
}

#[test]
fn failed_creation_refunds_the_deposit_and_frees_the_id() {
    let mut w = World::daily();
    let creator = creator_of("kiko");
    w.call(creator.as_str(), near(5), |c| {
        c.register_agent("kiko".into(), "Kiko".into(), "VTuber".into(), "".into())
            .detach();
    });
    assert!(!w.callback(PromiseResult::Failed, |c| c.on_agent_created("kiko".into())));
    assert_eq!(transfers(), vec![(creator, near(5).as_yoctonear())]);
    assert!(w.view(|c| c.get_agent("kiko".into())).is_none());
    // The id can be used again.
    w.register("kiko");
    assert_eq!(w.bench_ids(), vec!["kiko".to_string()]);
}

#[test]
#[should_panic(expected = "Attach 5.00 NEAR to register an agent")]
fn register_needs_the_deposit() {
    let mut w = World::daily();
    w.call("creator.near", near(4), |c| {
        c.register_agent("kiko".into(), "Kiko".into(), "VTuber".into(), "".into())
            .detach();
    });
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
    w.call("someone.near", near(5), |c| {
        c.register_agent("kiko".into(), "Kiko 2".into(), "VTuber".into(), "".into())
            .detach();
    });
}

#[test]
#[should_panic(expected = "name cannot be empty")]
fn register_needs_a_name() {
    let mut w = World::daily();
    w.call("creator.near", near(5), |c| {
        c.register_agent("kiko".into(), " ".into(), "VTuber".into(), "".into())
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

    // Cut 1 seats both agents (the stage was empty), then the save unlocks.
    w.run_cut("runner.near");
    assert_eq!(w.agent("melody").status, AgentStatusView::Stage);
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
    assert_eq!(
        record.deleted_id, None,
        "the stage was empty, nobody is cut"
    );
    // The biggest queues take the seats, whatever the registration order.
    assert_eq!(record.joined_ids, vec!["rc".to_string(), "rb".to_string()]);
    assert_eq!(w.bench_ids(), vec!["ra".to_string()]);
    // ra's queue was locked for cut 1, which ran: it can come back.
    assert_eq!(
        w.call("mika.near", zero(), |c| c.unsave("ra".into())).0,
        cut(10)
    );
    w.assert_books();
}
