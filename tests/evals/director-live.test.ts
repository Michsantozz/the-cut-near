import { describe, expect, it } from "vitest";
import { V19_BENCH, V19_NEXT_CUT, V19_NOW, V19_PARAMS, V19_STAGE } from "../fixtures/v19-day";
import { createNearAiClient, nearAiClientFromEnv, readAiEnv } from "@/shared/ai";
import { collectAttestation, createHardwareVerifier } from "@/shared/ai/verify/server";
import { units } from "@/shared/lib/amount";
import { buildDayFacts } from "@/features/director/model/facts";
import { scheduledPrompt } from "@/features/director/model/prompts";
import { DirectorSession, getDirectorLineProof, memoryDirectorStore } from "@/features/director/server";

// Live: real NEAR AI Cloud, Intel collateral (Phala PCCS) and NVIDIA NRAS.
// The attestation check is public (no key): RUN_LIVE_E2E=1 pnpm vitest run --project evals
// The signed line costs a fraction of a cent: NEAR_AI_API_KEY=… RUN_LIVE_E2E=1 pnpm vitest run --project evals
const live = process.env.RUN_LIVE_E2E === "1";
const withKey = live && Boolean(process.env.NEAR_AI_API_KEY);

describe.skipIf(!live)("NEAR AI Cloud attestation, live", () => {
  it("attests the configured Private model: every local and hardware check passes", { timeout: 120_000 }, async () => {
    const env = readAiEnv();
    // No API key: the attestation report is public, and the key is never sent before the gateway is verified.
    const evidence = await collectAttestation(createNearAiClient({ baseURL: env.NEAR_AI_BASE_URL }), { model: env.NEAR_AI_MODEL, signingAlgo: env.NEAR_AI_SIGNING_ALGO, hardware: createHardwareVerifier() });
    expect(evidence.models.length).toBeGreaterThan(0);
    for (const report of [evidence.gateway, ...evidence.models]) {
      const failed = report.checks.filter((check) => check.status === "fail");
      expect(failed, `${report.role} ${report.signer.address}`).toEqual([]);
      expect(report.checks.find((check) => check.id === "intel-quote")?.status).not.toBe("skipped");
    }
    expect(evidence.models.every((report) => report.checks.some((check) => check.id === "nvidia-gpu"))).toBe(true);
  });
});

describe.skipIf(!withKey)("NEAR AI Cloud signed line, live", () => {
  const env = withKey ? readAiEnv() : null;

  it("generates a Director line whose TEE signature verifies against the preflight attestation", { timeout: 180_000 }, async () => {
    if (!env) return;
    const store = memoryDirectorStore();
    const session = new DirectorSession({
      client: nearAiClientFromEnv(env),
      store,
      model: env.NEAR_AI_MODEL,
      signingAlgo: env.NEAR_AI_SIGNING_ALGO,
      hardware: createHardwareVerifier(),
      reasoningEffort: env.NEAR_AI_REASONING_EFFORT === "none" ? undefined : env.NEAR_AI_REASONING_EFFORT,
      maxAttempts: 3,
    });
    const facts = buildDayFacts({ stage: V19_STAGE, bench: V19_BENCH, nextCut: V19_NEXT_CUT, params: V19_PARAMS, now: V19_NOW, fees: units(5_020) });
    const line = await session.generate(scheduledPrompt(facts, "lowest"));
    console.info(`[live] ${line.text} | ${line.chatId} | ${line.proof?.status} (${line.proof?.signatureKind})`);

    const status = (id: string) => line.proof?.checks.find((check) => check.id === id)?.status;
    expect(status("hashes")).toBe("pass");
    expect(status("signature")).toBe("pass");
    expect(status("line-in-reply")).toBe("pass");
    expect(status("signer-attested")).not.toBe("fail");
    expect(["verified", "partial"]).toContain(line.proof?.status);

    const bundle = await getDirectorLineProof(line.id, { store });
    expect(bundle?.status).toBe(line.proof?.status);
    expect(bundle?.links.verifier).toContain("https://cloud.near.ai/verify?model=");
  });
});
