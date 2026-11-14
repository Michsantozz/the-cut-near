import { ArrowUpRight, Code, FlaskConical, Link2 } from "lucide-react";
import { cn } from "cn";

import { sourceHref, type SourceRef } from "../model/desk";

const chip =
  "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-paper px-2.5 py-0.5 text-left text-[12.5px] leading-4 font-bold outline-none [&_svg]:size-3.5 [&_svg]:shrink-0";

const ICONS = { code: Code, test: FlaskConical, chain: Link2 } as const;

/** A file of the repository: a link to it once the repository is public, its path until then. */
export function SourceChip({ refTo, repoUrl, kind = "code", className }: { refTo: SourceRef; repoUrl: string | null; kind?: "code" | "test"; className?: string }) {
  const Icon = ICONS[kind];
  const href = sourceHref(repoUrl, refTo);
  const text = `${refTo.path}${refTo.line ? `:${refTo.line}` : ""}`;
  if (!href) {
    return (
      <span className={cn(chip, "border-dashed border-ink-3 text-ink-2", className)} title={`${refTo.label} · GitHub link soon`}>
        <Icon aria-hidden="true" strokeWidth={2.6} />
        <span className="min-w-0 break-all">{text}</span>
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn(chip, "hover:bg-lime focus-visible:ring-3 focus-visible:ring-ring/50", className)} title={refTo.label}>
      <Icon aria-hidden="true" strokeWidth={2.6} />
      <span className="min-w-0 break-all">{text}</span>
      <ArrowUpRight aria-hidden="true" strokeWidth={2.6} />
    </a>
  );
}

/** A link out of the app (an explorer page) or to a place in it, as a chip. */
export function LinkChip({ href, children, external = false, className }: { href: string; children: React.ReactNode; external?: boolean; className?: string }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={cn(chip, "hover:bg-lime focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <Link2 aria-hidden="true" strokeWidth={2.6} />
      <span className="min-w-0 break-all">{children}</span>
      {external && <ArrowUpRight aria-hidden="true" strokeWidth={2.6} />}
    </a>
  );
}
