"use client";

import { Clock, DollarSign, Gift, TriangleAlert, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { Switch } from "@/shared/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";

import { ALERTS_OFF_COOKIE, CURRENCY_COOKIE, PREF_MAX_AGE, parseCurrency, serializeAlertsOff, type AlertKind, type Currency } from "../model/prefs";
import { SettingIcon } from "./setting-icon";

function saveCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${PREF_MAX_AGE}; samesite=lax`;
}

/** "Show money in" USD or BRL. Kept per browser; amounts stay in USD until there is a BRL rate to convert with. */
export function CurrencyRow({ initial }: { initial: Currency }) {
  const [currency, setCurrency] = useState(initial);
  return (
    <li className="flex min-h-[52px] flex-col justify-center py-1 lg:min-h-[62px]">
      <div className="flex items-center gap-3 lg:gap-3.5">
        <SettingIcon icon={DollarSign} tone="bg-lime" />
        <span className="grow text-[14.5px] font-semibold lg:text-[15px]">Show money in</span>
        <ToggleGroup
          type="single"
          value={currency}
          aria-label="Currency"
          onValueChange={(value) => {
            if (!value) return;
            const next = parseCurrency(value);
            setCurrency(next);
            saveCookie(CURRENCY_COOKIE, next);
          }}
          className="gap-0 rounded-md border-2 border-ink bg-canvas p-[3px]"
        >
          {(["usd", "brl"] as const).map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="h-7 rounded-xs px-3 text-[13px] font-bold hover:bg-transparent data-[state=on]:bg-ink data-[state=on]:text-paper lg:h-[30px] lg:w-[58px] lg:px-0 lg:text-[13.5px]"
            >
              {value.toUpperCase()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {currency === "brl" && (
        <p role="status" className="mt-1.5 text-[12.5px] text-ink-3 lg:text-[13px]">
          No BRL rate yet, so amounts stay in USD for now.
        </p>
      )}
    </li>
  );
}

type Alert = { kind: AlertKind; title: string; sub: string; icon: LucideIcon; tone: string };

/** "Tell me when": the three alerts, each on until switched off. Kept per browser. */
export function AlertSwitches({ initialOff, finalHour }: { initialOff: AlertKind[]; finalHour: string }) {
  const [off, setOff] = useState<AlertKind[]>(initialOff);
  const alerts: Alert[] = [
    { kind: "danger", title: "Your robot is in danger", sub: "When it sits in the bottom two", icon: TriangleAlert, tone: "bg-orange" },
    { kind: "final", title: "Final hour", sub: `Every day at ${finalHour} UTC`, icon: Clock, tone: "bg-[#ffd84d]" },
    { kind: "prize", title: "Prize is ready", sub: "Every day, right after the cut", icon: Gift, tone: "bg-lime" },
  ];
  return (
    <>
      {alerts.map((alert) => (
        <li key={alert.kind} className="flex h-[54px] items-center gap-3 border-t-[1.5px] border-canvas first:border-t-0 lg:h-[66px] lg:gap-3.5">
          <SettingIcon icon={alert.icon} tone={alert.tone} />
          <span className="min-w-0 grow">
            <span className="block text-[14.5px] leading-[18px] font-semibold lg:text-[15px] lg:leading-5">{alert.title}</span>
            <span className="block text-[12.5px] leading-4 text-ink-3 lg:text-[13px] lg:leading-[18px]">{alert.sub}</span>
          </span>
          <Switch
            aria-label={alert.title}
            checked={!off.includes(alert.kind)}
            onCheckedChange={(on) => {
              const next = on ? off.filter((kind) => kind !== alert.kind) : [...off, alert.kind];
              setOff(next);
              saveCookie(ALERTS_OFF_COOKIE, serializeAlertsOff(next));
            }}
            className="lg:w-[52px]"
          />
        </li>
      ))}
    </>
  );
}
