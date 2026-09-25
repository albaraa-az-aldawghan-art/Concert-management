"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCostIncoming, getCostItems, getCostOutgoing, getCostProductions } from "@/lib/firestore/costs";
import { CostIncoming, CostItem, CostOutgoing, CostProduction } from "@/types";
import { PageHeader, PageShell, StatCard, LoadingState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Boxes, CircleDollarSign, FlaskConical, Package, PackageMinus, PackagePlus } from "lucide-react";

const balance = (item: CostItem) => (item.totalIn ?? 0) - (item.totalOut ?? 0);
const value = (item: CostItem) => item.totalInValue ?? 0;

export default function CostsDashboardPage() {
  const [items, setItems] = useState<CostItem[]>([]);
  const [incoming, setIncoming] = useState<CostIncoming[]>([]);
  const [outgoing, setOutgoing] = useState<CostOutgoing[]>([]);
  const [productions, setProductions] = useState<CostProduction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCostItems(), getCostIncoming(), getCostOutgoing(), getCostProductions()])
      .then(([i, inc, out, prod]) => { setItems(i); setIncoming(inc); setOutgoing(out); setProductions(prod); })
      .finally(() => setLoading(false));
  }, []);

  const data = useMemo(() => {
    const raw = items.filter((i) => (i.kind ?? "raw") === "raw");
    const recipes = items.filter((i) => (i.productionRecipe?.length ?? 0) > 0 || i.kind === "produced");
    const shortages = raw.filter((i) => balance(i) <= 0);
    return {
      raw: raw.length,
      recipes: recipes.length,
      shortages,
      stockValue: items.reduce((sum, i) => sum + value(i), 0),
    };
  }, [items]);

  if (loading) return <LoadingState label="جارٍ تجهيز لوحة التكاليف..." />;

  const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return (
    <PageShell>
      <PageHeader title="لوحة التكاليف" eyebrow="التكاليف"
        description="ملخص المخزون والوصفات وحركة الوارد والمنصرف والإنتاج" icon={CircleDollarSign} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="قيمة المخزون الحالية" value={money(data.stockValue)} suffix="ريال" icon={CircleDollarSign} />
        <StatCard label="المواد الخام" value={data.raw.toLocaleString("en-US")} suffix="مادة" icon={Package} tone="neutral" />
        <StatCard label="الوصفات القياسية" value={data.recipes.toLocaleString("en-US")} suffix="وصفة" icon={FlaskConical} tone="success" />
        <StatCard label="مواد بلا رصيد" value={data.shortages.length.toLocaleString("en-US")} suffix="مادة" icon={AlertTriangle} tone="danger" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-bold text-slate-800 mb-3">الوصول السريع</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["المواد الخام", "/admin/costs/raw", Package],
              ["الوصفات القياسية", "/admin/costs/production", FlaskConical],
              ["رصيد الأصناف", "/admin/costs/balance", Boxes],
              ["المنصرف", "/admin/costs/outgoing", PackageMinus],
            ].map(([label, href, Icon]) => (
              <Link key={href as string} href={href as string}
                className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Icon size={16} /> {label as string}
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="font-bold text-slate-800 mb-3">حركة النظام</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-emerald-50 p-3"><PackagePlus className="mx-auto text-emerald-600" size={18} /><p className="mt-2 text-xl font-bold text-emerald-700">{incoming.length}</p><p className="text-xs text-slate-500">وارد</p></div>
            <div className="rounded-xl bg-violet-50 p-3"><FlaskConical className="mx-auto text-violet-600" size={18} /><p className="mt-2 text-xl font-bold text-violet-700">{productions.length}</p><p className="text-xs text-slate-500">إنتاج</p></div>
            <div className="rounded-xl bg-amber-50 p-3"><PackageMinus className="mx-auto text-amber-600" size={18} /><p className="mt-2 text-xl font-bold text-amber-700">{outgoing.length}</p><p className="text-xs text-slate-500">منصرف</p></div>
          </div>
        </Card>
      </div>

      {data.shortages.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3"><AlertTriangle size={17} className="text-red-600" /><h2 className="font-bold text-slate-800">مواد تحتاج انتباهًا</h2></div>
          <div className="flex flex-wrap gap-2">
            {data.shortages.slice(0, 12).map((i) => <span key={i.id} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">{i.name}</span>)}
          </div>
        </Card>
      )}
    </PageShell>
  );
}
