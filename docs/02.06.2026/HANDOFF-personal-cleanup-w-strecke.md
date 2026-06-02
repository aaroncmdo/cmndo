# HANDOFF — Personal-Cleanup-W-Strecke (EOD 2026-06-02)

- **Strecke:** **AAR-943** (Parent) + AAR-944…953 (10 Subs) — Quelle: Audit `docs/01.06.2026/personal-audit-anlage-abrechnung.md` (PR #2173, merged)
- **Vorgänger-Handoff:** `docs/01.06.2026/HANDOFF-personal-cleanup-strecke.md`
- **Umbrella-Spec:** `docs/superpowers/specs/2026-06-01-personal-cleanup-design.md`
- **W1.1-Plan:** `docs/superpowers/plans/2026-06-01-personal-cleanup-w1.1-billing-pipeline.md`
- **DB:** `paizkjajbuxxksdoycev` (Prod, shared — viele parallele Sessions)
- **Aaron-Direktive 01.06.:** **ALLE W-Tickets sollen umgesetzt werden** (intern: Kundenbetreuer/Dispatch inklusive).

> ⚠️ **Erste Amtshandlung der Folge-Session:** Live-Zustand re-verifizieren (`information_schema` + `list_migrations` + Counts). Alle Zahlen hier sind Stand 2026-06-02 ~00:30 und können durch andere Sessions gedriftet sein. Folge-Arbeit IMMER off `origin/staging` basieren (Squash-Divergenz der gemergten Branches).

---

## 0 · TL;DR

5 PRs in dieser Session, alle build-grün. **Billing-Schicht (W1.1+W1.2) und der interne-Personal-Leak (W2.3 PR1) sind adressiert.** Rest der W-Strecke (W1.3/W1.4/W2.1/W2.2/W3.1/W3.2 + zwei gated Drops) ist sauber gescoped und offen. Alles pre-launch-unkritisch (Stripe-Testmodus, kein echtes Geld), **aber zwei Termin-Gates:** System-A-Crontab vor 01.07, und W2.3-PR2-Drop erst nach PR1-Prod-Deploy.

---

## 1 · Status — ALLE Items

| Item | Linear | Schwere | Status |
|---|---|---|---|
| **W0.1** anon-Leak `sachverstaendige` | AAR-944 | 🔴 | ✅ DONE (PR #2177, vor dieser Session) |
| **W1.1** SV-Billing-Pipeline | AAR-945 | 🟠 | ✅ **Task 1+2 LIVE** (#2189→Release #2194 prod), Task 3 obsolet, **Task 4 offen** (s.u.) |
| **W1.2** `abrechnungen.empfaenger` FK | AAR-946 | 🟠 | ✅ **PR #2206** (Trigger-Guard + SMOKE-cleanup) — offen/review |
| **W2.3** Payroll → admin-only | AAR-951 | 🟡 | 🟡 **PR1 #2214** (Tabelle+Repoint) — offen/review; **PR2 (Drop) gated** |
| **W1.3** Paket-/Betrags-Taxonomie | AAR-947 | 🟠 | ⬜ offen — **braucht Aaron-Pricing-SSoT-Entscheidung** |
| **W1.4** Rechnungsnummern-Counter | AAR-948 | 🟠 | ⬜ offen |
| **W2.1** Makler-Anlage `createMakler` | AAR-949 | 🟠 | ⬜ offen (additiv) |
| **W2.2** Org-Modell entdoppeln | AAR-950 | 🟠 | ⬜ offen (`sv_organisation*` droppen) |
| **W3.1** SLA-Triage | AAR-952 | 🟡 | ⬜ offen (evtl. kein Code) |
| **W3.2** Tote Tische/Seeds | AAR-953 | 🟡 | ⬜ offen — **ZULETZT** (nach W1/W2) |

---

## 2 · Diese Session erledigt (5 PRs, alle build-grün)

### W1.1 — SV-Billing (AAR-945)
- **Pre-Flight V1:** KEIN Schreib/Lese-Desync. `processCaseBilling` schreibt `lead_preis_*` via `CLAIM_OWNED_DUPLICATE_COLUMNS` auf **claims**; `v_faelle_mit_aktuellem_termin` liest `c.lead_preis_netto`. → **Task 3 obsolet.**
- **Task 1** (`#2189` → Release `#2194`, **prod-live verifiziert**, Route `/api/cron/abrechnung-erstellen` = 401): `abrechnung-erstellen` fakturiert über `abrechnung_id IS NULL` statt `created_at`-Monat. Live belegt an CLM-2026-00222.
- **Task 2** (im selben #2189): `isCaseInKontingent` zählt Kontingent am **Fakturierungsmonat** (`claims.lead_preis_berechnet_am`, `now()`) statt Erstellmonat. Aaron-Entscheidung (b).
- **Task 4 Step 2** (`#2202`, build grün nach Flake-Rerun): `scripts/diff-abrechnung-crons.mjs` repariert (Phantom-Spalten `brutto_endbetrag`/`anzahl_faelle` → `gesamtbetrag` + `faelle_im_paket/_einzel`; Reife = Coverage + Fall-Zahl, nicht Betrag).

### W1.2 — `abrechnungen.empfaenger` (AAR-946, PR #2206)
Trigger-Guard `guard_abrechnungen_empfaenger` (Mig `20260601210530`): `sv`→`empfaenger_id` NOT NULL + ∈ sachverstaendige∪organisationen; `makler`→NOT NULL; `marketing`/`kanzlei`→email-keyed (NULL ok). 3 SMOKE-Zeilen gelöscht (0 Child-Refs).

### W2.3 — Payroll PR1 (AAR-951, PR #2214)
Admin-only Tabelle `mitarbeiter_verguetung` (RLS `is_admin()`, Mig `20260601225853`) + `/admin/team`-UI-Repoint (page/[id]/actions). `MitarbeiterDetail`/`TeamClient` unverändert (lesen flach). `database.types.ts` wegen Datei-Collision via 4 any-Casts überbrückt → Type-Regen in PR2.

---

## 3 · OFFENE AUFGABEN (präzise, mit Gates)

### ⏰ W1.1 Task 4 — System A retiren (TERMIN: vor 01.07)
System A `cron/monatsabrechnung` (`0 2 1 * *`, **kein** last-day-guard, läuft am 1. produktiv) schreibt dieselbe `claims.lead_preis_*`-Spalte + `gutachter_monatsabrechnungen`. Task 1 ist prod-live → System B fakturiert Ende Juni (28.–31.) auch von A bepreiste Fälle = **Doppel-Bill**. Schritte:
1. **~28.–30.06** nach `abrechnung-erstellen`-Lauf: `node scripts/diff-abrechnung-crons.mjs --monat 2026-06` → „Shadow-Mode-OK" (Coverage + Fall-Zahl) erwarten.
2. **Legacy:** 2 `gutachter_monatsabrechnungen`-Zeilen (Mai €400 `ueberfaellig` sv `677400bf`; Juni €200 `offen` sv `7f79…` = CLM-2026-00222). CLM-2026-00222 hat **keine** echte Schadenhöhe → Empfehlung `claims.lead_preis_netto`→NULL (sonst re-fakturiert B es ohne Gutachtenwert). **Aaron-Entscheidung.**
3. **VPS-Crontab** `0 2 1 * * …/api/cron/monatsabrechnung` entfernen **vor 01.07** (Prod, Aaron-Go). Verify: `crontab -l | grep monatsabrechnung` → leer.
4. `monats-abrechnungen` (mit Bindestrich) = Marketing(Maik)+Kanzlei-Billing → **BEHALTEN** (kein System A).

### 🔒 W2.3 PR2 — profiles-Spalten droppen (gated auf PR1 #2214 prod-live)
Erst NACHDEM #2214 gemergt + prod-deployed ist (sonst bricht Live-Prod, das die Spalten noch liest):
1. `position`-Reader-Sweep über ganzes `src/` (generischer Spaltenname — vor Drop verifizieren, dass NUR `/admin/team` sie las; `gehalt_brutto`/`gehaltsstufe`/`eingestellt_am` waren laut grep nur dort).
2. Migration: `ALTER TABLE profiles DROP COLUMN gehalt_brutto, gehaltsstufe, position, eingestellt_am`.
3. `database.types.ts` regenerieren (dann die **4 any-Casts** in `admin/team/page.tsx`, `[id]/page.tsx`, `actions.ts` durch echte Typen ersetzen — Suchstring `eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tabelle noch nicht in database.types.ts`).
4. Post-Drop-Smoke: `/admin/team` Liste + Detail + Mitarbeiter-Edit (alle Portale-Pflicht nach Drop).

### W1.3 — Paket-/Betrags-Taxonomie (AAR-947) — ⚠️ BRAUCHT AARON-ENTSCHEIDUNG
`standard`/`pro` (DB) vs `starter-10`/`standard-25`/`premium-50` (Code, 750/1875/3750€); pro-Anzahlung **3.000€/3.570€** (`sv_onboarding_rechnungen`) vs **3.750€** (`finance_eintraege`). **Aaron muss EINE Quelle der Wahrheit + die korrekten Beträge festlegen**, dann konsistent über Tabellen + Code-Konstanten ziehen. (Pricing-relevant → nicht raten.)

### W1.4 — Rechnungsnummern-Counter (AAR-948)
3 Schemata (`CMNDO-`, `CMNDO-K-`, `CM-ONB-`) per inline-COUNT/LIKE; `rechnungs_nr_counter`-Tabelle ungenutzt. → zentrale atomare Vergabe (`UPDATE…RETURNING` / SECDEF-Funktion) für alle 3 Serien (GoBD-Lückenlosigkeit). Migration + Writer-Repoint.

### W2.1 — Makler-Anlage `createMakler` (AAR-949)
Kein Anlage-Pfad für `rolle='makler'` (1 existiert manuell/Seed), aber `makler_provisionen`-Maschinerie gebaut. → `createMakler()` analog `createMitarbeiter` (`src/app/admin/team/actions.ts:28`), erreichbar via admin/team. Rein additiv (Code). **Hinweis:** W1.2-Trigger erwartet bei künftigen `abrechnungen` mit `empfaenger_typ='makler'` ein `empfaenger_id` NOT NULL (Ziel-Tabelle hier definieren).

### W2.2 — Org-Modell entdoppeln (AAR-950)
`organisationen` (vom Anlage-Code beschrieben, von `abrechnung-erstellen`-Sammelrechnung genutzt) vs `sv_organisation`+`sv_organisation_memberships`+`sv_organisation_laeufer_reports` (alle 0 Zeilen, kein Writer). → `sv_organisation*` droppen (Reader-Sweep + Post-Drop-Smoke), `organisationen` behalten. **Live re-verifizieren** ob noch 0 Zeilen / keine Reader (andere Sessions).

### W3.1 — SLA-Triage (AAR-952)
24 von 26 `sla_tracking` = `breached`, 0 completed. → Ursache klären (Test-Rauschen vs Cron-Über-Flagging vs echte Ops-Lücke). Evtl. kein Code-Change, nur Doku/Daten-Cleanup.

### W3.2 — Tote Tische/Seeds (AAR-953) — ZULETZT
0-Zeilen-/Legacy-Tabellen labeln + Totes droppen; `finance_eintraege` 5 Stale-Seeds (offen seit April); `abrechnungen` ist nach W1.2 leer. **Nach W1/W2** (nichts droppen, das W1/W2 noch braucht; insb. `gutachter_monatsabrechnungen` erst nach W1.1 Task 4). Post-Drop-Smoke alle Portale Pflicht.

---

## 4 · Gotchas / Lessons (für die nächste Session)

- **Build-Exit-Maskierung:** `npm run build 2>&1 | tail` gibt **tail**s Exit (0) zurück, nicht npms → ein fehlgeschlagener Typecheck rutscht durch. IMMER `npm run build > log 2>&1; code=$?; tail -25 log; exit $code`. (In dieser Session 1× passiert: W2.3 page.tsx:42 implicit-any → broken commit gepusht, dann sauber amended/force-pushed.)
- **`database.types.ts` ist Dauer-Collision-Hotspot** (mehrere Sessions regenerieren). Wenn der Datei-Kollisions-Hook blockt: NICHT die ganze Datei regenerieren (Pollution + Konflikt), sondern entweder gezielt die eine Tabelle ergänzen ODER (wie hier) lokalen any-Cast bis zum nächsten Regen. Casts in W2.3 PR2 aufräumen.
- **Worktree-Build:** `NODE_OPTIONS=--max-old-space-size=8192` Pflicht (TS-Phase OOMt sonst). Worktree braucht eigenes node_modules (hier: personal-cleanup-Worktree hatte aus W1.1 welches).
- **Regel 2 strikt eingehalten:** alle 3 Migrationen via Plugin `apply_migration`, Version danach abgelesen, File == getrackte Version (`20260601210530`, `20260601225853`).
- **Shared-DB:** vor jeder Migration `list_migrations` (andere Sessions tracken parallel).

---

## 5 · Artefakt-Index

| Was | Wo |
|---|---|
| Audit | `docs/01.06.2026/personal-audit-anlage-abrechnung.md` (#2173) |
| Umbrella-Spec | `docs/superpowers/specs/2026-06-01-personal-cleanup-design.md` |
| W1.1-Plan | `docs/superpowers/plans/2026-06-01-personal-cleanup-w1.1-billing-pipeline.md` |
| Vorgänger-Handoff | `docs/01.06.2026/HANDOFF-personal-cleanup-strecke.md` |
| PRs diese Session | #2189 (merged via #2194), #2202, #2206, #2214 |
| Migrationen | `20260601210530` (W1.2 guard), `20260601225853` (W2.3 verguetung) |
| Linear | AAR-943 (Parent), Detail-Kommentare in AAR-945/946/951 |
| Branches | `kitta/personal-cleanup` (W1.1 Task1+2, gemergt), `kitta/aar-945-retire-system-a` (#2202), `kitta/aar-946-empfaenger-fk` (#2206), `kitta/aar-951-payroll-verguetung` (#2214), `kitta/personal-cleanup-eod-handoff` (dieses Doc) |

---

## 6 · Nächste-Session-Kickoff

1. **Live re-verifizieren:** `list_migrations` (Drift?), Counts aus dem Vorgänger-Handoff §5, + ob #2206/#2214 gemergt+deployed sind.
2. **Merge-Reihenfolge beachten:** #2214 (W2.3 PR1) muss prod-live sein, BEVOR W2.3 PR2 (Drop) gebaut wird.
3. **Reihenfolge der offenen Tickets** (Vorschlag, alle pre-launch): W2.1 (additiv, risikolos) → W2.2 (Drop dead 0-Zeilen) → W1.4 (Counter) → W3.1 (Triage) → W2.3 PR2 (nach Deploy) → W1.1 Task 4 (~28.06, Termin) → **W1.3 (sobald Aaron-Pricing-Entscheidung da)** → W3.2 (zuletzt).
4. **Pro Item:** Migration via Plugin + PR gegen `staging` + Build Exit-Code-sicher + AAR-Sub auf Done.
5. **Nichts ist akut dringend** außer dem System-A-Crontab-Termin (vor 01.07). Sauberkeit > Tempo (siehe Build-Lesson).
