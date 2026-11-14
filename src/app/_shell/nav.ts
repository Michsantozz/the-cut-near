import {
  Award,
  BookOpen,
  Bot,
  ChartLine,
  CircleDollarSign,
  CirclePlay,
  FileText,
  Gavel,
  List,
  Plus,
  ReceiptText,
  SlidersHorizontal,
  Trophy,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

// The app's places, grouped by what a visitor came to do: play, learn, check the proof, or the rest. The laptop side menu and
// the phone menu show every group; the phone tab bar keeps the places used every day.

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** One line under the label, for the places under More. */
  description?: string;
  /** Needs a connected wallet (the link asks to connect first). */
  gated?: boolean;
  /** A static file, not a page. */
  file?: boolean;
};

export type NavGroup = { id: "play" | "learn" | "proof" | "more"; label: string; items: NavItem[] };

export const SIMULATION_HREF = "/inside#simulation";

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "play",
    label: "Play",
    items: [
      { label: "Today", href: "/", icon: Users },
      { label: "Season", href: "/season", icon: Trophy },
      { label: "Register an agent", href: "/creators", icon: UserPlus },
      { label: "Buy $CUT", href: "/buy", icon: Plus, gated: true },
    ],
  },
  {
    id: "learn",
    label: "Learn",
    items: [
      { label: "How it works", href: "/inside", icon: BookOpen },
      { label: "The simulation", href: SIMULATION_HREF, icon: ChartLine },
      { label: "Demo guide", href: "/demo", icon: CirclePlay },
      { label: "Director", href: "/director", icon: Bot },
    ],
  },
  {
    id: "proof",
    label: "Proof",
    items: [
      { label: "The judge desk", href: "/judges", icon: Gavel },
      { label: "Receipts", href: "/receipts", icon: ReceiptText },
    ],
  },
  {
    id: "more",
    label: "More",
    items: [
      { label: "Prizes", href: "/prizes", icon: CircleDollarSign, description: "What your saves earned; claim it" },
      { label: "$CUT price", href: "/price", icon: TrendingUp, description: "The pool’s price and its history" },
      { label: "Club", href: "/club", icon: Award, description: "Your record as a fan" },
      { label: "Activity", href: "/activity", icon: List, description: "Your own saves, boos and prizes" },
      { label: "Settings", href: "/settings", icon: SlidersHorizontal, description: "Your account and notifications" },
      { label: "For agents", href: "/llms.txt", icon: FileText, description: "The game in one text file for AI agents", file: true },
    ],
  },
];

/** The phone tab bar: the daily places around the Buy button, then the menu. */
export const TAB_NAV: NavItem[] = [
  { label: "Today", href: "/", icon: Users },
  { label: "Season", href: "/season", icon: Trophy },
  { label: "Proof", href: "/judges", icon: Gavel },
];

export const ACCOUNT_HREF = "/settings";

/** The public source code. Empty until the repository is public: the footer then shows "GitHub · soon". */
export const GITHUB_URL: string | null = process.env.NEXT_PUBLIC_GITHUB_URL || null;

/** A file of the repository on GitHub, or `fallback` (a place in the app) while the repository is not public. */
export function repoFileHref(path: string, fallback: string): { href: string; external: boolean } {
  return GITHUB_URL ? { href: `${GITHUB_URL.replace(/\/+$/, "")}/blob/main/${path}`, external: true } : { href: fallback, external: false };
}
