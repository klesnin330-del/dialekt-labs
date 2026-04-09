const CFG = window.LAB3_CONFIG || {};

const DATA_URL = CFG.dataUrl || "/lab3/data";
const ADD_POINT_ENDPOINT = CFG.addEndpoint || "";
const SHEET_EDIT_URL = CFG.sheetEditUrl || "";
const SHEET_PUBLIC_URL = CFG.sheetPublicUrl || "";

const UDM_BOUNDS = { minLat: 55.5, maxLat: 58.9, minLon: 51.0, maxLon: 55.8 };

const PALETTE = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"
];

let allRows = [];
let filteredRows = [];
let map, cluster, unitColor = new Map();
let addMarker = null, addLat = null, addLon = null;

// UI
const elStatus = document.getElementById("status");
const elLegend = document.getElementById("legend");
const elTable = document.getElementById("table");
const elQuestion = document.getElementById("questionSelect");
const elDistrict = document.getElementById("districtSelect");
const elSettlementSearch = document.getElementById("settlementSearch");
const elUnitSearch = document.getElementById("unitSearch");
const elReset = document.getElementById("resetBtn");
const elSheetLink = document.getElementById("sheetLink");

// Add UI
const elAddSettlement = document.getElementById("addSettlement");
const elAddDistrict = document.getElementById("addDistrict");
const elAddQuestion = document.getElementById("addQuestionSelect");
const elCustomQuestionBox = document.getElementById("customQuestionBox");
const elCustomQuestionText = document.getElementById("customQuestionText");
const elCustomQuestionId = document.getElementById("customQuestionId");
const elAddUnit1 = document.getElementById("addUnit1");
const elAddUnit2 = document.getElementById("addUnit2");
const elAddComment = document.getElementById("addComment");
const elFindBtn = document.getElementById("findBtn");
const elAddBtn = document.getElementById("addBtn");

// hidden form
const addForm = document.getElementById("addForm");
const f_district = document.getElementById("f_district");
const f_settlement = document.getElementById("f_settlement");
const f_lat = document.getElementById("f_lat");
const f_lon = document.getElementById("f_lon");
const f_question_id = document.getElementById("f_question_id");
const f_question = document.getElementById("f_question");
const f_unit1 = document.getElementById("f_unit1");
const f_unit2 = document.getElementById("f_unit2");
const f_comment = document.getElementById("f_comment");

function norm(s) { return (s ?? "").toString().trim(); }
function toNum(x) {
  const v = parseFloat((x ?? "").toString().replace(",", "."));
  return Number.isFinite(v) ? v : null;
}
function uniq(arr) { return Array.from(new Set(arr)); }
function setStatus(t) { elStatus.textContent = t; }

function inUdmurtia(lat, lon) {
  return lat >= UDM_BOUNDS.minLat && lat <= UDM_BOUNDS.maxLat && lon >= UDM_BOUNDS.minLon && lon <= UDM_BOUNDS.maxLon;
}

function fillSelect(selectEl, options, allLabel = "— Все —") {
  const prev = selectEl.value;
  selectEl.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = allLabel;
  selectEl.appendChild(optAll);

  options.forEach(o => {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    selectEl.appendChild(opt);
  });

  if (options.some(o => o.value === prev)) selectEl.value = prev;
}

function answerUnit(row) {
  return norm(row.unit1) || norm(row.unit2) || "";
}

function colorForUnit(unit) {
  if (!unit) return "#1f3c88";
  if (!unitColor.has(unit)) unitColor.set(unit, PALETTE[unitColor.size % PALETTE.length]);
  return unitColor.get(unit);
}

function buildLegend(units) {
  elLegend.innerHTML = "";
  if (!units.length) { elLegend.textContent = "Нет данных для легенды."; return; }

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
}

function renderTable(rows) {
  elTable.innerHTML = "";
  if (!rows.length) { elTable.textContent = "Нет строк по текущим фильтрам."; return; }

  rows.slice(0, 200).forEach(r => {
    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `
      <div><b>${norm(r.settlement)}</b> — ${norm(r.district)}</div>
      <div><i>${norm(r.question)}</i></div>
      <div>Ответ: <b>${norm(r.unit1)}</b>${norm(r.unit2) ? " / " + norm(r.unit2) : ""}</div>
      ${norm(r.comment) ? `<div>Комментарий: ${norm(r.comment)}</div>` : ""}
    `;
    elTable.appendChild(div);
  });
}

function initMap() {
  map = L.map("map").setView([57.0, 53.0], 7);

  // убрать префикс Leaflet (чтобы не было лишних значков/элементов)
  map.attributionControl.setPrefix(false);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  cluster = L.markerClusterGroup();
  map.addLayer(cluster);

  map.on("click", (e) => {
    setAddPoint(e.latlng.lat, e.latlng.lng, "Координаты выбраны кликом по карте");
  });
}

function setAddPoint(lat, lon, msg) {
  lat = Number(lat); lon = Number(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  if (!inUdmurtia(lat, lon)) {
    setStatus("Точка вне границ Удмуртии. Выбери место в Удмуртии.");
    return;
  }

  addLat = lat;
  addLon = lon;

  if (addMarker) map.removeLayer(addMarker);
  addMarker = L.marker([lat, lon]).addTo(map).bindPopup("Новая точка").openPopup();

  setStatus(`${msg} (lat=${lat.toFixed(5)}, lon=${lon.toFixed(5)})`);
}

async function geocodeSettlement(name) {
  const q = `${name}, Удмуртская Республика`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" }});
  const data = await res.json();
  if (!data.length) return null;
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
}

function clearMarkers() { cluster.clearLayers(); }

function drawMarkers(rows) {
  clearMarkers();
  unitColor = new Map();

  const units = uniq(rows.map(answerUnit).filter(Boolean));
  buildLegend(units);

  rows.forEach(r => {
    const lat = toNum(r.lat);
    const lon = toNum(r.lon);
    if (lat === null || lon === null) return;

    const unit = answerUnit(r);
    const color = colorForUnit(unit);

    const marker = L.circleMarker([lat, lon], {
      radius: 7, color, weight: 2, fillColor: color, fillOpacity: 0.8
    });

    marker.bindPopup(`
      <div style="font-size:13px;">
        <div><b>${norm(r.settlement)}</b></div>
        <div>${norm(r.district)}</div>
        <hr/>
        <div><b>Вопрос:</b> ${norm(r.question)}</div>
        <div><b>Ответ:</b> ${norm(r.unit1)} ${norm(r.unit2)}</div>
        ${norm(r.comment) ? `<div><b>Комментарий:</b> ${norm(r.comment)}</div>` : ""}
      </div>
    `);

    cluster.addLayer(marker);
  });
}

function updateDistrictOptions() {
  const districts = uniq(allRows.map(r => norm(r.district)).filter(Boolean)).sort();
  fillSelect(elDistrict, districts.map(d => ({ value: d, label: d })));
}

function applyFilters() {
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

  drawMarkers(filteredRows);
  renderTable(filteredRows);
  setStatus(`Строк: ${filteredRows.length}`);
}

async function loadData() {
  elSheetLink.href = SHEET_EDIT_URL || SHEET_PUBLIC_URL || "#";
  setStatus("Загрузка данных…");

  const res = await fetch(DATA_URL + "?t=" + Date.now());
  const tsv = await res.text();

  const parsed = Papa.parse(tsv, { header: true, skipEmptyLines: true, delimiter: "\t" });

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

  // Вопросы: value=question_id, label=question
  const qMap = new Map();
  allRows.forEach(r => {
    const id = norm(r.question_id);
    const text = norm(r.question) || id;
    if (id && !qMap.has(id)) qMap.set(id, text);
  });

  const qOptions = Array.from(qMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));

  fillSelect(elQuestion, qOptions, "— Выберите вопрос —");

  const qOptionsForAdd = [...qOptions, { value: "__custom__", label: "Другое (ввести вручную)" }];
  fillSelect(elAddQuestion, qOptionsForAdd, "— Выберите вопрос —");

  updateDistrictOptions();

  setStatus(`Данные загружены. Всего строк: ${allRows.length}`);
}

function wireEvents() {
  elQuestion.addEventListener("change", applyFilters);
  elDistrict.addEventListener("change", applyFilters);
  elSettlementSearch.addEventListener("input", () => setTimeout(applyFilters, 150));
  elUnitSearch.addEventListener("input", () => setTimeout(applyFilters, 150));

  elReset.addEventListener("click", () => {
    elQuestion.value = "";
    elDistrict.value = "";
    elSettlementSearch.value = "";
    elUnitSearch.value = "";
    applyFilters();
  });

  elAddQuestion.addEventListener("change", () => {
    const isCustom = norm(elAddQuestion.value) === "__custom__";
    elCustomQuestionBox.style.display = isCustom ? "block" : "none";
  });

  elFindBtn.addEventListener("click", async () => {
    const s = norm(elAddSettlement.value);
    if (!s) { setStatus("Введите населённый пункт для поиска."); return; }

    setStatus("Поиск населённого пункта (OSM)…");
    try {
      const p = await geocodeSettlement(s);
      if (!p) { setStatus("Не найдено. Попробуйте другое название."); return; }
      map.setView([p.lat, p.lon], 12);
      setAddPoint(p.lat, p.lon, "Координаты определены по названию");
    } catch {
      setStatus("Ошибка геокодирования. Попробуйте позже.");
    }
  });

  elAddBtn.addEventListener("click", () => {
    if (!ADD_POINT_ENDPOINT) {
      setStatus("Не задан Apps Script endpoint для добавления точки.");
      return;
    }

    const settlement = norm(elAddSettlement.value);
    const district = norm(elAddDistrict.value);

    let qid = norm(elAddQuestion.value);
    let qtext = norm(elAddQuestion.options[elAddQuestion.selectedIndex]?.text);

    const unit1 = norm(elAddUnit1.value);
    const unit2 = norm(elAddUnit2.value);
    const comment = norm(elAddComment.value);

    if (!settlement || !district || !qid || !unit1) {
      setStatus("Заполните: населённый пункт, район, вопрос, единица 1.");
      return;
    }
    if (addLat === null || addLon === null) {
      setStatus("Сначала нажмите 'Найти на карте' или кликните по карте, чтобы выбрать место.");
      return;
    }

    if (qid === "__custom__") {
      qtext = norm(elCustomQuestionText.value);
      let customId = norm(elCustomQuestionId.value);

      if (!qtext) { setStatus("Введите текст нового вопроса."); return; }

      if (!customId) {
        let maxN = 0;
        for (const r of allRows) {
          const m = /^Q(\d+)$/.exec(norm(r.question_id));
          if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
        }
        customId = "Q" + (maxN + 1);
      }
      qid = customId;
    }

    addForm.action = ADD_POINT_ENDPOINT;

    f_settlement.value = settlement;
    f_district.value = district;
    f_lat.value = String(addLat);
    f_lon.value = String(addLon);
    f_question_id.value = qid;
    f_question.value = qtext;
    f_unit1.value = unit1;
    f_unit2.value = unit2;
    f_comment.value = comment;

    addForm.submit();
    setStatus("Точка отправлена в таблицу. Обновляю данные…");

    setTimeout(async () => {
      await loadData();
      applyFilters();
      setStatus("Готово. Если точка не появилась — обновите страницу через 30–60 сек (кэш Google).");
    }, 2500);
  });

  elAddQuestion.dispatchEvent(new Event("change"));
}

(async function main() {
  initMap();
  wireEvents();
  await loadData();
  applyFilters();
})();