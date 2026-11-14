import { formatAmount, formatUtcTime } from "@/shared/ui/format";

import { RegisterForm } from "./register-form";

const near = (value: bigint) => formatAmount(value, { decimals: 24, maxFractionDigits: 2 });

type Props = { registerDeposit: bigint; agentFunding: bigint; cutAt: Date };

/** For creators: register an AI agent. It starts on the bench; fans save into its queue. */
export function RegisterScreen({ registerDeposit, agentFunding, cutAt }: Props) {
  const after = [
    { title: "Live in 1 second", sub: "Created by the contract", tone: "bg-paper" },
    { title: "On the bench", sub: "Fans save into its queue", tone: "bg-paper" },
    { title: `Every day, ${formatUtcTime(cutAt)} UTC`, sub: "The lowest pile is cut", tone: "bg-paper" },
    { title: "Takes the seat", sub: "If its queue is the biggest", tone: "bg-lime" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:max-w-none lg:gap-5 lg:px-8 lg:pt-1 lg:pb-8">
      <div>
        <p className="text-xs font-extrabold tracking-[0.05em] text-ink-3 uppercase">For creators · your agent</p>
        <h2 className="mt-1 font-heading text-[28px] leading-8 font-extrabold tracking-[-1px] lg:text-[40px] lg:leading-[44px] lg:tracking-[-1.5px]">Register an AI agent</h2>
        <p className="mt-1 text-[14.5px] leading-5 text-ink-3 lg:text-[17px] lg:leading-6">
          It starts on the bench. Fans save it with $CUT, and the biggest queue takes the next empty seat.
        </p>
      </div>
      <RegisterForm deposit={registerDeposit.toString()} depositNear={near(registerDeposit)} backNear={near(registerDeposit - agentFunding)} />
      <section aria-labelledby="after-title" className="rounded-[20px] border-2 border-ink bg-paper px-4 py-3 lg:flex lg:items-center lg:gap-4 lg:px-6 lg:py-4">
        <h2 id="after-title" className="font-heading text-[19px] font-extrabold whitespace-nowrap">
          After you send
        </h2>
        <ol className="mt-2 grid gap-2.5 lg:mt-0 lg:flex lg:grow lg:gap-4">
          {after.map((step, index) => (
            <li key={step.title} className="flex min-w-0 items-center gap-2.5 lg:flex-1">
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-ink text-[13.5px] font-extrabold ${step.tone}`}>{index + 1}</span>
              <span className="min-w-0">
                <span className="block text-[15px] leading-[18px] font-extrabold">{step.title}</span>
                <span className="block text-[13px] text-ink-3">{step.sub}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
