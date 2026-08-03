"use client";

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
