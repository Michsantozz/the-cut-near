import type { PersonalityId } from "@/entities/agent";

// What the MCP server needs from the move relay (src/features/moves/model): the contract's request template and
// the local copy of `submit_move`'s checks. A feature cannot import another, so src/app passes them in.

export type MoveSignatureInput = {
  modelId: string;
  requestBody: string;
  responseBody: string;
  signature: { text: string; signature: string; signing_address: string; signing_algo?: string; signature_kind?: string };
  signers: readonly string[];
};

export type MoveSignatureResult = { ok: true; signature: string; signer: string } | { ok: false; reason: string };

export type MoveRequestTemplateInput = {
  modelId: string;
  maxTokens: number;
  reasoningEffort: "low" | "medium" | "high" | null;
  agent: { id: string; name: string; personality: PersonalityId; charter: string };
  briefJson: string;
};

export type MovePorts = {
  /** `checkMoveSignature`: the checks `submit_move` makes. */
  check(input: MoveSignatureInput): MoveSignatureResult;
  /** `signedMoveText`: `<model_id>:<sha256 hex of request>:<sha256 hex of response>`. */
  signedText(modelId: string, requestBody: string, responseBody: string): string;
  sha256Hex(text: string): string;
  /** `moveRequestBody`: the contract's request template, for the sample world. */
  requestBody(input: MoveRequestTemplateInput): string;
};
