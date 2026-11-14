"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Reads the journal and the contract again on the server and re-renders the checks. */
export function RerunAuditButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-busy={pending}
      className="mt-2.5 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-lime text-base font-extrabold text-ink outline-none focus-visible:ring-3 focus-visible:ring-lime/60 disabled:opacity-70 lg:mt-3"
    >
      <RotateCw aria-hidden="true" className={pending ? "size-[18px] animate-spin" : "size-[18px]"} strokeWidth={2.8} />
      {pending ? "Running the audit…" : "Run the audit again"}
    </button>
  );
}
