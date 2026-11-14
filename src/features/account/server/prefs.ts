import "server-only";

import { cookies } from "next/headers";

import { ALERTS_OFF_COOKIE, CURRENCY_COOKIE, parseAlertsOff, parseCurrency, type AlertKind, type Currency } from "../model/prefs";

export type ViewerPrefs = { currency: Currency; alertsOff: AlertKind[] };

/** The viewer's preferences from this browser's cookies. Reads the request: render at request time. */
export async function getViewerPrefs(): Promise<ViewerPrefs> {
  const jar = await cookies();
  return { currency: parseCurrency(jar.get(CURRENCY_COOKIE)?.value), alertsOff: parseAlertsOff(jar.get(ALERTS_OFF_COOKIE)?.value) };
}
