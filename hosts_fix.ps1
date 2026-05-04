# PowerShell script to fix Windows hosts file for Smart Campus SCRS
# REQUIRES ADMINISTRATOR PRIVILEGES

$hostsPath = "$env:windir\System32\drivers\etc\hosts"
$domain = "gcd-smart-complaint-and-response-system.co.in"
$wwwDomain = "www.gcd-smart-complaint-and-response-system.co.in"
$newIp = "3.24.254.215"
$oldIps = @("3.107.107.92", "3.27.89.44")

Write-Host "--- Smart Campus Hosts Fix ---" -ForegroundColor Cyan

# 1. Read existing hosts content
if (!(Test-Path $hostsPath)) {
    Write-Error "Hosts file not found at $hostsPath"
    exit
}

$content = Get-Content $hostsPath

# 2. Filter out old IP entries and any existing entries for the domain
$newContent = $content | Where-Object { 
    $line = $_.Trim()
    $isOldIp = $false
    foreach ($ip in $oldIps) {
        if ($line.StartsWith($ip)) { $isOldIp = $true; break }
    }
    
    $isDomain = $line.Contains($domain)
    
    !$isOldIp -and !$isDomain -and ($line -ne "")
}

# 3. Add new entries
$newContent += "`n# Smart Campus SCRS Production"
$newContent += "$newIp $domain"
$newContent += "$newIp $wwwDomain"

# 4. Write back to file
try {
    $newContent | Set-Content $hostsPath -ErrorAction Stop
    Write-Host "✅ Successfully updated hosts file with IP $newIp" -ForegroundColor Green
} catch {
    Write-Host "❌ FAILED to write to hosts file." -ForegroundColor Red
    Write-Host "Please run this script as ADMINISTRATOR." -ForegroundColor Yellow
}

Write-Host "`nTesting connectivity..."
Resolve-DnsName $domain -ErrorAction SilentlyContinue
