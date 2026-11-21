"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PlusCircle,
  Megaphone,
  Download,
  Settings,
  LogOut,
  Flame,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "New Project", href: "/projects/new", icon: PlusCircle },
  { label: "Ad Library", href: "/ads", icon: Megaphone },
  { label: "Exports", href: "/exports", icon: Download },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col shrink-0 h-screen sticky top-0">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-border gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
          <Flame className="w-5 h-5 fill-primary" />
        </div>
        <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-text-primary to-text-secondary bg-clip-text text-transparent">
          ClipForge
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-primary text-white shadow-md shadow-primary/25"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User profile & Logout */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between gap-3 bg-surface-hover/50 p-2.5 rounded-xl border border-border">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-text-primary truncate">
              {user?.display_name || "Creator"}
            </p>
            <p className="text-[10px] text-text-secondary truncate">
              {user?.email || ""}
            </p>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="p-1.5 text-text-secondary hover:text-error hover:bg-surface-hover rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
