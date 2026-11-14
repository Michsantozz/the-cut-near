import type { AttestationEvidence, ChatSignature, ProofCheck, ProofStatus, ProofSummary, SignatureKind } from "@/shared/ai/verify";
import type { DirectorLineKind } from "./kinds";

/** A proof status, plus `unsigned` for the design's sample lines (DATA_SOURCE=sample), which no model wrote. */
export type DirectorProofStatus = ProofStatus | "unsigned";

/** A Director line as the UI shows it, with a compact proof status and where to check it. */
export type DirectorLineView = {
  id: string;
  kind: DirectorLineKind;
  /** The agent the line is about, or the agent speaking (agent posts). */
  subjectId: string | null;
  cutIndex: number | null;
  text: string;
  createdAt: string;
  model: string | null;
  proof: {
    status: DirectorProofStatus;
    /** The three rows of "Check this line": sealed hardware, signed by that model, same words. */
    summary: ProofSummary | null;
    chatId: string | null;
    /** This app's proof bundle, `GET /api/director/lines/{id}/proof`. */
    proofUrl: string;
    /** The NEAR AI Verification Center with this reply's receipt. */
    verifierUrl: string | null;
  };
};

/** Everything needed to check a line independently, served as JSON by the proof route. */
export type DirectorProofBundle = {
  version: 1;
  line: { id: string; kind: DirectorLineKind; subjectId: string | null; cutIndex: number | null; text: string; createdAt: string };
  status: DirectorProofStatus;
  summary: ProofSummary | null;
  /** Every check, each marked `local` (recomputed now from the stored bytes) or `delegated` (Intel, NVIDIA; recorded at generation). */
  checks: ProofCheck[];
  model: string | null;
  chatId: string | null;
  /** What we asked the AI (the user message). */
  prompt: string | null;
  /** Exact bytes sent and received, as UTF-8, with their SHA-256. */
  request: { body: string; sha256: string } | null;
  response: { body: string; sha256: string } | null;
  signature: (ChatSignature & { kind: SignatureKind | null; expectedText: string }) | null;
  /** Preflight evidence: nonce, gateway and model reports (with their Intel quotes) and their checks. */
  attestation: AttestationEvidence | null;
  links: { verifier: string | null; teeExplorer: string; docs: string };
  /** When the line was generated and when this bundle re-ran the local checks. */
  generatedAt: string;
  checkedAt: string;
  note?: string;
};

export const proofUrlOf = (id: string) => `/api/director/lines/${encodeURIComponent(id)}/proof`;
