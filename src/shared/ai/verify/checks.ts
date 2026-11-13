import { normalizeAddress, type SignerIdentity } from "./signature";
import type { SigningAlgo } from "./schemas";

/**
 * One verification step, as shown under "Check this line".
 * - `local`: computed here from the stored bytes and evidence, with no third party.
 * - `delegated`: the verdict of an outside service, named in `by` with a link to how it works.
 * `warn` means "not established" (a service was unreachable, a check was turned off, a weaker binding);
 * `fail` means the evidence contradicts the claim.
 */
export type CheckStatus = "pass" | "warn" | "fail" | "skipped";
export type CheckScope = "local" | "delegated";

export type ProofCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  scope: CheckScope;
  by?: { name: string; url: string };
  detail?: string;
};

export const DELEGATES = {
  intel: { name: "Intel DCAP via dcap-qvl (collateral from Phala PCCS)", url: "https://github.com/Phala-Network/dcap-qvl" },
  nvidia: { name: "NVIDIA Remote Attestation Service (NRAS)", url: "https://docs.api.nvidia.com/attestation/reference/attestmultigpu_1" },
} as const;

export const LINKS = {
  verifier: "https://cloud.near.ai/verify",
  teeExplorer: "https://proof.t16z.com/",
  responseSignatures: "https://docs.near.ai/cloud/verification/cloud-api/response-signatures",
  modelAttestations: "https://docs.near.ai/cloud/verification/cloud-api/model-attestations",
  quoteBindings: "https://docs.near.ai/cloud/verification/reference/quote-nonce-signer",
} as const;

/** The verdict on one attestation report (the gateway's or a model candidate's). */
export type ReportVerdict = {
  role: "gateway" | "model";
  signer: SignerIdentity;
  /** The Intel TDX quote, hex, so anyone can re-check it (e.g. at proof.t16z.com). */
  intelQuote: string;
  composeHash: string | null;
  appId: string | null;
  instanceId: string | null;
  tcbStatus: string | null;
  checks: ProofCheck[];
};

/** Preflight evidence: fetched with a fresh client nonce before the completion it vouches for. */
export type AttestationEvidence = {
  model: string;
  signingAlgo: SigningAlgo;
  nonce: string;
  fetchedAt: string;
  gateway: ReportVerdict;
  models: ReportVerdict[];
};

/** Worst status first: fail > warn > skipped > pass. An empty list is "skipped". */
export function worst(statuses: CheckStatus[]): CheckStatus {
  if (statuses.length === 0) return "skipped";
  for (const status of ["fail", "warn", "skipped"] as const) if (statuses.includes(status)) return status;
  return "pass";
}

export const reportFailed = (report: ReportVerdict): boolean => report.checks.some((check) => check.status === "fail");

/** Distinct signer identities among reports that failed no check. */
export function verifiedSigners(reports: ReportVerdict[]): SignerIdentity[] {
  const seen = new Map<string, SignerIdentity>();
  for (const report of reports) {
    if (reportFailed(report)) continue;
    const identity = { algo: report.signer.algo, address: normalizeAddress(report.signer.address) };
    seen.set(`${identity.algo}:${identity.address}`, identity);
  }
  return [...seen.values()];
}
