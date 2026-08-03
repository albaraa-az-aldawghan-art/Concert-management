"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { SearchBox, DateFilterBar, Pagination, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { STATUS_FILTERS, STATUS_LABEL, ConcertStatus4 } from "@/lib/concert-status";
import {
  Package, Plus, Trash2, Pencil, AlertTriangle, CheckCircle2, Barcode,
  Palette, Type, Ruler, Component, Layers, ShieldCheck,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   نظام تصميم الفريج — مرجع حيّ.

   هذه الصفحة تستورد المكوّنات الحقيقية من components/ui، فما تراه
   هنا هو ما تراه في البرنامج حرفياً. أي تعديل على مكوّن يظهر هنا
   فوراً — فلا يشيخ هذا المرجع كما تشيخ لقطات الشاشة.

   الرموز (ألوان، زوايا، ظلال) معرَّفة في app/globals.css.
   ═══════════════════════════════════════════════════════════════ */

/* ── هيكل العرض ── */

function Section({ id, icon, title, subtitle, children }: {
  id: string; icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[#EEF1F7] text-[#1C2D50] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Spec({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-3">
        <p className="font-bold text-slate-800 text-sm">{title}</p>
        {hint && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code dir="ltr" className="inline-block bg-slate-50 border border-slate-200 text-[11px] text-slate-600 rounded-md px-1.5 py-0.5 font-mono">
      {children}
    </code>
  );
}

function Swatch({ name, value, token, dark }: { name: string; value: string; token: string; dark?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="h-14 flex items-end p-2" style={{ background: value }}>
        <span className={`text-[10px] font-mono ${dark ? "text-white/70" : "text-slate-900/50"}`} dir="ltr">{value}</span>
      </div>
      <div className="px-2.5 py-2 bg-white">
        <p className="text-xs font-semibold text-slate-700">{name}</p>
        <p className="text-[10px] text-slate-400 font-mono" dir="ltr">{token}</p>
      </div>
    </div>
  );
}

/* ── الصفحة ── */

export default function DesignSystemPage() {
  const { showToast } = useToast();
  const [openModal, setOpenModal] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [page, setPage] = useState(2);
  const [statusFilter, setStatusFilter] = useState<ConcertStatus4 | "all">("all");

  const nav = [
    { id: "principles", label: "المبادئ" },
    { id: "color", label: "اللون" },
    { id: "type", label: "الطباعة" },
    { id: "space", label: "المسافة والشكل" },
    { id: "components", label: "المكوّنات" },
    { id: "patterns", label: "الأنماط" },
    { id: "rules", label: "قواعد ملزمة" },
  ];

  return (
    <div className="min-h-screen bg-[#F4F6FA]">
      {/* ترويسة */}
      <header className="brand-gradient text-white">
        <div className="max-w-5xl mx-auto px-5 py-10">
          <p className="text-[#B0BDC9] text-xs font-semibold mb-2">الفريج لإدارة الفعاليات</p>
          <h1 className="text-3xl font-bold mb-2">نظام التصميم</h1>
          <p className="text-[#D4DCE8] text-sm max-w-xl leading-relaxed">
            مرجع حيّ يستورد مكوّنات البرنامج نفسها — ما تراه هنا هو ما يراه المستخدم حرفياً،
            فلا يشيخ كما تشيخ لقطات الشاشة.
          </p>
        </div>
      </header>

      {/* تنقّل لاصق */}
      <nav className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 py-2.5 flex gap-1.5 overflow-x-auto">
          {nav.map((n) => (
            <a key={n.id} href={`#${n.id}`}
              className="shrink-0 text-xs font-semibold text-slate-600 hover:text-[#1C2D50] hover:bg-[#EEF1F7] px-3 py-1.5 rounded-lg transition-colors">
              {n.label}
            </a>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-5 py-8 space-y-12">

        {/* ── المبادئ ── */}
        <Section id="principles" icon={<ShieldCheck size={17} />} title="المبادئ الخمسة"
          subtitle="القرارات التي تُحسم مرة واحدة، فلا تُناقَش في كل شاشة">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { t: "الرقم قبل الزخرفة", d: "هذا برنامج تشغيل ومحاسبة. الرقم الصحيح والواضح أهم من أي تأثير بصري، ولا يُزاحمه شيء على الشاشة." },
              { t: "الكحلي للفعل، والدلالي للحالة", d: "الكحلي يعني «هذا زر أساسي»، والأخضر والكهرماني والأحمر تعني حالة حقيقية. لا يُستعمل لون الحالة للزينة أبداً." },
              { t: "قُل ما سيحدث قبل أن يحدث", d: "كل عملية تمسّ رصيداً أو مالاً تعرض أثرها قبل الحفظ: «ستُصبح التكلفة كذا»، «سيُخصم كذا من الرصيد»." },
              { t: "الفراغ ليس خطأً", d: "«لم يُحدَّد» ليست «لا». الحقول الاختيارية تبقى فارغة بلا شارة، فلا يبدو ما لم يُراجَع محسوماً." },
              { t: "الهاتف أولاً", d: "المشرف والمخزن يعملان من الجوّال. النوافذ تصير ألواحاً سفلية، والجداول تنزلق أفقياً وحدها، ومنطقة اللمس لا تقل عن 36 بكسل." },
            ].map((p) => (
              <Card key={p.t}>
                <p className="font-bold text-slate-800 text-sm mb-1">{p.t}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{p.d}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* ── اللون ── */}
        <Section id="color" icon={<Palette size={17} />} title="اللون"
          subtitle="سلّم أساسي واحد، ومحايدات مائلة للأزرق، وأربعة ألوان دلالية">
          <Spec title="السلّم الأساسي — كحلي الفريج"
            hint="الأساسي 800 لكل زر وعنوان مميّز، و900 للشريط الجانبي، و50 لخلفيات الشرح وحلقة التركيز.">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <Swatch name="900 الأعمق" value="#111D35" token="--navy-900" dark />
              <Swatch name="800 الأساسي" value="#1C2D50" token="--navy-800" dark />
              <Swatch name="700 التحويم" value="#263C6E" token="--navy-700" dark />
              <Swatch name="600" value="#3A5490" token="--navy-600" dark />
              <Swatch name="100 الحدود" value="#D4DCE8" token="--navy-100" />
              <Swatch name="50 الخلفية" value="#EEF1F7" token="--navy-50" />
            </div>
          </Spec>

          <Spec title="المحايدات"
            hint="رمادي مائل للأزرق لا رمادي محايد — ينسجم مع الكحلي ولا يبدو متسخاً بجانبه.">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <Swatch name="نص أساسي" value="#0F1729" token="--ink-900" dark />
              <Swatch name="نص داكن" value="#334155" token="--ink-700" dark />
              <Swatch name="نص ثانوي" value="#64748b" token="--ink-500" dark />
              <Swatch name="نص خافت" value="#94a3b8" token="--ink-400" />
              <Swatch name="حدود" value="#E2E8F0" token="--ink-200" />
              <Swatch name="خلفية الصفحة" value="#F4F6FA" token="--canvas" />
            </div>
          </Spec>

          <Spec title="الألوان الدلالية"
            hint="لكل حالة ثلاثية: نص وخلفية وحد. استعمالها للزينة يُفقدها معناها — فلا يعود الأحمر يعني خطراً.">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { n: "نجاح", fg: "#047857", bg: "#ecfdf5", bd: "#a7f3d0", u: "تم الحفظ · رصيد متوفر · فاتورة مسجّلة" },
                { n: "تحذير", fg: "#b45309", bg: "#fffbeb", bd: "#fde68a", u: "ناقص · لم تُسجَّل بعد · غير مؤكدة" },
                { n: "خطر", fg: "#b91c1c", bg: "#fef2f2", bd: "#fecaca", u: "حذف · تالف · نفاد الرصيد · ملغاة" },
                { n: "معلومة", fg: "#1C2D50", bg: "#EEF1F7", bd: "#D4DCE8", u: "شرح · مجاميع · نتيجة محسوبة" },
              ].map((s) => (
                <div key={s.n} className="rounded-xl border p-3" style={{ background: s.bg, borderColor: s.bd }}>
                  <p className="text-sm font-bold mb-1" style={{ color: s.fg }}>{s.n}</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: s.fg, opacity: 0.85 }}>{s.u}</p>
                </div>
              ))}
            </div>
          </Spec>

          <Spec title="ألوان حالة الحفلة" hint="أربع حالات لا غير، مصدرها الوحيد lib/concert-status.ts.">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_LABEL) as ConcertStatus4[]).map((k) => (
                <StatusBadge key={k} status={k} />
              ))}
            </div>
          </Spec>
        </Section>

        {/* ── الطباعة ── */}
        <Section id="type" icon={<Type size={17} />} title="الطباعة"
          subtitle="خط Cairo وحده، وسلّم من ستة مقاسات لا يُخرج عنه">
          <Spec title="السلّم" hint="العناوين ثقيلة (bold 700) والنصوص عادية. لا يُستعمل وزن 300 في نص وظيفي — يضعف على شاشات الجوّال.">
            <div className="space-y-3">
              {[
                { c: "text-3xl font-bold", n: "عنوان الصفحة الكبير", s: "30px / 700" },
                { c: "text-xl font-bold", n: "عنوان قسم", s: "20px / 700" },
                { c: "text-lg font-bold", n: "عنوان بطاقة أو نافذة", s: "18px / 700" },
                { c: "text-sm font-semibold", n: "تسمية حقل وزر", s: "14px / 600" },
                { c: "text-sm", n: "نص المحتوى الأساسي", s: "14px / 400" },
                { c: "text-xs text-slate-500", n: "نص ثانوي وشرح تحت الحقل", s: "12px / 400" },
                { c: "text-[10px] text-slate-400", n: "شارات وباركود ومعلومات هامشية", s: "10px" },
              ].map((t) => (
                <div key={t.s} className="flex items-baseline justify-between gap-4 border-b border-slate-50 pb-2 last:border-none">
                  <span className={t.c}>{t.n}</span>
                  <Code>{t.s}</Code>
                </div>
              ))}
            </div>
          </Spec>

          <Spec title="الأرقام" hint="لاتينية في كل الموقع بلا استثناء، وبأعمدة متساوية العرض في الجداول والمجاميع.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-slate-200 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">صحيح — <Code>tabular-nums-auto</Code></p>
                <p className="tabular-nums-auto text-lg font-bold text-[#1C2D50]">1,250.75 ريال</p>
                <p className="tabular-nums-auto text-lg font-bold text-[#1C2D50]">9,999.00 ريال</p>
              </div>
              <div className="border border-red-200 bg-red-50 rounded-xl p-3">
                <p className="text-xs text-red-600 mb-1">ممنوع — أرقام عربية</p>
                <p className="text-lg font-bold text-red-700">١٬٢٥٠٫٧٥ ريال</p>
                <p className="text-[11px] text-red-600 mt-1">
                  تُطفأ خاصية <Code>anum</Code> عالمياً، ولغة الصفحة <Code>ar-u-nu-latn</Code>.
                </p>
              </div>
            </div>
          </Spec>
        </Section>

        {/* ── المسافة والشكل ── */}
        <Section id="space" icon={<Ruler size={17} />} title="المسافة والشكل"
          subtitle="إيقاع من أربع مسافات، وثلاث زوايا، وظلّان">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Spec title="المسافات" hint="بين عناصر النموذج 12، وبين الأقسام 20، وداخل البطاقة 16–20.">
              <div className="space-y-2">
                {[["8", "gap-2", 8], ["12", "gap-3", 12], ["16", "p-4", 16], ["20", "space-y-5", 20]].map(([n, c, px]) => (
                  <div key={n} className="flex items-center gap-2">
                    <div className="bg-[#1C2D50] h-3 rounded" style={{ width: px as number }} />
                    <Code>{c as string}</Code>
                    <span className="text-[11px] text-slate-400">{n}px</span>
                  </div>
                ))}
              </div>
            </Spec>

            <Spec title="الزوايا" hint="كلما كبر العنصر كبرت زاويته: حقل 12، بطاقة 16، نافذة 24، شارة دائرية.">
              <div className="flex flex-wrap gap-2">
                {[["rounded-lg", "0.5"], ["rounded-xl", "0.75"], ["rounded-2xl", "1"], ["rounded-3xl", "1.5"], ["rounded-full", "∞"]].map(([c, v]) => (
                  <div key={c} className={`w-16 h-16 bg-[#EEF1F7] border-2 border-[#1C2D50] flex items-center justify-center ${c}`}>
                    <span className="text-[10px] font-mono text-[#1C2D50]">{v}</span>
                  </div>
                ))}
              </div>
            </Spec>

            <Spec title="الظلال" hint="طبقتان فقط. الظل يعني ارتفاعاً حقيقياً لا زخرفة.">
              <div className="space-y-3">
                <div className="bg-white rounded-2xl p-3 text-xs text-slate-600" style={{ boxShadow: "var(--shadow-card)" }}>
                  بطاقة — <Code>--shadow-card</Code>
                </div>
                <div className="bg-white rounded-2xl p-3 text-xs text-slate-600" style={{ boxShadow: "var(--shadow-modal)" }}>
                  نافذة — <Code>--shadow-modal</Code>
                </div>
              </div>
            </Spec>
          </div>
        </Section>

        {/* ── المكوّنات ── */}
        <Section id="components" icon={<Component size={17} />} title="المكوّنات"
          subtitle="مستوردة من components/ui — هذه هي نفسها المستعملة في البرنامج">

          <Spec title="الأزرار" hint="زر أساسي واحد لكل شاشة. الأحمر للحذف فقط، والأخضر لإتمام عملية مالية أو تشغيلية.">
            <div className="flex flex-wrap gap-2 mb-4">
              <Button>أساسي</Button>
              <Button variant="secondary">ثانوي</Button>
              <Button variant="outline">محدَّد</Button>
              <Button variant="ghost">شفّاف</Button>
              <Button variant="success">نجاح</Button>
              <Button variant="danger">حذف</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Button size="sm">صغير</Button>
              <Button size="md">متوسط</Button>
              <Button size="lg">كبير</Button>
              <Button loading>جارٍ الحفظ</Button>
              <Button disabled>معطّل</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button><Plus size={16} /> مع أيقونة</Button>
              <Button variant="danger"><Trash2 size={15} /> حذف</Button>
            </div>
          </Spec>

          <Spec title="الحقول" hint="التسمية فوق الحقل دائماً، والشرح تحته، والنجمة الحمراء للمطلوب.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="اسم العميل" placeholder="مثال: أبو سعد" required />
              <Input label="المبلغ (ريال)" type="number" placeholder="0.00" helperText="شامل الضريبة" />
              <Select label="الوحدة" defaultValue="">
                <option value="" disabled>اختر الوحدة</option>
                <option>كجم</option>
                <option>كيس</option>
              </Select>
              <Input label="التاريخ" type="date" />
              <div className="sm:col-span-2">
                <Input label="رقم الفاتورة" error="هذا الرقم مسجّل مسبقاً" defaultValue="12345" />
              </div>
              <div className="sm:col-span-2">
                <Textarea label="ملاحظات" rows={2} placeholder="اكتب ملاحظة..." />
              </div>
            </div>
          </Spec>

          <Spec title="الشارات" hint="الشارة تنقل حالة لا تصنيفاً جمالياً. حالة الحفلة تمرّ عبر StatusBadge حصراً.">
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="blue">أزرق</Badge>
              <Badge variant="green">أخضر</Badge>
              <Badge variant="yellow">كهرماني</Badge>
              <Badge variant="red">أحمر</Badge>
              <Badge variant="gray">رمادي</Badge>
              <Badge variant="indigo">داخلي</Badge>
              <Badge variant="orange">خارجي</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">فاتورة مسجّلة · 12345</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">فاتورة لم تُسجَّل</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EEF1F7] text-[#1C2D50] flex items-center gap-1"><Barcode size={10} /> من التكاليف</span>
            </div>
          </Spec>

          <Spec title="النوافذ والتنبيهات" hint="النافذة لوح سفلي على الجوّال وحوار في المنتصف على الشاشات الكبيرة. تأكيد الحذف يذكر أثره لا سؤالاً مجرداً.">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setOpenModal(true)}>افتح نافذة</Button>
              <Button variant="outline" onClick={() => setOpenConfirm(true)}>تأكيد حذف</Button>
              <Button variant="outline" onClick={() => showToast("تم الحفظ بنجاح")}>تنبيه نجاح</Button>
              <Button variant="outline" onClick={() => showToast("الكمية المتوفرة غير كافية", "error")}>تنبيه خطأ</Button>
            </div>
          </Spec>

          <Spec title="أدوات القوائم" hint="بحث وفلتر تاريخ وترقيم صفحات — مكوّن واحد مشترك، فلا تختلف صفحة عن أخرى.">
            <div className="space-y-3">
              <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الرقم..." />
              <div className="flex gap-2 flex-wrap">
                {STATUS_FILTERS.map((f) => (
                  <button key={f.key} onClick={() => setStatusFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === f.key ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <DateFilterBar value={dateF} onChange={setDateF} title="فلتر بالتاريخ" matchedCount={24} unitLabel="سجل" />
              <Pagination page={page} totalPages={5} onChange={setPage} />
            </div>
          </Spec>

          <Spec title="الجدول" hint="رأس خفيف وصفوف مفصولة بخط باهت. الجدول ينزلق داخل حاويته ولا تنزلق الصفحة معه.">
            <div className="overflow-x-auto -m-1 p-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-3 font-semibold">الصنف</th>
                    <th className="px-4 py-3 font-semibold">الكمية</th>
                    <th className="px-4 py-3 font-semibold">الحالة</th>
                    <th className="px-4 py-3 font-semibold">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { n: "بطاطس", q: "16 كيس", ok: true, v: "400.00" },
                    { n: "زيت", q: "0 تنك", ok: false, v: "0.00" },
                  ].map((r) => (
                    <tr key={r.n} className="border-b border-slate-50 last:border-none">
                      <td className="px-4 py-3 font-semibold text-slate-800">{r.n}</td>
                      <td className={`px-4 py-3 tabular-nums-auto font-semibold ${r.ok ? "text-emerald-600" : "text-red-600"}`}>{r.q}</td>
                      <td className="px-4 py-3">{r.ok ? <Badge variant="green">متوفر</Badge> : <Badge variant="red">نفد</Badge>}</td>
                      <td className="px-4 py-3 tabular-nums-auto font-semibold text-[#1C2D50]">{r.v} ريال</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Spec>

          <Spec title="الحالات الفارغة والتحميل" hint="الفراغ يُشرح ويُقترح له فعل، ولا يُترك بياضاً.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-slate-200 rounded-2xl flex flex-col items-center py-10 text-slate-400">
                <Package size={40} className="mb-3 opacity-40" />
                <p className="text-sm">لا توجد أصناف مطابقة</p>
              </div>
              <div className="border border-slate-200 rounded-2xl flex justify-center items-center py-10">
                <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
              </div>
            </div>
          </Spec>
        </Section>

        {/* ── الأنماط ── */}
        <Section id="patterns" icon={<Layers size={17} />} title="الأنماط المتكرّرة"
          subtitle="تركيبات ثابتة تُنسخ كما هي بدل ابتكار شكل جديد في كل صفحة">

          <Spec title="ترويسة الصفحة" hint="عنوان + سطر يعدّ ما في الصفحة + زر الفعل الأساسي في الطرف المقابل.">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-dashed border-slate-200 rounded-xl p-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800">الوارد</h2>
                <p className="text-sm text-slate-500">7 عمليات وارد مسجّلة</p>
              </div>
              <Button><Plus size={16} /> تسجيل وارد جديد</Button>
            </div>
          </Spec>

          <Spec title="بطاقات المجاميع" hint="ثلاث بطاقات كحدّ أقصى في الصف، والرقم أكبر من تسميته دائماً.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="bg-red-50 border-red-100">
                <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5"><AlertTriangle size={13} /> إجمالي التالف</p>
                <p className="text-lg font-bold text-red-700 tabular-nums-auto mt-1">66.00 ريال</p>
              </Card>
              <Card>
                <p className="text-xs text-slate-500 font-semibold">المحصَّل</p>
                <p className="text-lg font-bold text-slate-700 tabular-nums-auto mt-1">8,000.00 ريال</p>
              </Card>
              <Card>
                <p className="text-xs text-slate-500 font-semibold">الربح</p>
                <p className="text-lg font-bold text-emerald-700 tabular-nums-auto mt-1">6,984.87 ريال</p>
              </Card>
            </div>
          </Spec>

          <Spec title="صندوق الأثر قبل الحفظ" hint="كل عملية تمسّ رصيداً أو مالاً تعرض نتيجتها قبل الضغط — هذا هو المبدأ الثالث في صورته العملية.">
            <div className="text-xs text-slate-600 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-3 py-2.5 leading-relaxed tabular-nums-auto">
              المرتجع يعود للرصيد · التالف لا يعود ويُقيَّد خسارة عامة.
              <br />
              ستُصبح التكلفة المحمَّلة على الحفلة <span className="font-bold text-[#1C2D50]">0.00 ريال</span> (0 صحن استُهلكت فعلاً)
            </div>
          </Spec>

          <Spec title="التنبيه داخل الصفحة" hint="الكهرماني يحذّر مما قد يفوت، والأحمر يمنع. كلاهما يشرح السبب ويقترح الحل.">
            <div className="space-y-2">
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>الكمية غير كافية من: بطاطس — سجّل وارداً أولاً أو أنقص الكمية.</p>
              </div>
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs text-emerald-800">
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                <p>تم التعرّف على الصنف — أكمل بيانات العملية.</p>
              </div>
            </div>
          </Spec>
        </Section>

        {/* ── القواعد ── */}
        <Section id="rules" icon={<ShieldCheck size={17} />} title="قواعد ملزمة"
          subtitle="مخالفتها تُنتج شاشة تبدو صحيحة وتقول شيئاً خاطئاً">
          <Card>
            <ol className="space-y-3">
              {[
                ["الأرقام لاتينية دائماً", "لا locale عربي في أي تنسيق. استعمل toLocaleString(\"en-US\") و tabular-nums-auto في الجداول والمجاميع."],
                ["حالة الحفلة من مصدر واحد", "STATUS_LABEL و STATUS_VARIANT في lib/concert-status.ts. لا تكتب اسم حالة أو لونها يدوياً في صفحة."],
                ["لا لون خارج الرموز", "كل لون في app/globals.css. لون جديد في صفحة يعني رمزاً ناقصاً — أضِفه هنا أولاً."],
                ["زر أساسي واحد", "أكثر من زر كحلي في شاشة واحدة يُفقد المستخدم مكان الفعل المقصود."],
                ["تأكيد الحذف يذكر الأثر", "«سيُخصم 20 كجم من رصيد بطاطس» لا «هل أنت متأكد؟»."],
                ["الاختياري يبقى فارغاً", "لا تملأ حقلاً اختيارياً بقيمة افتراضية توحي بأن أحداً بتّ فيه."],
                ["الجدول ينزلق وحده", "غلّف كل جدول بحاوية overflow-x-auto — الصفحة نفسها لا تنزلق أفقياً أبداً."],
                ["منطقة اللمس ≥ 36 بكسل", "أزرار الأيقونات في الجداول تأخذ padding كافياً — تُستعمل من الجوّال في الموقع."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#1C2D50] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{t}</p>
                    <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader><CardTitle>أين أجد ماذا</CardTitle></CardHeader>
            <div className="space-y-1.5 text-xs">
              {[
                ["الرموز (ألوان، ظلال، زوايا، حركة)", "app/globals.css"],
                ["الأزرار والحقول والبطاقات والنوافذ", "components/ui/"],
                ["أدوات القوائم (بحث، تاريخ، ترقيم)", "components/ui/list-filters.tsx"],
                ["حالات الحفلة وألوانها", "lib/concert-status.ts"],
                ["تنسيق التاريخ وتحويل الأرقام", "lib/utils.ts"],
                ["هذه الصفحة", "app/design-system/page.tsx"],
              ].map(([what, where]) => (
                <div key={where} className="flex items-center justify-between gap-3 border-b border-slate-50 pb-1.5 last:border-none">
                  <span className="text-slate-600">{what}</span>
                  <Code>{where}</Code>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <footer className="text-center text-xs text-slate-400 pt-4 pb-8">
          الفريج لإدارة الفعاليات — نظام التصميم · يُحدَّث تلقائياً مع كل تعديل على المكوّنات
        </footer>
      </main>

      {/* عروض حيّة */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="نموذج نافذة">
        <div className="space-y-4">
          <Input label="اسم الصنف" placeholder="مثال: لحم بقر بدون عظم" required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="الكمية" type="number" placeholder="0" />
            <Input label="التاريخ" type="date" />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" onClick={() => setOpenModal(false)}>إلغاء</Button>
            <Button onClick={() => { setOpenModal(false); showToast("تم الحفظ بنجاح"); }}>حفظ</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={openConfirm}
        onClose={() => setOpenConfirm(false)}
        onConfirm={() => { setOpenConfirm(false); showToast("تم الحذف"); }}
        title="حذف عملية الوارد"
        message="سيُخصم 20 كجم من رصيد «بطاطس». متابعة؟"
        confirmLabel="حذف"
      />
    </div>
  );
}
