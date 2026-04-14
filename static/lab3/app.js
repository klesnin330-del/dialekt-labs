const CFG = window.LAB3_CONFIG || {};
const DATA_URL = CFG.dataUrl || "/lab3/data";
const GEOCODE_URL = CFG.geocodeUrl || "/lab3/geocode";
const SHEET_LINK = CFG.sheetEditUrl || CFG.sheetPublicUrl || "#";

const PALETTE = ["#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd","#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf"];

let allRows = [];
let filteredRows = [];
let points = new Map();        // key -> {meta, rows, sheetCoord, coord}
let selectedPointKey = null;

let map, cluster;
let unitColor = new Map();

// --- UI ---
const elStatus = document.getElementById("status");
const elLegend = document.getElementById("legend");
const elTable = document.getElementById("table");
const elPointInfo = document.getElementById("pointInfo");
const elSheetLink = document.getElementById("sheetLink");

const elAutoGeo = document.getElementById("autoGeo");
const elQuestion = document.getElementById("questionSelect");
const elDistrict = document.getElementById("districtSelect");
const elSettlementSearch = document.getElementById("settlementSearch");
const elUnitSearch = document.getElementById("unitSearch");
const elDaryaSearch = document.getElementById("daryaSearch");
const elReset = document.getElementById("resetBtn");
const elClearGeoCacheBtn = document.getElementById("clearGeoCacheBtn");

// --- helpers ---
function norm(s){ return (s ?? "").toString().trim(); }
function toNum(x){
  const v = parseFloat((x ?? "").toString().replace(",", "."));
  return Number.isFinite(v) ? v : null;
}
function uniq(arr){ return Array.from(new Set(arr)); }
function setStatus(t){ elStatus.textContent = t; }

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function cleanSettlementName(s){
  return norm(s).replace(/^(с\.|д\.|п\.|г\.)\s*/i, "").trim();
}

function makePointKey(r){
  // стабильный ключ для кэша: регион|район|пункт
  return `${norm(r.region)}|${norm(r.district)}|${norm(r.settlement)}`;
}

function fillSelect(selectEl, options, allLabel="— Все —"){
  const prev = selectEl.value;
  selectEl.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = allLabel;
  selectEl.appendChild(optAll);

  for (const o of options){
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    selectEl.appendChild(opt);
  }
  if (options.some(o => o.value === prev)) selectEl.value = prev;
}

function answerUnitForQuestion(pointRows, qid){
  if (!qid) return "";
  const r = pointRows.find(x => norm(x.question_id) === qid);
  return norm(r?.unit1) || norm(r?.unit2) || "";
}

function colorForUnit(unit){
  if (!unit) return "#1f3c88";
  if (!unitColor.has(unit)) unitColor.set(unit, PALETTE[unitColor.size % PALETTE.length]);
  return unitColor.get(unit);
}

function buildLegend(units){
  elLegend.innerHTML = "";
  if (!units.length){
    elLegend.textContent = "Нет данных для легенды.";
    return;
  }
  for (const u of units){
    const item = document.createElement("div");
    item.className = "legend-item";

    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = colorForUnit(u);

    const txt = document.createElement("div");
    txt.textContent = u;

    item.appendChild(sw);
    item.appendChild(txt);
    elLegend.appendChild(item);
  }
}

function initMap(){
  map = L.map("map").setView([57.0, 53.0], 7);
  map.attributionControl.setPrefix(false);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  cluster = L.markerClusterGroup();
  map.addLayer(cluster);
}

function clearMarkers(){ cluster.clearLayers(); }

function renderTable(rows){
  elTable.innerHTML = "";
  if (!rows.length){
    elTable.textContent = "Нет строк по текущим фильтрам.";
    return;
  }

  rows.slice(0,200).forEach(r => {
    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `
      <div><b>${escapeHtml(r.settlement)}</b> — ${escapeHtml(r.district)}, ${escapeHtml(r.region)}</div>
      <div><i>${escapeHtml(r.category || "")}</i> ${escapeHtml(r.question || "")}</div>
      <div>Ответ: <b>${escapeHtml(r.unit1 || "")}</b>${r.unit2 ? " / " + escapeHtml(r.unit2) : ""}</div>
    `;
    elTable.appendChild(div);
  });
}

function renderPointInfo(key){
  if (!key || !points.has(key)){
    elPointInfo.innerHTML = "Пожалуйста, выберите точку на карте, чтобы увидеть сведения о пункте.";
    return;
  }
  const p = points.get(key);
  const r0 = p.rows[0];

  const byCat = new Map();
  for (const r of p.rows){
    const cat = norm(r.category) || "Прочее";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(r);
  }

  const catsHtml = Array.from(byCat.entries()).map(([cat, rows]) => {
    const items = rows.map(rr => {
      const code = escapeHtml(rr.question_id || rr.darya_no || "");
      const q = escapeHtml(rr.question || "");
      const ans = escapeHtml(rr.unit1 || rr.unit2 || "");
      return `<li>${code}: ${q} — <b>${ans}</b></li>`;
    }).join("");
    return `<div class="cat">${escapeHtml(cat)}</div><ul>${items}</ul>`;
  }).join("");

  const coordText = p.coord ? `${p.coord.lat.toFixed(5)}, ${p.coord.lon.toFixed(5)}` : "—";

  elPointInfo.innerHTML = `
    <h3>${escapeHtml(r0.settlement)}</h3>
    <div class="meta"><b>Тип:</b> ${escapeHtml(r0.type || "")}</div>
    <div class="meta"><b>Район:</b> ${escapeHtml(r0.district || "")}</div>
    <div class="meta"><b>Регион:</b> ${escapeHtml(r0.region || "")}</div>
    <div class="meta"><b>Координаты:</b> ${coordText}</div>
    <hr/>
    <div style="font-weight:900;">Диалектные признаки:</div>
    ${catsHtml}
  `;
}

function updateDistrictOptions(){
  const districts = uniq(allRows.map(r => norm(r.district)).filter(Boolean)).sort();
  fillSelect(elDistrict, districts.map(d => ({value:d, label:d})));
}

function buildPoints(rows){
  points = new Map();
  for (const r of rows){
    const key = makePointKey(r);
    if (!points.has(key)){
      points.set(key, {
        meta: { region:r.region, district:r.district, settlement:r.settlement, type:r.type },
        rows: [],
        sheetCoord: { lat: toNum(r.lat), lon: toNum(r.lon) },
        coord: null
      });
    }
    points.get(key).rows.push(r);
  }
}

// ------------------------
// КЭШ КООРДИНАТ (localStorage)
// ------------------------
const GEO_CACHE_KEY = "lab3_geo_cache_v1";

function loadGeoCache(){
  try{
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch { return {}; }
}

function saveGeoCache(cacheObj){
  try{ localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cacheObj)); } catch {}
}

function clearGeoCache(){
  try{ localStorage.removeItem(GEO_CACHE_KEY); } catch {}
}

// ------------------------
// Геокодирование (только для отсутствующих координат)
// ------------------------
function getGeocodeQuery(p){
  const name = cleanSettlementName(p.meta.settlement);
  const district = norm(p.meta.district);
  const region = norm(p.meta.region);
  return `${name}, ${district}, ${region}, Россия`;
}

// геокодим только те, у кого нет coord
async function ensureCoordsForPoints(){
  const auto = elAutoGeo.checked;
  const cache = loadGeoCache();

  const keys = Array.from(points.keys());
  let need = 0;

  // 1) подхватить кэш/табличные координаты
  for (const key of keys){
    const p = points.get(key);

    if (!auto){
      // только таблица
      if (p.sheetCoord.lat !== null && p.sheetCoord.lon !== null){
        p.coord = { lat: p.sheetCoord.lat, lon: p.sheetCoord.lon };
      } else {
        p.coord = null;
      }
      continue;
    }

    // auto:
    if (cache[key]) {
      p.coord = cache[key];
      continue;
    }

    // пока нет кэша — попробуем табличные как временный fallback
    if (p.sheetCoord.lat !== null && p.sheetCoord.lon !== null){
      p.coord = { lat: p.sheetCoord.lat, lon: p.sheetCoord.lon };
    } else {
      p.coord = null;
    }

    need++;
  }

  if (!auto || need === 0) return;

  // 2) геокодим только те, кого нет в кэше
  let done = 0;
  for (const key of keys){
    const p = points.get(key);
    if (cache[key]) continue; // уже есть

    const q = getGeocodeQuery(p);

    setStatus(`Определение координат (OSM): ${++done}/${need}…`);

    try{
      const url = GEOCODE_URL + "?q=" + encodeURIComponent(q);
      const res = await fetch(url);
      const js = await res.json();
      if (js && js.ok){
        const coord = { lat: js.lat, lon: js.lon };
        cache[key] = coord;
        p.coord = coord;
      }
    } catch {}

    // задержка, чтобы не долбить геокодер
    await new Promise(r => setTimeout(r, 250));
  }

  saveGeoCache(cache);
  setStatus(`Координаты готовы. Пунктов: ${keys.length}`);
}

function applyFilters(){
  const qid = norm(elQuestion.value);
  const dist = norm(elDistrict.value);
  const sSearch = norm(elSettlementSearch.value).toLowerCase();
  const uSearch = norm(elUnitSearch.value).toLowerCase();

  filteredRows = allRows.filter(r => {
    if (qid && norm(r.question_id) !== qid) return false;
    if (dist && norm(r.district) !== dist) return false;

    if (sSearch && !norm(r.settlement).toLowerCase().includes(sSearch)) return false;

    const u1 = norm(r.unit1).toLowerCase();
    const u2 = norm(r.unit2).toLowerCase();
    if (uSearch && !(u1.includes(uSearch) || u2.includes(uSearch))) return false;

    return true;
  });

  buildPoints(filteredRows);
}

function drawMarkers(){
  clearMarkers();
  unitColor = new Map();

  const qid = norm(elQuestion.value);

  const units = uniq(
    Array.from(points.values())
      .map(p => answerUnitForQuestion(p.rows, qid))
      .filter(Boolean)
  );
  buildLegend(units);

  for (const [key, p] of points.entries()){
    if (!p.coord) continue;

    const unit = answerUnitForQuestion(p.rows, qid);
    const color = colorForUnit(unit);

    const marker = L.circleMarker([p.coord.lat, p.coord.lon], {
      radius: 8,
      color: "#ffffff",
      weight: 2,
      fillColor: color,
      fillOpacity: 0.9,
    });

    marker.on("click", () => {
      selectedPointKey = key;
      renderPointInfo(key);
    });

    cluster.addLayer(marker);
  }

  if (selectedPointKey && !points.has(selectedPointKey)){
    selectedPointKey = null;
    renderPointInfo(null);
  }
}

async function loadData(){
  elSheetLink.href = SHEET_LINK;
  setStatus("Загрузка данных…");

  const res = await fetch(DATA_URL + "?t=" + Date.now());
  const buf = await res.arrayBuffer();
  const tsv = new TextDecoder("utf-8").decode(buf);

  const parsed = Papa.parse(tsv, { header: true, skipEmptyLines: true, delimiter: "\t" });

  allRows = parsed.data.map(r => ({
    source: norm(r.source || ""),
    region: norm(r.region || ""),
    district: norm(r.district || ""),
    settlement: norm(r.settlement || ""),
    type: norm(r.type || r.settlement_type || ""),
    lat: norm(r.lat || r.latitude || ""),
    lon: norm(r.lon || r.longitude || ""),
    darya_no: norm(r.darya_no || ""),
    question_id: norm(r.question_id || r.darya_no || ""),
    question: norm(r.question || ""),
    category: norm(r.category || ""),
    unit1: norm(r.unit1 || ""),
    unit2: norm(r.unit2 || ""),
    comment: norm(r.comment || "")
  }));

  // список вопросов: value=question_id, label=category: question
  const qMap = new Map();
  for (const r of allRows){
    const id = norm(r.question_id);
    if (!id) continue;
    const label = (r.category ? `${r.category}: ` : "") + (r.question || id);
    if (!qMap.has(id)) qMap.set(id, label);
  }

  const qOptions = Array.from(qMap.entries())
    .map(([value,label]) => ({value,label}))
    .sort((a,b) => a.label.localeCompare(b.label, "ru"));

  fillSelect(elQuestion, qOptions, "— Выберите вопрос —");
  updateDistrictOptions();

  // initial filter + coords + draw
  applyFilters();
  await ensureCoordsForPoints();
  drawMarkers();
  renderTable(filteredRows);
  renderPointInfo(selectedPointKey);

  setStatus(`Готово. Строк: ${filteredRows.length}, пунктов: ${points.size}`);
}

function wireEvents(){
  // ВАЖНО: при фильтрах мы больше НЕ чистим кэш и не геокодим всё заново,
  // а геокодим только новые точки, которых ещё нет в localStorage.
  async function refreshAfterFilter(){
    applyFilters();
    await ensureCoordsForPoints();
    drawMarkers();
    renderTable(filteredRows);
    renderPointInfo(selectedPointKey);
  }

  elQuestion.addEventListener("change", refreshAfterFilter);
  elDistrict.addEventListener("change", refreshAfterFilter);

  elSettlementSearch.addEventListener("input", () => setTimeout(refreshAfterFilter, 200));
  elUnitSearch.addEventListener("input", () => setTimeout(refreshAfterFilter, 200));

  elAutoGeo.addEventListener("change", async () => {
    await ensureCoordsForPoints();
    drawMarkers();
    renderPointInfo(selectedPointKey);
  });

  elDaryaSearch.addEventListener("input", () => {
    const q = norm(elDaryaSearch.value);
    if (!q) return;
    const found = allRows.find(r => norm(r.question_id) === q || norm(r.darya_no) === q);
    if (found){
      elQuestion.value = norm(found.question_id);
      elQuestion.dispatchEvent(new Event("change"));
    }
  });

  elReset.addEventListener("click", async () => {
    elDaryaSearch.value = "";
    elQuestion.value = "";
    elDistrict.value = "";
    elSettlementSearch.value = "";
    elUnitSearch.value = "";
    selectedPointKey = null;
    renderPointInfo(null);
    await refreshAfterFilter();
  });

  if (elClearGeoCacheBtn){
    elClearGeoCacheBtn.addEventListener("click", async () => {
      clearGeoCache();
      setStatus("Кэш координат очищен. Координаты будут определены заново.");
      await ensureCoordsForPoints();
      drawMarkers();
      renderPointInfo(selectedPointKey);
    });
  }
}

(async function main(){
  initMap();
  wireEvents();
  await loadData();
})();