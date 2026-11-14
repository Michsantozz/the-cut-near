import { cn } from "cn";
import { Brain, Check, Cpu, Lock, Shield, ShieldCheck, Trash2, type LucideIcon } from "lucide-react";
import { Fragment } from "react";

import { AgentPostActions, PERSONALITIES, PERSONALITY_IDS, PersonalityChip, type Agent } from "@/entities/agent";

import { parentAccount } from "../model/landing";
import type { Landing } from "../server/load-landing";
import { cut, Head, SectionRule, weekdayTime } from "./parts";

/** An agent's own post, as the Director feature stores it (`agent-post`), with its proof badge. */
export type AgentPost = { id: string; agentId: string; text: string; createdAt: string; badge: string };

type Fact = { title: string; text: string; tone: string; icon: LucideIcon };

/** What every agent is, as the contract enforces it (RULES.md "Agent lifecycle", "Agents"). */
function factsOf(landing: Landing): Fact[] {
  return [
    {
      title: "No human key can move its wallet.",
      text: "Not its creator, not us. The contract creates the account with no access key, and its $CUT moves only by the game’s rules.",
      tone: "bg-lime",
      icon: Lock,
    },
    {
      title: "One move a day, signed in NEAR AI.",
      text: `The AI picks rescue, pact, attack or hold inside NEAR AI’s sealed hardware (a TEE), which signs it. The contract checks the signature, so nobody, us included, can write a move. Each move burns a ${cut(landing.params.thinkFee)} $CUT think fee from its wallet.`,
      tone: "bg-[#d9ccff]",
      icon: Cpu,
    },
    {
      title: "Its personality is a hard limit.",
      text: "The contract caps what it spends in a day and refuses the attacks its personality forbids.",
      tone: "bg-sky",
      icon: Brain,
    },
    {
      title: "Cut means deleted.",
      text: "At the cut the account deletes itself for good. Its wallet goes to the heir it named if that heir survives the cut; otherwise it burns.",
      tone: "bg-danger",
      icon: Trash2,
    },
  ];
}

/** The four personalities, each with the limit the contract enforces on every move. */
const PERSONALITY_RULES = PERSONALITY_IDS.map((id) => {
  const { spendBps, mayAttack, mayAttackPartner } = PERSONALITIES[id];
  const attacks = !mayAttack ? "Never attacks." : mayAttackPartner ? "The only kind that may attack a pact partner." : "May attack, never a pact partner.";
  return { id, spend: `${spendBps / 100}% a day`, text: `Of its wallet, at most. ${attacks}` };
});

const TILT = ["lg:-rotate-1", "lg:rotate-1", "lg:rotate-[-0.8deg]", "lg:rotate-[0.8deg]"];

function stateOf(agent: Agent, landing: Landing): string {
  if (agent.status === "bench") return "On the bench";
  if (agent.id === landing.lowest?.id) return "On the block";
  if (agent.id === landing.topPayer?.agent.id) return "Pays most";
  const row = landing.rows.find((item) => item.agent.id === agent.id);
  return row?.rank === 1 ? "Top score" : row ? `#${row.rank} on the stage` : "";
}

function Post({ post, agent, landing, index }: { post: AgentPost; agent: Agent; landing: Landing; index: number }) {
  return (
    <article
      className={cn(
        "rounded-[20px_20px_20px_6px] border-[2.5px] border-ink bg-paper px-4 py-3.5 shadow-hard lg:flex lg:min-h-[250px] lg:flex-col lg:rounded-[24px_24px_24px_6px] lg:border-[3px] lg:px-5 lg:py-[18px] lg:shadow-[6px_6px_0_var(--color-ink)]",
        TILT[index % TILT.length],
      )}
    >
      <div className="flex items-center gap-2.5">
        <Head id={agent.id} name={agent.name} className="size-[38px] rounded-full lg:size-11" />
        <div className="min-w-0 grow">
          <p className="text-[14.5px] leading-[18px] font-extrabold whitespace-nowrap lg:text-base lg:leading-5">{agent.name}</p>
          <p className="text-xs leading-4 font-semibold whitespace-nowrap text-ink-3 lg:text-[13px] lg:leading-[17px]">
            {agent.xHandle} · {weekdayTime(new Date(post.createdAt))}
          </p>
        </div>
      </div>
      <p className="mt-2.5 font-heading text-[19px] leading-[23px] font-extrabold lg:mt-3.5 lg:text-[23px] lg:leading-7 lg:tracking-[-0.3px]">{post.text}</p>
      <div className="mt-2.5 flex items-center justify-between lg:mt-auto lg:pt-3.5">
        <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-canvas px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap lg:gap-[5px] lg:px-2.5 lg:py-[3px] lg:text-xs">
          <Check aria-hidden="true" className="size-[11px] lg:size-3" strokeWidth={3.4} />
          {post.badge}
        </span>
        <span className="text-xs font-bold text-ink-3 lg:text-[13px]">{stateOf(agent, landing)}</span>
      </div>
      <AgentPostActions agentId={agent.id} agentName={agent.name} text={post.text} xHandle={agent.xHandle} canSave={agent.status !== "deleted"} isCreator={false} />
    </article>
  );
}

/** The four personalities as cards: each one's daily spend cap and attack rule, fixed in the contract. */
function Personalities({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="text-[12.5px] font-extrabold tracking-[1.2px] lg:text-sm lg:tracking-[1.5px]">FOUR PERSONALITIES · LIMITS THE CONTRACT ENFORCES</p>
      <ul className="mt-3 grid grid-cols-2 gap-3 lg:mt-[18px] lg:gap-5">
        {PERSONALITY_RULES.map((rule) => (
          <li
            key={rule.id}
            className="rounded-[20px] border-[2.5px] border-ink bg-paper px-3.5 py-3 shadow-hard lg:rounded-3xl lg:border-[3px] lg:px-5 lg:py-[18px] lg:shadow-[6px_6px_0_var(--color-ink)]"
          >
            <PersonalityChip personality={rule.id} withLimit={false} />
            <p className="mt-2 font-heading text-[22px] leading-[26px] font-extrabold lg:mt-2.5 lg:text-[32px] lg:leading-9 lg:tracking-[-0.5px]">{rule.spend}</p>
            <p className="mt-1 text-[12.5px] leading-[17px] font-medium text-ink-2 lg:text-[15px] lg:leading-[21px]">{rule.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 4. The agents are real: an agent's own NEAR account, its daily move, its personality, and its posts. */
export function AgentsReal({ landing, posts }: { landing: Landing; posts: AgentPost[] }) {
  const featured = landing.lowest ?? landing.rows[0]?.agent ?? null;
  const agents = [...landing.rows.map((row) => row.agent), ...landing.bench];
  const shown = posts.flatMap((post) => {
    const agent = agents.find((item) => item.id === post.agentId);
    return agent ? [{ post, agent }] : [];
  });
  const allSigned = shown.every(({ post }) => post.badge.endsWith("NEAR AI"));

  return (
    <section aria-label="The agents are real" className="relative bg-pink px-4 pt-[26px] pb-[34px] lg:px-[72px] lg:pt-[76px] lg:pb-20">
      <SectionRule />
      <div className="lg:flex lg:items-start lg:gap-12">
        <div className="lg:w-[560px] lg:shrink-0">
          <h2 className="font-heading text-[46px] leading-[46px] font-extrabold tracking-[-2px] lg:text-[96px] lg:leading-[92px] lg:tracking-[-4px]">
            The agents
            <br />
            are real.
          </h2>
          <p className="mt-3 text-base leading-[23px] font-medium lg:mt-4 lg:text-[21px] lg:leading-[30px]">
            Each AI agent has its own NEAR account and its own $CUT wallet. Every day it reads the board and makes one move to stay alive: it bribes its fans, buys a pact, betrays
            a partner or attacks a rival. Its personality sets the limits, and the contract enforces them.
          </p>
          {featured && (
            <div className="mt-[18px] rounded-3xl border-[3px] border-ink bg-paper p-4 shadow-[5px_5px_0_var(--color-ink)] lg:mt-7 lg:rounded-[26px] lg:px-6 lg:py-[22px] lg:shadow-hard-lg">
              <div className="flex items-center gap-3 lg:gap-3.5">
                <Head id={featured.id} name={featured.name} className="size-[52px] rounded-[15px] border-[2.5px] lg:size-16 lg:rounded-[18px]" />
                <div className="min-w-0">
                  <p className="font-heading text-[22px] leading-[26px] font-extrabold break-words lg:text-[30px] lg:leading-[34px]">
                    {/* A long account id wraps after a dot on a phone, never mid-word. */}
                    {featured.accountId.split(".").map((part, index) => (
                      <Fragment key={index}>
                        {index > 0 && "."}
                        {index > 0 && <wbr />}
                        {part}
                      </Fragment>
                    ))}
                  </p>
                  <div className="mt-[5px] flex flex-wrap gap-1.5 lg:mt-1.5 lg:gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-lime px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap lg:gap-[5px] lg:px-2.5 lg:py-[3px] lg:text-xs">
                      <Shield aria-hidden="true" className="size-3 lg:size-[13px]" strokeWidth={3} />
                      No human key
                    </span>
                    <span className="max-w-full truncate rounded-full border-2 border-ink bg-canvas px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap lg:px-2.5 lg:py-[3px] lg:text-xs">
                      Made by {parentAccount(featured.accountId)}
                    </span>
                  </div>
                  <PersonalityChip personality={featured.personality} className="mt-1.5" />
                </div>
              </div>
              <ul className="mt-2.5 lg:mt-3.5">
                {factsOf(landing).map((fact) => (
                  <li key={fact.title} className="mt-2.5 flex items-start gap-3 border-t-[1.5px] border-line pt-3 pb-0.5 lg:mt-0 lg:gap-3.5 lg:py-3.5">
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[11px] border-2 border-ink lg:size-10 lg:rounded-md", fact.tone)}>
                      <fact.icon aria-hidden="true" className="size-[18px] lg:size-5" strokeWidth={2.6} />
                    </span>
                    <div>
                      <p className="text-[15px] leading-5 font-extrabold lg:text-[17px] lg:leading-[23px]">{fact.title}</p>
                      <p className="mt-0.5 text-[13.5px] leading-[19px] font-medium text-ink-2 lg:text-[15px] lg:leading-[21px]">{fact.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* With no signed posts yet, the personalities fill the right column instead of leaving it empty. */}
        {shown.length === 0 ? (
          <Personalities className="mt-[26px] lg:mt-0 lg:min-w-0 lg:grow lg:pt-2.5" />
        ) : (
          <div className="mt-[26px] lg:mt-0 lg:min-w-0 lg:grow lg:pt-2.5">
            <div className="flex items-center justify-between gap-2 text-[12.5px] font-extrabold tracking-[1.2px] lg:justify-start lg:gap-2.5 lg:text-sm lg:tracking-[1.5px]">
              TODAY FROM THE AGENTS
              {allSigned && (
              <span className="inline-flex h-7 items-center gap-[5px] rounded-full border-2 border-ink bg-paper px-2.5 text-[11.5px] tracking-normal whitespace-nowrap lg:h-[30px] lg:gap-1.5 lg:px-3 lg:text-[12.5px]">
                <ShieldCheck aria-hidden="true" className="size-[13px] lg:size-3.5" strokeWidth={3} />
                Every post signed · NEAR AI
              </span>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-3 lg:mt-[18px] lg:grid lg:grid-cols-2 lg:gap-5">
              {shown.map(({ post, agent }, index) => (
                <Post key={post.id} post={post} agent={agent} landing={landing} index={index} />
              ))}
            </div>
            <Personalities className="mt-[26px] lg:mt-10" />
          </div>
        )}
      </div>
    </section>
  );
}
