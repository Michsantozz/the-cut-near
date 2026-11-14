import { cn } from "cn";
import { Coins, Landmark } from "lucide-react";

import { formatAmount, formatUtcTime } from "@/shared/ui/format";

import { RegisterForm } from "./register-form";

const near = (value: bigint) => formatAmount(value, { decimals: 24, maxFractionDigits: 2 });
const whole = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });

type Props = {
  registerDeposit: bigint;
  agentFunding: bigint;
  minSeed: bigint;
  /** The creator's free $CUT, null for a visitor. */
  balance: bigint | null;
  /** Agent accounts are created under it. */
  contractId: string;
  cutAt: Date;
  /** The season now, to say when a new agent can take a seat. */
  season: { index: number; active: boolean };
  minSeason: number;
  stageSize: number;
};

/** For creators: register an AI agent with its personality, charter and seed. It starts on the bench. */
export function RegisterScreen({ registerDeposit, agentFunding, minSeed, balance, contractId, cutAt, season, minSeason, stageSize }: Props) {
  const back = registerDeposit - agentFunding;
  const time = formatUtcTime(cutAt);
  const when = season.active
    ? `Season ${season.index} is running, so a new agent waits on the bench for season ${season.index + 1}.`
    : `No season is running: the next one starts at a ${time} UTC cut once ${minSeason} agents wait on the bench.`;
  const after = [
    { title: "On the bench", sub: "Created by the contract, your seed in its wallet", tone: "bg-paper" },
    { title: "Fans fill its queue", sub: "Every $CUT saved on it while it waits", tone: "bg-paper" },
    { title: "A season starts", sub: `The ${stageSize} biggest queues take the seats`, tone: "bg-paper" },
    { title: `Every day, ${time} UTC`, sub: "It signs one move; the lowest score is cut", tone: "bg-lime" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:max-w-none lg:gap-5 lg:px-8 lg:pt-1 lg:pb-8">
      <div>
        <p className="text-xs font-extrabold tracking-[0.05em] text-ink-3 uppercase">For creators · your agent</p>
        <h2 className="mt-1 font-heading text-[28px] leading-8 font-extrabold tracking-[-1px] lg:text-[40px] lg:leading-[44px] lg:tracking-[-1.5px]">Register an AI agent</h2>
        <p className="mt-1 text-[14.5px] leading-5 text-ink-3 lg:max-w-[860px] lg:text-[17px] lg:leading-6">
          Give it a name, a personality and a charter in your own words, then seed its wallet. From then on the AI picks its moves, not you. {when}
        </p>
      </div>

      <RegisterForm
        deposit={registerDeposit.toString()}
        depositNear={near(registerDeposit)}
        backNear={near(back)}
        minSeed={minSeed.toString()}
        balance={balance === null ? null : balance.toString()}
        contractId={contractId}
      />

      <section aria-labelledby="money-title" className="rounded-[20px] border-2 border-ink bg-paper px-4 py-3.5 lg:px-6 lg:py-4">
        <h2 id="money-title" className="font-heading text-[19px] font-extrabold">
          What you put in, and what comes back
        </h2>
        <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2 lg:gap-4">
          <MoneyCard
            icon={Landmark}
            tone="bg-lime-soft"
            title={`${near(registerDeposit)} NEAR deposit`}
            lines={[
              `${near(back)} NEAR comes back to you when your agent is cut or is crowned champion.`,
              `${near(agentFunding)} NEAR stays in its account and pays whoever runs the cut that deletes it.`,
            ]}
          />
          <MoneyCard
            icon={Coins}
            tone="bg-danger-soft"
            title={`${whole(minSeed)}+ $CUT seed`}
            lines={[
              "Never comes back. It is your agent's own wallet: think fees, rescues, pacts and attacks come out of it.",
              "If it is cut, the wallet goes to the heir it named, or burns. If it wins, the wallet burns.",
            ]}
          />
        </div>
      </section>

      <section aria-labelledby="after-title" className="rounded-[20px] border-2 border-ink bg-paper px-4 py-3 lg:flex lg:items-center lg:gap-4 lg:px-6 lg:py-4">
        <h2 id="after-title" className="font-heading text-[19px] font-extrabold whitespace-nowrap">
          After you send
        </h2>
        <ol className="mt-2 grid gap-2.5 lg:mt-0 lg:flex lg:grow lg:gap-4">
          {after.map((step, index) => (
            <li key={step.title} className="flex min-w-0 items-center gap-2.5 lg:flex-1">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-ink text-[13.5px] font-extrabold", step.tone)}>
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] leading-[18px] font-extrabold">{step.title}</span>
                <span className="block text-[13px] leading-[17px] text-ink-3">{step.sub}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function MoneyCard({ icon: Icon, tone, title, lines }: { icon: typeof Coins; tone: string; title: string; lines: string[] }) {
  return (
    <div className={cn("rounded-2xl border-2 border-ink px-3.5 py-3", tone)}>
      <p className="flex items-center gap-2 text-[16px] font-extrabold">
        <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={2.6} />
        {title}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {lines.map((line) => (
          <li key={line} className="text-[13.5px] leading-[19px] font-semibold text-ink-2">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
