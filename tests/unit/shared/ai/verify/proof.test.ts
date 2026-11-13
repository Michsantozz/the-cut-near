import { describe, expect, it } from "vitest";
import type { AttestationEvidence, ProofCheck, ReportVerdict } from "@/shared/ai/verify/checks";
import { verifierUrl, verifyCompletionProof } from "@/shared/ai/verify/proof";
import type { ChatSignature } from "@/shared/ai/verify/schemas";
import { expectedSignedText } from "@/shared/ai/verify/signature";
import { newSigner, signEip191 } from "../../../../msw/near-ai";

// Signature fixtures in the documented format (GET /v1/signature/{chat_id}), signed by test keys.
const MODEL = "z-ai/glm-5.3-flash";
const REQUEST = JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "Roast Kiko Bun." }], stream: false });
const RESPONSE = `${JSON.stringify({ id: "chatcmpl-7f3a91c0", choices: [{ message: { content: '{"line":"23,600 $CUT between Kiko and oblivion. Pack your buns."}' } }] }, null, 2)}\n`;
const modelKey = newSigner();
const gatewayKey = newSigner();

const pass = (id: string, scope: ProofCheck["scope"] = "local"): ProofCheck => ({ id, label: id, status: "pass", scope });
const verdict = (role: ReportVerdict["role"], address: string, checks: ProofCheck[] = [pass("report-data"), pass("intel-quote", "delegated")]): ReportVerdict => ({
  role,
  signer: { algo: "ecdsa", address },
  intelQuote: "00",
  composeHash: null,
  appId: null,
  instanceId: null,
  tcbStatus: "UpToDate",
  checks,
});
const evidence = (overrides: Partial<AttestationEvidence> = {}): AttestationEvidence => ({
  model: MODEL,
  signingAlgo: "ecdsa",
  nonce: "ab".repeat(32),
  fetchedAt: "2026-11-13T13:47:00.000Z",
  gateway: verdict("gateway", gatewayKey.address),
  // Two candidates sharing one key, as NEAR returns them (instances of a model share a signing key).
  models: [verdict("model", modelKey.address), verdict("model", modelKey.address)],
  ...overrides,
});
const signed = (text: string, key = modelKey, kind: string | undefined = "provider_tee"): ChatSignature => ({ text, signature: signEip191(text, key.secretKey), signing_address: key.address, signing_algo: "ecdsa", ...(kind ? { signature_kind: kind } : {}) });
const receivedAt = new Date("2026-11-13T13:48:00.000Z");
const run = (signature: ChatSignature | null, ev: AttestationEvidence | null = evidence(), response = RESPONSE) => verifyCompletionProof({ requestBody: REQUEST, responseBody: response, model: MODEL, signature, evidence: ev, receivedAt, now: receivedAt });

describe("verifyCompletionProof", () => {
  it("verifies a provider_tee signature over the exact bytes by the attested model key", () => {
    const proof = run(signed(expectedSignedText(REQUEST, RESPONSE, MODEL)));
    expect(proof.status).toBe("verified");
    expect(proof.summary).toEqual({ sealedHardware: "pass", signedByModel: "pass", sameWords: "pass" });
    expect(proof.signatureKind).toBe("provider_tee");
    expect(proof.checks.map((c) => [c.id, c.status])).toEqual([
      ["hashes", "pass"],
      ["signature", "pass"],
      ["signer-attested", "pass"],
      ["evidence-fresh", "pass"],
    ]);
  });

  it("fails when the stored reply differs by one byte from what was signed", () => {
    const proof = run(signed(expectedSignedText(REQUEST, RESPONSE, MODEL)), evidence(), RESPONSE.trimEnd());
    expect(proof.status).toBe("failed");
    expect(proof.summary.sameWords).toBe("fail");
  });

  it("fails when the signer is not the attested model key", () => {
    const rogue = newSigner();
    const proof = run(signed(expectedSignedText(REQUEST, RESPONSE, MODEL), rogue));
    expect(proof.status).toBe("failed");
    expect(proof.checks.find((c) => c.id === "signer-attested")?.status).toBe("fail");
  });

  it("fails when any model candidate failed verification", () => {
    const ev = evidence({ models: [verdict("model", modelKey.address), verdict("model", modelKey.address, [{ ...pass("rtmr3"), status: "fail" }])] });
    expect(run(signed(expectedSignedText(REQUEST, RESPONSE, MODEL)), ev).status).toBe("failed");
  });

  it("is partial for a gateway signature: it binds the reply to the gateway, not the model TEE", () => {
    const proof = run(signed(expectedSignedText(REQUEST, RESPONSE), gatewayKey, "gateway"));
    expect(proof.status).toBe("partial");
    expect(proof.summary.signedByModel).toBe("warn");
    expect(proof.summary.sameWords).toBe("pass");
  });

  it("is partial when the hardware checks were skipped", () => {
    const skipped: ProofCheck = { id: "intel-quote", label: "Intel", status: "skipped", scope: "delegated" };
    const ev = evidence({ gateway: verdict("gateway", gatewayKey.address, [skipped]), models: [verdict("model", modelKey.address, [pass("report-data"), skipped])] });
    const proof = run(signed(expectedSignedText(REQUEST, RESPONSE, MODEL)), ev);
    expect(proof.status).toBe("partial");
    expect(proof.summary.sealedHardware).toBe("skipped");
  });

  it("fails when the attestation was fetched after the reply or for another model", () => {
    expect(run(signed(expectedSignedText(REQUEST, RESPONSE, MODEL)), evidence({ fetchedAt: "2026-11-13T13:49:00.000Z" })).status).toBe("failed");
    expect(run(signed(expectedSignedText(REQUEST, RESPONSE, MODEL)), evidence({ model: "Qwen/Qwen3.8-27B" })).status).toBe("failed");
  });

  it("is unavailable without a signature, and failed without evidence", () => {
    expect(run(null).status).toBe("unavailable");
    expect(run(signed(expectedSignedText(REQUEST, RESPONSE, MODEL)), null).status).toBe("failed");
  });
});

describe("verifierUrl", () => {
  it("links the Verification Center with a base64url receipt", () => {
    const signature = signed(expectedSignedText(REQUEST, RESPONSE, MODEL));
    const url = new URL(verifierUrl({ model: MODEL, chatId: "chatcmpl-7f3a91c0", signature, verifiedAt: "2026-11-13T18:01:00.000Z" }));
    expect(url.origin + url.pathname).toBe("https://cloud.near.ai/verify");
    expect(url.searchParams.get("model")).toBe(MODEL);
    const receipt = JSON.parse(Buffer.from(url.hash.replace("#receipt=", ""), "base64url").toString("utf8"));
    expect(receipt).toEqual({ completionId: "chatcmpl-7f3a91c0", model: MODEL, signatureKind: "provider_tee", signingAlgo: "ecdsa", signingAddress: signature.signing_address, signedText: signature.text, signature: signature.signature, verifiedAt: "2026-11-13T18:01:00.000Z" });
  });
});
