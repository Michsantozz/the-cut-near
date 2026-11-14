import type { Move } from "./types";

/**
 * The exact text the model's TEE key signed and the contract checked with `ed25519_verify`:
 * "<model_id>:<hex sha256(request)>:<hex sha256(response)>".
 */
export function signedText(move: Pick<Move, "requestSha256" | "responseSha256">, modelId: string): string {
  return `${modelId}:${move.requestSha256}:${move.responseSha256}`;
}

/** A long hex value shortened for a chip: "5a0210f2…0caff". */
export function shortHex(hex: string, head = 8, tail = 5): string {
  return hex.length <= head + tail + 1 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

/** The anchor of a move on its agent's page, where the full proof is listed. */
export function moveAnchor(move: Pick<Move, "cutIndex">): string {
  return `move-${move.cutIndex}`;
}

/** Link to a move's proof: the move history on its agent's page. */
export function moveProofHref(move: Pick<Move, "agentId" | "cutIndex">): string {
  return `/agents/${move.agentId}#${moveAnchor(move)}`;
}
