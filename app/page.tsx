"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const { appUser, loading, homePath } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!appUser) {
      router.replace("/login");
      return;
    }
    router.replace(homePath());
  }, [appUser, loading, router, homePath]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        <p className="text-slate-500 text-sm">جارٍ التحميل...</p>
      </div>
    </div>
  );
}
