import { Award, Bot, CircleDollarSign, List, SlidersHorizontal, Star, TrendingUp, UserPlus, Users, type LucideIcon } from "lucide-react";

// The app's places. The phone tab bar shows the four main ones around the Buy button; the laptop side menu shows all.

export type NavItem = { label: string; href: string; icon: LucideIcon };

export const MAIN_NAV: NavItem[] = [
  { label: "Lineup", href: "/", icon: Users },
  { label: "Club", href: "/club", icon: Award },
  { label: "Prizes", href: "/prizes", icon: CircleDollarSign },
  { label: "Director", href: "/director", icon: Bot },
];

export const MORE_NAV: NavItem[] = [
  { label: "$CUT price", href: "/price", icon: TrendingUp },
  { label: "Inside the cut", href: "/inside", icon: Star },
  { label: "Activity", href: "/activity", icon: List },
  { label: "For creators", href: "/creators", icon: UserPlus },
  { label: "Settings", href: "/settings", icon: SlidersHorizontal },
];

export const RECEIPTS_HREF = "/receipts";
export const ACCOUNT_HREF = "/settings";
