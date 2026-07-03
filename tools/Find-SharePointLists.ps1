<#
.SYNOPSIS
    SharePoint Connection Values Discoverer
    Automatically finds all Sites and Lists via Microsoft Graph API
    and prints the exact values needed for the "Add SharePoint List" form.

.HOW TO RUN (from project root C:\Desire-Mail-Marketing-Sharepoint)
    Option A - Auto reads from .env:
        powershell -ExecutionPolicy Bypass -File .\tools\Find-SharePointLists.ps1

    Option B - Pass credentials explicitly:
        powershell -ExecutionPolicy Bypass -File .\tools\Find-SharePointLists.ps1 `
            -TenantId "xxx" -ClientId "yyy" -ClientSecret "zzz"

.NOTES
    REQUIRED Azure App Registration permission:
        Sites.Read.All   (Application permission, admin-consented)
#>

[CmdletBinding()]
param(
    [string]$TenantId     = "",
    [string]$ClientId     = "",
    [string]$ClientSecret = "",
    [string]$EnvFile      = ".\backend\.env"
)

# -----------------------------------------------------------------------
# STYLING HELPERS
# -----------------------------------------------------------------------

function Print-Header([string]$text) {
    Write-Host ""
    Write-Host ("=" * 68) -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ("=" * 68) -ForegroundColor Cyan
}

function Print-Step([string]$step, [string]$text) {
    Write-Host ""
    Write-Host "  [$step] $text" -ForegroundColor Yellow
}

function Print-OK([string]$text) {
    Write-Host "    OK  : " -ForegroundColor Green -NoNewline
    Write-Host $text -ForegroundColor Gray
}

function Print-Fail([string]$text) {
    Write-Host "    ERR : " -ForegroundColor Red -NoNewline
    Write-Host $text -ForegroundColor Red
}

function Print-Info([string]$text) {
    Write-Host "    ... $text" -ForegroundColor DarkGray
}

# -----------------------------------------------------------------------
# STEP 1 - Load credentials from .env or parameters
# -----------------------------------------------------------------------

Print-Header "SharePoint Connection Value Discoverer"
Write-Host "  Desire Mail Marketing - Auto Discovery Tool" -ForegroundColor DarkGray
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray

Print-Step "1" "Loading credentials"

$authChoice = "1"
if (($TenantId -eq "" -and $ClientId -eq "" -and $ClientSecret -eq "") -and (Test-Path $EnvFile)) {
    Write-Host ""
    Write-Host "  Select Authentication Source:" -ForegroundColor Cyan
    Write-Host "    [1] Load credentials from backend .env (Default)" -ForegroundColor White
    Write-Host "    [2] Enter Tenant credentials manually" -ForegroundColor White
    $userInput = Read-Host "  Enter choice (1 or 2)"
    if ($userInput.Trim() -eq "2") {
        $authChoice = "2"
    }
} elseif ($TenantId -ne "" -or $ClientId -ne "" -or $ClientSecret -ne "") {
    $authChoice = "manual-params"
}

if ($authChoice -eq "1") {
    Print-Info "Reading from: $EnvFile"
    $envContent = Get-Content $EnvFile -ErrorAction SilentlyContinue
    foreach ($line in $envContent) {
        $line = $line.Trim()
        if ($line -match '^#' -or $line -eq '') { continue }
        if ($line -match '^TENANT_ID\s*=\s*(.+)$'        -and $TenantId     -eq "") { $TenantId     = $Matches[1].Trim('"') }
        if ($line -match '^SP_CLIENT_ID\s*=\s*(.+)$'     -and $ClientId     -eq "") { $ClientId     = $Matches[1].Trim('"') }
        if ($line -match '^SP_CLIENT_SECRET\s*=\s*(.+)$' -and $ClientSecret -eq "") { $ClientSecret = $Matches[1].Trim('"') }
    }
}

if ($TenantId -eq "") {
    $TenantId = Read-Host "  Enter Tenant ID (Azure AD -> Overview -> Tenant ID)"
}
if ($ClientId -eq "") {
    $ClientId = Read-Host "  Enter Client ID (App Registration -> Overview -> Application (client) ID)"
}
if ($ClientSecret -eq "") {
    $ClientSecret = Read-Host "  Enter Client Secret"
}

if ($TenantId -eq "" -or $ClientId -eq "" -or $ClientSecret -eq "") {
    Print-Fail "Cannot continue - Tenant ID, Client ID, and Client Secret are all required."
    exit 1
}

Print-OK "Tenant ID  : $TenantId"
Print-OK "Client ID  : $ClientId"
Print-OK "Secret     : $('*' * [Math]::Min($ClientSecret.Length, 8))... (masked)"

# -----------------------------------------------------------------------
# STEP 2 - Get OAuth2 access token
# -----------------------------------------------------------------------

Print-Step "2" "Acquiring Microsoft Graph access token"

$tokenUrl  = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
$tokenBody = @{
    client_id     = $ClientId
    client_secret = $ClientSecret
    scope         = "https://graph.microsoft.com/.default"
    grant_type    = "client_credentials"
}

try {
    $tokenResp    = Invoke-RestMethod -Method POST -Uri $tokenUrl -Body $tokenBody `
                        -ContentType "application/x-www-form-urlencoded" -ErrorAction Stop
    $AccessToken  = $tokenResp.access_token
    $expiresIn    = $tokenResp.expires_in
    Print-OK "Token acquired (expires in ${expiresIn}s)"
} catch {
    Print-Fail "Failed to get access token!"
    Write-Host ""
    try {
        $errBody = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction Stop
        Write-Host "  Error Code    : $($errBody.error)" -ForegroundColor Red
        Write-Host "  Error Message : $($errBody.error_description)" -ForegroundColor Red
    } catch {
        Write-Host "  $_" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "  COMMON FIXES:" -ForegroundColor Yellow
    Write-Host "  - Wrong Tenant ID, Client ID, or Client Secret" -ForegroundColor White
    Write-Host "  - Client Secret has expired - create a new one in Azure Portal" -ForegroundColor White
    Write-Host "  - App registration does not exist in this tenant" -ForegroundColor White
    exit 1
}

$headers = @{ Authorization = "Bearer $AccessToken" }

# -----------------------------------------------------------------------
# STEP 3 - Discover all SharePoint sites
# -----------------------------------------------------------------------

Print-Step "3" "Discovering SharePoint sites (GET /sites?search=*)"

$allSites = [System.Collections.Generic.List[object]]::new()

try {
    $sitesUrl = "https://graph.microsoft.com/v1.0/sites?search=*&`$top=100"
    while ($sitesUrl) {
        $sitesResp = Invoke-RestMethod -Uri $sitesUrl -Headers $headers -ErrorAction Stop
        foreach ($site in $sitesResp.value) { $allSites.Add($site) }
        $sitesUrl = $sitesResp.'@odata.nextLink'
    }
    Print-OK "Found $($allSites.Count) site(s)"
} catch {
    Print-Fail "Failed to list sites!"
    Write-Host ""
    try {
        $errBody = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction Stop
        Write-Host "  Error Code : $($errBody.error.code)" -ForegroundColor Red
        Write-Host "  Message    : $($errBody.error.message)" -ForegroundColor Red

        if ($errBody.error.code -eq "Authorization_RequestDenied") {
            Write-Host ""
            Write-Host "  PERMISSION MISSING - Your app is missing 'Sites.Read.All'" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "  HOW TO FIX:" -ForegroundColor Cyan
            Write-Host "  1. Open: https://portal.azure.com" -ForegroundColor White
            Write-Host "  2. Search 'App Registrations' and open your app" -ForegroundColor White
            Write-Host "  3. Left panel: click 'API permissions'" -ForegroundColor White
            Write-Host "  4. Click 'Add a permission' -> Microsoft Graph -> Application permissions" -ForegroundColor White
            Write-Host "  5. Search 'Sites.Read.All' -> tick it -> Add permission" -ForegroundColor White
            Write-Host "  6. Click 'Grant admin consent for [your org]' (needs Global Admin role)" -ForegroundColor White
            Write-Host "  7. Wait 2-3 minutes then re-run this script" -ForegroundColor White
        }
    } catch {
        Write-Host "  $_" -ForegroundColor Red
    }
    exit 1
}

if ($allSites.Count -eq 0) {
    Print-Fail "No sites returned. Ensure Sites.Read.All is granted with admin consent."
    exit 1
}

# -----------------------------------------------------------------------
# STEP 4 - Fetch lists from each site, skip system/hidden ones
# -----------------------------------------------------------------------

Print-Step "4" "Fetching lists from each site..."

$SKIP_NAMES = @(
    'Style Library','Site Assets','Site Pages','Site Collection Documents',
    'Site Collection Images','Form Templates','Master Page Gallery',
    'Solution Gallery','Theme Gallery','Web Part Gallery','Access Requests',
    'Composed Looks','User Information List','Content and Structure Reports',
    'Relationships List','Reusable Content','Quick Deploy Items',
    'Suggested Content Browser Locations','TaxonomyHiddenList',
    'Sharing Links','Social','wfsvc','Documents'
)

# Template IDs of system list types to skip (doc libraries, wiki, etc.)
$SKIP_TEMPLATES = @(101,109,110,111,112,113,114,115,116,117,118,119,120,121,
                    122,123,124,125,130,140,150,160,170,200,201,202,204,207,
                    210,211,212,301,303,402,403,404,405,420,421,499,500,851,
                    1100,1200,2002)

$results = [System.Collections.Generic.List[object]]::new()

foreach ($site in $allSites) {
    $siteId   = $site.id
    $siteName = if ($site.displayName) { $site.displayName } else { $site.name }
    $siteUrl  = $site.webUrl

    Print-Info "Scanning: $siteName"

    try {
        $listsResp = Invoke-RestMethod `
            -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists?`$top=200" `
            -Headers $headers -ErrorAction Stop

        foreach ($list in $listsResp.value) {
            if ($list.list.hidden -eq $true)                    { continue }
            if ($SKIP_TEMPLATES -contains $list.list.template)  { continue }
            if ($SKIP_NAMES -contains $list.displayName)        { continue }
            if ($list.name -match '^_')                         { continue }

            $results.Add([PSCustomObject]@{
                SiteName  = $siteName
                SiteUrl   = $siteUrl
                SiteId    = $siteId
                ListName  = $list.displayName
                ListId    = $list.id
                ItemCount = if ($null -ne $list.list.itemCount) { $list.list.itemCount } else { "?" }
                Modified  = $list.lastModifiedDateTime
            })
        }
    } catch {
        Print-Info "Could not read lists for '$siteName': $($_.Exception.Message)"
    }
}

# -----------------------------------------------------------------------
# STEP 5 - Print results
# -----------------------------------------------------------------------

Print-Header "RESULTS - Copy-Paste Values for the Add SharePoint List Form"

if ($results.Count -eq 0) {
    Write-Host ""
    Print-Fail "No custom lists found across $($allSites.Count) site(s)."
    Write-Host ""
    Write-Host "  Possible reasons:" -ForegroundColor Yellow
    Write-Host "  - No custom lists have been created in SharePoint yet" -ForegroundColor White
    Write-Host "  - All lists are system or document libraries (filtered out)" -ForegroundColor White
    Write-Host "  - The app does not have sufficient permissions" -ForegroundColor White
    exit 0
}

Write-Host ""
Write-Host "  Found $($results.Count) list(s) across $($allSites.Count) site(s)" -ForegroundColor Green
Write-Host ""
Write-Host "  COMMON VALUES (Tenant ID and Client ID are the same for all lists):" -ForegroundColor Cyan
Write-Host "  Tenant ID : $TenantId" -ForegroundColor White
Write-Host "  Client ID : $ClientId" -ForegroundColor White

$grouped = $results | Group-Object -Property SiteName

foreach ($grp in $grouped) {
    $sample = $grp.Group[0]
    Write-Host ""
    Write-Host ("-" * 68) -ForegroundColor DarkGray
    Write-Host "  SITE   : $($grp.Name)" -ForegroundColor Yellow
    Write-Host "  URL    : $($sample.SiteUrl)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  SharePoint Site ID (use this same value for ALL lists in this site):" -ForegroundColor Cyan
    Write-Host "  $($sample.SiteId)" -ForegroundColor White
    Write-Host ""

    foreach ($item in $grp.Group) {
        $modDate = try { ([datetime]$item.Modified).ToString('yyyy-MM-dd HH:mm') } catch { $item.Modified }
        Write-Host "  List : $($item.ListName)" -ForegroundColor White
        Write-Host "    List ID       : " -ForegroundColor DarkCyan -NoNewline
        Write-Host "$($item.ListId)" -ForegroundColor Green
        Write-Host "    Items in list : $($item.ItemCount)" -ForegroundColor DarkGray
        Write-Host "    Last modified : $modDate" -ForegroundColor DarkGray
        Write-Host ""
    }
}

# -----------------------------------------------------------------------
# STEP 6 - Save report file
# -----------------------------------------------------------------------

$reportPath = ".\sp-discovery-$(Get-Date -Format 'yyyyMMdd-HHmm').txt"
$lines = [System.Collections.Generic.List[string]]::new()

$lines.Add("SharePoint List Discovery Report")
$lines.Add("Generated  : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$lines.Add("=" * 68)
$lines.Add("")
$lines.Add("COMMON CREDENTIALS (same for all lists below)")
$lines.Add("  Tenant ID : $TenantId")
$lines.Add("  Client ID : $ClientId")
$lines.Add("  Secret    : [same as SP_CLIENT_SECRET in your .env - do not share]")
$lines.Add("")

foreach ($grp in $grouped) {
    $sample = $grp.Group[0]
    $lines.Add("=" * 68)
    $lines.Add("SITE : $($grp.Name)")
    $lines.Add("URL  : $($sample.SiteUrl)")
    $lines.Add("")
    $lines.Add("SharePoint Site ID (use for ALL lists in this site):")
    $lines.Add("  $($sample.SiteId)")
    $lines.Add("")

    foreach ($item in $grp.Group) {
        $modDate = try { ([datetime]$item.Modified).ToString('yyyy-MM-dd HH:mm') } catch { $item.Modified }
        $lines.Add("  --- $($item.ListName) ---")
        $lines.Add("  List ID    : $($item.ListId)")
        $lines.Add("  Item Count : $($item.ItemCount)")
        $lines.Add("  Modified   : $modDate")
        $lines.Add("")
        $lines.Add("  PASTE INTO THE 'ADD SHAREPOINT LIST' FORM:")
        $lines.Add("    Display Name       : $($item.ListName)")
        $lines.Add("    SharePoint Site ID : $($sample.SiteId)")
        $lines.Add("    List ID            : $($item.ListId)")
        $lines.Add("    Tenant ID          : $TenantId   <- or leave blank to use system default")
        $lines.Add("    Client ID          : $ClientId   <- or leave blank to use system default")
        $lines.Add("    Client Secret      : [SP_CLIENT_SECRET]   <- or leave blank to use system default")
        $lines.Add("")
        $lines.Add(("-" * 50))
        $lines.Add("")
    }
}

[System.IO.File]::WriteAllLines((Join-Path (Get-Location) $reportPath.TrimStart('.\')), $lines, [System.Text.Encoding]::UTF8)

# Save Excel-compatible CSV report file
$csvReportPath = ".\sp-discovery-$(Get-Date -Format 'yyyyMMdd-HHmm').csv"
$absoluteCsvPath = Join-Path (Get-Location) $csvReportPath.TrimStart('.\')
$exportObjects = [System.Collections.Generic.List[object]]::new()
foreach ($item in $results) {
    $exportObjects.Add([PSCustomObject]@{
        "Tenant ID"          = $TenantId
        "Client ID"          = $ClientId
        "Client Secret"      = $ClientSecret
        "Site Name"          = $item.SiteName
        "Site URL"           = $item.SiteUrl
        "SharePoint Site ID" = $item.SiteId
        "List Name"          = $item.ListName
        "List ID"            = $item.ListId
        "Item Count"         = $item.ItemCount
        "Last Modified"      = $item.Modified
    })
}
$exportObjects | Export-Csv -Path $absoluteCsvPath -NoTypeInformation -Encoding utf8

Write-Host ("-" * 68) -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Text Report saved to:" -ForegroundColor Green
Write-Host "  $(Join-Path (Get-Location) $reportPath.TrimStart('.\'))" -ForegroundColor White
Write-Host "  Excel CSV saved to:" -ForegroundColor Green
Write-Host "  $absoluteCsvPath" -ForegroundColor White
Write-Host ""
Write-Host "  NEXT STEPS:" -ForegroundColor Yellow
Write-Host "  1. Open the app at http://localhost:5173" -ForegroundColor White
Write-Host "  2. Click 'SP Lists' in the left sidebar" -ForegroundColor White
Write-Host "  3. Click 'Add List'" -ForegroundColor White
Write-Host "  4. Copy the Site ID and List ID from above for each list you want" -ForegroundColor White
Write-Host "  5. After saving, click 'Test Connection' to verify it works" -ForegroundColor White
Write-Host ""
Print-Header "DONE"
Write-Host ""
