// 1) ВСТАВЬ СЮДА СВОЮ ССЫЛКУ CSV ИЗ "Опубликовать в интернете"
const SHEET_CSV_URL = "PASTE_YOUR_GOOGLE_SHEET_CSV_URL_HERE";

// просто чтобы ссылка "Открыть таблицу" вела куда-то
const SHEET_VIEW_URL = SHEET_CSV_URL.replace("output=csv", "output=html");

const PALETTE = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"
];

let allRows = [];
let filteredRows = [];

let map, cluster, markers = [];
let unitColor = new Map();

const elStatus = document.getElementById("status");
const elLegend = document.getElementById("legend");
const elTable = document.getElementById("table");

const elQuestion = document.getElementById("questionSelect");
const elRegion = document.getElementById("regionSelect");
const elDistrict = document.getElementById("districtSelect");
const elSettlementSearch = document.getElementById("settlementSearch");
const elUnitSearch = document.getElementById("unitSearch");
const elReset = document.getElementById("resetBtn");
const elSheetLink = document.getElementById("sheetLink");

function norm(s) {
  return (s ?? "").toString().trim();
}

function toNum(x) {
  const v = parseFloat((x ?? "").toString().replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

function setStatus(text) {
  elStatus.textContent = text;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function fillSelect(selectEl, values, allLabel = "— Все —") {
  const prev = selectEl.value;
  selectEl.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = allLabel;
  selectEl.appendChild(optAll);

  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });

  // попытка восстановить выбор
  if (values.includes(prev)) selectEl.value = prev;
}

function getSelectedQuestion() {
  return elQuestion.value;
}

function getAnswerUnit(row, q) {
  // Для выбранного вопроса используем unit1 как основной ответ
  if (norm(row.question_id) === q || norm(row.question) === q) {
    return norm(row.unit1) || norm(row.unit2) || "";
  }
  // если данные сгруппированы иначе — допускаем, что q это вопрос, и он в row.question
  return norm(row.unit1) || "";
}

function colorForUnit(unit) {
  if (!unit) return "#1f3c88";
  if (!unitColor.has(unit)) {
    const idx = unitColor.size % PALETTE.length;
    unitColor.set(unit, PALETTE[idx]);
  }
  return unitColor.get(unit);
}

function buildLegend(units) {
  elLegend.innerHTML = "";
  units.forEach(u => {
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
  });
  if (units.length === 0) {
    elLegend.textContent = "Нет данных для легенды.";
  }
}

function renderTable(rows) {
  elTable.innerHTML = "";
  if (!rows.length) {
    elTable.textContent = "Нет строк по текущим фильтрам.";
    return;
  }

  rows.slice(0, 200).forEach(r => {
    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `
      <div><b>${norm(r.settlement)}</b> — ${norm(r.district)}, ${norm(r.region)}</div>
      <div><i>${norm(r.question_id || "")}</i> ${norm(r.question || "")}</div>
      <div>Ответ: <b>${norm(r.unit1)}</b>${norm(r.unit2) ? " / " + norm(r.unit2) : ""}</div>
      ${norm(r.comment) ? `<div>Комментарий: ${norm(r.comment)}</div>` : ""}
    `;
    elTable.appendChild(div);
  });

  if (rows.length > 200) {
    const more = document.createElement("div");
    more.className = "row";
    more.textContent = `Показаны первые 200 строк из ${rows.length}.`;
    elTable.appendChild(more);
  }
}

function initMap() {
  map = L.map("map").setView([57.0, 53.0], 7); // Удмуртия (примерно)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  cluster = L.markerClusterGroup();
  map.addLayer(cluster);
}

function clearMarkers() {
  cluster.clearLayers();
  markers = [];
}

function drawMarkers(rows) {
  clearMarkers();

  const q = getSelectedQuestion();
  unitColor = new Map();

  const units = uniq(
    rows
      .map(r => getAnswerUnit(r, q))
      .map(u => norm(u))
      .filter(Boolean)
  );

  buildLegend(units);

  rows.forEach(r => {
    const lat = toNum(r.lat);
    const lon = toNum(r.lon);
    if (lat === null || lon === null) return;

    const unit = getAnswerUnit(r, q);
    const color = colorForUnit(unit);

    const marker = L.circleMarker([lat, lon], {
      radius: 7,
      color: color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.8,
    });

    const popup = `
      <div style="font-size:13px;">
        <div><b>${norm(r.settlement)}</b></div>
        <div>${norm(r.district)}, ${norm(r.region)}</div>
        <hr/>
        <div><b>Вопрос:</b> ${norm(r.question_id)} ${norm(r.question)}</div>
        <div><b>Ответ:</b> ${norm(r.unit1)} ${norm(r.unit2)}</div>
        ${norm(r.comment) ? `<div><b>Комментарий:</b> ${norm(r.comment)}</div>` : ""}
      </div>
    `;
    marker.bindPopup(popup);
    markers.push(marker);
    cluster.addLayer(marker);
  });
}

function applyFilters() {
  const q = norm(elQuestion.value);
  const reg = norm(elRegion.value);
  const dist = norm(elDistrict.value);
  const sSearch = norm(elSettlementSearch.value).toLowerCase();
  const uSearch = norm(elUnitSearch.value).toLowerCase();

  filteredRows = allRows.filter(r => {
    // вопрос
    const qid = norm(r.question_id);
    const qtext = norm(r.question);
    const matchQ = !q || qid === q || qtext === q;
    if (!matchQ) return false;

    // регион/район
    if (reg && norm(r.region) !== reg) return false;
    if (dist && norm(r.district) !== dist) return false;

    // поиск пунктов
    if (sSearch && !norm(r.settlement).toLowerCase().includes(sSearch)) return false;

    // поиск единицы
    const u1 = norm(r.unit1).toLowerCase();
    const u2 = norm(r.unit2).toLowerCase();
    if (uSearch && !(u1.includes(uSearch) || u2.includes(uSearch))) return false;

    return true;
  });

  drawMarkers(filteredRows);
  renderTable(filteredRows);
  setStatus(`Строк: ${filteredRows.length}`);
}

async function loadData() {
  if (!SHEET_CSV_URL || SHEET_CSV_URL.includes("PASTE_YOUR")) {
    setStatus("В app.js не задана ссылка SHEET_CSV_URL.");
    return;
  }

  elSheetLink.href = SHEET_VIEW_URL;

  setStatus("Загрузка данных из таблицы…");

  const url = SHEET_CSV_URL + (SHEET_CSV_URL.includes("?") ? "&" : "?") + "t=" + Date.now();
  const res = await fetch(url);
  const csv = await res.text();

  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  allRows = parsed.data.map(r => ({
    region: norm(r.region),
    district: norm(r.district),
    settlement: norm(r.settlement),
    lat: norm(r.lat),
    lon: norm(r.lon),
    question_id: norm(r.question_id),
    question: norm(r.question),
    unit1: norm(r.unit1),
    unit2: norm(r.unit2),
    comment: norm(r.comment),
  }));

  // заполним выпадающие списки
  const questions = uniq(allRows.map(r => r.question_id || r.question).filter(Boolean));
  fillSelect(elQuestion, questions, "— Выберите вопрос —");

  const regions = uniq(allRows.map(r => r.region).filter(Boolean)).sort();
  fillSelect(elRegion, regions);

  // district зависит от региона, обновляем отдельно
  updateDistrictOptions();

  setStatus(`Данные загружены. Всего строк: ${allRows.length}`);
}

function updateDistrictOptions() {
  const reg = norm(elRegion.value);
  const districts = uniq(
    allRows
      .filter(r => !reg || norm(r.region) === reg)
      .map(r => r.district)
      .filter(Boolean)
  ).sort();
  fillSelect(elDistrict, districts);
}

function wireEvents() {
  elQuestion.addEventListener("change", applyFilters);

  elRegion.addEventListener("change", () => {
    updateDistrictOptions();
    applyFilters();
  });

  elDistrict.addEventListener("change", applyFilters);
  elSettlementSearch.addEventListener("input", () => setTimeout(applyFilters, 150));
  elUnitSearch.addEventListener("input", () => setTimeout(applyFilters, 150));

  elReset.addEventListener("click", () => {
    elQuestion.value = "";
    elRegion.value = "";
    elDistrict.value = "";
    elSettlementSearch.value = "";
    elUnitSearch.value = "";
    updateDistrictOptions();
    applyFilters();
  });
}

(async function main() {
  initMap();
  wireEvents();
  await loadData();
  applyFilters();
})();