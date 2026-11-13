import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { http, HttpResponse } from "msw";
import { beforeAll, describe, expect, it } from "vitest";
import { createHardwareVerifier, NRAS_JWKS_URL, NRAS_URL } from "@/shared/ai/verify/server";
import { server } from "../../../msw/server";

// NVIDIA NRAS, mocked: tokens are signed with a test ES384 key published at the JWKS URL.
const NONCE = "4d6e0c49321d22daa9bd7fc2205e381f9506c20e77dd5082ecf5e124ec0f4618";
const payload = JSON.stringify({ nonce: NONCE, evidence_list: [{ certificate: "x", evidence: "y" }], arch: "HOPPER" });
let sign: (claims: JWTPayload) => Promise<string>;
let jwks: { keys: object[] };

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES384");
  jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: "nv-test", alg: "ES384" }] };
  sign = (claims) => new SignJWT(claims).setProtectedHeader({ alg: "ES384", kid: "nv-test" }).setIssuer("https://nras.attestation.nvidia.com").setIssuedAt().setExpirationTime("1h").sign(privateKey);
});

const gpuClaims = (overrides: JWTPayload = {}): JWTPayload => ({ eat_nonce: NONCE, hwmodel: "GH100", measres: "success", secboot: true, dbgstat: "disabled", "x-nvidia-gpu-attestation-report-signature-verified": true, ...overrides });

function nras(overall: JWTPayload, gpus: Record<string, JWTPayload>) {
  server.use(
    http.get(NRAS_JWKS_URL, () => HttpResponse.json(jwks)),
    http.post(NRAS_URL, async ({ request }) => {
      expect(await request.text()).toBe(payload);
      const tokens = Object.fromEntries(await Promise.all(Object.entries(gpus).map(async ([name, claims]) => [name, await sign(claims)] as const)));
      return HttpResponse.json([["JWT", await sign(overall)], tokens]);
    }),
  );
}

describe("NVIDIA GPU evidence (delegated to NRAS)", () => {
  it("passes when NRAS attests every GPU, with tokens signed by NVIDIA's key and bound to our nonce", async () => {
    nras({ "x-nvidia-overall-att-result": true, eat_nonce: NONCE }, { "GPU-0": gpuClaims(), "GPU-1": gpuClaims() });
    const verdict = await createHardwareVerifier().nvidiaGpu(payload, NONCE);
    expect(verdict).toEqual({ status: "pass", detail: expect.stringContaining("2 GPUs (GH100)") });
  });

  it("fails on a negative verdict, a debug GPU, another nonce or evidence for another nonce", async () => {
    nras({ "x-nvidia-overall-att-result": false, eat_nonce: NONCE }, { "GPU-0": gpuClaims() });
    expect((await createHardwareVerifier().nvidiaGpu(payload, NONCE)).status).toBe("fail");

    nras({ "x-nvidia-overall-att-result": true, eat_nonce: NONCE }, { "GPU-0": gpuClaims({ dbgstat: "enabled" }) });
    expect((await createHardwareVerifier().nvidiaGpu(payload, NONCE)).status).toBe("fail");

    nras({ "x-nvidia-overall-att-result": true, eat_nonce: "00".repeat(32) }, { "GPU-0": gpuClaims() });
    expect((await createHardwareVerifier().nvidiaGpu(payload, NONCE)).status).toBe("fail");

    expect((await createHardwareVerifier().nvidiaGpu(payload, "11".repeat(32))).status).toBe("fail");
  });

  it("is a warning, not a failure, when NRAS cannot be reached", async () => {
    server.use(http.post(NRAS_URL, () => HttpResponse.json({}, { status: 503 })));
    expect(await createHardwareVerifier().nvidiaGpu(payload, NONCE)).toEqual({ status: "warn", detail: "NVIDIA NRAS answered 503." });
  });
});
