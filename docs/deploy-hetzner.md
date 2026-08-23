# رفع المزرعة على Hetzner بدومين zadfarm.net

خادم واحد، أربع حاويات، دومين واحد. كل ما يلي مُجرَّب على هذا الكود قبل كتابته.

| ما يعمل | أين |
| --- | --- |
| لوحة الإدارة | `https://zadfarm.net` |
| الـ API | `https://zadfarm.net/api/v1/` |
| توثيق الـ API | `https://zadfarm.net/api/docs/` |
| لوحة Django | `https://zadfarm.net/admin/` |

اللوحة والـ API خلف **نفس الدومين**: سجل DNS واحد، شهادة واحدة، ولا سياسة
CORS أصلًا لأن المتصفح ينادي نفس الأصل الذي فتحه.

---

## ١. أنشئ الخادم

من <https://console.hetzner.cloud> → **New Project** → **Add Server**:

- **Location**: Nuremberg أو Falkenstein (ألمانيا) — الأقرب للشرق الأوسط.
- **Image**: Ubuntu 24.04
- **Type**: **CX22** (2 vCPU · 4 GB · 40 GB) — يكفي مزرعة بآلاف الحيوانات.
- **SSH Key**: ألصق مفتاحك العام. إن لم يكن لديك واحد:
  `ssh-keygen -t ed25519` ثم انسخ `~/.ssh/id_ed25519.pub`.
- **Name**: `zadfarm`

انسخ عنوان **IPv4** بعد الإنشاء.

## ٢. وجّه الدومين

عند مسجّل الدومين، أنشئ سجلّين واحذف ما عداهما لهذين الاسمين:

| النوع | الاسم | القيمة |
| --- | --- | --- |
| A | `@` | عنوان IPv4 للخادم |
| A | `www` | نفس العنوان |

انتظر حتى يجيب `nslookup zadfarm.net` بالعنوان الصحيح (دقائق عادة، وقد تطول
لساعات). **لا تكمل قبل ذلك** — Let's Encrypt تفحص الدومين قبل أن تعطي الشهادة.

## ٣. جهّز الخادم

```bash
ssh root@عنوان-الخادم

apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh          # يثبّت Docker و Compose
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## ٤. أنزل الكود

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/<حسابك>/<المستودع>.git zadfarm
cd zadfarm
```

> **لا مستودع على GitHub بعد؟** ارفعه من جهازك مرة واحدة — وهذا أفضل طريق
> لأن كل تحديث بعدها يصير `git pull`:
>
> ```powershell
> gh auth login        # اختر: GitHub.com → HTTPS → Login with a web browser
> cd D:\farm
> gh repo create zadfarm --private --source=. --remote=origin --push
> ```
>
> **أو بلا GitHub** — أرسل نسخة مضغوطة من جهازك (بلا `.venv` ولا
> `node_modules`، فهي تُبنى على الخادم):
>
> ```powershell
> cd D:\farm
> git archive --format=zip -o $env:TEMP\zadfarm.zip HEAD
> scp $env:TEMP\zadfarm.zip root@عنوان-الخادم:/opt/
> ```
>
> ثم على الخادم: `apt install -y unzip && mkdir -p /opt/zadfarm && unzip
> /opt/zadfarm.zip -d /opt/zadfarm && cd /opt/zadfarm`.
> (`git archive` يرسل ما هو محفوظ في Git فقط، فلا يحمل قاعدتك المحلية ولا
> أسرارك.)

## ٥. اكتب الأسرار

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

املأ خمسة أسطر لا غير:

```ini
DOMAIN=zadfarm.net
ACME_EMAIL=بريدك@مثال.com
DJANGO_SECRET_KEY=<الصق ناتج: openssl rand -base64 48>
POSTGRES_PASSWORD=<الصق ناتج: openssl rand -base64 24>
OWNER_PASSWORD=<كلمة مرور دخولك، ١٢ حرفًا فأكثر>
```

احفظ بـ `Ctrl+O` ثم `Ctrl+X`.

## ٦. شغّل

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

أول مرة تأخذ ٣–٦ دقائق (بناء الصورتين). تابع ما يجري:

```bash
docker compose -f deploy/docker-compose.yml logs -f
```

انتظر حتى ترى `أُنشئت المزرعة ... فارغة وجاهزة` ثم `Listening at:`، واخرج
بـ `Ctrl+C`. الشهادة تُطلب وتُركَّب وحدها في نفس اللحظة.

افتح <https://zadfarm.net> وادخل بـ `owner` وكلمة المرور التي كتبتها.

## ٧. نسخة احتياطية يومية

كل شيء داخل قاعدة البيانات — حتى صور الحيوانات والفواتير — فملف واحد يكفي:

```bash
crontab -e
```

وأضف السطر:

```cron
0 3 * * * cd /opt/zadfarm && sh deploy/backup.sh >> /var/log/zadfarm-backup.log 2>&1
```

تُحفظ النسخ في `/opt/zadfarm/backups/`، ويُبقى على آخر ٣٠ منها. أنزل نسخة إلى
جهازك بين الحين والآخر: `scp root@عنوان-الخادم:/opt/zadfarm/backups/*.gz .`

---

## بعد النشر

**تحديث الكود بعد أي تعديل:**

```bash
cd /opt/zadfarm && git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

الترحيلات تجري وحدها عند الإقلاع، والبيانات لا تُمسّ.

**نسيت كلمة المرور:** اجعل `OWNER_PASSWORD_RESET=1` في `deploy/.env`، ثم
`docker compose -f deploy/docker-compose.yml up -d api`، ثم **أعدها إلى 0**.

**استعادة نسخة احتياطية:**

```bash
gunzip -c backups/zadfarm-2026-08-23-0300.sql.gz | \
  docker compose -f deploy/docker-compose.yml exec -T db psql -U farm -d farm
```

**نقل بيانات أدخلتها على جهازك** (إن كنت قد بدأت الإدخال محليًا قبل النشر):

```powershell
# على جهازك
cd backend
..\.venv\Scripts\python manage.py dumpdata --natural-foreign --natural-primary `
  -e contenttypes -e auth.permission -e sessions --indent 2 -o farm-data.json
scp farm-data.json root@عنوان-الخادم:/opt/zadfarm/
```

```bash
# على الخادم — على قاعدة لم يُدخل فيها شيء بعد
docker compose -f deploy/docker-compose.yml cp farm-data.json api:/tmp/d.json
docker compose -f deploy/docker-compose.yml exec api python manage.py loaddata /tmp/d.json
```

**أوامر تنفع:**

```bash
docker compose -f deploy/docker-compose.yml ps          # حالة الحاويات
docker compose -f deploy/docker-compose.yml logs -f api # سجل الخادم
docker compose -f deploy/docker-compose.yml restart api # إعادة تشغيل
sh deploy/backup.sh                                     # نسخة احتياطية الآن
```

## ما الذي يعمل خلف الستار

| الحاوية | دورها |
| --- | --- |
| `caddy` | يستقبل 80/443، يجلب شهادة HTTPS ويجدّدها، ويوزّع: `/api`, `/admin`, `/static` إلى الخادم وما عداها إلى اللوحة |
| `web` | لوحة Next.js مبنيّة (صورة صغيرة، بلا `node_modules`) |
| `api` | Django خلف gunicorn: يرحّل القاعدة، يجهّز المزرعة إن كانت جديدة، ثم يخدم |
| `db` | PostgreSQL 16 على حجم دائم — هي وحدها ما يجب أن يُنسخ احتياطيًا |

المزرعة تُنشأ **فارغة وجاهزة**: الفروع (تربية، تسمين، مشترك)، القوائم،
دليل الحسابات، حقول النماذج، مستودعا الأعلاف، والهوية البصرية — وبلا حيوان
واحد ولا قيد واحد. لا بيانات عرض على خادمك.
