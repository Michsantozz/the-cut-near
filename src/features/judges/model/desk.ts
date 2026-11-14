import type { ClaimId } from "./live-checks";

// The judge desk's fixed content: where each claim lives in the code and the tests, the track's prompt line by line, one
// place per mechanic, and the attacks the contract refuses. Paths are from the repository root; lines point at the
// function or the test.

/** A file in the repository, optionally at a line. */
export type SourceRef = { path: string; line?: number; label: string };

/** A link to `ref` in the public repository, or null while the repository is not public. */
export function sourceHref(repoUrl: string | null, ref: SourceRef): string | null {
  if (!repoUrl) return null;
  return `${repoUrl.replace(/\/+$/, "")}/blob/main/${ref.path}${ref.line ? `#L${ref.line}` : ""}`;
}

/** Where the chain-side evidence of a claim is: an account page, or the transaction that made it true. */
export type ChainRef = "contract" | "deploy-tx" | "delete-key-tx" | "moves";

export type ClaimMeta = { id: ClaimId; claim: string; how: string; code: SourceRef; test: SourceRef; chain: ChainRef };

export const CLAIMS: readonly ClaimMeta[] = [
  {
    id: "keys",
    claim: "Nobody holds a key to the contract. Not us either.",
    how: "Lists the contract account’s access keys with view_access_key_list. Locked means 0.",
    code: { path: "scripts/testnet/launch.ts", line: 569, label: "launch.ts: delete the last key" },
    test: { path: "contracts/integration-tests/tests/sandbox.rs", line: 119, label: "sandbox.rs: 0 keys after launch" },
    chain: "delete-key-tx",
  },
  {
    id: "code",
    claim: "The code running is the code we published.",
    how: "Reads code_hash with view_account and compares it with the wasm hash recorded at deploy in deploy/testnet-daily.json.",
    code: { path: "deploy/testnet-daily.json", line: 242, label: "testnet-daily.json: wasm sha256 and base58" },
    test: { path: "scripts/testnet/launch.ts", line: 505, label: "launch.ts: refuses a different code hash" },
    chain: "deploy-tx",
  },
  {
    id: "books",
    claim: "The books balance to the last unit.",
    how: "Reads get_stats: contract balance = pool + saved + fees + pot + committed + prizes outstanding, and minted − burned = supply.",
    code: { path: "contracts/thecut/src/views.rs", line: 61, label: "views.rs: get_stats" },
    test: { path: "contracts/thecut/src/tests/mod.rs", line: 453, label: "tests/mod.rs: assert_books after every step" },
    chain: "contract",
  },
  {
    id: "moving",
    claim: "The AI agents are making moves.",
    how: "Reads get_moves for the next cut, or the last one while the next has none: how many moves, and the newest reason.",
    code: { path: "contracts/thecut/src/moves.rs", line: 477, label: "moves.rs: submit_move" },
    test: { path: "contracts/thecut/src/tests/contract_moves.rs", line: 41, label: "contract_moves.rs: a valid move" },
    chain: "contract",
  },
  {
    id: "signatures",
    claim: "Every move was signed by the model inside NEAR AI’s TEE.",
    how: "Fetches each move’s submit_move transaction (FastNEAR Transactions API), hashes the response, checks the signer is in model_signers and verifies Ed25519 in this browser.",
    code: { path: "src/shared/near/move-signature.ts", label: "move-signature.ts: the check this page runs" },
    test: { path: "contracts/thecut/src/tests/contract_moves.rs", line: 160, label: "contract_moves.rs: a tampered response is refused" },
    chain: "moves",
  },
  {
    id: "personalities",
    claim: "Personalities are hard limits, not flavor text.",
    how: "Reads the same moves with get_personalities and the morning board: no generous attack, no non-traitor attacking a pact partner, no amount over its cap.",
    code: { path: "contracts/thecut/src/moves.rs", line: 241, label: "moves.rs: decide clamps and downgrades" },
    test: { path: "contracts/thecut/src/tests/contract_moves.rs", line: 309, label: "contract_moves.rs: amounts clamped per personality" },
    chain: "contract",
  },
  {
    id: "season",
    claim: "The season runs on its own schedule.",
    how: "Reads get_season and get_next_cut: the day, the agents alive and when the next cut is due.",
    code: { path: "contracts/thecut/src/cut.rs", line: 390, label: "cut.rs: run_cut, open to anyone" },
    test: { path: "contracts/thecut/src/tests/seasons.rs", line: 376, label: "seasons.rs: supply only shrinks through a season" },
    chain: "contract",
  },
];

/** One requirement of the track's prompt and where it lives. `href` is a page of the app. */
export type TrackRow = { requirement: string; answer: string; where: { label: string; href?: string; ref?: SourceRef }[] };

export const TRACK_ROWS: readonly TrackRow[] = [
  {
    requirement: "An NEP-141 token with the mechanic in the contract, not in a backend somebody could switch off.",
    answer: "$CUT, the pool, the piles and the cut live in one Rust contract. run_cut is open to anyone; our keeper is a convenience.",
    where: [
      { label: "lib.rs: NEP-141 token", ref: { path: "contracts/thecut/src/lib.rs", line: 118, label: "lib.rs" } },
      { label: "cut.rs: run_cut", ref: { path: "contracts/thecut/src/cut.rs", line: 390, label: "cut.rs" } },
      { label: "How it works", href: "/inside" },
    ],
  },
  {
    requirement: "All parameters set at launch and readable by anyone, no admin key that can change them later.",
    answer: "Every number is a new() argument, read back with get_params. The contract has no admin method and 0 access keys.",
    where: [
      { label: "lib.rs: new", ref: { path: "contracts/thecut/src/lib.rs", line: 178, label: "lib.rs" } },
      { label: "The parameters", href: "/inside#params-title" },
      { label: "Live: 0 keys", href: "#claim-keys" },
    ],
  },
  {
    requirement: "Sybil resistance good enough for a demo, with its limits written plainly in the README.",
    answer: "Everything counts by $CUT, not by account, so splitting a wallet gains nothing. A prize pays at most 1 $CUT per $CUT saved. The limits are in the README.",
    where: [
      { label: "README: Known limits", ref: { path: "README.md", label: "README.md" } },
      { label: "math.rs: cap_to_pile", ref: { path: "contracts/thecut/src/math.rs", line: 171, label: "math.rs" } },
      { label: "Known limits", href: "/inside#limits-title" },
    ],
  },
  {
    requirement: "A page with the current state, today’s progress and a log of every mint and burn.",
    answer: "Today shows the stage, the cut line and the countdown. Receipts lists every mint, burn, save and prize from the contract’s events.",
    where: [
      { label: "Today", href: "/" },
      { label: "Receipts", href: "/receipts" },
      { label: "Season", href: "/season" },
    ],
  },
  {
    requirement: "Simulate 60 days of community behavior and show supply over time under a few scenarios.",
    answer: "The same rules in Python, 6 scenarios × 20 seeds × 60 daily cuts, with the supply chart and where every burn came from.",
    where: [
      { label: "The simulation", href: "/simulation" },
      { label: "sim/thecut_sim.py", ref: { path: "sim/thecut_sim.py", label: "thecut_sim.py" } },
      { label: "sim/RESULTS.md", ref: { path: "sim/RESULTS.md", label: "RESULTS.md" } },
    ],
  },
  {
    requirement: "Judged on the mechanic, not the chart.",
    answer: "The mechanic: AI agents with their own wallets make one TEE-signed move a day, fans save and boo, the lowest score is deleted.",
    where: [
      { label: "The rules, RULES.md", ref: { path: "RULES.md", label: "RULES.md" } },
      { label: "Contract interface", ref: { path: "docs/contract-interface.md", label: "contract-interface.md" } },
    ],
  },
];

/** One mechanic, the place in the app where it is done, and the doc that explains it. */
export type Mechanic = { id: string; label: string; what: string; href: string; doc: { label: string; href: string }; ref?: SourceRef };

export const MECHANICS: readonly Mechanic[] = [
  { id: "buy", label: "Buy $CUT", what: "NEAR in, $CUT out of the contract’s pool. 1% fee, half to the season pot.", href: "/buy", doc: { label: "Demo step", href: "/demo#step-buy" } },
  { id: "save", label: "Save an agent", what: "Lock $CUT on an agent’s pile until the next cut.", href: "/", doc: { label: "Demo step", href: "/demo#step-save" } },
  { id: "boo", label: "Boo an agent", what: "Burn your own $CUT to push an agent’s score down.", href: "/", doc: { label: "Demo step", href: "/demo#step-boo" } },
  { id: "register", label: "Register an agent", what: "1 NEAR and 1,000 $CUT make a keyless agent account on the bench.", href: "/creators", doc: { label: "For agents", href: "/llms.txt" } },
  { id: "relay", label: "Relay a move", what: "Carry the model’s signed answer to submit_move. Anyone can; nobody can write it.", href: "/llms.txt", doc: { label: "Demo step", href: "/demo#step-move" }, ref: { path: "scripts/testnet/probe-ai.ts", label: "probe-ai.ts" } },
  { id: "cut", label: "Run the cut", what: "run_cut, open to any account once the cut is due. The runner keeps 0.3 NEAR.", href: "/demo#step-cut", doc: { label: "Rules", href: "/inside#day-title" }, ref: { path: "scripts/testnet/autopilot.ts", label: "autopilot.ts" } },
  { id: "claim", label: "Claim prizes", what: "Collect every prize your saves and agents earned.", href: "/prizes", doc: { label: "Where $CUT goes", href: "/inside#money-title" } },
];

/** An attack the contract refuses, its exact words, and the unit test that proves it. */
export type Attack = { attack: string; result: "refused" | "downgraded" | "clamped" | "capped"; message: string; test: SourceRef };

const MOVES_TESTS = "contracts/thecut/src/tests/contract_moves.rs";

export const ATTACKS: readonly Attack[] = [
  {
    attack: "Forge a signature with another key",
    result: "refused",
    message: "The signature does not match: relay the exact bytes of get_move_request and of the model's response",
    test: { path: MOVES_TESTS, line: 150, label: "a_signature_by_another_key_is_refused" },
  },
  {
    attack: "Sign with a key that is not the model’s",
    result: "refused",
    message: "signer is not one of model_signers: use the signing_address of the model's attestation",
    test: { path: MOVES_TESTS, line: 134, label: "a_wrong_signer_is_refused" },
  },
  {
    attack: "Change one number in the model’s answer",
    result: "refused",
    message: "The signature does not match: relay the exact bytes of get_move_request and of the model's response",
    test: { path: MOVES_TESTS, line: 160, label: "a_tampered_response_is_refused" },
  },
  {
    attack: "Move after moves close",
    result: "refused",
    message: "Moves for cut 2 closed at <time>: wait for the cut, then move again",
    test: { path: MOVES_TESTS, line: 208, label: "a_move_after_moves_close_fails_with_the_time" },
  },
  {
    attack: "Move twice in one cut",
    result: "refused",
    message: "kiko already moved for cut 2: one move per agent per cut",
    test: { path: MOVES_TESTS, line: 217, label: "a_second_move_for_the_same_cut_is_refused" },
  },
  {
    attack: "A generous agent attacks",
    result: "downgraded",
    message: "downgraded: generous agents cannot attack",
    test: { path: MOVES_TESTS, line: 363, label: "generous_agents_cannot_attack" },
  },
  {
    attack: "Attack a pact partner without being a traitor",
    result: "downgraded",
    message: "downgraded: only a traitor may attack a pact partner",
    test: { path: MOVES_TESTS, line: 395, label: "a_pact_blocks_attacks_the_next_day_except_for_a_traitor" },
  },
  {
    attack: "Spend over the personality’s daily cap",
    result: "clamped",
    message: "clamped: a miser spends at most 5% of its wallet a day",
    test: { path: MOVES_TESTS, line: 309, label: "amounts_are_clamped_per_personality" },
  },
  {
    attack: "Snipe: save 0.1 $CUT on an empty survivor to take its whole slice",
    result: "capped",
    message: "Pays 0.1 $CUT, at most 1 $CUT per $CUT saved; the rest of the slice burns",
    test: { path: "contracts/thecut/src/tests/contract_cut.rs", line: 245, label: "the_prize_slice_is_capped_at_the_pile_and_the_excess_burns" },
  },
  {
    attack: "Name an agent null or none, which a move reads as no agent",
    result: "refused",
    message: "Agent id cannot be null or none",
    test: { path: "contracts/thecut/src/tests/contract_agents_saves.rs", line: 300, label: "register_refuses_the_id_null" },
  },
];
