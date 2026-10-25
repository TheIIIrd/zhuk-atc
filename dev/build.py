#!/usr/bin/env python3
"""Сборка сайта «Код без ошибок». Нужен только Python 3.8+, без внешних библиотек.

Команды (запускать из корня проекта):
  python3 dev/build.py                 собрать: обновить страницы, data.js, поиск; затем проверить
  python3 dev/build.py --check         только проверить: всё ли собрано и нет ли ошибок (для CI)
  python3 dev/build.py dist [папка]    собрать и скопировать публикуемые файлы в папку (по умолчанию _site)
  python3 dev/build.py new-module m02 "Линейная алгебра"
                                       создать заготовки страниц нового модуля из dev/templates

Что делает сборка:
  1. Вставляет общий <head>, шапку и подвал во все страницы между метками
     <!-- @head --> … <!-- /@head -->, <!-- @header --> … и <!-- @footer --> ….
     KaTeX подключается только на страницах, где есть формулы \\( … \\) или \\[ … \\].
  2. Создаёт assets/js/data.js из dev/modules.json и добавляет счётчики:
     сколько в модуле задач, блоков и вопросов теста.
  3. Создаёт оглавления разделов theory/, examples/, practice/, review/ (index.html).
  4. Расставляет пометки «разобран / частично / впереди» у вопросов программы на oral/index.html.
  5. Строит поисковый индекс assets/js/search-index.js.
  6. Проверяет ссылки, якоря, уникальность id и идентификаторов прогресса.
"""
import html
import json
import os
import re
import shutil
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {"assets", "dev", ".git", ".github", "_site", "node_modules"}
SELF_CONTAINED = {"404.html"}          # страницы со своим оформлением, без общей шапки
PUBLISH_EXCLUDE = {"dev", ".git", ".github", "_site", "README.md", ".gitignore", "node_modules"}
MODULE_PAGES = ("theory", "examples", "practice", "review")

NAV = [
    ("home", "index.html", "Главная"),
    ("plan", "plan.html", "План"),
    ("theory", "theory/index.html", "Теория"),
    ("examples", "examples/index.html", "Примеры"),
    ("practice", "practice/index.html", "Практика"),
    ("oral", "oral/index.html", "Устный экзамен"),
    ("glossary", "glossary.html", "Словарь"),
    ("review", "review/index.html", "Повторение"),
    ("tools", "tools.html", "Тренажёры"),
]

SECTIONS = {
    "theory": ("Теория", "Объяснения с нуля: сначала интуиция и простой пример, потом строгая формулировка."),
    "examples": ("Примеры решений", "Подробные разборы с промежуточными шагами и объяснением, зачем нужен каждый шаг."),
    "practice": ("Практика", "Задачи трёх уровней. Подсказки, ответы и решения спрятаны — сначала попробуйте сами."),
    "review": ("Повторение", "Конспект на одну страницу, ключевые формулы, карточки и мини-тест по каждому модулю."),
}

ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
ICON_THEME = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/></svg>'
ICON_MENU = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'

MATH_RE = re.compile(r"\\\(|\\\[")


# ---------------------------------------------------------------- шаблоны общих частей

def head_block(root, title, desc, math, base_url, rel):
    katex_css = f'\n  <link rel="stylesheet" href="{root}assets/vendor/katex/katex.min.css">' if math else ""
    og_url = ""
    if base_url:
        page_url = base_url.rstrip("/") + "/" + ("" if rel == "index.html" else rel)
        og_url = f'\n  <link rel="canonical" href="{html.escape(page_url)}">\n  <meta property="og:url" content="{html.escape(page_url)}">'
    return f"""<!-- @head -->
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <meta name="description" content="{html.escape(desc)}">
  <meta name="theme-color" content="#5b3df5">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="Код без ошибок">
  <meta property="og:title" content="{html.escape(title)}">
  <meta property="og:description" content="{html.escape(desc)}">{og_url}
  <link rel="icon" href="{root}assets/img/favicon.svg" type="image/svg+xml">
  <script src="{root}assets/js/theme-init.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;700&amp;family=Unbounded:wght@500;600;700&amp;display=swap">{katex_css}
  <link rel="stylesheet" href="{root}assets/css/style.css">
  <!-- /@head -->"""


def header_block(root, page):
    items = []
    for key, href, label in NAV:
        cur = ' aria-current="page"' if key == page else ""
        items.append(f'<li><a href="{root}{href}"{cur}>{label}</a></li>')
    nav = "\n          ".join(items)
    return f"""<!-- @header -->
  <a class="skip-link" href="#main">Перейти к содержанию</a>
  <header class="site-header">
    <div class="site-header__inner">
      <a class="logo" href="{root}index.html" aria-label="Код без ошибок — на главную">
        <span class="logo__mark" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>
        <span class="logo__text">Код без ошибок</span>
      </a>
      <nav class="main-nav" id="main-nav" aria-label="Разделы сайта">
        <ul>
          {nav}
        </ul>
      </nav>
      <div class="header-actions">
        <button class="icon-btn" id="search-btn" type="button" aria-haspopup="dialog" aria-controls="search-dialog">{ICON_SEARCH}<span class="btn-label">Поиск</span></button>
        <button class="icon-btn" id="theme-btn" type="button">{ICON_THEME}<span class="btn-label">Тема: авто</span></button>
        <button class="icon-btn menu-btn" id="menu-btn" type="button" aria-expanded="false" aria-controls="main-nav">{ICON_MENU}<span class="btn-label">Меню</span></button>
      </div>
    </div>
  </header>
  <dialog class="search-dialog" id="search-dialog" aria-label="Поиск по сайту">
    <div class="search-dialog__head">
      <label class="visually-hidden" for="search-input">Что найти</label>
      <input class="search-input" id="search-input" type="search" placeholder="Например: обратный элемент" autocomplete="off">
      <button class="icon-btn" id="search-close" type="button">Закрыть</button>
    </div>
    <ul class="search-results" id="search-results" aria-live="polite"></ul>
  </dialog>
  <!-- /@header -->"""


def footer_block(root, scripts, math, version, updated):
    katex = ""
    if math:
        katex = (f'\n  <script defer src="{root}assets/vendor/katex/katex.min.js"></script>'
                 f'\n  <script defer src="{root}assets/vendor/katex/auto-render.min.js"></script>')
    extra = "".join(f'\n  <script defer src="{root}assets/js/{s}.js"></script>' for s in scripts)
    return f"""<!-- @footer -->
  <footer class="site-footer">
    <div class="site-footer__inner">
      <p>Неофициальный сайт студентов для подготовки к экзамену по курсу «Алгебраическая теория кодирования». Это не материалы преподавателя: опирайтесь на лекции и программу экзамена.</p>
      <p><a href="{root}sources.html">Источники и условные обозначения</a><br><a href="{root}plan.html#progress-io">Как перенести прогресс на другое устройство</a></p>
      <p>Версия {html.escape(version)} от {html.escape(updated)}</p>
    </div>
  </footer>
  <script src="{root}assets/js/data.js"></script>{katex}
  <script defer src="{root}assets/js/main.js"></script>{extra}
  <!-- /@footer -->"""


# ---------------------------------------------------------------- вспомогательное

def page_files():
    out = []
    for dp, dns, fns in os.walk(ROOT):
        rel = os.path.relpath(dp, ROOT)
        top = rel.split(os.sep)[0]
        if top in SKIP_DIRS:
            dns[:] = []
            continue
        for fn in fns:
            if fn.endswith(".html") and not (rel == "." and fn in SELF_CONTAINED):
                out.append(os.path.relpath(os.path.join(dp, fn), ROOT).replace(os.sep, "/"))
    return sorted(out)


def root_prefix(rel):
    return "../" * rel.count("/")


def replace_block(text, name, new, rel):
    pat = re.compile(r"<!-- @" + name + r" -->.*?<!-- /@" + name + r" -->", re.S)
    if not pat.search(text):
        raise SystemExit(f"ОШИБКА: в {rel} нет метки <!-- @{name} -->")
    return pat.sub(lambda m: new.strip(), text, count=1)


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def load_config():
    with open(os.path.join(ROOT, "dev", "modules.json"), encoding="utf-8") as f:
        return json.load(f)


def body_math(text):
    m = re.search(r"<main.*?</main>", text, re.S)
    return bool(m and MATH_RE.search(m.group(0)))


def module_stats(data):
    """Счётчики для прогресса: задачи, блоки теории, вопросы теста."""
    for m in data["modules"]:
        mid = m["id"]
        def count(rel, pattern):
            path = os.path.join(ROOT, rel)
            if not os.path.exists(path):
                return 0
            return len(re.findall(pattern, read(rel)))
        m["taskCount"] = count(f"practice/{mid}.html", r'data-task="' + mid + r'-t\d+"')
        m["blockCount"] = count(f"theory/{mid}.html", r'data-block="' + mid + r'-b\d+"')
        m["quizTotal"] = count(f"review/{mid}.html", r'<fieldset class="quiz-q"')
    return data


def data_js(data):
    public = {k: v for k, v in data.items() if k != "site"}
    return ("/* Данные сайта: план модулей, счётчики и покрытие вопросов программы.\n"
            "   Файл создаётся автоматически из dev/modules.json скриптом dev/build.py — не правьте его вручную. */\n"
            "window.ATK_DATA = " + json.dumps(public, ensure_ascii=False, indent=2) + ";\n")


def section_index(key, data):
    title, lead = SECTIONS[key]
    rows = []
    for m in data["modules"]:
        q = ("вопросы программы: " + ", ".join(str(x) for x in m["questions"])) if m["questions"] else "база для следующих тем"
        if m["ready"]:
            item = f'<a href="{m["id"]}.html"><strong>Модуль {m["num"]}. {html.escape(m["title"])}</strong><span>{m["dates"]}, {q}</span></a>'
        else:
            item = f'<div class="is-later"><strong>Модуль {m["num"]}. {html.escape(m["title"])}</strong><span>{m["dates"]}, {q}. Появится позже</span></div>'
        rows.append(f"        <li>{item}</li>")
    body = "\n".join(rows)
    return f"""<!doctype html>
<html lang="ru">
<head>
  <!-- @head --><!-- /@head -->
</head>
<body data-page="{key}" data-title="{title} — Код без ошибок" data-desc="{html.escape(lead)}">
  <!-- @header --><!-- /@header -->
  <main id="main" class="page">
    <div class="page-head">
      <h1>{title}</h1>
      <p class="lead">{lead}</p>
    </div>
    <h2 id="modules">Модули</h2>
    <ul class="quick-links">
{body}
    </ul>
  </main>
  <!-- @footer --><!-- /@footer -->
</body>
</html>
"""


def oral_states(text, data):
    """Пометки у вопросов программы берутся из dev/modules.json (questionCoverage и модули)."""
    cov = {str(k): v for k, v in data.get("questionCoverage", {}).items()}
    where = {}
    for m in data["modules"]:
        for q in m["questions"]:
            where.setdefault(str(q), []).append(m["num"])

    def label(q):
        state = cov.get(q, "later")
        if state == "ready":
            return "ready", "разобран"
        if state == "partial":
            return "partial", "частично"
        nums = sorted(set(where.get(q, [])))
        if not nums:
            return "later", "впереди"
        if len(nums) == 1:
            return "later", f"впереди: модуль {nums[0]}"
        return "later", f"впереди: модули {nums[0]}–{nums[-1]}"

    def fix(m):
        q = m.group(1)
        state, text_ = label(q)
        return m.group(0)[:m.start(2) - m.start(0)] + f'<span class="q-state" data-state="{state}">{text_}</span>'

    return re.sub(r'<details class="q-item" id="q(\d+)"[^>]*><summary>.*?(<span class="q-state" data-state="[a-z]+">[^<]*</span>)',
                  fix, text, flags=re.S)


class Outline(HTMLParser):
    """Собирает title, заголовки с id, блоки с data-search и термины словаря для поиска."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.in_title = False
        self.cur = None
        self.collect = False
        self.entries = []
        self.skip = 0
        self.in_main = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "main":
            self.in_main = True
        if tag in ("script", "style", "dialog"):
            self.skip += 1
        if tag == "title":
            self.in_title = True
        if not self.in_main:
            return
        if "data-search" in a and "id" in a:
            self.cur = {"id": a["id"], "text": a["data-search"], "kw": ""}
            self.entries.append(self.cur)
            self.collect = False
        elif tag in ("h1", "h2", "h3", "dt") and "id" in a and "data-nosearch" not in a:
            self.cur = {"id": a["id"], "text": "", "kw": ""}
            self.entries.append(self.cur)
            self.collect = True
        elif tag in ("h1", "h2", "h3"):
            self.collect = False

    def handle_endtag(self, tag):
        if tag in ("script", "style", "dialog"):
            self.skip = max(0, self.skip - 1)
        if tag == "title":
            self.in_title = False
        if tag in ("h1", "h2", "h3", "dt"):
            self.collect = False
        if tag == "main":
            self.in_main = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
            return
        if self.skip or not self.in_main or self.cur is None:
            return
        if self.collect:
            self.cur["text"] += data
        elif len(self.cur["kw"]) < 400:
            self.cur["kw"] += " " + data


def clean(s):
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------- сборка в памяти

def render_all():
    """Возвращает словарь {путь: содержимое} всех создаваемых и обновляемых файлов."""
    cfg = load_config()
    data = module_stats(json.loads(json.dumps(cfg)))
    base_url = (cfg.get("site") or {}).get("baseUrl", "").strip()
    out = {"assets/js/data.js": data_js(data)}
    for key in SECTIONS:
        out[f"{key}/index.html"] = section_index(key, data)

    not_ready = {f"{d}/{m['id']}.html" for m in data["modules"] if not m["ready"] for d in MODULE_PAGES}
    pages = sorted(set(page_files()) | {f"{k}/index.html" for k in SECTIONS})
    for rel in pages:
        text = out.get(rel) or read(rel)
        m = re.search(r"<body([^>]*)>", text)
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(1)))
        root = root_prefix(rel)
        math = body_math(text)
        title = html.unescape(attrs.get("data-title", "Код без ошибок"))
        desc = html.unescape(attrs.get("data-desc", "Подготовка к экзамену по алгебраической теории кодирования"))
        scripts = [s for s in attrs.get("data-scripts", "").split() if s]
        text = replace_block(text, "head", head_block(root, title, desc, math, base_url, rel), rel)
        text = replace_block(text, "header", header_block(root, attrs.get("data-page", "")), rel)
        text = replace_block(text, "footer", footer_block(root, scripts, math, data["version"], data["updated"]), rel)
        text = re.sub(r'<body data-root="[^"]*"', "<body", text, count=1)
        text = text.replace("<body", f'<body data-root="{root}"', 1)
        if rel == "oral/index.html":
            text = oral_states(text, data)
        out[rel] = text

    index = []
    for rel in pages:
        if rel in not_ready:
            continue
        p = Outline()
        p.feed(out[rel])
        page_title = clean(p.title).replace(" — Код без ошибок", "")
        for e in p.entries:
            t = clean(e["text"])
            if t:
                index.append({"t": t, "u": f"{rel}#{e['id']}", "p": page_title, "k": clean(e["kw"])[:300]})
    out["assets/js/search-index.js"] = ("/* Поисковый индекс. Создаётся автоматически скриптом dev/build.py. */\n"
                                        "window.ATK_SEARCH = " + json.dumps(index, ensure_ascii=False) + ";\n")

    if base_url:
        urls = [base_url.rstrip("/") + "/" + ("" if r == "index.html" else r) for r in pages if r not in not_ready]
        out["sitemap.xml"] = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                              + "".join(f"  <url><loc>{html.escape(u)}</loc></url>\n" for u in urls) + "</urlset>\n")
        out["robots.txt"] = f"User-agent: *\nAllow: /\nSitemap: {base_url.rstrip('/')}/sitemap.xml\n"
    return out, pages, data


# ---------------------------------------------------------------- проверки

class Scan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids, self.dup, self.attrs = [], set(), set(), []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            (self.dup if a["id"] in self.ids else self.ids).add(a["id"])
        for k in ("href", "src"):
            if a.get(k):
                self.links.append(a[k])
        self.attrs.append((tag, a))


def check(files, pages, data):
    errors = []
    scans = {}
    for rel in pages + sorted(SELF_CONTAINED):
        text = files.get(rel) or read(rel)
        s = Scan()
        s.feed(text)
        scans[rel] = s
        for d in sorted(s.dup):
            errors.append(f"{rel}: id «{d}» встречается несколько раз")
        if rel not in SELF_CONTAINED and re.search(r'<[a-z][^>]*\sstyle="', text):
            errors.append(f"{rel}: встроенный атрибут style — перенесите оформление в style.css")

    exists = lambda target: target in files or os.path.exists(os.path.join(ROOT, target))
    for rel, s in scans.items():
        base = os.path.dirname(rel)
        for l in s.links:
            if re.match(r"^(https?:|mailto:|data:|javascript:)", l):
                continue
            if l.startswith("/"):
                if rel not in SELF_CONTAINED:
                    errors.append(f"{rel}: ссылка от корня домена «{l}» сломается на GitHub Pages, нужна относительная")
                continue
            if l.startswith("#"):
                if l[1:] and l[1:] not in s.ids:
                    errors.append(f"{rel}: нет якоря {l}")
                continue
            path, _, frag = l.partition("#")
            target = os.path.normpath(os.path.join(base, path)).replace(os.sep, "/")
            if not exists(target):
                errors.append(f"{rel}: нет файла {l}")
                continue
            if frag and target.endswith(".html") and target in scans and frag not in scans[target].ids:
                errors.append(f"{rel}: в {target} нет якоря #{frag}")

    idx = files["assets/js/search-index.js"]
    for u in re.findall(r'"u": "([^"]+)"', idx):
        path, _, frag = u.partition("#")
        if frag not in scans.get(path, Scan()).ids:
            errors.append(f"поиск: нет якоря {u}")

    # Идентификаторы прогресса: уникальны, с префиксом своего модуля, ответы привязаны к задачам
    seen = {}
    id_re = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
    for rel, s in scans.items():
        mod = re.match(r"^(?:theory|examples|practice|review)/(m\d{2})\.html$", rel)
        tasks_here = set()
        for tag, a in s.attrs:
            for attr in ("data-task", "data-block", "data-oral"):
                if attr in a:
                    v = a[attr]
                    key = (attr, v)
                    if not id_re.match(v):
                        errors.append(f"{rel}: недопустимый {attr}=«{v}»")
                    if key in seen:
                        errors.append(f"{rel}: {attr}=«{v}» уже используется в {seen[key]}")
                    seen[key] = rel
                    if attr in ("data-task", "data-block") and (not mod or not v.startswith(mod.group(1) + "-")):
                        errors.append(f"{rel}: {attr}=«{v}» должен начинаться с номера модуля этой страницы")
                    if attr == "data-task":
                        tasks_here.add(v)
            if tag == "form" and "quiz" in a.get("class", "").split():
                if not mod or a.get("id") != f"quiz-{mod.group(1)}":
                    errors.append(f"{rel}: у теста должен быть id «quiz-<модуль>»")
        for tag, a in s.attrs:
            if "data-note" in a and a["data-note"] not in tasks_here:
                errors.append(f"{rel}: ответ data-note=«{a['data-note']}» не относится ни к одной задаче на странице")

    for m in data["modules"]:
        if m["ready"]:
            for d in MODULE_PAGES:
                if not exists(f"{d}/{m['id']}.html"):
                    errors.append(f"модуль {m['id']} отмечен готовым, но нет файла {d}/{m['id']}.html")
    return errors


# ---------------------------------------------------------------- команды

def cmd_build(write=True):
    files, pages, data = render_all()
    stale = []
    for rel, content in files.items():
        path = os.path.join(ROOT, rel)
        old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if old != content:
            stale.append(rel)
            if write:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(content)
    errors = check(files, pages, data)
    if not write and stale:
        errors.insert(0, "сборка устарела, запустите python3 dev/build.py и закоммитьте изменения: " + ", ".join(stale))
    if write:
        print(f"Страниц: {len(pages)}, обновлено файлов: {len(stale)}")
    for e in errors:
        print("ОШИБКА:", e)
    if not errors and not write:
        print("Проверка пройдена: сборка актуальна, ошибок нет.")
    return 1 if errors else 0


def cmd_dist(target):
    code = cmd_build(write=True)
    if code:
        return code
    out = os.path.join(ROOT, target)
    if os.path.exists(out):
        shutil.rmtree(out)
    for name in os.listdir(ROOT):
        if name in PUBLISH_EXCLUDE:
            continue
        src = os.path.join(ROOT, name)
        dst = os.path.join(out, name)
        if os.path.isdir(src):
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"))
        else:
            os.makedirs(out, exist_ok=True)
            shutil.copy2(src, dst)
    print(f"Публикуемые файлы скопированы в {target}/")
    return 0


def cmd_new_module(mid, title):
    if not re.match(r"^m\d{2}$", mid):
        print("Номер модуля пишется как m02, m03, …")
        return 1
    num = int(mid[1:])
    made = []
    for d in MODULE_PAGES:
        dst = os.path.join(ROOT, d, f"{mid}.html")
        if os.path.exists(dst):
            print(f"Уже есть {d}/{mid}.html — не трогаю")
            continue
        tpl = read(f"dev/templates/{d}.html")
        tpl = tpl.replace("{{ID}}", mid).replace("{{NUM}}", str(num)).replace("{{TITLE}}", title)
        with open(dst, "w", encoding="utf-8") as f:
            f.write(tpl)
        made.append(f"{d}/{mid}.html")
    print("Созданы заготовки:", ", ".join(made) if made else "нет")
    print(f"Когда модуль будет готов, поставьте \"ready\": true у {mid} в dev/modules.json и запустите сборку.")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--check"]:
        sys.exit(cmd_build(write=False))
    if args[:1] == ["dist"]:
        sys.exit(cmd_dist(args[1] if len(args) > 1 else "_site"))
    if args[:1] == ["new-module"]:
        if len(args) < 3:
            print('Использование: python3 dev/build.py new-module m02 "Название модуля"')
            sys.exit(1)
        sys.exit(cmd_new_module(args[1], args[2]))
    sys.exit(cmd_build(write=True))
