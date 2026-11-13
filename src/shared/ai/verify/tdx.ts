import { concatBytes, equalBytes, hexToBytes, sha256Bytes, sha384Bytes, toHex, utf8 } from "./bytes";
import type { EventLogEntry } from "./schemas";

// Intel TDX quote fields and the dstack measurement checks, done locally with no network.
// Parsing reads the TD report body; it does NOT check the quote's signature chain. That check is
// delegated to an Intel DCAP verifier (see hardware.ts). Field offsets: Intel TDX DCAP Quoting
// Library API, "TD Quote Body" (v4) and "TD Quote Body Descriptor" (v5).
// Rules: https://docs.near.ai/cloud/verification/reference/quote-nonce-signer.md

const TDX_TEE_TYPE = 0x81;
const HEADER_SIZE = 48;
const TD10_BODY_SIZE = 584;

/** The TD report fields the NEAR checks read, as lowercase hex. */
export type TdxQuoteFields = {
  version: number;
  tdAttributes: string;
  mrTd: string;
  mrConfigId: string;
  rtMr0: string;
  rtMr1: string;
  rtMr2: string;
  rtMr3: string;
  reportData: string;
};

/** Parses a TDX quote (v4, or v5 with a TD 1.0/1.5 body). Returns null for anything else. */
export function parseTdxQuote(quoteHex: string): TdxQuoteFields | null {
  const quote = hexToBytes(quoteHex);
  if (!quote || quote.length < HEADER_SIZE + TD10_BODY_SIZE) return null;
  const view = new DataView(quote.buffer, quote.byteOffset, quote.byteLength);
  const version = view.getUint16(0, true);
  if (view.getUint32(4, true) !== TDX_TEE_TYPE) return null;
  let bodyStart: number;
  if (version === 4) bodyStart = HEADER_SIZE;
  else if (version === 5) {
    const bodyType = view.getUint16(HEADER_SIZE, true);
    // 2 = TD report 1.0, 3 = TD report 1.5 (1.0 fields first, then extensions).
    if (bodyType !== 2 && bodyType !== 3) return null;
    bodyStart = HEADER_SIZE + 6;
  } else return null;
  if (quote.length < bodyStart + TD10_BODY_SIZE) return null;
  const field = (offset: number, size: number) => toHex(quote.subarray(bodyStart + offset, bodyStart + offset + size));
  return {
    version,
    tdAttributes: field(120, 8),
    mrTd: field(136, 48),
    mrConfigId: field(184, 48),
    rtMr0: field(328, 48),
    rtMr1: field(376, 48),
    rtMr2: field(424, 48),
    rtMr3: field(472, 48),
    reportData: field(520, 64),
  };
}

/** TDX debug mode is bit 0 of TD_ATTRIBUTES (TUD.DEBUG). A debug TD can be inspected by the host. */
export function isDebugTd(fields: TdxQuoteFields): boolean {
  return (Number.parseInt(fields.tdAttributes.slice(0, 2), 16) & 1) === 1;
}

/**
 * Report data of a NEAR-operated report without TLS binding: the signing identity right-padded with
 * zeros to 32 bytes, then the 32-byte client nonce. Null when the identity or nonce is malformed.
 */
export function expectedReportData(signingAddress: string, nonceHex: string): string | null {
  const identity = hexToBytes(signingAddress);
  const nonce = hexToBytes(nonceHex);
  if (!identity || identity.length > 32 || identity.length === 0 || !nonce || nonce.length !== 32) return null;
  const padded = new Uint8Array(32);
  padded.set(identity);
  return toHex(concatBytes(padded, nonce));
}

/** MRCONFIGID expected for a measured `app_compose`: `01 || SHA-256(app_compose) || 15 zero bytes`. */
export function expectedMrConfigId(appCompose: string): string {
  return toHex(concatBytes(Uint8Array.of(1), sha256Bytes(utf8(appCompose)), new Uint8Array(15)));
}

export type Rtmr3Replay = { ok: true; rtmr3: string } | { ok: false; reason: string };

/**
 * Replays the IMR 3 events: digest = SHA-384(event_type as u32 LE || ":" || event || ":" || payload bytes),
 * RTMR3 = SHA-384(RTMR3 || digest) from 48 zero bytes. A non-empty `digest` field must equal the computed one.
 */
export function replayRtmr3(events: EventLogEntry[]): Rtmr3Replay {
  let rtmr3: Uint8Array = new Uint8Array(48);
  for (const event of events) {
    if (event.imr !== 3) continue;
    const payload = hexToBytes(event.event_payload ?? "");
    if (!payload) return { ok: false, reason: `Event "${event.event}" has a payload that is not hex.` };
    const type = new Uint8Array(4);
    new DataView(type.buffer).setUint32(0, event.event_type, true);
    const digest = sha384Bytes(concatBytes(type, utf8(":"), utf8(event.event), utf8(":"), payload));
    if (event.digest) {
      const given = hexToBytes(event.digest);
      if (!given || !equalBytes(given, digest)) return { ok: false, reason: `Event "${event.event}" digest does not match its content.` };
    }
    rtmr3 = sha384Bytes(concatBytes(rtmr3, digest));
  }
  return { ok: true, rtmr3: toHex(rtmr3) };
}
