import "server-only";
import { createHash } from "node:crypto";
import { PublicKey } from "near-api-js";

/** NEP-413 payload: https://github.com/near/NEPs/blob/master/neps/nep-0413.md */
export type Nep413Payload = { message: string; recipient: string; nonce: Uint8Array; callbackUrl?: string };

/** 2^31 + 413: the borsh u32 tag that keeps a signed message from ever being a valid transaction. */
const NEP413_TAG = 2 ** 31 + 413;

/**
 * sha256(borsh(u32 tag) ++ borsh({ message, nonce: [u8; 32], recipient, callbackUrl: Option<string> })),
 * the bytes a wallet signs. Mirrors near-api-js `verifyMessage`; tests pin the two together.
 */
export function nep413Digest({ message, recipient, nonce, callbackUrl }: Nep413Payload): Uint8Array {
  if (nonce.length !== 32) throw new RangeError("A NEP-413 nonce is exactly 32 bytes.");
  const parts: Uint8Array[] = [u32(NEP413_TAG), string(message), nonce, string(recipient)];
  parts.push(callbackUrl === undefined ? Uint8Array.of(0) : concat([Uint8Array.of(1), string(callbackUrl)]));
  return new Uint8Array(createHash("sha256").update(concat(parts)).digest());
}

/**
 * Checks the signature alone, offline. Cheap, so forged requests are refused before any RPC call;
 * the access-key check still needs the chain (see ./verify).
 */
export function isValidNep413Signature(payload: Nep413Payload, publicKey: string, signature: Uint8Array): boolean {
  try {
    return PublicKey.fromString(publicKey).verify(nep413Digest(payload), signature);
  } catch {
    return false;
  }
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function string(value: string): Uint8Array {
  const utf8 = new TextEncoder().encode(value);
  return concat([u32(utf8.length), utf8]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
