import type { DirectorLineKind } from "./kinds";
import type { DirectorLineView, DirectorProofStatus } from "./view";

// What the Director page shows when: before the cut, once anyone can run it, and on the day a cut ran.

export type DirectorState = "scheduled" | "ready" | "done";

/**
 * `ready` once the cut time passed and nobody ran it yet (anyone can press the button), `done` for the rest
 * of the UTC day a cut ran (its receipt), `scheduled` otherwise (countdown and who is on the block).
 */
export function directorState({ now, cutAt, lastCutAt }: { now: Date; cutAt: Date; lastCutAt: Date | null }): DirectorState {
  if (now.getTime() >= cutAt.getTime()) return "ready";
  if (lastCutAt && lastCutAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) return "done";
  return "scheduled";
}

const AFTER_CUT: readonly DirectorLineKind[] = ["after-cut-roast", "after-cut-receipt"];

/** Lines to list: drops roasts and receipts of a cut that has not run yet (`cutIndex` at or past the next cut). */
export function linesForFeed(lines: readonly DirectorLineView[], nextCutIndex: number): DirectorLineView[] {
  return lines.filter((line) => !(AFTER_CUT.includes(line.kind) && line.cutIndex !== null && line.cutIndex >= nextCutIndex));
}

/** The badge of a line: what its proof says, in the design's words. */
export function proofBadge(status: DirectorProofStatus): { label: string; tone: "verified" | "signed" | "sample" | "failed" } {
  switch (status) {
    case "verified":
      return { label: "Verified · NEAR AI", tone: "verified" };
    case "partial":
      return { label: "Signed · NEAR AI", tone: "signed" };
    case "unsigned":
      return { label: "Sample line · not signed", tone: "sample" };
    default:
      return { label: "Not verified", tone: "failed" };
  }
}

/** Who said it: the Director, or a robot posting in its own voice. */
export const KIND_LABEL: Record<DirectorLineKind, string> = {
  scheduled: "Before the cut",
  "final-hour": "Final hour",
  "after-cut-roast": "Roast",
  "after-cut-receipt": "Receipt",
  "robot-post": "Robot post",
};
