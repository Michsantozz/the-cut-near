import { z } from "zod";

import { moveViewSchema, nextCutViewSchema, paramsViewSchema, personalityViewSchema, seasonViewSchema, u128, type MoveView, type ParamsView, type PersonalityView } from "@/shared/near";
import { isModelSigner, plainHex, sha256Hex, signedMoveTextOf, verifyMoveSignature } from "@/shared/near/move-signature";
import type { AccessKeyEntry, RecentCall } from "@/shared/near/browser-rpc";
import { CUT_DECIMALS } from "@/shared/lib/amount";
import { formatAmount, formatCount, formatDuration, formatUtcTime } from "@/shared/ui/format";

// The judge desk's live checks: each claim the app makes, re-checked against NEAR from the reader's browser. The reads are
// ports, so the same code runs in tests with recorded answers. A check never throws: a failed read is "amber", not "red".

export const CLAIM_IDS = ["keys", "code", "books", "moving", "signatures", "personalities", "season"] as const;
export type ClaimId = (typeof CLAIM_IDS)[number];

/** holds: checked now and true. amber: could not be decided now. fails: checked now and false. */
export type Tone = "holds" | "amber" | "fails";

export type MoveProof = { agentId: string; cutIndex: number; txHash: string | null; ok: boolean; note: string };

export type ClaimResult = { tone: Tone; headline: string; facts: string[]; proofs?: MoveProof[] };

/** The build `scripts/testnet/launch.ts` deployed, as recorded in deploy/testnet-*.json. */
export type PublishedBuild = { contract: string; wasmSha256: string; wasmBs58: string; deployTx: string | null; deleteKeyTx: string | null };

export type LivePorts = {
  view<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T>;
  accessKeys(): Promise<AccessKeyEntry[]>;
  codeHash(): Promise<string>;
  /** Recent successful `submit_move` calls on the contract, newest first. */
  submitMoveCalls(): Promise<RecentCall[]>;
};

export type LiveContext = { contractId: string; build: PublishedBuild | null; now: () => Date };

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 160);
const cut = (value: bigint) => `${formatAmount(value, { maxFractionDigits: 2 })} $CUT`;
const short = (text: string, head = 6, tail = 4) => (text.length <= head + tail + 1 ? text : `${text.slice(0, head)}…${text.slice(-tail)}`);
const amber = (headline: string, facts: string[] = []): ClaimResult => ({ tone: "amber", headline, facts });

/* ---------------------------------------------------------------- Pure verdicts */

export function keysVerdict(contractId: string, keys: readonly AccessKeyEntry[]): ClaimResult {
  const full = keys.filter((key) => key.fullAccess).length;
  if (keys.length === 0) return { tone: "holds", headline: `0 access keys on ${contractId}`, facts: ["Nobody can deploy new code, change a parameter or move funds by hand."] };
  if (full > 0) return { tone: "fails", headline: `${formatCount(full)} full-access ${full === 1 ? "key" : "keys"} on ${contractId}`, facts: ["Whoever holds it can replace the code."] };
  return amber(`${formatCount(keys.length)} function-call ${keys.length === 1 ? "key" : "keys"}, no full-access key`, ["A function-call key cannot change the code, but the claim is 0 keys."]);
}

export function codeVerdict(contractId: string, codeHash: string, build: PublishedBuild | null): ClaimResult {
  if (!build || build.contract !== contractId) {
    return amber(`No published build is recorded for ${contractId}`, [`On-chain code_hash ${codeHash}.`, build ? `deploy/testnet-daily.json records ${build.contract}.` : "No deploy record was found."]);
  }
  if (codeHash === build.wasmBs58) {
    return { tone: "holds", headline: "The deployed code is the published build", facts: [`code_hash ${codeHash} = base58(sha256) of the recorded wasm`, `sha256 ${short(build.wasmSha256, 10, 6)}`] };
  }
  return { tone: "fails", headline: "The deployed code is not the recorded build", facts: [`On chain ${codeHash}, recorded ${build.wasmBs58}.`] };
}

export const statsSchema = z.object({
  minted: u128,
  burned: u128,
  total_supply: u128,
  total_saved: u128,
  fees_since_cut: u128,
  season_pot: u128,
  committed: u128,
  prizes_outstanding: u128,
  pool_cut_reserve: u128,
  contract_balance: u128,
});
export type Stats = z.output<typeof statsSchema>;

export function booksVerdict(stats: Stats): ClaimResult {
  const held = stats.pool_cut_reserve + stats.total_saved + stats.fees_since_cut + stats.season_pot + stats.committed + stats.prizes_outstanding;
  const balanceHolds = stats.contract_balance === held;
  const supplyHolds = stats.minted - stats.burned === stats.total_supply;
  const facts = [
    `Contract balance ${cut(stats.contract_balance)} ${balanceHolds ? "=" : "≠"} pool ${cut(stats.pool_cut_reserve)} + saved ${cut(stats.total_saved)} + fees ${cut(stats.fees_since_cut)} + pot ${cut(stats.season_pot)} + committed ${cut(stats.committed)} + prizes ${cut(stats.prizes_outstanding)}`,
    `Minted ${cut(stats.minted)} − burned ${cut(stats.burned)} ${supplyHolds ? "=" : "≠"} supply ${cut(stats.total_supply)}`,
  ];
  if (balanceHolds && supplyHolds) return { tone: "holds", headline: "Both equations hold to the last unit", facts };
  return { tone: "fails", headline: balanceHolds ? "Minted − burned is not the supply" : "The contract balance does not add up", facts };
}

type Season = z.output<typeof seasonViewSchema>;
type NextCut = z.output<typeof nextCutViewSchema>;

/** The moves the desk checks: the current cut's, or the last cut's while the current one has none. */
export type MoveSet = { cutIndex: number; moves: MoveView[]; current: boolean };

export function movingVerdict(set: MoveSet, nextCut: NextCut, season: Season): ClaimResult {
  const newest = set.moves.at(-1);
  if (newest) {
    const when = set.current ? `for cut ${set.cutIndex}, the next one` : `for cut ${set.cutIndex}; none yet for cut ${nextCut.index}`;
    return {
      tone: "holds",
      headline: `${formatCount(set.moves.length)} signed ${set.moves.length === 1 ? "move" : "moves"} ${when}`,
      facts: [`Newest: ${newest.agentId} chose ${newest.move}${newest.target ? ` on ${newest.target}` : ""}. “${newest.reason}”`],
    };
  }
  if (!season.active) return amber("No season is running, so no agent moves yet", [season.nextStartNeeds > 0 ? `The bench needs ${formatCount(season.nextStartNeeds)} more agents.` : `A season starts at the next cut, ${formatUtcTime(nextCut.at)} UTC.`]);
  return amber(`No move yet for cut ${nextCut.index} or the one before`, [`Moves close at ${formatUtcTime(nextCut.movesCloseAt)} UTC. The relay runs at 12:00, 15:00 and 19:00 UTC; anyone can relay.`]);
}

/** Finds the `submit_move` transaction of each move: same agent, the call closest in time to `submitted_at`. */
export function matchMoveCalls(moves: readonly MoveView[], calls: readonly RecentCall[]): Map<MoveView, RecentCall | null> {
  const matched = new Map<MoveView, RecentCall | null>();
  for (const move of moves) {
    const at = BigInt(move.submittedAt.getTime()) * 1_000_000n;
    let best: RecentCall | null = null;
    let bestGap = 0n;
    for (const call of calls) {
      const args = call.args as { agent_id?: unknown } | null;
      if (args?.agent_id !== move.agentId) continue;
      const gap = call.blockTimestampNs > at ? call.blockTimestampNs - at : at - call.blockTimestampNs;
      if (!best || gap < bestGap) [best, bestGap] = [call, gap];
    }
    // A move lands in the block of its transaction or a few after: anything a minute away is another day's call.
    matched.set(move, best && bestGap <= 60_000_000_000n ? best : null);
  }
  return matched;
}

/**
 * What can be checked after the fact. The request cannot be rebuilt (`get_move_request` answers for now, not for the cut
 * the move was made in), so its hash is taken from the contract's record; the response, the signer and the signature are
 * checked here: sha256(response) = `response_sha256`, the signer is in `model_signers`, and Ed25519 verifies over
 * `<model_id>:<request_sha256>:<sha256(response)>`.
 */
export function proveMove(move: MoveView, call: RecentCall | null, model: Pick<ParamsView, "modelId" | "modelSigners">): MoveProof {
  const base = { agentId: move.agentId, cutIndex: move.cutIndex, txHash: call?.txHash ?? null };
  if (!call) return { ...base, ok: false, note: "transaction not found in the contract’s recent calls" };
  const args = call.args as { response?: unknown; signature?: unknown; signer?: unknown } | null;
  if (typeof args?.response !== "string" || typeof args.signature !== "string" || typeof args.signer !== "string") return { ...base, ok: false, note: "the transaction has no response, signature or signer" };
  const responseSha256 = sha256Hex(args.response);
  if (responseSha256 !== move.responseSha256) return { ...base, ok: false, note: `sha256(response) is ${short(responseSha256)}, the contract recorded ${short(move.responseSha256)}` };
  if (plainHex(args.signer) !== plainHex(move.signer)) return { ...base, ok: false, note: "the transaction’s signer is not the recorded signer" };
  if (!isModelSigner(args.signer, model.modelSigners)) return { ...base, ok: false, note: `signer ${short(args.signer)} is not in model_signers` };
  const text = signedMoveTextOf(model.modelId, move.requestSha256, responseSha256);
  if (!verifyMoveSignature(args.signature, text, args.signer)) return { ...base, ok: false, note: "the Ed25519 signature does not verify" };
  return { ...base, ok: true, note: `Ed25519 verifies over ${model.modelId}:${short(move.requestSha256)}:${short(responseSha256)}` };
}

export function signaturesVerdict(proofs: readonly MoveProof[]): ClaimResult {
  if (proofs.length === 0) return amber("No move to check yet", ["Signatures are checked as soon as a move is in."]);
  const verified = proofs.filter((proof) => proof.ok).length;
  const missing = proofs.filter((proof) => !proof.ok && proof.txHash === null).length;
  const broken = proofs.length - verified - missing;
  const facts = ["Checked in this browser with @noble/curves: sha256 of the response, signer in model_signers, Ed25519."];
  if (broken > 0) return { tone: "fails", headline: `${formatCount(broken)} of ${formatCount(proofs.length)} signatures do not verify`, facts, proofs: [...proofs] };
  if (missing > 0) return { tone: "amber", headline: `${formatCount(verified)} of ${formatCount(proofs.length)} verified; ${formatCount(missing)} transactions not found yet`, facts, proofs: [...proofs] };
  return { tone: "holds", headline: `${formatCount(verified)} of ${formatCount(proofs.length)} signatures verify`, facts, proofs: [...proofs] };
}

/** The brief's agents (whole $CUT strings), for the caps and pacts of the cut it was built for. */
export const briefSchema = z.object({
  cut_index: z.number().int().nonnegative(),
  agents: z.array(z.object({ id: z.string(), personality: z.string(), wallet: z.string().regex(/^\d+$/), pacts: z.array(z.string()) })),
});
export type Brief = z.output<typeof briefSchema>;

export function personalitiesVerdict(
  moves: readonly MoveView[],
  personalityOf: ReadonlyMap<string, string>,
  table: readonly PersonalityView[],
  brief: Brief | null,
  thinkFee: bigint,
): ClaimResult {
  if (moves.length === 0) return amber("No move to check yet", ["Every move is checked against its agent’s personality as soon as it is in."]);
  const limits = new Map(table.map((p) => [p.id, p]));
  const violations: string[] = [];
  let capsChecked = 0;
  for (const move of moves) {
    const personality = personalityOf.get(move.agentId);
    const limit = personality ? limits.get(personality as PersonalityView["id"]) : undefined;
    if (move.amount > move.askedAmount) violations.push(`${move.agentId} committed more than it asked for`);
    if (move.move === "attack" && limit && !limit.mayAttack) violations.push(`${move.agentId} (${personality}) attacked`);
    const seen = brief?.cut_index === move.cutIndex ? brief.agents.find((agent) => agent.id === move.agentId) : undefined;
    if (!seen || !limit) continue;
    if (move.move === "attack" && move.target && seen.pacts.includes(move.target) && !limit.mayAttackPartner) violations.push(`${move.agentId} attacked its pact partner ${move.target}`);
    // The brief rounds the wallet down to whole $CUT, so one more $CUT is an upper bound of the cap's base.
    const base = (BigInt(seen.wallet) + 1n) * 10n ** BigInt(CUT_DECIMALS) - thinkFee;
    const cap = base > 0n ? (base * BigInt(limit.spendBps)) / 10_000n : 0n;
    capsChecked++;
    if (move.amount > cap) violations.push(`${move.agentId} committed ${cut(move.amount)}, over its ${personality} cap of ${cut(cap)}`);
  }
  const adjusted = moves.filter((move) => move.outcome).length;
  const facts = [
    `${formatCount(moves.length)} moves read; ${formatCount(capsChecked)} checked against the spend cap of the morning board.`,
    adjusted > 0 ? `The contract clamped or downgraded ${formatCount(adjusted)} of them, as the rules say.` : "No move needed a clamp or a downgrade.",
  ];
  if (violations.length > 0) return { tone: "fails", headline: `${formatCount(violations.length)} ${violations.length === 1 ? "move breaks" : "moves break"} a personality limit`, facts: [...violations, ...facts] };
  return { tone: "holds", headline: "No generous attack, no betrayed pact, no amount over its cap", facts };
}

export function seasonVerdict(season: Season, nextCut: NextCut, now: Date): ClaimResult {
  const late = now.getTime() - nextCut.at.getTime();
  if (late > 30 * 60_000) return amber(`Cut ${nextCut.index} is ${formatDuration(late)} late`, ["Anyone can call run_cut once it is due; the keeper and the cron retry."]);
  const next = late >= 0 ? `Cut ${nextCut.index} is due now` : `Next cut in ${formatDuration(-late)}, at ${formatUtcTime(nextCut.at)} UTC`;
  if (!season.active) {
    return amber(season.index === 0 ? "The first season has not started yet" : `Season ${season.index} is over; the next has not started`, [
      season.nextStartNeeds > 0 ? `The bench needs ${formatCount(season.nextStartNeeds)} more agents.` : "Enough agents wait on the bench: it starts at the next cut.",
      next,
    ]);
  }
  return { tone: "holds", headline: `Season ${season.index}, day ${season.day}: ${formatCount(season.alive)} agents alive`, facts: [next, `Season pot ${cut(season.pot)}.`] };
}

/* ---------------------------------------------------------------- The runner */

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => schema.parse(value);

/**
 * Runs every check, calling `report` as each one settles. Reads shared by several checks (params, season, the moves) are
 * made once.
 */
export async function runLiveChecks(ports: LivePorts, context: LiveContext, report: (id: ClaimId, result: ClaimResult) => void): Promise<void> {
  const settle = async (id: ClaimId, check: () => Promise<ClaimResult>) => {
    try {
      report(id, await check());
    } catch (error) {
      report(id, amber("Could not read it from NEAR right now", [describe(error)]));
    }
  };

  const params = ports.view("get_params").then((raw) => parse(paramsViewSchema, raw));
  const season = ports.view("get_season").then((raw) => parse(seasonViewSchema, raw));
  const nextCut = ports.view("get_next_cut").then((raw) => parse(nextCutViewSchema, raw));
  const moveSet: Promise<MoveSet> = nextCut.then(async ({ index }) => {
    const current = parse(z.array(moveViewSchema), await ports.view("get_moves", { cut_index: index }));
    if (current.length > 0 || index === 0) return { cutIndex: index, moves: current, current: true };
    return { cutIndex: index - 1, moves: parse(z.array(moveViewSchema), await ports.view("get_moves", { cut_index: index - 1 })), current: false };
  });
  // Unhandled rejections are reported by the checks that await these.
  for (const shared of [params, season, nextCut, moveSet]) shared.catch(() => undefined);

  await Promise.all([
    settle("keys", async () => keysVerdict(context.contractId, await ports.accessKeys())),
    settle("code", async () => codeVerdict(context.contractId, await ports.codeHash(), context.build)),
    settle("books", async () => booksVerdict(parse(statsSchema, await ports.view("get_stats")))),
    settle("moving", async () => movingVerdict(await moveSet, await nextCut, await season)),
    settle("signatures", async () => {
      const { moves } = await moveSet;
      if (moves.length === 0) return signaturesVerdict([]);
      const [model, calls] = await Promise.all([params, ports.submitMoveCalls()]);
      const matched = matchMoveCalls(moves, calls);
      return signaturesVerdict(moves.map((move) => proveMove(move, matched.get(move) ?? null, model)));
    }),
    settle("personalities", async () => {
      const { moves } = await moveSet;
      if (moves.length === 0) return personalitiesVerdict([], new Map(), [], null, 0n);
      const [model, table, stage, rawBrief] = await Promise.all([
        params,
        ports.view("get_personalities").then((raw) => parse(z.array(personalityViewSchema), raw)),
        ports.view<{ id: string; personality: string }[]>("get_stage"),
        ports.view<string | null>("get_brief"),
      ]);
      const personalityOf = new Map(stage.map((agent) => [agent.id, agent.personality]));
      const missing = [...new Set(moves.map((move) => move.agentId))].filter((id) => !personalityOf.has(id));
      const extra = await Promise.all(missing.map((id) => ports.view<{ personality: string } | null>("get_agent", { id })));
      missing.forEach((id, i) => extra[i] && personalityOf.set(id, extra[i]!.personality));
      const brief = rawBrief ? briefSchema.safeParse(JSON.parse(rawBrief)) : null;
      return personalitiesVerdict(moves, personalityOf, table, brief?.success ? brief.data : null, model.thinkFee);
    }),
    settle("season", async () => seasonVerdict(await season, await nextCut, context.now())),
  ]);
}
