const CFG = window.LAB3_CONFIG || {};
const DATA_URL = CFG.dataUrl || "/lab3/data";
const GEOCODE_URL = CFG.geocodeUrl || "/lab3/geocode";
const APPEND_URL = CFG.appendUrl || "/lab3/append";

const UDM_BOUNDS = { minLat: 55.5, maxLat: 58.9, minLon: 51.0, maxLon: 55.8 };
const PALETTE = ["#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd","#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf"];

let allRows = [], filteredRows = [];
let map, layerGroup, unitColor = new Map();
let addMarker = null, addLat = null, addLon = null;

window._lab3_add_lat = null;
window._lab3_add_lon = null;

const elStatus = document.getElementById("status");
const elLegend = document.getElementById("legend");
const elTable = document.getElementById("table");
const elQuestion = document.getElementById("questionSelect");
const elDistrict = document.getElementById("districtSelect");
const elSettlementSearch = document.getElementById("settlementSearch");
const elUnitSearch = document.getElementById("unitSearch");
const elReset = document.getElementById("resetBtn");
const elSheetLink = document.getElementById("sheetLink");
const elPointInfo = document.getElementById("pointInfo");

const elAddSettlement = document.getElementById("addSettlement");
const elAddType = document.getElementById("addType");
const elAddDistrict = document.getElementById("addDistrict");
const elAddQuestion = document.getElementById("addQuestionSelect");
const elAddUnit1 = document.getElementById("addUnit1");
const elAddUnit2 = document.getElementById("addUnit2");
const elAddComment = document.getElementById("addComment");
const elFindBtn = document.getElementById("findBtn");
const elAddBtn = document.getElementById("addBtn");

function norm(s){ return (s??"").toString().trim(); }
function toNum(x){ const v = parseFloat((x??"").toString().replace(",",".")); return Number.isFinite(v)? v : null; }
function uniq(arr){ return Array.from(new Set(arr)); }
function setStatus(t){ if(elStatus) elStatus.textContent = t; }
function inUdmurtia(lat, lon){
  return lat >= UDM_BOUNDS.minLat && lat <= UDM_BOUNDS.maxLat &&
         lon >= UDM_BOUNDS.minLon && lon <= UDM_BOUNDS.maxLon;
}
function fillSelect(selectEl, options, allLabel="— Все —"){
  const prev = selectEl.value;
  selectEl.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = ""; optAll.textContent = allLabel;
  selectEl.appendChild(optAll);
  options.forEach(o => {
    const opt = document.createElement("option");
    opt.value = o.value; opt.textContent = o.label;
    // ✅ Единый формат: ключи в dataset совпадают с чтением
    if(o.source !== undefined) opt.dataset.source = String(o.source);
    if(o.daryaNo !== undefined) opt.dataset.daryano = String(o.daryaNo);
    if(o.category !== undefined) opt.dataset.category = String(o.category);
    selectEl.appendChild(opt);
  });
  if(options.some(o => o.value === prev)) selectEl.value = prev;
}
function answerUnit(row){ return norm(row.unit1) || norm(row.unit2) || ""; }
function colorForUnit(unit){
  if(!unit) return "#1f3c88";
  if(!unitColor.has(unit)) unitColor.set(unit, PALETTE[unitColor.size % PALETTE.length]);
  return unitColor.get(unit);
}
function buildLegend(units){
  elLegend.innerHTML = "";
  if(!units.length){ elLegend.textContent = "Нет данных для легенды."; return; }
  units.forEach(u => {
    const item = document.createElement("div"); item.className = "legend-item";
    const sw = document.createElement("div"); sw.className = "swatch"; sw.style.background = colorForUnit(u);
    const txt = document.createElement("div"); txt.textContent = u;
    item.appendChild(sw); item.appendChild(txt);
    elLegend.appendChild(item);
  });
}
function renderTable(rows){
  elTable.innerHTML = "";
  if(!rows.length){ elTable.textContent = "Нет строк по текущим фильтрам."; return; }
  rows.slice(0, 200).forEach(r => {
    const div = document.createElement("div"); div.className = "row";
    div.innerHTML = `<div><b>${norm(r.settlement)}</b> — ${norm(r.district)}</div><div><i>${norm(r.question)}</i></div><div>Ответ: <b>${norm(r.unit1)}</b> ${norm(r.unit2)?"/"+norm(r.unit2):""}</div>${norm(r.comment)?`<div>Комментарий: ${norm(r.comment)}</div>`:""}`;
    elTable.appendChild(div);
  });
}

function initMap(){
  map = L.map("map").setView([57.0, 53.0], 7);
  map.attributionControl.setPrefix(false);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution:"&copy; OpenStreetMap"}).addTo(map);
  layerGroup = L.layerGroup().addTo(map);
  map.on("click", (e) => setAddPoint(e.latlng.lat, e.latlng.lng, "Координаты выбраны кликом"));
}

function setAddPoint(lat, lon, msg){
  lat = Number(lat); lon = Number(lon);
  if(!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if(!inUdmurtia(lat, lon)){ setStatus("Точка вне границ Удмуртии."); return; }
  addLat = lat; addLon = lon;
  window._lab3_add_lat = lat; window._lab3_add_lon = lon;
  if(addMarker) map.removeLayer(addMarker);
  addMarker = L.marker([lat, lon]).addTo(map).bindPopup("Новая точка").openPopup();
  setStatus(`${msg} (lat=${lat.toFixed(5)}, lon=${lon.toFixed(5)})`);
}

async function geocodeSettlement(name){
  const res = await fetch(`${GEOCODE_URL}?q=${encodeURIComponent(name)}`, {cache:"no-store"});
  const data = await res.json();
  if(!data.ok) return null;
  return { lat: Number(data.lat), lon: Number(data.lon) };
}

function clearMarkers(){ layerGroup.clearLayers(); }

function drawMarkers(rows){
  clearMarkers(); unitColor = new Map();
  const activeQuestion = norm(elQuestion.value);
  const shouldColor = !!activeQuestion;
  if(shouldColor){ buildLegend(uniq(rows.map(answerUnit).filter(Boolean))); }
  else { elLegend.innerHTML = '<div style="color:#666;font-size:13px;">Выберите вопрос для легенды</div>'; }
  
  rows.forEach(r => {
    const lat = toNum(r.lat), lon = toNum(r.lon);
    if(lat===null || lon===null) return;
    const color = shouldColor ? colorForUnit(answerUnit(r)) : "#333333";
    const marker = L.circleMarker([lat, lon], {radius:6, color:"#000", weight:1, fillColor:color, fillOpacity:0.85});
    marker.bindPopup(`<div style="font-size:13px;"><b>${norm(r.settlement)}</b><br>${norm(r.district)}<hr><b>Вопрос:</b> ${norm(r.question)}<br><b>Ответ:</b> ${norm(r.unit1)} ${norm(r.unit2)}</div>`);
    marker.on('click', () => {
      if(elPointInfo){
        const current = norm(r.settlement);
        const allHere = allRows.filter(x => norm(x.settlement) === current);
        let html = `<h3>${current}</h3><div class="meta"><b>Район:</b> ${norm(allHere[0]?.district)}</div><ul>`;
        allHere.forEach(x => html += `<li style="margin-bottom:6px;"><b>${norm(x.question)}</b>: ${norm(x.unit1)}</li>`);
        html += `</ul>`; elPointInfo.innerHTML = html;
      }
    });
    layerGroup.addLayer(marker);
  });
}

function updateDistrictOptions(){
  fillSelect(elDistrict, uniq(allRows.map(r=>norm(r.district)).filter(Boolean)).sort().map(d=>({value:d, label:d})));
}

function applyFilters(){
  const qid = norm(elQuestion.value), dist = norm(elDistrict.value);
  const sSearch = norm(elSettlementSearch.value).toLowerCase();
  const uSearch = norm(elUnitSearch.value).toLowerCase();
  filteredRows = allRows.filter(r => {
    if(qid && norm(r.question_id)!==qid) return false;
    if(dist && norm(r.district)!==dist) return false;
    if(sSearch && !norm(r.settlement).toLowerCase().includes(sSearch)) return false;
    const u1=norm(r.unit1).toLowerCase(), u2=norm(r.unit2).toLowerCase();
    if(uSearch && !(u1.includes(uSearch)||u2.includes(uSearch))) return false;
    return true;
  });
  drawMarkers(filteredRows); renderTable(filteredRows);
  setStatus(`Строк: ${filteredRows.length}`);
}

async function loadData(){
  elSheetLink.href = CFG.sheetEditUrl || CFG.sheetPublicUrl || "#";
  setStatus("Загрузка данных...");
  const res = await fetch(DATA_URL+"?t="+Date.now());
  const tsv = await res.text();
  const parsed = Papa.parse(tsv, {header:true, skipEmptyLines:true, delimiter:"\t"});
  allRows = parsed.data.map(r => ({
    source:norm(r.source), region:norm(r.region), district:norm(r.district), settlement:norm(r.settlement),
    type:norm(r.type), lat:norm(r.lat), lon:norm(r.lon), darya_no:norm(r.darya_no),
    question_id:norm(r.question_id), question:norm(r.question), category:norm(r.category),
    unit1:norm(r.unit1), unit2:norm(r.unit2), comment:norm(r.comment)
  }));
  
  const qMap = new Map();
  allRows.forEach(r => {
    const id = norm(r.question_id);
    if (id && !qMap.has(id)) {
      qMap.set(id, {
        text: norm(r.question) || id,
        source: r.source || "ДАРЯ (выборка)",
        darya_no: r.darya_no || "",
        category: r.category || ""  // ✅ category теперь точно сохраняется
      });
    }
  });
  
  const qOpts = Array.from(qMap.entries()).map(([qid, data])=>({
    value: qid, label: data.text, source: data.source, daryaNo: data.darya_no, category: data.category
  })).sort((a,b)=>a.label.localeCompare(b.label,"ru"));
  
  fillSelect(elQuestion, qOpts, "— Выберите вопрос —");
  fillSelect(elAddQuestion, [...qOpts, {value:"__custom__", label:"Другое (ввести вручную)", source:"", daryaNo:"", category:""}], "— Выберите вопрос —");
  
  updateDistrictOptions();
  setStatus(`Данные загружены. Всего строк: ${allRows.length}`);
}

function wireEvents(){
  elQuestion.addEventListener("change", applyFilters);
  elDistrict.addEventListener("change", applyFilters);
  elSettlementSearch.addEventListener("input", () => setTimeout(applyFilters, 150));
  elUnitSearch.addEventListener("input", () => setTimeout(applyFilters, 150));
  elReset.addEventListener("click", () => { elQuestion.value=""; elDistrict.value=""; elSettlementSearch.value=""; elUnitSearch.value=""; applyFilters(); });

  let debounceTimer;
  elAddSettlement.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const name = norm(elAddSettlement.value); if(!name) return;
      const hit = allRows.find(r => norm(r.settlement) === name && r.lat && r.lon);
      if(hit){
        setAddPoint(hit.lat, hit.lon, "Найдено в базе");
        elAddDistrict.value = hit.district || "";
        elAddType.value = hit.type || "село";
      } else {
        setStatus("Поиск координат...");
        const p = await geocodeSettlement(name);
        if(p) setAddPoint(p.lat, p.lon, "Найдено через OSM");
      }
    }, 400);
  });

  elFindBtn.addEventListener("click", async () => {
    const s = norm(elAddSettlement.value); if(!s){ setStatus("Введите пункт."); return; }
    setStatus("Поиск (OSM)...");
    try{ const p = await geocodeSettlement(s); if(!p){ setStatus("Не найдено."); return; } map.setView([p.lat, p.lon], 12); setAddPoint(p.lat, p.lon, "Координаты определены"); }
    catch{ setStatus("Ошибка геокодирования."); }
  });

  if(elAddBtn){
    elAddBtn.addEventListener("click", async () => {
      console.log("[DEBUG] Кнопка нажата");
      const settlement = norm(elAddSettlement.value);
      const district = norm(elAddDistrict.value);
      const typeVal = norm(elAddType.value) || "село";
      const unit1 = norm(elAddUnit1.value);
      const unit2 = norm(elAddUnit2.value);
      const comment = norm(elAddComment.value);
      
      let qid = norm(elAddQuestion.value);
      let qtext = norm(elAddQuestion.options[elAddQuestion.selectedIndex]?.textContent);
      
      let source = "ДАРЯ (выборка)";
      let darya_no = "";
      let category = "";  // ✅ category инициализирован
      
      if(qid !== "__custom__"){
        const selected = elAddQuestion.options[elAddQuestion.selectedIndex];
        if(selected){
          source = selected.dataset?.source || "ДАРЯ (выборка)";
          darya_no = selected.dataset?.daryano || "";
          category = selected.dataset?.category || "";  // ✅ category читается
        }
      }
      
      if(!settlement || !district || !qid || !unit1){ setStatus("❌ Заполните: пункт, район, вопрос, единицу 1."); return; }
      const lat = addLat ?? window._lab3_add_lat;
      const lon = addLon ?? window._lab3_add_lon;
      if(lat===null || lon===null){ setStatus("❌ Выберите место на карте."); return; }

      elAddBtn.disabled = true; elAddBtn.textContent = "Отправка..."; setStatus("⏳ Отправка...");
      try{
        const payload = {
          source: String(source),
          region: "Удмуртская Республика",
          district: String(district),
          settlement: String(settlement),
          type: String(typeVal),
          lat: String(lat),
          lon: String(lon),
          darya_no: String(darya_no),
          question_id: String(qid),
          question: String(qtext),
          category: String(category),  // ✅ category передаётся
          unit1: String(unit1),
          unit2: String(unit2 || ""),
          comment: String(comment || "")
        };
        console.log("[DEBUG] Payload:", payload);
        
        const res = await fetch(APPEND_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
        const result = await res.json();
        console.log("[DEBUG] Response:", result);
        
        if(result.ok || result.status==="success"){
          setStatus("✅ Точка добавлена! Обновляю карту...");
          // ✅ Явно перезагружаем данные и перерисовываем карту
          setTimeout(async()=>{ 
            await loadData(); 
            applyFilters();  // applyFilters вызывает drawMarkers
            setStatus("Готово."); 
          }, 1500);
        } else { setStatus("❌ Ошибка: "+(result.message||result.error||"Неизвестно")); }
      } catch(e){ console.error(e); setStatus("❌ Ошибка сети: "+e.message); }
      finally { elAddBtn.disabled = false; elAddBtn.textContent = "Добавить в таблицу"; }
    });
  }
}

(async function main(){ initMap(); wireEvents(); await loadData(); applyFilters(); })();