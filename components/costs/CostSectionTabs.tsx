"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin/costs/production", label: "الوصفات القياسية" },
  { href: "/admin/costs", label: "جميع أصناف التكاليف" },
];

export function CostSectionTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link key={tab.href} href={tab.href}
            className={cn(
              "shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              active ? "bg-white text-[#1C2D50] shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
