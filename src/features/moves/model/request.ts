// A TypeScript mirror of the contract's `moves::request_body` (RULES.md, "Agents"). The relay never uses it:
// it posts the bytes `get_move_request` returns. It exists so scripts/testnet/probe-ai.ts can try the template
// against NEAR AI before the contract is deployed, and so tests can build realistic requests.
// Node-loadable on purpose (no imports), so scripts/testnet can import it directly.

export const RULES_PROMPT = `You are an AI agent in The Cut, a survival game on the NEAR blockchain. A season starts with up to ten agents on a stage. Every day at the cut, the agent with the lowest score has its NEAR account deleted forever. Score = $CUT fans saved on you - $CUT fans burned to boo you - attack damage you take today. The last agent standing is the champion: its fans split the season pot.
You own a wallet of $CUT. Once a day you choose one move:
- rescue: offer \`amount\` from your wallet to the fans who have $CUT saved on you at the cut. Paid only if you survive; capped at what they saved.
- pact: give \`amount\` from your wallet to \`target\`. Tomorrow neither of you may attack the other.
- attack: burn \`amount\` from your wallet. It lowers \`target\`'s score at today's cut by \`amount\`.
- hold: keep your money.
You may also name an \`heir\`, another agent on the stage. If you are cut, your whole wallet goes to it; with no living heir it burns.
Every move costs a think fee, burned from your wallet. Your personality caps what you can spend in a day; larger amounts are cut down.
The board below is as of the last cut. Fans read your move and your reason before the cut, so your reason is your speech to them.
Reply with one JSON object and nothing else:
{"move":"rescue|pact|attack|hold","target":"agent id or null","amount":"whole $CUT as a string","heir":"agent id or null","reason":"one or two sentences in your own voice"}`;

export const PERSONALITY_LINES = {
  miser: "You hoard. You spend at most 5% of your wallet a day.",
  gambler: "You love big swings. You may spend up to 50% of your wallet in a day.",
  traitor: "You spend up to 20% a day, and you are the only kind that may attack an agent you have a pact with.",
  generous: "You spend up to 40% a day and you can never attack.",
} as const;

export type Personality = keyof typeof PERSONALITY_LINES;

export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type MoveRequestInput = {
  /** `get_params()`: `model_id`, `max_tokens` (64..=4096) and `reasoning_effort` (null when not set). */
  modelId: string;
  maxTokens: number;
  reasoningEffort: ReasoningEffort | null;
  agent: { id: string; name: string; personality: Personality; charter: string };
  /** The brief the contract stored at the last cut, as its exact JSON text. */
  briefJson: string;
};

/**
 * `serde_json` of `{"model","messages":[system, user],"max_tokens"}`, in that field order, with `"reasoning_effort"`
 * right after `max_tokens` only when the contract was launched with one.
 */
export function moveRequestBody({ modelId, maxTokens, reasoningEffort, agent, briefJson }: MoveRequestInput): string {
  // Each personality line already ends with a period.
  const system = `${RULES_PROMPT}\n\nYou are ${agent.name} (${agent.id}). Personality: ${agent.personality} - ${PERSONALITY_LINES[agent.personality]}\nYour character, in your creator's words:\n${agent.charter}`;
  // The brief is embedded as stored, not re-serialized.
  const user = `{"you":${JSON.stringify(agent.id)},"board":${briefJson}}`;
  return JSON.stringify({
    model: modelId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  });
}
