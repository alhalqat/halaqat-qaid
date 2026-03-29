# منصة متابعة الحلقات - نسخة الإنتاج

## الملفات الأساسية
- `index.html` (واجهة التطبيق + منطق Firebase Realtime Database + Firebase Auth)
- `database.rules.json` (قواعد أمان Realtime Database للإنتاج)
- `manifest.json`
- `icon.svg`
- `assets/association-logo.png`

## إعداد الإنتاج الرسمي (مهم)
1. افتح Firebase Console للمشروع.
2. من `Authentication > Sign-in method` فعّل `Email/Password`.
3. من `Realtime Database > Rules` الصق محتوى `database.rules.json` ثم `Publish`.
4. تأكد أن الموقع محدث على GitHub Pages بعد آخر `push`.

## آلية دخول الكادر
- كل معلم/مشرف/إدارة يدخل بـ `اسم المستخدم + كلمة المرور`.
- عند إضافة موظف جديد من داخل المنصة يتم إنشاء حساب Firebase Authentication تلقائيًا.
- يتم ربط الموظف بـ `authUid` داخل البيانات لضبط الصلاحيات في القواعد.
- الحد الأدنى لكلمة المرور: `6` أحرف.

## ملاحظات تشغيل
- بيانات البنين والبنات مخزنة بشكل منفصل (`quran_platform_mens_v3` و`quran_platform_womens_v3`).
- توجد بيانات مشتركة في `quran_platform_shared_v3`.
- المزامنة السحابية تعمل تلقائيًا مع إمكانية التحديث اليدوي من الإعدادات.
