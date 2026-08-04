# GEO-P3 Sub-2 — Unfallhelden-Spalte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Den `vermittlungsportale-vergleich` um Unfallhelden (5. Spalte) erweitern + Copy count-agnostisch + Freshness + t04/t10-Keywords.

**Architecture:** Reiner Content/i18n-Edit an bestehender Seite. i18n-Änderungen (6 Locales) via Node-Script (parity-sicher); page.tsx via Edits. Kein Unit-Test (keine Logik).

**Tech Stack:** next-intl (6 Locales, Paritäts-Gate), Next/React (claimondo-marketing).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-04-geo-p3-vergleich-unfallhelden-design.md`. Branch `kitta/geo-p3-vergleich`. Alle Pfade rel. zu `claimondo-marketing/`.
- **Unfallhelden-Werte (DE, UWG-bestätigt)** — 9 Zeilen in Reihenfolge: Full-Service „aus einer Hand" (Rechtsanwalt + Gutachter + Werkstatt + Ersatzwagen) · Online-Schadenmeldung + gebührenfreie 0800-Hotline · „deutschlandweites Netzwerk" (keine Zahl) · ja (inkl. Lackschichtdickenmessung) · nein · ja — spezialisierter Rechtsanwalt im Service · 0 € („kostet keinen Cent") · nein · deutschlandweit (DE).
- **Count-agnostisch** statt „vier→fünf" (zukunftssicher).
- **Umlaute** echt (UI). Wettbewerber-Aussagen bleiben faktisch/neutral (UWG).
- **Gate:** Marketing-Compile+tsc grün; voller Prerender lokal blockiert (Supabase-Env) → deploy-vps-marketing + Regel-4-Smoke.

---

### Task 1: i18n — Unfallhelden-Spalte + count-agnostische Copy (6 Locales)

**Files:** Modify `i18n/messages/{de,en,tr,ar,ru,pl}.json`

- [ ] **Step 1: Script schreiben** `claimondo-marketing/_add-unfallhelden.mjs` (temporär, nicht committen) das je Locale:
  1. `kfz_gutachter_vergleich.th_unfallhelden` = „Unfallhelden" (in allen Locales gleich, Eigenname).
  2. `tabelle_rows[i].unfallhelden` für i=0..8 setzt (Werte je Locale aus dem `UH`-Objekt im Script — DE = Global-Constraints oben, en/tr/ar/ru/pl übersetzt).
  3. Count-agnostische Ersetzungen (String-Replace je Key, sinngemäß je Sprache) auf: `tabelle_h2`, `tabelle_rows[7].claimondo`, `wann_cards[0].p`, `wann_cards[2].p_before`, `gemeinsam_h2`, `gemeinsam_capsule`, `faqs[0].antwort`, `faqs[4].antwort`, `faqs[5].antwort`, `fazit_p`.
  DE-Ersetzungen (verbatim):
  - `tabelle_h2`: „Die 4 Plattformen auf einen Blick" → „Die Plattformen im Direktvergleich"
  - `tabelle_rows[7].claimondo`: „ja (einzige der vier)" → „ja (als einzige der verglichenen Plattformen)"
  - `wann_cards[0].p`: „Alle vier werben" → „Alle Anbieter werben"
  - `wann_cards[2].p_before`: „Unter den vier hier verglichenen Plattformen" → „Unter den hier verglichenen Plattformen"
  - `gemeinsam_h2`: „Was alle vier gemeinsam haben" → „Was alle Anbieter gemeinsam haben"
  - `gemeinsam_capsule`: „Bei allen vier Plattformen" → „Bei allen verglichenen Plattformen"
  - `faqs[0].antwort`: „für alle vier verglichenen Plattformen" → „für alle hier verglichenen Plattformen"
  - `faqs[4].antwort`: „Alle vier verglichenen Plattformen binden" → „Alle verglichenen Plattformen binden"
  - `faqs[5].antwort`: „als einzige der vier Plattformen" → „als einzige der verglichenen Plattformen"
  - `fazit_p`: „sind sich die vier Plattformen" → „sind sich die verglichenen Plattformen"
  Script nutzt `JSON.parse`→mutate→`JSON.stringify(_,null,2)+'\n'` **pro Locale-Datei**, idempotent (skip wenn `th_unfallhelden` schon da).
- [ ] **Step 2: Ausführen** `node _add-unfallhelden.mjs` — Ausgabe: je Locale „OK, rows[*].unfallhelden gesetzt".
- [ ] **Step 3: Parität + Rest-„vier" prüfen**
```bash
node -e "for(const l of ['de','en','tr','ar','ru','pl']){const v=require('./i18n/messages/'+l+'.json').kfz_gutachter_vergleich; const ok=v.th_unfallhelden && v.tabelle_rows.every(r=>r.unfallhelden); console.log(l, ok?'OK':'FEHLT')}"
node -e "const v=require('./i18n/messages/de.json').kfz_gutachter_vergleich; const s=JSON.stringify(v); console.log('rest vier:', (s.match(/\bvier\b/gi)||[]).length)"
```
Erwartet: alle „OK"; „rest vier: 0" (DE). (en/tr/ar/ru/pl: Übersetzungen enthalten das jeweilige Zahlwort nicht mehr — im Script mit-ersetzt.)
- [ ] **Step 4: Script löschen** `rm _add-unfallhelden.mjs`
- [ ] **Step 5: Commit** `git add i18n/messages/*.json && git commit -m "feat(geo-p3): Unfallhelden-Spalte + count-agnostische Copy (6 Locales)"`

---

### Task 2: page.tsx — 5. Spalte, Freshness, Schema, Footnote, Keywords

**Files:** Modify `app/[locale]/kfz-gutachter/vermittlungsportale-vergleich/page.tsx`

- [ ] **Step 1: Tabellen-Header** — nach `<Th scope="col">{t('th_giganten')}</Th>`: `<Th scope="col">{t('th_unfallhelden')}</Th>`.
- [ ] **Step 2: Tabellen-Zeile** — den `tabelle_rows`-Map-Typ um `unfallhelden: string` erweitern; nach `<Td …>{row.giganten}</Td>`: `<Td className="align-top text-claimondo-shield">{row.unfallhelden}</Td>`.
- [ ] **Step 3: Freshness** — `const STAND = '25.05.2026'` → `'04.08.2026'`; im `articleSchema` `dateModified: '2026-05-25'` → `'2026-08-04'` (datePublished bleibt).
- [ ] **Step 4: articleSchema headline/description** — headline: „… Unfallpaten & Unfallgiganten" → „… Unfallpaten, Unfallgiganten & Unfallhelden"; description „der vier deutschen … Vermittlungsplattformen" → „der führenden deutschen … Vermittlungsplattformen".
- [ ] **Step 5: FAQS_SCHEMA count-fix** (hardcoded DE, muss zu i18n passen): „für alle vier verglichenen Plattformen"→„für alle hier verglichenen Plattformen"; „Alle vier verglichenen Plattformen binden"→„Alle verglichenen Plattformen binden"; „als einzige der vier Plattformen"→„als einzige der verglichenen Plattformen".
- [ ] **Step 6: Quellen-Footnote** — nach dem `unfallgiganten.de`-Link: `,{' '}<a href="https://www.unfallhelden.de" rel="nofollow noopener" target="_blank" className="underline underline-offset-2 hover:text-claimondo-navy">unfallhelden.de</a>`.
- [ ] **Step 7: Keywords (t04/t10)** — das `keywords`-Array (Z. ~28-36) um `'beste plattform unfallschaden'`, `'digitale schadensregulierung plattform'`, `'unfallhelden alternative'`, `'unfallhelden vergleich'` ergänzen.
- [ ] **Step 8: Kommentar-Fix** — `{/* Was alle vier gemeinsam haben */}` → `{/* Was alle Anbieter gemeinsam haben */}` (Konsistenz, unkritisch).
- [ ] **Step 9: Commit** `git add "app/[locale]/kfz-gutachter/vermittlungsportale-vergleich/page.tsx" && git commit -m "feat(geo-p3): 5. Vergleichs-Spalte (Unfallhelden) + Freshness + Schema + Footnote + Keywords"`

---

### Task 3: Build-Gate + PR

- [ ] **Step 1: node_modules** — `npm ci` in claimondo-marketing (falls nicht vorhanden; Turbopack-Root).
- [ ] **Step 2: Compile+tsc** — `npm run build` läuft bis „✓ Compiled successfully" + „Finished TypeScript" (der Prerender scheitert erwartungsgemäß an `/feed.json`-Supabase-Env — nicht meine Änderung; im PR vermerken). Alternativ falls Prerender-Env verfügbar: voller Build grün.
- [ ] **Step 3: PR** gegen staging:
```bash
git push -u origin kitta/geo-p3-vergleich
gh pr create --base staging --title "feat(geo-p3): Vergleich um Unfallhelden erweitern (5-Wege)" --body "GEO-P3 Sub-2 …"
```
- [ ] **Step 4: Regel-4-Smoke (Handoff)** — nach Marketing-Deploy: `claimondo.de/kfz-gutachter/vermittlungsportale-vergleich` rendert 5-Spalten-Tabelle (Unfallhelden sichtbar, Werte korrekt), keine „vier"-Reste, Footnote hat unfallhelden.de.

---

## Self-Review

**Spec-Coverage:** th_unfallhelden + 9 Zellen + count-Copy → Task 1 ✓. 5. Spalte + Freshness + Schema/Headline + Footnote + Keywords → Task 2 ✓. Build+Smoke → Task 3 ✓.
**Placeholder-Scan:** DE-Ersetzungen verbatim; Übersetzungen im Script (Task-1 Daten-Task mit Paritäts-Gate). Keine TBD.
**Typ-Konsistenz:** `unfallhelden: string` im Map-Typ (Task 2 Step 2) ↔ `tabelle_rows[*].unfallhelden` (Task 1). `th_unfallhelden`-Key konsistent i18n↔page.
