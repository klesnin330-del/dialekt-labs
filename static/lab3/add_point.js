(() => {
  const cfg = window.LAB3_CONFIG || {};
  const dataUrl = cfg.dataUrl || "/lab3/data";
  const appendUrl = cfg.appendUrl || "/lab3/append";
  const geocodeUrl = cfg.geocodeUrl || "/lab3/geocode";

  const $ = (sel, root=document) => root.querySelector(sel);
  const norm = (s) => String(s || "").trim().toLowerCase();

  function parseTSV(text) {
    if (window.Papa) {
      const res = Papa.parse(text, { header: true, delimiter: "\t", skipEmptyLines: true });
      return res.data || [];
    }
    const lines = String(text || "").split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const head = lines[0].split("\t").map(s => s.trim());
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      const row = {};
      for (let j = 0; j < head.length; j++) row[head[j]] = (cols[j] ?? "").trim();
      out.push(row);
    }
    return out;
  }

  async function loadRows() {
    const r = await fetch(dataUrl, { cache: "no-store" });
    const buf = await r.arrayBuffer();
    const txt = new TextDecoder("utf-8").decode(buf);
    return parseTSV(txt);
  }

  function getMap() {
    return window.__LAB3_MAP || window.map || null; // у вас в старом коде карта часто в window.map
  }

  async function waitReady(timeoutMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const panel = $(".lab3Panel");
      const mainQ = $("#questionSelect");
      const map = getMap();
      const mainFilled = mainQ && mainQ.options && mainQ.options.length >= 2; // больше, чем плейсхолдер
      if (panel && map && mainFilled) return { panel, map, mainQ };
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  }

  function buildUI(panel) {
    const wrap = document.createElement("div");
    wrap.className = "block";
    wrap.id = "addPointBlock";

    wrap.innerHTML = `
      <div class="block-title">Добавление точки</div>
      <div class="small">
        Пожалуйста, выберите вопрос, включите режим и нажмите на карту (или выберите населённый пункт).
      </div>

      <label class="label">Вопрос (для добавления):</label>
      <select id="addQuestionSelect" class="input"></select>

      <div id="addQuestionCustomWrap" style="display:none; margin-top:8px;">
        <label class="label">Новый вопрос (ID/номер или текст):</label>
        <input id="addQuestionCustom" class="input" type="text" placeholder="например: 152 или текст вопроса">
        <div class="small">Поле используется только если выбрано «Добавить новый вопрос…».</div>
      </div>

      <button id="addToggleBtn" class="btn">Режим добавления: выкл</button>

      <label class="label">Населённый пункт:</label>
      <input id="addSettlement" class="input" list="settlementDatalist" placeholder="Начните ввод..." />
      <datalist id="settlementDatalist"></datalist>

      <label class="label">Район:</label>
      <input id="addDistrict" class="input" type="text" placeholder="например: Шарканский" />

      <div class="row">
        <input id="addLat" class="input" type="text" placeholder="lat" readonly />
        <input id="addLon" class="input" type="text" placeholder="lon" readonly />
      </div>

      <label class="label">Единица (ответ):</label>
      <input id="addUnit" class="input" type="text" placeholder="например: хата" />

      <label class="label">Комментарий (необязательно):</label>
      <input id="addComment" class="input" type="text" />

      <button id="addSubmitBtn" class="btn btn--primary">Добавить в таблицу</button>
      <div id="addMsg" class="small"></div>
    `;

    panel.appendChild(wrap);
    return wrap;
  }

  function fillAddQuestionsFromMain(mainQ, addQ) {
    addQ.innerHTML = "";

    // копируем все существующие вопросы из основного селекта
    for (let i = 0; i < mainQ.options.length; i++) {
      const o = mainQ.options[i];
      const val = String(o.value || "").trim();
      const text = String(o.textContent || "").trim();
      if (i === 0 && !val) continue; // пропустить "— выберите —"
      const n = document.createElement("option");
      n.value = val;
      n.textContent = text;
      if (o.dataset && o.dataset.question) n.dataset.question = o.dataset.question;
      addQ.appendChild(n);
    }

    const optNew = document.createElement("option");
    optNew.value = "__NEW__";
    optNew.textContent = "➕ Добавить новый вопрос…";
    addQ.appendChild(optNew);
  }

  async function tryGeocode(name) {
    try {
      const r = await fetch(`${geocodeUrl}?q=${encodeURIComponent(name)}`, { cache: "no-store" });
      const j = await r.json();
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
    const ready = await waitReady();
    if (!ready) return;

    const { panel, map, mainQ } = ready;

    // создаём UI в панели, НЕ трогая ваш старый HTML
    const ui = buildUI(panel);

    const addQ = $("#addQuestionSelect", ui);
    const addQWrap = $("#addQuestionCustomWrap", ui);
    const addQCustom = $("#addQuestionCustom", ui);
    const btnToggle = $("#addToggleBtn", ui);
    const inpSettlement = $("#addSettlement", ui);
    const dlSettlements = $("#settlementDatalist", ui);
    const inpDistrict = $("#addDistrict", ui);
    const inpLat = $("#addLat", ui);
    const inpLon = $("#addLon", ui);
    const inpUnit = $("#addUnit", ui);
    const inpComment = $("#addComment", ui);
    const btnSubmit = $("#addSubmitBtn", ui);
    const msg = $("#addMsg", ui);

    const setMsg = (t, ok=true) => { msg.textContent = t || ""; msg.style.color = ok ? "#1f3c88" : "#b00020"; };

    // вопросы берём из уже заполненного основного списка (это то, что у вас работало вчера)
    fillAddQuestionsFromMain(mainQ, addQ);

    // если основной список поменяется (иногда при перезагрузке данных), пересоберём
    const obs = new MutationObserver(() => {
      if (mainQ.options.length >= 2) fillAddQuestionsFromMain(mainQ, addQ);
    });
    obs.observe(mainQ, { childList: true });

    addQ.addEventListener("change", () => {
      addQWrap.style.display = (addQ.value === "__NEW__") ? "block" : "none";
    });

    // подгружаем данные только для подсказок по пунктам
    let rows = [];
    try {
      rows = await loadRows();
      const seen = new Set();
      for (const r of rows) {
        const s = String(r.settlement || "").trim();
        if (!s) continue;
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        const o = document.createElement("option");
        o.value = s;
        dlSettlements.appendChild(o);
      }
    } catch {
      // не критично
    }

    let addMode = false;
    let tempMarker = null;

    function setCoords(lat, lon) {
      inpLat.value = Number(lat).toFixed(6);
      inpLon.value = Number(lon).toFixed(6);

      if (tempMarker) tempMarker.remove();
      tempMarker = L.marker([lat, lon], { draggable: true }).addTo(map);
      tempMarker.on("dragend", () => {
        const p = tempMarker.getLatLng();
        inpLat.value = p.lat.toFixed(6);
        inpLon.value = p.lng.toFixed(6);
      });
    }

    btnToggle.addEventListener("click", () => {
      addMode = !addMode;
      btnToggle.textContent = addMode ? "Режим добавления: вкл" : "Режим добавления: выкл";
      map.getContainer().style.cursor = addMode ? "crosshair" : "";
      setMsg(addMode ? "Нажмите на карту, чтобы указать координаты." : "");
    });

    map.on("click", (e) => {
      if (!addMode) return;
      setCoords(e.latlng.lat, e.latlng.lng);
    });

    async function autofillSettlement() {
      const name = String(inpSettlement.value || "").trim();
      if (!name) return;

      const hit = rows.find(r => norm(r.settlement) === norm(name) && r.lat && r.lon);
      if (hit) {
        if (hit.district && !inpDistrict.value) inpDistrict.value = String(hit.district).trim();
        const lat = parseFloat(hit.lat);
        const lon = parseFloat(hit.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          setCoords(lat, lon);
          map.setView([lat, lon], Math.max(map.getZoom(), 10));
        }
        return;
      }

      const g = await tryGeocode(name);
      if (g) {
        setCoords(g.lat, g.lon);
        map.setView([g.lat, g.lon], Math.max(map.getZoom(), 10));
      }
    }

    inpSettlement.addEventListener("change", autofillSettlement);
    inpSettlement.addEventListener("blur", autofillSettlement);

    btnSubmit.addEventListener("click", async () => {
      setMsg("");

      if (!appendUrl) { setMsg("appendUrl не задан.", false); return; }

      let question_id = String(addQ.value || "").trim();
      let question = "";

      if (!question_id) { setMsg("Выберите вопрос для добавления.", false); return; }

      if (question_id === "__NEW__") {
        const v = String(addQCustom.value || "").trim();
        if (!v) { setMsg("Введите новый вопрос.", false); return; }
        question_id = v;
        question = v;
      } else {
        const opt = addQ.options[addQ.selectedIndex];
        question = (opt?.dataset?.question || opt?.textContent || "").trim();
      }

      const settlement = String(inpSettlement.value || "").trim();
      const district = String(inpDistrict.value || "").trim();
      const lat = String(inpLat.value || "").trim();
      const lon = String(inpLon.value || "").trim();
      const unit1 = String(inpUnit.value || "").trim();
      const comment = String(inpComment.value || "").trim();

      if (!settlement) { setMsg("Укажите населённый пункт.", false); return; }
      if (!district) { setMsg("Укажите район.", false); return; }
      if (!lat || !lon) { setMsg("Укажите координаты (клик по карте).", false); return; }
      if (!unit1) { setMsg("Укажите единицу (ответ).", false); return; }

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
      try {
        const r = await fetch(appendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const txt = await r.text();
        if (!r.ok) throw new Error(txt || ("HTTP " + r.status));
        setMsg("Точка добавлена. Обновите страницу, чтобы увидеть её на карте.");
        inpUnit.value = "";
        inpComment.value = "";
      } catch (e) {
        setMsg("Ошибка добавления: " + (e?.message || e), false);
      } finally {
        btnSubmit.disabled = false;
      }
    });

    setMsg("Добавление точки готово.");
  })();
})();