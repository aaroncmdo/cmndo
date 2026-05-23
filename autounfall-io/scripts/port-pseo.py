#!/usr/bin/env python3
"""WP-5 PSEO-Port-Extraktor (deterministisch, BeautifulSoup).

Parst die 100 PSEO-<stadt>-<typ>.html aus der gitignored Prototyp-Quelle und
emittiert content/pseo-data.generated.ts: 20 Staedte-Map + 5 Typen-Map.

Datenmodell (empirisch verifiziert):
  - pro STADT konstant: einwohner, pkw, unfaelle_gesamt, svs, gericht
  - pro TYP konstant:   label, kategorie, pct, schaden, bgh_az, definition
  - pro KOMBINATION:    typ_count = round(unfaelle_gesamt * pct/100)

Das Skript ASSERTet diese Konsistenz ueber alle 100 Files (bricht bei Drift ab)
und prueft die berechnete typ_count gegen den Wert im Quell-HTML.

Quelle (gitignored, nur Main-Checkout): absoluter Pfad unten.
Lauf:  python scripts/port-pseo.py
"""
import os
import re
import json
import sys
from collections import defaultdict
from bs4 import BeautifulSoup

SRC = r"C:\Users\Aaron Sprafke\stampit-app\stampit-app\claimondo-v2\marketing-strategy\Seiten nicolas\FINAL\autounfall-SOURCE-lean"
OUT = os.path.join(os.path.dirname(__file__), "..", "content", "pseo-data.generated.ts")

CITY_SLUGS = [
    "berlin", "bielefeld", "bochum", "bonn", "bremen", "dortmund", "dresden",
    "duesseldorf", "duisburg", "essen", "frankfurt", "hamburg", "hannover",
    "koeln", "leipzig", "muenchen", "muenster", "nuernberg", "stuttgart", "wuppertal",
]
TYPE_SLUGS = ["auffahrunfall", "parkplatzunfall", "spurwechsel", "vorfahrtsverletzung", "wildunfall"]


def txt(el):
    return el.get_text(" ", strip=True) if el else ""


def cell_after(soup, label_re):
    """Findet <td>LABEL</td><td>WERT</td> und gibt WERT (roh) zurueck."""
    for tr in soup.select("table tr"):
        tds = tr.find_all("td")
        if len(tds) == 2 and re.search(label_re, tds[0].get_text(strip=True)):
            return tds[1].get_text(strip=True)
    return None


def parse(slug_city, slug_type):
    path = os.path.join(SRC, f"PSEO-{slug_city}-{slug_type}.html")
    with open(path, encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    title = txt(soup.find("title"))
    desc = (soup.find("meta", attrs={"name": "description"}) or {}).get("content", "")
    h1 = soup.find("h1")
    # H1: "<Typ-Label> in <Stadt> · was Sie tun müssen"
    h1_txt = txt(h1)
    m = re.search(r"^(.+?) in (.+?) ·", h1_txt)
    type_label = m.group(1) if m else slug_type
    city_name = m.group(2) if m else slug_city

    # Stat-Tabelle
    einwohner = cell_after(soup, r"^Einwohner")
    pkw = cell_after(soup, r"Zugelassene PKW")
    unfaelle = cell_after(soup, r"Unf.+lle pro Jahr \(gesamt\)")
    typ_row = cell_after(soup, r"pro Jahr \(gesch")  # "9.216 (24%)"
    schaden = cell_after(soup, r"Durchschnittsschaden")
    svs = cell_after(soup, r"BVSK-Sachverst.+\(Region\)")
    gericht = cell_after(soup, r"Zust.+ndiges Gericht")

    # Typ-Anteil + count aus typ_row "9.216 (24%)"
    mc = re.match(r"([\d.]+)\s*\((\d+)%\)", typ_row or "")
    typ_count_src = mc.group(1) if mc else None
    pct = int(mc.group(2)) if mc else None

    # Typ-BGH-Az aus "Rechtsrahmen · BGH-Az VI ZR 32/16"
    bgh = None
    for h2 in soup.find_all("h2"):
        mm = re.search(r"BGH-Az\s+([IVX]+ ZR \d+/\d+)", h2.get_text(" ", strip=True))
        if mm:
            bgh = mm.group(1)
            break

    # "Was zählt als <X>?" Definitions-Absatz (erster <p> nach diesem h2)
    definition = None
    kategorie = None
    for h2 in soup.find_all("h2"):
        if re.search(r"^Was z.+hlt als", h2.get_text(strip=True)):
            p = h2.find_next("p")
            definition = p.decode_contents().strip() if p else None
            break

    # Kategorie-Label aus Intro ("die häufigste Unfall-Kategorien" etc.) — pro Typ
    intro_p = h1.find_next("p") if h1 else None
    intro_html = intro_p.decode_contents().strip() if intro_p else ""

    # FAQ (5 details): Frage + Antwort-HTML
    faq = []
    for d in soup.select("article details"):
        q = txt(d.find("summary"))
        a_el = d.find("p")
        a = a_el.decode_contents().strip() if a_el else ""
        if q:
            faq.append({"q": q, "a": a})

    return {
        "city": slug_city, "type": slug_type, "type_label": type_label,
        "title": title, "desc": desc,
        "city_name": city_name, "einwohner": einwohner, "pkw": pkw,
        "unfaelle": unfaelle, "typ_count_src": typ_count_src, "pct": pct,
        "schaden": schaden, "svs": svs, "gericht": gericht, "bgh": bgh,
        "definition": definition, "intro_html": intro_html, "faq": faq,
    }


def de_to_int(s):
    return int(re.sub(r"[^\d]", "", s)) if s else 0


def main():
    records = []
    missing = []
    for c in CITY_SLUGS:
        for t in TYPE_SLUGS:
            p = os.path.join(SRC, f"PSEO-{c}-{t}.html")
            if not os.path.exists(p):
                missing.append(f"{c}-{t}")
                continue
            records.append(parse(c, t))
    if missing:
        print("FEHLENDE Files:", missing, file=sys.stderr)
        sys.exit(1)
    assert len(records) == 100, f"erwartet 100, gefunden {len(records)}"

    # ── Konsistenz pro Stadt (einwohner/pkw/unfaelle/svs/gericht/name konstant) ──
    cities = {}
    for c in CITY_SLUGS:
        recs = [r for r in records if r["city"] == c]
        for field in ("city_name", "einwohner", "pkw", "unfaelle", "svs", "gericht"):
            vals = {r[field] for r in recs}
            assert len(vals) == 1, f"Stadt {c} Feld {field} variiert: {vals}"
        cities[c] = {
            "slug": c, "name": recs[0]["city_name"], "einwohner": recs[0]["einwohner"],
            "pkw": recs[0]["pkw"], "unfaelle": recs[0]["unfaelle"],
            "svs": recs[0]["svs"], "gericht": recs[0]["gericht"],
        }

    # ── Konsistenz pro Typ (label/pct/schaden/bgh/definition konstant) ──
    types = {}
    for t in TYPE_SLUGS:
        recs = [r for r in records if r["type"] == t]
        for field in ("type_label", "pct", "schaden", "bgh", "definition"):
            vals = {r[field] for r in recs}
            assert len(vals) == 1, f"Typ {t} Feld {field} variiert: {sorted(map(str, vals))[:3]}"
        types[t] = {
            "slug": t, "label": recs[0]["type_label"], "pct": recs[0]["pct"],
            "schaden": recs[0]["schaden"], "bgh": recs[0]["bgh"],
            "definition": recs[0]["definition"],
        }

    # ── Kombinations-Zahl verifizieren: round(unfaelle * pct/100) == Quell-count ──
    mismatches = []
    for r in records:
        calc = round(de_to_int(r["unfaelle"]) * r["pct"] / 100)
        src = de_to_int(r["typ_count_src"])
        if calc != src:
            mismatches.append(f"{r['city']}-{r['type']}: calc={calc} src={src}")
    if mismatches:
        print("typ_count-MISMATCH:", mismatches[:10], file=sys.stderr)
        sys.exit(1)

    # ── TS emittieren ──
    ts = []
    ts.append("// AUTO-GENERIERT von scripts/port-pseo.py — NICHT von Hand editieren.")
    ts.append("// WP-5 PSEO: 100 kfz-unfall/[stadt]/[typ]-Seiten (20 Staedte x 5 Typen).")
    ts.append("// Quelle: PSEO-<stadt>-<typ>.html (Prototyp). typ_count wird zur Render-Zeit")
    ts.append("// berechnet: Math.round(unfaelle * pct/100) — im Quell-HTML verifiziert (100/100).")
    ts.append("")
    ts.append("export type PseoCity = {")
    ts.append("  slug: string; name: string; einwohner: string; pkw: string;")
    ts.append("  unfaelle: string; svs: string; gericht: string")
    ts.append("}")
    ts.append("export type PseoType = {")
    ts.append("  slug: string; label: string; pct: number; schaden: string; bgh: string;")
    ts.append("  /** Kontrolliertes HTML (<strong>/<span>) — via dangerouslySetInnerHTML. */")
    ts.append("  definition: string")
    ts.append("}")
    ts.append("")
    ts.append("export const PSEO_CITIES: Record<string, PseoCity> = " + json.dumps(cities, ensure_ascii=False, indent=2) + "")
    ts.append("")
    ts.append("export const PSEO_TYPES: Record<string, PseoType> = " + json.dumps(types, ensure_ascii=False, indent=2) + "")
    ts.append("")
    ts.append("export const PSEO_CITY_SLUGS = " + json.dumps(CITY_SLUGS) + " as const")
    ts.append("export const PSEO_TYPE_SLUGS = " + json.dumps(TYPE_SLUGS) + " as const")
    ts.append("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(ts))

    print(f"OK: 100 Files geparst, {len(cities)} Staedte + {len(types)} Typen, typ_count 100/100 verifiziert.")
    print(f"-> {os.path.normpath(OUT)}")
    # Typ-Labels (aus Filenames) zur Kontrolle:
    for t in TYPE_SLUGS:
        line = f"   {t}: {types[t]['pct']}% . {types[t]['schaden']} . BGH {types[t]['bgh']}"
        print(line.encode("ascii", "replace").decode("ascii"))


if __name__ == "__main__":
    main()
