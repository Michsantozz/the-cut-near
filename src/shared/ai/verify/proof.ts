import { sha256Hex } from "./bytes";
import { LINKS, reportFailed, verifiedSigners, worst, type AttestationEvidence, type CheckStatus, type ProofCheck, type ReportVerdict } from "./checks";
import type { ChatSignature } from "./schemas";
import { expectedSignedText, sameSigner, signatureKindOf, verifySignatureBySigner, type SignatureKind } from "./signature";

// Ties one chat reply to the TEE: exact-byte hashes -> signature -> signer attested by preflight evidence.
// Everything here is local and pure; the hardware verdicts it summarizes were recorded in the evidence.
// Spec: https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md

/**
 * - `verified`: every check passed: bytes, signature, a model-TEE signer attested before the reply, hardware.
 * - `partial`: nothing contradicts the claim, but something was not established (a hardware service was
 *   unreachable or off, the gateway signed instead of the model TEE, the evidence is stale).
 * - `failed`: a check contradicts the claim (hash mismatch, bad signature, unknown signer, bad quote).
 * - `unavailable`: no signature could be fetched for the reply.
 */
export type ProofStatus = "verified" | "partial" | "failed" | "unavailable";

/** The three rows of the "Check this line" card. */
export type ProofSummary = {
  /** The model ran in an attested TEE (Intel TDX + NVIDIA GPU), checked before the reply. */
  sealedHardware: CheckStatus;
  /** The reply was signed by a key born in that TEE. */
  signedByModel: CheckStatus;
  /** The signed hashes match the exact prompt and reply we stored. */
  sameWords: CheckStatus;
};

export type CompletionProof = {
  status: ProofStatus;
  summary: ProofSummary;
  signatureKind: SignatureKind | null;
  requestSha256: string;
  responseSha256: string;
  /** The text the TEE must have signed for these exact bytes. */
  expectedText: string;
  checks: ProofCheck[];
  verifiedAt: string;
};

export type VerifyCompletionInput = {
  requestBody: string;
  responseBody: string;
  /** Canonical model id sent in the request. */
  model: string;
  signature: ChatSignature | null;
  /** Preflight evidence, fetched before the completion. */
  evidence: AttestationEvidence | null;
  /** When the reply was received; evidence fetched later cannot vouch for it. */
  receivedAt: Date;
  /** Evidence older than this when the reply arrived is "stale" (warn). Default 30 minutes. */
  maxEvidenceAgeMs?: number;
  /** Extra checks from the caller, e.g. "the shown line is the signed reply's content". */
  extraChecks?: ProofCheck[];
  now?: Date;
};

const check = (id: string, label: string, status: CheckStatus, detail?: string): ProofCheck => ({ id, label, status, scope: "local", ...(detail ? { detail } : {}) });

function hardwareStatus(reports: ReportVerdict[]): CheckStatus {
  return worst(reports.flatMap((report) => report.checks.map((c) => c.status)));
}

export function verifyCompletionProof(input: VerifyCompletionInput): CompletionProof {
  const { requestBody, responseBody, model, signature, evidence } = input;
  const requestSha256 = sha256Hex(requestBody);
  const responseSha256 = sha256Hex(responseBody);
  const kind = signature ? signatureKindOf(signature) : null;
  const expectedText = expectedSignedText(requestBody, responseBody, kind === "gateway" ? undefined : model);
  const checks: ProofCheck[] = [];
  const now = input.now ?? new Date();

  if (!signature) {
    checks.push(check("signature", "Signed by the TEE", "fail", "No signature could be fetched for this reply."));
    return { status: "unavailable", summary: { sealedHardware: evidence ? hardwareStatus([evidence.gateway, ...evidence.models]) : "skipped", signedByModel: "fail", sameWords: "skipped" }, signatureKind: null, requestSha256, responseSha256, expectedText, checks: [...checks, ...(input.extraChecks ?? [])], verifiedAt: now.toISOString() };
  }

  // 1. Same words: the signed text must be built from the hashes of the exact bytes we stored.
  const gatewayText = expectedSignedText(requestBody, responseBody);
  const textMatches = kind === null ? signature.text === expectedText || signature.text === gatewayText : signature.text === expectedText;
  checks.push(check("hashes", "Same words as stored", textMatches ? "pass" : "fail", textMatches ? `SHA-256 of the prompt ${requestSha256} and of the reply ${responseSha256} are what was signed.` : "The signed hashes do not match the stored prompt and reply."));

  // 2. The signature recovers the stated signer.
  const verdict = verifySignatureBySigner(signature);
  checks.push(check("signature", "Valid signature", verdict.ok ? "pass" : "fail", verdict.ok ? `${signature.signing_algo} signature by ${verdict.signer.address}.` : verdict.reason));

  // 3. That signer was attested, before the reply, for the role the signature claims.
  let signerStatus: CheckStatus;
  let signerDetail: string;
  if (!evidence) {
    signerStatus = "fail";
    signerDetail = "No preflight attestation was recorded for this reply.";
  } else if (evidence.model !== model || evidence.signingAlgo !== signature.signing_algo) {
    signerStatus = "fail";
    signerDetail = `The attestation was for ${evidence.model} (${evidence.signingAlgo}), the reply for ${model} (${signature.signing_algo}).`;
  } else if (!verdict.ok) {
    signerStatus = "fail";
    signerDetail = "The signature is invalid, so its signer cannot be matched.";
  } else if (kind === "provider_tee") {
    // Instances of one model share a key, so several candidates may carry the same identity:
    // the signer must match exactly one distinct verified identity, and no candidate may have failed.
    const matches = verifiedSigners(evidence.models).filter((signer) => sameSigner(signer, verdict.signer));
    const anyFailed = evidence.models.some(reportFailed);
    if (evidence.models.length === 0) [signerStatus, signerDetail] = ["fail", "The attestation had no model candidates."];
    else if (anyFailed) [signerStatus, signerDetail] = ["fail", "A model attestation candidate failed verification."];
    else if (matches.length !== 1) [signerStatus, signerDetail] = ["fail", `The signer ${verdict.signer.address} is not the attested model key.`];
    else [signerStatus, signerDetail] = ["pass", `The signer is the key attested inside the ${model} TEE (${evidence.models.length} candidate reports).`];
  } else if (kind === "gateway") {
    const matches = !reportFailed(evidence.gateway) && sameSigner(evidence.gateway.signer, verdict.signer);
    [signerStatus, signerDetail] = matches ? ["warn", "Signed by the attested NEAR AI gateway TEE, not by the model TEE itself."] : ["fail", "The gateway signer is not the attested gateway key."];
  } else {
    [signerStatus, signerDetail] = ["warn", `Unknown signature_kind "${signature.signature_kind ?? "(none)"}": the signer role cannot be established.`];
  }
  checks.push(check("signer-attested", "Key from the sealed machine", signerStatus, signerDetail));

  // 4. Preflight freshness: evidence must predate the reply and be recent.
  if (evidence) {
    const fetchedAt = new Date(evidence.fetchedAt).getTime();
    const age = input.receivedAt.getTime() - fetchedAt;
    const maxAge = input.maxEvidenceAgeMs ?? 30 * 60_000;
    const status: CheckStatus = age < 0 ? "fail" : age > maxAge ? "warn" : "pass";
    checks.push(check("evidence-fresh", "Attested before the reply", status, age < 0 ? "The attestation was fetched after the reply." : `Attested ${Math.round(age / 1000)} s before the reply with a fresh nonce.`));
  }

  checks.push(...(input.extraChecks ?? []));

  const hardware = evidence ? hardwareStatus(kind === "gateway" ? [evidence.gateway] : [evidence.gateway, ...evidence.models]) : "fail";
  const byId = (id: string) => checks.find((c) => c.id === id)?.status ?? "skipped";
  const summary: ProofSummary = {
    sealedHardware: hardware,
    signedByModel: worst([byId("signature"), byId("signer-attested")]),
    sameWords: worst([byId("hashes"), ...checks.filter((c) => c.id === "line-in-reply").map((c) => c.status)]),
  };
  const all = worst([...checks.map((c) => c.status), hardware]);
  const status: ProofStatus = all === "fail" ? "failed" : all === "pass" ? "verified" : "partial";
  return { status, summary, signatureKind: kind, requestSha256, responseSha256, expectedText, checks, verifiedAt: now.toISOString() };
}

/**
 * A "reply receipt" link for the public Verification Center, which re-fetches fresh hardware evidence in the
 * viewer's browser and checks the signature and signer. It cannot see the prompt or reply, so it trusts our
 * hashes; anyone can recompute them from the proof bundle. https://docs.near.ai/cloud/verification/verification-center
 */
export function verifierUrl(params: { model: string; chatId: string; signature: ChatSignature; verifiedAt?: string }): string {
  const receipt = {
    completionId: params.chatId,
    model: params.model,
    signatureKind: signatureKindOf(params.signature) ?? "provider_tee",
    signingAlgo: params.signature.signing_algo,
    signingAddress: params.signature.signing_address,
    signedText: params.signature.text,
    signature: params.signature.signature,
    ...(params.verifiedAt ? { verifiedAt: params.verifiedAt } : {}),
  };
  return `${LINKS.verifier}?model=${encodeURIComponent(params.model)}#receipt=${base64Url(JSON.stringify(receipt))}`;
}

function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
