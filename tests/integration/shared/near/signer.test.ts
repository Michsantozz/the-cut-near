import { KeyPair } from "near-api-js";
import { beforeEach, describe, expect, it } from "vitest";
import { NearRpc } from "@/shared/near/rpc";
import { createFunctionCallSigner, SignerKeyError } from "@/shared/near/signer";
import { server } from "../../../msw/server";
import { FakeChain } from "../../../msw/near-rpc";

const URL = "https://rpc.test";
const KEEPER = "keeper.testnet";
const CONTRACT = "thecut.testnet";
const keyPair = KeyPair.fromRandom("ed25519");
const publicKey = keyPair.getPublicKey().toString();
const privateKey = keyPair.toString();

let chain: FakeChain;
const signer = () => createFunctionCallSigner({ rpc: new NearRpc([URL]), accountId: KEEPER, privateKey, receiverId: CONTRACT, methods: ["run_cut"] });
const functionCall = (receiver_id: string, method_names: string[]) => ({ FunctionCall: { allowance: null, receiver_id, method_names } });

beforeEach(() => {
  chain = new FakeChain(CONTRACT);
  server.use(chain.handler(URL));
});

describe("createFunctionCallSigner", () => {
  it("refuses a full-access key", async () => {
    chain.addKey(KEEPER, publicKey, "FullAccess");
    await expect(signer()).rejects.toThrow(/Refusing the full-access key/);
  });

  it.each([
    ["another receiver", functionCall("other.testnet", ["run_cut"])],
    ["any method", functionCall(CONTRACT, [])],
    ["other methods", functionCall(CONTRACT, ["claim"])],
  ])("refuses a key for %s", async (_, permission) => {
    chain.addKey(KEEPER, publicKey, permission);
    await expect(signer()).rejects.toBeInstanceOf(SignerKeyError);
  });

  it("refuses a key the account does not have, and a malformed key", async () => {
    await expect(signer()).rejects.toThrow(/is not an access key/);
    await expect(createFunctionCallSigner({ rpc: new NearRpc([URL]), accountId: KEEPER, privateKey: "0xabc", receiverId: CONTRACT, methods: ["run_cut"] })).rejects.toBeInstanceOf(SignerKeyError);
  });

  it("signs run_cut with no deposit and reports success", async () => {
    chain.addKey(KEEPER, publicKey, functionCall(CONTRACT, ["run_cut"]));
    chain.onSend = () => ({ status: "success", logs: ["EVENT_JSON:{}"] });
    const outcome = await (await signer()).call("run_cut");
    expect(outcome).toMatchObject({ status: "success", logs: ["EVENT_JSON:{}"] });
    expect(chain.sent).toEqual([{ signerId: KEEPER, receiverId: CONTRACT, methodName: "run_cut", args: {}, gas: 300_000_000_000_000n, deposit: 0n }]);
  });

  it("reports a contract failure without throwing, and never calls other methods", async () => {
    chain.addKey(KEEPER, publicKey, functionCall(CONTRACT, ["run_cut"]));
    chain.onSend = () => ({ status: "failure", panic: "Too early" });
    const s = await signer();
    expect(await s.call("run_cut")).toMatchObject({ status: "failure" });
    await expect(s.call("claim")).rejects.toBeInstanceOf(SignerKeyError);
    expect(chain.sent).toHaveLength(1);
  });
});
