(() => {
  const cfg = window.LAB3_CONFIG || {};
  const dataUrl = cfg.dataUrl || "/lab3/data";
  const appendUrl = cfg.appendUrl || "/lab3/append";
  const geocodeUrl = cfg.geocodeUrl || "";

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const norm = (s) => String(s || "").trim().toLowerCase();

  function parseTSV(text){
    if (window.Papa) {
      const res = Papa.parse(text, { header:true, delimiter:"\t", skipEmptyLines:true });
      return res.data || [];
    }
    // fallback
    const lines = String(text || "").split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const head = lines[0].split("\t").map(x => x.trim());
    const out = [];
    for (let i = 1; i < lines.length; i++){
      const cols = lines[i].split("\t");
      const row = {};
      for (let j = 0; j < head.length; j++) row[head[j]] = (cols[j] ?? "").trim();
      out.push(row);
    }
    return out;
  }

  async function fetchTSVRows(){
    const r = await fetch(dataUrl, { cache:"no-store" });
    const buf = await r.arrayBuffer();
    const txt = new TextDecoder("utf-8").decode(buf);
    return parseTSV(txt);
  }

  function getMap(){
    // старый lab3/app.js может держать карту как window.map, либо мы ранее ставили window.__LAB3_MAP
    return window.__LAB3_MAP || window.map || null;
  }

  function setMsg(el, t, ok=true){
    el.textContent = t || "";
    el.style.color = ok ? "#1f3c88" : "#b00020";
  }

  function buildBlock(panel){
    // если уже добавляли — не дублируем
    const old = document.getElementById("ap_block");
    if (old) return old;

    const wrap = document.createElement("div");
    wrap.className = "block";
    wrap.id = "ap_block";
    wrap.innerHTML = `
      <div class="block-title">Добавление точки</div>
      <div class="small">Выберите вопрос, включите режим и нажмите на карту.</div>

      <label class="label">Вопрос (для добавления):</label>
      <select id="ap_q" class="input"></select>

      <div id="ap_new_wrap" style="display:none; margin-top:8px;">
        <label class="label">Новый вопрос (ID/номер или текст):</label>
        <input id="ap_new" class="input" type="text" placeholder="например: 152 или текст вопроса">
      </div>

      <button id="ap_toggle" class="btn">Режим добавления: выкл</button>

      <label class="label">Населённый пункт:</label>
      <input id="ap_settlement" class="input" list="ap_settlement_dl" placeholder="Начните ввод..." />
      <datalist id="ap_settlement_dl"></datalist>

      <label class="label">Район:</label>
      <input id="ap_district" class="input" type="text" placeholder="например: Шарканский" />

      <div class="row">
        <input id="ap_lat" class="input" type="text" placeholder="lat" readonly />
        <input id="ap_lon" class="input" type="text" placeholder="lon" readonly />
      </div>

      <label class="label">Единица (ответ):</label>
      <input id="ap_unit" class="input" type="text" placeholder="например: хата" />

      <label class="label">Комментарий (необязательно):</label>
      <input id="ap_comment" class="input" type="text" />

      <button id="ap_submit" class="btn btn--primary">Добавить в таблицу</button>
      <div id="ap_msg" class="small"></div>
    `;

    panel.appendChild(wrap);
    return wrap;
  }

  function fillQuestions(sel, rows){
    const mapQ = new Map();
    for (const r of rows){
      const qid = String(r.question_id || "").trim();
      const q = String(r.question || "").trim();
      const d = String(r.darya_no || "").trim();
      if (!qid && !q) continue;
      const key = qid || q;
      if (!mapQ.has(key)) mapQ.set(key, { qid: qid || key, q: q || qid || key, darya: d });
    }

    const list = Array.from(mapQ.values()).sort((a,b) => String(a.qid).localeCompare(String(b.qid), "ru"));
    sel.innerHTML = "";

    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— выберите вопрос —";
    sel.appendChild(o0);

    for (const x of list){
      const o = document.createElement("option");
      o.value = x.qid;
      o.textContent = x.darya ? `${x.qid} (ДАРЯ ${x.darya}) — ${x.q}` : `${x.qid} — ${x.q}`;
      o.dataset.question = x.q;
      sel.appendChild(o);
    }

    const onew = document.createElement("option");
    onew.value = "__NEW__";
    onew.textContent = "➕ Добавить новый вопрос…";
    sel.appendChild(onew);
  }

  function fillSettlements(dl, rows){
    dl.innerHTML = "";
    const seen = new Set();
    for (const r of rows){
      const s = String(r.settlement || "").trim();
      if (!s) continue;
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const o = document.createElement("option");
      o.value = s;
      dl.appendChild(o);
    }
  }

  async function geocode(name){
    if (!geocodeUrl) return null;
    try{
      const r = await fetch(`${geocodeUrl}?q=${encodeURIComponent(name)}`, { cache:"no-store" });
      const j = await r.json().catch(() => null);
      if (!j || !j.ok) return null;
      const lat = parseFloat(j.lat);
      const lon = parseFloat(j.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon };
    } catch {
      return null;
    }
  }

  (async () => {
    // 1) найдём левую панель
    const panel = document.querySelector(".lab3Panel");
    if (!panel) return;

    // 2) создаём блок UI всегда
    const block = buildBlock(panel);

    const selQ = block.querySelector("#ap_q");
    const wrapNew = block.querySelector("#ap_new_wrap");
    const inpNew = block.querySelector("#ap_new");
    const btnToggle = block.querySelector("#ap_toggle");
    const inpSettlement = block.querySelector("#ap_settlement");
    const dl = block.querySelector("#ap_settlement_dl");
    const inpDistrict = block.querySelector("#ap_district");
    const inpLat = block.querySelector("#ap_lat");
    const inpLon = block.querySelector("#ap_lon");
    const inpUnit = block.querySelector("#ap_unit");
    const inpComment = block.querySelector("#ap_comment");
    const btnSubmit = block.querySelector("#ap_submit");
    const msg = block.querySelector("#ap_msg");

    setMsg(msg, "Загрузка списка вопросов…");

    // 3) грузим TSV для вопросов/подсказок
    let rows = [];
    try{
      rows = await fetchTSVRows();
      fillQuestions(selQ, rows);
      fillSettlements(dl, rows);
      setMsg(msg, "Готово: выберите вопрос и включите режим добавления.");
    } catch(e){
      setMsg(msg, "Ошибка: не удалось загрузить TSV (проверьте ссылку таблицы).", false);
      return;
    }

    selQ.addEventListener("change", () => {
      wrapNew.style.display = (selQ.value === "__NEW__") ? "block" : "none";
    });

    // 4) режим добавления: будем “ждать” карту и ловить клики по DOM
    let addMode = false;
    let tempMarker = null;

    function setCoords(map, lat, lon){
      inpLat.value = Number(lat).toFixed(6);
      inpLon.value = Number(lon).toFixed(6);

      if (tempMarker) tempMarker.remove();
      tempMarker = L.marker([lat, lon], { draggable:true }).addTo(map);
      tempMarker.on("dragend", () => {
        const p = tempMarker.getLatLng();
        inpLat.value = p.lat.toFixed(6);
        inpLon.value = p.lng.toFixed(6);
      });
    }

    btnToggle.addEventListener("click", async () => {
      const map = getMap();
      if (!map) { setMsg(msg, "Карта ещё не готова. Подождите 2–3 секунды и попробуйте снова.", false); return; }
      addMode = !addMode;
      btnToggle.textContent = addMode ? "Режим добавления: вкл" : "Режим добавления: выкл";
      map.getContainer().style.cursor = addMode ? "crosshair" : "";
      setMsg(msg, addMode ? "Нажмите на карту для выбора координат." : "");
    });

    // DOM click по #map (надежнее, чем map.on('click') если что-то мешает)
    const mapDiv = document.getElementById("map");
    mapDiv.addEventListener("click", (ev) => {
      if (!addMode) return;
      const map = getMap();
      if (!map) return;
      const latlng = map.mouseEventToLatLng(ev);
      setCoords(map, latlng.lat, latlng.lng);
    }, true);

    // подсказка по поселению
    async function autofillSettlement(){
      const name = String(inpSettlement.value || "").trim();
      if (!name) return;
      const hit = rows.find(r => norm(r.settlement) === norm(name) && r.lat && r.lon);

      const map = getMap();

      if (hit && map){
        if (hit.district && !inpDistrict.value) inpDistrict.value = String(hit.district).trim();
        const lat = parseFloat(hit.lat);
        const lon = parseFloat(hit.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)){
          setCoords(map, lat, lon);
          map.setView([lat, lon], Math.max(map.getZoom(), 10));
        }
        return;
      }

      const g = await geocode(name);
      if (g && map){
        setCoords(map, g.lat, g.lon);
        map.setView([g.lat, g.lon], Math.max(map.getZoom(), 10));
      }
    }

    inpSettlement.addEventListener("change", autofillSettlement);
    inpSettlement.addEventListener("blur", autofillSettlement);

    // 5) отправка
    btnSubmit.addEventListener("click", async () => {
      setMsg(msg, "");

      if (!appendUrl) { setMsg(msg, "appendUrl не задан.", false); return; }

      let question_id = String(selQ.value || "").trim();
      let question = "";

      if (!question_id) { setMsg(msg, "Выберите вопрос для добавления.", false); return; }

      if (question_id === "__NEW__"){
        const v = String(inpNew.value || "").trim();
        if (!v) { setMsg(msg, "Введите новый вопрос.", false); return; }
        question_id = v;
        question = v;
      } else {
        const opt = selQ.options[selQ.selectedIndex];
        question = (opt?.dataset?.question || opt?.textContent || "").trim();
      }

      const settlement = String(inpSettlement.value || "").trim();
      const district = String(inpDistrict.value || "").trim();
      const lat = String(inpLat.value || "").trim();
      const lon = String(inpLon.value || "").trim();
      const unit1 = String(inpUnit.value || "").trim();
      const comment = String(inpComment.value || "").trim();

      if (!settlement) { setMsg(msg, "Укажите населённый пункт.", false); return; }
      if (!district) { setMsg(msg, "Укажите район.", false); return; }
      if (!lat || !lon) { setMsg(msg, "Укажите координаты (клик по карте).", false); return; }
      if (!unit1) { setMsg(msg, "Укажите единицу (ответ).", false); return; }

      const payload = {
        source: "user",
        region: "",
        district,
        settlement,
        type: "",
        lat,
        lon,
        darya_no: "",
        question_id,
        question,
        category: "",
        unit1,
        unit2: "",
        comment
      };

      btnSubmit.disabled = true;
      setMsg(msg, "Отправка…");
      try{
        const r = await fetch(appendUrl, {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify(payload)
        });
        const txt = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt}`);
        setMsg(msg, "Точка добавлена. Обновите страницу, чтобы увидеть её на карте.");
        inpUnit.value = "";
        inpComment.value = "";
      } catch(e){
        setMsg(msg, "Ошибка добавления: " + (e?.message || e), false);
      } finally {
        btnSubmit.disabled = false;
      }
    });
  })();
})();