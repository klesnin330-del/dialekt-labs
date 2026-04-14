param(
  [string]$Out = ".\darya_seed.tsv"
)

$rows = New-Object System.Collections.Generic.List[object]

function Add3($region,$district,$settlement,$type,$lat,$lon,$g,$house,$pos){
  $rows.Add([pscustomobject]@{
    source="ДАРЯ (выборка)"; region=$region; district=$district; settlement=$settlement; type=$type; lat=$lat; lon=$lon;
    darya_no="1"; question_id="F01_G"; question="Реализация фонемы /г/ (взрывная [g] / фрикативная [ɣ])"; category="Фонетика";
    unit1=$g; unit2=""; comment="Источник: данные одногруппника; вопрос переформулирован"
  }) | Out-Null

  $rows.Add([pscustomobject]@{
    source="ДАРЯ (выборка)"; region=$region; district=$district; settlement=$settlement; type=$type; lat=$lat; lon=$lon;
    darya_no="4"; question_id="L01_HOUSE"; question="Лексема для обозначения крестьянского жилища"; category="Лексика";
    unit1=$house; unit2=""; comment="Источник: данные одногруппника; вопрос переформулирован"
  }) | Out-Null

  $rows.Add([pscustomobject]@{
    source="ДАРЯ (выборка)"; region=$region; district=$district; settlement=$settlement; type=$type; lat=$lat; lon=$lon;
    darya_no="5"; question_id="S01_POS"; question="Посессивная конструкция (аналог «у меня есть»)"; category="Синтаксис";
    unit1=$pos; unit2=""; comment="Источник: данные одногруппника; вопрос переформулирован"
  }) | Out-Null
}

# Удмуртия
Add3 "Удмуртская Республика" "Завьяловский район" "д. Русская Лоза" "деревня" "56.8165" "53.3895" "взрывной [g]" "изба" "у меня есть"
Add3 "Удмуртская Республика" "Завьяловский район" "с. Завьялово" "село"     "56.7892" "53.3736" "взрывной [g]" "изба" "у меня есть"
Add3 "Удмуртская Республика" "Игринский район"     "с. Зура"      "село"     "57.5269" "53.0247" "фрикативный [ɣ]" "хата" "у мене є"
Add3 "Удмуртская Республика" "Шарканский район"    "с. Шаркан"    "село"     "57.0494" "53.9967" "фрикативный [ɣ]" "хата" "у мене є"
Add3 "Удмуртская Республика" "Увинский район"      "п. Ува"       "поселок"  "56.9808" "52.1851" "взрывной [g]" "изба" "у меня есть"
Add3 "Удмуртская Республика" "Вавожский район"     "с. Вавож"     "село"     "56.7756" "51.9289" "фрикативный [ɣ]" "изба" "у меня есть"
Add3 "Удмуртская Республика" "Дебесский район"     "с. Дебесы"    "село"     "57.6514" "53.8058" "взрывной [g]" "изба" "у меня есть"

# 3 точки у границы (как в вашей выборке)
Add3 "Пермский край"            "Чайковский район" "с. Фоки"    "село" "56.6939" "54.1131" "взрывной [g]" "изба" "есть"
Add3 "Республика Татарстан"     "Елабужский район" "с. Танайка" "село" "55.7891" "52.0345" "взрывной [g]" "изба" "бар"
Add3 "Республика Башкортостан"  "Янаульский район" "с. Янаул"   "село" "56.2658" "54.9347" "взрывной [g]" "изба" "у меня есть"

$rows |
  Select-Object source,region,district,settlement,type,lat,lon,darya_no,question_id,question,category,unit1,unit2,comment |
  Export-Csv -NoTypeInformation -Delimiter "`t" -Encoding UTF8 $Out

Write-Host "OK: created $Out" -ForegroundColor Green
Write-Host ("Rows: " + $rows.Count) -ForegroundColor Green
