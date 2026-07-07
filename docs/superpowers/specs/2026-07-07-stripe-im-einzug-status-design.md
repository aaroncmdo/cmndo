# Design: `im_einzug`-Status für SEPA-Lastschriften (Abrechnungen)

**Datum:** 2026-07-07
**Branch:** `kitta/stripe-im-einzug-status` (off `staging`)
**Kontext:** Follow-up (#2-Residual) aus dem Bug-Audit-Sweep 06.07. (PR #3699 / marker `coordination-bug-audit-sweep-0706`).

## Problem

Der Lastschrift-Einzugs-Cron (`src/app/api/cron/abrechnung-einzug/route.ts`) erstellt für
fällige SV-Monatsabrechnungen einen Stripe-`PaymentIntent` mit `confirm:true, off_session:true`.

Bei **SEPA-Lastschrift** ist der Normalfall-Erststatus `pi.status === 'processing'` — die
Abbuchung ist eingereicht, settled aber erst in 2–5 Bankarbeitstagen. Der Cron behandelt
jeden Nicht-`succeeded`-Status im `else`-Zweig identisch:

```ts
// Ist-Zustand (Bug):
} else {
  // 'requires_action' (3DS) oder 'processing' — Einzug noch offen, Versuch zaehlen
  await db.from('abrechnungen').update({
    einzug_versucht_am, stripe_payment_intent_id: pi.id,
    einzug_fehler: `PaymentIntent status=${pi.status} (3DS oder verzoegert)`,
    status: 'fehlgeschlagen',            // ← falsch für 'processing'
  }).eq('id', abr.id)
  await alertAaron(abr, ...)             // ← Fehlalarm für einen normalen SEPA-Einzug
  failed++
}
```

**Folgen:**
1. Eine laufende (nicht fehlgeschlagene) Lastschrift wird als `fehlgeschlagen` dargestellt.
2. Aaron bekommt einen **Fehlalarm** für einen völlig normalen SEPA-Einzug.
3. Downstream-Crons, die „nicht bezahlt + fällig" mahnen/erinnern, würden eine **in-flight
   Lastschrift mahnen** (s. Regression-Analyse unten).

**Was KEIN Problem ist (aus dem Code verifiziert):**
- **Keine Doppelabbuchung.** Der Idempotenz-Guard mappt einen bestehenden PI vor dem
  Neu-Anlegen via `piStatusToEinzugAction` (`src/lib/finance/einzug-retry.ts`):
  `processing/requires_action/requires_confirmation/requires_capture → 'pending'` → der Cron
  lädt keinen 2. Charge, sondern bumpt nur `einzug_versucht_am`. Dieser Schutz bleibt.
- **Kein Backfill nötig.** `abrechnungen` ist auf Prod aktuell **leer** (0 Zeilen, MCP-verifiziert).
  Die Änderung wirkt rein vorwärts.

## Root Cause

`processing` (SEPA in-flight) und `fehlgeschlagen` (terminal gescheitert) werden im
`else`-Zweig zusammengeworfen. Es fehlt ein **eigener Zwischenstatus** für „Lastschrift läuft,
Ausgang noch offen" — plus die Webhook-Transition, die diesen Zwischenstatus wieder auflöst.

## Ziel-Zustandsautomat

Einzugs-PIs sind an `metadata.abrechnung_id` erkennbar.

```
Cron/Manuell erstellt PI (confirm + off_session)
   ├─ pi.status = succeeded      → status = bezahlt              (unverändert)
   ├─ pi.status = processing     → status = im_einzug   ← NEU    (kein Alarm; PI-ID + versucht_am gesetzt; einzug_fehler = null)
   └─ throw / sonstiger Status   → status = fehlgeschlagen + Alarm  (echter Fehler, unverändert)

im_einzug  ──[Webhook payment_intent.succeeded]──────→ bezahlt          (Handler existiert seit #3699)
im_einzug  ──[Webhook payment_intent.payment_failed]─→ fehlgeschlagen + Alarm   ← NEU (schließt Lücke)
im_einzug  ──[Cron-Retry-Poll, Webhook-Backstop]────→ bezahlt | (bleibt im_einzug) | fehlgeschlagen
```

Semantik der drei „offenen" Status:
- **`im_einzug`** = Geld ist unterwegs (SEPA processing). **Nicht** mahnen, **nicht** erinnern,
  **nicht** als fehlgeschlagen zählen, **nicht** manuell erneut einziehen.
- **`fehlgeschlagen`** = Einzug terminal gescheitert. Mahnen/Erinnern **weiterhin korrekt**
  (bestehendes Verhalten) — der SV muss zahlen.
- **`versendet`/`ueberfaellig`/`entwurf`** = unverändert.

## Change-Set

Alle Änderungen unter `src/`, ein PR gegen `staging`.

### 1. DB-Migration (Regel 2 — via `apply_migration`/MCP)
`abrechnungen.status` ist `text` + CHECK-Constraint (kein PG-Enum):
```
abrechnungen_status_check: CHECK (status = ANY (ARRAY[
  'entwurf','versendet','bezahlt','ueberfaellig','storniert','fehlgeschlagen']))
```
Migration: Constraint droppen + mit `'im_einzug'` neu setzen.
```sql
ALTER TABLE public.abrechnungen DROP CONSTRAINT abrechnungen_status_check;
ALTER TABLE public.abrechnungen ADD CONSTRAINT abrechnungen_status_check
  CHECK (status = ANY (ARRAY[
    'entwurf','versendet','bezahlt','ueberfaellig','storniert','fehlgeschlagen','im_einzug']));
```
Additiv (erweitert erlaubte Werte) → darf vor dem Code-Merge appliziert werden. File exakt
nach getrackter Version benennen (Regel 2, Schritt 3+4).

### 2. Einzugs-Cron `src/app/api/cron/abrechnung-einzug/route.ts`
- Neuer Helfer `markImEinzug(abrId, piId)`: setzt `status='im_einzug'`, `einzug_versucht_am`,
  `stripe_payment_intent_id`, `einzug_fehler=null`, `updated_at`. **Kein** `alertAaron`.
- `else`-Zweig verzweigt nach PI-Status:
  - `pi.status === 'processing'` → `markImEinzug(...)`; neuer `pending++`-Zähler (nicht `failed`).
  - sonst (unerwartet, z.B. `requires_action` ohne throw) → bisheriges `fehlgeschlagen` + Alarm.
- Retry-Query (2) pollt zusätzlich `im_einzug` als **Webhook-Backstop**:
  `.eq('status','fehlgeschlagen')` → `.in('status', ['fehlgeschlagen','im_einzug'])`.
  Für `im_einzug`-Zeilen greift der bestehende Idempotenz-Guard (`processing→'pending'` →
  nur versucht_am bumpen, kein 2. Charge; `succeeded→'paid'` → markPaid).
- Response um `pending` erweitern.

### 3. Webhook `src/app/api/stripe/webhook/route.ts` — `payment_intent.payment_failed`
Aktuell behandelt der Case nur `meta.gutachter_id` (Onboarding-Anzahlung). Ergänzen:
`meta.abrechnung_id`-Zweig → `status='fehlgeschlagen'`, `einzug_fehler` aus
`pi.last_payment_error?.message`, idempotenter Guard `.neq('status','bezahlt')`, + Admin-Alert
(gleiche Mail wie im Cron). Damit wird ein **async gescheiterter** SEPA-Einzug (Rücklastschrift
nach Tagen) korrekt auf `fehlgeschlagen` gesetzt und **erst hier** alarmiert.

### 4. Dunning + Reminder — `im_einzug` ausschließen
- `src/app/api/cron/sv-mahnung-saeumnis/route.ts` (Mahnung ab 14 Tagen überfällig)
- `src/app/api/cron/abrechnung-reminder/route.ts` (Vor-Fälligkeit-Reminder T-7/T-3/T-1)

Beide filtern heute nur `bezahlt_am IS NULL` (+ `storniert_am`), **nicht** auf Status → eine
`im_einzug`-Zeile (bezahlt_am noch NULL) würde gemahnt/erinnert. Fix: `.neq('status','im_einzug')`
in beiden Queries. `fehlgeschlagen` bleibt drin (korrekt: gescheiterter Einzug → mahnen).

### 5. Manueller Retry — `src/app/admin/abrechnungen/actions.ts` (`retryEinzug`)
Spiegelt den Cron-Bug (else-Zweig → `fehlgeschlagen`) und hat **keinen** Idempotenz-Guard →
ein manueller Retry einer `im_einzug`-Zeile könnte einen 2. PI erstellen (**Doppelabbuchung**).
- **Guard:** früh ablehnen, wenn `abr.status === 'im_einzug'`
  (`{ success:false, error:'Abrechnung ist bereits im Einzug (SEPA wird verarbeitet) — bitte abwarten.' }`).
- else-Zweig identisch zu #2: `processing → im_einzug` (kein Alarm), sonst `fehlgeschlagen`.

### 6. UI — Badge „Im Einzug"
- `src/app/admin/abrechnungen/AbrechnungenListClient.tsx`: `statusBadge()` bekommt einen
  `im_einzug`-Zweig **vor** dem `isFaellig`-Check → Badge „Im Einzug" in einem in-progress-Ton
  (`bg-info-soft` / `text-info-strong` / `bg-info`, sofern Token existiert, sonst `active`-Slot).
  `im_einzug` aus den „offen"/„fällig"-Filtern + Zählern ausschließen (ehrliche Counts),
  optionaler Filter-Chip „Im Einzug".
- `src/lib/statusLabels.ts`: `ABRECHNUNG_STATUS_LABELS['im_einzug']='Im Einzug'` +
  `ABRECHNUNG_STATUS_SLOT_MAP['im_einzug']='active'` (in-progress-Slot). Boy-Scout: das im
  selben Map fehlende `fehlgeschlagen` (→ `danger`) mit ergänzen.

### Nicht im Scope (bewusst)
- Kein Backfill (Tabelle leer).
- Keine Änderung am Idempotenz-Guard / an `piStatusToEinzugAction` (funktioniert).
- `analytics/finance.ts` rechnet über `bezahlt_am`/`faellig_am`, nicht über den Status-String →
  eine `im_einzug`-Zeile zählt korrekt als „erwartet/offen" bis Settlement. Wird bei der
  Umsetzung verifiziert; erwartet kein Change.

## Teststrategie (TDD, kein Live-Stripe am Geld-Pfad)

1. **Reiner Helfer** (neu, `src/lib/finance/einzug-branch.ts`):
   `einzugBranchFuerPiStatus(status: string): 'paid' | 'im_einzug' | 'fehlgeschlagen'`
   - `succeeded → 'paid'`, `processing → 'im_einzug'`, alles andere → `'fehlgeschlagen'`.
   - Unit-Tests (RED→GREEN) decken die drei Klassen + Grenzfälle ab. Cron **und** manueller
     Retry konsumieren denselben Helfer (DRY, eine Wahrheit).
2. **Query-Filter-Assertion** (Source-Guard-Test analog `internal-admin-reads.test.ts`):
   sichert, dass `sv-mahnung-saeumnis` + `abrechnung-reminder` `im_einzug` ausschließen
   (Schutz gegen versehentliches Zurückdrehen).
3. **Webhook-Handler**: fakeDb-Mock-Test, dass `payment_intent.payment_failed` mit
   `abrechnung_id` → `status='fehlgeschlagen'` idempotent (`.neq('status','bezahlt')`) schreibt.
4. Kein Live-Cron-/Live-Stripe-Test am Geld-Pfad (gefährlich) — die reine Logik + Source-Guards
   sind die Verifikation.

## Rollout / Verifikation

1. Migration via `apply_migration` applizieren, getrackte Version ablesen, File danach benennen,
   `execute_sql` (READ) verifiziert den Constraint.
2. TDD-Implementierung, voller 7-Punkte-Audit, PR gegen `staging`.
3. Post-Deploy-Smoke: nach dem nächsten Einzugs-Lauf mit einer echten SEPA-Test-Abrechnung
   prüfen, dass die Zeile `im_einzug` (nicht `fehlgeschlagen`) ist und **kein** Fehlalarm kam;
   nach Settlement `bezahlt` via Webhook.

## Betroffene Dateien (Zusammenfassung)

| Datei | Art |
|---|---|
| `supabase/migrations/<V>_abrechnungen_status_im_einzug.sql` | neu (Migration) |
| `src/lib/finance/einzug-branch.ts` (+ `.test.ts`) | neu (reiner Helfer + Test) |
| `src/app/api/cron/abrechnung-einzug/route.ts` | Branch + Retry-Poll |
| `src/app/api/stripe/webhook/route.ts` | payment_failed → abrechnung |
| `src/app/api/cron/sv-mahnung-saeumnis/route.ts` | `.neq('status','im_einzug')` |
| `src/app/api/cron/abrechnung-reminder/route.ts` | `.neq('status','im_einzug')` |
| `src/app/admin/abrechnungen/actions.ts` | Guard + else-Branch |
| `src/app/admin/abrechnungen/AbrechnungenListClient.tsx` | Badge + Filter |
| `src/lib/statusLabels.ts` | Label + Slot |
