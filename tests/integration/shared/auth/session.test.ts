import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSession, requireSession, UnauthenticatedError } from "@/shared/auth/session";
import { signSessionToken } from "@/shared/auth/token";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "cut_session" && jar.value ? { name, value: jar.value } : undefined) }),
}));

const SECRET = "session-secret-for-tests-0123456789";
const key = new TextEncoder().encode(SECRET);

beforeEach(() => {
  jar.value = undefined;
  vi.stubEnv("SESSION_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("getSession (Server Components and Actions)", () => {
  it("returns the signed-in account from the session cookie", async () => {
    vi.stubEnv("DATA_SOURCE", "live");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db");
    jar.value = await signSessionToken({ accountId: "mika.testnet", publicKey: "ed25519:x" }, key);
    expect(await getSession()).toEqual({ accountId: "mika.testnet", isSample: false });
  });

  it("is null for a forged cookie with live data, and requireSession throws", async () => {
    vi.stubEnv("DATA_SOURCE", "live");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db");
    jar.value = await signSessionToken({ accountId: "mika.testnet", publicKey: "ed25519:x" }, new TextEncoder().encode("another-secret-another-secret-0000"));
    expect(await getSession()).toBeNull();
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("falls back to the design's member with sample data", async () => {
    vi.stubEnv("DATA_SOURCE", "sample");
    expect(await getSession()).toEqual({ accountId: "mika.near", isSample: true });
    jar.value = await signSessionToken({ accountId: "bob.testnet", publicKey: "ed25519:x" }, key);
    expect(await getSession()).toEqual({ accountId: "bob.testnet", isSample: false });
  });
});
