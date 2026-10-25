/* Применяет выбранную тему до отрисовки страницы, чтобы не было мигания.
   Подключается в <head> без defer. Ключи хранения — как в main.js. */
(function () {
  "use strict";
  var mode = null;
  try {
    mode = window.localStorage.getItem("atk-kbo:theme") || window.localStorage.getItem("atk-theme");
  } catch (e) { mode = null; }
  if (mode === "light" || mode === "dark") document.documentElement.setAttribute("data-theme", mode);
})();
