import { utf8ToBytes } from "@noble/hashes/utils.js";

import {
  isModelSigner,
  MAX_RESPONSE_BYTES,
  MOVE_SIGNING_ALGO,
  plainHex,
  signedMoveText,
  verifyMoveSignature,
} from "../../../shared/near/move-signature.ts";

// The move relay (SPEC-v20, "Agents, until next_cut_at - move_lead"): for each stage agent without a move,
// post the contract's exact request to NEAR AI, fetch the TEE signature, run the contract's checks locally
// and only then spend gas on `submit_move`. Every network call is a port, so the cron (src/features/moves/server)
// and scripts/testnet/autopilot.ts run this same code. Node-loadable on purpose: npm imports and relative paths only.
// The signature pieces live in src/shared/near/move-signature.ts, which the judge desk also runs in the browser.

export { MAX_RESPONSE_BYTES, MOVE_SIGNING_ALGO, plainHex, sha256Hex, signedMoveText } from "../../../shared/near/move-signature.ts";

/** `GET /v1/signature/<chat id>` as NEAR AI returns it. */
export type MoveSignature = { text: string; signature: string; signing_address: string; signing_algo?: string; signature_kind?: string };

/** The arguments of `submit_move`. Hex is lowercase without `0x`. */
export type SubmitMoveArgs = { agent_id: string; response: string; signature: string; signer: string };

export type SubmitOutcome = { status: "success" | "failure" | "pending"; txHash: string; detail?: string };

export type MoveWindow = {
  cutIndex: number;
  /** `get_next_cut().moves_close_at`. */
  closesAt: Date;
  /** The latest final block's time: the clock the contract checks. */
  chainNow: Date;
  /** `get_params().model_id` and `model_signers`. */
  modelId: string;
  signers: readonly string[];
};

export type RelayPorts = {
  window(): Promise<MoveWindow>;
  /** Stage agents with no move for this cut (`get_stage()` where `moved` is false). */
  waitingAgents(): Promise<string[]>;
  /** `get_move_request(agent_id)`: the exact request body, or null when the agent cannot move. */
  moveRequest(agentId: string): Promise<string | null>;
  /** POSTs these exact bytes to `/chat/completions` and returns the exact response text. Throws when NEAR AI fails. */
  complete(requestBody: string): Promise<string>;
  /** The Ed25519 signature of a chat id, after a bounded wait. Throws when it stays unavailable. */
  signature(chatId: string, modelId: string): Promise<MoveSignature>;
  submit(args: SubmitMoveArgs): Promise<SubmitOutcome>;
  hasMoved(agentId: string): Promise<boolean>;
};

/**
 * - `moved`: our `submit_move` went through.
 * - `already_moved`: the agent had a move by the time we got to it (another relayer, or a lost RPC answer).
 * - `no_request`: the contract has no request for the agent (not on the stage, no season).
 * - `ai_unavailable`: NEAR AI did not answer or sign. The agent holds, as the rules say.
 * - `too_large`: the raw response is over the contract's 32 KB limit; nothing was submitted, the agent holds.
 * - `refused`: the answer failed a check the contract would also fail; nothing was submitted.
 * - `closed`: moves closed before we could submit.
 * - `failed`: a chain read or `submit_move` failed.
 */
export type AgentRelayStatus = "moved" | "already_moved" | "no_request" | "ai_unavailable" | "too_large" | "refused" | "closed" | "failed";

export type MoveAnswer = { move: string; target: string | null; amount: string; reason: string };

export type AgentRelayResult = {
  agentId: string;
  status: AgentRelayStatus;
  detail?: string;
  chatId?: string;
  txHash?: string;
  /** The move as the contract will read it, for logs. */
  answer?: MoveAnswer | null;
};

/** `open`: moves were open when the run started; when not, nothing was tried. */
export type RelayReport = { cutIndex: number; closesAt: string; open: boolean; agents: AgentRelayResult[] };

export type RelayOptions = {
  /** Agents worked on at once. Submissions still go one at a time: one access key, one nonce sequence. */
  concurrency?: number;
  /** Stop this long before moves close: a transaction lands a block or two after it is sent. */
  closeMarginMs?: number;
  now?: () => Date;
};

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_CLOSE_MARGIN_MS = 3_000;

/** Why the contract would refuse `responseBody` for its size, or null when it fits. */
export function oversizeReason(responseBody: string): string | null {
  const size = utf8ToBytes(responseBody).length;
  return size > MAX_RESPONSE_BYTES ? `The response is ${size} bytes; the contract takes at most ${MAX_RESPONSE_BYTES}.` : null;
}

export type SignatureCheck = { ok: true; signature: string; signer: string } | { ok: false; reason: string };

export type SignatureCheckInput = { modelId: string; requestBody: string; responseBody: string; signature: MoveSignature; signers: readonly string[] };

/** The checks `submit_move` makes, run locally so a bad answer costs no gas. */
export function checkMoveSignature({ modelId, requestBody, responseBody, signature, signers }: SignatureCheckInput): SignatureCheck {
  const fail = (reason: string): SignatureCheck => ({ ok: false, reason });
  if (signature.signature_kind !== "provider_tee") return fail(`signature_kind is ${signature.signature_kind ?? "missing"}, not provider_tee.`);
  if (signature.signing_algo !== undefined && signature.signing_algo !== MOVE_SIGNING_ALGO) return fail(`signing_algo is ${signature.signing_algo}, not ed25519.`);
  const oversize = oversizeReason(responseBody);
  if (oversize) return fail(oversize);
  if (signature.text !== signedMoveText(modelId, requestBody, responseBody)) return fail("The signed text is not <model_id>:<sha256(request)>:<sha256(response)> for these exact bytes.");
  const signer = plainHex(signature.signing_address);
  const bytes = plainHex(signature.signature);
  if (signer?.length !== 64) return fail("signing_address is not a 32-byte Ed25519 key.");
  if (bytes?.length !== 128) return fail("The signature is not 64 bytes of hex.");
  if (!isModelSigner(signer, signers)) return fail(`The signer ${signer} is not in the contract's model_signers.`);
  return verifyMoveSignature(bytes, signature.text, signer) ? { ok: true, signature: bytes, signer } : fail("The Ed25519 signature does not verify.");
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The `id` of a chat completion body, or null. */
export function chatIdOf(responseBody: string): string | null {
  const body = parseJson(responseBody);
  return isRecord(body) && typeof body.id === "string" && body.id.length > 0 ? body.id : null;
}

/**
 * The move as the contract reads it: `choices[0].message.content`, from its first `{` to its last `}`, as JSON.
 * Null when the contract would record "(unreadable answer)". For logs only: the contract decides.
 */
export function moveAnswerOf(responseBody: string): MoveAnswer | null {
  const body = parseJson(responseBody);
  const choice = isRecord(body) && Array.isArray(body.choices) ? body.choices[0] : undefined;
  const content = isRecord(choice) && isRecord(choice.message) ? choice.message.content : undefined;
  if (typeof content !== "string") return null;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  const answer = parseJson(content.slice(start, end + 1));
  if (!isRecord(answer) || typeof answer.move !== "string") return null;
  const text = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : null);
  return { move: answer.move, target: text(answer.target), amount: text(answer.amount) ?? "0", reason: text(answer.reason) ?? "" };
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

/** Runs `tasks` with at most `limit` at a time, keeping their order in the result. */
async function pool<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

/**
 * Relays one move for every stage agent that has none for this cut, while moves are open. Idempotent: agents
 * that moved are skipped, and a submit that loses a race reads as `already_moved` from the chain, not from an
 * error message. Never throws for one agent's failure; the report says what happened to each.
 */
export async function relayMoves(ports: RelayPorts, options: RelayOptions = {}): Promise<RelayReport> {
  const now = options.now ?? (() => new Date());
  const margin = options.closeMarginMs ?? DEFAULT_CLOSE_MARGIN_MS;
  const window = await ports.window();
  // Chain time, extrapolated from the final block with the local clock.
  const offset = window.chainNow.getTime() - now().getTime();
  const open = () => now().getTime() + offset < window.closesAt.getTime() - margin;
  const report: RelayReport = { cutIndex: window.cutIndex, closesAt: window.closesAt.toISOString(), open: open(), agents: [] };
  if (!report.open) return report;

  // One submission at a time: concurrent transactions from one key race for the same nonce.
  let submitting: Promise<unknown> = Promise.resolve();
  const submitInTurn = (args: SubmitMoveArgs) => {
    const turn = submitting.then(() => ports.submit(args));
    submitting = turn.catch(() => undefined);
    return turn;
  };

  const relayOne = async (agentId: string): Promise<AgentRelayResult> => {
    const result = (status: AgentRelayStatus, extra: Omit<AgentRelayResult, "agentId" | "status"> = {}): AgentRelayResult => ({ agentId, status, ...extra });
    if (!open()) return result("closed");

    let requestBody: string | null;
    try {
      requestBody = await ports.moveRequest(agentId);
    } catch (error) {
      return result("failed", { detail: `get_move_request: ${describe(error)}` });
    }
    if (requestBody === null) return result("no_request");

    let responseBody: string;
    let chatId: string | null;
    let signature: MoveSignature;
    try {
      responseBody = await ports.complete(requestBody);
      chatId = chatIdOf(responseBody);
      if (!chatId) return result("ai_unavailable", { detail: "The completion has no chat id." });
      // A reply the contract would refuse for its size is not worth a signature or a transaction.
      const oversize = oversizeReason(responseBody);
      if (oversize) return result("too_large", { chatId, detail: oversize });
      signature = await ports.signature(chatId, window.modelId);
    } catch (error) {
      return result("ai_unavailable", { detail: describe(error) });
    }
    const answer = moveAnswerOf(responseBody);

    const check = checkMoveSignature({ modelId: window.modelId, requestBody, responseBody, signature, signers: window.signers });
    if (!check.ok) return result("refused", { chatId, answer, detail: check.reason });
    if (!open()) return result("closed", { chatId, answer });

    let outcome: SubmitOutcome | null = null;
    let sendError: unknown = null;
    try {
      // Another relayer may have been faster while the model was thinking: a view is cheaper than a refused call.
      if (await ports.hasMoved(agentId)) return result("already_moved", { chatId, answer });
      outcome = await submitInTurn({ agent_id: agentId, response: responseBody, signature: check.signature, signer: check.signer });
      if (outcome.status === "success") return result("moved", { chatId, answer, txHash: outcome.txHash });
    } catch (error) {
      sendError = error;
    }
    const txHash = outcome?.txHash;
    try {
      if (await ports.hasMoved(agentId)) {
        // Our own pending transaction that has since executed is our move.
        return result(outcome?.status === "pending" ? "moved" : "already_moved", { chatId, answer, ...(txHash ? { txHash } : {}) });
      }
    } catch (error) {
      sendError ??= error;
    }
    const detail = outcome?.status === "failure" ? (outcome.detail ?? "submit_move failed") : outcome ? "transaction still pending" : describe(sendError);
    return result("failed", { chatId, answer, detail: detail.slice(0, 300), ...(txHash ? { txHash } : {}) });
  };

  const agents = await ports.waitingAgents();
  report.agents = await pool(agents, options.concurrency ?? DEFAULT_CONCURRENCY, relayOne);
  return report;
}
