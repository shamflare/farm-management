<#
.SYNOPSIS
    يشغّل الخادم ولوحة الإدارة معًا بأمر واحد.

.DESCRIPTION
    كان تشغيل المشروع يحتاج طرفيتين ومسارات venv يحفظها الإنسان عن ظهر قلب،
    فصار أول احتكاك بالمشروع هو أصعب خطوة فيه. هذا السكربت يفحص ما ينقص،
    يقوله بجملة واضحة، ثم يشغّل الاثنين ويطبع الروابط.

    الخروج بـ Ctrl+C يُغلق العمليتين معًا، فلا يبقى منفذ محجوزًا.

.EXAMPLE
    .\dev.ps1
    .\dev.ps1 -Backend 8001 -Frontend 3001
    .\dev.ps1 -NoFrontend        # الخادم وحده
#>

[CmdletBinding()]
param(
    [int]$Backend = 8000,
    [int]$Frontend = 3000,
    [switch]$NoFrontend,
    [switch]$NoBackend
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"

function Write-Step($text) { Write-Host "  $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "  $text" -ForegroundColor Green }
function Write-Bad($text)  { Write-Host "  $text" -ForegroundColor Red }

Write-Host ""
Write-Host "  نظام إدارة المزرعة — بيئة التطوير" -ForegroundColor White
Write-Host "  ----------------------------------" -ForegroundColor DarkGray

# --- فحص ما ينقص قبل تشغيل أي شيء ---------------------------------------

$missing = @()

if (-not $NoBackend) {
    if (-not (Test-Path $python)) {
        $missing += @"
البيئة الافتراضية غير موجودة. أنشئها مرة واحدة:
      python -m venv .venv
      .venv\Scripts\pip install -r requirements.txt
"@
    }
    elseif (-not (Test-Path (Join-Path $root "backend\db.sqlite3"))) {
        # قاعدة غير موجودة ليست خطأ — لكن يُنبَّه عليها قبل أن تفشل الشاشة بلا سبب.
        Write-Step "لا توجد قاعدة بيانات بعد؛ سأنشئها الآن."
        Push-Location (Join-Path $root "backend")
        & $python manage.py migrate --noinput
        Write-Step "لبيانات تجريبية جاهزة: python manage.py seed_demo --reset"
        Pop-Location
    }
}

if (-not $NoFrontend) {
    if (-not (Test-Path (Join-Path $root "admin-web\node_modules"))) {
        $missing += @"
حزم لوحة الإدارة غير مثبَّتة. ثبّتها مرة واحدة:
      cd admin-web; npm install
"@
    }
}

if ($missing.Count -gt 0) {
    Write-Host ""
    foreach ($item in $missing) { Write-Bad $item }
    Write-Host ""
    exit 1
}

# --- التشغيل --------------------------------------------------------------

$jobs = @()

try {
    if (-not $NoBackend) {
        Write-Step "الخادم على المنفذ $Backend …"
        $jobs += Start-Process -PassThru -NoNewWindow -FilePath $python `
            -ArgumentList "manage.py", "runserver", "0.0.0.0:$Backend" `
            -WorkingDirectory (Join-Path $root "backend")
    }

    if (-not $NoFrontend) {
        Write-Step "لوحة الإدارة على المنفذ $Frontend …"
        $npm = (Get-Command npm).Source
        $jobs += Start-Process -PassThru -NoNewWindow -FilePath $npm `
            -ArgumentList "run", "dev", "--", "-p", "$Frontend" `
            -WorkingDirectory (Join-Path $root "admin-web")
    }

    Start-Sleep -Seconds 3

    Write-Host ""
    Write-Ok "جاهز."
    Write-Host ""
    if (-not $NoFrontend) { Write-Host "  لوحة الإدارة   http://localhost:$Frontend" -ForegroundColor White }
    if (-not $NoBackend) {
        Write-Host "  الـ API        http://127.0.0.1:$Backend/api/v1/" -ForegroundColor White
        Write-Host "  توثيق الـ API  http://127.0.0.1:$Backend/api/docs/" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "  الدخول: owner / farm1234" -ForegroundColor DarkGray
    Write-Host "  للإيقاف: Ctrl+C" -ForegroundColor DarkGray
    Write-Host ""

    # يبقى السكربت حيًّا حتى ينتهي أحد الطرفين أو يضغط المستخدم Ctrl+C.
    while ($true) {
        foreach ($job in $jobs) {
            if ($job.HasExited) {
                Write-Bad "توقّفت إحدى العمليتين (رمز $($job.ExitCode)) — أُغلق الباقي."
                return
            }
        }
        Start-Sleep -Milliseconds 700
    }
}
finally {
    foreach ($job in $jobs) {
        if ($job -and -not $job.HasExited) {
            Stop-Process -Id $job.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host ""
    Write-Step "أُغلقت العمليات."
    Write-Host ""
}
