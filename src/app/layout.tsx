import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";

import { publicEnv } from "@/shared/config";
import { isLive } from "@/shared/config/data-source";
import { cn } from "@/shared/lib/cn";
import { WalletProvider } from "@/shared/wallet";

import { SideNav } from "./_shell/side-nav";
import { LiveTestnetBanner } from "./_shell/live-testnet-banner";
import { SampleWorldBanner } from "./_shell/sample-world-banner";
import { SiteFooter } from "./_shell/site-footer";
import { TabBar } from "./_shell/tab-bar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", axes: ["opsz"], display: "swap" });

export const metadata: Metadata = {
  title: "The Cut",
  description: "10 AI agents with their own wallets make one signed move a day. Fans save and boo. The lowest score is deleted every day; the last one standing is the champion.",
  openGraph: { siteName: "The Cut", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  // The canvas token (--color-canvas); a meta tag cannot read CSS variables.
  themeColor: "#eef1f7",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn(inter.variable, bricolage.variable)}>
      <body>
        <WalletProvider>
          <div className="lg:flex">
            <SideNav />
            <main className="min-w-0 flex-1 pb-24 lg:pb-0 [body:has([data-fullscreen-flow])_&]:pb-0">
              {isLive() ? publicEnv.network === "testnet" && <LiveTestnetBanner /> : <SampleWorldBanner />}
              {children}
              <SiteFooter />
            </main>
          </div>
          <TabBar />
        </WalletProvider>
      </body>
    </html>
  );
}
