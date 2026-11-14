import { Actions, type Action } from "near-connect-hooks";

/** One change method on the cut contract (`docs/contract-interface.md`). Amounts are yocto / 18-decimal strings. */
export type ContractCall = {
  method: string;
  args?: Record<string, unknown>;
  /** yoctoNEAR to attach. Default "0"; payable methods (`buy`, `register_robot`, `storage_deposit`) need it. */
  deposit?: string;
  /** Default 100 TGas. */
  gas?: string;
};

export const DEFAULT_GAS = "100000000000000";
/** NEP-141 / NEP-145 calls that move tokens require exactly 1 yoctoNEAR, so a function-call key can never sign them. */
export const ONE_YOCTO = "1";

export function toActions(calls: readonly ContractCall[]): Action[] {
  if (calls.length === 0) throw new Error("A transaction needs at least one call");
  return calls.map(({ method, args = {}, deposit = "0", gas = DEFAULT_GAS }) => Actions.functionCall(method, args, gas, deposit));
}
