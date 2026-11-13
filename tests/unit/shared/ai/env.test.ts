import { describe, expect, it } from "vitest";
import { DEFAULT_NEAR_AI_MODEL, readAiEnv } from "@/shared/ai/env";

describe("readAiEnv", () => {
  it("defaults to the Private GLM-5.3 Flash model on the NEAR AI gateway, with hardware checks on", () => {
    const env = readAiEnv({});
    expect(env).toMatchObject({ NEAR_AI_MODEL: DEFAULT_NEAR_AI_MODEL, NEAR_AI_BASE_URL: "https://cloud-api.near.ai/v1", NEAR_AI_SIGNING_ALGO: "ecdsa", NEAR_AI_HARDWARE_CHECKS: "on", NEAR_AI_REASONING_EFFORT: "low" });
    expect(env.NEAR_AI_API_KEY).toBeUndefined();
    expect(DEFAULT_NEAR_AI_MODEL).toBe("z-ai/glm-5.3-flash");
  });

  it("treats blank values copied from .env.example as unset", () => {
    expect(readAiEnv({ NEAR_AI_API_KEY: "", NEAR_AI_MODEL: " ", NEAR_AI_TIMEOUT_MS: "" })).toMatchObject({ NEAR_AI_API_KEY: undefined, NEAR_AI_MODEL: DEFAULT_NEAR_AI_MODEL, NEAR_AI_TIMEOUT_MS: 45_000 });
  });

  it("coerces numbers and rejects bad values", () => {
    expect(readAiEnv({ NEAR_AI_TIMEOUT_MS: "5000", NEAR_AI_MAX_RETRIES: "0" })).toMatchObject({ NEAR_AI_TIMEOUT_MS: 5000, NEAR_AI_MAX_RETRIES: 0 });
    expect(() => readAiEnv({ NEAR_AI_SIGNING_ALGO: "rsa" })).toThrow();
    expect(() => readAiEnv({ NEAR_AI_BASE_URL: "not a url" })).toThrow();
    expect(() => readAiEnv({ NEAR_AI_MAX_RETRIES: "99" })).toThrow();
  });
});
