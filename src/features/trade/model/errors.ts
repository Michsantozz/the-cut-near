// What went wrong with a wallet transaction, in the words the screens use.

export type TxFailure = "cancelled" | "slippage" | "refused";

/** The hash of a transaction the contract refused, when it reached the chain. */
export function failedTxHash(error: unknown): string | null {
  return error instanceof Error && "txHash" in error && typeof error.txHash === "string" ? error.txHash : null;
}

/** Sorts a rejected `callContract`: the user said no in the wallet, the price moved past `min_out`, or anything else. */
export function classifyTxError(error: unknown): TxFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (failedTxHash(error) === null && /reject|cancel|denied|closed|user/i.test(message)) return "cancelled";
  if (/slippage|min_out/i.test(message)) return "slippage";
  return "refused";
}
