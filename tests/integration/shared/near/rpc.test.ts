import { http, HttpResponse } from "msw";
import { KeyPair } from "near-api-js";
import { describe, expect, it } from "vitest";
import { RpcUnavailableError } from "@/shared/near/errors";
import { NearRpc } from "@/shared/near/rpc";
import { server } from "../../../msw/server";
import { FakeChain } from "../../../msw/near-rpc";

const A = "https://rpc-a.test";
const B = "https://rpc-b.test";
const hits = (chain: FakeChain) => chain.calls.length;

describe("NearRpc failover", () => {
  it("moves to the next endpoint when one is down, and keeps using it", async () => {
    const chain = new FakeChain();
    let downHits = 0;
    server.use(
      http.post(A, () => {
        downHits++;
        return new HttpResponse("upstream down", { status: 503 });
      }),
      chain.handler(B),
    );
    const rpc = new NearRpc([A, B], { attemptsPerEndpoint: 1 });
    expect((await rpc.block()).height).toBe(chain.block.height);
    expect((await rpc.block()).height).toBe(chain.block.height);
    expect(downHits).toBe(1);
    expect(hits(chain)).toBe(2);
  });

  it("fails over on network errors and rate limits", async () => {
    const chain = new FakeChain();
    server.use(http.post(A, () => HttpResponse.error()), chain.handler(B));
    expect((await new NearRpc([A, B], { attemptsPerEndpoint: 1 }).block()).height).toBe(chain.block.height);

    server.use(http.post(A, () => new HttpResponse("slow down", { status: 429 })));
    expect((await new NearRpc([A, B], { attemptsPerEndpoint: 1 }).block()).height).toBe(chain.block.height);
  });

  it("does not repeat a deterministic answer on every endpoint", async () => {
    const a = new FakeChain();
    const b = new FakeChain();
    server.use(a.handler(A), b.handler(B));
    const rpc = new NearRpc([A, B]);
    const publicKey = KeyPair.fromRandom("ed25519").getPublicKey().toString();
    expect(await rpc.accessKey("nobody.testnet", publicKey)).toBeNull();
    expect(hits(a)).toBe(1);
    expect(hits(b)).toBe(0);
  });

  it("gives up with RpcUnavailableError listing every endpoint", async () => {
    server.use(http.post(A, () => new HttpResponse(null, { status: 502 })), http.post(B, () => HttpResponse.text("<html>maintenance</html>")));
    const error = await new NearRpc([A, B], { attemptsPerEndpoint: 1 }).block().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcUnavailableError);
    expect((error as RpcUnavailableError).attempts.map((a) => a.url)).toEqual([A, B]);
  });

  it("times out a hanging endpoint", async () => {
    const chain = new FakeChain();
    server.use(http.post(A, () => new Promise<Response>(() => {})), chain.handler(B));
    const rpc = new NearRpc([A, B], { attemptTimeoutMs: 50 });
    expect((await rpc.block()).height).toBe(chain.block.height);
  });
});

describe("NearRpc access keys", () => {
  it("reports full-access and function-call keys", async () => {
    const chain = new FakeChain();
    server.use(chain.handler(A));
    const full = KeyPair.fromRandom("ed25519").getPublicKey().toString();
    const limited = KeyPair.fromRandom("ed25519").getPublicKey().toString();
    chain.addKey("mika.testnet", full).addKey("mika.testnet", limited, { FunctionCall: { allowance: "250000000000000000000000", receiver_id: "thecut.testnet", method_names: ["run_cut"] } });
    const rpc = new NearRpc([A]);
    expect(await rpc.accessKey("mika.testnet", full)).toEqual({ kind: "full", gasKey: false });
    expect(await rpc.accessKey("mika.testnet", limited)).toEqual({
      kind: "function_call",
      gasKey: false,
      receiverId: "thecut.testnet",
      methodNames: ["run_cut"],
      allowance: 250_000_000_000_000_000_000_000n,
    });
  });
});
