import { cn } from "cn";
import Link from "next/link";

/** The signed-in account as a pill: lime dot and account id, linking to the account page. */
export function AccountChip({ accountId, href, className }: { accountId: string; href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 max-w-48 items-center gap-2 rounded-full border-2 border-ink bg-paper pr-3 pl-1.5 text-[13px] font-semibold text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <AccountDot />
      <span className="truncate">{accountId}</span>
      <span className="sr-only">: your account</span>
    </Link>
  );
}

export function AccountDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("size-[22px] shrink-0 rounded-full border-2 border-ink bg-lime", className)} />;
}
