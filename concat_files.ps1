$base = "F:\Anitgravity Data\outreach-suite"
$files = @(
    "src\components\AnalyticsTab.tsx",
    "src\components\CampaignsTab.tsx",
    "src\components\InboxTab.tsx",
    "src\components\LeadsTab.tsx",
    "src\components\SettingsTab.tsx",
    "src\components\Sidebar.tsx",
    "src\components\TemplatesTab.tsx",
    "src\components\VideoTab.tsx",
    "src\app\page.tsx",
    "src\app\layout.tsx",
    "src\app\error.tsx",
    "src\app\globals.css",
    "src\middleware.ts"
)
$outPath = Join-Path $base "all-files-complete.txt"
Remove-Item $outPath -ErrorAction SilentlyContinue
foreach ($f in $files) {
    $fullPath = Join-Path $base $f
    "="*80 | Out-File $outPath -Append -Encoding utf8
    "FILE: $f" | Out-File $outPath -Append -Encoding utf8
    "="*80 | Out-File $outPath -Append -Encoding utf8
    Get-Content $fullPath -Raw | Out-File $outPath -Append -Encoding utf8
    "" | Out-File $outPath -Append -Encoding utf8
}
Write-Host "Done: $outPath"
