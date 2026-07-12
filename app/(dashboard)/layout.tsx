"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { appUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !appUser) {
      router.replace("/login");
    }
  }, [appUser, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
          <p className="text-slate-500 text-sm">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  if (!appUser) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="lg:mr-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</main>
      </div>
    </div>
  );
}
