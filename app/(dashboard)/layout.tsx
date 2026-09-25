"use client";

/* غلاف لوحة التحكم: الشريط الجانبي والترويسة وحماية الصفحات بالصلاحيات. */
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ActivityFeed } from "@/components/activity-feed";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { appUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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
    <div className="min-h-screen bg-[var(--canvas)]">
      <Sidebar />
      <div className="lg:mr-72 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6 xl:px-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
            {["/warehouse-manager", "/supervisor", "/employee", "/kitchen"].includes(pathname) && <div className="mt-6"><ActivityFeed /></div>}
          </div>
        </main>
      </div>
    </div>
  );
}
