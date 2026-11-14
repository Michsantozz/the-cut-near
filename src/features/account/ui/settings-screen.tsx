import { cn } from "cn";
import { Bell, ChevronRight, Clock, FileText, Globe, Lock, LogOut, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CopyButton } from "@/shared/ui/copy-button";
import { ConnectButton, DisconnectButton, type NearNetwork } from "@/shared/wallet";

import type { AlertKind, Currency } from "../model/prefs";
import { AlertSwitches, CurrencyRow } from "./preferences";
import { RisksDialog } from "./risks-dialog";
import { SettingIcon } from "./setting-icon";

type Props = {
  accountId: string | null;
  network: NearNetwork;
  cutTime: string;
  /** When the "Final hour" alert fires, one hour before the cut ("17:00"). */
  finalHour: string;
  prefs: { currency: Currency; alertsOff: AlertKind[] };
};

/**
 * Settings (Account.dc.html, DeskAccount.dc.html): the wallet, money and language, the alerts, history and the fine print.
 * Phone: one column in the design's order. Laptop: display and history on the left, alerts and the fine print on the right.
 */
export function SettingsScreen({ accountId, network, cutTime, finalHour, prefs }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3.5 px-5 pt-3 pb-6 lg:max-w-none lg:gap-6 lg:px-8 lg:pt-1 lg:pb-7">
      <p aria-hidden="true" className="text-center font-heading text-xl font-extrabold lg:hidden">
        Account
      </p>
      <AccountCard accountId={accountId} network={network} />
      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="contents lg:flex lg:flex-col lg:gap-[22px]">
          <Group title="Display" className="order-1 lg:order-none">
            <CurrencyRow initial={prefs.currency} />
            <li className="flex h-[50px] items-center gap-3 border-t-[1.5px] border-canvas lg:h-[62px] lg:gap-3.5">
              <SettingIcon icon={Globe} tone="bg-pink" />
              <span className="grow text-[14.5px] font-semibold lg:text-[15px]">Language</span>
              <span className="flex items-center gap-1 text-sm text-ink-3 lg:gap-1.5 lg:text-[14.5px]">
                English
                <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2.6} />
              </span>
            </li>
          </Group>
          <Group title="History" className="order-3 lg:order-none" listClassName="py-0 lg:py-1">
            <LinkRow icon={Clock} tone="bg-sky" label="Activity" href="/activity" />
            <LinkRow icon={Bell} tone="bg-[#ffd84d]" label="Notifications" href="/notifications" />
          </Group>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-[22px]">
          <Group title="Tell me when" showTitle className="order-2 lg:order-none">
            <AlertSwitches initialOff={prefs.alertsOff} finalHour={finalHour} />
          </Group>
          <section aria-labelledby="fine-print-title" className="order-4 lg:order-none">
            <h2 id="fine-print-title" className="sr-only lg:not-sr-only lg:mb-2 lg:ml-1 lg:block lg:text-xs lg:font-extrabold lg:tracking-[0.05em] lg:text-ink-3 lg:uppercase">
              The fine print
            </h2>
            <div className="flex gap-2 lg:gap-2.5">
              <RisksDialog time={cutTime} className={cn(LEGAL_BUTTON, "bg-paper lg:bg-danger-tint")} />
              <Link href="/terms" className={cn(LEGAL_BUTTON, "bg-paper")}>
                <FileText aria-hidden="true" className="size-3.5 lg:size-[15px]" strokeWidth={2.6} />
                Terms
              </Link>
              <Link href="/privacy" className={cn(LEGAL_BUTTON, "bg-paper")}>
                <Lock aria-hidden="true" className="size-3.5 lg:size-[15px]" strokeWidth={2.6} />
                Privacy
              </Link>
            </div>
          </section>
          {accountId && (
            <div className="order-5 lg:hidden">
              <DisconnectButton className="h-12 w-full rounded-xl text-[15px] font-bold">
                <LogOut aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />
                Disconnect wallet
              </DisconnectButton>
            </div>
          )}
        </div>
      </div>
      <p className="-mt-1 text-center text-xs text-ink-3 lg:mt-0 lg:text-[12.5px]">The Cut 0.1 · on NEAR · rules locked in one contract</p>
    </div>
  );
}

// Risks, Terms and Privacy side by side: 40px on the phone, 46px on the laptop.
const LEGAL_BUTTON =
  "inline-flex h-10 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 rounded-md border-2 border-ink px-2 text-[13px] font-bold text-ink outline-none hover:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-[46px] lg:gap-[7px] lg:rounded-lg lg:text-sm [&_svg]:size-3.5 lg:[&_svg]:size-[15px]";

function AccountCard({ accountId, network }: { accountId: string | null; network: NearNetwork }) {
  const where = network === "mainnet" ? "on NEAR" : "on NEAR testnet";
  return (
    <section aria-label="Your wallet" className="flex items-center gap-3 rounded-3xl border-2 border-ink bg-lime p-3.5 shadow-hard lg:gap-[18px] lg:px-6 lg:py-5">
      <span className="flex size-[52px] shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper font-heading text-[22px] font-extrabold lg:size-16 lg:text-[28px]">
        {accountId ? accountId.charAt(0).toUpperCase() : "?"}
      </span>
      <div className="min-w-0 grow">
        <h2 className="truncate font-heading text-xl leading-[23px] font-extrabold lg:text-[28px] lg:leading-8 lg:tracking-[-0.6px]">{accountId ?? "No wallet connected"}</h2>
        <p className="text-[13px] font-medium lg:mt-0.5 lg:text-[14.5px]">{accountId ? `Your wallet · ${where}` : "Looking needs no wallet. Connecting never moves money."}</p>
      </div>
      {accountId ? (
        <div className="flex shrink-0 items-center gap-2.5">
          <CopyButton text={accountId} icon label="Copy address" variant="outline" className="hidden h-[46px] rounded-xl px-[18px] text-[15px] lg:inline-flex [&_svg]:size-[17px]" />
          <CopyButton text={accountId} iconOnly label="Copy address" variant="outline" size="icon" className="size-10 rounded-md lg:hidden [&_svg]:size-[18px]" />
          <DisconnectButton className="hidden h-[46px] rounded-xl px-[18px] text-[15px] lg:inline-flex">
            <LogOut aria-hidden="true" className="size-[17px]" strokeWidth={2.6} />
            Disconnect wallet
          </DisconnectButton>
        </div>
      ) : (
        <ConnectButton size="lg" className="shrink-0 rounded-2xl">
          Connect
        </ConnectButton>
      )}
    </section>
  );
}

/** A white card of rows. The phone labels only "Tell me when"; the laptop labels every group. */
function Group({
  title,
  showTitle = false,
  className,
  listClassName,
  children,
}: {
  title: string;
  showTitle?: boolean;
  className?: string;
  listClassName?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={className}>
      <h2
        aria-hidden="true"
        className={cn(
          "mb-1.5 ml-1 text-xs font-bold tracking-[0.04em] text-ink-3 uppercase lg:mb-2 lg:font-extrabold lg:tracking-[0.05em]",
          !showTitle && "hidden lg:block",
        )}
      >
        {title}
      </h2>
      <ul className={cn("rounded-2xl border-2 border-ink bg-paper px-3.5 py-1 lg:rounded-3xl lg:px-[18px] lg:shadow-hard", listClassName)}>{children}</ul>
    </section>
  );
}

function LinkRow({ icon, tone, label, href }: { icon: LucideIcon; tone: string; label: string; href: string }) {
  return (
    <li className="border-t-[1.5px] border-canvas first:border-t-0">
      <Link href={href} className="flex h-[54px] items-center gap-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-[62px] lg:gap-3.5">
        <SettingIcon icon={icon} tone={tone} />
        <span className="grow text-[14.5px] font-semibold lg:text-[15px]">{label}</span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-3" strokeWidth={2.6} />
      </Link>
    </li>
  );
}
