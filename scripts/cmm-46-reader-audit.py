"""CMM-46 Reader-Audit: identify .from('faelle').select(...) statements that read
duplicate-columns (i.e. columns synchronized between faelle and claims by the
sync triggers). Produces docs/15.05.2026/cmm-phase-2-reader-audit.md.
"""
from __future__ import annotations
import os
import re
import sys
from collections import defaultdict

REPO = r"C:/Users/Aaron Sprafke/stampit-app/stampit-app/wt-inv-15"
OUTPUT = os.path.join(REPO, "docs", "15.05.2026", "cmm-phase-2-reader-audit.md")

DUPLICATE_COLS = sorted([
    "abgeschlossen_am", "auslandskennzeichen", "brn", "fahrerflucht",
    "finanzierung_leasing", "finanzierungsgeber_adresse",
    "finanzierungsgeber_name", "finanzierungsgeber_vertragsnr",
    "gegner_bekannt", "gegner_versicherung_id", "gegner_versicherungsnummer",
    "gewerbe_flag", "kanzlei_ansprechpartner_email",
    "kanzlei_ansprechpartner_name", "kanzlei_ansprechpartner_telefon",
    "kanzlei_uebergeben_am", "kunde_email", "kunden_konstellation",
    "kundenbetreuer_id", "nutzungsausfall_tage", "polizei_aktenzeichen",
    "polizei_bericht_vorhanden", "polizei_vor_ort", "polizeibericht_status",
    "restwert", "sachschaden_beschreibung", "spezifikation", "totalschaden",
    "unfall_konstellation", "unfallskizze_ablehnung_grund",
    "unfallskizze_bestaetigt", "unfallskizze_generiert_am",
    "unfallskizze_svg", "unfallskizze_url", "vehicle_id",
    "vorsteuerabzugsberechtigt", "wiederbeschaffungswert", "zeugen_kontakte",
])

WORKFLOW_HINTS = {
    "status", "sv_id", "sv_termin", "fall_nummer", "id", "claim_id",
    "lead_id", "kunde_id", "abrechnung_id", "kanzlei_wunsch", "created_at",
    "updated_at", "erstellt_am", "re_termin_token",
}

FROM_FAELLE_RE = re.compile(r"\.from\(\s*['\"]faelle['\"]\s*\)")
SELECT_STR_RE = re.compile(r"\.select\(\s*['\"]([^'\"]*)['\"]")
SELECT_STAR_RE = re.compile(r"\.select\(\s*['\"]\*['\"]")

results: list[tuple[str, int, list[str], list[str], str]] = []
selects_total = 0
selects_star = 0
selects_dynamic = 0  # no string literal in window

for root, dirs, files in os.walk(os.path.join(REPO, "src")):
    dirs[:] = [d for d in dirs if d not in ("node_modules", ".next", "dist")]
    for fname in files:
        if not fname.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs")):
            continue
        path = os.path.join(root, fname)
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as fp:
                lines = fp.readlines()
        except OSError:
            continue
        for i, line in enumerate(lines):
            if not FROM_FAELLE_RE.search(line):
                continue
            window = "".join(lines[i:min(i + 8, len(lines))])
            if SELECT_STAR_RE.search(window):
                selects_star += 1
                selects_total += 1
                rel = path.replace(REPO + os.sep, "").replace("\\", "/")
                results.append((rel, i + 1, ["*"], [], "SELECT *"))
                continue
            m = SELECT_STR_RE.search(window)
            if not m:
                # could be .update/.insert/.upsert/.delete or dynamic .select(constant)
                selects_dynamic += 1
                continue
            selects_total += 1
            sel = m.group(1)
            cols_in_select = [c.strip() for c in sel.split(",") if c.strip()]
            dup_cols = sorted({c for c in DUPLICATE_COLS if re.search(r"\b" + c + r"\b", sel)})
            wf_cols = sorted({c for c in cols_in_select if c in WORKFLOW_HINTS})
            if dup_cols:
                rel = path.replace(REPO + os.sep, "").replace("\\", "/")
                results.append((rel, i + 1, dup_cols, wf_cols, sel[:140]))

# group by file
by_file: dict[str, list] = defaultdict(list)
for r in results:
    by_file[r[0]].append(r)

# column frequency
col_count: dict[str, int] = defaultdict(int)
for r in results:
    for c in r[2]:
        col_count[c] += 1

# write report
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
with open(OUTPUT, "w", encoding="utf-8") as fp:
    fp.write("# CMM-46 — Phase 2 Reader-Audit (Stand 2026-05-15)\n\n")
    fp.write("**Linear:** [CMM-46](https://linear.app/aaroncmndo/issue/CMM-46) · ")
    fp.write("**Master:** [CMM-44](https://linear.app/aaroncmndo/issue/CMM-44)\n\n")
    fp.write("## Methodik\n\n")
    fp.write("Programmatischer Scan via `scripts/cmm-46-reader-audit.py` über `src/**/*.{ts,tsx,js,jsx,mjs}`.\n")
    fp.write(f"Erkennt `.from('faelle')` + folgendes `.select('...')` in 8-Zeilen-Fenster.\n")
    fp.write("Klassifikation **D** = `.select(...)`-Liste enthält ≥1 der 38 sync-Trigger-Spalten.\n\n")
    fp.write(f"## Zusammenfassung\n\n")
    fp.write(f"- **Total faelle-Selects mit String-Literal:** {selects_total}\n")
    fp.write(f"  - davon **`SELECT *`** (immer D):              {selects_star}\n")
    fp.write(f"  - davon mit konkreten Spalten:                  {selects_total - selects_star}\n")
    fp.write(f"- **Dynamic / non-literal Selects** (z. B. Konstanten wie `FALL_SELECT`, oder Multi-Line/Method-Chains außerhalb des 8-Zeilen-Fensters): {selects_dynamic}\n")
    fp.write(f"- **D-Reader gefunden** (mind. 1 Duplikat-Spalte gelesen): **{len(results)}** Stellen in **{len(by_file)}** Dateien\n\n")
    fp.write("Hinweis: Bytes wie `select` über Backslash-Continuation oder TypeScript-Template-Literals werden nicht erkannt — die `selects_dynamic`-Zahl ist die Obergrenze für versteckte D-Reader.\n\n")

    fp.write("## Top-Dateien (sortiert nach Anzahl D-Reads)\n\n")
    fp.write("| # | Datei | D-Reads |\n|---|---|---:|\n")
    for f, rs in sorted(by_file.items(), key=lambda x: -len(x[1]))[:20]:
        fp.write(f"| {len(rs)} | `{f}` | {len(rs)} |\n")
    fp.write("\n")

    fp.write("## Häufigkeit pro Duplikat-Spalte (in D-Selects)\n\n")
    fp.write("| Spalte | × gelesen | Hinweis |\n|---|---:|---|\n")
    HINTS = {
        "kundenbetreuer_id": "Massiv in Cron-Jobs + Team-Pages. Migration auf claims relativ einfach (selten allein gelesen — meist mit Workflow-Spalten kombiniert → v_claim_full ideal)",
        "abgeschlossen_am": "Lifecycle-Datum, in vielen Stat-Pages. v_claim_full bevorzugt",
        "vehicle_id": "FK, nicht Daten — Lifecycle-Drift bei Migration zu vehicles berücksichtigen (CMM-50)",
        "restwert": "Wertfeld — gehört langfristig zu gutachten (CMM-51)",
        "wiederbeschaffungswert": "Wertfeld — gehört langfristig zu gutachten (CMM-51)",
        "nutzungsausfall_tage": "Wertfeld — gehört langfristig zu gutachten (CMM-51)",
        "totalschaden": "Wertfeld — gehört langfristig zu gutachten (CMM-51)",
        "unfall_konstellation": "Stufe-1 Quick-Drop-Kandidat (CMM-45)",
        "finanzierung_leasing": "vehicles-Migration (CMM-50)",
        "finanzierungsgeber_name": "vehicles-Migration (CMM-50)",
        "finanzierungsgeber_adresse": "vehicles-Migration (CMM-50)",
        "finanzierungsgeber_vertragsnr": "vehicles-Migration (CMM-50)",
        "brn": "vehicles-Migration (CMM-50)",
    }
    for c in sorted(col_count, key=lambda x: -col_count[x]):
        hint = HINTS.get(c, "")
        fp.write(f"| `{c}` | {col_count[c]} | {hint} |\n")
    fp.write("\n")

    fp.write("## Migration-Cluster (für PR-Schnitt in CMM-47)\n\n")
    fp.write("Sortiert nach Refactor-Effizienz (1 PR pro Cluster):\n\n")
    fp.write("### Cluster A — Cron-Jobs `kundenbetreuer_id`-Reads\n\n")
    fp.write("Pattern: alle Cron-Routes filtern Fälle nach `kundenbetreuer_id` für Reminder/Eskalation. Aktuell auf `faelle`, kann auf `v_claim_full` oder direkter auf `claims` joined mit Workflow-Spalten.\n\n")
    fp.write("### Cluster B — Admin-Stat-Pages `abgeschlossen_am` + `kundenbetreuer_id`\n\n")
    fp.write("`src/app/admin/team/*`, `src/app/admin/statistiken/*`. Diese Reads kombinieren D mit W (status, sv_id). Migration auf `v_claim_full` 1:1 möglich.\n\n")
    fp.write("### Cluster C — Finance-Aggregationen\n\n")
    fp.write("`src/lib/finance/fall-finanzen.ts`, `src/lib/analytics/finance.ts`. Lesen Wert-Felder (restwert, wiederbeschaffungswert, nutzungsausfall_tage, totalschaden). **Empfehlung:** in CMM-51-Block (gutachten-Sub-Table) bündeln statt isoliert migrieren — Wert-Felder gehören eh auf `gutachten`.\n\n")
    fp.write("### Cluster D — Stammdaten-Karten\n\n")
    fp.write("`src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx` und ähnliche. Reads vieler Spalten gleichzeitig (gewerbe_flag, kanzlei_*, polizei_*, gegner_*). Hier 1 großer Refactor auf `getClaimForRole`-Pattern.\n\n")
    fp.write("## Alle D-Reader (vollständig)\n\n")
    fp.write("| File:Line | Duplikat-Spalten gelesen | Select-Snippet |\n|---|---|---|\n")
    for rel, lineno, dup_cols, wf_cols, snippet in sorted(results):
        cols_str = ", ".join(f"`{c}`" for c in dup_cols)
        snippet_esc = snippet.replace("|", "\\|")
        fp.write(f"| `{rel}:{lineno}` | {cols_str} | `{snippet_esc}` |\n")
    fp.write("\n## Workflow-Reader (W) — bleiben auf faelle\n\n")
    fp.write(f"Alle `.from('faelle').select(...)`-Stellen, die KEINE Duplikat-Spalte lesen ({selects_total - len(results)} Stellen).\n")
    fp.write("Nicht im Detail gelistet — Migration nicht nötig.\n\n")
    fp.write("## Empfehlung für CMM-47 (Reader-Migration)\n\n")
    fp.write("1. **Quick-Wins zuerst**: Cluster A (Cron-Jobs) + Cluster B (Admin-Stat-Pages) — beide nur einfache Spalten-Listen, kein UI-Impact, kein RLS-Risiko\n")
    fp.write("2. **Cluster D** als 1 großer PR für Stammdaten-Pfad\n")
    fp.write("3. **Cluster C zurückstellen** bis CMM-51 (gutachten-Sub-Table) — sonst doppelter Refactor\n")
    fp.write("4. **`vehicle_id`-Reads** (Cluster D-Tail) gehört zu CMM-50 (vehicles-Migration)\n")
    fp.write(f"\n*Generiert: `scripts/cmm-46-reader-audit.py`*\n")

print(f"OK — {len(results)} D-Reader in {len(by_file)} Dateien gefunden.")
print(f"Report: {OUTPUT}")
