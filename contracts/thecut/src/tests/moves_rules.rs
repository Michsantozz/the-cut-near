//! Pure move rules: the canonical request, reading the model's answer and the personality
//! limits.

use super::cut;
use crate::moves::*;
use crate::personality::{self, PERSONALITIES};
use crate::types::MoveKind;
use near_sdk::serde_json::{Value, json};

fn persona(id: &str) -> &'static crate::personality::Personality {
    personality::find(id).unwrap()
}

fn parsed(kind: Option<MoveKind>, target: Option<&str>, whole: u128) -> ParsedMove {
    ParsedMove {
        kind,
        target: target.map(str::to_string),
        asked_whole: whole,
        heir: None,
        reason: String::new(),
    }
}

#[test]
fn the_request_has_the_spec_shape_and_field_order() {
    let mut w = super::World::daily();
    let mut params = w.view(|c| c.get_params());
    let body = request_body(
        &params,
        "kiko",
        "Kiko",
        persona("traitor"),
        "Loyal to nobody.\nLoves chaos.",
        r#"{"season":1,"day":3}"#,
    );
    assert!(body.starts_with(r#"{"model":"z-ai/glm-5.3-flash","messages":[{"role":"system","content":"You are an AI agent in The Cut"#));
    assert!(body.ends_with(r#""}],"max_tokens":1200,"reasoning_effort":"low"}"#));
    let value: Value = near_sdk::serde_json::from_str(&body).unwrap();
    let system = value["messages"][0]["content"].as_str().unwrap();
    assert!(system.starts_with(RULES_PROMPT));
    assert!(system.ends_with(
        "\n\nYou are Kiko (kiko). Personality: traitor - You spend up to 20% a day, and you are the only kind that may attack an agent you have a pact with.\nYour character, in your creator's words:\nLoyal to nobody.\nLoves chaos."
    ));
    assert_eq!(value["messages"][1]["role"], "user");
    assert_eq!(
        value["messages"][1]["content"],
        r#"{"you":"kiko","board":{"season":1,"day":3}}"#
    );
    // Without a reasoning effort the field is left out.
    params.reasoning_effort = None;
    let body = request_body(&params, "kiko", "Kiko", persona("miser"), "", "null");
    assert!(body.ends_with(r#""}],"max_tokens":1200}"#));
    let value: Value = near_sdk::serde_json::from_str(&body).unwrap();
    assert!(value["messages"][0]["content"].as_str().unwrap().ends_with(
        "Personality: miser - You hoard. You spend at most 5% of your wallet a day.\nYour character, in your creator's words:\n"
    ));
    // The rules end with the answer format the parser reads.
    assert!(RULES_PROMPT.ends_with(r#""reason":"one or two sentences in your own voice"}"#));
}

#[test]
fn hex_round_trips() {
    assert_eq!(to_hex(&[0, 15, 255]), "000fff");
    assert_eq!(from_hex("000fff"), Some(vec![0, 15, 255]));
    // Lowercase only, without a prefix.
    assert_eq!(from_hex("000FFF"), None);
    assert_eq!(from_hex("0x0a"), None);
    assert_eq!(from_hex("abc"), None);
    assert_eq!(from_hex("zz"), None);
}

#[test]
fn amounts_keep_only_the_whole_part() {
    assert_eq!(whole_amount(&json!("120")), 120);
    assert_eq!(whole_amount(&json!("120.99")), 120);
    assert_eq!(whole_amount(&json!(" 1,200 $CUT")), 1_200);
    assert_eq!(whole_amount(&json!(75)), 75);
    assert_eq!(whole_amount(&json!(75.9)), 75);
    assert_eq!(whole_amount(&json!(-5)), 0);
    assert_eq!(whole_amount(&json!("-5")), 0);
    assert_eq!(whole_amount(&json!("lots")), 0);
    assert_eq!(whole_amount(&json!(null)), 0);
    assert_eq!(whole_amount(&json!("9".repeat(60))), u128::MAX);
}

#[test]
fn reasons_are_cut_on_a_character_boundary() {
    assert_eq!(truncate("hello", 280), "hello");
    // "é" is two bytes: cutting at 3 bytes keeps "aé" whole... and drops the half.
    assert_eq!(truncate("aéé", 4), "aé");
    assert_eq!(truncate("aéé", 5), "aéé");
}

#[test]
fn a_chat_completion_is_read_leniently() {
    let content = "Sure! Here is my move:\n```json\n{\"move\":\" Attack \",\"target\":\"Pixie\",\"amount\":120.5,\"heir\":\"null\",\"reason\":\"Pixie had it coming.\"}\n```";
    let response = json!({
        "id": "chatcmpl-1",
        "choices": [{ "message": { "role": "assistant", "content": content, "reasoning_content": "{ignored}" } }]
    })
    .to_string();
    let answer = read_answer(&response);
    assert_eq!(answer.chat_id, "chatcmpl-1");
    assert_eq!(
        answer.parsed,
        Some(ParsedMove {
            kind: Some(MoveKind::Attack),
            target: Some("pixie".into()),
            asked_whole: 120,
            heir: None,
            reason: "Pixie had it coming.".into(),
        })
    );
}

#[test]
fn unreadable_answers_never_panic() {
    for response in [
        "",
        "not json",
        "{}",
        r#"{"id":5,"choices":[]}"#,
        r#"{"id":"x","choices":[{"message":{"content":"I refuse to play."}}]}"#,
        r#"{"id":"x","choices":[{"message":{"content":"} backwards {"}}]}"#,
        r#"{"id":"x","choices":[{"message":{"content":"{\"move\": broken"}}]}"#,
        r#"{"id":"x","choices":[{"message":{"content":"[1,2]{3}"}}]}"#,
        r#"{"id":"x","choices":[{"message":{"content":null}}]}"#,
    ] {
        assert_eq!(read_answer(response).parsed, None, "{response}");
    }
    // A readable object with a move outside the four: read, then downgraded by `decide`.
    let odd = read_answer(
        r#"{"id":"x","choices":[{"message":{"content":"{\"move\":\"dance\",\"reason\":\"why not\"}"}}]}"#,
    );
    assert_eq!(odd.parsed.as_ref().unwrap().kind, None);
    let long = "é".repeat(400);
    let answer = read_answer(
        &json!({ "id": "x".repeat(300), "choices": [{ "message": { "content": json!({ "move": "hold", "reason": long }).to_string() } }] })
            .to_string(),
    );
    assert_eq!(answer.chat_id.len(), crate::MAX_CHAT_ID);
    assert_eq!(answer.parsed.unwrap().reason.len(), 280);
}

#[test]
fn each_personality_has_its_limits() {
    let table: Vec<(&str, u16, bool, bool)> = PERSONALITIES
        .iter()
        .map(|p| (p.id, p.spend_bps, p.may_attack, p.may_attack_partner))
        .collect();
    assert_eq!(
        table,
        vec![
            ("miser", 500, true, false),
            ("gambler", 5_000, true, false),
            ("traitor", 2_000, true, true),
            ("generous", 4_000, false, false),
        ]
    );
}

#[test]
fn decide_clamps_and_downgrades() {
    let stage: Vec<String> = ["kiko", "pixie", "onyx"].map(String::from).to_vec();
    let pacts = vec!["pixie".to_string()];
    let cap = cut(50);

    // Unreadable and unknown moves hold.
    let d = decide(None, "kiko", persona("gambler"), &[], &stage, cap);
    assert_eq!((d.kind, d.amount), (MoveKind::Hold, 0));
    assert_eq!(d.outcome.as_deref(), Some("unreadable answer"));
    let d = decide(
        Some(&parsed(None, None, 5)),
        "kiko",
        persona("gambler"),
        &[],
        &stage,
        cap,
    );
    assert_eq!(d.outcome.as_deref(), Some("downgraded: unknown move"));

    // A rescue asking too much is clamped; a hold commits nothing.
    let d = decide(
        Some(&parsed(Some(MoveKind::Rescue), Some("onyx"), 80)),
        "kiko",
        persona("gambler"),
        &[],
        &stage,
        cap,
    );
    assert_eq!(
        (d.kind, d.target.as_deref(), d.amount),
        (MoveKind::Rescue, None, cap)
    );
    assert_eq!(
        d.outcome.as_deref(),
        Some("clamped: a gambler spends at most 50% of its wallet a day")
    );
    let d = decide(
        Some(&parsed(Some(MoveKind::Rescue), None, 20)),
        "kiko",
        persona("gambler"),
        &[],
        &stage,
        cap,
    );
    assert_eq!((d.amount, d.outcome), (cut(20), None));
    let d = decide(
        Some(&parsed(Some(MoveKind::Hold), Some("onyx"), 20)),
        "kiko",
        persona("gambler"),
        &[],
        &stage,
        cap,
    );
    assert_eq!((d.kind, d.amount, d.outcome), (MoveKind::Hold, 0, None));

    // Targets must be another agent on the stage.
    let no_target = decide(
        Some(&parsed(Some(MoveKind::Pact), None, 5)),
        "kiko",
        persona("miser"),
        &[],
        &stage,
        cap,
    );
    assert_eq!(no_target.outcome.as_deref(), Some("downgraded: no target"));
    let itself = decide(
        Some(&parsed(Some(MoveKind::Attack), Some("kiko"), 5)),
        "kiko",
        persona("miser"),
        &[],
        &stage,
        cap,
    );
    assert_eq!(
        itself.outcome.as_deref(),
        Some("downgraded: an agent cannot target itself")
    );
    let gone = decide(
        Some(&parsed(Some(MoveKind::Pact), Some("melody"), 5)),
        "kiko",
        persona("miser"),
        &[],
        &stage,
        cap,
    );
    assert_eq!(
        gone.outcome.as_deref(),
        Some("downgraded: the target is not on the stage")
    );

    // Generous agents never attack; only traitors attack a pact partner.
    let generous = decide(
        Some(&parsed(Some(MoveKind::Attack), Some("onyx"), 5)),
        "kiko",
        persona("generous"),
        &[],
        &stage,
        cap,
    );
    assert_eq!(
        generous.outcome.as_deref(),
        Some("downgraded: generous agents cannot attack")
    );
    let partner = decide(
        Some(&parsed(Some(MoveKind::Attack), Some("pixie"), 5)),
        "kiko",
        persona("gambler"),
        &pacts,
        &stage,
        cap,
    );
    assert_eq!(partner.kind, MoveKind::Hold);
    assert_eq!(
        partner.outcome.as_deref(),
        Some("downgraded: only a traitor may attack a pact partner")
    );
    let traitor = decide(
        Some(&parsed(Some(MoveKind::Attack), Some("pixie"), 5)),
        "kiko",
        persona("traitor"),
        &pacts,
        &stage,
        cap,
    );
    assert_eq!(
        (traitor.kind, traitor.target.as_deref(), traitor.amount),
        (MoveKind::Attack, Some("pixie"), cut(5))
    );
    let pact = decide(
        Some(&parsed(Some(MoveKind::Pact), Some("pixie"), 5)),
        "kiko",
        persona("generous"),
        &pacts,
        &stage,
        cap,
    );
    assert_eq!((pact.kind, pact.amount), (MoveKind::Pact, cut(5)));
}
