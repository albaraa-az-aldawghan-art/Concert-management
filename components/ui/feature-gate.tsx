"use client";

import Link from "next/link";
import { useSystem } from "@/contexts/SystemContext";
import { SystemFeatures } from "@/lib/firestore/system";
import { PowerOff } from "lucide-react";

/* إيقاف ميزة من مركز التحكم يخفيها من التنقّل — لكن الرابط المباشر
   يبقى مفتوحاً، فتُغلق الصفحة نفسها هنا أيضاً. */

export function FeatureGate({
  feature: key,
  name,
  children,
}: {
  feature: keyof SystemFeatures;
  name: string;
  children: React.ReactNode;
}) {
  const { feature, loading } = useSystem();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!feature(key)) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          <PowerOff size={22} />
        </div>
        <p className="font-bold text-slate-700">ميزة «{name}» موقوفة حالياً</p>
        <p className="text-sm text-slate-500 mt-1">
          بياناتها محفوظة كما هي — تعود بمجرد تشغيلها من مركز التحكم.
        </p>
        <Link href="/admin/control"
          className="mt-4 text-sm font-semibold text-[#1C2D50] hover:underline">
          الذهاب إلى مركز التحكم
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
