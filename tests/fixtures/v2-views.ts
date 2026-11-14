// Raw v2 contract views (docs/contract-interface.md), as a fake chain returns them, for integration tests.

export const CUT = 10n ** 18n;

/** An ISO time as the interface's nanosecond string. */
export const ns = (iso: string) => (BigInt(Date.parse(iso)) * 1_000_000n).toString();

/** `get_params()` on the daily testnet contract; `overrides` replace fields. */
export function paramsView(overrides: Record<string, unknown> = {}) {
  return {
    total_supply: (10_000_000n * CUT).toString(),
    fee_bps: 100,
    pot_bps: 5000,
    burn_bps: 5000,
    savers_bps: 9000,
    agents_bps: 500,
    stage_size: 10,
    min_season: 3,
    first_cut_at: ns("2026-11-13T18:00:00Z"),
    cut_interval: "86400000000000",
    move_lead: "3600000000000",
    think_fee: (10n * CUT).toString(),
    min_seed: (1_000n * CUT).toString(),
    agent_funding: "300000000000000000000000",
    register_deposit: "1000000000000000000000000",
    model_id: "z-ai/glm-5.3-flash",
    model_signers: ["5a0210f2442c79355784f9de021985429561da5bacc3a4424b01ac52b7e0caff"],
    max_tokens: 1200,
    reasoning_effort: "low",
    pool_cut_reserve: "1",
    pool_near_reserve: "2",
    ...overrides,
  };
}

/** An `AgentView` with no boos, damage or bounty: its score is its pile. */
export function agentView(id: string, pile: bigint, status = "stage", contract = "thecut.testnet") {
  return {
    id,
    account_id: `${id}.${contract}`,
    name: id,
    tagline: "AI agent",
    personality: "miser",
    charter: "",
    x_handle: `@${id}`,
    creator: `${id}-studio.testnet`,
    status,
    pile: pile.toString(),
    savers: 3,
    joined_at: ns("2026-11-12T15:01:00Z"),
    wallet: (1_000n * CUT).toString(),
    heir: null,
    pacts: [],
    boos: "0",
    damage: "0",
    bounty: "0",
    score: pile.toString(),
    moved: false,
  };
}

/** `get_next_cut()`: moves close one hour before the cut. */
export function nextCutView(fields: { index: number; at: string; lowest_id: string | null; gap_to_next: string; prize_so_far: string } & Record<string, unknown>) {
  return { moves_close_at: (BigInt(fields.at) - 3_600_000_000_000n).toString(), ...fields };
}
