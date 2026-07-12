"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { pageKeyFromPath, PERMISSION_PAGES } from "@/lib/permissions";
import { ShieldAlert, Eye } from "lucide-react";

// Central gate for every /admin page: full admins pass, custom roles pass by
// permission, everyone else is refused. Runs inside the dashboard layout,
// which already guarantees an authenticated session.
export default function AdminGuardLayout({ children }: { children: React.ReactNode }) {
  const { appUser, customRole, can, feat, loading, homePath } = useAuth();
  const pathname = usePathname();

  if (loading || !appUser) return null;

  const page = pageKeyFromPath(pathname);
  const allowed = appUser.role === "admin" || (page !== null && can(page));

  if (!allowed) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <ShieldAlert size={40} className="mx-auto mb-3 text-red-400" />
        <p className="font-bold text-slate-800 mb-1">غير مصرح لك بالوصول لهذه الصفحة</p>
        <p className="text-sm text-slate-500 mb-5">هذه الصفحة خارج صلاحيات حسابك</p>
        <Link
          href={homePath()}
          className="inline-block bg-[#1C2D50] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#111D35] transition-colors"
        >
          العودة للصفحة الرئيسية
        </Link>
      </div>
    );
  }

  // "View only" = the page is granted but not a single capability inside it
  const pageDef = page !== null ? PERMISSION_PAGES.find((p) => p.key === page) : null;
  const viewOnly =
    appUser.role === "custom" &&
    pageDef != null &&
    !pageDef.features.some((f) => feat(pageDef.key, f.key));

  return (
    <>
      {viewOnly && (
        <div className="mb-4 flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-sm font-medium rounded-xl px-4 py-2.5">
          <Eye size={15} className="shrink-0" />
          صلاحيتك على هذه الصفحة «عرض فقط» — لا يمكنك الإضافة أو التعديل
          {customRole?.name ? ` (الدور: ${customRole.name})` : ""}
        </div>
      )}
      {children}
    </>
  );
}
