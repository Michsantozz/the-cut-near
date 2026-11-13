import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as challengeRoute } from "@/app/api/auth/challenge/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { POST as verifyRoute } from "@/app/api/auth/verify/route";
import { handleVerify } from "@/shared/auth/handlers";
import { NearRpc } from "@/shared/near/rpc";
import { createTestDb, DB_SETUP_TIMEOUT_MS, type TestDb } from "../../../helpers/db";
import { testWallet } from "../../../helpers/wallet";
import { FakeChain } from "../../../../msw/near-rpc";
import { server } from "../../../../msw/server";

const db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("@/shared/db/client", () => ({
  getDb: () => {
    if (!db.current) throw new Error("test database not ready");
    return db.current.db;
  },
}));

const ORIGIN = "https://thecut.app";
const RPC = "https://rpc.auth.test";
const CONTRACT = "thecut.testnet";

let chain: FakeChain;

beforeAll(async () => {
  db.current = await createTestDb();
}, DB_SETUP_TIMEOUT_MS);
afterAll(() => db.current?.close());

beforeEach(async () => {
  await db.current?.reset();
  vi.stubEnv("DATA_SOURCE", "live");
  vi.stubEnv("DATABASE_URL", "postgres://unused:unused@localhost:5432/unused");
  vi.stubEnv("SESSION_SECRET", "test-session-secret-".repeat(3));
  vi.stubEnv("NEAR_RPC_URL", RPC);
  chain = new FakeChain(CONTRACT);
  server.use(chain.handler(RPC));
});
afterEach(() => vi.unstubAllEnvs());

type Cookies = Record<string, string>;

function request(path: string, { method = "POST", body, cookies = {}, origin = ORIGIN }: { method?: string; body?: unknown; cookies?: Cookies; origin?: string | null } = {}) {
  const headers = new Headers({ host: "thecut.app" });
  if (origin) headers.set("origin", origin);
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}

/** Set-Cookie headers by cookie name. */
function setCookies(response: Response): Record<string, { value: string; attributes: string }> {
  return Object.fromEntries(
    response.headers.getSetCookie().map((line) => {
      const [pair, ...attributes] = line.split(";");
      const [name, ...value] = pair.split("=");
      return [name.trim(), { value: value.join("="), attributes: attributes.join(";").toLowerCase() }];
    }),
  );
}

async function challenge() {
  const response = await challengeRoute(request("/api/auth/challenge"));
  expect(response.status).toBe(200);
  const body = (await response.json()) as { nonce: string; message: string; recipient: string; expiresAt: string };
  return { body, cookie: setCookies(response).cut_challenge };
}

async function signIn(wallet: ReturnType<typeof testWallet>, { recipient }: { recipient?: string } = {}) {
  const { body } = await challenge();
  const signed = await wallet.signMessage({ ...body, recipient: recipient ?? body.recipient });
  const proof = { ...signed, nonce: body.nonce };
  const response = await verifyRoute(request("/api/auth/verify", { body: proof, cookies: { cut_challenge: body.nonce } }));
  return { response, proof, nonce: body.nonce };
}

describe("NEP-413 sign-in, end to end", () => {
  it("issues a challenge bound to the browser", async () => {
    const { body, cookie } = await challenge();
    expect(body).toMatchObject({ message: "Sign in to The Cut.", recipient: CONTRACT });
    expect(body.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(body.expiresAt).getTime() - Date.now()).toBeGreaterThan(4 * 60_000);
    expect(cookie.value).toBe(body.nonce);
    expect(cookie.attributes).toContain("httponly");
    expect(cookie.attributes).toContain("samesite=lax");
    expect(cookie.attributes).toContain("path=/api/auth");
  });

  it("signs in with a full-access key, reads the session, refuses a replay and logs out", async () => {
    const wallet = testWallet("mika.testnet");
    chain.addKey(wallet.accountId, wallet.publicKey, "FullAccess");

    const { response, proof, nonce } = await signIn(wallet);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, accountId: "mika.testnet" });
    const cookies = setCookies(response);
    expect(cookies.cut_challenge.attributes).toContain("max-age=0");
    const session = cookies.cut_session;
    expect(session.value.split(".")).toHaveLength(3);
    expect(session.attributes).toContain("httponly");
    expect(session.attributes).toContain("samesite=lax");
    expect(session.attributes).not.toContain("secure");

    const me = await sessionRoute(request("/api/auth/session", { method: "GET", cookies: { cut_session: session.value } }));
    expect(await me.json()).toEqual({ accountId: "mika.testnet", isSample: false });

    // The same signed proof again, even from the same browser, is refused: the nonce is spent.
    const replay = await verifyRoute(request("/api/auth/verify", { body: proof, cookies: { cut_challenge: nonce } }));
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ ok: false, reason: "nonce_invalid" });

    const out = await logoutRoute(request("/api/auth/logout"));
    expect(out.status).toBe(204);
    expect(setCookies(out).cut_session.attributes).toContain("max-age=0");
    const anonymous = await sessionRoute(request("/api/auth/session", { method: "GET" }));
    expect(await anonymous.json()).toEqual({ accountId: null, isSample: false });
  });

  it("refuses a function-call key", async () => {
    const wallet = testWallet("mika.testnet");
    chain.addKey(wallet.accountId, wallet.publicKey, { FunctionCall: { allowance: null, receiver_id: CONTRACT, method_names: [] } });
    const { response } = await signIn(wallet);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, reason: "not_full_access" });
    expect(setCookies(response).cut_session).toBeUndefined();
  });

  it("refuses a key the account does not have", async () => {
    const wallet = testWallet("mika.testnet");
    const { response } = await signIn(wallet);
    expect(await response.json()).toEqual({ ok: false, reason: "key_not_found" });
  });

  it("refuses a signature for another recipient before asking the chain, and burns the nonce", async () => {
    const wallet = testWallet("mika.testnet");
    chain.addKey(wallet.accountId, wallet.publicKey, "FullAccess");
    const { response, proof, nonce } = await signIn(wallet, { recipient: "evil.testnet" });
    expect(await response.json()).toEqual({ ok: false, reason: "bad_signature" });
    expect(chain.calls).toHaveLength(0);

    const honest = await wallet.signMessage({ message: "Sign in to The Cut.", recipient: CONTRACT, nonce });
    const retry = await verifyRoute(request("/api/auth/verify", { body: { ...proof, ...honest }, cookies: { cut_challenge: nonce } }));
    expect(await retry.json()).toEqual({ ok: false, reason: "nonce_invalid" });
  });

  it("refuses a proof relayed from another browser without spending the victim's nonce", async () => {
    const wallet = testWallet("mika.testnet");
    chain.addKey(wallet.accountId, wallet.publicKey, "FullAccess");
    const { body } = await challenge();
    const proof = { ...(await wallet.signMessage(body)), nonce: body.nonce };

    const relayed = await verifyRoute(request("/api/auth/verify", { body: proof, origin: null }));
    expect(await relayed.json()).toEqual({ ok: false, reason: "nonce_invalid" });
    const otherCookie = await verifyRoute(request("/api/auth/verify", { body: proof, cookies: { cut_challenge: "A".repeat(43) } }));
    expect(otherCookie.status).toBe(401);

    const legit = await verifyRoute(request("/api/auth/verify", { body: proof, cookies: { cut_challenge: body.nonce } }));
    expect(legit.status).toBe(200);
  });

  it("refuses an expired nonce", async () => {
    const wallet = testWallet("mika.testnet");
    chain.addKey(wallet.accountId, wallet.publicKey, "FullAccess");
    const { body } = await challenge();
    await db.current?.client.query("update auth_nonce set expires_at = now() - interval '1 second'");
    const proof = { ...(await wallet.signMessage(body)), nonce: body.nonce };
    const response = await verifyRoute(request("/api/auth/verify", { body: proof, cookies: { cut_challenge: body.nonce } }));
    expect(await response.json()).toEqual({ ok: false, reason: "nonce_invalid" });
  });

  it("refuses cross-site requests and malformed bodies", async () => {
    expect((await challengeRoute(request("/api/auth/challenge", { origin: "https://evil.example" }))).status).toBe(403);
    expect((await verifyRoute(request("/api/auth/verify", { body: {}, origin: "https://evil.example" }))).status).toBe(403);
    expect((await logoutRoute(request("/api/auth/logout", { origin: "null" }))).status).toBe(403);
    const malformed = await verifyRoute(request("/api/auth/verify", { body: "{not json" }));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ ok: false, reason: "malformed" });
    const shortNonce = await verifyRoute(request("/api/auth/verify", { body: { accountId: "mika.testnet", publicKey: testWallet("x.testnet").publicKey, signature: "AAAA", nonce: "abc" } }));
    expect(shortNonce.status).toBe(400);
  });

  it("answers 503 with Retry-After when no RPC endpoint answers", async () => {
    const down = "https://rpc.down.test";
    server.use(http.post(down, () => new HttpResponse(null, { status: 503 })));
    const wallet = testWallet("mika.testnet");
    const { body } = await challenge();
    const proof = { ...(await wallet.signMessage(body)), nonce: body.nonce };
    const response = await handleVerify(request("/api/auth/verify", { body: proof, cookies: { cut_challenge: body.nonce } }), {
      db: () => db.current!.db,
      rpc: () => new NearRpc([down], { attemptsPerEndpoint: 1 }),
      now: () => new Date(),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(await response.json()).toEqual({ ok: false, reason: "unavailable" });
  });

  it("marks cookies Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { cookie } = await challenge();
    expect(cookie.attributes).toContain("secure");
  });
});
