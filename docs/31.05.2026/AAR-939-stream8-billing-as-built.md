# AAR-939 Stream 8 — Billing (Monika-Embed Variante B, 70 € Vermittlungsentgelt)

**Session:** 98044b6b · **Branch:** `kitta/aar-939-monika-billing` · **Datum:** 31.05.2026
**Modell:** AUTO-FÄLLIG via Cron (Aaron 31.05.). „Wir nehmen an, der SV war da — außer er meldet aktiv etwas anderes."

Implementiert nach dem Contract `docs/30.05.2026/AAR-939-billing-lifecycle-contract.md` (8-Punkte-Abstimmung mit der Lifecycle-Session af25a50f).

## Was gebaut wurde

### DB (3 Migrationen, alle via apply_migration appliziert + Twin-Drift-frei benannt)
- `20260530234100_aar939_embed_billing_review_storno_fields.sql` — gfa + 7 Spalten:
  `abrechnung_storniert_am`, `abrechnung_storno_grund`, `abrechnung_storno_durch_user_id` (FK profiles),
  `billing_review_status` (CHECK pending|closed), `billing_review_grund` (CHECK kunde_absage|kunde_no_show),
  `billing_review_erstellt_am`, `abrechnung_sv_id` (FK sachverstaendige). REIN ADDITIV.
- `20260530234223_aar939_embed_billing_faellig_view.sql` — droppt den toten gfa.status-Trigger
  (`embed_anfrage_billing` + `tg_embed_anfrage_billing`) + erstellt View `v_embed_billing_faellig`.
- `20260530234642_aar939_embed_billing_faellig_view_binding_status.sql` — View-Korrektur:
  Status-Filter von Exclusion auf **Inclusion** `IN ('bestaetigt','durchgefuehrt')` (nur verbindliche
  Termine lösen €70 aus; `reserviert`/`gegenvorschlag`/`sv_gesucht` NICHT).

**View `v_embed_billing_faellig`** (security_invoker) kapselt ALLE Fällig-Regeln:
- Reverse-Lookup: `gfa.konvertiert_zu_lead_id` → `claims.lead_id` → `gutachter_termine` (`claim_id` OR `lead_id`)
- `DISTINCT ON (gfa.id)` jüngster gültiger Termin (Verlegung → neuer zählt)
- `end_zeit + 24h Karenz < now()` · `status IN (bestaetigt,durchgefuehrt)` · `claims.sa_unterschrieben=true`
- Ausschluss: `abrechnung_id IS NULL` · `abrechnung_storniert_am IS NULL` · `billing_review_status ≠ 'pending'` · `es.sv_id IS NOT NULL`
- liefert aufgelösten/eingefrorenen `sv_id` (`COALESCE(gfa.abrechnung_sv_id, es.sv_id)`) + `betrag_netto`
- **`sv_no_show_am` ist BEWUSST KEIN Ausschluss** (Anti-Gaming: SV-No-Show zahlt trotzdem).

Empirisch verifiziert: 10/10 Mock-Szenarien PASS (happy/durchgeführt → fällig; karenz-offen, reserviert,
review-pending, storniert, keine-SA, schon-abgerechnet, verschoben, kein-SV → korrekt NICHT fällig).

### Code
- `src/app/api/cron/embed-abrechnung-erstellen/route.ts` — Monats-Cron, liest die View statt totem
  `abrechnungs_relevant`-Flag; gruppiert pro SV; Rechnung (`abrechnungen` empfaenger_typ='sv',
  CMNDO-EMB-YYYY-MM-NNN) + `embed_abrechnung_positionen` + SV-Email; friert `abrechnung_sv_id` ein.
- `src/lib/embed/billing-actions.ts` — 3 Server-Actions:
  - `markBillingReviewPending(anfrageId, grund='kunde_absage')` — Schnittstelle B, von af25a50f gerufen;
    Team ODER zugeordneter SV; unterdrückt Auto-Charge bis Admin entscheidet.
  - `markBillingReviewClosed(anfrageId)` — Admin: Review verwerfen → DOCH berechnen.
  - `stornoEmbedBilling(anfrageId, grund)` — **Admin-only**, einziger Void-Weg; storniert ggf. die
    Einzelposten-Rechnung mit, warnt bei Mehr-Positionen/bezahlt.
- `src/app/admin/embed-billing/{page,EmbedBillingClient}.tsx` — Admin-Review-Queue (pending/fällig/storniert).
- `src/app/admin/_components/AdminNav.tsx` — Nav-Item „Embed-Billing" (ReceiptIcon).

## VPS-Crontab (B7 — KEIN vercel.json, siehe AGENTS.md §vps-crons)

Der Cron hat einen Self-Check (`if (tomorrow.getMonth() === now.getMonth()) skip`), läuft also nur am
**letzten Tag des Monats** durch. Crontab-Eintrag auf dem VPS (täglich 18:00 in der Monatsend-Spanne):

```cron
# AAR-939 Monika-Embed Variante-B Monats-Billing (Self-Check: nur letzter Tag)
0 18 28-31 * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/embed-abrechnung-erstellen >> /var/log/claimondo/embed-billing.log 2>&1
```

`CRON_SECRET` liegt bereits zentral in `/etc/claimondo/.env.local` (gleicher Secret wie die anderen Crons).
Einzurichten von der VPS-Infra-Session (lokaler Claude richtet keine Crontab ein).

## Bewusst aufgeschoben
- **B6 Types-Regen:** `generate_typescript_types`-Output 620k > MCP-Limit; Code nutzt dokumentierte
  `as any`-Casts auf den neuen gfa-Spalten + die View (AGENTS.md Regel 2 Schritt 6 erlaubt Types-Lag,
  solange kein Consumer eine fehlende Spalte typisiert referenziert). Voller Regen besser in einer
  ruhigen Session ohne 4 parallele Sessions an `database.types.ts`.

## Gating / Restrisiko
- Live noch 0 echte Monika-B-Fälle mit verbindlichem Termin → View liefert real 0 (korrekt).
  Erster echter End-to-End-Durchlauf (Anfrage → Lead → SA → Claim → Termin bestätigt → end+24h)
  muss verifiziert werden, sobald Daten fließen.
- Reverse-Lookup-Keys sind auf echten Daten bewiesen (gfa→claims 48/48 Joins greifen).
