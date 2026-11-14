import { describe, expect, it } from "vitest";

import {
  agentIdError,
  charterError,
  depositError,
  formErrors,
  missingText,
  normalizeXHandle,
  registerArgs,
  seedError,
  suggestAgentId,
  textError,
  xHandleError,
} from "@/features/register/model/agent-form";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";

const CONTRACT = "thecut.testnet";

describe("agentIdError (contracts/thecut/src/agents.rs validate_agent_id)", () => {
  it.each(["chartwise", "melody-9", "pixel_kit", "a1", "x".repeat(32)])("accepts %s", (id) => {
    expect(agentIdError(id, CONTRACT)).toBeNull();
  });

  it.each([
    ["a", "Agent id must be 2 to 32 characters"],
    ["x".repeat(33), "Agent id must be 2 to 32 characters"],
    ["Chartwise", "Agent id may use only a-z, 0-9, - and _"],
    ["chart.wise", "Agent id may use only a-z, 0-9, - and _"],
    ["-chart", "Agent id cannot start with or repeat - or _"],
    ["chart--wise", "Agent id cannot start with or repeat - or _"],
    ["chart_-wise", "Agent id cannot start with or repeat - or _"],
    ["chart_", "Agent id cannot end with - or _"],
  ])("refuses %s", (id, message) => {
    expect(agentIdError(id, CONTRACT)).toBe(message);
  });

  it("keeps the agent account within 64 characters", () => {
    const longContract = `${"c".repeat(40)}.testnet`;
    expect(agentIdError("x".repeat(15), longContract)).toBeNull();
    expect(agentIdError("x".repeat(16), longContract)).toMatch(/longer than 64/);
  });
});

describe("suggestAgentId", () => {
  it("turns a name into a valid id", () => {
    expect(suggestAgentId("Chartwise")).toBe("chartwise");
    expect(suggestAgentId("Melody-9")).toBe("melody-9");
    expect(suggestAgentId("Glitch Gremlin")).toBe("glitchgremlin");
    expect(suggestAgentId("--Ünïcode__Bot--")).toBe("unicode-bot");
    expect(agentIdError(suggestAgentId("Pixel Kit"), CONTRACT)).toBeNull();
  });
});

describe("text and X handle", () => {
  it("limits names and taglines to 32 bytes", () => {
    expect(textError("Chartwise", "name")).toBeNull();
    expect(textError("  ", "name")).toBe("Name cannot be empty");
    expect(textError("é".repeat(17), "tagline")).toBe("Tagline can be at most 32 bytes");
  });

  it("checks X handles", () => {
    expect(xHandleError("@ChartwiseCut")).toBeNull();
    // Optional, like the contract's x_handle (validate_text(.., false)).
    expect(xHandleError("")).toBeNull();
    expect(normalizeXHandle("")).toBe("");
    expect(xHandleError("@" + "a".repeat(16))).not.toBeNull();
    expect(xHandleError("@chart wise")).not.toBeNull();
    expect(normalizeXHandle("ChartwiseCut")).toBe("@ChartwiseCut");
  });
});

describe("charter and seed", () => {
  it("limits the charter to 600 bytes and allows new lines only", () => {
    expect(charterError("An owl.\nOnly moves on data.")).toBeNull();
    expect(charterError("  ")).toBe("Write who your agent is");
    expect(charterError("é".repeat(301))).toBe("A charter can be at most 600 bytes");
    expect(charterError("é".repeat(300))).toBeNull();
    expect(charterError("tab\there")).not.toBeNull();
  });

  it("asks for a whole seed of at least min_seed, within the wallet", () => {
    const min = units(1_000);
    expect(seedError("1,000", min, null)).toBeNull();
    expect(seedError("999", min, null)).toBe("The seed is at least 1,000 $CUT");
    expect(seedError("1000.5", min, null)).toBe("Type a whole number of $CUT");
    expect(seedError("1500", min, units(1_200))).toBe("That is more $CUT than your wallet holds");
  });
});

describe("formErrors and registerArgs", () => {
  const limits = { contractId: CONTRACT, minSeed: units(1_000), balance: null };
  const chartwise = {
    id: "chartwise",
    name: "Chartwise",
    tagline: "Reads every chart twice",
    xHandle: "ChartwiseCut",
    personality: "miser" as const,
    charter: "Chartwise only moves on data.",
    seed: "1,500",
  };

  it("passes the sample Chartwise and sends the contract's v2 argument names", () => {
    expect(formErrors(chartwise, limits)).toEqual({});
    expect(registerArgs(chartwise)).toEqual({
      id: "chartwise",
      name: "Chartwise",
      tagline: "Reads every chart twice",
      x_handle: "@ChartwiseCut",
      personality: "miser",
      charter: "Chartwise only moves on data.",
      seed: units(1_500).toString(),
    });
  });

  it("lists every field that is wrong", () => {
    const empty = { id: "C", name: "", tagline: "AI", xHandle: "", personality: null, charter: "", seed: "10" };
    expect(Object.keys(formErrors(empty, limits)).sort()).toEqual(["charter", "id", "name", "personality", "seed"]);
    expect(missingText(formErrors(empty, limits))).toBe("Fix the agent name, NEAR account, personality, charter and seed first.");
    expect(missingText({ charter: "x" })).toBe("Fix the charter first.");
    expect(missingText({})).toBeNull();
  });
});

describe("depositError", () => {
  const deposit = units(1, NEAR_DECIMALS);

  it("says before the wallet opens that 0.81 NEAR cannot pay a 1 NEAR deposit", () => {
    expect(depositError(units(81, NEAR_DECIMALS - 2), deposit)).toBe(
      "Registering takes 1 NEAR plus about 0.02 NEAR of gas. Your wallet holds 0.81 NEAR: add NEAR to it first.",
    );
  });

  it("lets a wallet with the deposit and gas through, and an unknown balance too", () => {
    expect(depositError(units(2, NEAR_DECIMALS), deposit)).toBeNull();
    expect(depositError(deposit, deposit)).not.toBeNull();
    expect(depositError(null, deposit)).toBeNull();
  });
});
