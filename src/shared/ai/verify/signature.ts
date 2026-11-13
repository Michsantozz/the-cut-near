import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { concatBytes, equalBytes, hexToBytes, sha256Hex, toHex, utf8 } from "./bytes";
import type { ChatSignature, SigningAlgo } from "./schemas";

// Response-signature checks, done locally with no network.
// Spec: https://docs.near.ai/cloud/verification/reference/response-signature-verification.md

/** A signing identity: an Ethereum-style address (ecdsa) or an Ed25519 public key (ed25519), always with its algorithm. */
export type SignerIdentity = { algo: SigningAlgo; address: string };

export type SignatureKind = "provider_tee" | "gateway";

/**
 * The text NEAR AI signs for a response: `<request_hash>:<response_hash>` for a gateway signature and
 * `<model_id>:<request_hash>:<response_hash>` for a model-TEE (`provider_tee`) signature. Hashes are
 * SHA-256 hex of the exact bytes sent and received.
 */
export function expectedSignedText(requestBody: string | Uint8Array, responseBody: string | Uint8Array, model?: string): string {
  const hashes = `${sha256Hex(requestBody)}:${sha256Hex(responseBody)}`;
  return model === undefined ? hashes : `${model}:${hashes}`;
}

/** Ethereum EIP-191 `personal_sign` digest of `message`. */
export function eip191Digest(message: string): Uint8Array {
  const body = utf8(message);
  return keccak_256(concatBytes(utf8(`\x19Ethereum Signed Message:\n${body.length}`), body));
}

/** The Ethereum address of an uncompressed or compressed secp256k1 public key, lowercase `0x…`. */
export function ethAddressOf(publicKey: Uint8Array): string {
  const uncompressed = secp256k1.Point.fromBytes(publicKey).toBytes(false);
  return `0x${toHex(keccak_256(uncompressed.subarray(1)).subarray(12))}`;
}

/**
 * Recovers the signer address of a 65-byte `r || s || v` Ethereum signature over `message` (EIP-191).
 * `v` may be 0/1 or 27/28. Returns null when the signature is malformed or recovers nothing.
 */
export function recoverEip191Signer(message: string, signatureHex: string): string | null {
  const signature = hexToBytes(signatureHex);
  if (!signature || signature.length !== 65) return null;
  const v = signature[64];
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) return null;
  try {
    // noble's "recovered" format puts the recovery byte first.
    const recovered = concatBytes(Uint8Array.of(recovery), signature.subarray(0, 64));
    const publicKey = secp256k1.recoverPublicKey(recovered, eip191Digest(message), { prehash: false });
    return ethAddressOf(publicKey);
  } catch {
    return null;
  }
}

export type SignatureVerdict = { ok: true; signer: SignerIdentity } | { ok: false; reason: string };

/** Checks that `signature.signature` was made over `signature.text` by `signature.signing_address`. */
export function verifySignatureBySigner(signature: ChatSignature): SignatureVerdict {
  const signer: SignerIdentity = { algo: signature.signing_algo, address: normalizeAddress(signature.signing_address) };
  if (signature.signing_algo === "ecdsa") {
    if (hexToBytes(signer.address)?.length !== 20) return { ok: false, reason: "signing_address is not a 20-byte address." };
    const recovered = recoverEip191Signer(signature.text, signature.signature);
    if (!recovered) return { ok: false, reason: "The ECDSA signature is malformed or recovers no key." };
    return recovered === signer.address ? { ok: true, signer } : { ok: false, reason: `The signature recovers ${recovered}, not ${signer.address}.` };
  }
  const publicKey = hexToBytes(signer.address);
  const bytes = hexToBytes(signature.signature);
  if (publicKey?.length !== 32) return { ok: false, reason: "signing_address is not a 32-byte Ed25519 key." };
  if (bytes?.length !== 64) return { ok: false, reason: "The Ed25519 signature is not 64 bytes." };
  try {
    return ed25519.verify(bytes, utf8(signature.text), publicKey) ? { ok: true, signer } : { ok: false, reason: "The Ed25519 signature does not match signing_address." };
  } catch {
    return { ok: false, reason: "The Ed25519 signature is malformed." };
  }
}

/** Lowercase hex with a `0x` prefix, so identities compare as strings. */
export function normalizeAddress(address: string): string {
  const hex = address.startsWith("0x") || address.startsWith("0X") ? address.slice(2) : address;
  return `0x${hex.toLowerCase()}`;
}

export function sameSigner(a: SignerIdentity, b: SignerIdentity): boolean {
  if (a.algo !== b.algo) return false;
  const left = hexToBytes(normalizeAddress(a.address));
  const right = hexToBytes(normalizeAddress(b.address));
  return left !== null && right !== null && equalBytes(left, right);
}

export function signatureKindOf(signature: ChatSignature): SignatureKind | null {
  return signature.signature_kind === "provider_tee" || signature.signature_kind === "gateway" ? signature.signature_kind : null;
}
