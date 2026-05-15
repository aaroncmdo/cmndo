# Folge-Tickets aus Audit-Strecke AAR-921..929

**Datum:** 2026-05-15
**Status:** Linear MCP gerade down — diese MD ist Backup, Tickets nachträglich anlegen sobald MCP wieder läuft.

---

## 1. SV-Lead-Ablehnung-Pfad

**Folge aus:** AAR-926 (PR #1316). Audit `docs/12.05.2026/abrechnung-audit.md` Abschnitt 2: „SV lehnt Lead ab" hat aktuell **keinen Code-Pfad**. SV bezahlt für nicht-angenommene Leads, kein Revert, Werbebudget bleibt belastet.

**Akzeptanz:**
- [ ] Neue Server-Action `lehneLeadAb(fallId, grund)` in `src/lib/actions/storno-actions.ts`
- [ ] Voraussetzungen: SV ist `sv_id`, Status ∈ {`sv-zugewiesen`, `sv-termin`}, Grund min. 20 Zeichen oder Enum
- [ ] State-Machine-Erweiterung: `sv-zugewiesen` → `sv-gesucht` UND `sv-termin` → `sv-gesucht` mit metadata `lead_abgelehnt_typ`
- [ ] revertCaseBilling-Trigger wenn `lead_preis_netto` schon gesetzt
- [ ] UI-Trigger im SV-Portal-Fallakte: Button „Lead ablehnen" mit Grund-Dropdown
- [ ] Dispatch-Task: bei Ablehnung „SV X hat Lead Y abgelehnt — neuen SV zuweisen"

**Priorität:** Medium

---

## 2. cron/abrechnung-reminder sendet keine Email

**Folge aus:** AAR-927 (PR #1321). Beim Implementieren der Post-Fälligkeit-Mahnung gefunden: der bestehende Cron `src/app/api/cron/abrechnung-reminder/route.ts` (T-7/T-3/T-1 Pre-Fälligkeit) schreibt `abrechnung_reminders`-Rows, **sendet aber keine Email**. SVs werden vor Fälligkeit nicht erinnert, Auto-Einzug trifft sie unangekündigt.

**Akzeptanz:**
- [ ] Email-Send einbauen in `src/app/api/cron/abrechnung-reminder/route.ts` nach dem `abrechnung_reminders`-Insert
- [ ] Bestehendes Template `src/lib/email/google/templates/AbrechnungReminder.tsx` nutzen (`AbrechnungReminderEmail`-Komponente existiert bereits ungenutzt)
- [ ] Tier-spezifisches Subject aus `subject(props)`-Function des Templates
- [ ] Send vor Insert: bei Fail kein Insert (analog AAR-927-Pattern), damit nächster Cron-Lauf retried
- [ ] Smoke: Test-Abrechnung mit `faellig_am = now() + 5 days` → Cron triggert T-7 → Email versendet

**Priorität:** Medium

---

## 3. Finance-Hub Erweiterungen — Dashboard-KPI + 3-Monats-Trend

**Folge aus:** AAR-928 (PR #1334). Zwei Akzeptanzkriterien aus dem Original-Ticket bewusst NICHT in der PR enthalten weil sie anderen Surface bzw. mehr Aufwand brauchen.

**Akzeptanz:**

### Dashboard-KPI-Karte
- [ ] Neue Card auf `/admin/dashboard` mit Count säumiger SV-Abrechnungen + Summe `summe_brutto`
- [ ] Click → Navigation zu `/admin/finance/saeumige-svs`
- [ ] Claimondo-Tokens, `StatCard` aus `shared/*` wenn passend
- [ ] Admin-only via bestehender Dashboard-Auth

### 3-Monats-Trend-Chart
- [ ] Erweiterung der `/admin/finance/per-sv-balance`-Page
- [ ] Pro SV: 3-Monats-Datenreihe `summe_brutto` aus `abrechnungen`
- [ ] Chart-Library: nur was schon im Codebase ist
- [ ] Empty-Handling für SVs ohne Aktivität
- [ ] Optional: Trend als Modal/Side-Panel statt inline

**Priorität:** Low

---

## 4. Stripe-Reconcile Phase 2 — Auto-Heal mit Env-Var-Gate

**Folge aus:** AAR-929 (PR #1323). Phase 1 ist Drift-Report-only. Phase 2 ist der Auto-Heal-Pfad — nur aktivieren wenn Phase 1 lange genug sauber gelaufen ist.

**Akzeptanz:**
- [ ] Env-Var-Gate `STRIPE_RECONCILE_HEAL=true` als Schalter. Default false → kein Heal
- [ ] Auto-Heal nur für Drift-Typ `event_ohne_bezahlt_am`:
  - `abrechnungen.bezahlt_am` setzen auf `stripe_events.empfangen_am`
  - Audit-Log-Entry mit Drift-Detail
- [ ] KEIN Auto-Heal für `event_ohne_abrechnung` und `abrechnung_ohne_event` (zu unsicher)
- [ ] Per-Heal Admin-Email mit Details
- [ ] Staging-Smoke mit künstlich erzeugter Drift

**Voraussetzungen vor Aktivierung:**
- Phase 1 mindestens 1 Monat in Production
- Drift-Reports zeigen konsistente Muster
- Aaron-Freigabe

**Priorität:** Medium
