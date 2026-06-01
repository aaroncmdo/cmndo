# HANDOFF — Personal-Cleanup-Strecke (Anlage + Abrechnung)

- **Datum:** 2026-06-01
- **Linear-Strecke:** **AAR-943** (Parent) + AAR-944…953 (10 Subs)
- **Branch:** `kitta/personal-cleanup` (⟵ `staging`), Worktree `.claude/worktrees/personal-cleanup`
- **Quelle:** Audit `docs/01.06.2026/personal-audit-anlage-abrechnung.md` (PR #2173, merged) + `scripts/probe-anon-sv-leak.mjs`
- **Umbrella-Spec:** `docs/superpowers/specs/2026-06-01-personal-cleanup-design.md`
- **DB:** `paizkjajbuxxksdoycev` (Prod, shared — viele parallele Sessions)

> ⚠️ **Erste Amtshandlung der Folge-Session:** Live-Zustand re-verifizieren (`information_schema` + Counts). Alle Zahlen hier sind Stand 2026-06-01 und können durch andere Sessions/neue Daten gedriftet sein.

---

## 0 · TL;DR

Aus dem Personal-Audit (10 Befunde) wurde eine sequenzierte Remediation-Strecke (4 Wellen). **W0.1 (CRITICAL anon-Leak) ist erledigt & verifiziert.** **W1.1 (Billing-System-Drift) ist vollständig root-caused + ein Plan liegt.** Der Rest (W1.2–W3.2) ist Backlog — **alles pre-launch-unkritisch** (Stripe-Testmodus, kein echtes Geld, fast keine abgeschlossenen Fälle).

Kernerkenntnis der ganzen Strecke: **Die Abrechnungsschicht ist massiv übergebaut (≈12 Tabellen-Familien) aber operativ vor-Launch.** Aufräumen ist jetzt billig (leere Tabellen, kein Live-Geld) — der ideale Zeitpunkt.

---

## 1 · Strecke-Status

| Item | Linear | Schwere | Status |
|---|---|---|---|
| **W0.1** anon-Leak `sachverstaendige` | AAR-944 | 🔴 | ✅ **DONE** (PR #2177, verifiziert) |
| **W1.1** System-A/-B Billing-Drift | AAR-945 | 🟠 | 🔬 **root-caused + Plan** (Execution offen) |
| **W1.2** `abrechnungen.empfaenger` → FK | AAR-946 | 🟠 | ⬜ Backlog |
| **W1.3** Paket-/Betrags-Taxonomie | AAR-947 | 🟠 | ⬜ Backlog |
| **W1.4** Rechnungsnummern-Counter | AAR-948 | 🟠 | ⬜ Backlog |
| **W2.1** Makler-Anlage (`createMakler`) | AAR-949 | 🟠 | ⬜ Backlog |
| **W2.2** Org-Modell entdoppeln | AAR-950 | 🟠 | ⬜ Backlog |
| **W2.3** Payroll → admin-only Tabelle | AAR-951 | 🟡 | ⬜ Backlog |
| **W3.1** SLA 24/26 breached triagieren | AAR-952 | 🟡 | ⬜ Backlog |
| **W3.2** Tote Tabellen/Seeds/Smoke | AAR-953 | 🟡 | ⬜ Backlog |

---

## 2 · Erledigt

### W0.1 — anon-Leak `sachverstaendige` 🔴 ✅
- **Problem:** Public-Map-RLS gab `anon` ganze Zeilen → Probe belegte: 1× lebendes Google-OAuth-Token, 3× `stripe_customer_id`, 2× `ust_id`.
- **Gelöst via PR #2177** (Parallel-Session, getriggert vom Audit) mit **Spalten-Grant-Ansatz** (nicht dem ursprünglich geplanten View): `anon` SELECT nur auf 9 Karten-Spalten, table-weiter Grant entzogen, Legacy `gcal_*` genullt. Migrationen `20260601174958` + `20260601180648` auf staging → kein Twin-Drift.
- **Von mir verifiziert:** `node scripts/probe-anon-sv-leak.mjs` → `42501 permission denied` auf sensible Spalten; Karte läuft (Grant == `ladeAktiveSVs`-Select).
- **Residual (Aaron, deprioritisiert):** Google-Grant des betroffenen SV rotieren — Token war exponiert. Aaron 01.06.: „nicht so wild gerade".

---

## 3 · In Arbeit / geplant

### W1.1 — SV-Billing-System-Drift 🟠 🔬 (Plan: `docs/superpowers/plans/2026-06-01-personal-cleanup-w1.1-billing-pipeline.md`)

**Root Cause (vollständig, in AAR-945 dokumentiert):**
1. Im VPS-Crontab laufen **beide** SV-Billing-Systeme: System A `monatsabrechnung` (`0 2 1 * *`, schreibt `gutachter_monatsabrechnungen`, **@deprecated AAR-925** aber Crontab-Zeile nie entfernt) **und** System B `abrechnung-erstellen` (`30 18 28-31`, schreibt `abrechnungen`, kanonisch).
2. A und B sind **verschiedene Preismodelle** (A = paket €200/Fall; B = per-Fall lead_preis − Werbebudget). **Entscheidung Aaron: B ist kanonisch.**
3. B produziert real ~nichts, **primär wegen Daten-Reife**: nur **2/76 Claims** haben `schadens_hoehe_netto > 0` (kommt aus dem Gutachten); `processCaseBilling` skippt ohne Schadenhöhe. Pre-launch.
4. **Latente Struktur-Bugs** (beißen sobald Fälle real abschließen): `created_at`-Monatsgate in `abrechnung-erstellen` verfehlt später-abgeschlossene Fälle; `isCaseInKontingent` zählt am Erstell- statt Fakturierungsmonat; möglicher SSoT-Desync `lead_preis_netto` (faelle-Schreib vs claims-Lese — in V1 zu klären).

**Plan-Tasks:** Pre-Flight V1 (SSoT klären) → Task 1 (billing-window-Fix, safe) → Task 2 (Kontingent-Monat, **preis-sensitiv → Aaron-Gate**) → Task 3 (Schreib/Lese-Konsistenz, bedingt) → Task 4 (Retire A: Crontab-Zeile, Legacy-Zeilen, stale Diff-Script fixen, `monats-abrechnungen` charakterisieren, **Prod-Go nötig**).

**Wichtig:** Schlüssel-Dateien — `src/lib/abrechnung/process-case-billing.ts:94` (Writer), `src/lib/abrechnung/calculate-lead-price.ts:41` (Kontingent), `src/app/api/cron/abrechnung-erstellen/route.ts:95` (Billing-Query), `src/app/api/cron/case-billing-batch/route.ts` (Backstop, täglich 17:00, fängt Status-Bypässe). `scripts/diff-abrechnung-crons.mjs` ist **stale** (Spalten `brutto_endbetrag`/`anzahl_faelle` existieren nicht mehr).

---

## 4 · Backlog (alle pre-launch-unkritisch — Stand-Befunde aus dem Audit)

### W1.2 — `abrechnungen.empfaenger` → typisierte FK (AAR-946) 🟠
Polymorph (`empfaenger_typ`+`empfaenger_id`) **ohne FK**; 2/3 vorhandene Zeilen (alle SMOKE) haben `empfaenger_id = NULL`. Auf die Tabelle zeigen `makler_provisionen.abrechnung_id` + `embed_abrechnung_positionen.abrechnung_id`. **Nächster Schritt:** 3 SMOKE-Zeilen löschen, dann typisierte FK-Spalten je Empfängerart *oder* CHECK + Trigger-Guard. Pre-launch → billig.

### W1.3 — Paket-/Betrags-Taxonomie (AAR-947) 🟠
`standard`/`pro` (DB) vs `starter-10`/`standard-25`/`premium-50` (Code, 750/1875/3750€); pro-Anzahlung **3.000€/3.570€** (`sv_onboarding_rechnungen`) vs **3.750€** (`finance_eintraege`). **Nächster Schritt:** eine Quelle der Wahrheit definieren, konsistent über Tabellen + Code-Konstanten.

### W1.4 — Rechnungsnummern-Counter (AAR-948) 🟠
3 Schemata (`CMNDO-`, `CMNDO-K-`, `CM-ONB-`) per inline-COUNT/LIKE; `rechnungs_nr_counter`-Tabelle ungenutzt. **Nächster Schritt:** zentrale atomare Vergabe (`UPDATE…RETURNING` / SECDEF-Funktion) für alle 3 Serien (GoBD-Lückenlosigkeit).

### W2.1 — Makler-Anlage `createMakler` (AAR-949) 🟠
Kein Anlage-Pfad für `rolle='makler'` (1 existiert manuell/Seed), aber `makler_provisionen`-Maschinerie gebaut. **Nächster Schritt:** `createMakler()` analog `createMitarbeiter` (`src/app/admin/team/actions.ts:28`), erreichbar via admin/team.

### W2.2 — Org-Modell entdoppeln (AAR-950) 🟠
`organisationen` (vom Anlage-Code beschrieben) vs `sv_organisation`+`sv_organisation_memberships`+`sv_organisation_laeufer_reports` (alle 0 Zeilen, kein Writer). **Nächster Schritt:** `sv_organisation*` droppen (Reader-Sweep + Post-Drop-Smoke), `organisationen` behalten.

### W2.3 — Payroll auslagern (AAR-951) 🟡
`gehalt_brutto`/`gehaltsstufe`/`position`/`eingestellt_am` auf `profiles`, via `staff_read_all` (`is_staff()` = admin+kundenbetreuer+dispatch) staff-lesbar. Heute leer → latent. **Nächster Schritt:** admin-only Tabelle `mitarbeiter_verguetung` (RLS `is_admin()`), Spalten migrieren+droppen. Optional: 2FA-Pflicht interne Rollen.

### W3.1 — SLA-Triage (AAR-952) 🟡
24 von 26 `sla_tracking` = `breached`, 0 completed. **Nächster Schritt:** Ursache klären (Test-Rauschen vs Cron-Über-Flagging vs echte Ops-Lücke). Evtl. kein Code-Change.

### W3.2 — Tote Tabellen/Seeds/Smoke (AAR-953) 🟡 — **ZULETZT**
0-Zeilen-/Legacy-Tabellen labeln + Totes droppen; `finance_eintraege` 5 Stale-Seeds (offen seit April); `abrechnungen` SMOKE-Reste. **Nach W1/W2** (nichts droppen, das W1/W2 noch braucht). Post-Drop-Smoke alle Portale Pflicht.

---

## 5 · Querschnitts-Befunde / Gotchas (für die nächste Session wichtig)

- **Abrechnung = Pre-Launch:** Stripe `cs_test_` (Testmodus), kein Live-Geld. Einzige echte Geldspur-Struktur: `sv_onboarding_rechnungen` (4 Stripe-Test-Rechnungen). Alle anderen Billing-Tabellen leer oder Smoke/Seed.
- **Daten-Snapshot (2026-06-01, re-verifizieren!):** profiles 141 (kunde 119, SV 9, admin 5, dispatch 3, kundenbetreuer 2, kanzlei 2, makler 1); sachverstaendige 10 (7 verifiziert); claims 76 (nur 2 mit Schadenhöhe, 1 mit lead_preis); abrechnungen 3 (SMOKE); gutachter_monatsabrechnungen 2 (echt, System A).
- **Privileg-Guards sind solide** (Trigger `guard_profiles_rolle`, `guard_sachverstaendige_privilegien`) — Self-Eskalation ist dicht. Anlage-Flows alle admin-client-basiert (kein Rollen-Spoofing).
- **Regel 2 lebt:** Vor jeder Migration `list_migrations` prüfen (W0.1-Kollision zeigte: andere Sessions wenden parallel getrackte Migrationen an). DDL nur via Plugin; `execute_sql` nur READ; Migration-File == getrackte Version.
- **Lektion W0.1:** Eine Parallel-Session fixte den Leak gleichzeitig auf `kitta/fix-anon-sv-leak`. Vor Prod-DDL immer Live-State + `list_migrations` + offene PRs prüfen.

---

## 6 · Artefakt-Index

| Was | Wo |
|---|---|
| Audit | `docs/01.06.2026/personal-audit-anlage-abrechnung.md` (PR #2173) |
| Probe-Script | `scripts/probe-anon-sv-leak.mjs` |
| Umbrella-Spec | `docs/superpowers/specs/2026-06-01-personal-cleanup-design.md` |
| W0.1-Plan (historisch) | `docs/superpowers/plans/2026-06-01-personal-cleanup-w0.1-anon-leak.md` |
| W1.1-Plan | `docs/superpowers/plans/2026-06-01-personal-cleanup-w1.1-billing-pipeline.md` |
| Linear | AAR-943 (Parent) + AAR-944…953 (Detail-Comments in AAR-944/945) |
| Branch | `kitta/personal-cleanup` (Commits bis `bf8ac9cab`) |

---

## 7 · Nächste-Session-Kickoff (konkrete erste Schritte)

1. **Worktree/Branch:** auf `kitta/personal-cleanup` weiterarbeiten (oder frischen Worktree daraus). Beim Start: andere aktive Sessions + Branch melden (Kollisions-Regel).
2. **Live re-verifizieren** (read-only): die Counts aus §5 + `list_migrations` (Drift seit 01.06.?).
3. **Entscheiden, welche Spur:**
   - **Wenn Billing-Launch näher rückt → W1.1 umsetzen** nach dem Plan: Pre-Flight V1 (SSoT) → Task 1 (safe Fix) → Task 2 (Aaron-Pricing-Gate) → Task 3 → Task 4 (Prod-Crontab-Go).
   - **Sonst pre-launch-Cleanup → W1.2** (empfaenger-FK, klein & safe) als nächstes, dann W1.4 / W2.1 / W2.2; **W3.2 zuletzt**.
4. **Pro Item:** Einzel-Spec + Plan (writing-plans) → PR gegen `staging` → smoken → AAR-Sub-Issue auf Done.
5. **Nichts ist dringend** — Reihenfolge nach Schwere, aber kein Zeitdruck (pre-launch). Sauberkeit > Tempo.
