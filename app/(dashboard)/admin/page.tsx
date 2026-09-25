"use client";

/* لوحة تحكم المدير: مؤشرات الحفلات والمال والموارد في نظرة واحدة. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers } from "@/lib/firestore/users";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getConcerts } from "@/lib/firestore/concerts";
import { getAllMissingItems } from "@/lib/firestore/missing-items";
import { ActivityFeed } from "@/components/activity-feed";
import { Card } from "@/components/ui/card";
import { LoadingState, PageHeader, PageShell, StatCard } from "@/components/ui/page";
import { tsToDateStr } from "@/components/ui/list-filters";
import { Concert } from "@/types";
import { STATUS_LABEL, normalizeStatus, statusLabel } from "@/lib/concert-status";
import { isOverdueConcert, remainingAmount } from "@/lib/overdue-concerts";
import {
  Users, Package, Music, AlertTriangle, ChevronLeft,
  TrendingUp, Wallet, Clock, CalendarDays, BarChart3, LayoutDashboard,
  UtensilsCrossed, FileSignature,
} from "lucide-react";

function calcHallCost(c: Concert): number {
  if (!c.hallCostType || !c.hallCostValue) return 0;
  if (c.hallCostType === "percentage") return (c.price ?? 0) * c.hallCostValue / 100;
  return c.hallCostValue;
}

export default function AdminDashboard() {
  const { feat, can } = useAuth();
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [usersCount, setUsersCount] = useState(0);
  const [itemsCount, setItemsCount] = useState(0);
  const [missingCount, setMissingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [users, items, c, missing] = await Promise.all([
        getAllUsers(), getWarehouseItems(), getConcerts(), getAllMissingItems(),
      ]);
      setUsersCount(users.length);
      setItemsCount(items.length);
      setConcerts(c);
      setMissingCount(missing.length);
      setLoading(false);
    }
    load();
  }, []);

  // يُحسب بعد التوحيد فلا تسقط أي حفلة خارج الأعمدة كما كان يحدث سابقاً
  const planned   = concerts.filter((c) => normalizeStatus(c.status) === "planned").length;
  const confirmed = concerts.filter((c) => normalizeStatus(c.status) === "confirmed").length;
  const completed = concerts.filter((c) => normalizeStatus(c.status) === "completed").length;
  const cancelled = concerts.filter((c) => normalizeStatus(c.status) === "cancelled").length;

  const totalRevenue    = concerts.reduce((s, c) => s + (c.price ?? 0), 0);
  const totalCollected  = concerts.reduce((s, c) => s + (c.deposit ?? 0), 0);
  const totalRemaining  = totalRevenue - totalCollected;
  const totalHall       = concerts.reduce((s, c) => s + calcHallCost(c), 0);
  const totalTransport  = concerts.reduce((s, c) => s + (c.transportCost ?? 0), 0);
  const collectionRate  = totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 100) : 0;

  const overdueConcerts = concerts.filter((concert) => isOverdueConcert(concert));
  const overdueAmount = overdueConcerts.reduce((s, c) => s + remainingAmount(c), 0);

  // لوحة التشغيل تعرض أقرب الحفلات زمنياً أولاً، ثم الحفلات الماضية من الأحدث.
  const today = new Date().toISOString().slice(0, 10);
  const recent = [...concerts]
    .sort((a, b) => {
      const ad = tsToDateStr(a.date);
      const bd = tsToDateStr(b.date);
      const aPast = ad !== "" && ad < today;
      const bPast = bd !== "" && bd < today;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aPast ? bd.localeCompare(ad) : ad.localeCompare(bd);
    })
    .slice(0, 5);

  if (loading) {
    return <LoadingState label="جارٍ تجهيز لوحة التحكم..." />;
  }

  return (
    <PageShell>
      <PageHeader
        title="صباح الخير، هذه نظرة عامة على العمل"
        eyebrow="لوحة التحكم"
        description="الأقسام الرئيسية والمتابعات المالية والتشغيلية في مكان واحد"
        icon={LayoutDashboard}
      />

      {/* الأقسام الرئيسية الثلاثة مستقلة وواضحة؛ خدمات كل قسم تظهر داخله. */}
      <section className="space-y-3">
        <div className="section-heading">
          <div>
            <h2 className="section-title">الأقسام الرئيسية</h2>
            <p className="section-description">ابدأ من مجال العمل، ثم انتقل إلى أدواته وتفاصيله.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {[
            {
              label: "المطعم",
              description: "إدارة حركة المطعم اليومية ومنتجات البيع والإنتاج بترتيبها الخاص.",
              href: "/admin/restaurant",
              permission: "restaurant" as const,
              icon: UtensilsCrossed,
              hint: "فتح إدارة المطعم",
            },
            {
              label: "التعاقدات",
              description: "إدارة أقسام التعاقدات مثل نتي، والأصناف والكميات وتسجيل الأيام.",
              href: "/admin/contracts",
              permission: "contracts" as const,
              icon: FileSignature,
              hint: "فتح التعاقدات",
            },
            {
              label: "الحفلات",
              description: "الحفلات واتفاقيات العملاء والمطبخ والموارد والمشرفون في مسار واحد.",
              href: "/admin/concerts",
              permission: "concerts" as const,
              icon: Music,
              hint: `${concerts.length.toLocaleString("en-US")} حفلة مسجّلة`,
              featured: true,
            },
          ].filter((section) => can(section.permission)).map((section) => {
            const Icon = section.icon;
            return (
              <Link key={section.href} href={section.href} className="group block">
                <Card className={`main-section-card h-full ${section.featured ? "main-section-card-featured" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="main-section-icon"><Icon size={21} /></div>
                    <ChevronLeft size={18} className="text-slate-300 transition-transform group-hover:-translate-x-1 group-hover:text-[#1C2D50]" />
                  </div>
                  <h3 className="mt-4 text-base font-extrabold text-slate-900">{section.label}</h3>
                  <p className="mt-1.5 text-xs leading-6 text-slate-500">{section.description}</p>
                  <p className="mt-3 text-[11px] font-bold text-[#3A5490]">{section.hint}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* الملخص المالي مركزي، بينما تفاصيل الربحية تبقى داخل نشاطها. */}
      <div className="section-heading">
        <div>
          <h2 className="section-title">الملخص المالي</h2>
          <p className="section-description">إجماليات موحّدة للمتابعة السريعة، مع التفاصيل الكاملة في القائمة المالية.</p>
        </div>
        {can("finances") && (
          <Link href="/admin/finances" className="text-xs font-bold text-[#1C2D50] hover:underline inline-flex items-center gap-1">
            فتح القائمة المالية <ChevronLeft size={13} />
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {[
          { key: "rev",       label: "إجمالي الإيرادات", value: totalRevenue, icon: TrendingUp, tone: "navy" as const, suffix: "ريال" },
          { key: "collected", label: "إجمالي المحصَّل", value: totalCollected, icon: Wallet, tone: "success" as const, suffix: "ريال" },
          { key: "remaining", label: "إجمالي المتبقي", value: totalRemaining, icon: Clock, tone: "warning" as const, suffix: "ريال" },
          { key: "overdue",   label: "المتأخرات من المدفوعات", value: overdueAmount, icon: AlertTriangle, tone: "danger" as const, suffix: "ريال", hint: `${overdueConcerts.length} حفلة` },
          { key: "costs",     label: "مصاريف القاعات والنقل", value: totalHall + totalTransport, icon: BarChart3, tone: "neutral" as const, suffix: "ريال" },
        ].filter((s) => feat("dashboard", s.key)).map((s) => (
          s.key === "overdue" ? (
            <Link key={s.key} href="/admin/finances?filter=overdue" className="block">
              <StatCard className="h-full hover:ring-1 hover:ring-red-200" label={s.label}
                value={s.value.toLocaleString("en-US")} icon={s.icon} tone={s.tone}
                suffix={s.suffix} hint={`${s.hint} · عرض التفاصيل`} />
            </Link>
          ) : <StatCard key={s.label} label={s.label} value={s.value.toLocaleString("en-US")}
            icon={s.icon} tone={s.tone} suffix={s.suffix} hint={s.hint} />
        ))}
      </div>

      {/* Collection Rate */}
      {feat("dashboard", "collection_rate") && <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-slate-800">نسبة التحصيل</h3>
            <p className="text-xs text-slate-400 mt-0.5">من إجمالي إيرادات جميع الحفلات</p>
          </div>
          <span className={`text-2xl font-bold ${collectionRate >= 75 ? "text-emerald-600" : collectionRate >= 40 ? "text-orange-500" : "text-red-500"}`}>
            {collectionRate}%
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-700 ${collectionRate >= 75 ? "bg-emerald-500" : collectionRate >= 40 ? "bg-orange-400" : "bg-red-400"}`}
            style={{ width: `${collectionRate}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span>{totalCollected.toLocaleString("en-US")} ريال محصَّل</span>
          <span>{totalRemaining.toLocaleString("en-US")} ريال متبقي</span>
        </div>
      </Card>}

      {/* Stats Row */}
      {feat("dashboard", "counters") && <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "المستخدمون", value: usersCount, icon: <Users size={18} />, href: "/admin/users", color: "text-[#1C2D50]", bg: "bg-[#EEF1F7]" },
          { label: "أغراض الموارد", value: itemsCount, icon: <Package size={18} />, href: "/admin/warehouse", color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "المفقودات", value: missingCount, icon: <AlertTriangle size={18} />, href: "/admin/missing-items", color: "text-red-600", bg: "bg-red-50" },
          { label: "الحفلات الكلية", value: concerts.length, icon: <Music size={18} />, href: "/admin/concerts", color: "text-violet-600", bg: "bg-violet-50" },
        ].map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${s.bg} ${s.color} flex items-center justify-center shrink-0`}>
                  {s.icon}
                </div>
                <div>
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Concert Status Chart */}
        {feat("dashboard", "status_chart") && <Card>
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <CalendarDays size={16} className="text-violet-600" />
            حالة الحفلات
          </h3>
          <div className="space-y-4">
            {[
              { label: STATUS_LABEL.planned,   value: planned,   color: "bg-yellow-400",  text: "text-yellow-700",  bg: "bg-yellow-50" },
              { label: STATUS_LABEL.confirmed, value: confirmed, color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
              { label: STATUS_LABEL.completed, value: completed, color: "bg-slate-400",   text: "text-slate-600",   bg: "bg-slate-50" },
              { label: STATUS_LABEL.cancelled, value: cancelled, color: "bg-red-400",     text: "text-red-600",     bg: "bg-red-50" },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-slate-600">{s.label}</span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.value}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${s.color}`}
                    style={{ width: concerts.length > 0 ? `${(s.value / concerts.length) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>

          {feat("dashboard", "costs") && (
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-xs text-slate-400">مصاريف القاعات</p>
                <p className="font-bold text-slate-700">{totalHall.toLocaleString("en-US")} ريال</p>
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-xs text-slate-400">مصاريف النقل</p>
                <p className="font-bold text-slate-700">{totalTransport.toLocaleString("en-US")} ريال</p>
              </div>
            </div>
          )}
        </Card>}

        {/* Recent Concerts */}
        {feat("dashboard", "recent") && <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Music size={16} className="text-violet-600" />
              آخر الحفلات
            </h3>
            <Link href="/admin/concerts" className="text-xs text-[#1C2D50] font-semibold hover:underline flex items-center gap-1">
              عرض الكل <ChevronLeft size={12} />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">لا توجد حفلات</p>
          ) : (
            <div className="space-y-2">
              {recent.map((c) => {
                const remaining = (c.price ?? 0) - (c.deposit ?? 0);
                return (
                  <Link key={c.id} href={`/admin/concerts/${c.id}`}>
                    <div className="flex items-center justify-between bg-slate-50 hover:bg-[#EEF1F7] rounded-xl px-3 py-2.5 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.price?.toLocaleString("en-US")} ريال</p>
                      </div>
                      <div className="text-left shrink-0 mr-2">
                        <p className={`text-xs font-bold ${remaining > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                          {remaining > 0 ? `متبقي ${remaining.toLocaleString("en-US")}` : "مكتمل"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {statusLabel(c.status)}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100">
            <Link href="/admin/finances" className="flex items-center justify-center gap-2 text-sm font-semibold text-[#1C2D50] hover:text-[#111D35] transition-colors py-1">
              <BarChart3 size={16} />
              عرض القائمة المالية الكاملة
            </Link>
          </div>
        </Card>}
      </div>

      {/* Quick Actions */}
      {feat("dashboard", "quick_links") && <Card>
        <h3 className="font-bold text-slate-800 mb-3">روابط سريعة</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "إنشاء حفلة", href: "/admin/concerts/new", icon: <Music size={16} />, color: "bg-violet-50 text-violet-700 hover:bg-violet-100" },
            { label: "القائمة المالية", href: "/admin/finances", icon: <BarChart3 size={16} />, color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
            { label: "إضافة مستخدم", href: "/admin/users", icon: <Users size={16} />, color: "bg-[#EEF1F7] text-[#1C2D50] hover:bg-[#D4DCE8]" },
            { label: "المفقودات", href: "/admin/missing-items", icon: <AlertTriangle size={16} />, color: "bg-red-50 text-red-700 hover:bg-red-100" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 p-3 rounded-xl text-sm font-semibold transition-colors ${link.color}`}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </div>
      </Card>}
      <ActivityFeed />
    </PageShell>
  );
}
