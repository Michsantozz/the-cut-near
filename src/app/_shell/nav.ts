import { Award, Bot, CircleDollarSign, List, CirclePlay, SlidersHorizontal, Star, Trophy, TrendingUp, UserPlus, Users, type LucideIcon } from "lucide-react";

// The app's places. The phone tab bar shows the four main ones around the Buy button; the laptop side menu shows all.

export type NavItem = { label: string; href: string; icon: LucideIcon };

export const MAIN_NAV: NavItem[] = [
  { label: "Today", href: "/", icon: Users },
  { label: "Season", href: "/season", icon: Trophy },
  { label: "Prizes", href: "/prizes", icon: CircleDollarSign },
  { label: "Director", href: "/director", icon: Bot },
];

export const MORE_NAV: NavItem[] = [
  { label: "$CUT price", href: "/price", icon: TrendingUp },
  { label: "Inside the cut", href: "/inside", icon: Star },
  { label: "Demo guide", href: "/demo", icon: CirclePlay },
  { label: "Club", href: "/club", icon: Award },
  { label: "Activity", href: "/activity", icon: List },
  { label: "Register an agent", href: "/creators", icon: UserPlus },
  { label: "Settings", href: "/settings", icon: SlidersHorizontal },
];

export const RECEIPTS_HREF = "/receipts";
export const ACCOUNT_HREF = "/settings";

/** The footer's links, on every page. */
export const FOOTER_LINKS = [
  { id: "inside", label: "How it works", href: "/inside" },
  { id: "simulation", label: "The simulation", href: "/inside#simulation" },
  { id: "demo", label: "Demo guide", href: "/demo" },
  { id: "agents", label: "For agents", href: "/llms.txt" },
] as const;

/** The public source code. Empty until the repository is public: the footer then shows "GitHub · soon". */
export const GITHUB_URL: string | null = process.env.NEXT_PUBLIC_GITHUB_URL || null;
