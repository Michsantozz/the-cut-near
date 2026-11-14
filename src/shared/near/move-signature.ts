import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

// The check `submit_move` makes on a move's signature (RULES.md, "Agents"), as pure functions shared by the relay
// (before it spends gas) and the judge desk (after the fact, in the browser). Node-loadable on purpose: npm imports only,
// so scripts/testnet/*.ts can load it through src/features/moves/model/relay.ts.

/** Moves are signed with the model TEE's Ed25519 key; `model_signers` holds those public keys. */
export const MOVE_SIGNING_ALGO = "ed25519";

/** The contract refuses a larger `response`. */
export const MAX_RESPONSE_BYTES = 32 * 1024;

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

/** The signed text from the two hashes: `<model_id>:<hex sha256(request)>:<hex sha256(response)>`. */
export function signedMoveTextOf(modelId: string, requestSha256: string, responseSha256: string): string {
  return `${modelId}:${requestSha256}:${responseSha256}`;
}

/** The text the model TEE signs: `<model_id>:<hex sha256(request)>:<hex sha256(response)>`. */
export function signedMoveText(modelId: string, requestBody: string, responseBody: string): string {
  return signedMoveTextOf(modelId, sha256Hex(requestBody), sha256Hex(responseBody));
}

/** Lowercase hex without `0x`, or null when `value` is not hex. */
export function plainHex(value: string): string | null {
  const hex = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  return hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex) ? hex.toLowerCase() : null;
}

/** Whether `signer` is one of the contract's `model_signers`, compared as plain lowercase hex. */
export function isModelSigner(signer: string, signers: readonly string[]): boolean {
  const key = plainHex(signer);
  return key !== null && signers.some((known) => plainHex(known) === key);
}

/**
 * Ed25519 over the UTF-8 bytes of `text`, as `env::ed25519_verify` checks it: a 64-byte signature and a 32-byte public
 * key, both hex. False for malformed input, never throws.
 */
export function verifyMoveSignature(signatureHex: string, text: string, signerHex: string): boolean {
  const signature = plainHex(signatureHex);
  const signer = plainHex(signerHex);
  if (signature?.length !== 128 || signer?.length !== 64) return false;
  try {
    return ed25519.verify(hexToBytes(signature), utf8ToBytes(text), hexToBytes(signer));
  } catch {
    return false;
  }
}
