import { publicEnv } from "@/shared/config";
import { isLive } from "@/shared/config/data-source";

import { LiveTestnetBanner } from "./_shell/live-testnet-banner";
import { SampleWorldBanner } from "./_shell/sample-world-banner";
import { SideNav } from "./_shell/side-nav";
import { SiteFooter } from "./_shell/site-footer";
import { TabBar } from "./_shell/tab-bar";

// The app shell: the laptop side menu, the phone tab bar, the data band and the footer around every app screen.
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="lg:flex">
        <SideNav />
        <main className="min-w-0 flex-1 pb-24 lg:pb-0 [body:has([data-fullscreen-flow])_&]:pb-0">
          {isLive() ? publicEnv.network === "testnet" && <LiveTestnetBanner /> : <SampleWorldBanner />}
          {children}
          <SiteFooter />
        </main>
      </div>
      <TabBar />
    </>
  );
}
