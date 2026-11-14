import { Actions, type Action } from "near-connect-hooks";

import { DEFAULT_GAS, type ContractCall } from "./contract-call";

// Kept apart from contract-call.ts: near-connect-hooks creates a React context when it loads, which fails in a
// Server Component, and the wallet index (imported by the root layout) must stay safe to evaluate on the server.
export function toActions(calls: readonly ContractCall[]): Action[] {
  if (calls.length === 0) throw new Error("A transaction needs at least one call");
  return calls.map(({ method, args = {}, deposit = "0", gas = DEFAULT_GAS }) => Actions.functionCall(method, args, gas, deposit));
}
