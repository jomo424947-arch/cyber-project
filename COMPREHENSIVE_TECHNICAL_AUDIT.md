# 📋 تقرير الفحص التقني الشامل والمعمّق لنظام CCMS
**المشروع:** Cyber Cafe Management System (CCMS)  
**البيئة المعمارية:** React 18 / TypeScript (Frontend) + Node.js / Express (Backend) + SQLite / sql.js (Local DB) + Supabase (Cloud Multi-Tenant Sync)  
**التاريخ:** 2026-08-24  
**الحالة:** تدقيق فني شامل للكود الفعلي قبل الإطلاق الإنتاجي  

---

## 🚨 ملخص تنفيذي: أهم 4 مخاطر حرجة يجب معالجتها فوراً

> [!CAUTION]
> **1. انعدام عزل الفروع في سياسات الأمان (Multi-Tenant Isolation Breach):**
> جميع جداول Supabase في `schema.sql` تحتوي على سياسات RLS تفحص فقط `is_staff()` دون التحقق من تطابق `tenant_id = current_tenant_id()`. يمكن لأي موظف أو كاشير في أي مقهى/فرع قراءة وتعديل بيانات وفواتير وجلسات الفروع الأخرى بالكامل عبر الـ API.

> [!CAUTION]
> **2. تسريب المفتاح السري الكامل (`SUPABASE_SERVICE_ROLE_KEY`):**
> المفتاح السري موجود بنصه الصريح في ملف `.env`. هذا المفتاح يمنح صلاحيات Superadmin كاملة لتجاوز الـ RLS وحذف أو تعديل قاعدة البيانات السحابية بالكامل. يجب تدويره (Rotate) فوراً وحذفه من تتبع Git.

> [!WARNING]
> **3. تدمير البيانات وتسريب طلبات الكافيه أثناء المزامنة الشاملة (Full Fetch & Overwrite):**
> دالة `pullFromCloud` في `sync-engine.ts` تجلب كامل الجداول كل 60 ثانية بدون تصفية زمنية (Incremental Sync) وتنفذ `INSERT OR REPLACE` محلياً، مما يمسح التعديلات المحلية غير المرفوعة. كما تسحب طلبات الكافيه لجميع الفروع (`session_orders`) دون تصفية الفرع.

> [!WARNING]
> **4. سباق بيانات وتضارب مالي في إيرادات الوردية (Race Condition in Shift Revenue):**
> دالة `endSession` في `sessions.controller.ts` تقرأ إجمالي إيراد الوردية المفتوحة وتجمعه في ذاكرة التطبيق ثم تعيد كتابته، بدلاً من استخدام الـ Atomic Increment في قاعدة البيانات. إنهاء جلستين متزامنتين يؤدي لضياع قيمة إحدى الفواتير من إجمالي الوردية.

---

## 📊 جدول نتائج الفحص والتدقيق الفني الشامل (مرتب حسب الخطورة)

| الملف / الدالة (السطر) | المشكلة التقنية الدقيقة | الخطورة | السيناريو المسبب | الأثر الفعلي على البيانات / المستخدم | الإصلاح المقترح |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`schema.sql:L165-L640`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/schema.sql#L165-L640) | سياسات RLS في Supabase لا تفحص `tenant_id = current_tenant_id()` في كل الجداول | **حرج** | قيام كاشير في فرع (أ) بالاستعلام عن الجلسات/الفواتير عبر Supabase Client | تسريب كامل لبيانات العملاء والأجهزة والمبيعات بين المقاهي المشتركة بالسحابة | تعديل كل سياسات RLS لتشترط `tenant_id = public.current_tenant_id()` |
| [`.env:L4`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/.env#L4) | وجود `SUPABASE_SERVICE_ROLE_KEY` مكشوفاً في ملف البيئة | **حرج** | تسريب المفتاح من مستودع الأكواد أو وصول أي مستخدم للـ bundle | اختراق كامل لقاعدة البيانات السحابية وتجاوز كافة صلاحيات RLS | تدوير المفتاح (Rotate Key) فوراً واستخدامه عبر Backend آمن فقط |
| [`sync-engine.ts:L388-L408`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/server/src/lib/sync-engine.ts#L388-L408) | استعلام `session_orders` يسحب كل طلبات الكافيه لجميع الفروع بدون تصفية `tenant_id` | **حرج** | تشغيل المزامنة التلقائية كل دقيقة في أي جهاز فرعي | تنزيل ومزج طلبات الكافيه لجميع العملاء والمقاهي الأخرى في القاعدة المحلية | إضافة `.eq('tenant_id', tenantId)` أو ربطها بالـ sessions الخاصة بالفرع |
| [`sessions.controller.ts:L838-L844`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/server/src/controllers/sessions.controller.ts#L838-L844) | سباق بيانات (Read-Modify-Write Race) عند زيادة إيراد الوردية المفتوحة | **حرج** | إنهاء جلستين مدفوعتين في نفس اللحظة على جهازين مختلفين | ضياع قيمة إحدى الفاتورتين من إجمالي إيراد الوردية وظهور عجز وهمي في الدرج | استخدام `UPDATE shifts SET total_revenue = total_revenue + ?` كعملية ذرية |
| [`sync-engine.ts:L58-L524`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/server/src/lib/sync-engine.ts#L58-L524) | المزامنة تستخدم `SELECT *` لجميع الجداول مع `INSERT OR REPLACE` محلياً | **حرج** | تعديل بيانات جهاز أو عميل محلياً أثناء انقطاع النت ثم عودة الاتصال | مسح التعديلات المحلية (Data Loss) واستبدالها بالبيانات القديمة من السحابة | تطبيق Incremental Sync يعتمد على `updated_at > last_synced_at` والتحقق من `synced = 0` |
| [`local-db.ts:L727-L731`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/server/src/lib/local-db.ts#L727-L731) | دالة `_execUpdate` تتجاهل تسجيل السجل في `sync_queue` إذا لم يكن الشرط `WHERE id = ...` | **حرج** | تنفيذ تحديث جماعي أو تحديث بشرط آخر مثل `eq('status', 'available')` | عدم رفع التعديلات السحابية وبقاء السحابة بحالة قديمة غير متزامنة | استخراج كافة الـ IDs المعدلة وإدراجها في طابور المزامنة `sync_queue` |
| [`local-db.ts:L808-L818`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/server/src/lib/local-db.ts#L808-L818) | ابتلاع أخطاء فشل الإدراج في `sync_queue` بصمت داخل `catch {}` فارغ | **حرج** | امتلاء القرص أو قفل القاعدة عند محاولة كتابة صف في طابور الرفع | فقدان العملية من طابور الرفع وعدم مزامنتها مع السحابة للأبد | تسجيل الخطأ في السجلات وتنبيه النظام بعدم اكتمال تسجيل المزامنة |
| [`sessions.controller.ts:L778-L945`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/server/src/controllers/sessions.controller.ts#L778-L945) | انعدام الـ Transaction عند تشغيل السيرفر في Cloud Mode (مباشرة مع Supabase) | **متوسط** | حدوث خطأ في شبكة السحابة أثناء إنشاء الفاتورة بعد إنهاء الجلسة | إنهاء الجلسة وتحرير الجهاز دون تسجيل فاتورة (جلسة مجانية غير مقيدة) | تغليف العملية داخل Postgres RPC أو Transaction موحدة في السحابة |
| [`database.ts:L659-L665`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/server/src/lib/database.ts#L659-L665) | تصدير كامل قاعدة البيانات وكتابتها للقرص بشكل متزامن `fs.writeFileSync` | **متوسط** | تضخم حجم قاعدة البيانات مع مرور الوقت وكثرة العمليات اليومية | تجميد مؤقت لـ Event Loop وبطء استجابة السيرفر لطلبات الكاشير | استخدام مكتبة SQLite حقيقية مثل `better-sqlite3` تدعم الـ WAL المباشر |
| [`auth.controller.ts:L192-L197`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/server/src/controllers/auth.controller.ts#L192-L197) | جلب كل جدول المستخدمين في الذاكرة لتسجيل الدخول المحلي | **متوسط** | نمو عدد المستخدمين والتحقق من كلمة المرور محلياً | استهلاك غير مبرر للذاكرة وبطء عملية الـ Login | تنفيذ الاستعلام كـ `SELECT * FROM users WHERE email = ?` مباشرة |
| [`useAsync.ts:L7-L39`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/client/src/hooks/useAsync.ts#L7-L39) | دالة `fn` محبوسة في Stale Closure وغياب التحقق من Unmount | **متوسط** | استخدام متغيرات متغيرة داخل `fn` أو مغادرة الصفحة أثناء التحميل | أخطاء تسريب الذاكرة وتحميل بيانات قديمة عند تغير الـ Props | استخدام `useRef` للدالة `fn` واستخدام `isMountedRef` لتفادي تحديث حالة المكون بعد تدميره |
| [`BillingPage.tsx:L92-L94`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/client/src/pages/BillingPage.tsx#L92-L94) | تنفيذ Side Effect لتحديث الحالة `setCurrentPage(1)` داخل `useMemo` | **متوسط** | تغيير فلتر الفواتير أو البحث في صفحة الفواتير | تحذيرات Render-phase state update وإعادة رندر غير متوقعة | نقل إعادة ضبط الصفحة إلى `useEffect` أو دالة معالجة التغيير `onChange` |
| [`useNow.ts:L7-L14`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/client/src/hooks/useNow.ts#L7-L14) | إعادة رندر الصفحة بالكامل كل 1000ms بدلاً من عزل العداد داخل الكارت | **متوسط** | فتح صفحة الأجهزة أو الداشبورد بوجود 30+ جهاز نشط | استهلاك مرتفع للمعالج وإعادة حساب الـ DOM والمصفوفات كل ثانية | نقل `useNow` إلى داخل مكون `DeviceCard` فقط لمنع إعادة رندر الصفحة كاملة |
| [`schema.sql:L331-L334`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/schema.sql#L331-L334) | وجود أسطر كود SQL يتيمة وخاطئة قواعدياً بعد `session_transfers` | **منخفض** | تنفيذ الـ Schema على بيئة Supabase جديدة | فشل تنفيذ ملف `schema.sql` بالكامل بسبب Syntax Error | حذف الأسطر الزائدة من السطر 331 إلى 334 في `schema.sql` |
| [`Modal.tsx:L18-L25`](file:///c:/Users/jomo4/OneDrive/Desktop/CCMS/client/src/components/ui/Modal.tsx#L18-L25) | إعادة تسجيل `keydown` Event Listener مع كل إعادة رندر للمودال | **منخفض** | فتح المودال وتحديث أي State بداخله عبر الكتابة في الحقول | إنشاء وحذف مستمع الأحداث مع كل حرف يُكتب | استخدام `useRef` لـ `onClose` داخل الـ `useEffect` |

---

## 🔎 التفاصيل التقنية والتحليل المعماري للمحاور الثمانية

### 1. مشاكل التزامن والـ Race Conditions
- **تضارب إيرادات الوردية المفتوحة:**
  في `sessions.controller.ts` (السطر 838)، الكود التالي يسبب فقداناً مالياً:
  ```typescript
  const newRev = Number(activeShift.total_revenue || 0) + finalTotalCost;
  await supabase.from('shifts').update({ total_revenue: newRev }).eq('id', activeShift.id);
  ```
  لو انتهت جلستان في نفس اللحظة بقيم (50 ج و 100 ج) وكانت الوردية 200 ج، كلاهما سيقرأ 200 ج، أحدهما يكتب 250 ج والآخر يكتب 300 ج، فتضيع 50 ج.
- **تضارب الـ In-Memory SQLite مع المزامنة غير المتزامنة:**
  محرك `sql.js` يعمل بالكامل في الذاكرة. عند بدء دورة المزامنة `runSync`، ينتظر السيرفر السحابة (`await cloudSupabase...`). خلال هذا الانتظار، يقبل السيرفر طلبات HTTP لتعديل الجلسات. عند انتهاء استجابة السحابة، يقوم `pullFromCloud` بالكتابة فوق الذاكرة ومسح التعديل المحلي الذي حدث للتو.

---

### 2. سلامة المزامنة (Offline-First Sync Integrity)
- **غياب آلية فض النزاع (Conflict Resolution):**
  المزامنة لا تطبق مقارنة `updated_at` (Last-Write-Wins ذكي) أو تفريغ التغييرات حقلاً بحقل، بل تعتمد `INSERT OR REPLACE` أعمى.
- **تسريب طلبات الكافيه لجميع الفروع:**
  في `sync-engine.ts` (السطر 390):
  ```typescript
  const { data: sessionOrders } = await cloudSupabase.from('session_orders').select('*');
  ```
  هذا السطر يسحب كافة طلبات الكافيه لجميع المقاهي في السحابة دون تحديد `tenant_id`.

---

### 3. الأداء وإعادة الرندر (React Performance)
- **خطأ React في `BillingPage.tsx`:**
  ```tsx
  // Lines 92-94: Bad pattern
  useMemo(() => {
    setCurrentPage(1);
  }, [filter, search]);
  ```
  تحديث الحالة داخل `useMemo` يؤدي إلى إعادة رندر غير متزامنة ومشاكل في تتبع الـ State.
- **إعادة رندر الـ Dashboard بالكامل كل ثانية:**
  استدعاء `useNow(1000)` في جذر `DashboardPage` و `DevicesPage` يجبر React على إعادة رندر الصفحة كاملة وإعادة فلترة وحساب مصفوفات الأجهزة والغرف والطلبات في كل ثانية بدلاً من تحديث عداد الوقت المنقضي فقط داخل `DeviceCard`.

---

### 4. القدرة على التحمل (Load & Scalability)
- **عنق زجاجة الـ Full Fetch:**
  مع وصول الفرع إلى 5,000 جلسة و 10,000 فاتورة، جلب كافة الجداول بدون `WHERE updated_at > ?` يستهلك مئات الميجابايتات ويجمد المتصفح والسيرفر كل 60 ثانية.
- **حفظ قاعدة البيانات في القرص بشكل تزامني:**
  `saveDatabase()` في `database.ts` تقوم بتصدير البايتات كاملة من الذاكرة وكتابتها بالقرص عبر `fs.writeFileSync()` كل 5 ثوانٍ وعند كل عملية بيع، مما يوقف معالجة السيرفر مع نمو حجم ملف `ccms.db`.

---

### 5. الأمان (Security & Multi-Tenancy)
- **ثغرة RLS في Supabase:**
  كل السياسات في `schema.sql` مبنية بهذا الشكل:
  ```sql
  create policy "staff read sessions"
    on public.sessions for select to authenticated
    using ( public.is_staff() );
  ```
  الموظف في فرع (A) يملك JWT صالح، وبالتالي `is_staff()` تعيد `true`، فيتمكن من قراءة وفحص وتعديل فواتير الفرع (B).
  **الحل:**
  ```sql
  create policy "staff read sessions"
    on public.sessions for select to authenticated
    using ( public.is_staff() and tenant_id = public.current_tenant_id() );
  ```

---

### 6. الأخطاء الصامتة ومعالجة الفشل (Error Handling)
- **ابتلاع أخطاء طابور المزامنة:**
  في `local-db.ts` (السطر 815):
  ```typescript
  try {
    db.run(`INSERT INTO sync_queue ...`);
  } catch {
    // Non-critical — sync will catch up on next online check
  }
  ```
  هذا التعليق غير صحيح، لأن السجل إذا لم يدخل `sync_queue` فلن يتم رفعه نهائياً عند عودة الاتصال.

---

### 7. تسريبات الذاكرة والموارد (Memory & Resource Leaks)
- **عدم إلغاء الوعود (Uncancelled Promises) في المكونات:**
  في `DeviceCard.tsx` (السطر 643) و `SessionOrdersRow.tsx` (السطر 23)، يتم استدعاء دوال غير ملغاة تقوم بـ `setState` بعد إغلاق المودال أو انهيار الصف.

---

### 8. جودة الكود العامة (Code Quality & Structure)
- **ملفات ضخمة بحاجة لتقسيم:**
  - `ShiftsPage.tsx` (1544 سطراً) يحتوي على 5 مودالات وجداول ملخصات مدمجة.
  - `sessions.controller.ts` (1320 سطراً) يحتوي على كافة تفاصيل الحسابات المالية والتحويلات والتدقيق.
- **تكرار منطق فحص الوردية:**
  كود البحث عن وردية الموظف ثم وردية الفرع مكرر نصياً في `startSession` و `endSession` و `startStandaloneSale` بدلاً من استخدام Helper مشترك.

---

## 🛠️ خطة العمل المقترحة للمعالجة (Action Plan)

1. **المرحلة 1 (الأمان الفوري):**
   - تدوير `SUPABASE_SERVICE_ROLE_KEY` في لوحة تحكم Supabase وحذفه من ملفات البيئة المرفوعة.
   - تشغيل Migration فورية لتحديث جميع سياسات RLS في Supabase وإلزام شرط `tenant_id = current_tenant_id()`.
2. **المرحلة 2 (سلامة البيانات والمالية):**
   - تعديل `sessions.controller.ts` لجعل زيادة إيراد الوردية ذرية (`UPDATE shifts SET total_revenue = total_revenue + ?`).
   - إضافة تصفية `tenant_id` لجدول `session_orders` في `sync-engine.ts`.
   - تعديل دالة `_execUpdate` في `local-db.ts` لتسجيل كافة الصفوف المعدلة في `sync_queue`.
3. **المرحلة 3 (أداء المزامنة والـ Frontend):**
   - تحويل `pullFromCloud` إلى مزامنة تزايدية (Incremental Sync) بناءً على `updated_at`.
   - نقل `useNow` إلى داخل `DeviceCard` فقط لعزل التحديثات اللحظية.
   - تصحيح خطأ `useMemo` في `BillingPage.tsx`.
