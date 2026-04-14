# Scripts

Einmal-Skripte für Setup, Seeding und Migrations-Backfills.

## twilio-setup-templates.mjs (AAR-119)

Legt alle 33 WhatsApp Content Templates bei Twilio an und reicht sie zur
WhatsApp-Approval ein. Idempotent: bereits existierende Templates werden
geskippt.

### Voraussetzungen

1. Twilio Account aktiviert für WhatsApp Business API (Sandbox oder Production)
2. `TWILIO_ACCOUNT_SID` und `TWILIO_AUTH_TOKEN` verfügbar

### Ausführung

```bash
TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx node scripts/twilio-setup-templates.mjs
```

### Output

Am Ende zeigt das Script alle Content-SIDs im `.env.local`-Format:

```
TWILIO_TPL_FLOWLINK_VERSAND=HX0123456789abcdef...
TWILIO_TPL_FALL_EROEFFNET=HX0123456789abcdef...
...
```

Diese Werte müssen dann manuell in die Vercel-Environment-Variablen eingetragen
werden (`vercel env add …` oder über das Vercel-Dashboard).

### Was das Script macht

Pro Template:

1. **Idempotenz-Check**: `GET /v1/Content?FriendlyName=…` — existiert bereits → skip
2. **Content anlegen**: `POST /v1/Content` mit Body + Sample-Variables
3. **Approval einreichen**: `POST /v1/Content/{sid}/ApprovalRequests/whatsapp`
   mit Category `UTILITY`
4. **Rate-Limit**: 700 ms Pause zwischen Calls (Twilio erlaubt 100 req/min)

### Nach dem Run

1. Ausgabe in `twilio-content-sids.txt` sichern (oder direkt in Vercel übernehmen)
2. Auf WhatsApp-Approval warten (üblicherweise 1–24 Stunden)
3. Approval-Status in Twilio Console prüfen:
   `Messaging → Content Template Builder → Approval status`
4. Nach Approval Smoke-Test T1 `flowlink_versand` durchführen
   (Lead anlegen, Hard Gate, SV reservieren, FlowLink senden)

### Template-Quelle

Alle Texte, Sample-Values und ENV-Keys sind wortwörtlich übernommen aus der
Notion-Page „📨 WhatsApp Templates — Twilio Content API Setup":
<https://www.notion.so/3421da4c9124817fbc29e8078a23e9cc>

Variablen-Zählung matcht `src/lib/whatsapp/template-sids.ts`.

## backfill-org-isochrones.mjs (AAR-129)

Einmaliges Backfill-Script für bestehende Organisationen (Communities, Büros,
Akademien) die noch kein `isochrone_polygon` haben. Idempotent, überspringt
bereits befüllte Einträge.

Pro Org: nimmt `standort_lat/lng` falls vorhanden, sonst
`einsatzgebiet_zentrum_lat/lng`, sonst ersten SV-Member mit Koordinaten.
Danach HERE-API-Aufruf + GeoJSON-Polygon speichern.

### Ausführung

```bash
HERE_API_KEY=xxx \
SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
  node scripts/backfill-org-isochrones.mjs
```

## recalc-all-isochrones.mjs (AAR-132)

Einmalig alle `sachverstaendige.isochrone_polygon` Einträge mit HERE API
neu berechnen (nach dem OSRM→HERE-Wechsel). Idempotent, kann mehrfach laufen.

### Ausführung

```bash
HERE_API_KEY=xxx \
SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
  node scripts/recalc-all-isochrones.mjs
```

Rate-Limit: 200 ms zwischen Calls (HERE Free-Tier erlaubt 5 req/sec).

## Weitere Skripte

- `submit-twilio-templates.ts` — ältere TypeScript-Variante mit längeren
  Template-Texten (Vorversion). Für neue Runs `twilio-setup-templates.mjs`
  verwenden.
- `seed-test-data.ts` — Test-Daten für lokale Entwicklung
- `kfz136_backfill_reminders.ts` — Reminder-Backfill nach Migration
- `kfz146_backfill_lead_to_fall.ts` — Lead→Fall Felder-Backfill
- `kfz148_seed_vertraege.ts` — Vertrags-Templates seeden
- `kfz149_seed_leadpreise.ts` — Lead-Preise seeden
- `kfz151_backfill_task_entities.ts` — Task-Entities Backfill
- `disaster-recovery-runbook.md` — DR-Playbook
- `audit-console.md` + `audit-report.md` — Audit-Findings
