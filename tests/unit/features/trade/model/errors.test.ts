import { describe, expect, it } from "vitest";

import { classifyTxError, failedTxHash } from "@/features/trade/model/errors";
import { ContractCallError } from "@/shared/wallet/contract-call";

describe("classifyTxError", () => {
  it("reads a wallet rejection as cancelled", () => {
    expect(classifyTxError(new Error("User rejected the request"))).toBe("cancelled");
  });

  it("reads the contract's slippage panic, and keeps the refused transaction's hash", () => {
    const error = new ContractCallError('The contract refused the call: {"ActionError":{"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: Slippage: you would get 1 $CUT units, below min_out 2"}}}}', "8Bq2abc3aR6");
    expect(classifyTxError(error)).toBe("slippage");
    expect(failedTxHash(error)).toBe("8Bq2abc3aR6");
  });

  it("never reads an on-chain refusal as a cancel, even when the panic mentions a user", () => {
    expect(classifyTxError(new ContractCallError("The contract refused the call: user has no storage", "h"))).toBe("refused");
    expect(failedTxHash(new Error("closed"))).toBeNull();
  });
});
