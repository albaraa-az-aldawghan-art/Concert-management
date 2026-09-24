"use client";


/* مزوّدات الحالة العامة — تُلفّ حول كل الصفحات: المصادقة ثم إعدادات النظام ثم التنبيهات. */
import { AuthProvider } from "@/contexts/AuthContext";
import { SystemProvider } from "@/contexts/SystemContext";
import { ToastProvider } from "@/components/ui/toast";
import { ActorsProvider } from "@/components/ui/actor";
import { ActivityTracker } from "@/components/activity-tracker";
import { NavigationGuardProvider } from "@/contexts/NavigationGuardContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ActivityTracker />
      <SystemProvider>
        <ActorsProvider>
          <ToastProvider><NavigationGuardProvider>{children}</NavigationGuardProvider></ToastProvider>
        </ActorsProvider>
      </SystemProvider>
    </AuthProvider>
  );
}
