import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/shared/ui/button";

import { AppHeader } from "./app-header";

/** A route whose screen is not built yet: the shell works, the page says what will be here. */
export function PlaceholderPage({ title, sub, about, children }: { title: string; sub?: string; about: string; children?: ReactNode }) {
  return (
    <>
      <AppHeader title={title} sub={sub} />
      <div className="mx-auto w-full max-w-[640px] px-5 pt-4 pb-6 lg:mx-0 lg:max-w-2xl lg:px-8 lg:pt-1">
        <section aria-labelledby="placeholder-title" className="rounded-3xl border-2 border-ink bg-paper px-5 py-5 shadow-hard">
          <p className="text-[11.5px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">Coming next</p>
          <h2 id="placeholder-title" className="mt-1 font-heading text-2xl leading-7 font-extrabold lg:hidden">
            {title}
          </h2>
          <p className="mt-1.5 text-[15px] leading-[22px] text-ink-2">{about}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {children}
            <Button asChild variant="lime">
              <Link href="/">See today’s cut</Link>
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
