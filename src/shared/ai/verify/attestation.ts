import "server-only";
import type { NearAiClient } from "../client";
import { NearAiError } from "../errors";
import { hexToBytes, toHex } from "./bytes";
import type { AttestationEvidence, ProofCheck, ReportVerdict } from "./checks";
import { delegatedCheck, skippedHardwareChecks, type HardwareVerifier } from "./hardware";
import { checkReportLocally } from "./report-checks";
import type { NearReport, SigningAlgo } from "./schemas";
import { normalizeAddress } from "./signature";
import { parseTdxQuote } from "./tdx";

// Preflight: fetch the gateway report and every NEAR model candidate with a fresh nonce, verify each one,
// and keep the verdicts. A later response signature is matched against these verdicts, never against a
// report fetched after the reply. https://docs.near.ai/cloud/verification/cloud-api/model-attestations.md

/** 32 random bytes as 64 hex characters, from the platform CSPRNG. */
export function freshNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export type CollectAttestationOptions = {
  model: string;
  signingAlgo: SigningAlgo;
  /** Null skips the delegated hardware checks (they are recorded as "skipped"). */
  hardware: HardwareVerifier | null;
  nonce?: string;
  now?: () => Date;
};

async function verifyReport(report: NearReport, role: ReportVerdict["role"], nonce: string, hardware: HardwareVerifier | null): Promise<ReportVerdict> {
  const checks: ProofCheck[] = checkReportLocally(report, nonce);
  const fields = parseTdxQuote(report.intel_quote);
  let tcbStatus: string | null = null;
  if (!hardware) checks.push(...skippedHardwareChecks(role, "Hardware checks are turned off (NEAR_AI_HARDWARE_CHECKS=off)."));
  else if (!fields) checks.push(...skippedHardwareChecks(role, "The quote could not be parsed."));
  else {
    const [intel, gpu] = await Promise.all([
      hardware.intelQuote(report.intel_quote, fields),
      role === "model" ? (report.nvidia_payload ? hardware.nvidiaGpu(report.nvidia_payload, nonce) : Promise.resolve({ status: "fail" as const, detail: "The model report has no GPU evidence." })) : Promise.resolve(null),
    ]);
    tcbStatus = intel.tcbStatus ?? null;
    checks.push(delegatedCheck("intel-quote", intel));
    if (gpu) checks.push(delegatedCheck("nvidia-gpu", gpu));
  }
  return {
    role,
    signer: { algo: report.signing_algo, address: normalizeAddress(report.signing_address) },
    intelQuote: toHex(hexToBytes(report.intel_quote) ?? new Uint8Array()),
    composeHash: report.info.compose_hash ?? null,
    appId: report.info.app_id ?? null,
    instanceId: report.info.instance_id ?? null,
    tcbStatus,
    checks,
  };
}

/**
 * Fetches and verifies the attestation for `model`. Throws a `not-private` NearAiError when NEAR returns no
 * model candidates: the model does not run in a NEAR TEE, so nothing it says could be tied to hardware.
 */
export async function collectAttestation(client: NearAiClient, options: CollectAttestationOptions): Promise<AttestationEvidence> {
  const nonce = options.nonce ?? freshNonce();
  const fetchedAt = (options.now ?? (() => new Date()))();
  const report = await client.attestationReport({ model: options.model, nonce, signingAlgo: options.signingAlgo });
  const candidates = report.model_attestations ?? [];
  if (candidates.length === 0) throw new NearAiError("not-private", `NEAR AI returned no model attestation for ${options.model}: it does not run in a NEAR TEE.`);
  const [gateway, ...models] = await Promise.all([verifyReport(report.gateway_attestation, "gateway", nonce, options.hardware), ...candidates.map((candidate) => verifyReport(candidate, "model", nonce, options.hardware))]);
  return { model: options.model, signingAlgo: options.signingAlgo, nonce, fetchedAt: fetchedAt.toISOString(), gateway, models };
}
