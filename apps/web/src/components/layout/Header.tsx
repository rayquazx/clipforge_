"use client";

import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

export function Header() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const getPageTitle = () => {
    if (pathname === "/dashboard") return "Dashboard";
    if (pathname.startsWith("/projects/new")) return "New Project";
    if (pathname.startsWith("/projects")) return "Project Clips";
    if (pathname.startsWith("/ads")) return "Ad Library";
    if (pathname.startsWith("/exports")) return "Export History";
    if (pathname.startsWith("/settings")) return "Settings";
    return "ClipForge";
  };

  return (
    <header className="h-16 border-b border-border bg-surface/50 backdrop-blur-md px-8 flex items-center justify-between shrink-0 sticky top-0 z-30">
      <div>
        <h1 className="text-sm font-semibold text-text-primary tracking-tight">
          {getPageTitle()}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-semibold text-primary uppercase">
          {user?.display_name?.charAt(0) || "U"}
        </div>
      </div>
    </header>
  );
}
