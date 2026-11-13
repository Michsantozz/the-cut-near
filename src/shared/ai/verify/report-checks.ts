import { hexToBytes, sha256Hex } from "./bytes";
import type { ProofCheck } from "./checks";
import { appComposeOf, eventLogOf, type NearReport } from "./schemas";
import { expectedMrConfigId, expectedReportData, isDebugTd, parseTdxQuote, replayRtmr3 } from "./tdx";

// The local checks on one NEAR-operated attestation report (gateway or model candidate).
// They read the quote body and compare it with the client nonce, the signing identity, the measured
// compose file and the event log. They are only as strong as the quote itself: the quote's Intel
// signature chain is checked separately (delegated, see hardware.ts).
// Spec: https://docs.near.ai/cloud/verification/cloud-api/model-attestations.md

const local = (id: string, label: string, ok: boolean, detail?: string): ProofCheck => ({ id, label, status: ok ? "pass" : "fail", scope: "local", ...(detail ? { detail } : {}) });

export function checkReportLocally(report: NearReport, nonce: string): ProofCheck[] {
  const quote = parseTdxQuote(report.intel_quote);
  if (!quote) return [local("tdx-quote", "Intel TDX quote", false, "The quote is not a TDX v4/v5 quote.")];

  const checks: ProofCheck[] = [local("tdx-quote", "Intel TDX quote", true, `TDX quote v${quote.version}, ${report.intel_quote.length / 2} bytes, SHA-256 ${sha256Hex(hexToBytes(report.intel_quote) ?? new Uint8Array())}.`)];

  const echoed = report.request_nonce?.toLowerCase();
  checks.push(local("nonce", "Fresh for our request", echoed === nonce.toLowerCase(), echoed === nonce.toLowerCase() ? "The report echoes our nonce." : "The echoed nonce is missing or differs."));

  const expected = expectedReportData(report.signing_address, nonce);
  const boundInQuote = expected !== null && quote.reportData === expected;
  const httpCopyAgrees = report.report_data === undefined || report.report_data.toLowerCase().replace(/^0x/, "") === quote.reportData;
  checks.push(
    local(
      "report-data",
      "Signing key born in the TEE",
      boundInQuote && httpCopyAgrees,
      boundInQuote ? (httpCopyAgrees ? "The quote's report data binds the signing address and our nonce." : "The quote binds them, but the HTTP report_data differs.") : "The quote's report data does not bind this signing address and our nonce.",
    ),
  );

  checks.push(local("debug-off", "Debug mode off", !isDebugTd(quote), isDebugTd(quote) ? "TD_ATTRIBUTES has the DEBUG bit set." : undefined));

  const appCompose = appComposeOf(report);
  checks.push(
    appCompose === null
      ? local("compose", "Measured app config", false, "info.tcb_info.app_compose is missing.")
      : local("compose", "Measured app config", quote.mrConfigId === expectedMrConfigId(appCompose), quote.mrConfigId === expectedMrConfigId(appCompose) ? "MRCONFIGID = 01 || SHA-256(app_compose) || zeros." : "MRCONFIGID does not match app_compose."),
  );

  const events = eventLogOf(report);
  const replay = events ? replayRtmr3(events) : ({ ok: false, reason: "The event log is malformed." } as const);
  checks.push(
    replay.ok
      ? local("rtmr3", "Runtime event log", replay.rtmr3 === quote.rtMr3, replay.rtmr3 === quote.rtMr3 ? "Replaying the event log gives the quote's RTMR3." : "The replayed event log does not give the quote's RTMR3.")
      : local("rtmr3", "Runtime event log", false, replay.reason),
  );
  return checks;
}
