param(
  [Parameter(Mandatory=$true)]
  [string]$InputTsv,

  [Parameter(Mandatory=$true)]
  [string]$OutputTsv,

  # По умолчанию берём 1,4,5 чтобы не повторять "окончания"
  [int[]]$Keep = @(1,4,5)
)

function Clean([string]$s) {
  if ($null -eq $s) { return "" }
  return ($s -replace "`t"," " -replace "`r"," " -replace "`n"," ").Trim()
}

$rows = Import-Csv -Path $InputTsv -Delimiter "`t"

$header = @(
  "source","region","district","settlement","type","lat","lon",
  "darya_no","question_id","question","category","unit1","unit2","comment"
) -join "`t"

$out = New-Object System.Collections.Generic.List[string]
$out.Add($header)

# Переписанные вопросы (смысл тот же)
$Q = @{
  1 = @{ category="Фонетика";   id="F01_G";     text="Реализация фонемы /г/ (взрывная [g] / фрикативная [ɣ])" };
  2 = @{ category="Фонетика";   id="F02_TSA";   text="Произношение -тся/-ться (твёрдость/мягкость [ц(’ )а])" };
  3 = @{ category="Морфология"; id="M01_3PL";   text="Окончание глагола 3 лица множественного числа" };
  4 = @{ category="Лексика";    id="L01_HOUSE"; text="Лексема для обозначения крестьянского жилища" };
  5 = @{ category="Синтаксис";  id="S01_POS";   text="Посессивная конструкция (аналог «у меня есть»)" };
}

foreach ($r in $rows) {
  $region = Clean $r.region
  $district = Clean $r.district
  $settlement = Clean $r.settlement
  $type = Clean $r.settlement_type
  $lat = Clean $r.latitude
  $lon = Clean $r.longitude

  foreach ($i in $Keep) {
    $qField = "question_$i"
    $aField = "answer_$i"

    $origQ = Clean ($r.$qField)
    $ans   = Clean ($r.$aField)

    if (-not $origQ -or -not $ans) { continue }

    $meta = $Q[$i]
    $category = $meta.category
    $qid = $meta.id
    $qtext = $meta.text

    # ВАЖНО: это НЕ официальный номер ДАРЯ, а номер признака в выборке (честно)
    $no = [string]$i

    $source = "ДАРЯ (выборка)"
    $comment = "Исходная формулировка: " + $origQ

    $line = @(
      $source,
      $region,$district,$settlement,$type,$lat,$lon,
      $no,$qid,$qtext,$category,
      $ans,"",$comment
    ) -join "`t"

    $out.Add($line)
  }
}

$out | Set-Content -Encoding UTF8 $OutputTsv
Write-Host "OK: TSV saved -> $OutputTsv" -ForegroundColor Green
Write-Host ("Rows written: " + ($out.Count - 1)) -ForegroundColor Green
