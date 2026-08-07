"use client";

/* «من قام بالعملية»: يعرض اسم المستخدم ودوره بجانب أي عملية في النظام. */

import { createContext, useContext, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserRole } from "@/types";
import { UserRound } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   كل عملية تُخزَّن بمعرّف صاحبها (createdBy) لا باسمه — والاسم قد
   يتغيّر لاحقاً فيجب أن يتبعه العرض. لذلك يُقرأ جدول المستخدمين مرة
   واحدة ويُشارَك على كل الصفحات، فلا تُستعلم قاعدة البيانات مرة لكل صف.
   ═══════════════════════════════════════════════════════════════ */

const ROLE_LABEL: Record<string, string> = {
  admin: "المدير",
  warehouse_manager: "مسؤول الموارد",
  supervisor: "مشرف",
  employee: "موظف",
  kitchen: "المطبخ",
  custom: "دور مخصص",
};

export interface ActorInfo {
  name: string;
  role: UserRole | string;
  roleLabel: string;
}

interface ActorsCtx {
  actors: Record<string, ActorInfo>;
  loading: boolean;
  /** يُعيد بيانات المنفِّذ، وإن لم يُعرف أعاد null بدل اسم مخترع */
  actorOf: (uid?: string | null) => ActorInfo | null;
}

const Ctx = createContext<ActorsCtx>({ actors: {}, loading: true, actorOf: () => null });

export function ActorsProvider({ children }: { children: React.ReactNode }) {
  const [actors, setActors] = useState<Record<string, ActorInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        if (cancelled) return;
        const map: Record<string, ActorInfo> = {};
        for (const d of snap.docs) {
          const u = d.data() as { name?: string; role?: string; customRoleName?: string };
          map[d.id] = {
            name: u.name ?? "—",
            role: (u.role as UserRole) ?? "custom",
            roleLabel: ROLE_LABEL[u.role ?? ""] ?? "مستخدم",
          };
        }
        setActors(map);
      } catch {
        // قائمة المستخدمين محجوبة عن بعض الأدوار — تُترك فارغة بلا كسر
        setActors({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function actorOf(uid?: string | null): ActorInfo | null {
    if (!uid) return null;
    return actors[uid] ?? null;
  }

  return <Ctx.Provider value={{ actors, loading, actorOf }}>{children}</Ctx.Provider>;
}

export function useActors() {
  return useContext(Ctx);
}

/** سطر «بواسطة: فلان (المدير)» — يُخفى إن لم يُعرف المنفِّذ */
export function Actor({
  uid,
  prefix = "بواسطة",
  className = "",
  showIcon = true,
}: {
  uid?: string | null;
  prefix?: string;
  className?: string;
  showIcon?: boolean;
}) {
  const { actorOf } = useActors();
  const a = actorOf(uid);
  if (!a) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] text-slate-400 ${className}`}>
      {showIcon && <UserRound size={10} className="shrink-0" />}
      {prefix}: <span className="font-semibold text-slate-500">{a.name}</span>
      <span className="text-slate-400">({a.roleLabel})</span>
    </span>
  );
}
