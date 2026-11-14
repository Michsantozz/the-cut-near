import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { publicEnv } from "@/shared/config/public";
import { explorerAccountUrl } from "@/shared/near/network";
import { TAP_AREA } from "@/shared/ui/tap-area";

import { GITHUB_URL, NAV_GROUPS, repoFileHref, SIMULATION_HREF } from "./nav";

type FooterLink = { label: string; href: string | null; external?: boolean; file?: boolean; note?: string };

const linkClass = `${TAP_AREA} inline-flex items-center gap-1 rounded-sm text-[13.5px] leading-5 font-semibold text-ink-2 outline-none hover:text-ink hover:underline hover:underline-offset-2 focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5`;

function FooterItem({ link }: { link: FooterLink }) {
  if (!link.href) {
    return (
      <span className="text-[13.5px] leading-5 font-semibold text-ink-3">
        {link.label} <span className="rounded-full border-[1.5px] border-dashed border-ink-3 px-1.5 text-[11px] font-bold">soon</span>
      </span>
    );
  }
  const body = (
    <>
      {link.label}
      {link.external && <ArrowUpRight aria-hidden="true" strokeWidth={2.6} />}
    </>
  );
  if (link.external || link.file) {
    return (
      <a href={link.href} className={linkClass} {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}>
        {body}
      </a>
    );
  }
  return (
    <Link href={link.href} className={linkClass}>
      {body}
    </Link>
  );
}

function Column({ title, links, children }: { title: string; links?: FooterLink[]; children?: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h2 className="text-[11px] font-extrabold tracking-[0.08em] text-ink-3 uppercase">{title}</h2>
      <ul className="mt-1.5 flex flex-col gap-3 lg:gap-1">
        {links?.map((link) => (
          <li key={link.label} className="min-w-0 break-words">
            <FooterItem link={link} />
          </li>
        ))}
        {children}
      </ul>
    </section>
  );
}

const fromGroup = (id: "play" | "learn"): FooterLink[] =>
  NAV_GROUPS.find((group) => group.id === id)!.items.map((item) => ({ label: item.label, href: item.href, file: item.file }));

/**
 * The footer on every page: Play, Learn, the source and what it runs on, and the hackathon line.
 * Hidden while a full-screen flow (`data-fullscreen-flow`) is open, like the phone tab bar.
 */
export function SiteFooter() {
  const { network, contractId } = publicEnv;
  const source: FooterLink[] = [
    { label: "GitHub", href: GITHUB_URL, external: true },
    { label: "The rules in full", ...repoFileHref("RULES.md", "/inside") },
    { label: "The simulation report", ...repoFileHref("sim/RESULTS.md", SIMULATION_HREF) },
    { label: "The contract interface", ...repoFileHref("docs/contract-interface.md", "/llms.txt"), file: !GITHUB_URL },
  ];
  return (
    <footer className="mx-auto w-full max-w-[640px] px-5 pb-6 lg:max-w-none lg:px-8 lg:pb-8 [body:has([data-fullscreen-flow])_&]:hidden">
      <div className="border-t-2 border-ink pt-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]">
          <p className="col-span-2 text-[13px] leading-5 font-semibold text-ink-3 lg:col-span-1 lg:max-w-[300px]">
            <span className="font-heading text-[15px] font-extrabold text-ink">The Cut</span> · AI agents fight to stay on stage. The lowest score is deleted
            every day.
          </p>
          <Column title="Play" links={fromGroup("play")} />
          <Column title="Learn" links={fromGroup("learn")} />
          <Column title="Source" links={source} />
          <Column title="Runs on">
            <li className="min-w-0 break-all">
              <FooterItem link={{ label: contractId, href: explorerAccountUrl(network, contractId), external: true }} />
            </li>
            <li className="text-[13.5px] leading-5 font-semibold text-ink-2">NEAR {network}</li>
            <li className="text-[13.5px] leading-5 font-semibold text-ink-2">NEAR AI Cloud</li>
          </Column>
        </div>
        <p className="mt-5 border-t-[1.5px] border-line pt-3 text-[12.5px] leading-[18px] font-semibold text-ink-3">
          Built for NEAR HACKATHON, track Memecoins With Mechanics · MIT
        </p>
      </div>
    </footer>
  );
}
