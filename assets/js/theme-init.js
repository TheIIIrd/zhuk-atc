/* Применяет тему до отрисовки страницы, чтобы не было мигания.
   Тем две: светлая (по умолчанию) и тёмная. Ключи хранения — как в main.js. */
(function () {
  "use strict";
  var mode = null;
  try {
    mode = window.localStorage.getItem("atk-kbo:theme") || window.localStorage.getItem("atk-theme");
  } catch (e) { mode = null; }
  document.documentElement.setAttribute("data-theme", mode === "dark" ? "dark" : "light");
})();
