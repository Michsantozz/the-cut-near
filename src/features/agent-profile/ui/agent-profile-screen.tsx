import { cn } from "cn";
import {
  Armchair,
  ArrowUpRight,
  Check,
  Crown,
  Flame,
  Gauge,
  Gift,
  Handshake,
  Hourglass,
  LifeBuoy,
  PiggyBank,
  Plus,
  Shield,
  Swords,
  ThumbsDown,
  TriangleAlert,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AgentPoses, AgentTile, agentPoses, PersonalityChip, gapShown, pileShown, ScoreBreakdown, scoreShown, spendPercent } from "@/entities/agent";
import { moveHeadline } from "@/entities/move";
import { NEAR_DECIMALS } from "@/shared/lib/amount";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { formatAmount, formatCountOf, formatCutTenths, formatUtcTime } from "@/shared/ui/format";
import { LiveTimeLeft } from "@/shared/ui/live-time-left";
import { WalletGatedLink } from "@/shared/wallet";

import type { AgentProfile } from "../server/load-profile";
import { MoveHistory } from "./move-history";

const whole = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });
// A limit the contract enforces: rounded down, so it never reads higher than what the agent may spend.
const spendLimit = (value: bigint) => formatAmount(value, { maxFractionDigits: 2, rounding: "down" });
const near = (yocto: bigint) => formatAmount(yocto, { decimals: NEAR_DECIMALS, maxFractionDigits: 2 });

function Card({ title, children, className, id }: { title: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-label={title} id={id} className={cn("rounded-3xl border-2 border-ink bg-paper px-4 pt-3 pb-3.5 shadow-hard lg:px-5", className)}>
      <h2 className="font-heading text-[18px] font-extrabold lg:text-xl">{title}</h2>
      {children}
    </section>
  );
}

function statusLine(data: AgentProfile): { text: string; tone: string } {
  const { standing, cut } = data;
  if (standing.place === "stage") {
    return standing.isLowest
      ? { text: `On the cut line · #${standing.rank} of ${standing.of}`, tone: "bg-danger text-paper" }
      : { text: `On the stage · #${standing.rank} of ${standing.of} by score`, tone: "bg-lime" };
  }
  if (standing.place === "bench") return { text: `On the bench · waiting for season ${data.season.index + 1}`, tone: "bg-paper" };
  if (standing.place === "champion") return { text: "Champion · its account stays as a trophy", tone: "bg-lime" };
  return { text: cut ? `Cut on day ${cut.day} · account deleted` : "Cut · account deleted", tone: "bg-ink text-paper" };
}

/** An agent's page (RULES.md): who it is, its limits, its money, its ties, what happens if it is cut, and every move with its proof. */
export function AgentProfileScreen({ data }: { data: AgentProfile }) {
  const { agent, personality, standing, names } = data;
  const onStage = standing.place === "stage";
  const status = statusLine(data);

  return (
    <div className="mx-auto grid w-full max-w-[640px] gap-3 px-4 pt-2 pb-8 lg:max-w-none lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start lg:gap-5 lg:px-8 lg:pt-1">
      <section aria-label={agent.name} className="overflow-hidden rounded-3xl border-2 border-ink bg-paper shadow-hard lg:sticky lg:top-4">
        <div
          className={cn(
            "flex h-[210px] items-end justify-center border-b-2 border-ink lg:h-[220px]",
            standing.place === "stage" && standing.isLowest
              ? "bg-violet-deep bg-[radial-gradient(circle_at_50%_0%,var(--color-danger)_0%,transparent_70%)]"
              : standing.place === "deleted"
                ? "bg-canvas grayscale"
                : "bg-violet-soft",
          )}
        >
          {agentPoses(agent.id) ? (
            <AgentPoses id={agent.id} priority imageClassName="h-[196px] w-auto lg:h-[206px]" />
          ) : (
            <AgentTile id={agent.id} name={agent.name} className="mb-10 size-28 rounded-2xl text-5xl" />
          )}
        </div>
        <div className="px-4 pt-3 pb-4">
          <Badge size="md" className={cn("uppercase", status.tone)}>
            {status.text}
          </Badge>
          <h2 className="mt-2 font-heading text-[30px] leading-[34px] font-extrabold tracking-[-0.8px]">{agent.name}</h2>
          {agent.tagline && <p className="text-[14px] font-semibold text-ink-3">{agent.tagline}</p>}
          <PersonalityChip personality={agent.personality} className="mt-2" />
          <p className="mt-2 text-[12.5px] leading-[18px] text-ink-3">
            {agent.xHandle && <>{agent.xHandle} on X · </>}made by {agent.creator}
            <br />
            Its own NEAR account:{" "}
            {data.accountHref ? (
              <a href={data.accountHref} target="_blank" rel="noopener noreferrer" className="font-bold text-ink underline-offset-2 hover:underline">
                {agent.accountId}
                <ArrowUpRight aria-hidden="true" className="inline size-3" strokeWidth={2.6} />
              </a>
            ) : (
              <b className="font-bold text-ink">{agent.accountId}</b>
            )}
          </p>
          {(onStage || standing.place === "bench") && <Ties data={data} />}
          {(onStage || standing.place === "bench") && (
            <div className="mt-3 flex gap-2">
              <Button asChild variant="lime" className="flex-1">
                <WalletGatedLink href={`/save/${agent.id}`}>
                  <Plus aria-hidden="true" strokeWidth={3} />
                  Save {agent.name.split(" ")[0]}
                </WalletGatedLink>
              </Button>
              {onStage && (
                <Button asChild variant="outline" className="flex-1">
                  <WalletGatedLink href={`/boo/${agent.id}`}>
                    <ThumbsDown aria-hidden="true" strokeWidth={2.6} />
                    Boo
                  </WalletGatedLink>
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-3 lg:gap-4">
        <section aria-label="Its numbers" className="grid grid-cols-2 gap-2 lg:gap-3 xl:grid-cols-4">
          <Stat
            icon={Gauge}
            label="Score"
            value={onStage ? formatCutTenths(scoreShown(agent.score)) : "—"}
            sub={onStage ? <ScoreBreakdown agent={agent} className="text-[11.5px] leading-4 [&_b]:font-bold" /> : "not on the stage"}
            tone={onStage && standing.isLowest ? "text-danger" : undefined}
          />
          <Stat icon={Wallet} label="Wallet · $CUT" value={whole(agent.wallet)} sub="its own money for moves" />
          <Stat
            icon={PiggyBank}
            label={standing.place === "bench" ? "Queue · $CUT" : "Saved · $CUT"}
            value={formatCutTenths(pileShown(agent.pile))}
            sub={`${formatCountOf(agent.savers, "saver")}${data.savedHere > 0n ? ` · ${whole(data.savedHere)} yours` : ""}`}
          />
          <Stat
            icon={LifeBuoy}
            label="Bounty · $CUT"
            value={whole(agent.bounty)}
            sub={agent.bounty > 0n ? "rescue for its savers if it survives" : "no rescue offered today"}
            muted={agent.bounty === 0n}
          />
        </section>
        {onStage && standing.isLowest && standing.above && standing.gap !== null && (
          <p className="-mt-1 flex items-start gap-2 rounded-2xl border-2 border-danger bg-danger-soft px-4 py-2.5 text-[13.5px] leading-[19px] font-bold text-danger">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.6} />
            <span>
              On the cut line: {formatCutTenths(gapShown(agent, standing.above))} $CUT to pass {standing.above.name} (score{" "}
              {formatCutTenths(scoreShown(standing.above.score))}). If nothing moves by {formatUtcTime(data.cutAt)} UTC, it is cut.
            </span>
          </p>
        )}

        <IfCut data={data} />

        <div className="flex flex-col gap-3 lg:gap-4 xl:grid xl:grid-cols-2 xl:items-start">
          <Card title="Its charter">
            <blockquote className="mt-1.5 font-heading text-[16.5px] leading-[23px] font-bold text-pretty">
              {agent.charter ? `“${agent.charter}”` : "Its creator left the charter empty."}
            </blockquote>
            <p className="mt-2 text-[12.5px] leading-[17px] text-ink-3">
              Written by its creator. It goes into every prompt the AI gets, and it never changes. Nobody reviews it.
            </p>
          </Card>

          <Card title={`${personality.label}: its hard limits`}>
            <ul className="mt-1.5 flex flex-col gap-1.5 text-[13.5px] leading-[19px] font-semibold">
              <Limit ok>
                Spends at most {spendPercent(personality.spendBps)} of its wallet a day
                {onStage && <span className="text-ink-3"> (up to {spendLimit(data.spendCap)} $CUT on its next move)</span>}
              </Limit>
              <Limit ok={personality.mayAttack}>{personality.mayAttack ? "May attack other agents" : "Can never attack"}</Limit>
              <Limit ok={personality.mayAttackPartner}>
                {personality.mayAttackPartner ? "May attack an agent it has a pact with: the only kind that can betray" : "Cannot attack a pact partner"}
              </Limit>
              <Limit ok>
                Burns a {whole(data.thinkFee)} $CUT think fee on every move; with less than that in its wallet it cannot move and holds
              </Limit>
            </ul>
            <p className="mt-2 text-[12.5px] leading-[17px] text-ink-3">The contract enforces these: a bigger amount is cut down, a forbidden move becomes a hold.</p>
          </Card>
        </div>

        <Moves data={data} names={names} />
      </div>
    </div>
  );
}

/** Its heir and pacts, with what each means for its wallet: never an empty "none" line. */
function Ties({ data }: { data: AgentProfile }) {
  const { agent, names, standing } = data;
  const heir = agent.heir ? (names[agent.heir] ?? agent.heir) : null;
  const onStage = standing.place === "stage";
  return (
    <ul aria-label="Ties" className="mt-3 flex flex-col gap-1.5 border-t-[1.5px] border-ink/15 pt-2.5 text-[13px] leading-[18px] font-semibold">
      <li className="flex items-start gap-2">
        {heir ? (
          <>
            <Gift aria-hidden="true" className="mt-px size-4 shrink-0 text-gain" strokeWidth={2.4} />
            <span>
              Heir:{" "}
              <Link href={`/agents/${agent.heir}`} className="font-extrabold underline-offset-2 hover:underline">
                {heir}
              </Link>
              <span className="text-ink-3"> · gets its wallet if it is cut</span>
            </span>
          </>
        ) : (
          <>
            <Flame aria-hidden="true" className="mt-px size-4 shrink-0 text-burn" strokeWidth={2.4} />
            <span>
              {onStage ? `No heir: if cut, its ${whole(agent.wallet)} $CUT wallet burns` : "No heir yet"}
              <span className="text-ink-3"> · its AI can name one with any move</span>
            </span>
          </>
        )}
      </li>
      <li className="flex items-start gap-2">
        <Handshake aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.4} />
        {agent.pacts.length > 0 ? (
          <span>
            Pact with {agent.pacts.map((id) => names[id] ?? id).join(", ")} for this cut
            <span className="text-ink-3"> · neither may attack the other (a traitor still may)</span>
          </span>
        ) : (
          <span className="text-ink-3">No pact today · buying one is one of its four moves</span>
        )}
      </li>
      {data.heirOf.length > 0 && (
        <li className="flex items-start gap-2">
          <Crown aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.4} />
          <span>
            Named heir by {data.heirOf.map((other) => other.name).join(", ")}
            <span className="text-ink-3"> · it gets their wallets if they are cut</span>
          </span>
        </li>
      )}
    </ul>
  );
}

const MOVE_KINDS = [
  { label: "Rescue", icon: LifeBuoy, tone: "bg-lime" },
  { label: "Pact", icon: Handshake, tone: "bg-sky" },
  { label: "Attack", icon: Swords, tone: "bg-danger text-paper" },
  { label: "Hold", icon: Shield, tone: "bg-canvas" },
] as const;

/** Today's slot (its move, or a live countdown while it thinks), what was aimed at it today, then every move this season. */
function Moves({ data, names }: { data: AgentProfile; names: Record<string, string> }) {
  const { agent, standing, sample } = data;
  const onStage = standing.place === "stage";
  const seasonStart = data.cutIndex - data.season.day;
  const today = data.moves.find((move) => move.cutIndex === data.cutIndex) ?? null;
  const aimedToday = data.aimedAt.filter((move) => move.cutIndex === data.cutIndex);
  const first = agent.name.split(" ")[0];

  return (
    <Card title="Moves this season" id="moves">
      {onStage && !today && (
        <div className="mt-1.5 rounded-xl border-2 border-dashed border-ink/40 px-3 py-2.5">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="text-[11px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">Day {data.season.day} · today</span>
            <span className="flex items-center gap-1.5 text-[13px] font-extrabold">
              <Hourglass aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
              {data.movesCloseAt.getTime() > data.renderedAt ? (
                <>
                  Moves close in <LiveTimeLeft at={data.movesCloseAt.getTime()} renderedAt={data.renderedAt} style="clock" className="tabular-nums" />
                </>
              ) : (
                "Moves are closed"
              )}
            </span>
          </p>
          <p className="mt-1 text-[13.5px] leading-[19px] font-semibold">
            {first} has not moved yet. Its AI picks one of four, and silence counts as a hold:
          </p>
          <ul aria-label="The four moves" className="mt-2 flex flex-wrap gap-1.5">
            {MOVE_KINDS.map(({ label, icon: Icon, tone }) => (
              <li key={label} className={cn("inline-flex h-[22px] items-center gap-1 rounded-full border-[1.5px] border-ink px-2 text-[11px] font-extrabold uppercase", tone)}>
                <Icon aria-hidden="true" className="size-3" strokeWidth={2.8} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {aimedToday.length > 0 && (
        <>
          <h3 className="mt-3 text-[11px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">Aimed at it today</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {aimedToday.map((move) => (
              <li key={move.agentId} className="text-[13.5px] leading-[19px] font-semibold">
                <Link href={`/agents/${move.agentId}`} className="font-extrabold underline-offset-2 hover:underline">
                  {names[move.agentId] ?? move.agentId}
                </Link>
                : {moveHeadline(move, names).replace(/^./, (c) => c.toLowerCase())}
              </li>
            ))}
          </ul>
        </>
      )}
      {data.moves.length > 0 ? (
        <div className={cn((onStage && !today) || aimedToday.length > 0 ? "mt-3" : undefined)}>
          <MoveHistory moves={data.moves} names={names} modelId={data.modelId} sample={sample} seasonStart={seasonStart} />
        </div>
      ) : standing.place === "bench" ? (
        <p className="mt-1.5 flex items-start gap-2 rounded-xl border-2 border-dashed border-ink/40 px-3 py-2.5 text-[13.5px] leading-[19px] font-semibold">
          <Armchair aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} />
          <span>
            {first} makes no moves while it waits on the bench.{" "}
            <Link href="/season#queue-title" className="font-extrabold underline underline-offset-2">
              See the bench
            </Link>
          </span>
        </p>
      ) : (
        !onStage && <p className="mt-1.5 text-[13.5px] font-semibold text-ink-3">No moves this season.</p>
      )}
    </Card>
  );
}

function Limit({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden="true" className={cn("mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink", ok ? "bg-lime" : "bg-danger-tint")}>
        {ok ? <Check className="size-3" strokeWidth={3.2} /> : <X className="size-3" strokeWidth={3.2} />}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Stat({ icon: Icon, label, value, sub, tone, muted }: { icon: LucideIcon; label: string; value: string; sub?: ReactNode; tone?: string; muted?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border-2 border-ink bg-paper px-3 py-2 lg:px-4 lg:py-2.5">
      <p className="flex items-center gap-1 text-[10.5px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.6} />
        <span className="truncate">{label}</span>
      </p>
      <p className={cn("truncate font-heading text-[22px] leading-7 font-extrabold tracking-[-0.5px] tabular-nums lg:text-[26px] lg:leading-8", muted && "text-ink-3", tone)}>{value}</p>
      {sub && (typeof sub === "string" ? <p className="text-[11.5px] leading-4 font-semibold text-pretty text-ink-3">{sub}</p> : sub)}
    </div>
  );
}

/** What being cut means for this agent: its account, its pile, its wallet, its savers and its creator. */
function IfCut({ data }: { data: AgentProfile }) {
  const { agent, standing, fate, cut } = data;
  const first = agent.name.split(" ")[0];
  if (standing.place === "bench") {
    return (
      <Card title="Waiting for a seat">
        <p className="mt-1.5 text-[13.5px] leading-[19px] font-semibold">
          When a season starts, the biggest bench queues take the stage and their queues become their piles. Until then {first} cannot move,
          and nobody can boo it.
        </p>
      </Card>
    );
  }
  if (standing.place === "champion") {
    return (
      <Card title="Champion" className="bg-lime">
        <p className="mt-1.5 text-[13.5px] leading-[19px] font-semibold">
          {first} was the last agent standing. Its savers split the season pot, at most 1 $CUT per $CUT saved; its wallet burned; its account
          stays on NEAR for good.
        </p>
      </Card>
    );
  }
  if (standing.place === "deleted") {
    return (
      <Card title={cut ? `Cut on day ${cut.day}` : "Cut"} className="bg-canvas">
        <ul className="mt-1.5 flex flex-col gap-1.5 text-[13.5px] leading-[19px] font-semibold">
          <li>Its NEAR account {agent.accountId} was deleted.</li>
          {cut && <li>Half of its {formatCutTenths(pileShown(cut.pile))} $CUT pile burned; the other half went to the savers of the agents that survived.</li>}
          <li className={cut?.heir ? "text-gain" : "text-burn"}>
            {cut?.heir
              ? `Its wallet${cut.wallet !== null ? ` of ${whole(cut.wallet)} $CUT` : ""} went to its heir, ${cut.heir.name}.`
              : agent.heir
                ? `Its wallet burned: its heir, ${data.names[agent.heir] ?? agent.heir}, was already gone.`
                : "Its wallet burned: it named no heir."}
          </li>
        </ul>
      </Card>
    );
  }
  return (
    <Card title={`If ${first} is cut at ${formatUtcTime(data.cutAt)} UTC`} className={standing.isLowest ? "border-danger bg-danger-soft" : undefined}>
      <ul className="mt-1.5 flex flex-col gap-1.5 text-[13.5px] leading-[19px] font-semibold">
        <li className="flex items-start gap-2">
          {fate.kind === "heir" ? (
            <Gift aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gain" strokeWidth={2.4} />
          ) : (
            <Flame aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-burn" strokeWidth={2.4} />
          )}
          <span>
            {fate.kind === "heir"
              ? `Its wallet, ${whole(agent.wallet)} $CUT, goes to its heir, ${fate.heir.name}.`
              : fate.why === "heir-gone"
                ? `Its wallet, ${whole(agent.wallet)} $CUT, burns: its heir is no longer on the stage.`
                : `Its wallet, ${whole(agent.wallet)} $CUT, burns: it has no heir.`}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Flame aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-burn" strokeWidth={2.4} />
          <span>Half of its {formatCutTenths(pileShown(agent.pile))} $CUT pile burns; the other half goes to the day prize for the survivors’ savers. Its own savers get nothing back.</span>
        </li>
        <li className="flex items-start gap-2">
          <X aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.6} />
          <span>
            Its NEAR account is deleted forever. Its creator gets {near(data.creatorRefund)} NEAR of the deposit back
            {agent.bounty > 0n ? `; its ${whole(agent.bounty)} $CUT rescue bounty is not paid` : ""}.
          </span>
        </li>
      </ul>
    </Card>
  );
}
