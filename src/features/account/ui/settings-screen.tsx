import { cn } from "cn";
import { ChevronRight, Clock, FlaskConical, Globe, Bell, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CopyButton } from "@/shared/ui/copy-button";
import { ConnectButton, DisconnectButton, type NearNetwork } from "@/shared/wallet";

import { RisksDialog } from "./risks-dialog";

type Props = { accountId: string | null; network: NearNetwork; cutTime: string };

/** Settings: the connected wallet, display, history and the fine print. On testnet, the way into test mode. */
export function SettingsScreen({ accountId, network, cutTime }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:max-w-none lg:gap-5 lg:px-8 lg:pt-1 lg:pb-8">
      <p aria-hidden="true" className="text-center font-heading text-xl font-extrabold lg:hidden">
        Account
      </p>
      <AccountCard accountId={accountId} network={network} />
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-3 lg:gap-5">
          <Group title="Display">
            <Row icon={<Globe aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />} tone="bg-pink" label="Language" value="English" />
          </Group>
          <Group title="History">
            <Row icon={<Clock aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />} tone="bg-sky" label="Activity" href="/activity" />
            <Row icon={<Bell aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />} tone="bg-[#ffd84d]" label="Notifications" href="/notifications" />
          </Group>
        </div>
        <div className="flex flex-col gap-3 lg:gap-5">
          {network === "testnet" && (
            <Group title="Test mode">
              <Row
                icon={<FlaskConical aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />}
                tone="bg-lime"
                label="The 5-minute tour"
                sub="Testnet · nothing here is real money"
                href="/test"
              />
            </Group>
          )}
          <section aria-labelledby="fine-print-title">
            <h2 id="fine-print-title" className="mb-2 ml-1 text-xs font-extrabold tracking-[0.06em] text-ink-3 uppercase">
              The fine print
            </h2>
            <RisksDialog time={cutTime} className="h-[46px] w-full rounded-2xl" />
          </section>
          {accountId && (
            <div className="lg:hidden">
              <DisconnectButton size="xl" className="h-[50px] w-full rounded-2xl text-base">
                <LogOut aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />
                Disconnect wallet
              </DisconnectButton>
            </div>
          )}
        </div>
      </div>
      <p className="text-center text-[13px] text-ink-3">The Cut 0.1 · on NEAR · rules locked in one contract</p>
    </div>
  );
}

function AccountCard({ accountId, network }: { accountId: string | null; network: NearNetwork }) {
  const where = network === "mainnet" ? "on NEAR" : "on NEAR testnet";
  return (
    <section aria-label="Your wallet" className="flex items-center gap-3.5 rounded-3xl border-2 border-ink bg-lime px-4 py-4 shadow-hard lg:gap-5 lg:px-6 lg:py-5">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper font-heading text-2xl font-extrabold lg:size-16 lg:text-[26px]">
        {accountId ? accountId.charAt(0).toUpperCase() : "?"}
      </span>
      <div className="min-w-0 grow">
        <h2 className="truncate font-heading text-[22px] leading-7 font-extrabold tracking-[-0.6px] lg:text-[30px] lg:leading-9">{accountId ?? "No wallet connected"}</h2>
        <p className="text-sm font-semibold lg:text-[15px]">{accountId ? `Your wallet · ${where}` : "Looking needs no wallet. Connecting never moves money."}</p>
      </div>
      {accountId ? (
        <div className="flex shrink-0 items-center gap-2.5">
          <CopyButton text={accountId} icon label="Copy address" variant="outline" size="lg" className="hidden h-[46px] rounded-2xl lg:inline-flex" />
          <CopyButton text={accountId} iconOnly label="Copy address" variant="outline" size="icon" className="size-11 rounded-xl lg:hidden" />
          <DisconnectButton size="lg" className="hidden h-[46px] rounded-2xl lg:inline-flex">
            <LogOut aria-hidden="true" className="size-4" strokeWidth={2.6} />
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 ml-1 text-xs font-extrabold tracking-[0.06em] text-ink-3 uppercase">{title}</h2>
      <ul className="rounded-3xl border-2 border-ink bg-paper px-4 shadow-hard lg:px-[18px]">{children}</ul>
    </section>
  );
}

function Row({ icon, tone, label, sub, value, href }: { icon: ReactNode; tone: string; label: string; sub?: string; value?: string; href?: string }) {
  const body = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl border-2 border-ink", tone)}>{icon}</span>
      <span className="min-w-0 grow">
        <span className="block text-base font-extrabold">{label}</span>
        {sub && <span className="block text-[13px] text-ink-3">{sub}</span>}
      </span>
      {value && <span className="text-[15px] text-ink-3">{value}</span>}
      {href && <ChevronRight aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.8} />}
    </>
  );
  return (
    <li className="border-t-[1.5px] border-canvas first:border-t-0">
      {href ? (
        <Link href={href} className="flex min-h-[62px] items-center gap-3.5 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {body}
        </Link>
      ) : (
        <div className="flex min-h-[62px] items-center gap-3.5 py-3">{body}</div>
      )}
    </li>
  );
}
