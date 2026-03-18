# نسخة مقارنة: نظام متابعة الحلقات

هذه نسخة مستقلة بالكامل للمقارنة مع نسختك السابقة.

## الملفات
- `index.html`
- `service-worker.js`
- `manifest.json`
- `icon.svg`
- `firestore.rules`

## التشغيل
1. افتح `index.html` وعدل بيانات `window.__firebase_config` بقيم مشروعك من Firebase Console.
2. شغّل المشروع عبر خادم محلي (مثل Live Server في VS Code).
3. افتح الرابط المحلي (مثل `http://127.0.0.1:5500/index.html`).

## الميزات
- واجهة عربية RTL.
- أقسام رجال/نساء.
- إضافة حلقة + إضافة طلاب + إدارة أسابيع الطالب.
- حفظ في Firestore بهيكل:
  - `apps/{appId}/sections/{section}/halaqas/{halaqaId}`
  - `.../students/{studentId}`
  - `.../students/{studentId}/weeks/{weekId}`
- دعم Offline عبر Firestore persistence.
- PWA أساسي عبر Service Worker + Manifest.

## ملاحظات مهمة
- في هذه النسخة تم استخدام تسجيل دخول مجهول `Anonymous Auth` للتجربة.
- قواعد `firestore.rules` الحالية مخصصة للتطوير فقط. قبل الإنتاج يجب تشديد الصلاحيات.
