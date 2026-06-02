# HANDOFF — Personal-Cleanup-W-Strecke (EOD 2 · 2026-06-02 ~13:10)

- **Strecke:** **AAR-943** (Parent) + AAR-944…954 (jetzt 11 Subs). Quelle-Audit: `docs/01.06.2026/personal-audit-anlage-abrechnung.md` (#2173). Umbrella-Spec: `docs/superpowers/specs/2026-06-01-personal-cleanup-design.md`.
- **Vorgänger-Handoff (Vormittag):** `docs/02.06.2026/HANDOFF-personal-cleanup-w-strecke.md`.
- **DB:** `paizkjajbuxxksdoycev` (Prod, shared — viele parallele Sessions). Alles pre-launch-unkritisch (Stripe-Testmodus).
- **Aaron-Direktive:** ALLE W-Tickets umsetzen.

> ⚠️ **Erste Amtshandlung Folge-Session:** Live re-verifizieren (`list_migrations` + `information_schema` + PR-States). Zahlen hier sind Stand ~13:10. Folge-Arbeit IMMER off `origin/staging` basieren (Squash-Divergenz).

---

## 0 · TL;DR
Diese Session (Vormittag→Mittag) hat **alle ungated W-Tickets abgeschlossen**: W2.1, W2.2, W1.4, W3.1 gemergt; W2.3 (Drop) gemergt + live, dessen Types als PR **#2265 offen**. W3.3 als Ticket neu definiert. **Es bleibt genau 1 offener PR (#2265)** + 4 echt-gegatete Tickets.

---

## 1 · Diese Session erledigt
| Ticket | PR | Stand |
|---|---|---|
| W2.1 / AAR-949 createMakler (admin/team) | #2226 | ✅ merged + **E2E live gesmoked** (Makler kommt ins Portal; Test-Daten cleaned) |
| W2.2 / AAR-950 sv_organisation*-Drop | #2232 | ✅ merged + prod-DB live (Mig `20260602081438`); + `gutachten.laeufer_report_id` mitentfernt |
| W1.4 / AAR-948 atomare Rechnungsnr | #2234 | ✅ merged; CMNDO-K + CL- auf `next_rechnungs_nr`; Counter-Smoke 1→2→3 |
| W3.1 / AAR-952 SLA-Triage | #2237 | ✅ merged (doc-only Entwarnung: 24 breached = Smoke-Test-Rauschen) |
| W2.3 / AAR-951 PR2 Drop | #2245 | ✅ merged + prod-DB live (Mig `20260602092656`, profiles HR-Spalten weg) |

---

## 2 · OFFENE AUFGABEN

### 🟡 SOFORT — W2.3 PR2 Types nachziehen (der einzige offene PR)
- **PR #2265** (`kitta/aar-951-pr2-types-followup`) — Type-Cleanup zum profiles-HR-Drop: `database.types.ts` (4 Phantom-Spalten raus + `mitarbeiter_verguetung`-Typ) + 4 any-Casts in `admin/team` entcastet. Build exit 0.
- **Warum separat:** der Commit `e85424aa5` wurde versehentlich NACH dem #2245-Merge auf den (gemergten) Branch gepusht → blieb hängen; per Cherry-Pick auf staging nachgezogen.
- **Next:** Review + Merge → erst dann ist AAR-951 komplett (Drop+Types).

### ⏰ W1.1 Task 4 — System A retiren (TERMIN: vor 01.07)
- System A (`cron/monatsabrechnung`, `0 2 1 * *`, kein last-day-guard) schreibt dieselbe `claims.lead_preis_*` + `gutachter_monatsabrechnungen`. System B (`abrechnung-erstellen`) ist prod-live → Ende Juni Doppel-Bill-Risiko.
- **Schritte:** (1) ~28.–30.06 `node scripts/diff-abrechnung-crons.mjs --monat 2026-06` (Shadow-Mode-OK erwarten). (2) Legacy `gutachter_monatsabrechnungen` (CLM-2026-00222 `lead_preis_netto`→NULL empfohlen, Aaron-Entscheidung). (3) **VPS-Crontab `…/api/cron/monatsabrechnung` raus vor 01.07** (Aaron-Go; `crontab -l | grep monatsabrechnung` → leer). (4) `monats-abrechnungen` (Bindestrich) = Marketing+Kanzlei → BEHALTEN.
- **➕ Hier mit-erledigen:** die SV-`CMNDO-`-Rechnungsnummer-Serie in `abrechnung-erstellen/route.ts:171` auf den atomaren `nextRechnungsNrRaw` umstellen (in W1.4 bewusst ausgeklammert, weil W1.1's aktive Datei).

### 🔵 W1.3 / AAR-947 — Paket-/Betrags-Taxonomie (BRAUCHT AARON-ENTSCHEIDUNG)
- `standard`/`pro` (DB) vs `starter-10`/`standard-25`/`premium-50` (Code, 750/1875/3750€); pro-Anzahlung **3.000/3.570€** (`sv_onboarding_rechnungen`) vs **3.750€** (`finance_eintraege`).
- **Blocker:** Aaron muss EINE Quelle der Wahrheit + die korrekten Beträge festlegen — dann konsistent über Tabellen + Code-Konstanten ziehen. Pricing → nicht raten.

### 🟡 W3.3 / AAR-954 — database.types.ts Full-Regen (RUHIGES FENSTER)
- Die Types hinken dem Live-Schema breit hinterher (Multi-Session-„defer-Regen"-Muster). EIN koordinierter `generate_typescript_types`-Full-Regen + tsc-Fallout fixen + obsolete any-Casts/Phantom-Typen strecke-weit aufräumen.
- **Gate:** ruhiges Fenster (keine andere Session regeneriert/migriert gleichzeitig — sonst Merge-Konflikt + Stale-Diff). Idealerweise EOD, wenn parallele Sessions auslaufen.

### 🟡 W3.2 / AAR-953 — Tote Tabellen + Seeds + Smoke-Reste (ZULETZT)
- 0-Zeilen-/Legacy-Tabellen labeln + Totes droppen; `finance_eintraege` 5 Stale-Seeds (seit April); `abrechnungen` Smoke-Reste; + **die 24 stale `sla_tracking`-Smoke-Rows + 9 Smoke-Claims aus W3.1** mit-bereinigen.
- **Gate:** nach W1/W2; insb. `gutachter_monatsabrechnungen` erst nach W1.1 Task 4. Post-Drop-Smoke alle Portale Pflicht.

---

## 3 · Gotchas / Lessons (diese Session)
- **Nach PR-Merge keine Commits mehr auf den Branch pushen.** GitHub re-mergt nicht → Commit strandet (passiert mit `e85424aa5`/#2265). Immer neue PR / Cherry-Pick auf frisches staging.
- **`database.types.ts` = Multi-Session-Collision-Hotspot.** Bei Schema-Änderung: targeted Edit (nur betroffene Tabellen) ODER lokaler any-Cast bis zum koordinierten Full-Regen (W3.3) — NIE mitten in paralleler Arbeit full-regenerieren.
- **Prod-Deploy via VPS verifizieren** (Aaron-Root-Override): `python scripts/vps-ssh-exec.py` mit `VPS_SSH_PASSWORD` + `PYTHONIOENCODING=utf-8` (pm2-Box-Zeichen). Prod = `/var/www/claimondo-v2` (Standalone-Build, kein .git) → Deploy prüfen über Build-mtime + `grep -rl <signatur> .next/server --include=*.js`.
- **DROP-Gate-Reihenfolge:** Reader-Sweep (Code, generisch wie `position` kontext-genau) + Info-Loss-Gate (Daten migriert?) + DB-Deps (Views/Indexe/Funktionen/Policies) + Prod-Deploy + Prod-Error-Log → DANN Drop. Bei W2.2/W2.3 gelebt.
- **Build exit-code-sicher:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (kein `| tail`, das maskiert den Exit).

---

## 4 · Artefakt-Index
| Was | Wo |
|---|---|
| PRs diese Session | #2226 #2232 #2234 #2237 #2245 (alle merged), **#2265 (offen, Types)** |
| Migrationen | `20260602081438` (W2.2 sv_organisation-Drop), `20260602092656` (W2.3 PR2 profiles-HR-Drop) |
| Smoke-/Befund-Docs | `docs/02.06.2026/aar950-w2.2-org-modell-entdoppeln.md`, `aar951-w2.3-pr2-profiles-hr-drop.md`, `aar952-w3.1-sla-triage.md` |
| Linear | AAR-943 (Parent); Subs AAR-944…954; Detail-Kommentare je Issue |
| Branches | `kitta/aar-949-create-makler`, `…aar-950-org-modell-entdoppeln`, `…aar-948-rechnungsnr-counter`, `…aar-952-sla-triage`, `…aar-951-payroll-pr2-drop` (merged), `…aar-951-pr2-types-followup` (#2265), `…personal-cleanup-eod-2` (dieses Doc) |
| Memory | `project_personal_cleanup_w1.md` |

---

## 5 · Nächste-Session-Kickoff
1. **#2265 mergen lassen** (Types) → AAR-951 komplett.
2. **W3.3** (Full-Regen) im ruhigen Fenster fahren.
3. **W1.1 Task 4** ~28.06 (Termin) — inkl. SV-CMNDO--Atomisierung.
4. **W1.3** sobald Aaron-Pricing-Entscheidung da.
5. **W3.2** zuletzt.
6. Pro Item: off `origin/staging`, Migration via Plugin, Build exit-code-sicher, PR gegen staging, AAR-Sub updaten.
