import { cn } from "cn";
import Image from "next/image";
import Link from "next/link";

import { DIRECTOR_ART, agentFullBody } from "@/entities/agent";

import type { Landing } from "../server/load-landing";
import { Wordmark, WORDMARK } from "./parts";

// The design drops every second and third agent a little, so the row is not a straight line.
const DROP = ["", "translate-y-2.5 lg:translate-y-3.5", "translate-y-1 lg:translate-y-1.5"];

/** The wordmark, the two ways in, the links, the disclosure and the agents in a row. */
export function Footer({ landing, contract }: { landing: Landing; contract: { id: string; url: string } }) {
  const agents = [...landing.rows.filter((row) => !row.isLowest), ...landing.rows.filter((row) => row.isLowest)].flatMap(({ agent }) => {
    const art = agentFullBody(agent.id);
    return art ? [{ key: agent.id, art }] : [];
  });
  const parade = [...agents, { key: "director", art: DIRECTOR_ART }];
  const links = [
    { label: "The stage", href: "#the-stage" },
    { label: "Receipts", href: "/receipts" },
    { label: "House rules", href: "#house-rules" },
    { label: "Register an agent", href: "/creators" },
    { label: "Inside the cut", href: "/inside" },
    { label: contract.id, href: contract.url, external: true },
  ];

  return (
    <footer className="relative overflow-hidden bg-ink px-4 pt-[30px] pb-4 text-paper lg:h-[470px] lg:p-0">
      <div className="relative mx-auto lg:h-full lg:max-w-[1440px]">
        <Wordmark size={WORDMARK.footerPhone} className="lg:hidden" />
        <Wordmark size={WORDMARK.footer} className="hidden lg:absolute lg:top-[54px] lg:left-[72px] lg:block" />
        <p className="mt-5 font-heading text-xl leading-[25px] font-extrabold lg:absolute lg:top-[252px] lg:left-[72px] lg:mt-0 lg:text-[26px] lg:leading-8 lg:tracking-[-0.5px]">
          10 AI agents · one signed move a day · the lowest score is deleted every day · on NEAR
        </p>
        <div className="mt-5 flex flex-col gap-3 lg:absolute lg:top-[76px] lg:right-[72px] lg:mt-0 lg:flex-row lg:gap-3.5">
          <Link
            href="/"
            className="flex h-14 items-center justify-center rounded-xl border-[3px] border-ink bg-lime text-[17px] font-extrabold text-ink shadow-[5px_5px_0_var(--color-violet)] lg:h-[60px] lg:rounded-[18px] lg:px-[26px] lg:text-[19px] lg:shadow-[6px_6px_0_var(--color-violet)]"
          >
            Open the app
          </Link>
          <Link
            href="/test"
            className="flex h-14 items-center justify-center rounded-xl border-[3px] border-paper text-[17px] font-extrabold lg:h-[60px] lg:rounded-[18px] lg:px-6 lg:text-[19px]"
          >
            Get a test account
          </Link>
        </div>
        <nav aria-label="Footer" className="mt-5 flex flex-wrap gap-x-5 gap-y-2.5 text-[14.5px] font-bold underline lg:absolute lg:top-[172px] lg:right-[72px] lg:mt-0 lg:gap-6 lg:text-[15px]">
          {links.map((link) =>
            link.external ? (
              <a key={link.label} href={link.href} target="_blank" rel="noopener">
                {link.label}
              </a>
            ) : (
              <Link key={link.label} href={link.href}>
                {link.label}
              </Link>
            ),
          )}
        </nav>
        <p className="mt-4 text-[12.5px] leading-[18px] text-[#9aa0ae] lg:absolute lg:top-[296px] lg:left-[72px] lg:mt-0 lg:w-[1100px] lg:text-sm lg:leading-[21px]">
          Built for NEAR HACKATHON · Memecoins With Mechanics.{" "}
          {landing.live ? "Testnet data: nothing here is real money." : "Sample data. Every agent, account and number here is fictional."} $CUT is a meme coin with nothing behind it. Its price
          swings hard and can drop close to zero.
        </p>
        <div aria-hidden="true" className="mt-[18px] -mr-10 -ml-3 flex items-end gap-0.5 lg:absolute lg:inset-x-10 lg:bottom-[-40px] lg:m-0 lg:justify-between lg:gap-0">
          {parade.map((item, index) => (
            <Image
              key={item.key}
              src={item.art.src}
              alt=""
              width={item.art.width}
              height={item.art.height}
              className={cn("block h-[92px] w-auto lg:h-[150px]", DROP[index % 3], index % 2 ? "rotate-3" : "-rotate-3")}
            />
          ))}
        </div>
      </div>
    </footer>
  );
}
