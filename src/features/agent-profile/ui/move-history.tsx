import { BadgeCheck } from "lucide-react";

import { moveAnchor, MoveCard, shortHex, signedText, type Move } from "@/entities/move";
import { formatUtcDate, formatUtcTime } from "@/shared/ui/format";

/** One move's proof: the exact text the model's TEE key signed, the key, and who relayed it. */
function Proof({ move, modelId, sample }: { move: Move; modelId: string; sample: boolean }) {
  const rows: [string, string][] = [
    ["Signed text", signedText(move, modelId)],
    ["Signer key", move.signer],
    ["Chat id", move.chatId],
    ["Relayed by", `${move.submittedBy} · ${formatUtcDate(move.submittedAt)}, ${formatUtcTime(move.submittedAt)} UTC`],
  ];
  return (
    <div className="mt-1.5 rounded-lg border-2 border-dashed border-ink/40 bg-canvas px-2.5 py-2">
      <p className="flex items-center gap-1 text-[11px] font-extrabold tracking-[0.04em] uppercase">
        <BadgeCheck aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
        {sample ? "Sample proof · made-up hashes, nothing was signed" : "Proof · checked by the contract before it took the move"}
      </p>
      <dl className="mt-1 grid gap-0.5 text-[11.5px] leading-[16px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 gap-2">
            <dt className="w-[76px] shrink-0 font-bold text-ink-3">{label}</dt>
            <dd className="min-w-0 font-semibold break-all" title={value}>
              {label === "Signed text" ? `${modelId}:${shortHex(move.requestSha256, 10, 6)}:${shortHex(move.responseSha256, 10, 6)}` : label === "Signer key" ? shortHex(value, 10, 6) : value}
            </dd>
          </div>
        ))}
      </dl>
      {!sample && (
        <p className="mt-1 text-[11px] leading-[15px] text-ink-3">
          The signed text joins the model id with the SHA-256 of the exact request and of the exact answer. The contract rebuilt the request
          itself and ran ed25519_verify with the signer key; a relay that changed one byte would have failed.
        </p>
      )}
    </div>
  );
}

/** The agent's moves this season, newest first, each with its reason and its proof. */
export function MoveHistory({ moves, names, modelId, sample, seasonStart }: { moves: Move[]; names: Record<string, string>; modelId: string; sample: boolean; seasonStart: number }) {
  if (moves.length === 0) return <p className="mt-1.5 text-[13.5px] font-semibold text-ink-3">No moves yet this season.</p>;
  return (
    <ol className="mt-1.5 flex flex-col gap-3">
      {moves.map((move) => (
        <li key={`${move.cutIndex}-${move.agentId}`} id={moveAnchor(move)} className="scroll-mt-24">
          <p className="mb-1 text-[11px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">
            Day {move.cutIndex - seasonStart} · for cut #{move.cutIndex}
          </p>
          <MoveCard move={move} names={names} sample={sample} />
          <Proof move={move} modelId={modelId} sample={sample} />
        </li>
      ))}
    </ol>
  );
}
