# Agent-Briefing — Marketing + i18n Smoke

**Wer das liest:** eine Claude-Code-Instanz (oder beliebiger Agent) die Aaron geschickt hat um den Smoke-Test der öffentlichen Claimondo-Marketing-Site + gutachter-B2B-Landing in allen 6 Sprachen durchzuführen.

**Mission:** ein Skript laufen lassen, Output zurückmelden. Nichts bauen, nichts ändern.

---

## TL;DR — was du tust

```bash
cd <projektroot>
npm install                           # falls nicht schon geschehen
npx playwright install chromium       # einmalig, falls Browser fehlt
node scripts/smoke/marketing-i18n-smoke.mjs
```

Output landet in `tmp/smoke-runs/<TIMESTAMP>/`:
- `report.json` — vollständiger Lauf-Report (Maschinen-lesbar)
- `SUMMARY.md` — kompakte Tabelle pro Sprache
- `marketing/<lang>/<route>.png` — Screenshot pro Page × Sprache
- `gutachter/*.png` — Screenshots der B2B-Landing inkl. Form-PLZ-Test

Du schickst Aaron zurück:
1. Den Pfad (`tmp/smoke-runs/2026-...`)
2. Den Inhalt von `SUMMARY.md`
3. Falls Errors: die ersten 3 fehlgeschlagenen Pages mit Console-Sample

**Nicht:**
- Keine Code-Änderungen
- Keine npm-Installs außerhalb der zwei Befehle oben
- Keine Smoke-Wiederholungen wenn der erste Run grün ist

---

## Was das Skript macht

Crawlt **6 Sprachen × 11 Marketing-Pages = 66 Page-Loads** plus die Gutachter-B2B-Landing inkl. Live-Karten-Funktionstest.

**Pro Page misst es:**
- HTTP-Status (Soll: 200)
- `<html lang="...">`-Attribut (sollte zur gewählten Sprache passen)
- `dir`-Attribut (für Arabisch sollte `rtl` stehen)
- `<title>` und `<h1>` (zeigen ob Übersetzungen tatsächlich greifen)
- Console-Errors (Soll: 0)
- Page-Load-Zeit
- Full-Page-Screenshot

**Bonus-Test auf gutachter.claimondo.de:**
- PLZ `50670` ins Form eintippen
- 2.5s warten (Mapbox-Geocoding + flyTo-Animation)
- Screenshot mit erwartetem „Köln"-Hint

---

## CLI-Optionen

```bash
# Default: gegen Production
node scripts/smoke/marketing-i18n-smoke.mjs

# Nur bestimmte Sprachen
node scripts/smoke/marketing-i18n-smoke.mjs --langs=de,en

# Andere Base-URL (z. B. Preview-Deploy oder lokal)
node scripts/smoke/marketing-i18n-smoke.mjs --base=https://staging.claimondo.de

# Mit sichtbarem Browser (zum Debugging)
node scripts/smoke/marketing-i18n-smoke.mjs --headed
```

Auch verfügbar als npm-Script:

```bash
npm run smoke:marketing            # alle Sprachen, Production
npm run smoke:marketing -- --langs=de,en
```

---

## Bekannte Eigenheiten

### Phase 1A: TR/PL/RU sind aktuell DE-Fallback

Bis Phase 1B durch ist (i18n-Translation-Pipeline), zeigen TR/PL/RU
**deutschen Text** — das ist Absicht, kein Bug. Sprachen-Smoke prüft trotzdem
HTTP-Status und html-lang-Attribut. Die Übersetzungs-Tiefe wird visuell
am Screenshot überprüft.

### EN/AR sind teil-übersetzt

`/ueber-uns` ist auf allen 5 Ziel-Sprachen übersetzt (Pipeline-Beispiel),
andere Pages haben EN/AR-Strings nur dort wo sie in shared Components
(`LandingHero`, `LandingFooter`, `LandingTopbar`) leben.

### gutachter.claimondo.de hat keinen Sprachen-Switch

B2B-Landing für DAT-Partner — bewusst nur Deutsch. Wird einmal getestet,
nicht 6x.

### NEXT_LOCALE-Cookie steuert die Sprache

Das Skript setzt vor jedem Marketing-Page-Load den `NEXT_LOCALE`-Cookie
auf die jeweilige Sprache. next-intl liest den und rewrited intern.

---

## Failure-Modes & Triage

| Symptom | Wahrscheinliche Ursache | Aktion |
|---|---|---|
| HTTP 502 auf alles | VPS-Deploy gerade durch / pm2 restart läuft | 60s warten + nochmal |
| HTTP 308/307 ohne 200-Folge | Middleware-Loop oder hostname-Mismatch | An Aaron melden |
| `html lang="de"` bei `--langs=en` | NEXT_LOCALE-Cookie wird nicht gelesen | Skript-Bug, an Aaron |
| Console-Errors > 5 auf einer Page | Echter JS-Fehler | Console-Sample an Aaron |
| `Live-Karten-Hint: null` | Mapbox-Token fehlt oder Geocoding gescheitert | NEXT_PUBLIC_MAPBOX_TOKEN prüfen |
| Playwright-Browser fehlt | Erst-Install | `npx playwright install chromium` |

---

## Was du NICHT tun sollst

- **Keine Bugs fixen.** Wenn was kaputt ist: melden, nicht reparieren.
- **Keine Test-User anlegen.** Smoke ist rein public, kein Auth nötig.
- **Keine Daten-Migrations laufen lassen.**
- **Keinen Code committen.** Das Skript schreibt nur in `tmp/`, nicht ins Repo.

---

## Output-Format für die Rückmeldung

Schick Aaron diese Form:

```
Smoke gelaufen: tmp/smoke-runs/2026-05-10T...

Übersicht:
- Gesamt: X / 67
- HTTP 200: X
- HTTP non-200: X
- Console-Errors auf X Pages

Highlights aus SUMMARY.md:
[Tabelle pro Sprache, gekürzt auf das Wesentliche]

Auffälligkeiten:
- [Falls vorhanden, max 5 Bullets]
```

Wenn alles grün: ein Satz reicht plus der Pfad.

---

## Wenn der Smoke crasht

Crash heißt: Skript hat einen Exception, der nicht zu einer einzelnen Page gehört (Playwright-Init, Browser-Launch, etc.). Dann:

1. Stack-Trace komplett kopieren
2. Node-Version melden (`node --version`)
3. Playwright-Version melden (`npx playwright --version`)
4. An Aaron — nicht selbst debuggen.
