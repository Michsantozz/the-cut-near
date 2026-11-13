import "server-only";
import type { CallOutcome } from "@/shared/near/signer";
import { cutHasRun, decideCut, type NextCutTime } from "../model/decide";

export type KeeperDeps = {
  nextCut: () => Promise<NextCutTime>;
  /** Timestamp of the latest final block. */
  chainNow: () => Promise<Date>;
  runCut: () => Promise<CallOutcome>;
  sleep?: (ms: number) => Promise<void>;
};

export type KeeperResult =
  | { status: "too_early"; index: number; dueAt: string }
  | { status: "ran"; index: number; txHash: string }
  /** Someone (another keeper run, or any account) ran it first. */
  | { status: "already_ran"; index: number; txHash: string | null };

/** `run_cut` failed and the contract is still waiting for the same cut. */
export class KeeperError extends Error {
  override readonly name = "KeeperError";
  constructor(
    message: string,
    readonly index: number,
    readonly txHash: string | null,
    options?: { cause: unknown },
  ) {
    super(message, options);
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs today's cut when it is due. Safe to call any number of times: before the cut it does
 * nothing, after it the contract has moved to the next cut (too early again), and a run that
 * loses a race to another runner is recognised as "already_ran" from the chain, not from an error
 * message.
 */
export async function runKeeper({ nextCut, chainNow, runCut, sleep = defaultSleep }: KeeperDeps): Promise<KeeperResult> {
  const before = await nextCut();
  let decision = decideCut(before, await chainNow());
  if (decision.action === "wait") {
    await sleep(decision.waitMs);
    // Blocks may lag the wall clock: decide again on the chain's time, without waiting twice.
    decision = decideCut(before, await chainNow(), 0);
  }
  if (decision.action !== "run") return { status: "too_early", index: before.index, dueAt: before.at.toISOString() };

  let outcome: CallOutcome | null = null;
  let sendError: unknown = null;
  try {
    outcome = await runCut();
    if (outcome.status === "success") return { status: "ran", index: before.index, txHash: outcome.txHash };
  } catch (error) {
    sendError = error;
  }

  const after = await nextCut();
  const txHash = outcome?.txHash ?? null;
  if (cutHasRun(before, after)) {
    // A pending transaction of ours that has since executed is our cut.
    return outcome?.status === "pending" && txHash ? { status: "ran", index: before.index, txHash } : { status: "already_ran", index: before.index, txHash };
  }
  const detail = outcome?.status === "failure" ? JSON.stringify(outcome.failure) : sendError instanceof Error ? sendError.message : outcome ? "transaction still pending" : String(sendError);
  throw new KeeperError(`run_cut for cut ${before.index} did not go through: ${detail}`, before.index, txHash, { cause: sendError ?? outcome });
}
