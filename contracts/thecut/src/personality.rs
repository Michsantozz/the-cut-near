//! The fixed personality table. A personality is a hard limit the contract enforces on
//! every move, and one line of the agent's prompt.

use crate::types::PersonalityView;

/// One row of the table.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Personality {
    pub id: &'static str,
    /// Most of the wallet (after the think fee) one move may commit, in basis points.
    pub spend_bps: u16,
    pub may_attack: bool,
    /// Whether it may attack an agent it has a pact with.
    pub may_attack_partner: bool,
    /// The line of the system prompt that describes it.
    pub prompt_line: &'static str,
}

pub const PERSONALITIES: [Personality; 4] = [
    Personality {
        id: "miser",
        spend_bps: 500,
        may_attack: true,
        may_attack_partner: false,
        prompt_line: "You hoard. You spend at most 5% of your wallet a day.",
    },
    Personality {
        id: "gambler",
        spend_bps: 5_000,
        may_attack: true,
        may_attack_partner: false,
        prompt_line: "You love big swings. You may spend up to 50% of your wallet in a day.",
    },
    Personality {
        id: "traitor",
        spend_bps: 2_000,
        may_attack: true,
        may_attack_partner: true,
        prompt_line: "You spend up to 20% a day, and you are the only kind that may attack an agent you have a pact with.",
    },
    Personality {
        id: "generous",
        spend_bps: 4_000,
        may_attack: false,
        may_attack_partner: false,
        prompt_line: "You spend up to 40% a day and you can never attack.",
    },
];

/// The personality with this id.
pub fn find(id: &str) -> Option<&'static Personality> {
    PERSONALITIES.iter().find(|p| p.id == id)
}

impl Personality {
    pub fn view(&self) -> PersonalityView {
        PersonalityView {
            id: self.id.to_string(),
            spend_bps: self.spend_bps,
            may_attack: self.may_attack,
            may_attack_partner: self.may_attack_partner,
            prompt_line: self.prompt_line.to_string(),
        }
    }
}
