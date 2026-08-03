# مخططات نظام الفريج

خمسة مخططات ترسم البرنامج كما يعمل فعلاً. تُقرأ مع [دليل التكاليف](costs-guide.md) و[نظام التصميم](design-system.md).

النسخة التفاعلية منشورة كصفحة مستقلة؛ وهذه النسخة تعيش مع الكود فتتغيّر معه.

---

## 1. المسار الكامل — من الشراء إلى الربح

السلسلة التي يقوم عليها البرنامج. كل سهم عملية يسجّلها مستخدم، وكل صندوق حالة تُحفظ في قاعدة البيانات.

> ⚠️ **إنشاء الحفلة لا يخصم شيئاً.** عرض المتوفر والتكلفة التقديرية قراءة فقط؛ المخزون لا ينزل إلا بتسجيل **منصرف** فعلي.

```mermaid
flowchart RL
    S([المورد]) --> A

    subgraph COSTS [قسم التكاليف]
      direction RL
      A["الوارد<br/>كمية + سعر قبل الضريبة"] --> B[("مخزون الخامات<br/>الرصيد ومتوسط السعر")]
      B --> C{"الإنتاج<br/>دمج خامات"}
      C --> D[("خلطة جاهزة<br/>لها باركود وتكلفة وحدة")]
    end

    D --> E["صنف أكل مرتبط بالباركود"]

    subgraph CONC [قسم الحفلات]
      direction RL
      E --> F["إنشاء الحفلة<br/>عرض المتوفر والتكلفة التقديرية"]
      F --> G["تأكيد الحفلة"]
      G --> H["المنصرف<br/>خصم فعلي + تحميل على العميل"]
    end

    H --> I{"بعد الحفلة"}
    I -->|استُهلكت| J["تكلفة على الحفلة"]
    I -->|رجعت صالحة| K["إرجاع للمخزون"]
    I -->|تلفت| L["خسارة تالف"]
    K -.->|يعود الرصيد| B

    J --> P["الربحية<br/>الصافي قبل الضريبة − التكاليف"]
    M["فواتير المصروفات<br/>سيارات · عمالة · أخرى"] --> P
    N["مواد الموارد الخارجية"] --> P
    L --> Q["خسائر عامة<br/>لا تُحمَّل على حفلة"]

    classDef store fill:#eef2ff,stroke:#6366f1,color:#312e81
    classDef act fill:#ffffff,stroke:#94a3b8,color:#0f172a
    classDef money fill:#ecfdf5,stroke:#10b981,color:#065f46
    classDef bad fill:#fef2f2,stroke:#ef4444,color:#991b1b
    classDef ext fill:#EEF1F7,stroke:#1C2D50,color:#1C2D50
    class B,D store
    class A,C,E,F,G,H,I,M,N act
    class J,P money
    class L,Q bad
    class S,K ext
```

---

## 2. دورة حياة الحفلة

أربع حالات لا غير، ومصدرها الوحيد `lib/concert-status.ts`. مراحل التشغيل الخمس تُشتقّ من علامات محفوظة ولا تُعدّ حالات مستقلة.

```mermaid
stateDiagram-v2
    direction RL
    [*] --> غير_مؤكدة: إنشاء الحفلة
    غير_مؤكدة --> مؤكدة: أول دفعة أو تأكيد يدوي
    مؤكدة --> مكتملة: سداد كامل المبلغ
    غير_مؤكدة --> ملغاة
    مؤكدة --> ملغاة
    مكتملة --> [*]
    ملغاة --> [*]

    note right of مؤكدة
      هنا فقط تُقبل
      فواتير المصروفات
    end note

    note right of ملغاة
      تكاليفها المصروفة حقيقية
      وتظهر في الربحية كخسارة
    end note
```

---

## 3. أين يُخصم المخزون وأين تُحمَّل التكلفة

كل عملية وما تكتبه بالضبط. وكل ما يمسّ المخزون يجري في معاملة واحدة — تنجح كاملة أو لا تجري.

| العملية | الرصيد | تكلفة الحفلة | عكسها |
|---|---|---|---|
| وارد | يرتفع | — | الحذف يخصم الكمية والقيمة |
| إنتاج | مدخلات ↓ · مُنتَج ↑ | — | الحذف يعكس الطرفين |
| منصرف على حفلة | ينخفض | ترتفع | الحذف يعيد ما بقي خارجاً فقط |
| إرجاع (تسوية) | يرتفع | تنخفض | جزئي وعلى دفعات |
| تالف | لا يعود | تنخفض | يُقيَّد خسارة عامة |

```mermaid
flowchart RL
    subgraph OPS [العملية]
      direction RL
      O1[وارد]
      O2[إنتاج]
      O3[منصرف]
      O4[إرجاع]
      O5[تالف]
    end

    subgraph EFF [ما يتغيّر]
      direction RL
      E1["رصيد الخام<br/>+ قيمة الشراء"]
      E2["خصم المدخلات<br/>+ إدخال المُنتَج بتكلفته"]
      E3["خصم الرصيد<br/>+ تكلفة على العميل"]
      E4["رجوع الرصيد<br/>− تكلفة العميل"]
      E5["خروج بلا رجوع<br/>+ خسارة عامة"]
    end

    O1 --> E1
    O2 --> E2
    O3 --> E3
    O4 --> E4
    O5 --> E5

    classDef op fill:#EEF1F7,stroke:#1C2D50,color:#1C2D50
    classDef up fill:#ecfdf5,stroke:#10b981,color:#065f46
    classDef down fill:#fffbeb,stroke:#f59e0b,color:#92400e
    classDef bad fill:#fef2f2,stroke:#ef4444,color:#991b1b
    class O1,O2,O3,O4,O5 op
    class E1,E2,E4 up
    class E3 down
    class E5 bad
```

---

## 4. بنية البيانات

مجموعات Firestore والعلاقة بينها. الحقول المشتقّة (المدفوع، تكلفة المواد، المصروفات) لا تُكتب يدوياً بل تُعاد من مصدرها بعد كل تغيير.

> 🔗 الربط بين الأكل والتكاليف **بالباركود لا بالاسم** — نفس الاسم قد يكون خلطتين مختلفتين في قسمين بتكلفتين مختلفتين.

```mermaid
erDiagram
    concerts ||--o{ concert_items : "مواد"
    concerts ||--o{ concert_food : "أصناف أكل"
    concerts ||--o{ concert_payments : "دفعات"
    concerts ||--o{ concert_expenses : "فواتير مصروفات"
    concerts ||--o{ cost_outgoing : "خامات مصروفة"
    concerts ||--o{ concert_logs : "سجل"

    cost_items ||--o{ cost_incoming : "مشتريات"
    cost_items ||--o{ cost_outgoing : "صرف"
    cost_items ||--o{ cost_damage : "تالف"
    cost_items ||--o{ cost_production : "مُنتَج"
    cost_items }o--o{ cost_production : "مدخلات"

    food_categories ||--o{ concert_food : "يُختار منها"
    food_categories }o--|| cost_items : "وصفة بالباركود"

    warehouse_items ||--o{ concert_items : "تُحجز"
    users ||--o{ concerts : "مشرف أو موظف"
    custom_roles ||--o{ users : "صلاحيات"
```

---

## 5. الأدوار ومن يرى ماذا

طبقتان تحكمان الوصول: **الصلاحية** تحجب عن شخص، و**إيقاف الميزة** من مركز التحكم يغلقها على الجميع.

```mermaid
flowchart RL
    ADMIN([المدير]) --> ALL["كل الصفحات<br/>+ مركز التحكم"]
    CUSTOM([دور مخصص]) --> PERMS{"الصلاحيات<br/>الممنوحة"}
    PERMS --> P1[الحفلات]
    PERMS --> P2[التكاليف]
    PERMS --> P3[الموارد]
    PERMS --> P4[الربحية]

    SUP([مشرف]) --> S1["حفلاته فقط<br/>خطوات التنفيذ"]
    EMP([موظف]) --> S2["مهامه المسندة"]
    KIT([المطبخ]) --> S3["طلبات المطبخ"]
    WH([مسؤول الموارد]) --> S4["المخزون والطلبات"]

    GATE{{"مركز التحكم<br/>إيقاف ميزة"}} -.->|يغلقها للجميع| P2
    GATE -.-> P4

    classDef role fill:#EEF1F7,stroke:#1C2D50,color:#1C2D50
    classDef page fill:#ffffff,stroke:#94a3b8,color:#0f172a
    classDef gate fill:#fffbeb,stroke:#f59e0b,color:#92400e
    class ADMIN,CUSTOM,SUP,EMP,KIT,WH role
    class ALL,P1,P2,P3,P4,S1,S2,S3,S4 page
    class GATE,PERMS gate
```
