/** One change method on the cut contract (`docs/contract-interface.md`). Amounts are yocto / 18-decimal strings. */
export type ContractCall = {
  method: string;
  args?: Record<string, unknown>;
  /** yoctoNEAR to attach. Default "0"; payable methods (`buy`, `register_agent`, `storage_deposit`) need it. */
  deposit?: string;
  /** Default 100 TGas. */
  gas?: string;
};

/** The contract refused a transaction that reached the chain: `txHash` links to it, `message` carries the contract's reason. */
export class ContractCallError extends Error {
  constructor(
    message: string,
    readonly txHash: string,
  ) {
    super(message);
    this.name = "ContractCallError";
  }
}

export const DEFAULT_GAS = "100000000000000";
/** NEP-141 / NEP-145 calls that move tokens require exactly 1 yoctoNEAR, so a function-call key can never sign them. */
export const ONE_YOCTO = "1";
