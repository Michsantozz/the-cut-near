import { describe, expect, it } from "vitest";

import { formErrors, normalizeXHandle, registerArgs, robotIdError, suggestRobotId, textError, xHandleError } from "@/features/register/model/robot-form";

const CONTRACT = "thecut.testnet";

describe("robotIdError (contracts/thecut/src/robots.rs validate_robot_id)", () => {
  it.each(["chartwise", "melody-9", "pixel_kit", "a1", "x".repeat(32)])("accepts %s", (id) => {
    expect(robotIdError(id, CONTRACT)).toBeNull();
  });

  it.each([
    ["a", "Robot id must be 2 to 32 characters"],
    ["x".repeat(33), "Robot id must be 2 to 32 characters"],
    ["Chartwise", "Robot id may use only a-z, 0-9, - and _"],
    ["chart.wise", "Robot id may use only a-z, 0-9, - and _"],
    ["-chart", "Robot id cannot start with or repeat - or _"],
    ["chart--wise", "Robot id cannot start with or repeat - or _"],
    ["chart_-wise", "Robot id cannot start with or repeat - or _"],
    ["chart_", "Robot id cannot end with - or _"],
  ])("refuses %s", (id, message) => {
    expect(robotIdError(id, CONTRACT)).toBe(message);
  });

  it("keeps the robot account within 64 characters", () => {
    const longContract = `${"c".repeat(40)}.testnet`;
    expect(robotIdError("x".repeat(15), longContract)).toBeNull();
    expect(robotIdError("x".repeat(16), longContract)).toMatch(/longer than 64/);
  });
});

describe("suggestRobotId", () => {
  it("turns a name into a valid id", () => {
    expect(suggestRobotId("Chartwise")).toBe("chartwise");
    expect(suggestRobotId("Melody-9")).toBe("melody-9");
    expect(suggestRobotId("Glitch Gremlin")).toBe("glitchgremlin");
    expect(suggestRobotId("--Ünïcode__Bot--")).toBe("unicode-bot");
    expect(robotIdError(suggestRobotId("Pixel Kit"), CONTRACT)).toBeNull();
  });
});

describe("text and X handle", () => {
  it("limits names and kinds to 32 bytes", () => {
    expect(textError("Chartwise", "name")).toBeNull();
    expect(textError("  ", "name")).toBe("Name cannot be empty");
    expect(textError("é".repeat(17), "kind")).toBe("Kind can be at most 32 bytes");
  });

  it("checks X handles", () => {
    expect(xHandleError("@ChartwiseCut")).toBeNull();
    expect(xHandleError("@" + "a".repeat(16))).not.toBeNull();
    expect(xHandleError("@chart wise")).not.toBeNull();
    expect(normalizeXHandle("ChartwiseCut")).toBe("@ChartwiseCut");
  });
});

describe("formErrors and registerArgs", () => {
  it("passes the design's Chartwise and sends the contract's argument names", () => {
    const form = { id: "chartwise", name: "Chartwise", kind: "AI analyst", xHandle: "ChartwiseCut" };
    expect(formErrors(form, CONTRACT)).toEqual({});
    expect(registerArgs(form)).toEqual({ id: "chartwise", name: "Chartwise", kind: "AI analyst", x_handle: "@ChartwiseCut" });
  });

  it("lists every field that is wrong", () => {
    expect(Object.keys(formErrors({ id: "C", name: "", kind: "AI", xHandle: "" }, CONTRACT)).sort()).toEqual(["id", "name", "xHandle"]);
  });
});
