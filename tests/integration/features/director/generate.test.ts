import { describe, expect, it } from "vitest";
import { SAMPLE_NEXT_CUT, SAMPLE_NOW } from "@/entities/cut/api/sample";
import { SAMPLE_PARAMS } from "@/entities/market/api/sample";
import { SAMPLE_BENCH, SAMPLE_STAGE } from "@/entities/robot/api/sample";
import { createNearAiClient } from "@/shared/ai";
import { sha256Hex } from "@/shared/ai/verify";
import { units } from "@/shared/lib/amount";
import { GET } from "@/app/api/director/lines/[id]/proof/route";
import { buildDayFacts } from "@/features/director/model/facts";
import { scheduledPrompt } from "@/features/director/model/prompts";
import { defaultDirectorStore, DirectorGenerationError, DirectorSession, getDirectorLineProof, getDirectorLines, memoryDirectorStore, runDirectorMoment, type DirectorDeps, type DirectorStore } from "@/features/director/server";
import { fakeHardware, fakeNearAiCloud, type FakeCloudOptions } from "../../../msw/near-ai";
import { server } from "../../../msw/server";

const facts = buildDayFacts({ stage: SAMPLE_STAGE, bench: SAMPLE_BENCH, nextCut: SAMPLE_NEXT_CUT, params: SAMPLE_PARAMS, now: SAMPLE_NOW, fees: units(5_020) });
const KIKO = "23,600 $CUT and 4 hours. A miracle or a whale, bunny.";

function setup(cloudOptions: FakeCloudOptions = {}, overrides: Partial<DirectorDeps> = {}) {
  const cloud = fakeNearAiCloud(cloudOptions);
  server.use(...cloud.handlers);
  const store: DirectorStore = overrides.store ?? memoryDirectorStore();
  const deps: DirectorDeps = {
    client: createNearAiClient({ apiKey: "test-key", maxRetries: 0, signatureWait: { attempts: 3, delayMs: 1 } }),
    store,
    model: cloud.model,
    signingAlgo: "ecdsa",
    hardware: fakeHardware(),
    ...overrides,
  };
  return { cloud, store, deps, session: new DirectorSession(deps) };
}

describe("DirectorSession.generate", () => {
  it("generates a line, verifies its TEE signature against the preflight attestation and stores the exact bytes", async () => {
    const { cloud, store, session } = setup({ lines: [KIKO] });
    const line = await session.generate(scheduledPrompt(facts, "lowest"));

    expect(line).toMatchObject({ status: "accepted", kind: "scheduled", subjectId: "kiko", cutIndex: 1, text: KIKO, model: "z-ai/glm-5.3-flash" });
    expect(line.requestBody).toBe(cloud.chats.get(line.chatId ?? "")?.request);
    expect(line.responseBody).toBe(cloud.chats.get(line.chatId ?? "")?.response);
    expect(line.signature?.signing_address).toBe(cloud.modelKey.address);
    expect(line.proof?.status).toBe("verified");
    expect(line.proof?.summary).toEqual({ sealedHardware: "pass", signedByModel: "pass", sameWords: "pass" });
    expect(cloud.calls).toMatchObject({ models: 1, attestation: 1, chat: 1, signature: 1 });

    const attestation = await store.getAttestation(line.attestationId ?? "");
    expect(attestation?.evidence.models).toHaveLength(2);
    expect(attestation?.evidence.models[0]?.checks.map((c) => `${c.scope}:${c.id}:${c.status}`)).toEqual([
      "local:tdx-quote:pass",
      "local:nonce:pass",
      "local:report-data:pass",
      "local:debug-off:pass",
      "local:compose:pass",
      "local:rtmr3:pass",
      "delegated:intel-quote:pass",
      "delegated:nvidia-gpu:pass",
    ]);

    const request = JSON.parse(line.requestBody) as { messages: { role: string; content: string }[]; response_format: { type: string }; reasoning_effort?: string };
    expect(request.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(request.response_format.type).toBe("json_schema");
  });

  it("rejects a reply with an invented number, tells the model why, and keeps the rejected reply for audit", async () => {
    const { cloud, store, session } = setup({ lines: ["Kiko Bun has 99,999 $CUT and no excuses left.", KIKO] });
    const line = await session.generate(scheduledPrompt(facts, "lowest"));
    expect(line.text).toBe(KIKO);
    expect(cloud.calls.chat).toBe(2);
    expect(cloud.calls.signature).toBe(1);
    expect(cloud.requests.at(-1)?.body).toContain("Your last answer was rejected: The number 99999 is not in the facts.");
    const lines = await store.latestLines({ limit: 10, provenOnly: false });
    expect(lines).toHaveLength(1);
  });

  it("throws DirectorGenerationError when every attempt is rejected", async () => {
    const { session } = setup({ lines: ["Buy the bunny before 18:00 UTC, everyone."] });
    const error = await session.generate(scheduledPrompt(facts, "lowest")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DirectorGenerationError);
    expect((error as DirectorGenerationError).attempts).toHaveLength(2);
  });

  it("marks the proof failed when the reply is signed by a key that was not attested", async () => {
    const { store, session } = setup({ rogueSigner: true });
    const line = await session.generate(scheduledPrompt(facts, "lowest"));
    expect(line.proof?.status).toBe("failed");
    expect(await getDirectorLines({ store })).toEqual([]);
  });

  it("is partial when the gateway signed instead of the model TEE, or hardware checks are off", async () => {
    const gateway = setup({ signatureKind: "gateway" });
    expect((await gateway.session.generate(scheduledPrompt(facts, "lowest"))).proof?.status).toBe("partial");
    const noHardware = setup({}, { hardware: null });
    const line = await noHardware.session.generate(scheduledPrompt(facts, "lowest"));
    expect(line.proof?.status).toBe("partial");
    expect(line.proof?.summary.sealedHardware).toBe("skipped");
  });

  it("refuses an anonymised model before sending any prompt", async () => {
    const { cloud, session } = setup({ model: "anthropic/claude-sonnet-5-5", ownedBy: "anthropic" });
    await expect(session.generate(scheduledPrompt(facts, "lowest"))).rejects.toMatchObject({ code: "not-private" });
    expect(cloud.calls.chat).toBe(0);
  });
});

describe("lines and proofs for the UI", () => {
  it("lists the latest proven lines and serves a proof bundle that re-checks the stored bytes", async () => {
    const { store, session } = setup({ lines: [KIKO] });
    const line = await session.generate(scheduledPrompt(facts, "lowest"));
    const [view] = await getDirectorLines({ store });
    expect(view).toMatchObject({ id: line.id, kind: "scheduled", text: KIKO, proof: { status: "verified", proofUrl: `/api/director/lines/${line.id}/proof` } });
    expect(view?.proof.verifierUrl).toMatch(/^https:\/\/cloud\.near\.ai\/verify\?model=z-ai%2Fglm-5\.3-flash#receipt=/);

    const bundle = await getDirectorLineProof(line.id, { store });
    expect(bundle?.status).toBe("verified");
    expect(bundle?.prompt).toContain("Kiko Bun needs 38,201 $CUT to pass Onyx Moon.");
    expect(bundle?.request?.sha256).toBe(sha256Hex(line.requestBody));
    expect(bundle?.signature?.expectedText).toBe(bundle?.signature?.text);
    expect(bundle?.checks.filter((c) => c.scope === "delegated").map((c) => c.id)).toEqual(["gateway:intel-quote", "model-1:intel-quote", "model-1:nvidia-gpu", "model-2:intel-quote", "model-2:nvidia-gpu"]);

    // Edit the stored reply: the local re-check catches it.
    await store.saveLine({ ...line, responseBody: (line.responseBody ?? "").replace("bunny", "bunnY") });
    const tampered = await getDirectorLineProof(line.id, { store });
    expect(tampered?.status).toBe("failed");
    expect(tampered?.summary?.sameWords).toBe("fail");
  });

  it("serves the proof route: JSON bundle, 404 for unknown ids, 400 for bad ids, unsigned for sample lines", async () => {
    const { session } = setup({ lines: [KIKO] }, { store: defaultDirectorStore() });
    const line = await session.generate(scheduledPrompt(facts, "lowest"));
    const call = (id: string) => GET(new Request(`http://localhost/api/director/lines/${id}/proof`), { params: Promise.resolve({ id }) });

    const ok = await call(line.id);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ version: 1, status: "verified", line: { id: line.id, text: KIKO } });
    expect((await call("00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await call("../etc")).status).toBe(400);
    expect(await (await call("sample-roast-1")).json()).toMatchObject({ status: "unsigned", line: { text: "23,600 $CUT between Kiko and oblivion. Pack your buns." } });

    const views = await getDirectorLines({ kinds: ["scheduled"] });
    expect(views[0]?.id).toBe(line.id);
    expect(views.slice(1).map((v) => v.proof.status)).toEqual(["unsigned", "unsigned"]);
  });
});

describe("runDirectorMoment", () => {
  const plain = ["The bunny needs a miracle or a whale before the cut."];

  it("scheduled: one attestation, the two block lines and four robot posts", async () => {
    const { cloud, deps } = setup({ lines: plain });
    const report = await runDirectorMoment("scheduled", { deps, now: SAMPLE_NOW });
    expect(report.failures).toEqual([]);
    expect(report.lines.map((l) => `${l.kind}:${l.subjectId}`)).toEqual(["scheduled:kiko", "scheduled:onyx", "robot-post:kiko", "robot-post:onyx", "robot-post:pixie", "robot-post:chartwise"]);
    expect(report.lines.every((l) => l.proofStatus === "verified")).toBe(true);
    expect(cloud.calls.attestation).toBe(1);
  });

  it("after-cut: the roast and the receipt of the latest cut; failures are reported, not thrown", async () => {
    const { deps } = setup({ lines: ["Kiko Bun is gone. Pack your buns, bunny, the stage moves on."] });
    const report = await runDirectorMoment("after-cut", { deps });
    expect(report.lines.map((l) => l.kind)).toEqual(["after-cut-roast", "after-cut-receipt"]);

    const failing = setup({ lines: ["Sell everything, Kiko Bun is gone forever now."] });
    const failed = await runDirectorMoment("final-hour", { deps: failing.deps, now: new Date("2026-11-13T17:17:50Z") });
    expect(failed.lines).toEqual([]);
    expect(failed.failures).toHaveLength(1);
  });
});
