import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { assertPrivateModel, createNearAiClient, isNearAiError, NearAiError, type NearAiClientOptions } from "@/shared/ai";
import { sha256Hex } from "@/shared/ai/verify";
import { BASE, fakeNearAiCloud } from "../../../msw/near-ai";
import { server } from "../../../msw/server";

const client = (overrides: Partial<NearAiClientOptions> = {}) =>
  createNearAiClient({ apiKey: "test-key", maxRetries: 2, timeoutMs: 2_000, signatureWait: { attempts: 3, delayMs: 1 }, ...overrides });

const request = { model: "z-ai/glm-5.3-flash", messages: [{ role: "user" as const, content: "Say ok." }] };

describe("chatCompletion", () => {
  it("sends the body once as serialized and returns the exact bytes both ways", async () => {
    const cloud = fakeNearAiCloud();
    server.use(...cloud.handlers);
    const raw = await client().chatCompletion(request);
    const sent = cloud.requests.at(-1);
    expect(sent?.body).toBe(raw.requestBody);
    expect(raw.requestBody).toBe(JSON.stringify({ ...request, stream: false }));
    expect(raw.responseBody).toBe(cloud.chats.get(raw.chatId)?.response);
    expect(raw.responseBody.endsWith("}\n")).toBe(true);
    expect(sha256Hex(raw.responseBody)).toBe(sha256Hex(cloud.chats.get(raw.chatId)?.response ?? ""));
    expect(sent?.headers.get("authorization")).toBe("Bearer test-key");
    expect(sent?.headers.get("x-no-aliasing")).toBe("true");
    expect(raw.completion.choices[0]?.message.content).toContain("23,600");
  });

  it("retries 429 and 5xx with backoff, then succeeds", async () => {
    const cloud = fakeNearAiCloud();
    let calls = 0;
    server.use(
      http.post(`${BASE}/chat/completions`, () => {
        calls++;
        if (calls === 1) return HttpResponse.json({ error: { message: "slow down" } }, { status: 429, headers: { "retry-after-ms": "5" } });
        if (calls === 2) return HttpResponse.json({ error: { message: "upstream" } }, { status: 503, headers: { "retry-after-ms": "5" } });
        return undefined;
      }),
      ...cloud.handlers,
    );
    const raw = await client().chatCompletion(request);
    expect(calls).toBe(3);
    expect(raw.chatId).toMatch(/^chatcmpl-/);
  });

  it("throws typed errors: rate limit after all retries, refused key, timeout, unusable body", async () => {
    server.use(http.post(`${BASE}/chat/completions`, () => HttpResponse.json({}, { status: 429, headers: { "retry-after-ms": "1" } })));
    await expect(client().chatCompletion(request)).rejects.toMatchObject({ code: "rate-limited", status: 429, retryable: true });

    server.use(http.post(`${BASE}/chat/completions`, () => HttpResponse.json({ error: { message: "bad key" } }, { status: 401 })));
    await expect(client().chatCompletion(request)).rejects.toMatchObject({ code: "config", status: 401, retryable: false });

    server.use(
      http.post(`${BASE}/chat/completions`, async () => {
        await delay(500);
        return HttpResponse.json({});
      }),
    );
    await expect(client({ timeoutMs: 50, maxRetries: 0 }).chatCompletion(request)).rejects.toMatchObject({ code: "timeout" });

    server.use(http.post(`${BASE}/chat/completions`, () => HttpResponse.json({ id: "x", choices: [] })));
    const error = await client().chatCompletion(request).catch((e: unknown) => e);
    expect(isNearAiError(error, "bad-response")).toBe(true);
  });
});

describe("chatSignature", () => {
  it("waits a bounded time for a signature that is not recorded yet", async () => {
    const cloud = fakeNearAiCloud({ signatureMisses: 2 });
    server.use(...cloud.handlers);
    const c = client();
    const raw = await c.chatCompletion(request);
    const signature = await c.chatSignature({ chatId: raw.chatId, model: request.model, signingAlgo: "ecdsa" });
    expect(cloud.calls.signature).toBe(3);
    expect(signature.signature_kind).toBe("provider_tee");
    expect(signature.text).toBe(`${request.model}:${sha256Hex(raw.requestBody)}:${sha256Hex(raw.responseBody)}`);
  });

  it("gives up with signature-unavailable, also on 2xx answers without a signature", async () => {
    server.use(http.get(`${BASE}/signature/:id`, () => HttpResponse.json({ error_code: "not_ready", message: "pending" })));
    const error = await client().chatSignature({ chatId: "chatcmpl-1", model: request.model, signingAlgo: "ecdsa" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NearAiError);
    expect(error).toMatchObject({ code: "signature-unavailable" });
  });
});

describe("attestationReport", () => {
  it("asks for NEAR model evidence with our nonce, canonical model id and algorithm", async () => {
    const cloud = fakeNearAiCloud();
    server.use(...cloud.handlers);
    const nonce = "ab".repeat(32);
    const report = await client().attestationReport({ model: request.model, nonce, signingAlgo: "ecdsa" });
    const url = new URL(cloud.requests.at(-1)?.url ?? "");
    expect(Object.fromEntries(url.searchParams)).toEqual({ model: request.model, provider: "near", include_tls_fingerprint: "false", signing_algo: "ecdsa", nonce });
    expect(cloud.requests.at(-1)?.headers.get("x-no-aliasing")).toBe("true");
    expect(report.model_attestations?.[0]?.request_nonce).toBe(nonce);
  });

  it("never sends the API key before the gateway is verified, unless asked to", async () => {
    const cloud = fakeNearAiCloud();
    server.use(...cloud.handlers);
    const nonce = "cd".repeat(32);
    await client().attestationReport({ model: request.model, nonce, signingAlgo: "ecdsa" });
    expect(cloud.requests.at(-1)?.headers.get("authorization")).toBeNull();
    await client({ attestationWithKey: true }).attestationReport({ model: request.model, nonce, signingAlgo: "ecdsa" });
    expect(cloud.requests.at(-1)?.headers.get("authorization")).toBe("Bearer test-key");
  });

  it("works without an API key for public endpoints and refuses keyed calls up front", async () => {
    const cloud = fakeNearAiCloud();
    server.use(...cloud.handlers);
    const anonymous = createNearAiClient({ signatureWait: { attempts: 1, delayMs: 1 } });
    await expect(anonymous.attestationReport({ model: request.model, nonce: "ef".repeat(32), signingAlgo: "ecdsa" })).resolves.toHaveProperty("gateway_attestation");
    await expect(anonymous.chatCompletion(request)).rejects.toMatchObject({ code: "config" });
    await expect(anonymous.chatSignature({ chatId: "x", model: request.model, signingAlgo: "ecdsa" })).rejects.toMatchObject({ code: "config" });
    expect(cloud.calls.chat).toBe(0);
  });
});

describe("assertPrivateModel", () => {
  it("accepts owned_by nearai and refuses anonymised provider models", async () => {
    server.use(...fakeNearAiCloud({ model: "z-ai/glm-5.3-flash" }).handlers);
    await expect(assertPrivateModel(client({ baseURL: "https://cloud-api.near.ai/v1" }), "z-ai/glm-5.3-flash")).resolves.toBeUndefined();

    server.use(...fakeNearAiCloud({ model: "anthropic/claude-sonnet-5-5", ownedBy: "anthropic" }).handlers);
    await expect(assertPrivateModel(client(), "anthropic/claude-sonnet-5-5")).rejects.toMatchObject({ code: "not-private" });
    await expect(assertPrivateModel(client(), "made/up-model")).rejects.toMatchObject({ code: "not-private" });
  });
});
