import { sha256, sha384 } from "@noble/hashes/sha2.js";

// Byte helpers shared by the verifiers. Pure and isomorphic: they run on the server and in the browser.

const encoder = new TextEncoder();
// `ignoreBOM` keeps a leading byte-order mark, so bytes -> text -> bytes is lossless for UTF-8.
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export const utf8 = (text: string): Uint8Array => encoder.encode(text);
export const fromUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes);

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** Strict hex decoder: optional `0x`, even length, hex digits only. Returns null on anything else. */
export function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Constant-time for equal lengths; different lengths are simply unequal. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const sha256Hex = (data: Uint8Array | string): string => toHex(sha256(typeof data === "string" ? utf8(data) : data));
export const sha256Bytes = (data: Uint8Array): Uint8Array => sha256(data);
export const sha384Bytes = (data: Uint8Array): Uint8Array => sha384(data);
