/* «Код без ошибок» — общий скрипт сайта.
   Хранилище прогресса, тема, меню, формулы, поиск, план и сводка, отметки, заметки к задачам,
   тесты, карточки, устный экзамен, «продолжить с места остановки», словарь, фильтры. */
(function () {
  "use strict";

  var rootEl = document.querySelector("[data-root]");
  var root = (rootEl && rootEl.getAttribute("data-root")) || "";
  var DATA = window.ATK_DATA || { modules: [], questionCoverage: {}, totalQuestions: 27 };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  }

  /* =====================================================================
     1. Хранилище прогресса
     Всё хранится в localStorage этого браузера под одним ключом.
     Формат версионирован (schema). Старые форматы переводятся в новый,
     неизвестные и испорченные поля отбрасываются.
     ===================================================================== */
  var KEY = "atk-kbo:progress";
  var LEGACY_KEYS = ["atk-progress-v1"];
  var THEME_KEY = "atk-kbo:theme";
  var LEGACY_THEME_KEY = "atk-theme";
  var SCHEMA = 2;

  var memory = {};
  var persistent = true;
  try {
    window.localStorage.setItem("atk-kbo:probe", "1");
    window.localStorage.removeItem("atk-kbo:probe");
  } catch (e) { persistent = false; }

  function rawGet(k) {
    if (persistent) { try { return window.localStorage.getItem(k); } catch (e) { persistent = false; } }
    return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null;
  }
  function rawSet(k, v) {
    if (persistent) { try { window.localStorage.setItem(k, v); return; } catch (e) { persistent = false; } }
    memory[k] = v;
  }
  function rawDel(k) {
    try { window.localStorage.removeItem(k); } catch (e) { /* недоступно — нечего удалять */ }
    delete memory[k];
  }

  var ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
  var QKEY_RE = /^q\d{1,3}$/;
  var STATUS = { learning: true, done: true };
  var URL_RE = /^(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.html(?:#[A-Za-z0-9_-]{1,60})?$/;

  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
  function int(x, min, max) {
    x = Number(x);
    return (isFinite(x) && Math.floor(x) === x && x >= min && x <= max) ? x : null;
  }
  function str(x, max) { return typeof x === "string" ? x.slice(0, max) : null; }

  function emptyProgress() {
    return { schema: SCHEMA, modules: {}, tasks: {}, blocks: {}, notes: {}, quizzes: {}, oral: {}, last: null, updatedAt: null };
  }

  /* Приводит любые данные к допустимому виду: только известные поля и значения. */
  function sanitize(src) {
    var p = emptyProgress();
    if (!isObj(src)) return p;
    if (isObj(src.modules)) Object.keys(src.modules).forEach(function (k) {
      if (ID_RE.test(k) && STATUS[src.modules[k]]) p.modules[k] = src.modules[k];
    });
    ["tasks", "blocks", "oral"].forEach(function (f) {
      if (isObj(src[f])) Object.keys(src[f]).forEach(function (k) {
        if (ID_RE.test(k) && src[f][k] === true) p[f][k] = true;
      });
    });
    if (isObj(src.notes)) Object.keys(src.notes).slice(0, 1000).forEach(function (k) {
      var v = src.notes[k];
      if (ID_RE.test(k) && typeof v === "string" && v.trim()) p.notes[k] = v.slice(0, 5000);
    });
    if (isObj(src.quizzes)) Object.keys(src.quizzes).forEach(function (k) {
      var q = src.quizzes[k];
      if (!ID_RE.test(k) || !isObj(q)) return;
      var r = { answers: {} };
      if (isObj(q.answers)) Object.keys(q.answers).forEach(function (a) {
        if (QKEY_RE.test(a) && /^[a-z]$/.test(q.answers[a])) r.answers[a] = q.answers[a];
      });
      ["last", "best"].forEach(function (f) {
        var s = q[f];
        if (!isObj(s)) return;
        var sc = int(s.score, 0, 999), t = int(s.total, 1, 999);
        if (sc !== null && t !== null && sc <= t) r[f] = { score: sc, total: t, at: str(s.at, 40) || "" };
      });
      p.quizzes[k] = r;
    });
    if (isObj(src.last) && typeof src.last.url === "string" && URL_RE.test(src.last.url)) {
      p.last = { url: src.last.url, title: str(src.last.title, 200) || "", at: str(src.last.at, 40) || "" };
    }
    p.updatedAt = str(src.updatedAt, 40);
    return p;
  }

  /* Переводит сохранённые данные любой известной версии в текущую.
     Схема 1 (версии сайта 0.1.x): поля modules, tasks, blocks — переносятся как есть. */
  function migrate(raw) {
    if (!isObj(raw)) return emptyProgress();
    return sanitize(raw);
  }

  function parseSafe(t) { try { return JSON.parse(t); } catch (e) { return undefined; } }

  function load() {
    var txt = rawGet(KEY);
    if (txt === null) {
      for (var i = 0; i < LEGACY_KEYS.length; i++) {
        var old = rawGet(LEGACY_KEYS[i]);
        if (old !== null) {
          var migrated = migrate(parseSafe(old));
          write(migrated);
          rawDel(LEGACY_KEYS[i]);
          return migrated;
        }
      }
      return emptyProgress();
    }
    var parsed = parseSafe(txt);
    if (parsed === undefined) {
      // Испорченная запись: сохраняем копию для ручного восстановления и начинаем с чистого листа.
      rawSet(KEY + ":corrupt", txt);
      return emptyProgress();
    }
    return migrate(parsed);
  }
  function write(p) {
    p.schema = SCHEMA;
    p.updatedAt = new Date().toISOString();
    rawSet(KEY, JSON.stringify(p));
  }
  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) { /* один сбой не ломает остальное */ } }); }
  function update(mutator, quiet) {
    var p = load();
    mutator(p);
    p = sanitize(p);
    write(p);
    if (!quiet) emit();
    return p;
  }
  function replaceAll(p) { write(sanitize(p)); emit(); }
  function resetAll() { rawDel(KEY); LEGACY_KEYS.forEach(rawDel); emit(); }

  // Изменения из другой вкладки этого же сайта
  window.addEventListener("storage", function (e) { if (e.key === KEY || e.key === null) emit(); });

  window.ATK = { load: load, update: update, onChange: onChange, isPersistent: function () { return persistent; } };

  /* Предупреждение, если браузер не даёт сохранять данные */
  if (!persistent) $$("[data-storage-warning]").forEach(function (el) { el.hidden = false; });

  /* =====================================================================
     2. Тема
     ===================================================================== */
  // Две темы: светлая (по умолчанию) и тёмная. Выбор сохраняется; настройка браузера не учитывается.
  var themeBtn = $("#theme-btn");
  function readTheme() {
    var t = rawGet(THEME_KEY);
    if (t === null) {
      t = rawGet(LEGACY_THEME_KEY);
      if (t !== null) { rawDel(LEGACY_THEME_KEY); if (t === "light" || t === "dark") rawSet(THEME_KEY, t); }
    }
    return t === "dark" ? "dark" : "light";
  }
  function applyTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    if (!themeBtn) return;
    var next = mode === "dark" ? "light" : "dark";
    var label = $(".btn-label", themeBtn);
    if (label) label.textContent = next === "dark" ? "Тёмная тема" : "Светлая тема";
    themeBtn.setAttribute("aria-label", next === "dark" ? "Включить тёмную тему" : "Включить светлую тему");
    themeBtn.setAttribute("data-next", next);
  }
  var currentTheme = readTheme();
  applyTheme(currentTheme);
  if (themeBtn) themeBtn.addEventListener("click", function () {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    rawSet(THEME_KEY, currentTheme);
    applyTheme(currentTheme);
    fitHeader();
  });

  /* =====================================================================
     3. Шапка и меню
     Если пункты меню не помещаются в строку (узкое окно, крупный шрифт, масштаб),
     шапка переходит в компактный вид: меню прячется под кнопку «Меню».
     ===================================================================== */
  var header = $(".site-header");
  var headerInner = $(".site-header__inner");
  var menuBtn = $("#menu-btn");
  var nav = $("#main-nav");
  function closeMenu() {
    if (!nav || !menuBtn) return;
    nav.classList.remove("is-open");
    menuBtn.setAttribute("aria-expanded", "false");
  }
  function fitHeader() {
    if (!header || !headerInner || !nav) return;
    var wasCompact = header.classList.contains("is-compact");
    header.classList.remove("is-compact");
    var ul = $("ul", nav);
    var overflow = headerInner.scrollWidth > headerInner.clientWidth + 1 ||
      (ul && ul.scrollWidth > nav.clientWidth + 1) ||
      nav.getBoundingClientRect().height > 60;
    if (overflow) header.classList.add("is-compact");
    else if (wasCompact) closeMenu();
  }
  var fitTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitHeader, 60);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHeader);
  window.addEventListener("load", fitHeader);
  fitHeader();
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        closeMenu();
        menuBtn.focus();
      }
    });
  }

  /* =====================================================================
     4. Формулы KaTeX (скрипты подключаются только на страницах с формулами)
     ===================================================================== */
  if (typeof window.renderMathInElement === "function") {
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false,
      ignoredClasses: ["no-math"]
    });
  }

  /* =====================================================================
     5. Поиск (индекс загружается при первом открытии)
     ===================================================================== */
  var searchBtn = $("#search-btn");
  var dialog = $("#search-dialog");
  var input = $("#search-input");
  var results = $("#search-results");
  var closeBtn = $("#search-close");
  var index = null, indexState = "none", lastQuery = "";

  // Unicode-классы есть не во всех старых браузерах — тогда используем запасное выражение.
  var NON_WORD;
  try { NON_WORD = new RegExp("[^\\p{L}\\p{N}\\s]", "gu"); } catch (e) { NON_WORD = /[^a-z0-9а-я\s]/gi; }
  function normalize(s) {
    return (s || "").toLowerCase().replace(/ё/g, "е").replace(NON_WORD, " ").replace(/\s+/g, " ").trim();
  }
  function buildIndex() {
    index = (window.ATK_SEARCH || []).map(function (it) {
      return { t: it.t, u: it.u, p: it.p, hay: normalize(it.t + " " + (it.k || "")), ht: normalize(it.t) };
    });
  }
  function ensureIndex(done) {
    if (index) { done(); return; }
    if (window.ATK_SEARCH) { buildIndex(); done(); return; }
    if (indexState === "loading") return;
    indexState = "loading";
    var s = document.createElement("script");
    s.src = root + "assets/js/search-index.js";
    s.onload = function () { indexState = "ready"; buildIndex(); done(); };
    s.onerror = function () { indexState = "error"; showMessage("Не удалось загрузить поиск. Проверьте подключение и откройте поиск ещё раз."); indexState = "none"; };
    document.head.appendChild(s);
  }
  function showMessage(text) {
    results.innerHTML = "";
    var li = document.createElement("li");
    li.className = "sr-empty";
    li.textContent = text;
    results.appendChild(li);
  }
  function runSearch(q) {
    lastQuery = q;
    if (!index) { showMessage("Загружаю поиск…"); ensureIndex(function () { runSearch(lastQuery); }); return; }
    var nq = normalize(q);
    if (!nq) { showMessage("Начните вводить слово: например, «обратный», «расстояние», «поле»."); return; }
    var words = nq.split(" ");
    var found = index.map(function (it) {
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        if (it.hay.indexOf(words[i]) === -1) return null;
        score += it.ht.indexOf(words[i]) !== -1 ? 2 : 1;
      }
      return { it: it, score: score };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, 30);
    if (!found.length) { showMessage("Ничего не нашлось. Попробуйте другое слово или загляните в словарь."); return; }
    results.innerHTML = "";
    found.forEach(function (f) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = root + f.it.u;
      var t = document.createElement("span"); t.className = "sr-title"; t.textContent = f.it.t;
      var p = document.createElement("span"); p.className = "sr-path"; p.textContent = f.it.p;
      a.appendChild(t); a.appendChild(p); li.appendChild(a); results.appendChild(li);
    });
  }
  function openSearch() {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    input.value = "";
    runSearch("");
    input.focus();
  }
  function closeSearch() {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
    if (searchBtn) searchBtn.focus();
  }
  if (searchBtn && dialog) {
    searchBtn.addEventListener("click", openSearch);
    closeBtn.addEventListener("click", closeSearch);
    input.addEventListener("input", function () { runSearch(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var first = $("a", results);
        if (first) window.location.href = first.href;
      }
    });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) closeSearch(); });
    document.addEventListener("keydown", function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.key === "k" || e.key === "K" || e.key === "л" || e.key === "Л") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openSearch(); }
      else if (e.key === "/" && !typing) { e.preventDefault(); openSearch(); }
    });
  }

  /* =====================================================================
     6. Отметки: «решено», «прочитано», «отрепетировал»
     ===================================================================== */
  var CHECK_KINDS = [
    { attr: "data-task", field: "tasks", container: ".task" },
    { attr: "data-block", field: "blocks", container: null },
    { attr: "data-oral", field: "oral", container: ".q-item" }
  ];
  function syncChecks() {
    var p = load();
    CHECK_KINDS.forEach(function (kind) {
      $$("input[" + kind.attr + "]").forEach(function (cb) {
        cb.checked = !!p[kind.field][cb.getAttribute(kind.attr)];
        if (kind.container) {
          var box = cb.closest(kind.container);
          if (box) box.classList.toggle("is-done", cb.checked);
        }
      });
    });
  }
  CHECK_KINDS.forEach(function (kind) {
    $$("input[" + kind.attr + "]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute(kind.attr);
        update(function (p) { if (cb.checked) p[kind.field][id] = true; else delete p[kind.field][id]; });
      });
    });
  });
  syncChecks();
  onChange(syncChecks);

  /* =====================================================================
     7. Заметки к задачам: символы, автовысота, «Очистить», пометка «есть запись»
     ===================================================================== */
  // [текст на кнопке, что вставить, подпись]; если есть 4-й элемент — это пара: выделение оборачивается.
  var SYMBOLS = [
    ["≡", "≡", "сравнимо по модулю"],
    ["≢", "≢", "не сравнимо по модулю"],
    ["x⁻¹", "⁻¹", "обратный элемент, степень минус один"],
    ["·", "·", "умножение"],
    ["⊕", "⊕", "сложение по модулю 2"],
    ["≠", "≠", "не равно"],
    ["≤", "≤", "меньше или равно"],
    ["≥", "≥", "больше или равно"],
    ["∈", "∈", "принадлежит"],
    ["ℤ", "ℤ", "целые числа или кольцо вычетов"],
    ["𝔽", "𝔽", "конечное поле"],
    ["x²", "²", "в квадрате"],
    ["xⁿ", "ⁿ", "в степени n"],
    ["x₂", "₂", "нижний индекс 2"],
    ["‖x‖", "‖", "вес вектора, двойные черты", "‖"],
    ["⌊x⌋", "⌊", "целая часть, округление вниз", "⌋"],
    ["→", "→", "стрелка"]
  ];
  function noteIds() { return Object.keys(load().notes); }
  function announceNotes() {
    var ev;
    try { ev = new CustomEvent("atk:notes"); } catch (e) { ev = document.createEvent("Event"); ev.initEvent("atk:notes", false, false); }
    document.dispatchEvent(ev);
  }

  // Вставка в позицию курсора. execCommand сохраняет отмену (Ctrl+Z); если он не сработал — setRangeText.
  function insertAt(ta, open, close) {
    var s = ta.selectionStart, e = ta.selectionEnd;
    var sel = ta.value.slice(s, e);
    var text = open + sel + (close || "");
    var before = ta.value;
    ta.focus();
    var ok = false;
    try { ok = document.execCommand("insertText", false, text) && ta.value !== before; } catch (err) { ok = false; }
    if (!ok) {
      if (ta.setRangeText) ta.setRangeText(text, s, e, "end");
      else { ta.value = before.slice(0, s) + text + before.slice(e); }
      var ev;
      try { ev = new Event("input", { bubbles: true }); } catch (err) { ev = document.createEvent("Event"); ev.initEvent("input", true, false); }
      ta.dispatchEvent(ev);
    }
    // Пустая пара: курсор между символами. Обёрнутое выделение: курсор после закрывающего.
    var end = s + text.length;
    var pos = close && !sel ? end - close.length : end;
    ta.setSelectionRange(pos, pos);
  }

  // Высота поля по содержимому, не выше 60% экрана
  function growNote(ta) {
    if (!ta.offsetParent) return; // поле в свёрнутом блоке — посчитаем при раскрытии
    ta.style.height = "auto";
    var max = Math.max(160, Math.round(window.innerHeight * 0.6));
    var h = ta.scrollHeight + (ta.offsetHeight - ta.clientHeight);
    ta.style.height = Math.min(h, max) + "px";
    ta.classList.toggle("is-tall", h > max);
  }

  $$("textarea[data-note]").forEach(function (ta) {
    var id = ta.getAttribute("data-note");
    var status = document.getElementById(ta.id + "-status");
    var details = ta.closest("details");
    var flag = details ? $(".note-flag", details) : null;
    var timer = null;
    var undoValue = null;

    // Панель символов перед полем
    var tools = document.createElement("div");
    tools.className = "note-tools";
    tools.setAttribute("role", "group");
    tools.setAttribute("aria-label", "Вставить символ");
    SYMBOLS.forEach(function (sym) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "sym-btn";
      b.textContent = sym[0];
      b.title = sym[2];
      b.setAttribute("aria-label", "Вставить: " + sym[2]);
      // Не забираем фокус у поля: курсор и выделение остаются на месте
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
      b.addEventListener("click", function () { insertAt(ta, sym[1], sym[3]); });
      tools.appendChild(b);
    });
    ta.parentNode.insertBefore(tools, ta);

    // Строка под полем: статус и «Очистить» / «Вернуть»
    var foot = document.createElement("div");
    foot.className = "note-foot";
    if (status) foot.appendChild(status);
    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn--ghost btn--small";
    clearBtn.textContent = "Очистить";
    var undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "btn btn--ghost btn--small";
    undoBtn.textContent = "Вернуть";
    undoBtn.hidden = true;
    foot.appendChild(clearBtn);
    foot.appendChild(undoBtn);
    ta.parentNode.insertBefore(foot, ta.nextSibling);

    ta.classList.add("is-auto");
    function grow() { growNote(ta); }
    function sync() {
      var has = !!ta.value.trim();
      clearBtn.disabled = !has;
      if (flag) flag.hidden = !load().notes[id];
    }
    function save() {
      clearTimeout(timer);
      timer = null;
      update(function (p) { if (ta.value.trim()) p.notes[id] = ta.value; else delete p.notes[id]; }, true);
      sync();
      announceNotes();
    }
    function savedText() {
      return persistent ? "Сохранено в этом браузере." : "Сохранено до закрытия вкладки: браузер не разрешает хранить данные.";
    }
    function fill() {
      if (document.activeElement !== ta && timer === null) ta.value = load().notes[id] || "";
      sync();
      grow();
    }
    fill();
    onChange(fill);
    if (details) details.addEventListener("toggle", function () { if (details.open) grow(); });

    ta.addEventListener("input", function () {
      grow();
      clearBtn.disabled = !ta.value.trim();
      if (undoValue !== null && ta.value) { undoValue = null; undoBtn.hidden = true; }
      if (status) status.textContent = "Сохраняю…";
      clearTimeout(timer);
      timer = setTimeout(function () { save(); if (status) status.textContent = savedText(); }, 400);
    });
    ta.addEventListener("blur", function () { if (timer !== null) { save(); if (status) status.textContent = savedText(); } });

    clearBtn.addEventListener("click", function () {
      if (!ta.value.trim()) return;
      undoValue = ta.value;
      ta.value = "";
      save();
      grow();
      undoBtn.hidden = false;
      if (status) status.textContent = "Заметка удалена.";
      undoBtn.focus();
    });
    undoBtn.addEventListener("click", function () {
      if (undoValue === null) return;
      ta.value = undoValue;
      undoValue = null;
      save();
      grow();
      undoBtn.hidden = true;
      if (status) status.textContent = "Заметка возвращена. " + savedText();
      ta.focus();
    });
  });

  // Ширина поля меняется при повороте телефона — пересчитываем высоту раскрытых полей
  (function () {
    var rt = null;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        $$("textarea.note-input.is-auto").forEach(growNote);
      }, 150);
    });
  })();

  /* =====================================================================
     8. Мини-тесты: ответы, последний и лучший результат сохраняются
     ===================================================================== */
  $$("form.quiz").forEach(function (form) {
    var qid = form.id;
    if (!qid || !ID_RE.test(qid)) return;
    var saved = $(".quiz-saved", form);
    var res = $(".quiz-result", form);
    var qs = $$(".quiz-q", form);

    function renderSaved() {
      var q = load().quizzes[qid];
      if (!saved) return;
      if (q && q.last) {
        saved.textContent = "Последний результат: " + q.last.score + " из " + q.last.total +
          (q.last.at ? " (" + fmtDate(q.last.at) + ")" : "") +
          (q.best ? ". Лучший: " + q.best.score + " из " + q.best.total + "." : ".");
      } else {
        saved.textContent = "Вы ещё не проходили этот тест.";
      }
    }
    function restore() {
      var q = load().quizzes[qid];
      qs.forEach(function (fs) {
        var name = ($("input[type=radio]", fs) || {}).name;
        var val = q && q.answers[name];
        $$("input[type=radio]", fs).forEach(function (r) { r.checked = !!val && r.value === val; });
      });
    }
    function grade(showFeedback) {
      var right = 0, answered = 0;
      qs.forEach(function (fs) {
        var correct = fs.getAttribute("data-correct");
        var chosen = $("input:checked", fs);
        var fb = $(".quiz-feedback", fs);
        var expl = fs.getAttribute("data-explain") || "";
        if (!chosen) {
          if (showFeedback) { fb.className = "quiz-feedback"; fb.textContent = "Вы не выбрали ответ."; }
          return;
        }
        answered++;
        var ok = chosen.value === correct;
        if (ok) right++;
        if (showFeedback) {
          fb.className = "quiz-feedback " + (ok ? "is-right" : "is-wrong");
          fb.textContent = (ok ? "✓ Верно. " : "✗ Неверно. ") + expl;
        }
      });
      return { right: right, answered: answered, total: qs.length };
    }

    restore();
    renderSaved();
    onChange(renderSaved);

    form.addEventListener("change", function (e) {
      if (!e.target || e.target.type !== "radio") return;
      var name = e.target.name, val = e.target.value;
      update(function (p) {
        var q = p.quizzes[qid] || (p.quizzes[qid] = { answers: {} });
        q.answers[name] = val;
      }, true);
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var g = grade(true);
      var now = new Date().toISOString();
      res.textContent = "Результат: " + g.right + " из " + g.total + (g.answered < g.total ? " (есть вопросы без ответа)" : "") + ".";
      update(function (p) {
        var q = p.quizzes[qid] || (p.quizzes[qid] = { answers: {} });
        q.last = { score: g.right, total: g.total, at: now };
        if (!q.best || g.right > q.best.score) q.best = { score: g.right, total: g.total, at: now };
      });
    });
    form.addEventListener("reset", function () {
      setTimeout(function () {
        $$(".quiz-feedback", form).forEach(function (fb) { fb.className = "quiz-feedback"; fb.textContent = ""; });
        res.textContent = "Ответы сброшены. Лучший результат сохранён.";
        update(function (p) { if (p.quizzes[qid]) p.quizzes[qid].answers = {}; });
      }, 0);
    });
  });

  /* =====================================================================
     9. Где я остановился: страница и раздел
     ===================================================================== */
  function relPath() {
    var depth = (root.match(/\.\.\//g) || []).length;
    var parts = window.location.pathname.split("/");
    var file = parts[parts.length - 1] || "index.html";
    var dirs = depth ? parts.slice(parts.length - 1 - depth, parts.length - 1) : [];
    return dirs.concat([file]).join("/");
  }
  var here = relPath();
  var trackable = /^(theory|examples|practice|review)\/m\d{2}\.html$|^oral\/index\.html$/.test(here);
  if (trackable) {
    var h1 = $("main h1");
    var pageTitle = h1 ? h1.textContent.trim() : document.title;
    var saveLast = function (anchor, heading) {
      update(function (p) {
        p.last = { url: here + (anchor ? "#" + anchor : ""), title: pageTitle + (heading ? " — " + heading : ""), at: new Date().toISOString() };
      }, true);
    };
    saveLast("", "");
    if ("IntersectionObserver" in window) {
      var heads = $$("article h2[id], article h3[id], #tasks h2[id]");
      var pendingTimer = null, current = null;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && en.boundingClientRect.top < window.innerHeight * 0.5) current = en.target;
        });
        if (!current) return;
        clearTimeout(pendingTimer);
        var target = current;
        pendingTimer = setTimeout(function () { saveLast(target.id, target.textContent.trim()); }, 1200);
      }, { rootMargin: "0px 0px -50% 0px" });
      heads.forEach(function (h) { io.observe(h); });
    }
  }

  var cont = $("#continue");
  function renderContinue() {
    if (!cont) return;
    var p = load();
    cont.innerHTML = "";
    var text = document.createElement("p");
    var a = document.createElement("a");
    a.className = "btn";
    if (p.last) {
      text.appendChild(document.createTextNode("Последняя открытая страница" + (p.last.at ? " (" + fmtDate(p.last.at) + ")" : "") + ": "));
      var strong = document.createElement("strong");
      strong.textContent = p.last.title || p.last.url;
      text.appendChild(strong);
      a.href = root + p.last.url;
      a.textContent = "Продолжить";
    } else {
      text.textContent = "Вы ещё не открывали материалы модулей. Начните с первого.";
      a.href = root + "theory/m01.html";
      a.textContent = "Начать модуль 1";
    }
    cont.appendChild(text);
    cont.appendChild(a);
  }
  renderContinue();
  onChange(renderContinue);

  /* =====================================================================
     10. План и главная: модули со статусом и прогрессом
     ===================================================================== */
  var statusNames = { todo: "предстоит", learning: "изучается", done: "пройдено" };
  function moduleStatus(p, id) { return p.modules[id] || "todo"; }
  function countPrefix(obj, prefix) {
    return Object.keys(obj).filter(function (k) { return k.indexOf(prefix) === 0; }).length;
  }
  function moduleProgress(p, m) {
    var parts = [];
    if (m.blockCount) parts.push("прочитано блоков " + Math.min(countPrefix(p.blocks, m.id + "-b"), m.blockCount) + " из " + m.blockCount);
    if (m.taskCount) parts.push("решено задач " + Math.min(countPrefix(p.tasks, m.id + "-t"), m.taskCount) + " из " + m.taskCount);
    if (m.quizTotal) {
      var q = p.quizzes["quiz-" + m.id];
      parts.push(q && q.best ? "тест: лучший результат " + q.best.score + " из " + q.best.total : "тест не пройден");
    }
    return parts.join(", ");
  }
  function moduleLinks(m) {
    if (!m.ready) return "<p class=\"tl-links\"><span class=\"muted\">Материалы появятся, когда дойдём до этого модуля.</span></p>";
    var n = esc(m.id);
    return "<p class=\"tl-links\">" +
      "<a href=\"" + root + "theory/" + n + ".html\">Теория</a>" +
      "<a href=\"" + root + "examples/" + n + ".html\">Примеры</a>" +
      "<a href=\"" + root + "practice/" + n + ".html\">Практика</a>" +
      "<a href=\"" + root + "review/" + n + ".html\">Повторение</a></p>";
  }
  function qList(m) {
    if (!m.questions.length) return "база для следующих тем";
    return "вопросы программы: " + m.questions.join(", ");
  }
  function renderTimeline(el, withControls) {
    var p = load();
    var focusedName = document.activeElement && document.activeElement.name;
    el.innerHTML = "";
    DATA.modules.forEach(function (m) {
      var st = moduleStatus(p, m.id);
      var li = document.createElement("li");
      var progress = m.ready ? moduleProgress(p, m) : "";
      var html = "<div class=\"tl-item\" data-status=\"" + st + "\">" +
        "<div class=\"tl-num\" aria-hidden=\"true\">" + int(m.num, 0, 99) + "</div><div>" +
        "<p class=\"tl-title\">Модуль " + int(m.num, 0, 99) + ". " + esc(m.title) +
        " <span class=\"status-pill\" data-status=\"" + st + "\">" + statusNames[st] + "</span></p>" +
        "<p class=\"tl-meta\">" + esc(m.dates) + ", " + esc(qList(m)) + "</p>" +
        "<p class=\"tl-meta\">Блоки: " + esc(m.blocks.join("; ")) + (m.ready ? "" : " (план)") + "</p>" +
        (progress ? "<p class=\"tl-progress\">Прогресс: " + esc(progress) + ".</p>" : "") +
        moduleLinks(m);
      if (withControls) {
        html += "<fieldset class=\"status-group\"><legend>Мой статус модуля " + int(m.num, 0, 99) + "</legend>";
        ["todo", "learning", "done"].forEach(function (s) {
          html += "<label><input type=\"radio\" name=\"st-" + esc(m.id) + "\" value=\"" + s + "\"" +
            (s === st ? " checked" : "") + "> " + statusNames[s] + "</label>";
        });
        html += "</fieldset>";
      }
      html += "</div></div>";
      li.innerHTML = html;
      el.appendChild(li);
    });
    if (withControls) {
      $$("input[type=radio]", el).forEach(function (r) {
        r.addEventListener("change", function () {
          var id = r.name.replace("st-", "");
          update(function (pp) { if (r.value === "todo") delete pp.modules[id]; else pp.modules[id] = r.value; });
        });
      });
      if (focusedName) {
        var again = $("input[name=\"" + focusedName + "\"]:checked", el);
        if (again) again.focus();
      }
    }
  }
  function renderSummary() {
    var el = $("#progress-summary");
    if (!el) return;
    var p = load();
    var done = 0, learning = 0, tasksTotal = 0, tasksDone = 0;
    DATA.modules.forEach(function (m) {
      var s = moduleStatus(p, m.id);
      if (s === "done") done++; else if (s === "learning") learning++;
      if (m.ready && m.taskCount) {
        tasksTotal += m.taskCount;
        tasksDone += Math.min(countPrefix(p.tasks, m.id + "-t"), m.taskCount);
      }
    });
    var cov = DATA.questionCoverage || {};
    var ready = 0, partial = 0;
    Object.keys(cov).forEach(function (k) { if (cov[k] === "ready") ready++; else if (cov[k] === "partial") partial++; });
    var rehearsed = Object.keys(p.oral).length;
    var total = DATA.modules.length || 1;
    var pct = Math.round(done / total * 100);
    el.innerHTML =
      "<div class=\"stat\"><div class=\"stat__value\">" + done + " из " + total + "</div>" +
      "<div class=\"stat__label\">модулей пройдено, " + learning + " изучается</div>" +
      "<div class=\"meter\" role=\"img\" aria-label=\"Пройдено " + pct + "% модулей\"><span></span></div></div>" +
      "<div class=\"stat\"><div class=\"stat__value\">" + tasksDone + " из " + tasksTotal + "</div><div class=\"stat__label\">задач решено в готовых модулях</div></div>" +
      "<div class=\"stat\"><div class=\"stat__value\">" + rehearsed + " из " + DATA.totalQuestions + "</div>" +
      "<div class=\"stat__label\">вопросов программы отрепетировано вслух. На сайте разобрано: " + ready + " полностью, " + partial + " частично</div></div>";
    var bar = $(".meter > span", el);
    if (bar) bar.style.width = pct + "%";
  }
  function renderModuleCards() {
    var p = load();
    $$("[data-module-progress]").forEach(function (el) {
      var id = el.getAttribute("data-module-progress");
      var m = DATA.modules.filter(function (x) { return x.id === id; })[0];
      if (!m) return;
      var st = moduleStatus(p, id);
      var text = moduleProgress(p, m);
      el.textContent = "Статус: " + statusNames[st] + (text ? ". Прогресс: " + text + "." : ".");
    });
  }
  var tl = $("#module-timeline");
  function renderPlan() { if (tl) renderTimeline(tl, tl.hasAttribute("data-controls")); renderSummary(); renderModuleCards(); }
  renderPlan();
  onChange(renderPlan);

  /* =====================================================================
     11. Экспорт, импорт и сброс прогресса
     ===================================================================== */
  var ioStatus = $("#progress-io-status");
  function say(msg) { if (ioStatus) ioStatus.textContent = msg; }
  function describe(p) {
    return "модулей с отметкой: " + Object.keys(p.modules).length +
      ", решённых задач: " + Object.keys(p.tasks).length +
      ", заметок к задачам: " + Object.keys(p.notes).length +
      ", тестов: " + Object.keys(p.quizzes).length +
      ", отрепетированных вопросов: " + Object.keys(p.oral).length;
  }
  var exportBtn = $("#progress-export");
  if (exportBtn) exportBtn.addEventListener("click", function () {
    var p = load();
    var blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "atk-progress-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    say("Файл сохранён (" + describe(p) + "). Откройте его на другом устройстве через «Загрузить из файла».");
  });
  var importInput = $("#progress-import");
  if (importInput) importInput.addEventListener("change", function () {
    var f = importInput.files && importInput.files[0];
    if (!f) return;
    if (f.size > 2000000) { say("Файл слишком большой для файла прогресса. Нужен atk-progress-….json, сохранённый этим сайтом."); importInput.value = ""; return; }
    var reader = new FileReader();
    reader.onload = function () {
      var raw = parseSafe(reader.result);
      var known = isObj(raw) && ["modules", "tasks", "blocks", "notes", "quizzes", "oral"].some(function (k) { return isObj(raw[k]); });
      if (!known) {
        say("Не удалось прочитать файл. Нужен файл прогресса atk-progress-….json, сохранённый этим сайтом.");
      } else {
        var p = migrate(raw);
        replaceAll(p);
        say("Прогресс загружен из файла и заменил текущий: " + describe(p) + ".");
      }
      importInput.value = "";
    };
    reader.onerror = function () { say("Браузер не смог открыть файл. Попробуйте ещё раз."); };
    reader.readAsText(f);
  });
  var resetBtn = $("#progress-reset");
  var resetBox = $("#reset-confirm");
  if (resetBtn && resetBox) {
    resetBtn.addEventListener("click", function () {
      resetBox.hidden = false;
      resetBtn.setAttribute("aria-expanded", "true");
      $("#reset-no", resetBox).focus();
    });
    $("#reset-no", resetBox).addEventListener("click", function () {
      resetBox.hidden = true;
      resetBtn.setAttribute("aria-expanded", "false");
      resetBtn.focus();
    });
    $("#reset-yes", resetBox).addEventListener("click", function () {
      resetAll();
      resetBox.hidden = true;
      resetBtn.setAttribute("aria-expanded", "false");
      say("Прогресс на этом устройстве стёрт.");
      resetBtn.focus();
    });
  }

  /* =====================================================================
     12. Фильтр задач: по уровню и «С заметками»
     ===================================================================== */
  $$("[data-filter-group]").forEach(function (bar) {
    var target = document.getElementById(bar.getAttribute("data-filter-group"));
    var status = $("[data-filter-status]", bar);
    if (!target) return;
    var tasks = $$(".task", target);
    var notesBtn = $("button[data-filter-notes]", bar);
    var countEl = notesBtn ? $("[data-notes-count]", notesBtn) : null;
    var lvl = "all";
    var notesOnly = false;
    var empty = null;

    function taskHasNote(t) {
      var ta = $("textarea[data-note]", t);
      return !!(ta && load().notes[ta.getAttribute("data-note")]);
    }
    function countNotes() {
      var n = tasks.filter(taskHasNote).length;
      if (countEl) countEl.textContent = "· " + n;
      if (notesBtn) notesBtn.setAttribute("aria-label", "С заметками, задач: " + n);
      return n;
    }
    function apply() {
      var shown = 0;
      tasks.forEach(function (t) {
        var ok = (lvl === "all" || t.getAttribute("data-level") === lvl) && (!notesOnly || taskHasNote(t));
        t.hidden = !ok;
        if (ok) shown++;
      });
      if (status) status.textContent = (lvl === "all" && !notesOnly) ? "" : "Показано задач: " + shown;
      if (!empty) {
        empty = document.createElement("p");
        empty.className = "filter-empty muted";
        empty.hidden = true;
        target.insertBefore(empty, target.firstChild);
      }
      empty.hidden = shown > 0;
      empty.textContent = notesOnly
        ? "Задач с заметками" + (lvl === "all" ? "" : " этого уровня") + " пока нет. Откройте «Заметки» у любой задачи и запишите ответ."
        : "Задач этого уровня нет.";
    }
    $$("button[data-level]", bar).forEach(function (btn) {
      btn.addEventListener("click", function () {
        $$("button[data-level]", bar).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
        btn.setAttribute("aria-pressed", "true");
        lvl = btn.getAttribute("data-level");
        apply();
      });
    });
    if (notesBtn) {
      notesBtn.hidden = false;
      $$(".filter-sep", bar).forEach(function (el) { el.hidden = false; });
      notesBtn.addEventListener("click", function () {
        notesOnly = !notesOnly;
        notesBtn.setAttribute("aria-pressed", notesOnly ? "true" : "false");
        apply();
      });
      countNotes();
      // Счётчик обновляется сразу; список задач — только по нажатию фильтра,
      // чтобы задача не исчезала, пока вы в ней печатаете.
      document.addEventListener("atk:notes", countNotes);
      onChange(countNotes);
    }
  });

  /* =====================================================================
     13. Карточки
     ===================================================================== */
  // Каждая карточка переворачивается кнопкой или нажатием на саму карточку.
  function setFlipped(card, flipped) {
    var btn = $(".card__btn", card);
    var front = $(".card__face--front", card);
    var back = $(".card__face--back", card);
    card.classList.toggle("is-flipped", flipped);
    if (front) front.setAttribute("aria-hidden", flipped ? "true" : "false");
    if (back) back.setAttribute("aria-hidden", flipped ? "false" : "true");
    if (btn) {
      btn.setAttribute("aria-pressed", flipped ? "true" : "false");
      btn.textContent = flipped ? "Показать вопрос" : "Показать ответ";
    }
  }
  $$(".cards").forEach(function (list) {
    list.classList.add("is-ready");
    $$(".card", list).forEach(function (card) {
      if (!$(".card__flip", card)) return;
      setFlipped(card, false);
      var btn = $(".card__btn", card);
      if (btn) btn.addEventListener("click", function () { setFlipped(card, !card.classList.contains("is-flipped")); });
      $(".card__flip", card).addEventListener("click", function () { setFlipped(card, !card.classList.contains("is-flipped")); });
    });
  });
  var shuffleBtn = $("#cards-shuffle");
  if (shuffleBtn) shuffleBtn.addEventListener("click", function () {
    var list = document.getElementById(shuffleBtn.getAttribute("aria-controls"));
    var items = Array.prototype.slice.call(list.children);
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = items[i]; items[i] = items[j]; items[j] = tmp;
    }
    items.forEach(function (it) { list.appendChild(it); setFlipped(it, false); });
    var st = $("#cards-status");
    if (st) st.textContent = "Карточки перемешаны и повёрнуты вопросом вверх.";
  });

  /* =====================================================================
     14. Фильтр словаря
     ===================================================================== */
  var gq = $("#glossary-q");
  if (gq) {
    var gItems = $$(".gl-item");
    var gEmpty = $("#glossary-empty");
    var gCount = $("#glossary-count");
    var gFilter = function () {
      var q = normalize(gq.value);
      var shown = 0;
      gItems.forEach(function (it) {
        var ok = !q || normalize(it.textContent).indexOf(q) !== -1;
        it.hidden = !ok;
        if (ok) shown++;
      });
      if (gEmpty) gEmpty.hidden = shown !== 0;
      if (gCount) gCount.textContent = "Показано терминов: " + shown + " из " + gItems.length;
    };
    gq.addEventListener("input", gFilter);
    gFilter();
  }

  /* =====================================================================
     15. Оглавление модуля и ссылки на свёрнутые блоки
     ===================================================================== */
  var tocs = $$(".toc-details");
  if (tocs.length && window.matchMedia) {
    var mq = window.matchMedia("(min-width: 1000px)");
    var syncToc = function () { tocs.forEach(function (d) { d.open = mq.matches; }); };
    syncToc();
    if (mq.addEventListener) mq.addEventListener("change", syncToc);
  }
  function openTarget() {
    var id = "";
    try { id = decodeURIComponent((window.location.hash || "").slice(1)); } catch (e) { return; }
    if (!id) return;
    var t = document.getElementById(id);
    if (!t) return;
    for (var node = t; node; node = node.parentElement) if (node.tagName === "DETAILS") node.open = true;
    t.scrollIntoView();
  }
  window.addEventListener("hashchange", openTarget);
  openTarget();
})();
