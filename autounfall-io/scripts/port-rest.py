# -*- coding: utf-8 -*-
# WP-7 Rest-Port: PILLAR-* + HUB-* (inkl. HUB-sf-*) + nested ARTICLE-* (10)
#   -> content/rest-pages.generated.ts  (Article-shaped: alle teilen Prose/FAQ/QA).
# Quelle der Wahrheit = die Prototyp-HTML. Einmal-Tool (committed = Provenienz).
#
# Modell: jede Seite = RestPage { route, kind, title, h1, h1Accent?, description,
# eyebrow, author, quickAnswer[], body(md, links→Routen), faq?, sources?,
# breadcrumb[] }. Gerendert via components/rest/RestArticle.tsx (reused WP-2 parts).
#
# NICHT portiert: HUB-unfallbericht (/unfallbericht = WP-4-Tool), VERGLEICH-* (claimondo),
# ARTICLE-sf-klasse-rechner (= WP-4 /schadenfreiheitsklasse/rechner). Home + 21. Decoder
# separat.
import json, re, os
from pathlib import Path
from bs4 import BeautifulSoup
from markdownify import markdownify as mdify

SRC = Path(r"C:\Users\Aaron Sprafke\stampit-app\stampit-app\claimondo-v2\marketing-strategy\Seiten nicolas\FINAL\autounfall-SOURCE-lean")
OUT = Path(__file__).resolve().parent.parent / "content" / "rest-pages.generated.ts"

AUTHOR_MAP = {"#author-nicolas-kitta": "nicolas-kitta", "#author-aaron-sprafke": "aaron-sprafke"}
STOP_HEADINGS = {
    "häufig gestellte fragen", "quellen", "faq", "fragen & antworten",
    "haeufig gestellte fragen", "was leser oft vorab fragen", "was leser oft fragen",
    "redaktion, rechtspruefung und quellen", "redaktion, rechtsprüfung und quellen",
}

def clean(t):
    return re.sub(r"\s+", " ", (t or "").replace("\xa0", " ")).strip()

# ── 1) Vollständige filename → Route Map aus ALLEN canonicals ──
fn2route = {}
for f in SRC.glob("*.html"):
    try:
        s = BeautifulSoup(f.read_text(encoding="utf-8"), "html.parser")
        can = s.find("link", rel="canonical")
        if can and can.get("href"):
            path = "/" + can["href"].split("//")[-1].split("/", 1)[1] if "//" in can["href"] else can["href"]
            path = "/" + can["href"].rstrip("/").split("autounfall.io/", 1)[-1] if "autounfall.io/" in can["href"] else None
            if path is not None:
                fn2route[f.name] = "/" + can["href"].split("autounfall.io/", 1)[1].rstrip("/") if can["href"].split("autounfall.io/", 1)[1].rstrip("/") else "/"
    except Exception:
        pass

# Spezial-Routen (Tools/Lead/Home/Decoder-Hub)
SPECIAL = {
    "SACHVERSTAENDIGE-FINDEN.html": "/gutachter-finden",
    "PROTOTYP-AUTOUNFALL-HUB.html": "/",
    "KUERZUNGS-CHECKER.html": "/kuerzungs-checker",
    "UNFALL-ASSISTANCE.html": "/unfall-assistance",
    "HUB-unfallbericht.html": "/unfallbericht",
    "versicherer-decoder.html": "/versicherer-decoder",
    "IHRE-RECHTE.html": "/gutachter-finden",
}
fn2route.update(SPECIAL)

def rewrite_href(href):
    if not href:
        return None
    if href.startswith(("http", "/", "#", "mailto", "tel")):
        return href if href.startswith(("http", "/", "#")) else None
    base = href.split("#")[0].split("?")[0]
    frag = href[len(base):]
    if base in fn2route:
        return fn2route[base] + frag
    return None  # unbekannt → Link entfernen (Text bleibt)

def extract_jsonld(soup):
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string)
            return data.get("@graph", [data]) if isinstance(data, dict) else data
        except Exception:
            continue
    return []

def extract_page(f, kind):
    soup = BeautifulSoup(f.read_text(encoding="utf-8"), "html.parser")
    graph = extract_jsonld(soup)
    art = next((n for n in graph if n.get("@type") == "Article"), None)
    can = soup.find("link", rel="canonical")
    route = "/" + can["href"].split("autounfall.io/", 1)[1].rstrip("/") if can else None
    if route == "/":
        return None  # home separat

    title = clean(soup.find("title").get_text()) if soup.find("title") else (art or {}).get("headline", "")
    desc_el = soup.find("meta", attrs={"name": "description"})
    description = clean(desc_el["content"]) if desc_el and desc_el.get("content") else (art or {}).get("description", "")

    main = soup.find("main") or soup.find("article") or soup
    h1_el = main.find("h1") or soup.find("h1")
    h1 = clean(h1_el.get_text(" ")) if h1_el else title
    accent = clean(h1_el.find("span").get_text(" ")) if (h1_el and h1_el.find("span")) else None

    # Eyebrow (font-mono kicker vor/um h1)
    eyebrow = ""
    kick = main.select_one("p.font-mono, span.font-mono")
    if kick:
        eyebrow = clean(kick.get_text(" "))

    author_id = "#" + (art or {}).get("author", {}).get("@id", "").split("#")[-1] if art else ""
    author = AUTHOR_MAP.get(author_id, "nicolas-kitta")
    pub = (art or {}).get("datePublished", "2026-05-18")[:10]
    mod = (art or {}).get("dateModified", pub)[:10]

    # Quick-Answer: erste Box mit "Schnell"/border-l-4/quick-answer
    quick = []
    qa = (main.select_one(".quick-answer")
          or main.find(lambda t: t.name in ("div", "aside") and "border-l-4" in " ".join(t.get("class", [])) and "Schnell" in t.get_text())
          or main.find(lambda t: t.name in ("div", "aside") and re.search(r"30 Sekunden|Schnell-Antwort|Kurz erkl", t.get_text())))
    if qa:
        for p in qa.find_all("p"):
            tt = clean(p.get_text(" "))
            if tt and "SEKUNDEN" not in tt.upper() and len(tt) > 20:
                quick.append(clean(mdify(str(p)).strip()))

    # FAQ aus JSON-LD (robuster als details-Parsing)
    faq_node = next((n for n in graph if n.get("@type") == "FAQPage"), None)
    faq = None
    if faq_node and faq_node.get("mainEntity"):
        faq = [{"q": clean(q["name"]), "a": clean(q["acceptedAnswer"]["text"])} for q in faq_node["mainEntity"]]
    elif main.select("details"):
        faq = []
        for d in main.select("details"):
            q = clean(d.find("summary").get_text(" ")) if d.find("summary") else ""
            a_el = d.find("p")
            if q and a_el:
                faq.append({"q": q, "a": clean(a_el.get_text(" "))})
        faq = faq or None

    # Body: robust für flache (Artikel) UND sektionierte (Hub) Layouts.
    # Strategie: Junk dekomponieren, dann Top-Level-Block-Elemente in
    # Dokument-Reihenfolge sammeln (h2..h4/p/ul/ol/table/blockquote), bis zur
    # ersten STOP-Heading. So unabhängig von der Verschachtelung der Sektionen.
    content_root = (main.select_one(".prose-au") or main.select_one("article") or main)
    cr = BeautifulSoup(str(content_root), "html.parser")
    # 1) Junk raus: Header/Nav/Footer/Form/Skripte/Buttons, h1, Eyebrow-Kicker,
    #    Quick-Answer-Box, FAQ-<details>, CTA-<aside>.
    for sel in ("nav", "footer", "form", "script", "style", "button", "details", "aside", "h1"):
        for el in cr.find_all(sel):
            el.decompose()
    for el in cr.select("[data-back-to-top]"):
        el.decompose()
    first_kick = cr.select_one("p.font-mono, span.font-mono")
    if first_kick and len(clean(first_kick.get_text())) < 80:
        first_kick.decompose()
    # Quick-Answer-Box (gleiche Heuristik wie oben) entfernen
    qa2 = (cr.select_one(".quick-answer")
           or cr.find(lambda t: t.name in ("div",) and "border-l-4" in " ".join(t.get("class", [])))
           or cr.find(lambda t: t.name in ("div",) and re.search(r"30 Sekunden|Schnell-Antwort|Kurz erkl", t.get_text())))
    if qa2:
        qa2.decompose()
    # 2) Top-Level-Blöcke in Reihenfolge sammeln
    SKIP_ANC = ("ul", "ol", "table", "blockquote", "li")
    body_parts, stop = [], False
    for el in cr.find_all(["h2", "h3", "h4", "p", "ul", "ol", "table", "blockquote"]):
        if stop:
            break
        if any(p.name in SKIP_ANC for p in el.parents):
            continue
        if el.name in ("h2", "h3", "h4") and clean(el.get_text(" ")).lower() in STOP_HEADINGS:
            stop = True
            break
        txt = clean(el.get_text(" "))
        if not txt:
            continue
        if el.name == "p" and ("Keine Rechtsberatung" in txt or "In Partnerschaft mit" in txt):
            continue
        for a in el.find_all("a"):
            nh = rewrite_href(a.get("href"))
            if nh is None:
                a.replace_with(a.get_text())
            else:
                a.attrs = {"href": nh}
        body_parts.append(str(el))
    body_md = mdify("".join(body_parts), heading_style="ATX", bullets="-").strip()
    body_md = re.sub(r"\n{3,}", "\n\n", body_md)
    body_md = "\n".join(l for l in body_md.split("\n")
                        if "Keine Rechtsberatung" not in l and "In Partnerschaft mit" not in l)
    # Disclaimer-/Partnerschaft-Zeilen raus
    body_md = "\n".join(l for l in body_md.split("\n")
                        if "Keine Rechtsberatung" not in l and "In Partnerschaft mit" not in l)

    # Quellen
    sources = []
    for h2 in content_root.find_all("h2"):
        if "quellen" in clean(h2.get_text(" ")).lower():
            ul = h2.find_next("ul")
            if ul:
                sources = [clean(li.get_text(" ")) for li in ul.find_all("li")]
            break

    # Breadcrumb aus JSON-LD. Manche Quell-Items zeigen auf Roh-Dateinamen statt
    # Canonical (z.B. /PILLAR-01-akutphase) → auf die echte Route normalisieren.
    BREADCRUMB_FIX = {
        "/pillar-01-akutphase": "/unfall-was-tun",
        "/hub-schadenfreiheitsklasse": "/schadenfreiheitsklasse",
    }
    bc_node = next((n for n in graph if n.get("@type") == "BreadcrumbList"), None)
    breadcrumb = []
    if bc_node:
        for it in bc_node.get("itemListElement", []):
            nm = clean(it.get("name", ""))
            item = it.get("item", "")
            p = "/" + item.split("autounfall.io/", 1)[1].rstrip("/") if "autounfall.io/" in item else "/"
            if nm.lower() in ("hub", "home", "start"):
                nm, p = "Start", "/"
            p = BREADCRUMB_FIX.get(p.lower(), p)
            breadcrumb.append({"name": nm, "route": p})

    obj = {
        "route": route, "kind": kind, "title": title, "h1": h1,
        "description": description, "eyebrow": eyebrow,
        "datePublished": pub, "dateModified": mod, "author": author,
        "quickAnswer": quick or [description], "body": body_md,
    }
    if accent and h1.startswith(accent):
        obj["h1Accent"] = accent
    if faq:
        obj["faq"] = faq
    if sources:
        obj["sources"] = sources
    if breadcrumb:
        obj["breadcrumb"] = breadcrumb
    return obj

# ── 2) Zielmenge ──
SKIP = {"HUB-unfallbericht.html"}
NESTED_ARTICLES = {
    "ARTICLE-fahrerflucht-selbst-anzeige-24h.html", "ARTICLE-fahrerflucht-spiegel-kratzer-bagatell.html",
    "ARTICLE-fahrerflucht-strafen-bgh.html", "ARTICLE-fahrerflucht-versicherung-regress.html",
    "ARTICLE-nutzungsausfall-totalschaden.html", "ARTICLE-nutzungsausfall-vs-mietwagen.html",
    "ARTICLE-nutzungsausfalltabelle-erklaert.html", "ARTICLE-sf-klasse-tabelle.html",
    "ARTICLE-sf-klasse-uebertragen.html", "ARTICLE-sf-klasse-verursacher-folgen.html",
}

pages, fails = [], []
def add(f, kind):
    try:
        p = extract_page(f, kind)
        if p:
            pages.append(p)
    except Exception as e:
        fails.append((f.name, repr(e)))

for f in sorted(SRC.glob("PILLAR-*.html")):
    add(f, "pillar")
for f in sorted(SRC.glob("HUB-*.html")):
    if f.name in SKIP:
        continue
    add(f, "hub")
for name in sorted(NESTED_ARTICLES):
    add(SRC / name, "article")

# ── 3) TS emittieren ──
def ts_lit(s):
    return json.dumps(s, ensure_ascii=False)

routes_seen = {}
dups = []
for p in pages:
    if p["route"] in routes_seen:
        dups.append(p["route"])
    routes_seen[p["route"]] = True

lines = []
lines.append("// AUTO-GENERIERT von scripts/port-rest.py — NICHT handeditieren.")
lines.append("// WP-7: Pillars + Master-Hubs + SF-Versicherer-Hubs + 10 nested-Artikel.")
lines.append("// Article-shaped: gerendert via components/rest/RestArticle.tsx (reused WP-2 parts).")
lines.append("import type { RestPage } from '@/lib/rest-types'")
lines.append("")
lines.append("export const restPages: RestPage[] = " + json.dumps(pages, ensure_ascii=False, indent=2))
lines.append("")
OUT.write_text("\n".join(lines), encoding="utf-8")

print(f"OK: {len(pages)} Seiten extrahiert -> {OUT.name}")
by_kind = {}
for p in pages:
    by_kind[p["kind"]] = by_kind.get(p["kind"], 0) + 1
print("  nach kind:", by_kind)
print("  Routen:", sorted(p["route"] for p in pages))
if dups:
    print("  WARN dup-routes:", dups)
if fails:
    print("  FAILS:", fails)
