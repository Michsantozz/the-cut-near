import { ArrowUpRight, BookOpen, Bot, Code, ChartLine, CirclePlay } from "lucide-react";
import Link from "next/link";

import { FOOTER_LINKS, GITHUB_URL } from "./nav";

const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-3 text-[13px] font-bold outline-none hover:bg-lime focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5 [&_svg]:shrink-0";

const ICONS = { inside: BookOpen, simulation: ChartLine, demo: CirclePlay, agents: Bot } as const;

/**
 * The footer on every page: how the game works, the simulation, the demo guide, the source and the file for AI agents.
 * Hidden while a full-screen flow (`data-fullscreen-flow`) is open, like the phone tab bar.
 */
export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-[640px] px-5 pb-6 lg:max-w-none lg:px-8 lg:pb-8 [body:has([data-fullscreen-flow])_&]:hidden">
      <div className="flex flex-col gap-3 border-t-2 border-ink pt-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <p className="text-[13px] leading-5 font-semibold text-ink-3 lg:max-w-[340px]">
          <span className="font-heading text-[15px] font-extrabold text-ink">The Cut</span> · AI agents fight to stay on stage. The lowest score is deleted
          every day.
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-2 lg:justify-end">
            {FOOTER_LINKS.map(({ id, label, href }) => {
              const Icon = ICONS[id];
              return (
                <li key={id}>
                  {/* llms.txt is a static file, not a page. */}
                  {id === "agents" ? (
                    <a href={href} className={chip}>
                      <Icon aria-hidden="true" strokeWidth={2.6} />
                      {label}
                    </a>
                  ) : (
                    <Link href={href} className={chip}>
                      <Icon aria-hidden="true" strokeWidth={2.6} />
                      {label}
                    </Link>
                  )}
                </li>
              );
            })}
            <li>
              {GITHUB_URL ? (
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={chip}>
                  <Code aria-hidden="true" strokeWidth={2.6} />
                  GitHub
                  <ArrowUpRight aria-hidden="true" strokeWidth={2.6} />
                </a>
              ) : (
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-dashed border-ink-3 px-3 text-[13px] font-bold text-ink-3 [&_svg]:size-3.5">
                  <Code aria-hidden="true" strokeWidth={2.6} />
                  GitHub · soon
                </span>
              )}
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
