import { ChevronDown } from "lucide-react";
import { cn } from "cn";

import { WalletGatedLink } from "@/shared/wallet";

import { NAV_GROUPS, type NavItem } from "./nav";
import { NavLink } from "./nav-link";

const item =
  "flex min-h-10 items-center gap-2.5 rounded-lg border-2 border-transparent px-2.5 py-1.5 text-[15px] font-semibold text-ink-2 outline-none hover:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:border-ink aria-[current=page]:bg-lime aria-[current=page]:font-extrabold aria-[current=page]:text-ink";

function ItemBody({ item: { label, icon: Icon, description } }: { item: NavItem }) {
  return (
    <>
      <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={2.4} />
      <span className="min-w-0">
        <span className="block leading-5">{label}</span>
        {description && <span className="block text-[12px] leading-4 font-medium text-ink-3">{description}</span>}
      </span>
    </>
  );
}

function ItemLink({ item: navItem }: { item: NavItem }) {
  if (navItem.file) {
    return (
      <a href={navItem.href} className={item}>
        <ItemBody item={navItem} />
      </a>
    );
  }
  if (navItem.gated) {
    return (
      <WalletGatedLink href={navItem.href} className={item}>
        <ItemBody item={navItem} />
      </WalletGatedLink>
    );
  }
  return (
    <NavLink href={navItem.href} className={item}>
      <ItemBody item={navItem} />
    </NavLink>
  );
}

/**
 * Every place of the app in four groups: Play, Learn, Proof, and More (with one line each, folded on the laptop).
 * Used by the laptop side menu and the phone menu.
 */
export function NavGroups({ foldMore = false, className }: { foldMore?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      {NAV_GROUPS.map((group) => {
        const list = (
          <ul className="mt-1 flex flex-col gap-0.5">
            {group.items.map((navItem) => (
              <li key={navItem.href}>
                <ItemLink item={navItem} />
              </li>
            ))}
          </ul>
        );
        const heading = "px-2.5 text-[11px] font-extrabold tracking-[0.08em] text-ink-3 uppercase";
        if (group.id === "more" && foldMore) {
          return (
            <details key={group.id} className="group/more">
              <summary className={cn(heading, "flex cursor-pointer list-none items-center justify-between rounded-md py-1 outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden")}>
                {group.label}
                <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open/more:rotate-180" strokeWidth={2.6} />
              </summary>
              {list}
            </details>
          );
        }
        return (
          <section key={group.id} aria-label={group.label}>
            <h2 className={heading}>{group.label}</h2>
            {list}
          </section>
        );
      })}
    </div>
  );
}
