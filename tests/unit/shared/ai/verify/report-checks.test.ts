import { describe, expect, it } from "vitest";
import { checkReportLocally } from "@/shared/ai/verify/report-checks";
import { appComposeOf, eventLogOf, type NearReport } from "@/shared/ai/verify/schemas";
import { expectedMrConfigId, expectedReportData, isDebugTd, parseTdxQuote, replayRtmr3 } from "@/shared/ai/verify/tdx";
import { recordedAttestation } from "../../../../msw/near-ai";

// A real report recorded from NEAR AI Cloud for z-ai/glm-5.3-flash (tests/fixtures/near-ai).
const { nonce, report } = recordedAttestation();
const gateway = report.gateway_attestation;
const model = (report.model_attestations ?? [])[0];
const statuses = (r: NearReport, n = nonce) => Object.fromEntries(checkReportLocally(r, n).map((c) => [c.id, c.status]));

describe("parseTdxQuote on a recorded NEAR report", () => {
  it("reads a v4 TDX quote whose report data binds the signing address and our nonce", () => {
    const fields = parseTdxQuote(model.intel_quote);
    expect(fields?.version).toBe(4);
    expect(fields?.reportData).toBe(expectedReportData(model.signing_address, nonce));
    expect(fields && isDebugTd(fields)).toBe(false);
  });

  it("matches MRCONFIGID to app_compose and RTMR3 to the replayed event log", () => {
    const fields = parseTdxQuote(gateway.intel_quote);
    expect(fields?.mrConfigId).toBe(expectedMrConfigId(appComposeOf(gateway) ?? ""));
    const replay = replayRtmr3(eventLogOf(gateway) ?? []);
    expect(replay).toEqual({ ok: true, rtmr3: fields?.rtMr3 });
  });

  it("rejects anything that is not a TDX quote", () => {
    expect(parseTdxQuote("00")).toBeNull();
    expect(parseTdxQuote("zz")).toBeNull();
    expect(parseTdxQuote(`0300${model.intel_quote.slice(4)}`)).toBeNull();
  });
});

describe("checkReportLocally", () => {
  it("passes every local check on the gateway (event log as JSON text) and a model candidate (array)", () => {
    const expected = { "tdx-quote": "pass", nonce: "pass", "report-data": "pass", "debug-off": "pass", compose: "pass", rtmr3: "pass" };
    expect(statuses(gateway)).toEqual(expected);
    expect(statuses(model)).toEqual(expected);
  });

  it("fails freshness and binding for another nonce (replay)", () => {
    const other = "11".repeat(32);
    const result = statuses({ ...model, request_nonce: other }, other);
    expect(result.nonce).toBe("pass");
    expect(result["report-data"]).toBe("fail");
    expect(statuses(model, other).nonce).toBe("fail");
  });

  it("fails the binding when the stated signing address is not the one in the quote", () => {
    expect(statuses({ ...model, signing_address: "0x0000000000000000000000000000000000000001" })["report-data"]).toBe("fail");
  });

  it("fails when the measured compose file or an event was changed", () => {
    expect(statuses({ ...model, info: { ...model.info, tcb_info: { app_compose: `${appComposeOf(model)} ` } } }).compose).toBe("fail");
    const events = eventLogOf(model) ?? [];
    const tampered = events.map((event) => (event.event === "compose-hash" ? { ...event, event_payload: "00".repeat(32) } : event));
    expect(statuses({ ...model, event_log: tampered }).rtmr3).toBe("fail");
  });

  it("fails when the HTTP report_data copy disagrees with the quote", () => {
    expect(statuses({ ...gateway, report_data: "00".repeat(64) })["report-data"]).toBe("fail");
  });
});
