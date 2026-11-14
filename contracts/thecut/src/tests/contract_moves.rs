//! `submit_move`: the signature check, the think fee, clamping, downgrades and pacts.

use super::*;
use crate::types::MoveKind;

/// Day 1 of a season: five agents, every wallet holding its 1,000 $CUT seed. `zed` has the
/// smallest pile, so it is the one cut at cut 2 unless a test changes that.
fn day_one() -> World {
    season_with(&[
        ("kiko", "gambler", cut(500)),
        ("pixie", "miser", cut(400)),
        ("onyx", "generous", cut(300)),
        ("melody", "traitor", cut(200)),
        ("zed", "miser", cut(100)),
    ])
}

/// The request for `agent`, a completion answering `content`, and the model's signature.
fn signed(w: &mut World, agent: &str, content: &str) -> (String, String, String) {
    let request = w
        .view(|c| c.get_move_request(agent.to_string()))
        .expect("agent can move");
    let response = completion("chatcmpl-x", content);
    let signature = sign(&model_key(), &request, &response);
    (request, response, signature)
}

fn relay(
    w: &mut World,
    agent: &str,
    response: String,
    signature: String,
    signer: String,
) -> MoveView {
    w.call("relay.near", zero(), |c| {
        c.submit_move(agent.to_string(), response, signature, signer)
    })
}

#[test]
fn a_valid_move_burns_the_fee_and_commits_the_amount() {
    let mut w = day_one();
    let supply = w.supply();
    let (request, response, signature) = signed(
        &mut w,
        "kiko",
        &answer("rescue", None, "200", Some("pixie")),
    );
    let view = relay(
        &mut w,
        "kiko",
        response.clone(),
        signature,
        key_hex(&model_key()),
    );

    assert_eq!((view.cut_index, view.agent_id.as_str()), (2, "kiko"));
    assert_eq!(
        (view.kind, view.target.as_deref()),
        (MoveKind::Rescue, None)
    );
    assert_eq!((view.amount.0, view.asked_amount.0), (cut(200), cut(200)));
    assert_eq!(view.heir.as_deref(), Some("pixie"));
    assert_eq!(
        (view.reason.as_str(), view.outcome.as_deref()),
        ("I rescue.", None)
    );
    assert_eq!(view.chat_id, "chatcmpl-x");
    assert_eq!(
        view.request_sha256,
        to_hex(&env::sha256_array(request.as_bytes()))
    );
    assert_eq!(
        view.response_sha256,
        to_hex(&env::sha256_array(response.as_bytes()))
    );
    assert_eq!(view.signer, key_hex(&model_key()));
    assert_eq!(view.submitted_by.as_str(), "relay.near");
    assert_eq!(view.submitted_at.0, w.now);

    // The think fee burned from the agent account; the amount moved to the contract.
    let all = events();
    assert!(all.iter().any(|(s, e, d)| s == "nep141"
        && e == "ft_burn"
        && d[0]["owner_id"] == "kiko.thecut.near"
        && d[0]["amount"] == cut(10).to_string()));
    assert!(all.iter().any(|(_, e, d)| e == "ft_transfer"
        && d[0]["old_owner_id"] == "kiko.thecut.near"
        && d[0]["new_owner_id"] == "thecut.near"
        && d[0]["amount"] == cut(200).to_string()));
    let moved = event("move").unwrap();
    assert_eq!(moved[0]["move"], "rescue");
    assert_eq!(moved[0]["think_fee"], cut(10).to_string());
    assert_eq!(moved[0]["heir"], "pixie");
    assert_eq!(w.supply(), supply - cut(10));
    assert_eq!(w.wallet("kiko"), cut(790));
    assert_eq!(w.view(|c| c.get_stats().committed.0), cut(200));

    let kiko = w.agent("kiko");
    assert!(kiko.moved);
    assert_eq!(
        (kiko.bounty.0, kiko.heir.as_deref()),
        (cut(200), Some("pixie"))
    );
    assert_eq!(kiko.wallet.0, cut(790));
    assert_eq!(w.view(|c| c.get_moves(2)), vec![view]);
    assert!(w.view(|c| c.get_moves(1)).is_empty());
    // A moved agent has no request until the next cut.
    assert_eq!(w.view(|c| c.get_move_request("kiko".into())), None);
    w.assert_books();
}

#[test]
fn get_move_request_is_the_signed_request() {
    let mut w = day_one();
    let request = w.view(|c| c.get_move_request("onyx".into())).unwrap();
    let brief = w.view(|c| c.get_brief()).unwrap();
    let params = w.view(|c| c.get_params());
    let expected = crate::moves::request_body(
        &params,
        "onyx",
        "Agent onyx",
        crate::personality::find("generous").unwrap(),
        "I am onyx.\nI never give up.",
        &brief,
    );
    assert_eq!(request, expected);
    // Only stage agents of a running season get one.
    assert_eq!(w.view(|c| c.get_move_request("nobody".into())), None);
}

#[test]
#[should_panic(expected = "signer is not one of model_signers")]
fn a_wrong_signer_is_refused() {
    let mut w = day_one();
    let request = w.view(|c| c.get_move_request("kiko".into())).unwrap();
    let response = completion("chatcmpl-x", &answer("hold", None, "0", None));
    let signature = sign(&stranger_key(), &request, &response);
    relay(
        &mut w,
        "kiko",
        response,
        signature,
        key_hex(&stranger_key()),
    );
}

#[test]
#[should_panic(expected = "The signature does not match")]
fn a_signature_by_another_key_is_refused() {
    let mut w = day_one();
    let request = w.view(|c| c.get_move_request("kiko".into())).unwrap();
    let response = completion("chatcmpl-x", &answer("hold", None, "0", None));
    let signature = sign(&stranger_key(), &request, &response);
    relay(&mut w, "kiko", response, signature, key_hex(&model_key()));
}

#[test]
#[should_panic(expected = "The signature does not match")]
fn a_tampered_response_is_refused() {
    let mut w = day_one();
    let (_, response, signature) = signed(&mut w, "kiko", &answer("rescue", None, "10", None));
    let tampered = response.replace("\\\"10\\\"", "\\\"490\\\"");
    assert_ne!(tampered, response);
    relay(&mut w, "kiko", tampered, signature, key_hex(&model_key()));
}

#[test]
#[should_panic(expected = "The signature does not match")]
fn a_signature_for_another_agent_is_refused() {
    // The request differs per agent, so pixie's signed answer cannot move kiko.
    let mut w = day_one();
    let (_, response, signature) = signed(&mut w, "pixie", &answer("hold", None, "0", None));
    relay(&mut w, "kiko", response, signature, key_hex(&model_key()));
}

#[test]
#[should_panic(expected = "signer must be a 32-byte key as 64 lowercase hex characters")]
fn malformed_hex_is_refused() {
    let mut w = day_one();
    let (_, response, signature) = signed(&mut w, "kiko", &answer("hold", None, "0", None));
    relay(
        &mut w,
        "kiko",
        response,
        signature,
        key_hex(&model_key()).to_uppercase(),
    );
}

#[test]
fn moves_close_before_the_cut() {
    let mut w = day_one();
    let (_, response, signature) = signed(&mut w, "kiko", &answer("hold", None, "0", None));
    let closes = w.view(|c| c.get_next_cut().moves_close_at.0);
    assert_eq!(closes, w.view(|c| c.get_next_cut().at.0) - HOUR);
    w.now = closes;
    assert_eq!(w.view(|c| c.get_move_request("kiko".into())), None);
    let refused = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        relay(&mut w, "kiko", response, signature, key_hex(&model_key()))
    }));
    assert!(refused.is_err());
    assert_eq!(w.wallet("kiko"), cut(1_000));
}

#[test]
#[should_panic(expected = "Moves for cut 2 closed at")]
fn a_move_after_moves_close_fails_with_the_time() {
    let mut w = day_one();
    let (_, response, signature) = signed(&mut w, "kiko", &answer("hold", None, "0", None));
    w.now = w.view(|c| c.get_next_cut().moves_close_at.0);
    relay(&mut w, "kiko", response, signature, key_hex(&model_key()));
}

#[test]
#[should_panic(expected = "kiko already moved for cut 2: one move per agent per cut")]
fn a_second_move_for_the_same_cut_is_refused() {
    let mut w = day_one();
    let (_, response, signature) = signed(&mut w, "kiko", &answer("hold", None, "0", None));
    relay(
        &mut w,
        "kiko",
        response.clone(),
        signature.clone(),
        key_hex(&model_key()),
    );
    relay(&mut w, "kiko", response, signature, key_hex(&model_key()));
}

#[test]
#[should_panic(expected = "response is over 32768 bytes")]
fn huge_responses_are_refused() {
    let mut w = day_one();
    let response = completion("chatcmpl-x", &"x".repeat(33_000));
    relay(
        &mut w,
        "kiko",
        response,
        "00".repeat(64),
        key_hex(&model_key()),
    );
}

#[test]
#[should_panic(expected = "Only agents on the stage can move")]
fn bench_agents_cannot_move() {
    let mut w = day_one();
    w.register("late");
    assert_eq!(w.view(|c| c.get_move_request("late".into())), None);
    relay(
        &mut w,
        "late",
        "{}".into(),
        "00".repeat(64),
        key_hex(&model_key()),
    );
}

#[test]
#[should_panic(expected = "No season is running")]
fn nobody_moves_without_a_season() {
    let mut w = World::daily();
    w.register("kiko");
    relay(
        &mut w,
        "kiko",
        "{}".into(),
        "00".repeat(64),
        key_hex(&model_key()),
    );
}

#[test]
fn a_wallet_below_the_think_fee_cannot_move_and_burns_nothing() {
    let mut w = day_one();
    // Drain kiko's wallet to 5 $CUT (as many moves would).
    w.call("thecut.near", zero(), |c| {
        c.burn_cut(&id("kiko.thecut.near"), cut(995), "test drain")
    });
    let supply = w.supply();
    let (_, response, signature) = signed(&mut w, "kiko", &answer("hold", None, "0", None));
    let refused = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        relay(&mut w, "kiko", response, signature, key_hex(&model_key()))
    }));
    let message = *refused.unwrap_err().downcast::<String>().unwrap();
    assert!(
        message.contains("wallet holds 5000000000000000000 units, less than the think fee"),
        "{message}"
    );
    assert_eq!(w.wallet("kiko"), cut(5));
    assert_eq!(w.supply(), supply);
    assert!(!w.agent("kiko").moved);
    assert!(w.view(|c| c.get_moves(2)).is_empty());
}

#[test]
fn unreadable_answers_hold_and_still_pay_the_fee() {
    let mut w = day_one();
    let view = w.submit("kiko", "I would rather not play today.");
    assert_eq!((view.kind, view.amount.0), (MoveKind::Hold, 0));
    assert_eq!(view.reason, "(unreadable answer)");
    assert_eq!(view.outcome.as_deref(), Some("unreadable answer"));
    assert_eq!(w.wallet("kiko"), cut(990));
    assert!(w.agent("kiko").moved);
    w.assert_books();
}

#[test]
fn amounts_are_clamped_per_personality() {
    let mut w = day_one();
    // Miser: 5% of (1,000 - 10) = 49.5 $CUT.
    let miser = w.submit("pixie", &answer("rescue", None, "1000", None));
    assert_eq!(
        (miser.amount.0, miser.asked_amount.0),
        (cut(495) / 10, cut(1_000))
    );
    assert_eq!(
        miser.outcome.as_deref(),
        Some("clamped: a miser spends at most 5% of its wallet a day")
    );
    // Gambler: 50%. Generous: 40%. Traitor: 20%.
    assert_eq!(
        w.submit("kiko", &answer("attack", Some("zed"), "1000", None))
            .amount
            .0,
        cut(495)
    );
    assert_eq!(
        w.submit("onyx", &answer("pact", Some("zed"), "1000", None))
            .amount
            .0,
        cut(396)
    );
    assert_eq!(
        w.submit("melody", &answer("attack", Some("zed"), "1000", None))
            .amount
            .0,
        cut(198)
    );
    assert_eq!(w.wallet("pixie"), cut(990) - cut(495) / 10);
    // Attacks show on the target's score at once.
    let zed = w.agent("zed");
    assert_eq!(zed.damage.0, cut(495 + 198));
    assert_eq!(zed.score.0, cut(100) as i128 - cut(693) as i128);
    w.assert_books();
}

#[test]
fn a_gift_during_the_day_does_not_raise_the_cap() {
    let mut w = day_one();
    // A fan sends kiko 10,000 $CUT after the cut (an ft_transfer_call could still refund it).
    w.buy("fan.near", near(2_000));
    w.transfer("fan.near", &agent_account("kiko"), cut(10_000));
    assert_eq!(w.wallet("kiko"), cut(11_000));
    // The gambler's cap stays 50% of its wallet at the cut, less the fee: (1,000 - 10) / 2.
    let kiko = w.submit("kiko", &answer("attack", Some("zed"), "5000", None));
    assert_eq!(kiko.amount.0, cut(495));
    assert_eq!(w.wallet("kiko"), cut(11_000) - cut(10) - cut(495));
    w.assert_books();
}

#[test]
fn generous_agents_cannot_attack() {
    let mut w = day_one();
    let view = w.submit("onyx", &answer("attack", Some("zed"), "100", None));
    assert_eq!(
        (view.kind, view.target, view.amount.0),
        (MoveKind::Hold, None, 0)
    );
    assert_eq!(
        view.outcome.as_deref(),
        Some("downgraded: generous agents cannot attack")
    );
    assert_eq!(w.agent("zed").damage.0, 0);
    assert_eq!(w.wallet("onyx"), cut(990), "the think fee is still paid");
}

#[test]
fn an_heir_must_be_another_stage_agent_and_null_keeps_the_old_one() {
    let mut w = day_one();
    let view = w.submit("kiko", &answer("hold", None, "0", Some("kiko")));
    assert_eq!(view.heir, None);
    assert_eq!(w.agent("kiko").heir, None);
    w.submit("pixie", &answer("hold", None, "0", Some("onyx")));
    w.submit("onyx", &answer("hold", None, "0", Some("kiko")));
    assert_eq!(w.run_cut("runner.near").deleted_id.as_deref(), Some("zed"));
    // Day 2: a gone agent is ignored, and no heir keeps the old one.
    w.submit("pixie", &answer("hold", None, "0", Some("zed")));
    w.submit("onyx", &answer("hold", None, "0", None));
    assert_eq!(w.agent("pixie").heir.as_deref(), Some("onyx"));
    assert_eq!(w.agent("onyx").heir.as_deref(), Some("kiko"));
}

#[test]
fn a_pact_blocks_attacks_the_next_day_except_for_a_traitor() {
    let mut w = day_one();
    // Day 1: kiko (gambler) and melody (traitor) make pacts.
    w.submit("kiko", &answer("pact", Some("melody"), "50", None));
    let record = w.run_cut("runner.near");
    assert_eq!(record.deleted_id.as_deref(), Some("zed"));
    let pact = events()
        .into_iter()
        .find(|(_, e, _)| e == "pact")
        .unwrap()
        .2;
    assert_eq!(pact[0]["agent_id"], "kiko");
    assert_eq!(pact[0]["target"], "melody");
    assert_eq!(pact[0]["amount"], cut(50).to_string());
    assert_eq!(w.agent("kiko").pacts, vec!["melody".to_string()]);
    assert_eq!(w.agent("melody").pacts, vec!["kiko".to_string()]);
    let agent_slice = record.agent_slice.0;
    assert_eq!(w.wallet("melody"), cut(1_050) + agent_slice);

    // Day 2: the gambler cannot attack its partner; the traitor can.
    let kiko = w.submit("kiko", &answer("attack", Some("melody"), "10", None));
    assert_eq!(kiko.kind, MoveKind::Hold);
    assert_eq!(
        kiko.outcome.as_deref(),
        Some("downgraded: only a traitor may attack a pact partner")
    );
    let melody = w.submit("melody", &answer("attack", Some("kiko"), "10", None));
    assert_eq!((melody.kind, melody.amount.0), (MoveKind::Attack, cut(10)));

    // Pacts last one day: the next cut replaces the lists (nobody made a pact on day 2).
    w.run_cut("runner.near");
    assert!(w.agent("kiko").pacts.is_empty());
    w.assert_books();
}
