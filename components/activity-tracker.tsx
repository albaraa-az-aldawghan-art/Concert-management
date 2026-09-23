"use client";

import { useEffect } from "react";
import { auth } from "@/lib/firebase";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { pageKeyFromPath, PERMISSION_CATALOG } from "@/lib/permissions";

function pageLabel() {
  const key = pageKeyFromPath(window.location.pathname);
  return PERMISSION_CATALOG.find((page) => page.key === key)?.label ?? "الموقع";
}

export function ActivityTracker() {
  const pathname = usePathname();
  const { appUser } = useAuth();
  const uid = appUser?.uid;
  useEffect(() => {
    let queue: { id: string; action: string; path: string; uid: string }[] = [];
    let busy = false;
    async function flush() {
      const user = auth.currentUser;
      if (busy || !user || !queue.length) return;
      busy = true;
      queue = queue.filter((event) => event.uid === user.uid);
      const events = queue.splice(0, 30);
      if (!events.length) { busy = false; return; }
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/activity", {
          method: "POST", keepalive: true,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ events: events.map(({ id, action, path }) => ({ id, action, path })) }),
        });
        if (!res.ok) throw new Error("activity");
      } catch {
        queue = [...events, ...queue].slice(0, 300);
      } finally { busy = false; }
    }
    function record(event: MouseEvent) {
      const user = auth.currentUser;
      if (!user) return;
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest("button, a, [role='button'], input[type='submit'], input[type='checkbox'], [role='switch']");
      if (!control || control.closest("[data-no-activity]") || control.hasAttribute("disabled")) return;
      // Never read form values or input contents (passwords, payments, tokens).
      const label = control.getAttribute("data-activity-label") || control.getAttribute("aria-label") || control.getAttribute("title") ||
        (control.tagName === "INPUT" ? "تغيير اختيار" : control.textContent?.trim()) || "زر بدون عنوان";
      queue.push({ id: crypto.randomUUID(), action: `ضغط: ${label.replace(/\s+/g, " ").slice(0, 100)} — ${pageLabel()}`.slice(0, 160), path: window.location.pathname, uid: user.uid });
      void flush();
    }
    function navigation() {
      if (!uid) return;
      queue.push({ id: crypto.randomUUID(), action: `فتح صفحة — ${pageLabel()}`, path: window.location.pathname, uid });
      void flush();
    }
    function change(event: Event) {
      const user = auth.currentUser;
      const target = event.target;
      if (!user || !(target instanceof Element) || !target.matches("select, input[type='file'], input[type='radio']") || target.closest("[data-no-activity]")) return;
      const label = target.matches("input[type='file']") ? "اختيار ملف" : "تغيير اختيار";
      queue.push({ id: crypto.randomUUID(), action: `${label} — ${pageLabel()}`, path: window.location.pathname, uid: user.uid });
      void flush();
    }
    function print() {
      const user = auth.currentUser;
      if (!user) return;
      queue.push({ id: crypto.randomUUID(), action: `طباعة — ${pageLabel()}`, path: window.location.pathname, uid: user.uid });
      void flush();
    }
    const timer = window.setInterval(() => void flush(), 3000);
    const hide = () => { if (document.visibilityState === "hidden") void flush(); };
    document.addEventListener("click", record, true);
    document.addEventListener("visibilitychange", hide);
    document.addEventListener("activity-navigation", navigation);
    document.addEventListener("change", change, true);
    window.addEventListener("beforeprint", print);
    return () => {
      clearInterval(timer);
      document.removeEventListener("click", record, true);
      document.removeEventListener("visibilitychange", hide);
      document.removeEventListener("activity-navigation", navigation);
      document.removeEventListener("change", change, true);
      window.removeEventListener("beforeprint", print);
      void flush();
    };
  }, [uid]);
  useEffect(() => { document.dispatchEvent(new Event("activity-navigation")); }, [pathname, uid]);
  return null;
}
