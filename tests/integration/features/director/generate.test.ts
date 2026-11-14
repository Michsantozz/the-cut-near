import { describe, expect, it } from "vitest";
import { SAMPLE_BENCH, SAMPLE_STAGE } from "@/entities/agent/api/sample";
import { sampleNextCut } from "@/entities/cut/api/sample";
import { sampleMoves } from "@/entities/move/api/sample";
import { SAMPLE_SEASON } from "@/entities/season/api/sample";
import { createNearAiClient } from "@/shared/ai";
import { sha256Hex } from "@/shared/ai/verify";
import { GET } from "@/app/api/director/lines/[id]/proof/route";
import { buildDayFacts } from "@/features/director/model/facts";
import { scheduledPrompt } from "@/features/director/model/prompts";
import { defaultDirectorStore, DirectorGenerationError, DirectorSession, getDirectorLineProof, getDirectorLines, memoryDirectorStore, runDirectorMoment, type DirectorDeps, type DirectorStore } from "@/features/director/server";
import { fakeHardware, fakeNearAiCloud, type FakeCloudOptions } from "../../../msw/near-ai";
import { server } from "../../../msw/server";

// The v20 sample world: season 1, day 4, two hours before cut #5. Yuna Star is on the cut line.
const NOW = new Date("2026-11-14T16:00:00Z");
const facts = buildDayFacts({ stage: SAMPLE_STAGE, bench: SAMPLE_BENCH, nextCut: sampleNextCut(NOW), season: SAMPLE_SEASON, now: NOW, moves: sampleMoves(5, NOW) });
const YUNA = "600.1 $CUT to pass Gremlin, and generous idols cannot swing back. Save her or say goodbye.";

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
    const { cloud, store, session } = setup({ lines: [YUNA] });
    const line = await session.generate(scheduledPrompt(facts, "lowest"));

    expect(line).toMatchObject({ status: "accepted", kind: "scheduled", subjectId: "yuna", cutIndex: 5, text: YUNA, model: "z-ai/glm-5.3-flash" });
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
    const { cloud, store, session } = setup({ lines: ["Yuna Star has 99,999 $CUT and no excuses left.", YUNA] });
    const line = await session.generate(scheduledPrompt(facts, "lowest"));
    expect(line.text).toBe(YUNA);
    expect(cloud.calls.chat).toBe(2);
    expect(cloud.calls.signature).toBe(1);
    expect(cloud.requests.at(-1)?.body).toContain("Your last answer was rejected: The number 99999 is not in the facts.");
    const lines = await store.latestLines({ limit: 10, provenOnly: false });
    expect(lines).toHaveLength(1);
  });

  it("throws DirectorGenerationError when every attempt is rejected", async () => {
    const { session } = setup({ lines: ["Buy Yuna a seat before 18:00 UTC, everyone."] });
    const error = await session.generate(scheduledPrompt(facts, "lowest")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DirectorGenerationError);
    expect((error as DirectorGenerationError).attempts).toHaveLength(2);
  });

  it("marks the proof failed when the reply is signed by a key that was not attested", async () => {
    const { store, session } = setup({ rogueSigner: true, lines: [YUNA] });
    const line = await session.generate(scheduledPrompt(facts, "lowest"));
    expect(line.proof?.status).toBe("failed");
    expect(await getDirectorLines({ store })).toEqual([]);
  });

  it("is partial when the gateway signed instead of the model TEE, or hardware checks are off", async () => {
    const gateway = setup({ signatureKind: "gateway", lines: [YUNA] });
    expect((await gateway.session.generate(scheduledPrompt(facts, "lowest"))).proof?.status).toBe("partial");
    const noHardware = setup({ lines: [YUNA] }, { hardware: null });
    const line = await noHardware.session.generate(scheduledPrompt(facts, "lowest"));
    expect(line.proof?.status).toBe("partial");
    expect(line.proof?.summary.sealedHardware).toBe("skipped");
  });

  it("refuses an anonymised model before sending any prompt", async () => {
    const { cloud, session } = setup({ model: "anthropic/claude-sonnet-5-5", ownedBy: "anthropic", lines: [YUNA] });
    await expect(session.generate(scheduledPrompt(facts, "lowest"))).rejects.toMatchObject({ code: "not-private" });
    expect(cloud.calls.chat).toBe(0);
  });
});

describe("lines and proofs for the UI", () => {
  it("lists the latest proven lines and serves a proof bundle that re-checks the stored bytes", async () => {
    const { store, session } = setup({ lines: [YUNA] });
    const line = await session.generate(scheduledPrompt(facts, "lowest"));
    const [view] = await getDirectorLines({ store });
    expect(view).toMatchObject({ id: line.id, kind: "scheduled", text: YUNA, proof: { status: "verified", proofUrl: `/api/director/lines/${line.id}/proof` } });
    expect(view?.proof.verifierUrl).toMatch(/^https:\/\/cloud\.near\.ai\/verify\?model=z-ai%2Fglm-5\.3-flash#receipt=/);

    const bundle = await getDirectorLineProof(line.id, { store });
    expect(bundle?.status).toBe("verified");
    expect(bundle?.prompt).toContain("Yuna Star needs 600.1 $CUT more score to pass Glitch Gremlin.");
    expect(bundle?.request?.sha256).toBe(sha256Hex(line.requestBody));
    expect(bundle?.signature?.expectedText).toBe(bundle?.signature?.text);
    expect(bundle?.checks.filter((c) => c.scope === "delegated").map((c) => c.id)).toEqual(["gateway:intel-quote", "model-1:intel-quote", "model-1:nvidia-gpu", "model-2:intel-quote", "model-2:nvidia-gpu"]);

    // Edit the stored reply: the local re-check catches it.
    await store.saveLine({ ...line, responseBody: (line.responseBody ?? "").replace("goodbye", "goodbyE") });
    const tampered = await getDirectorLineProof(line.id, { store });
    expect(tampered?.status).toBe("failed");
    expect(tampered?.summary?.sameWords).toBe("fail");
  });

  it("serves the proof route: JSON bundle, 404 for unknown ids, 400 for bad ids, unsigned for sample lines", async () => {
    const { session } = setup({ lines: [YUNA] }, { store: defaultDirectorStore() });
    const line = await session.generate(scheduledPrompt(facts, "lowest"));
    const call = (id: string) => GET(new Request(`http://localhost/api/director/lines/${id}/proof`), { params: Promise.resolve({ id }) });

    const ok = await call(line.id);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ version: 1, status: "verified", line: { id: line.id, text: YUNA } });
    expect((await call("00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await call("../etc")).status).toBe(400);
    expect(await (await call("sample-roast-4")).json()).toMatchObject({ status: "unsigned", line: { text: "Velvet left 760 to Lila and a knife in her boot. Iron grip, empty hands." } });

    const views = await getDirectorLines({ kinds: ["scheduled"] });
    expect(views[0]?.id).toBe(line.id);
    expect(views.slice(1).map((v) => v.proof.status)).toEqual(["unsigned", "unsigned"]);
  });
});

describe("runDirectorMoment", () => {
  const plain = ["The idol needs a miracle or a whale before the cut."];

  it("scheduled: one attestation, the two block lines and a post from every agent on the stage and the bench leader", async () => {
    const { cloud, deps } = setup({ lines: plain });
    const report = await runDirectorMoment("scheduled", { deps, now: NOW });
    expect(report.failures).toEqual([]);
    // The app's sample world (v20, season 1 day 4): Yuna is on the cut line, Gremlin right above her; the rest by score.
    const posters = ["yuna", "gremlin", "pixie", "oracle", "mabel", "melody", "lila", "chartwise"];
    expect(report.lines.map((l) => `${l.kind}:${l.subjectId}`)).toEqual(["scheduled:yuna", "scheduled:gremlin", ...posters.map((id) => `agent-post:${id}`)]);
    expect(report.lines.every((l) => l.proofStatus === "verified")).toBe(true);
    expect(cloud.calls.attestation).toBe(1);
    // The sample journal's newest save on Melody-9 is melody-fans.sample's 3,400: her post is asked to thank that account.
    const melody = cloud.requests.find((r) => r.body?.includes("You are Melody-9"));
    expect(melody?.body).toContain("Your newest saver: melody-fans.sample saved 3,400 $CUT on you.");
    // The board lines quote the day's signed sample moves and the score parts.
    const board = cloud.requests.find((r) => r.body?.includes("Write the board line for Yuna Star"));
    expect(board?.body).toContain("15,200 saved minus 300 attack damage");
    expect(board?.body).toContain("Glitch Gremlin's move today: attack on Pixie Volt");
  });

  it("skips lines the moment already has for the same cut, so a repeated cron costs nothing", async () => {
    const { cloud, deps } = setup({ lines: plain });
    await runDirectorMoment("scheduled", { deps, now: NOW });
    const again = await runDirectorMoment("scheduled", { deps, now: NOW });
    expect(again.lines).toEqual([]);
    expect(again.skipped).toHaveLength(10);
    expect(cloud.calls.attestation).toBe(1);
  });

  it("after-cut: the roast and the receipt of the latest cut; failures are reported, not thrown", async () => {
    const { cloud, deps } = setup({ lines: ["Velvet is gone. Iron grip, empty hands, and the stage moves on."] });
    const report = await runDirectorMoment("after-cut", { deps });
    expect(report.lines.map((l) => `${l.kind}:${l.subjectId}`)).toEqual(["after-cut-roast:velvet", "after-cut-receipt:velvet"]);
    // Cut #4 of the sample world closed day 3: Velvet's wallet went to Lila, seven agents are left.
    const receipt = cloud.requests.find((r) => r.body?.includes("Write the Director's post right after the cut"));
    expect(receipt?.body).toContain('Open with \\"Third cut.\\"');
    expect(receipt?.body).toContain("Its wallet of 760 $CUT went to its heir, Lila Loop.");
    expect(receipt?.body).toContain("7 agents are left on the stage.");

    const failing = setup({ lines: ["Sell everything, Yuna Star is gone forever now."] });
    const failed = await runDirectorMoment("final-hour", { deps: failing.deps, now: new Date("2026-11-14T17:17:50Z") });
    expect(failed.lines).toEqual([]);
    expect(failed.failures).toHaveLength(1);
  });
});
