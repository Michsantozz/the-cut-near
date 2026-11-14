// The viewer's display and alert preferences (Account.dc.html "Show money in" and "Tell me when").
// They live in cookies on this browser: there is no account backend and no push service yet.

export const CURRENCY_COOKIE = "cut_currency";
export const ALERTS_OFF_COOKIE = "cut_alerts_off";
/** A year, in seconds. */
export const PREF_MAX_AGE = 31_536_000;

export const CURRENCIES = ["usd", "brl"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ALERT_KINDS = ["danger", "final", "prize"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** USD unless the cookie says BRL. */
export function parseCurrency(value: string | undefined): Currency {
  return value === "brl" ? "brl" : "usd";
}

/** Alerts the viewer switched off. Every alert is on until switched off; unknown names are ignored. */
export function parseAlertsOff(value: string | undefined): AlertKind[] {
  if (!value) return [];
  const names = new Set(value.split(","));
  return ALERT_KINDS.filter((kind) => names.has(kind));
}

export function serializeAlertsOff(off: readonly AlertKind[]): string {
  return ALERT_KINDS.filter((kind) => off.includes(kind)).join(",");
}

/** "17:00" for a cut at "18:00": the final hour starts an hour before the cut. */
export function finalHourStart(cutAt: Date): Date {
  return new Date(cutAt.getTime() - 3_600_000);
}
