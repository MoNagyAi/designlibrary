# إعداد Push Notifications المجانية لـ Design Library

النظام المستخدم:
- Firebase Cloud Messaging (FCM) لاستقبال الإشعارات في تطبيق Android.
- Cloudflare Worker مجاني لحماية بيانات Firebase السرية وإرسال الإشعارات من لوحة الويب.

## 1) إنشاء Firebase Project
1. افتح Firebase Console وأنشئ مشروعًا جديدًا.
2. أضف Android App بالحزمة:
   `dlfatcom.buntyfrombengal.riyantalks`
3. من إعدادات المشروع احصل على:
   - Firebase App ID
   - Web API Key
   - Project ID
   - Project Number / Sender ID
4. افتح Pages CMS وعدّل `push-config.json` وأدخل القيم السابقة ثم اجعل `enabled: true`.

> نسخة التطبيق v50 لا تحتاج `google-services.json` لأنها تهيئ Firebase من `push-config.json`.

## 2) إنشاء Service Account
من Firebase / Google Cloud:
1. Project settings → Service accounts.
2. Generate new private key.
3. من ملف JSON ستحتاج:
   - `project_id`
   - `client_email`
   - `private_key`

لا تضع هذه البيانات داخل GitHub أو Pages CMS.

## 3) إنشاء Cloudflare Worker مجاني
1. افتح Cloudflare Dashboard → Workers & Pages → Create Worker.
2. انسخ محتوى:
   `cloudflare-worker/fcm-worker.js`
3. أضف Environment Variables / Secrets التالية:
   - `FIREBASE_PROJECT_ID` = قيمة `project_id`
   - `FIREBASE_CLIENT_EMAIL` = قيمة `client_email`
   - `FIREBASE_PRIVATE_KEY` = قيمة `private_key`
   - `ADMIN_KEY` = كلمة سر طويلة من اختيارك
4. أضف Variable عادي:
   - `ALLOWED_ORIGIN` = `https://monagyai.github.io`
5. Deploy.
6. انسخ رابط الـWorker مثل:
   `https://designlibrary-push.<account>.workers.dev`
7. ضعه في `workerUrl` داخل `push-config.json` من Pages CMS.

## 4) اختبار الإشعارات
1. افتح تطبيق v50 على هاتف Android واتركه متصلًا بالإنترنت.
2. عند Android 13+ وافق على إذن الإشعارات.
3. افتح:
   `https://monagyai.github.io/designlibrary/notifications-admin.html`
4. اختر:
   - كل المستخدمين
   - مستخدمو العربية
   - English users
5. اكتب العنوان والرسالة.
6. أدخل `ADMIN_KEY`.
7. اضغط إرسال.

## الروابط داخل الإشعار
يمكن وضع:
- صفحة داخل المكتبة مثل: `كروت_شخصية_عربي.html`
- أو رابط كامل HTTPS.

عند الضغط على الإشعار، تفتح الصفحة المطلوبة داخل التطبيق إذا كانت من Design Library.
