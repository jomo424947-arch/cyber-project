# 🔐 دليل الإصلاح الأمني الكامل — CCMS
**تاريخ الإصدار:** 2026-08-24  
**مستوى الأولوية:** حرج — يجب التنفيذ قبل أي نشر إنتاجي

---

## ⚠️ نتائج فحص تسريب المفتاح في تاريخ Git

```
SUPABASE_SERVICE_ROLE_KEY مُكشوف في الـ commits التالية:
  - 2650599  "Update project and exclude build artifacts"  (Jul 30, 2026)
  - ad1b1cf  "khairy here"                                (Jul 20, 2026)
  - 7b85c46  commit أقدم
  - 6284cc8  "Initial commit"
```

> [!CAUTION]
> هذه الـ commits موجودة في تاريخ Git المحلي. إذا رُفع المشروع يوماً لـ GitHub/GitLab/Bitbucket العامة، فالمفتاح اعتُبر مخترقاً ويجب تدويره فوراً حتى لو لم تكن الـ repo عامة الآن.

---

## 1️⃣ تدوير SUPABASE_SERVICE_ROLE_KEY (يجب التنفيذ الآن)

### خطوات تدوير المفتاح في لوحة تحكم Supabase

1. افتح **[https://supabase.com/dashboard](https://supabase.com/dashboard)** وادخل على مشروعك
2. اذهب إلى: **Settings → API**
3. في قسم **"Service role (secret)"** — انقر **"Rotate"** أو **"Regenerate"**
4. انسخ المفتاح الجديد واحفظه في مكان آمن
5. **لا تضع المفتاح الجديد في أي ملف يمكن رفعه لـ Git**

### تحديث ملف `.env` المحلي

```bash
# server/.env  أو  .env في جذر المشروع (لا يُرفع لـ Git)
SUPABASE_SERVICE_ROLE_KEY=YOUR_NEW_ROTATED_KEY_HERE
```

### التحقق من أن `.env` مدرج في `.gitignore`

```bash
# تشغيل هذا الأمر من جذر المشروع للتحقق
git check-ignore -v .env
# يجب أن يُظهر: .gitignore:27:.env
```

**الحالة:** ✅ ملف `.env` مُدرج في `.gitignore` بالفعل في السطر 27

---

## 2️⃣ التعامل مع تسريب المفتاح في تاريخ Git

### الخيار المُوصى: حذف الـ Secret من السجل القديم

> [!WARNING]
> لا تُنفّذ هذه الخطوات إلا على repo خاص ولم يتم fork له. إذا كان مشتركاً مع آخرين، يجب التنسيق معهم أولاً.

```bash
# استخدام git-filter-repo لإزالة المفتاح من التاريخ كاملاً
# 1. تثبيت الأداة
pip install git-filter-repo

# 2. إنشاء ملف يحتوي على النص المراد إزالته
echo "SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdXFtZmdoY3BncG1xbnl6Z3dyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjgyNDc1MSwiZXhwIjoyMDk4NDAwNzUxfQ.uaHvt6wKLE6v5X4oj2i_Zxz8KR1oYDKPRCcMokc40Zc" > /tmp/secrets.txt

# 3. تشغيل التنقية (تستبدل المفتاح بـ ***REDACTED***)
git filter-repo --replace-text /tmp/secrets.txt

# 4. Force push للـ remote (إذا كان المشروع مرفوعاً)
git push origin --force --all
git push origin --force --tags
```

> [!TIP]
> الحل الأسرع والأأمن: تأكد من تدوير المفتاح في Supabase أولاً. بعد التدوير، المفتاح القديم يصبح ميتاً ولا يصلح لشيء حتى لو رآه أحد في تاريخ Git.

---

## 3️⃣ التحقق من عدم استخدام المفتاح في الـ Frontend

```bash
# تشغيل البحث في كود الواجهة الأمامية
grep -r "SUPABASE_SERVICE_ROLE_KEY\|service_role" client/src/
# النتيجة المتوقعة: لا شيء ✅

grep -r "SUPABASE_SERVICE_ROLE_KEY\|service_role" client/
# النتيجة المتوقعة: لا شيء ✅
```

**نتيجة الفحص:** ✅ المفتاح غير موجود في أي ملف `client/src/` — يُستخدم فقط في `server/src/lib/cloud-supabase.ts` عبر `process.env`.

---

## 4️⃣ عزل الفروع في Supabase RLS — Migration 015

### الحالة قبل الإصلاح (ثغرة)

```sql
-- سياسة خاطئة: تسمح لأي موظف في أي فرع برؤية كل الجلسات
create policy "staff read sessions"
  on public.sessions for select to authenticated
  using ( public.is_staff() );  -- ❌ بدون tenant_id
```

### الحالة بعد الإصلاح (Migration 015)

```sql
-- سياسة صحيحة: موظف الفرع (أ) لا يرى إلا جلسات فرعه
create policy "staff read sessions"
  on public.sessions for select to authenticated
  using (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()  -- ✅ عزل الفرع
  );
```

### الجداول التي طُبّق عليها الإصلاح في Migration 015

| # | الجدول | نوع الإصلاح |
|---|--------|-------------|
| 1 | `devices` | إضافة `AND tenant_id = current_tenant_id()` |
| 2 | `customers` | إضافة `AND tenant_id = current_tenant_id()` |
| 3 | `sessions` | إضافة `AND tenant_id = current_tenant_id()` |
| 4 | `invoices` | إضافة `AND tenant_id = current_tenant_id()` |
| 5 | `reservations` | إضافة `AND tenant_id = current_tenant_id()` |
| 6 | `products` | إضافة `AND tenant_id = current_tenant_id()` |
| 7 | `rooms` | إضافة `AND tenant_id = current_tenant_id()` |
| 8 | `shifts` | إضافة `AND tenant_id = current_tenant_id()` |
| 9 | `shift_expenses` | إضافة `AND tenant_id = current_tenant_id()` |
| 10 | `session_orders` | فلترة عبر `EXISTS (SELECT 1 FROM sessions WHERE tenant_id = ...)` |
| 11 | `standalone_orders` | إضافة `AND tenant_id = current_tenant_id()` |
| 12 | `product_stock_logs` | إضافة `AND tenant_id = current_tenant_id()` |
| 13 | `session_pauses` | إضافة `AND tenant_id = current_tenant_id()` |
| 14 | `session_transfers` | إضافة `AND tenant_id = current_tenant_id()` |
| 15 | `session_audit_log` | فلترة عبر `EXISTS (SELECT 1 FROM sessions WHERE tenant_id = ...)` |
| 16 | `users` | تقييد القراءة على نفس الفرع |

### كيفية تطبيق Migration 015 على Supabase

1. افتح **Supabase Dashboard → SQL Editor**
2. انسخ محتوى `server/migrations/015_rls_tenant_isolation.sql` بالكامل
3. الصقه في محرر SQL وانقر **"Run"**
4. تحقق باستخدام استعلام التحقق في نهاية الملف

---

## 5️⃣ إصلاح تسريب طلبات الكافيه في sync-engine.ts

### الملف: `server/src/lib/sync-engine.ts` (السطر ~388)

```diff
- // 10. Pull session orders (café orders tied to gaming sessions)
- const { data: sessionOrders } = await cloudSupabase
-   .from('session_orders')
-   .select('*');   // ❌ يسحب طلبات الكافيه لجميع الفروع!

+ // 10. Pull session orders (café orders tied to gaming sessions)
+ // SECURITY FIX: session_orders has no direct tenant_id column.
+ // Filter by joining with sessions that belong to this tenant.
+ const { data: sessionOrders } = await cloudSupabase
+   .from('session_orders')
+   .select('*, session:sessions!inner(tenant_id)')
+   .eq('session.tenant_id', tenantId);  // ✅ مصفاة بالفرع
```

**الحالة:** ✅ تم تطبيق الإصلاح

---

## 6️⃣ سيناريوهات الاختبار للتحقق من عزل الفروع

### اختبار 1: RLS على الجلسات

```sql
-- في Supabase SQL Editor
-- 1. سجّل دخول بـ JWT لمستخدم من الفرع (أ)
-- 2. نفّذ الاستعلام التالي:
SELECT count(*) FROM public.sessions;

-- قبل migration 015: يعيد عدد جلسات جميع الفروع
-- بعد migration 015: يعيد فقط جلسات الفرع (أ) ← النتيجة الصحيحة
```

### اختبار 2: اختبار يدوي عبر API

```bash
# 1. احصل على JWT لمستخدم في فرع (أ)
TOKEN_A="<jwt-for-branch-A>"

# 2. احصل على ID جلسة تخص فرع (ب)
SESSION_ID_B="<session-id-from-branch-B>"

# 3. حاول الوصول لجلسة الفرع (ب) باستخدام صلاحية الفرع (أ)
curl -H "Authorization: Bearer $TOKEN_A" \
     http://localhost:5000/api/sessions/$SESSION_ID_B

# النتيجة المتوقعة بعد الإصلاح: 404 Not Found
# النتيجة قبل الإصلاح: 200 OK (ثغرة أمنية!)
```

### اختبار 3: اختبار SQL مباشر للتحقق من RLS

```sql
-- شغّل هذا في Supabase SQL Editor باستخدام Role = authenticated
-- عبر إعداد JWT claim محاكاة
SELECT set_config('request.jwt.claims', 
  '{"sub": "<user-id-branch-A>", "role": "authenticated"}', true);

SELECT count(*) FROM public.sessions;
-- يجب أن يعيد فقط جلسات فرع هذا المستخدم
```

---

## 7️⃣ ملخص الملفات المُعدَّلة/المُنشأة

| الملف | نوع التعديل | الوصف |
|-------|-------------|-------|
| `server/migrations/015_rls_tenant_isolation.sql` | **جديد** ✨ | Migration يُصلح عزل الفروع في 16 جدول |
| `server/src/lib/sync-engine.ts` | **مُعدَّل** 🔧 | إصلاح استعلام `session_orders` ليصفّى بالفرع |
| `.gitignore` | **لا تعديل** ✅ | `.env` مدرج بالفعل في السطر 27 |

---

## 8️⃣ الخطوات الإجمالية المطلوبة (Checklist)

- [ ] تدوير `SUPABASE_SERVICE_ROLE_KEY` من لوحة تحكم Supabase
- [ ] تحديث `.env` بالمفتاح الجديد
- [ ] تطبيق `015_rls_tenant_isolation.sql` على Supabase
- [ ] التحقق من نجاح المزامنة بعد الإصلاح (تشغيل السيرفر واختبار `/api/sessions`)
- [ ] تشغيل سيناريوهات الاختبار أعلاه للتحقق من العزل
- [ ] اختياري: تنظيف تاريخ Git باستخدام `git-filter-repo`
