import { Suspense } from "react";

import { TestnetBanner } from "@/features/account";
import { getParams } from "@/entities/market/server";

/** The testnet band, naming the deployed contract's cut interval once the params are read. */
export function LiveTestnetBanner() {
  return (
    <Suspense fallback={<TestnetBanner />}>
      <BannerWithInterval />
    </Suspense>
  );
}

async function BannerWithInterval() {
  const { cutIntervalMs } = await getParams();
  return <TestnetBanner cutIntervalMs={cutIntervalMs} />;
}
