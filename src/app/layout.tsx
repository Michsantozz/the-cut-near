import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";

import { cn } from "@/shared/lib/cn";
import { WalletProvider } from "@/shared/wallet";

import { SideNav } from "./_shell/side-nav";
import { TabBar } from "./_shell/tab-bar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", axes: ["opsz"], display: "swap" });

export const metadata: Metadata = {
  title: "The Cut",
  description: "10 AI robots · one coin · the poorest is deleted every day · on NEAR",
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
            <main className="min-w-0 flex-1 pb-24 lg:pb-0 [body:has([data-fullscreen-flow])_&]:pb-0">{children}</main>
          </div>
          <TabBar />
        </WalletProvider>
      </body>
    </html>
  );
}
