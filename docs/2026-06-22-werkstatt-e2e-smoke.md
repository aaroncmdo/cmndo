# Werkstatt-Vermittler — E2E-Smoke-Checkliste (staging)

**Voraussetzung:** PR #3084 gemergt + **staging deployed** (die Werkstatt-Routen sind dort dann erst da).
Das **DB-Schema ist bereits live** (4 Migrationen auf Prod/Shared-Supabase).

**Smoke-Werkstatt (vorpositioniert):** Login `werkstatt-smoke@claimondo.de` (Passwort separat),
`WERKSTATT_ID = badecb82-aa29-461c-876b-007455aa8dd3`,
QR-URL `https://app.claimondo.de/start/werkstatt/badecb82-aa29-461c-876b-007455aa8dd3`.

## Ablauf (jeder Schritt = ein Screenshot)

1. **Admin-Anlage** — `/admin/werkstaetten` → „Neue Werkstatt" → Name/E-Mail/Adresse (Google-Places → lat/lng) →
   anlegen → **Login + Passwort werden einmalig angezeigt** (zum Weitergeben). ✓ werkstaetten-Row + Portal-User `rolle=werkstatt`.
2. **QR abrufen** — Werkstatt-Portal `/werkstatt/promo` zeigt den **werkstatt-eigenen** QR
   (`/start/werkstatt/<id>`, druckbar). **Ja: jede Werkstatt hat ihren eigenen QR** (die `werkstatt_id` ist drin).
3. **Kunde scannt QR** → `/start/werkstatt/<id>` → Finder-Wizard mit Vorfrage
   **„Steht das Fahrzeug noch bei [Werkstatt]?"** → „Ja, in der Werkstatt" → Werkstatt-Adresse wird Besichtigungsort →
   Matching/Termin → Kontakt-Submit (Anfrage angelegt, `gfa.werkstatt_id` gesetzt).
4. **Konversion → Claim** — der Lead trägt `werkstatt_id` → bei Claim-Erstellung legt der DB-Trigger
   **genau 1** `werkstatt_provisionen` an (`status=pending`, `hold_until=now()+7d`).
5. **Werkstatt-Portal** — Login als Werkstatt → `/werkstatt` (Dashboard: vermittelte Claims + Provisionssumme,
   **muss erreichbar sein, NICHT `/pending`** — das war der RLS-Critical-Fix) · `/werkstatt/abrechnungen` (Provision „fällig").
6. **Storno** — Claim `operative_status='storniert'` → Cron `release-werkstatt-provisionen` → Provision `storniert`.
   (Ohne Storno + nach `hold_until`: Cron flippt `pending → freigegeben`.)

## DB-Verifikation (execute_sql READ, project paizkjajbuxxksdoycev)
```sql
-- nach Schritt 4: genau 1 Provision für die Smoke-Werkstatt
select status, betrag_netto_eur, hold_until, claim_id
from werkstatt_provisionen where werkstatt_id='badecb82-aa29-461c-876b-007455aa8dd3';
-- Leak-Check: das Werkstatt-Portal darf keine Kunden-PII zeigen (nur claim_nummer/Betrag/Status/Daten).
```

## Erwartete Ergebnisse
- **Genau 1** Provision je Werkstatt-Claim (`ON CONFLICT (claim_id) DO NOTHING`).
- Werkstatt-Portal **erreichbar** (Policy `werkstaetten_self_read`), Dashboard-Count via `werkstatt_provisionen`.
- **Keine Kunden-PII** im Werkstatt-Portal.
- `provision_aktiv=false` → **kein** Provisions-Insert (Trigger-Guard).

## Aufräumen nach dem Test
Smoke-Werkstatt + Test-Claims wieder entfernen (Test-Daten in der Shared-DB).
