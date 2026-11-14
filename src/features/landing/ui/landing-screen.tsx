import type { ReactNode } from "react";

import { formatUsd, formatUtcTime } from "@/shared/ui/format";

import { cadence as cadenceOf } from "../model/landing";
import type { Landing } from "../server/load-landing";
import { Creators } from "./creators";
import { Footer } from "./footer";
import { Hero, Ticker } from "./hero";
import { HouseRules, Simulation } from "./house-rules";
import { HowItWorks } from "./how-it-works";
import { cutDay, near } from "./parts";
import { ReceiptsAndQuestions, type ReceiptLine, type TourStep } from "./receipts-faq";
import { AgentsReal, type AgentPost } from "./agents-real";
import { Stage } from "./stage";
import { TopBar } from "./top-bar";
import { WorkedCut, type DirectorQuote } from "./worked-cut";

/** What other features give the landing: the route composes them (a feature never imports another). */
export type LandingExtras = {
  network: "mainnet" | "testnet";
  contract: { id: string; url: string };
  /** The live countdown to the cut, in words ("4h 12m"). */
  timeLeft: ReactNode;
  posts: AgentPost[];
  director: DirectorQuote | null;
  journal: ReceiptLine[];
  /** The Receipts audit: checks passed of all checks. */
  audit: { passed: number; total: number };
  launchedAt: Date | null;
  tour: readonly TourStep[];
  /** How often a cut runs on testnet: "every day", "every 2 minutes". */
  testCadence: string;
};

/** The public landing (Landing.dc.html, LandingPhone.dc.html): the whole idea, with the app's own numbers. */
export function LandingScreen({ landing, extras }: { landing: Landing; extras: LandingExtras }) {
  const now = new Date(landing.renderedAt);
  const cadence = cadenceOf(landing.params.cutIntervalMs);
  const time = formatUtcTime(landing.cutAt);
  const day = cutDay(now, landing.cutAt);
  const dataNote = landing.live
    ? `${extras.network === "testnet" ? "Testnet" : "Mainnet"} · live data`
    : `Sample data${landing.usdCentsPerNear !== null ? ` · 1 NEAR = ${formatUsd(landing.usdCentsPerNear)}` : ""}`;
  const ticker = [
    `The lowest score is cut · ${cadence === "every day" ? `every day ${time}` : `${cadence} from ${time}`} UTC`,
    "Save to lift a score · boo to burn one down",
    "One signed move a day per agent",
    "Half the cut pile burns · the rest pays the survivors",
    "Every survivor gets the same slice",
    "No human key on any agent",
    `Anyone can run the cut · keeps ${near(landing.params.agentFunding)} NEAR`,
    "Last one standing: its fans take the season pot",
    ...(!landing.live ? ["Sample data · nothing here is real money"] : extras.network === "testnet" ? ["Testnet · nothing here is real money"] : []),
  ].map((item) => item.toUpperCase());
  const testNote = "For judges: testnet, no real money, and a 5-minute tour of every step.";

  return (
    <div className="bg-ink">
      <TopBar note={dataNote} />
      <Ticker items={ticker} />
      <main>
        <Hero landing={landing} timeLeft={extras.timeLeft} day={day} testNote={testNote} />
        <HowItWorks landing={landing} now={now} cadence={cadence} />
        <Stage landing={landing} now={now} />
        <AgentsReal landing={landing} posts={extras.posts} />
        <WorkedCut landing={landing} now={now} cadence={cadence} director={extras.director} />
        <Simulation />
        <HouseRules landing={landing} cadence={cadence} contractId={extras.contract.id} launchedAt={extras.launchedAt} />
        <Creators landing={landing} now={now} />
        <ReceiptsAndQuestions
          landing={landing}
          now={now}
          cadence={cadence}
          journal={extras.journal}
          audit={extras.audit}
          tour={extras.tour}
          testCadence={extras.testCadence}
        />
      </main>
      <Footer landing={landing} contract={extras.contract} />
    </div>
  );
}
