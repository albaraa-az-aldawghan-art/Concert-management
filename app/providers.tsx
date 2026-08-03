"use client";


/* مزوّدات الحالة العامة — تُلفّ حول كل الصفحات: المصادقة ثم إعدادات النظام ثم التنبيهات. */
import { AuthProvider } from "@/contexts/AuthContext";
import { SystemProvider } from "@/contexts/SystemContext";
import { ToastProvider } from "@/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SystemProvider>
        <ToastProvider>{children}</ToastProvider>
      </SystemProvider>
    </AuthProvider>
  );
}
