/* «Код без ошибок» — интерактивные тренажёры.
   1) код Хемминга (7,4) на главной;
   2) калькулятор по модулю с алгоритмом Евклида;
   3) расстояние Хемминга и вес;
   4) параметры кода d, t, s, s'. */
(function () {
  "use strict";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; });
  }

  /* =====================================================
     1. Код Хемминга (7,4): проверочные биты на позициях 1, 2, 4
     ===================================================== */
  var hm = document.getElementById("hamming-demo");
  if (hm) {
    var sentRow = hm.querySelector("[data-row=sent]");
    var recvRow = hm.querySelector("[data-row=recv]");
    var fixRow = hm.querySelector("[data-row=fixed]");
    var status = hm.querySelector(".hamming__status");
    var msgOut = hm.querySelector("[data-msg]");
    var PARITY = { 1: true, 2: true, 4: true };
    var sent = [], recv = [], data = [];

    function encode(d) {
      // d = [d3, d5, d6, d7]
      var w = [0, 0, 0, 0, 0, 0, 0, 0]; // индексы 1..7
      w[3] = d[0]; w[5] = d[1]; w[6] = d[2]; w[7] = d[3];
      w[1] = w[3] ^ w[5] ^ w[7];
      w[2] = w[3] ^ w[6] ^ w[7];
      w[4] = w[5] ^ w[6] ^ w[7];
      return w;
    }
    function syndrome(w) {
      var s = 0;
      for (var i = 1; i <= 7; i++) if (w[i]) s ^= i;
      return s;
    }
    function bin3(n) { return ("00" + n.toString(2)).slice(-3); }
    function dataOf(w) { return "" + w[3] + w[5] + w[6] + w[7]; }

    function newMessage() {
      data = [0, 0, 0, 0].map(function () { return Math.random() < 0.5 ? 0 : 1; });
      if (data.join("") === "0000") data[1] = 1;
      sent = encode(data);
      recv = sent.slice();
      render();
    }

    function staticCell(v, pos, cls) {
      var c = el("div", "bit bit-static" + (PARITY[pos] ? " bit--parity" : "") + (cls ? " " + cls : ""), String(v));
      c.setAttribute("role", "img");
      c.setAttribute("aria-label", "Позиция " + pos + (PARITY[pos] ? ", проверочный бит" : ", информационный бит") + ": " + v);
      return c;
    }

    function render() {
      sentRow.innerHTML = ""; recvRow.innerHTML = ""; fixRow.innerHTML = "";
      var flipped = [];
      for (var i = 1; i <= 7; i++) if (recv[i] !== sent[i]) flipped.push(i);
      var s = syndrome(recv);
      var fixed = recv.slice();
      if (s) fixed[s] ^= 1;

      for (var p = 1; p <= 7; p++) {
        sentRow.appendChild(staticCell(sent[p], p));
        var b = el("button", "bit" + (PARITY[p] ? " bit--parity" : "") + (recv[p] !== sent[p] ? " is-flipped" : ""), String(recv[p]));
        b.type = "button";
        b.setAttribute("data-pos", p);
        b.setAttribute("aria-pressed", recv[p] !== sent[p] ? "true" : "false");
        b.setAttribute("aria-label", "Позиция " + p + ": " + recv[p] + (recv[p] !== sent[p] ? ", искажён помехой" : "") + ". Нажмите, чтобы исказить или вернуть");
        b.addEventListener("click", onFlip);
        recvRow.appendChild(b);
        var cls = "";
        if (s && p === s) cls = fixed[p] === sent[p] ? "is-fixed" : "is-wrong";
        else if (fixed[p] !== sent[p]) cls = "is-wrong";
        fixRow.appendChild(staticCell(fixed[p], p, cls));
      }
      msgOut.textContent = data.join("");

      var ones = [];
      for (var k = 1; k <= 7; k++) if (recv[k]) ones.push(k);
      var calc = ones.length ? ones.map(function (x) { return bin3(x); }).join(" ⊕ ") + " = " + bin3(s) : "000";
      var dec = dataOf(fixed);
      var html;
      status.classList.remove("is-ok", "is-bad");
      if (!flipped.length) {
        html = "Помех нет. Синдром: <strong>" + calc + "</strong>. Нулевой синдром — декодер ничего не меняет.";
        status.classList.add("is-ok");
      } else if (flipped.length === 1) {
        html = "Одна помеха в позиции " + flipped[0] + ". Синдром: <strong>" + calc + "</strong> — это двоичная запись числа " + s +
          ". Декодер переворачивает бит " + s + " и получает сообщение <strong>" + dec + "</strong>. Совпадает с отправленным.";
        status.classList.add("is-ok");
      } else if (s === 0) {
        html = "Помех: " + flipped.length + " (позиции " + flipped.join(", ") + "). Синдром <strong>000</strong>: принятое слово само оказалось кодовым, ошибку не видно. Декодер выдаёт <strong>" + dec + "</strong> — это не то, что отправили.";
        status.classList.add("is-bad");
      } else {
        html = "Помех: " + flipped.length + " (позиции " + flipped.join(", ") + "). Синдром <strong>" + calc + "</strong> указывает на позицию " + s +
          ", и декодер исправляет её. Получилось сообщение <strong>" + dec + "</strong>" + (dec === data.join("") ? " — случайно совпало с отправленным." : " — оно неверное.") +
          " Код Хемминга гарантированно исправляет только одну ошибку: его кодовое расстояние d = 3, поэтому t = 1.";
        status.classList.add("is-bad");
      }
      status.innerHTML = html;
    }

    function onFlip(e) {
      var pos = +e.currentTarget.getAttribute("data-pos");
      recv[pos] ^= 1;
      render();
      var again = recvRow.querySelector("[data-pos=\"" + pos + "\"]");
      if (again) again.focus();
    }

    hm.querySelector("[data-action=new]").addEventListener("click", newMessage);
    hm.querySelector("[data-action=clear]").addEventListener("click", function () { recv = sent.slice(); render(); });
    newMessage();
  }

  /* =====================================================
     2. Калькулятор по модулю
     ===================================================== */
  function parseBig(s) {
    s = String(s).trim();
    if (!/^-?\d{1,18}$/.test(s)) return null;
    return BigInt(s);
  }
  function mod(a, n) { var r = a % n; return r < 0n ? r + n : r; }
  function euclidTable(a, n) {
    // строки: r, q, x, где r ≡ x·a (mod n)
    var rows = [{ r: n, q: null, x: 0n }, { r: a, q: null, x: 1n }];
    while (rows[rows.length - 1].r !== 0n) {
      var prev = rows[rows.length - 2], cur = rows[rows.length - 1];
      var q = prev.r / cur.r;
      var r = prev.r - q * cur.r;
      rows.push({ r: r, q: q, x: prev.x - q * cur.x });
      if (rows.length > 200) break;
    }
    return rows;
  }
  function renderEuclid(rows, a, n) {
    var h = "<div class=\"table-wrap\" tabindex=\"0\" role=\"region\" aria-label=\"Таблица алгоритма Евклида\"><table><thead><tr><th scope=\"col\">Строка</th><th scope=\"col\">Остаток r</th><th scope=\"col\">Частное q</th><th scope=\"col\">x, где r ≡ x·" + a + " (mod " + n + ")</th></tr></thead><tbody>";
    rows.forEach(function (row, i) {
      if (i > 1 && row.r === 0n) {
        h += "<tr><td>" + (i - 1) + "</td><td>0</td><td>" + row.q + "</td><td>— (остаток 0, стоп)</td></tr>";
        return;
      }
      h += "<tr><td>" + (i < 2 ? "старт" : i - 1) + "</td><td>" + row.r + "</td><td>" + (row.q === null ? "—" : row.q) + "</td><td>" + row.x + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }
  function inverse(a, n) {
    var aa = mod(a, n);
    var rows = euclidTable(aa, n);
    var last = rows[rows.length - 2]; // последний ненулевой остаток
    return { g: last.r, x: mod(last.x, n), rows: rows, a: aa };
  }

  var modForm = document.getElementById("mod-form");
  if (modForm) {
    var opSel = document.getElementById("mod-op");
    var bWrap = document.getElementById("mod-b-wrap");
    var out = document.getElementById("mod-out");
    var syncB = function () { bWrap.hidden = opSel.value === "inv"; };
    opSel.addEventListener("change", syncB);
    syncB();
    modForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var a = parseBig(document.getElementById("mod-a").value);
      var b = parseBig(document.getElementById("mod-b").value);
      var n = parseBig(document.getElementById("mod-n").value);
      var op = opSel.value;
      if (a === null || n === null || (op !== "inv" && b === null)) {
        out.innerHTML = "<p class=\"error\">Введите целые числа (не больше 18 цифр).</p>"; return;
      }
      if (n < 2n) { out.innerHTML = "<p class=\"error\">Модуль n должен быть не меньше 2.</p>"; return; }
      var am = mod(a, n), h = "";
      h += "<p>" + a + " mod " + n + " = " + am + (op !== "inv" ? ", &nbsp;" + b + " mod " + n + " = " + mod(b, n) : "") + "</p>";
      if (op === "add") h += "<p><strong>" + am + " + " + mod(b, n) + " ≡ " + mod(am + mod(b, n), n) + " (mod " + n + ")</strong></p>";
      else if (op === "sub") h += "<p><strong>" + am + " − " + mod(b, n) + " ≡ " + mod(am - mod(b, n), n) + " (mod " + n + ")</strong></p><p class=\"muted\">Вычитание — это прибавление противоположного: −" + mod(b, n) + " ≡ " + mod(-b, n) + ".</p>";
      else if (op === "mul") h += "<p><strong>" + am + " · " + mod(b, n) + " = " + (am * mod(b, n)) + " ≡ " + mod(am * mod(b, n), n) + " (mod " + n + ")</strong></p>";
      else if (op === "pow") {
        if (b < 0n) { out.innerHTML = "<p class=\"error\">Показатель степени должен быть неотрицательным.</p>"; return; }
        var res = 1n, base = am, ex = b;
        while (ex > 0n) { if (ex & 1n) res = res * base % n; base = base * base % n; ex >>= 1n; }
        h += "<p><strong>" + am + "<sup>" + b + "</sup> ≡ " + res + " (mod " + n + ")</strong></p><p class=\"muted\">Посчитано быстрым возведением в степень: на каждом шаге берётся остаток, поэтому числа не растут.</p>";
      } else if (op === "inv" || op === "div") {
        var target = op === "inv" ? a : b;
        var inv = inverse(target, n);
        if (inv.a === 0n) { out.innerHTML = h + "<p class=\"error\">На ноль делить нельзя: " + target + " ≡ 0 (mod " + n + ").</p>"; return; }
        h += renderEuclid(inv.rows, inv.a, n);
        if (inv.g !== 1n) {
          h += "<p class=\"error\">НОД(" + inv.a + ", " + n + ") = " + inv.g + " ≠ 1, поэтому обратного к " + inv.a + " по модулю " + n + " нет.</p>";
        } else {
          h += "<p>НОД(" + inv.a + ", " + n + ") = 1, значит обратный есть: <strong>" + inv.a + "<sup>−1</sup> ≡ " + inv.x + " (mod " + n + ")</strong>. Проверка: " + inv.a + " · " + inv.x + " = " + (inv.a * inv.x) + " ≡ " + mod(inv.a * inv.x, n) + ".</p>";
          if (op === "div") h += "<p><strong>" + am + " / " + inv.a + " = " + am + " · " + inv.x + " ≡ " + mod(am * inv.x, n) + " (mod " + n + ")</strong></p>";
        }
      }
      out.innerHTML = h;
    });
  }

  /* =====================================================
     3. Расстояние Хемминга и вес
     ===================================================== */
  function parseVec(s, q) {
    s = String(s).replace(/[\s,()]/g, "");
    if (!s.length) return { err: "пустой вектор" };
    if (!/^\d+$/.test(s)) return { err: "вектор должен состоять из цифр" };
    var v = s.split("").map(Number);
    for (var i = 0; i < v.length; i++) if (v[i] >= q) return { err: "цифра " + v[i] + " не принадлежит полю F" + sub(q) + " (допустимо 0…" + (q - 1) + ")" };
    return { v: v };
  }
  function sub(n) { return String(n).replace(/\d/g, function (d) { return "₀₁₂₃₄₅₆₇₈₉"[d]; }); }
  function weight(v) { return v.filter(function (x) { return x !== 0; }).length; }

  var distForm = document.getElementById("dist-form");
  if (distForm) {
    var dOut = document.getElementById("dist-out");
    distForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = +document.getElementById("dist-q").value;
      var x = parseVec(document.getElementById("dist-x").value, q);
      var y = parseVec(document.getElementById("dist-y").value, q);
      if (x.err || y.err) { dOut.innerHTML = "<p class=\"error\">Проверьте ввод: " + esc(x.err || y.err) + ".</p>"; return; }
      if (x.v.length !== y.v.length) { dOut.innerHTML = "<p class=\"error\">Векторы разной длины (" + x.v.length + " и " + y.v.length + "). Расстояние Хемминга определено только для векторов одной длины.</p>"; return; }
      var diff = [], e2 = [];
      for (var i = 0; i < x.v.length; i++) { if (x.v[i] !== y.v[i]) diff.push(i + 1); e2.push(((y.v[i] - x.v[i]) % q + q) % q); }
      var rowX = "<div class=\"diff-row\" aria-hidden=\"true\">" + x.v.map(function (c, i) { return "<span class=\"" + (x.v[i] !== y.v[i] ? "is-diff" : "") + "\">" + c + "</span>"; }).join("") + "</div>";
      var rowY = "<div class=\"diff-row\" aria-hidden=\"true\">" + y.v.map(function (c, i) { return "<span class=\"" + (x.v[i] !== y.v[i] ? "is-diff" : "") + "\">" + c + "</span>"; }).join("") + "</div>";
      dOut.innerHTML = "<p>x и y (позиции с разными символами подчёркнуты волной):</p>" + rowX + rowY +
        "<p><strong>d(x, y) = " + diff.length + "</strong>" + (diff.length ? " — различаются позиции " + diff.join(", ") : " — векторы совпадают") + ".</p>" +
        "<p>Вес: ‖x‖ = " + weight(x.v) + ", ‖y‖ = " + weight(y.v) + ". Вектор ошибки e = y − x над F" + sub(q) + ": <span class=\"bits\">" + e2.join("") + "</span>, его вес ‖e‖ = " + weight(e2) + " = d(x, y).</p>";
    });
  }

  /* =====================================================
     4. Параметры кода: d, t, s, s'
     ===================================================== */
  var codeForm = document.getElementById("code-form");
  if (codeForm) {
    var cOut = document.getElementById("code-out");
    codeForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = +document.getElementById("code-q").value;
      var raw = document.getElementById("code-words").value.split(/[\s,;]+/).filter(Boolean);
      if (raw.length < 2) { cOut.innerHTML = "<p class=\"error\">Нужно хотя бы два кодовых слова.</p>"; return; }
      if (raw.length > 128) { cOut.innerHTML = "<p class=\"error\">Слишком много слов: тренажёр принимает до 128.</p>"; return; }
      var words = [];
      for (var i = 0; i < raw.length; i++) {
        var p = parseVec(raw[i], q);
        if (p.err) { cOut.innerHTML = "<p class=\"error\">Слово «" + esc(raw[i]) + "»: " + esc(p.err) + ".</p>"; return; }
        words.push(p.v);
      }
      var n = words[0].length;
      for (var j = 1; j < words.length; j++) if (words[j].length !== n) { cOut.innerHTML = "<p class=\"error\">Все слова кода должны быть одной длины: «" + esc(raw[0]) + "» и «" + esc(raw[j]) + "» разной длины.</p>"; return; }
      var seen = {};
      for (var k = 0; k < words.length; k++) { var key = words[k].join(""); if (seen[key]) { cOut.innerHTML = "<p class=\"error\">Слово " + key + " повторяется. В коде все слова различны.</p>"; return; } seen[key] = 1; }
      var best = Infinity, pairs = [];
      for (var a = 0; a < words.length; a++) for (var b = a + 1; b < words.length; b++) {
        var dd = 0;
        for (var c = 0; c < n; c++) if (words[a][c] !== words[b][c]) dd++;
        if (dd < best) { best = dd; pairs = [[a, b]]; } else if (dd === best && pairs.length < 6) pairs.push([a, b]);
      }
      var t = Math.floor((best - 1) / 2), s = best - 1, s2 = Math.ceil((best - 1) / 2);
      cOut.innerHTML = "<p>Длина n = " + n + ", слов M = " + words.length + ".</p>" +
        "<p><strong>d(C) = " + best + "</strong>. Минимум достигается, например, на парах: " +
        pairs.map(function (pr) { return "<span class=\"bits\">" + words[pr[0]].join("") + "</span> и <span class=\"bits\">" + words[pr[1]].join("") + "</span>"; }).join("; ") + ".</p>" +
        "<p>t = ⌊(d − 1)/2⌋ = <strong>" + t + "</strong> — исправляет столько ошибок.<br>s = d − 1 = <strong>" + s + "</strong> — обнаруживает столько ошибок в режиме обнаружения.<br>s′ = ⌈(d − 1)/2⌉ = <strong>" + s2 + "</strong> — обнаруживает столько ошибок в режиме исправления.</p>";
    });
  }
})();
