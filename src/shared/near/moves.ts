import "server-only";
import { z } from "zod";
import { publicEnv } from "@/shared/config/public";
import { getRpc, type NearRpc } from "./rpc";
import { timestampNs, u128, u64Index } from "./units";

// The v20 reads the move relay and the Director need (SPEC-v20, "Agents" and "Contract interface"). Each schema
// keeps only the fields it uses, so these reads work whatever else the v20 views carry.

const hexKey = z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/, "must be a 32-byte hex key");

/**
 * `get_params()`: the only model whose answers count, its TEE signing keys, and the request shape the contract
 * builds (`max_tokens`, and `reasoning_effort` when set). The relay posts the contract's bytes as they are; the
 * shape is read for reports and the probe.
 */
export const moveModelSchema = z
  .object({
    model_id: z.string().min(1),
    model_signers: z.array(hexKey).min(1).max(4),
    max_tokens: z.number().int().min(64).max(4096).optional(),
    reasoning_effort: z.enum(["low", "medium", "high"]).nullish(),
  })
  .transform((p) => ({ modelId: p.model_id, signers: p.model_signers, maxTokens: p.max_tokens ?? null, reasoningEffort: p.reasoning_effort ?? null }));
export type MoveModel = z.output<typeof moveModelSchema>;

/** `get_next_cut()`: the cut moves count for, and when they close. */
export const moveWindowSchema = z
  .object({ index: u64Index, at: timestampNs, moves_close_at: timestampNs })
  .transform((n) => ({ cutIndex: n.index, cutAt: n.at, closesAt: n.moves_close_at }));
export type MoveWindowView = z.output<typeof moveWindowSchema>;

/** `get_stage()`, reduced to who has moved this cut. */
export const stageMovesSchema = z.array(z.object({ id: z.string().min(1), moved: z.boolean() }));

/** `MoveView` of `get_moves(cut_index)`. Amounts are yocto-$CUT like every amount on the interface. */
export const moveViewSchema = z
  .object({
    cut_index: u64Index,
    agent_id: z.string().min(1),
    move: z.string(),
    target: z.string().nullish(),
    amount: u128,
    asked_amount: u128,
    heir: z.string().nullish(),
    reason: z.string(),
    outcome: z.string().nullish(),
    chat_id: z.string(),
    request_sha256: z.string(),
    response_sha256: z.string(),
    signer: z.string(),
    submitted_by: z.string(),
    submitted_at: timestampNs,
  })
  .transform((m) => ({
    cutIndex: m.cut_index,
    agentId: m.agent_id,
    move: m.move,
    target: m.target ?? null,
    amount: m.amount,
    askedAmount: m.asked_amount,
    heir: m.heir ?? null,
    reason: m.reason,
    outcome: m.outcome ?? null,
    chatId: m.chat_id,
    requestSha256: m.request_sha256,
    responseSha256: m.response_sha256,
    signer: m.signer,
    submittedBy: m.submitted_by,
    submittedAt: m.submitted_at,
  }));
export type MoveView = z.output<typeof moveViewSchema>;

/** Reads of the main contract for moves. Errors as in `cutContract`. */
export function movesContract(rpc: NearRpc = getRpc(), contractId: string = publicEnv.contractId) {
  const view = <T>(method: string, args: Record<string, unknown>, schema: z.ZodType<T>) => rpc.view(contractId, method, args, schema);

  return {
    contractId,
    getModel: () => view("get_params", {}, moveModelSchema),
    getMoveWindow: () => view("get_next_cut", {}, moveWindowSchema),
    getStageMoves: () => view("get_stage", {}, stageMovesSchema),
    /** The exact request body the contract expects for this agent and this cut, or null. */
    getMoveRequest: (agentId: string) => view("get_move_request", { agent_id: agentId }, z.string().min(1).nullable()),
    /** Null when the agent does not exist. */
    hasMoved: async (agentId: string) => (await view("get_agent", { id: agentId }, z.object({ moved: z.boolean() }).nullable()))?.moved ?? false,
    getMoves: (cutIndex: number) => view("get_moves", { cut_index: cutIndex }, z.array(moveViewSchema)),
  };
}

export type MovesContract = ReturnType<typeof movesContract>;
