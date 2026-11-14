"use client";

import { cn } from "cn";
import { ChevronLeft, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, type ReactNode } from "react";

const CLOSE_HREF = "/";

type Nav = { kind: "close"; href?: string } | { kind: "back"; onClick: () => void; label: string };

/**
 * A trade step. Phone: a full page with a square back/close button and a centered title.
 * Laptop: a dialog over the dimmed lineup (the page renders the lineup behind it); Escape closes it.
 */
export function TradeFrame({
  title,
  icon: Icon,
  iconTile = "bg-blue text-paper",
  nav,
  tone = "paper",
  hideHeader = false,
  wide = false,
  bareOnDesk = false,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  /** Colors of the laptop's icon tile. */
  iconTile?: string;
  nav: Nav;
  tone?: "paper" | "lime";
  /** Status steps (pending, done, failed) have no header on the phone. */
  hideHeader?: boolean;
  wide?: boolean;
  /** The laptop dialog draws its own header (Save a robot). */
  bareOnDesk?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !window.matchMedia("(min-width: 64rem)").matches) return;
      if (nav.kind === "back") nav.onClick();
      else router.push(nav.href ?? CLOSE_HREF);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, router]);

  return (
    // `data-fullscreen-flow` hides the phone tab bar: on the phone a flow takes the whole screen, as in the design.
    <div data-fullscreen-flow className={cn("min-h-dvh lg:fixed lg:inset-0 lg:z-50 lg:flex lg:min-h-0 lg:items-center lg:justify-center lg:bg-scrim lg:p-8", tone === "lime" && "bg-lime lg:bg-scrim")}>
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        className={cn(
          "relative mx-auto flex min-h-[inherit] w-full max-w-[640px] flex-col px-5 pt-[18px] pb-4 lg:max-h-full lg:min-h-0 lg:overflow-y-auto lg:rounded-[28px] lg:border-2 lg:border-ink lg:px-[30px] lg:pt-[26px] lg:pb-[30px] lg:shadow-hard-lg",
          wide ? "lg:w-[1080px] lg:max-w-[calc(100vw-4rem)]" : "lg:w-[936px] lg:max-w-[calc(100vw-4rem)]",
          tone === "lime" ? "lg:bg-lime" : "lg:bg-paper",
        )}
      >
        <header className={cn("flex items-center justify-between lg:mb-[18px] lg:justify-start lg:gap-3", hideHeader && "hidden", bareOnDesk && "lg:hidden")}>
          <NavButton nav={nav} className={cn(nav.kind === "close" && "lg:hidden")} />
          {Icon && (
            <span aria-hidden="true" className={cn("hidden size-10 items-center justify-center rounded-md border-2 border-ink lg:flex", iconTile)}>
              <Icon className="size-5" strokeWidth={2.8} />
            </span>
          )}
          <h1 id={titleId} className="font-heading text-xl font-extrabold lg:text-[30px] lg:leading-9 lg:tracking-[-0.8px]">
            {title}
          </h1>
          <span aria-hidden="true" className="w-11 lg:hidden" />
          {nav.kind === "close" && <NavButton nav={nav} className="hidden lg:ml-auto lg:flex" />}
        </header>
        {hideHeader && (
          <h1 id={titleId} className="sr-only">
            {title}
          </h1>
        )}
        {hideHeader && nav.kind === "close" && tone !== "lime" && <NavButton nav={nav} className="absolute top-[26px] right-[30px] hidden lg:flex" />}
        {children}
      </section>
    </div>
  );
}

function NavButton({ nav, className }: { nav: Nav; className?: string }) {
  const frame = cn(
    "flex size-11 shrink-0 items-center justify-center rounded-[14px] border-2 border-ink bg-paper shadow-hard-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:size-[42px] lg:rounded-[13px] lg:shadow-none",
    className,
  );
  if (nav.kind === "back") {
    return (
      <button type="button" onClick={nav.onClick} aria-label={nav.label} className={frame}>
        <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2.6} />
      </button>
    );
  }
  return (
    <Link href={nav.href ?? CLOSE_HREF} aria-label="Close" className={frame}>
      <X aria-hidden="true" className="size-5" strokeWidth={2.6} />
    </Link>
  );
}

/** A label/value line in a summary card. */
export function Row({ label, value, strong = true }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px] text-[14.5px] lg:border-t-[1.5px] lg:border-canvas lg:py-[7px] lg:first:border-t-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className={cn("text-right whitespace-nowrap", strong ? "font-bold" : "font-semibold")}>{value}</dd>
    </div>
  );
}

/** Small uppercase label above a field. */
export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="hidden text-[12.5px] font-extrabold tracking-[0.05em] text-ink-3 uppercase lg:block">
      {children}
    </label>
  );
}
