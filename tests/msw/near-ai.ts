import { readFileSync } from "node:fs";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { http, HttpResponse } from "msw";
import { eip191Digest, ethAddressOf, expectedSignedText } from "@/shared/ai/verify/signature";
import { toHex, hexToBytes } from "@/shared/ai/verify/bytes";
import type { AttestationReport, NearReport } from "@/shared/ai/verify/schemas";
import type { HardwareVerifier } from "@/shared/ai/verify/hardware";

// A fake NEAR AI Cloud for MSW: a model TEE with its own secp256k1 key, attestation reports built from a
// real recorded report (patched so the quote binds the fake key and the request nonce), chat completions
// and signatures over the exact bytes exchanged.

export const BASE = "https://cloud-api.near.ai/v1";

type Fixture = { nonce: string; report: AttestationReport };
export const recordedAttestation = (): Fixture => JSON.parse(readFileSync(new URL("../fixtures/near-ai/attestation-glm-5.3-flash.json", import.meta.url), "utf8")) as Fixture;

/** EIP-191 personal_sign, as 0x r || s || v (v = 27/28). */
export function signEip191(text: string, secretKey: Uint8Array): string {
  const recovered = secp256k1.sign(eip191Digest(text), secretKey, { prehash: false, format: "recovered" });
  const v = recovered[0] + 27;
  return `0x${toHex(recovered.subarray(1))}${v.toString(16).padStart(2, "0")}`;
}

export function newSigner() {
  const secretKey = secp256k1.utils.randomSecretKey();
  return { secretKey, address: ethAddressOf(secp256k1.getPublicKey(secretKey, false)) };
}

/** Rewrites a v4 TDX quote's report data to `signer (padded to 32 bytes) || nonce`. Test-only: breaks the Intel signature. */
export function bindQuote(quoteHex: string, signer: string, nonce: string): string {
  const quote = hexToBytes(quoteHex) as Uint8Array;
  const reportData = new Uint8Array(64);
  reportData.set(hexToBytes(signer) as Uint8Array);
  reportData.set(hexToBytes(nonce) as Uint8Array, 32);
  quote.set(reportData, 48 + 520);
  return toHex(quote);
}

function boundReport(report: NearReport, signer: string, nonce: string): NearReport {
  return { ...report, signing_address: signer, request_nonce: nonce, intel_quote: bindQuote(report.intel_quote, signer, nonce), ...(report.report_data ? { report_data: undefined } : {}) };
}

/** A hardware verifier that answers without the network. */
export const fakeHardware = (intel: "pass" | "warn" | "fail" = "pass", gpu: "pass" | "warn" | "fail" = "pass"): HardwareVerifier => ({
  intelQuote: async () => ({ status: intel, detail: `fake Intel ${intel}`, tcbStatus: intel === "pass" ? "UpToDate" : "OutOfDate" }),
  nvidiaGpu: async () => ({ status: gpu, detail: `fake NVIDIA ${gpu}` }),
});

export type FakeCloudOptions = {
  model?: string;
  ownedBy?: string;
  /** The line the model answers with, per call (cycled). */
  lines?: string[];
  /** Sign with another key than the attested one. */
  rogueSigner?: boolean;
  /** Signature kind returned. */
  signatureKind?: "provider_tee" | "gateway";
  /** 404s before the signature is found. */
  signatureMisses?: number;
};

export function fakeNearAiCloud(options: FakeCloudOptions = {}) {
  const model = options.model ?? "z-ai/glm-5.3-flash";
  const modelKey = newSigner();
  const gatewayKey = newSigner();
  const rogue = newSigner();
  const fixture = recordedAttestation();
  const chats = new Map<string, { request: string; response: string }>();
  const calls = { models: 0, attestation: 0, chat: 0, signature: 0 };
  const requests: { url: string; headers: Headers; body: string }[] = [];
  let lineIndex = 0;
  let misses = options.signatureMisses ?? 0;

  const handlers = [
    http.get(`${BASE}/models`, () => {
      calls.models++;
      return HttpResponse.json({ object: "list", data: [{ id: model, object: "model", owned_by: options.ownedBy ?? "nearai", output_modalities: ["text"] }] });
    }),
    http.get(`${BASE}/attestation/report`, ({ request }) => {
      calls.attestation++;
      const url = new URL(request.url);
      const nonce = url.searchParams.get("nonce") ?? "";
      requests.push({ url: request.url, headers: request.headers, body: "" });
      const gateway = boundReport(fixture.report.gateway_attestation, gatewayKey.address, nonce);
      const candidate = boundReport((fixture.report.model_attestations ?? [])[0], modelKey.address, nonce);
      return HttpResponse.json({ gateway_attestation: gateway, model_attestations: [candidate, { ...candidate }] });
    }),
    http.post(`${BASE}/chat/completions`, async ({ request }) => {
      calls.chat++;
      const body = await request.text();
      requests.push({ url: request.url, headers: request.headers, body });
      const lines = options.lines ?? ["23,600 $CUT and 4 hours. A miracle or a whale, bunny."];
      const line = lines[lineIndex++ % lines.length];
      const id = `chatcmpl-${calls.chat.toString(16).padStart(8, "0")}`;
      // Pretty-printed with a trailing newline on purpose: the signature covers these exact bytes.
      const response = `${JSON.stringify({ id, object: "chat.completion", model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ line }) } }], usage: { prompt_tokens: 300, completion_tokens: 20, total_tokens: 320 } }, null, 2)}\n`;
      chats.set(id, { request: body, response });
      return new HttpResponse(response, { headers: { "content-type": "application/json" } });
    }),
    http.get(`${BASE}/signature/:id`, ({ params }) => {
      calls.signature++;
      if (misses > 0) {
        misses--;
        return HttpResponse.json({ error: { message: "Chat id not found or expired" } }, { status: 404 });
      }
      const chat = chats.get(String(params.id));
      if (!chat) return HttpResponse.json({ error: { message: "Chat id not found or expired" } }, { status: 404 });
      const kind = options.signatureKind ?? "provider_tee";
      const text = expectedSignedText(chat.request, chat.response, kind === "gateway" ? undefined : model);
      const key = options.rogueSigner ? rogue : kind === "gateway" ? gatewayKey : modelKey;
      return HttpResponse.json({ text, signature: signEip191(text, key.secretKey), signing_address: key.address, signing_algo: "ecdsa", signature_kind: kind });
    }),
  ];

  return { model, modelKey, gatewayKey, handlers, calls, requests, chats };
}
