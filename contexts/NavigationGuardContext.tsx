"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";

type Action = () => void | Promise<void>;
export interface NavigationGuard {
  dirty: boolean;
  busy: boolean;
  hasDraft: boolean;
  save: () => Promise<boolean>;
  discard: () => Promise<void>;
}
interface GuardContext {
  register: (guard: NavigationGuard) => () => void;
  request: (action: Action) => void;
  leave: (action: Action) => void;
}
const Context = createContext<GuardContext | null>(null);
const INDEX = "__concertNavigationIndex";

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const guard = useRef<NavigationGuard | null>(null);
  const pending = useRef<Action | null>(null);
  const bypass = useRef(false);
  const working = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasDraft, setHasDraft] = useState(false);

  const register = useCallback((value: NavigationGuard) => {
    guard.current = value;
    return () => { if (guard.current === value) guard.current = null; };
  }, []);

  const leave = useCallback((action: Action) => {
    // Disable the guard synchronously, including beforeunload and popstate.
    guard.current = null;
    pending.current = null;
    bypass.current = true;
    setOpen(false);
    try {
      void Promise.resolve(action()).catch(() => {
        bypass.current = false;
        setError("تعذّر الانتقال. حاول مرة أخرى.");
      });
    } catch {
      bypass.current = false;
      setError("تعذّر الانتقال. حاول مرة أخرى.");
    }
  }, []);

  const request = useCallback((action: Action) => {
    if (working.current || pending.current || guard.current?.busy) return;
    if (!guard.current?.dirty) { void action(); return; }
    pending.current = action;
    setHasDraft(guard.current.hasDraft);
    setError("");
    setOpen(true);
  }, []);

  useEffect(() => {
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    let index = typeof history.state?.[INDEX] === "number" ? history.state[INDEX] : 0;
    let restoring = false;
    let afterRestore: Action | null = null;
    originalReplace.call(history, { ...history.state, [INDEX]: index }, "");
    const push: History["pushState"] = function (data, unused, url) {
      const next = index + 1;
      originalPush.call(history, { ...data, [INDEX]: next }, unused, url);
      index = next;
      bypass.current = false;
    };
    const replace: History["replaceState"] = function (data, unused, url) {
      originalReplace.call(history, { ...data, [INDEX]: index }, unused, url);
    };
    history.pushState = push;
    history.replaceState = replace;

    function pop(event: PopStateEvent) {
      const target = event.state?.[INDEX];
      if (restoring) {
        event.stopImmediatePropagation();
        if (target !== index) { if (typeof target === "number") history.go(index - target); return; }
        restoring = false;
        const action = afterRestore;
        afterRestore = null;
        if (action) request(action);
        return;
      }
      if (typeof target !== "number") return; // Cross-document exits use beforeunload.
      if (!bypass.current && (guard.current?.dirty || guard.current?.busy || working.current)) {
        const delta = target - index;
        if (!delta) return;
        event.stopImmediatePropagation();
        restoring = true;
        afterRestore = () => history.go(delta);
        history.go(-delta);
      } else {
        index = target;
        bypass.current = false;
      }
    }
    function click(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href);
      if (!["http:", "https:"].includes(url.protocol)) return;
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
      if (!guard.current?.dirty && !guard.current?.busy && !working.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      request(() => {
        if (url.origin === location.origin) router.push(url.pathname + url.search + url.hash);
        else location.assign(url.href);
      });
    }
    function unload(event: BeforeUnloadEvent) {
      if (!bypass.current && (guard.current?.dirty || guard.current?.busy || working.current)) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("popstate", pop, true);
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      if (history.pushState === push) history.pushState = originalPush;
      if (history.replaceState === replace) history.replaceState = originalReplace;
      window.removeEventListener("popstate", pop, true);
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
    };
  }, [request, router]);

  function stay() {
    if (working.current) return;
    pending.current = null;
    setOpen(false);
    setError("");
  }
  async function resolve(save: boolean) {
    if (working.current || !guard.current || !pending.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      if (save) {
        if (!await guard.current.save()) { setError("لم تُحفظ المسودة. بياناتك ما زالت هنا؛ أعد المحاولة."); return; }
      } else await guard.current.discard();
      const action = pending.current;
      if (action) leave(action);
    } catch {
      setError(save ? "تعذّر حفظ المسودة. لم نغادر الصفحة." : "تعذّر حذف المسودة. لم نغادر الصفحة.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return <Context.Provider value={{ register, request, leave }}>
    {children}
    <Dialog.Root open={open} onOpenChange={(value) => { if (!value) stay(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content dir="rtl" className="fixed z-[101] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 shadow-xl" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()}>
          <Dialog.Title className="text-lg font-bold text-slate-800">حفظ الحفلة قبل المغادرة؟</Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-7 text-slate-600">
            لديك بيانات غير محفوظة. يمكنك حفظها في المسودات للرجوع إليها لاحقًا، أو حذفها والمغادرة.
            {hasDraft && " الحذف سيزيل المسودة المحفوظة أيضًا."}
          </Dialog.Description>
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" disabled={busy} onClick={() => void resolve(true)} className="rounded-xl bg-[#1C2D50] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "جارٍ التنفيذ…" : "حفظ في المسودات والمغادرة"}</button>
            <button type="button" disabled={busy} onClick={() => void resolve(false)} className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-50">{hasDraft ? "حذف المسودة والمغادرة" : "حذف البيانات والمغادرة"}</button>
            <button type="button" disabled={busy} onClick={stay} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">البقاء في الصفحة</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </Context.Provider>;
}

export function useNavigationGuard() {
  const value = useContext(Context);
  if (!value) throw new Error("NavigationGuardProvider is required");
  return value;
}
