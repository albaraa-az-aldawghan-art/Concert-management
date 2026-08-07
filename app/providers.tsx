"use client";


/* مزوّدات الحالة العامة — تُلفّ حول كل الصفحات: المصادقة ثم إعدادات النظام ثم التنبيهات. */
import { AuthProvider } from "@/contexts/AuthContext";
import { SystemProvider } from "@/contexts/SystemContext";
import { ToastProvider } from "@/components/ui/toast";
import { ActorsProvider } from "@/components/ui/actor";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SystemProvider>
        <ActorsProvider>
          <ToastProvider>{children}</ToastProvider>
        </ActorsProvider>
      </SystemProvider>
    </AuthProvider>
  );
}
