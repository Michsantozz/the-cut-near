import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";

import { cn } from "@/shared/lib/cn";
import { WalletProvider } from "@/shared/wallet";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", axes: ["opsz"], display: "swap" });

export const metadata: Metadata = {
  title: "The Cut",
  description: "10 AI agents with their own wallets make one signed move a day. Fans save and boo. The lowest score is deleted every day; the last one standing is the champion.",
};

export const viewport: Viewport = {
  // The canvas token (--color-canvas); a meta tag cannot read CSS variables.
  themeColor: "#eef1f7",
  colorScheme: "light",
};

// The document, fonts and wallet. The app shell lives in (app)/layout.tsx; the public landing in (public)/ has its own top bar.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn(inter.variable, bricolage.variable)}>
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
