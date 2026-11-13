import { beforeEach, describe, expect, it } from "vitest";
import { cutContract } from "@/shared/near/contract";
import { ContractResponseError, ContractViewError } from "@/shared/near/errors";
import { NearRpc } from "@/shared/near/rpc";
import { server } from "../../../msw/server";
import { FakeChain } from "../../../msw/near-rpc";

const URL = "https://rpc.test";
const CUT = 10n ** 18n;
const ns = (iso: string) => (BigInt(Date.parse(iso)) * 1_000_000n).toString();
const robot = (id: string, pile: bigint, status = "stage") => ({
  id,
  account_id: `${id}.thecut.testnet`,
  name: id,
  kind: "AI robot",
  x_handle: `@${id}`,
  creator: `${id}-studio.testnet`,
  status,
  pile: pile.toString(),
  savers: 3,
  joined_at: ns("2026-11-12T15:01:00Z"),
});

let chain: FakeChain;
const contract = () => cutContract(new NearRpc([URL]), "thecut.testnet");

beforeEach(() => {
  chain = new FakeChain();
  server.use(chain.handler(URL));
});

describe("cutContract views", () => {
  it("read every view in the interface with typed results", async () => {
    chain
      .view("get_params", { value: { total_supply: (10_000_000n * CUT).toString(), fee_bps: 100, burn_bps: 5000, savers_bps: 9500, stage_size: 10, first_cut_at: ns("2026-11-13T18:00:00Z"), cut_interval: "120000000000", robot_funding: "500000000000000000000000", register_deposit: "5000000000000000000000000", pool_cut_reserve: "1", pool_near_reserve: "2" } })
      .view("get_stage", { value: [robot("pixie", 182_400n * CUT), robot("kiko", 23_600n * CUT)] })
      .view("get_bench", { value: [robot("chartwise", 88_400n * CUT, "bench")] })
      .view("get_robot", (args) => ({ value: args.id === "kiko" ? robot("kiko", 1n) : null }))
      .view("get_saves", (args) => ({ value: args.account_id === "mika.testnet" ? [{ robot_id: "melody", amount: (400n * CUT).toString(), since_cut: 1 }] : [] }))
      .view("get_pool", { value: { near_reserve: "736", cut_reserve: "1000", fee_bps: 100 } })
      .view("quote_buy", (args) => ({ value: { amount_out: String(Number(args.near_in) * 2), fee: "1" } }))
      .view("quote_sell", (args) => ({ value: { amount_out: String(Number(args.cut_in) / 2), fee: "1" } }))
      .view("get_next_cut", { value: { index: 1, at: ns("2026-11-13T18:00:00Z"), lowest_id: "kiko", gap_to_next: (38_201n * CUT).toString(), prize_so_far: (4_100n * CUT).toString() } })
      .view("get_cut", (args) => ({ value: args.index === 1 ? { index: 1, at: ns("2026-11-13T18:00:00Z"), deleted_id: "kiko", pile: "4", burned: "2", prize: "3", slice: "1", creator_slice: "0", joined_id: "chartwise", runner: "bob.testnet" } : null }))
      .view("get_claimable", { value: "632" })
      .view("ft_balance_of", { value: "674" })
      .view("ft_total_supply", { value: (10_000_000n * CUT).toString() })
      .view("ft_metadata", { value: { spec: "ft-1.0.0", name: "The Cut", symbol: "CUT", icon: null, reference: null, reference_hash: null, decimals: 18 } });

    const c = contract();
    expect((await c.getParams()).cutIntervalMs).toBe(120_000);
    expect((await c.getStage()).map((r) => [r.id, r.pile])).toEqual([["pixie", 182_400n * CUT], ["kiko", 23_600n * CUT]]);
    expect((await c.getBench())[0].status).toBe("bench");
    expect((await c.getRobot("kiko"))?.accountId).toBe("kiko.thecut.testnet");
    expect(await c.getRobot("ghost")).toBeNull();
    expect(await c.getSaves("mika.testnet")).toEqual([{ robotId: "melody", amount: 400n * CUT, lockedForCut: 1 }]);
    expect(await c.getPool()).toEqual({ nearReserve: 736n, cutReserve: 1000n, feeBps: 100 });
    expect(await c.quoteBuy(10n)).toEqual({ amountOut: 20n, fee: 1n });
    expect(await c.quoteSell(10n)).toEqual({ amountOut: 5n, fee: 1n });
    expect(await c.getNextCut()).toMatchObject({ index: 1, lowestId: "kiko", gapToNext: 38_201n * CUT });
    expect((await c.getCut(1))?.joinedId).toBe("chartwise");
    expect(await c.getCut(9)).toBeNull();
    expect(await c.getClaimable("mika.testnet")).toBe(632n);
    expect(await c.ftBalanceOf("mika.testnet")).toBe(674n);
    expect(await c.ftTotalSupply()).toBe(10_000_000n * CUT);
    expect((await c.ftMetadata()).decimals).toBe(18);
  });

  it("sends U128 arguments as decimal strings", async () => {
    chain.view("quote_buy", (args) => ({ value: { amount_out: typeof args.near_in === "string" ? "1" : "0", fee: "0" } }));
    expect((await contract().quoteBuy(10n ** 30n)).amountOut).toBe(1n);
  });

  it("raises ContractResponseError when the contract breaks the interface", async () => {
    chain.view("get_pool", { value: { near_reserve: 736, cut_reserve: "1000", fee_bps: 100 } });
    const error = await contract().getPool().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContractResponseError);
    expect((error as Error).message).toContain("near_reserve");
  });

  it("raises ContractViewError for a panic or a missing method", async () => {
    chain.view("get_next_cut", { panic: "not initialized" });
    await expect(contract().getNextCut()).rejects.toBeInstanceOf(ContractViewError);
    await expect(contract().getPool()).rejects.toBeInstanceOf(ContractViewError);
  });
});
