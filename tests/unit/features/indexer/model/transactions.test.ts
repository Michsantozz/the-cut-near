import { describe, expect, it } from "vitest";
import { extractEvents, isContractAccount, transactionSchema, type TxApiTransaction } from "@/features/indexer/model/transactions";

const CONTRACT = "thecut.testnet";
const event = (standard: string, name: string, data: unknown) => `EVENT_JSON:${JSON.stringify({ standard, version: "1.0.0", event: name, data })}`;

function receipt(id: string, executor: string, logs: string[], status: object = { SuccessValue: "" }, height = 100) {
  return { execution_outcome: { id, block_height: height, block_timestamp: 1794592800123000000, outcome: { logs, executor_id: executor, status } } };
}

function tx(receipts: ReturnType<typeof receipt>[]): TxApiTransaction {
  return transactionSchema.parse({
    transaction: { hash: "TX1", signer_id: "mika.testnet", receiver_id: CONTRACT },
    execution_outcome: receipt("TX1", "mika.testnet", [], { SuccessReceiptId: "R1" }).execution_outcome,
    receipts,
  });
}

describe("extractEvents", () => {
  it("turns each data item of each event log into a journal row", () => {
    const rows = extractEvents(
      tx([
        receipt("R1", CONTRACT, [
          "plain log line",
          event("thecut", "save", [{ account_id: "mika.testnet", robot_id: "melody", amount: "400", cut_index: 1 }]),
          event("thecut", "prize", [{ account_id: "a.testnet", amount: "1" }, { account_id: "b.testnet", amount: "2" }]),
        ]),
      ]),
      CONTRACT,
    );
    expect(rows.map((r) => [r.event, r.logIndex, r.itemIndex, r.accountId])).toEqual([
      ["save", 1, 0, "mika.testnet"],
      ["prize", 2, 0, "a.testnet"],
      ["prize", 2, 1, "b.testnet"],
    ]);
    expect(rows[0]).toMatchObject({
      receiptId: "R1",
      txHash: "TX1",
      blockHeight: 100,
      blockTimestamp: new Date("2026-11-13T18:00:00.123Z"),
      emitter: CONTRACT,
      standard: "thecut",
      version: "1.0.0",
      robotId: "melody",
      cutIndex: 1,
      amount: 400n,
      data: { account_id: "mika.testnet", robot_id: "melody", amount: "400", cut_index: 1 },
    });
  });

  it("keeps events of robot sub-accounts and NEP-141 events", () => {
    const rows = extractEvents(tx([receipt("R2", `kiko.${CONTRACT}`, [event("thecut", "delete", { robot_id: "kiko" })]), receipt("R3", CONTRACT, [event("nep141", "ft_burn", [{ owner_id: CONTRACT, amount: "11800" }])])]), CONTRACT);
    expect(rows.map((r) => `${r.emitter}:${r.event}`)).toEqual([`kiko.${CONTRACT}:delete`, `${CONTRACT}:ft_burn`]);
  });

  it("ignores other emitters, failed receipts and untracked standards", () => {
    const forged = event("thecut", "prize", [{ account_id: "thief.testnet", amount: "1000000" }]);
    const rows = extractEvents(
      tx([
        receipt("R4", "evil.testnet", [forged]),
        receipt("R5", `evilthecut.testnet`, [forged]),
        receipt("R6", CONTRACT, [forged], { Failure: { ActionError: {} } }),
        receipt("R7", CONTRACT, [event("nep171", "nft_mint", [{}])]),
      ]),
      CONTRACT,
    );
    expect(rows).toEqual([]);
  });
});

describe("isContractAccount", () => {
  it("matches the contract and its sub-accounts only", () => {
    expect(isContractAccount(CONTRACT, CONTRACT)).toBe(true);
    expect(isContractAccount(CONTRACT, `pixie.${CONTRACT}`)).toBe(true);
    expect(isContractAccount(CONTRACT, `pixiethecut.testnet`)).toBe(false);
  });
});
