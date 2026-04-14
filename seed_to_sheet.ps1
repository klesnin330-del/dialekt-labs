param(
  [Parameter(Mandatory=$true)]
  [string]$Endpoint,

  [Parameter(Mandatory=$true)]
  [string]$SeedFile,

  [switch]$ResetSheet
)

function Post-JsonUtf8([string]$Url, [string]$Json) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
  Invoke-RestMethod -Method Post -Uri $Url -ContentType "application/json; charset=utf-8" -Body $bytes
}

if (-not (Test-Path $SeedFile)) { throw "Seed file not found: $SeedFile" }

if ($ResetSheet) {
  $resetJson = (@{ action = "reset" } | ConvertTo-Json -Depth 5)
  Post-JsonUtf8 -Url $Endpoint -Json $resetJson | Out-Host
}

# Надёжный парсинг TSV: читаем как UTF8 и ConvertFrom-Csv
$text = Get-Content -Raw -Encoding UTF8 $SeedFile
$rows = $text | ConvertFrom-Csv -Delimiter "`t"

$payloadRows = @()

foreach ($r in $rows) {
  $region = ([string]$r.region).Trim()
  $settlement = ([string]$r.settlement).Trim()
  if (-not $region -or -not $settlement) { continue }

  $payloadRows += @{
    source      = ([string]$r.source).Trim()
    region      = $region
    district    = ([string]$r.district).Trim()
    settlement  = $settlement
    type        = ([string]$r.type).Trim()
    lat         = ([string]$r.lat).Trim()
    lon         = ([string]$r.lon).Trim()
    darya_no    = ([string]$r.darya_no).Trim()
    question_id = ([string]$r.question_id).Trim()
    question    = ([string]$r.question).Trim()
    category    = ([string]$r.category).Trim()
    unit1       = ([string]$r.unit1).Trim()
    unit2       = ([string]$r.unit2).Trim()
    comment     = ([string]$r.comment).Trim()
  }
}

$chunkSize = 50
for ($i=0; $i -lt $payloadRows.Count; $i += $chunkSize) {
  $end = [Math]::Min($i+$chunkSize-1, $payloadRows.Count-1)
  $chunk = $payloadRows[$i..$end]
  $bodyJson = (@{ action="bulk"; rows=$chunk } | ConvertTo-Json -Depth 10)
  $res = Post-JsonUtf8 -Url $Endpoint -Json $bodyJson
  $res | Out-Host
}

Write-Host "DONE. Added rows: $($payloadRows.Count)" -ForegroundColor Green
