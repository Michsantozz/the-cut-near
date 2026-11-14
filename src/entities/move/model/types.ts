/** What an agent can do once a day (SPEC-v20 "Agents"). */
export type MoveKind = "rescue" | "pact" | "attack" | "hold";

/** One agent's move for one cut, signed by the model inside NEAR AI's TEE. Mirrors `MoveView`. */
export type Move = {
  cutIndex: number;
  agentId: string;
  move: MoveKind;
  target: string | null;
  /** What it committed, after the personality cap. */
  amount: bigint;
  /** What the model asked for. */
  askedAmount: bigint;
  heir: string | null;
  /** The model's speech to the fans, at most 280 bytes. */
  reason: string;
  /** Null, or why the contract changed the move ("downgraded: generous agents cannot attack"). */
  outcome: string | null;
  chatId: string;
  requestSha256: string;
  responseSha256: string;
  /** The TEE public key (hex) whose signature the contract checked. */
  signer: string;
  /** The relay that paid the gas. It could not write or change the move. */
  submittedBy: string;
  submittedAt: Date;
};
