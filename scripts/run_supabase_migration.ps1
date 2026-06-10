<#
.SYNOPSIS
    Executes SQL migration against Supabase project using REST API
#>

param(
    [string]$SqlFilePath = "F:\OpenWork\projects\outreach-suite\supabase_v2_migration.sql"
)

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] [$Level] $Message"
}

try {
    if (-not (Test-Path $SqlFilePath)) {
        throw "SQL file not found: $SqlFilePath"
    }
    
    Write-Log "Reading SQL file: $SqlFilePath"
    $sqlContent = Get-Content $SqlFilePath -Raw
    
    if ([string]::IsNullOrWhiteSpace($sqlContent)) {
        throw "SQL file is empty"
    }
    
    $supabaseUrl = "https://wxxjiehgcjrmkbatkvsu.supabase.co"
    $serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGppZWhnY2pybWtiYXRrdnN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI4NDYxNiwiZXhwIjoyMDk0ODYwNjE2fQ.HUUALAikKYFtkh6hnAjApAk2txiF3Puul5YL88T238U"
    
    $headers = @{
        "Authorization" = "Bearer $serviceRoleKey"
        "apikey" = $serviceRoleKey
        "Content-Type" = "application/json"
    }
    
    # Try SQL via REST API
    Write-Log "Attempting to execute SQL via REST API..."
    $restApiUrl = "$supabaseUrl/rest/v1/sql"
    
    $body = @{
        "query" = $sqlContent
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri $restApiUrl -Method POST -Headers $headers -Body $body
        Write-Log "SQL executed successfully via REST API"
        $response | ConvertTo-Json -Depth 5
    }
    catch {
        $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        Write-Log "REST API failed with status $statusCode : $($_.Exception.Message)" "WARN"
        
        # Try the pg_dump endpoint or raw SQL
        Write-Log "Trying alternative SQL endpoint..."
        
        # Try the management API endpoint
        try {
            $mgmtUrl = "https://api.supabase.com/v1/projects/wxxjiehgcjrmkbatkvsu/sql"
            $mgmtHeaders = @{
                "Authorization" = "Bearer $serviceRoleKey"
                "Content-Type" = "application/json"
            }
            $body = @{ "query" = $sqlContent } | ConvertTo-Json
            $response = Invoke-RestMethod -Uri $mgmtUrl -Method POST -Headers $mgmtHeaders -Body $body
            Write-Log "SQL executed successfully via Management API"
            $response | ConvertTo-Json -Depth 5
        }
        catch {
            Write-Log "All API methods failed. Manual step required." "ERROR"
            Write-Host "`n=== MANUAL STEP REQUIRED ===" -ForegroundColor Yellow
            Write-Host "Please run this SQL in Supabase Dashboard SQL Editor:" -ForegroundColor Yellow
            Write-Host "  1. Go to https://supabase.com/dashboard/project/wxxjiehgcjrmkbatkvsu" -ForegroundColor Cyan
            Write-Host "  2. Open SQL Editor" -ForegroundColor Cyan
            Write-Host "  3. Paste the content of: $SqlFilePath" -ForegroundColor Cyan
            Write-Host "  4. Click Run" -ForegroundColor Cyan
        }
    }
}
catch {
    Write-Log "Script failed: $($_.Exception.Message)" "ERROR"
    exit 1
}
