import { cn } from "cn";
import { ShieldCheck } from "lucide-react";

import { proofBadge } from "../model/screen";
import type { DirectorLineView } from "../model/view";

const TONE = {
  verified: "bg-lime",
  signed: "bg-paper",
  sample: "bg-canvas text-ink-3",
  failed: "bg-danger-tint",
} as const;

/** The proof status of a line as a pill that opens its proof bundle (JSON with every check). */
export function ProofBadge({ line, className }: { line: Pick<DirectorLineView, "proof">; className?: string }) {
  const badge = proofBadge(line.proof.status);
  return (
    <a
      href={line.proof.proofUrl}
      target="_blank"
      rel="noopener"
      aria-label={`${badge.label}: open the proof of this line`}
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full border-2 border-ink px-2.5 text-[11.5px] font-extrabold whitespace-nowrap text-ink outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
        TONE[badge.tone],
        className,
      )}
    >
      <ShieldCheck aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
      {badge.label}
    </a>
  );
}
