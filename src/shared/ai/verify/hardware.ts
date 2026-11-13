import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { hexToBytes, toHex } from "./bytes";
import { DELEGATES, type CheckStatus, type ProofCheck } from "./checks";
import { nrasResponseSchema, nvidiaPayloadSchema } from "./schemas";
import type { TdxQuoteFields } from "./tdx";

// Delegated hardware checks: these need outside services and are labeled as such in every proof.
// - Intel TDX: the quote's signature chain and TCB status, verified with dcap-qvl against collateral
//   from Phala's PCCS (Intel PCS also works). https://docs.near.ai/cloud/verification/reference/quote-nonce-signer.md
// - NVIDIA GPU: the GPU evidence is sent to NVIDIA NRAS, and the returned JWTs are checked here against
//   NVIDIA's published keys (JWKS), issuer, expiry and our nonce.

export type HardwareVerdict = { status: CheckStatus; detail: string; tcbStatus?: string };

export interface HardwareVerifier {
  /** Verifies an Intel TDX quote; `fields` are the locally parsed fields, which must match the verified ones. */
  intelQuote(quoteHex: string, fields: TdxQuoteFields): Promise<HardwareVerdict>;
  /** Verifies GPU evidence (`nvidia_payload` JSON text) bound to `nonce`. */
  nvidiaGpu(payloadJson: string, nonce: string): Promise<HardwareVerdict>;
}

export const NRAS_URL = "https://nras.attestation.nvidia.com/v3/attest/gpu";
export const NRAS_JWKS_URL = "https://nras.attestation.nvidia.com/.well-known/jwks.json";
const NRAS_ISSUER = "https://nras.attestation.nvidia.com";

/** TCB statuses accepted as "pass". Anything else that verifies is a "warn" listing Intel's advisories. */
export const ACCEPTED_TCB_STATUSES = ["UpToDate"] as const;

export type HardwareVerifierOptions = { pccsUrl?: string; nrasUrl?: string; jwksUrl?: string; timeoutMs?: number };

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** Errors that mean "the service could not be reached", as opposed to "the evidence is bad". */
const UNREACHABLE = /fetch|network|timed out|ENOTFOUND|ECONN|EAI_AGAIN|socket|status 5\d\d/i;

type DcapModule = typeof import("@phala/dcap-qvl");

async function loadDcap(): Promise<DcapModule> {
  // CommonJS package: depending on the loader its exports arrive as named exports or under `default`.
  const mod = (await import("@phala/dcap-qvl")) as DcapModule & { default?: DcapModule };
  return typeof mod.getCollateralAndVerify === "function" ? mod : (mod.default ?? mod);
}

export function createHardwareVerifier(options: HardwareVerifierOptions = {}): HardwareVerifier {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const jwks = createRemoteJWKSet(new URL(options.jwksUrl ?? NRAS_JWKS_URL), { timeoutDuration: timeoutMs });

  const verifyJwt = async (token: string, nonce: string): Promise<JWTPayload> => {
    // NRAS stamps nbf/iat with its own clock; allow for skew with ours.
    const { payload } = await jwtVerify(token, jwks, { issuer: NRAS_ISSUER, algorithms: ["ES384"], clockTolerance: 120 });
    if (typeof payload.eat_nonce !== "string" || payload.eat_nonce.toLowerCase() !== nonce.toLowerCase()) throw new Error("NRAS token eat_nonce does not match our nonce.");
    return payload;
  };

  return {
    async intelQuote(quoteHex, fields) {
      const bytes = hexToBytes(quoteHex);
      if (!bytes) return { status: "fail", detail: "The quote is not hex." };
      try {
        const dcap = await loadDcap();
        const attempt = () => withTimeout(dcap.getCollateralAndVerify(bytes, options.pccsUrl), timeoutMs, "Intel quote verification");
        // Collateral comes over the network: one retry absorbs a transient fetch failure.
        const verified = await attempt().catch((error: unknown) => (UNREACHABLE.test(message(error)) ? attempt() : Promise.reject(error)));
        const report = verified.report.asTd10() ?? verified.report.asTd15()?.base ?? null;
        if (!report) return { status: "fail", detail: `Expected a TDX report, got ${verified.report.type}.` };
        // The checks we ran locally read the same bytes; make sure the verified report agrees field by field.
        if (toHex(report.reportData) !== fields.reportData || toHex(report.mrConfigId) !== fields.mrConfigId || toHex(report.rtMr3) !== fields.rtMr3) {
          return { status: "fail", detail: "The verified quote's fields differ from the parsed ones." };
        }
        const accepted = (ACCEPTED_TCB_STATUSES as readonly string[]).includes(verified.status);
        const advisories = verified.advisory_ids.length ? ` Advisories: ${verified.advisory_ids.join(", ")}.` : "";
        return { status: accepted ? "pass" : "warn", tcbStatus: verified.status, detail: `Quote signed by genuine Intel TDX hardware. TCB status ${verified.status}.${advisories}` };
      } catch (error) {
        const text = message(error);
        // Unreachable collateral is "not established"; a quote that fails verification is a failure.
        const unreachable = UNREACHABLE.test(text);
        return { status: unreachable ? "warn" : "fail", detail: `Intel quote verification ${unreachable ? "could not run" : "failed"}: ${text}` };
      }
    },

    async nvidiaGpu(payloadJson, nonce) {
      let payload: unknown;
      try {
        payload = JSON.parse(payloadJson);
      } catch {
        return { status: "fail", detail: "nvidia_payload is not JSON." };
      }
      const parsed = nvidiaPayloadSchema.safeParse(payload);
      if (!parsed.success) return { status: "fail", detail: "nvidia_payload has no nonce or evidence." };
      if (parsed.data.nonce.toLowerCase() !== nonce.toLowerCase()) return { status: "fail", detail: "The GPU evidence is bound to another nonce." };

      let body: unknown;
      try {
        const response = await fetch(options.nrasUrl ?? NRAS_URL, {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: payloadJson,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return { status: "warn", detail: `NVIDIA NRAS answered ${response.status}.` };
        body = await response.json();
      } catch (error) {
        return { status: "warn", detail: `NVIDIA NRAS could not be reached: ${message(error)}` };
      }
      const answer = nrasResponseSchema.safeParse(body);
      if (!answer.success) return { status: "fail", detail: "NVIDIA NRAS answered in an unexpected format." };

      try {
        const overall = await verifyJwt(answer.data[0][1], nonce);
        if (overall["x-nvidia-overall-att-result"] !== true) return { status: "fail", detail: "NVIDIA NRAS: the overall attestation result is not true." };
        const gpus = Object.entries(answer.data[1]);
        if (gpus.length === 0) return { status: "fail", detail: "NVIDIA NRAS returned no per-GPU results." };
        const models = new Set<string>();
        for (const [name, token] of gpus) {
          const gpu = await verifyJwt(token, nonce);
          const failed = gpu.measres !== "success" || gpu.secboot !== true || gpu.dbgstat !== "disabled" || gpu["x-nvidia-gpu-attestation-report-signature-verified"] !== true;
          if (failed) return { status: "fail", detail: `NVIDIA NRAS: ${name} failed (measurements, secure boot, debug or report signature).` };
          if (typeof gpu.hwmodel === "string") models.add(gpu.hwmodel);
        }
        return { status: "pass", detail: `${gpus.length} GPUs (${[...models].join(", ") || "unknown model"}) attested by NVIDIA in confidential-computing mode; tokens checked against NVIDIA's keys.` };
      } catch (error) {
        return { status: "fail", detail: `NVIDIA NRAS token check failed: ${message(error)}` };
      }
    },
  };
}

/** Wraps a verdict as a delegated proof check. */
export function delegatedCheck(id: "intel-quote" | "nvidia-gpu", verdict: HardwareVerdict): ProofCheck {
  const by = id === "intel-quote" ? DELEGATES.intel : DELEGATES.nvidia;
  const label = id === "intel-quote" ? "Genuine Intel TDX machine" : "Genuine NVIDIA GPUs in TEE mode";
  return { id, label, status: verdict.status, scope: "delegated", by, detail: verdict.detail };
}

export function skippedHardwareChecks(role: "gateway" | "model", reason: string): ProofCheck[] {
  const ids = role === "model" ? (["intel-quote", "nvidia-gpu"] as const) : (["intel-quote"] as const);
  return ids.map((id) => ({ ...delegatedCheck(id, { status: "skipped", detail: reason }) }));
}
