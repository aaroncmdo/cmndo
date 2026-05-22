# matelso Call-Tracking Webhook — Design Spec

- **Datum:** 2026-05-22
- **Branch:** `kitta/matelso-integration`
- **Status:** Approved (Design), bereit für Implementierungsplan
- **Linear:** kein Ticket (marketing-getrieben). Vor Implementierung ggf. AAR/CMM-Ticket anlegen.
- **Kontext-Quelle:** E-Mail Marketing-Team (matelso → Claude-CRM Webhook), übersetzt aus dem HubSpot-matelso-Artikel.

---

## 1. Ziel & Kontext

Auf der Ads-Landeseite `kfzgutachter.claimondo.de` wird über **matelso** Call-Tracking mit dynamischer Rufnummer (Dynamic Number Insertion pro Kampagne) eingesetzt. matelso soll bei einem Anruf die Anrufdaten per HTTP-POST-Webhook in unser eigenes CRM (die Claimondo-Next.js-App) liefern. Der Webhook legt aus der Anrufernummer einen Lead an (bzw. ordnet einem bestehenden Lead/Fall zu), benachrichtigt Dispatch und protokolliert den Anruf.

`kfzgutachter.claimondo.de` wird seit 20.05.2026 von **dieser** App ausgeliefert (nginx → PM2:3000 → `proxy.ts` Host-Rewrite → `/kfzgutachter-lp`). Der Webhook ist eine reine neue API-Route in unserem Backend; die nginx-/Subdomain-Konfiguration wird **nicht** angefasst.

**Verhältnis zu Aircall:** matelso **ersetzt** Aircall als Call-Tracker für die kfzgutachter-Ads-Nummer. Der bestehende Aircall-Pfad (`/api/webhooks/aircall/inbound`, Tabelle `aircall_calls`, Outbound-Click-to-Call) bleibt **unangetastet**.

---

## 2. Scope

**In Scope**
- Neue Webhook-Route `POST /api/webhooks/matelso/inbound`.
- Zod-Schema für den matelso-Payload.
- Neue Tabelle `matelso_calls` (supabase-CLI-Migration).
- Auto-Lead-Anlage + Lead/Fall-Zuordnung + Dispatch-Notification.
- Datenschutz-Text-Update §10.5 in **beiden** Dokumenten (Markdown + formale DOCX).
- Unit-, Route- und Smoke-Tests.

**Out of Scope (bewusst)**
- Das matelso-Frontend-Snippet / Dynamic Number Insertion / der GA4-`InboundCall`-Event-Fix → separate Aufgabe (Aaron + Olaf, matelso-Control-Panel), siehe `docs/superpowers/plans/2026-05-18-kfzgutachter-lp-conversion-hardening.md §2`.
- Migration von `aircall_calls` auf ein gemeinsames Schema (matelso bekommt eine eigene Tabelle).
- Eine Dispatch-„Anrufliste"-UI (existiert für Aircall auch nicht; Anrufe hängen am Lead via Notification + Notiz). Mögliches Follow-up.
- nginx-/`proxy.ts`-Änderungen an der kfzgutachter-Subdomain.

---

## 3. Entscheidungen (gelockt)

| Entscheidung | Wahl |
|---|---|
| Call-Datenmodell | **Dedizierte `matelso_calls`-Tabelle** (Spiegel von `aircall_calls`, matelso-spezifisch) |
| Lead-Anlage | **Jeder Anruf → Lead + Dispatch-Notification** (Lead nur anlegen, wenn weder Lead noch Fall gematcht; sonst zuordnen) |
| Auth | **`?secret=`-Query-Param** gegen `MATELSO_WEBHOOK_SECRET`, timing-safe |
| DSGVO | **Text-Update §10.5 im PR** (Markdown) + formale DOCX am selben Pfad; finaler Wortlaut zum Review an Aaron/Legal |

### Revalidierungs-Deltas (empirisch verifiziert, in dieses Design eingearbeitet)
1. `matelso_calls.status` bekommt **keinen** strikten `CHECK` — matelsos `callStatus`-Werte weichen von Aircalls vier Werten ab (würde beim Insert 500en). Stattdessen `status_raw` (Original) + `status` (normalisiert, ohne harten CHECK).
2. Auto-Lead **nur wenn `!leadId && !fallId`** (wie Aircall). Bestehender Kunde (Fall-Match, kein Lead) → kein neuer Lead, Anruf hängt am Fall.
3. Notification-Link adaptiv: Lead → `/dispatch/leads/<leadId>`, nur Fall-Match → `/faelle/<fallId>`. Notification feuert bei **jedem** Anruf (anders als Aircall, das nur bei neuem Lead benachrichtigt).
4. `matelso_calls` PK = `BIGSERIAL` (Konsistenz mit `aircall_calls`).
5. `started_at TIMESTAMPTZ NOT NULL DEFAULT now()` + Code-Fallback (matelso liefert evtl. keinen Zeitstempel).
6. RLS = `aircall_calls`-Muster (`admin/kundenbetreuer/leadbearbeiter/dispatch`); Service-Role-Insert bypasst RLS ohnehin.

**Verifizierte Code-Fakten (Stand 2026-05-22):**
- `lead_status`-Enum enthält `'neu'` (`database.types.ts`).
- `createNotification(userId, typ, titel, beschreibung?, link?)` (`src/lib/notifications.ts`).
- `benachrichtigungen.typ` ist Freitext (Aircall nutzt `'eingehender-anruf'`).
- `leads.notiz` + `leads.qualifizierungs_phase` existieren.
- `createLead(client, base, extra) → {ok, leadId}` (`src/lib/leads/create-lead.ts`).
- `/api/*` ist `isPublicPath` in `updateSession` → Webhook ohne Auth erreichbar (AAR-622 Cron-Shortcut); `proxy.ts` reicht `/api/*` auf jedem Host durch.

---

## 4. Architektur / Datenfluss

```
matelso Control-Panel ("Wohin?/Was?")
   │  HTTP POST (JSON-Body, ?secret=…)
   ▼
POST /api/webhooks/matelso/inbound      (src/app/api/webhooks/matelso/inbound/route.ts)
   1. Secret-Check (?secret vs MATELSO_WEBHOOK_SECRET, timing-safe)         → 401/500
   2. Body-Parse + Zod-Validierung (matelso-event.ts)                       → 400
   3. Idempotenz: matelso_calls mit external_call_id vorhanden? → Retry: nur Upsert, return
   4. matchInboundToFall(admin, anrufer_nummer) → {leadId, fallId}
   5. Wenn !leadId && !fallId: createLead(... source_channel='matelso-call' ...)
   6. createNotification an alle dispatch+admin (Link adaptiv lead/fall)    (fire-and-forget)
   7. upsert matelso_calls (onConflict external_call_id) + lead_id/fall_id + raw_payload
   8. 200 { ok, lead_id, fall_id, is_new_lead }
```

Wiederverwendete Bausteine: `createAdminClient` (Service-Role/RLS-Bypass), `matchInboundToFall` (`src/lib/inbound/match-fall.ts`), `createLead` (`src/lib/leads/create-lead.ts`), `createNotification` (`src/lib/notifications.ts`). Schema-Muster analog `src/lib/schemas/aircall-event.ts`.

**Designprinzip Isolation:** Reine Logik (Status-Normalisierung, Dedup-Entscheidung, Telefon-Extraktion/Leerfall, Link-Auswahl) wird in eine testbare Modul-Datei `src/lib/matelso/process-call.ts` (oder reine Helfer) ausgelagert; die Route ist nur Auth + IO-Glue. Damit ist der Kern ohne HTTP/DB unit-testbar.

---

## 5. Endpoint & Auth

- Datei: `src/app/api/webhooks/matelso/inbound/route.ts`, `export const dynamic = 'force-dynamic'`.
- Auth: `secret`-Query-Param, `crypto.timingSafeEqual` gegen `process.env.MATELSO_WEBHOOK_SECRET`.
  - Env fehlt → `500 { error: 'Webhook not configured' }`.
  - Param fehlt/falsch → `401 { error: 'Unauthorized' }`.
- Öffentliche Prod-URL: `https://app.claimondo.de/api/webhooks/matelso/inbound?secret=…`.
- **Caveat (dokumentiert):** Das Secret erscheint in nginx-Access-Logs. Akzeptiert, weil von matelso/Mail so vorgegeben und Endpoint nur Anrufdaten annimmt (kein Lese-/Lösch-Zugriff). Härtung auf HTTP-Basic-Auth später möglich, ohne Schema-Änderung.

---

## 6. matelso-Payload-Vertrag

Im matelso-Control-Panel unter „Was?" → POST-Body einzutragen. Erweitert die Mail-Vorlage um `call_id` + `zeitpunkt` (für Idempotenz & korrektes `started_at`):

```json
{
  "call_id": "{{callData.callId}}",
  "anrufer_nummer": "{{callData.aNumber.number.numberFormatter (INTERNATIONAL)}}",
  "angerufene_nummer": "{{callData.bNumber.number.numberFormatter (INTERNATIONAL)}}",
  "anruf_status": "{{callData.callStatus}}",
  "dauer_sekunden": "{{callData.duration}}",
  "quelle": "{{callData.pool.name}}",
  "zeitpunkt": "{{callData.startTime}}"
}
```

- Validierung: Zod (`src/lib/schemas/matelso-event.ts`), `.passthrough()`. **Pflicht** nur `anrufer_nummer` (alle anderen optional/tolerant; matelso-DDD-Keys können je nach Tarif fehlen).
- Die exakten DDD-Key-Namen `callData.callId` und `callData.startTime` muss Aaron/Olaf im matelso-Panel verifizieren (siehe §14). Wenn keine Call-ID verfügbar ist → Fallback-Dedup-Key `anrufer_nummer + zeitpunkt`-Bucket; Idempotenz dann best-effort.

---

## 7. Datenmodell — `matelso_calls`

Neue Migration via `npx supabase migration new matelso_calls_table` in `supabase/migrations/`, dann `npx supabase db push`. **Vor `db push`:** `information_schema`-Live-Check (geteilte Prod-DB, parallele CMM-44-Sessions) — `CREATE TABLE matelso_calls` ist rein additiv und kollidiert nicht mit deren `faelle`/`claims`-Drops.

```sql
CREATE TABLE IF NOT EXISTS matelso_calls (
  id                BIGSERIAL PRIMARY KEY,
  external_call_id  TEXT UNIQUE NOT NULL,         -- matelso call_id, Fallback synthetisiert
  direction         TEXT NOT NULL DEFAULT 'inbound',
  status            TEXT,                          -- normalisiert (answered/missed/voicemail/failed/other) — KEIN harter CHECK
  status_raw        TEXT,                          -- matelso callStatus original
  from_number       TEXT,                          -- anrufer_nummer (INTERNATIONAL)
  to_number         TEXT,                          -- angerufene (dynamische) Nummer
  duration          INTEGER,                       -- Sekunden
  quelle            TEXT,                          -- matelso pool.name (Kampagne)
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  lead_id           UUID REFERENCES leads(id) ON DELETE SET NULL,
  fall_id           UUID REFERENCES faelle(id) ON DELETE SET NULL,
  raw_payload       JSONB,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matelso_calls_lead_id    ON matelso_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_matelso_calls_fall_id    ON matelso_calls(fall_id);
CREATE INDEX IF NOT EXISTS idx_matelso_calls_started_at ON matelso_calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_matelso_calls_from_num   ON matelso_calls(from_number);

ALTER TABLE matelso_calls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'matelso_calls_staff' AND tablename = 'matelso_calls') THEN
    CREATE POLICY "matelso_calls_staff" ON matelso_calls
      FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
                AND profiles.rolle IN ('admin','kundenbetreuer','leadbearbeiter','dispatch'))
      );
  END IF;
END $$;
```

Nach Migration: `npx supabase gen types` → `database.types.ts` aktualisieren (oder Projekt-Konvention für Type-Regen befolgen).

---

## 8. Verarbeitungs-Logik (Detail inkl. Edge-Cases)

1. **Auth** — `?secret` prüfen (siehe §5).
2. **Parse + Validate** — `req.text()` → `JSON.parse` (→ 400 bei kaputtem JSON) → `MatelsoEventSchema.safeParse` (→ 400 mit erster Issue).
3. **Status-Normalisierung** (reine Funktion): matelso `callStatus` → `answered | missed | voicemail | failed | other`. Original in `status_raw`.
4. **Dedup-Key:** `external_call_id = call_id ?? sha/zusammensetzung(anrufer_nummer + zeitpunkt-Bucket)`.
5. **Idempotenz:** existiert `matelso_calls`-Zeile mit `external_call_id` → Retry. Nur Felder upsert/aktualisieren, **kein** neuer Lead, **keine** zweite Notification. Antwort `200 { ok:true, deduped:true }`.
6. **Match:** `matchInboundToFall(admin, from_number)` → `{ leadId, fallId }`.
7. **Auto-Lead:** wenn `!leadId && !fallId` **und** `from_number` vorhanden:
   `createLead(admin, { source_channel:'matelso-call', status:'neu', telefon: from_number, vorname:'Unbekannt', nachname:'Anrufer' }, { qualifizierungs_phase:'neu', notiz: 'Auto-erstellt durch matelso-Anruf am <Berlin-Zeit> · Quelle: <quelle> · Status: <status> · Dauer: <s>s' })`. → `leadId`, `isNewLead=true`.
8. **Notification (jeder Anruf):** an alle `profiles.rolle IN ('dispatch','admin')`:
   - Titel: `Eingehender Anruf von <from_number>` (bzw. „… mit unterdrückter Nummer").
   - Beschreibung: `Quelle · Status · Dauer`.
   - Link: `leadId ? '/dispatch/leads/'+leadId : (fallId ? '/faelle/'+fallId : undefined)`.
   - Fire-and-forget (`.catch(()=>{})`), darf den Status nicht brechen.
9. **Upsert `matelso_calls`** (onConflict `external_call_id`) inkl. `lead_id`, `fall_id`, `raw_payload`, `updated_at`.
10. **Antwort** `200 { ok:true, lead_id, fall_id, is_new_lead }`.

**Edge-Case unterdrückte/leere Nummer:** kein `from_number` → Schritte 6/7 überspringen (kein Match, kein Lead — nicht kontaktierbar/dedupbar), Call-Record + Notification trotzdem schreiben (Titel „… unterdrückte Nummer"). `external_call_id` muss dann aus `call_id` kommen, sonst Fallback `now()`-basiert (best effort).

**Fehler-Handling:** Route folgt dem Webhook-Muster (Result-/Status-Codes, kein unkontrolliertes `throw`); Non-Critical-Sends (Notification) in try/catch. DB-Insert-Fehler → `500` mit Detail.

---

## 9. Lead-Anlage + Notification-Policy

- **source_channel:** `'matelso-call'` (neuer Wert, konsistent mit `'aircall-inbound'`, `'kfzgutachter-ads-lp'`).
- **status:** `'neu'` (gültiger `lead_status`-Enum-Wert).
- **Kampagnen-/Quellen-Attribution:** matelso `pool.name` → `matelso_calls.quelle` **und** in die Lead-`notiz` (sichtbar für Dispatch). Kein eigener Kampagnen-Spalten-Bedarf auf `leads`.
- **Notification bei jedem Anruf** (auch bekannter Lead/Fall) — gewählte Policy „jeder Anruf = Lead + Notification". Idempotenz (Schritt 5) verhindert Doppel-Notifications bei Webhook-Retries.

---

## 10. DSGVO / Datenschutz-Text-Update

Das `§10.5 Matelso`-Wording steht identisch in zwei Dokumenten — beide müssen aktualisiert werden:
- `src/content/legal/datenschutz.md` (auf der Seite ausgeliefert, **git-tracked → im PR**).
- `content/vertraege/02_Datenschutzerklaerung_DSGVO_Claimondo_v2.docx` (formale v2.0, **untracked Referenz-Artefakt** im Haupt-Repo; Update via `docx`-Skill am selben Pfad).

**Problem:** Aktueller Text sagt „Eine Verknüpfung mit weiteren personenbezogenen Daten findet erst statt, wenn Sie … ein Vertragsverhältnis … eingehen" und nennt als Rechtsgrundlage nur Art. 6 (1) a (Marketing-Consent). Die Auto-Lead-Anlage im CRM ist eine solche Verknüpfung und stützt sich auf Art. 6 (1) b (vorvertragliche Maßnahme, wie §5.3 Lead-Formular).

**Vorgeschlagener neuer Wortlaut §10.5** (UTF-8-Umlaute Pflicht, da nutzersichtbar — zum Review an Aaron/Legal, optional via `gdpr-privacy-notice`-Skill final geschliffen):

> **10.5 Matelso Call Tracking**
> Wir nutzen den Call-Tracking-Dienst Matelso der matelso GmbH, Heilbronner Straße 150, 70191 Stuttgart, Deutschland. Matelso ermöglicht es uns zu erkennen, über welchen Marketingkanal (z. B. Google Ads, organische Suche, Direkteinstieg) Sie auf unsere Webseite gelangt sind und uns telefonisch kontaktieren.
>
> **Funktionsweise:** Beim Besuch unserer Webseite wird Ihnen je nach Besucherquelle eine dynamisch zugewiesene Telefonnummer angezeigt. Wenn Sie diese Nummer anrufen, leitet Matelso den Anruf an unsere zentrale Rufnummer weiter und erfasst dabei Datum, Uhrzeit, Dauer und die anrufende Telefonnummer.
>
> **Übermittlung an unser CRM:** Damit wir Ihr telefonisches Anliegen bearbeiten und Sie zurückrufen können, übermittelt Matelso die genannten Anrufdaten unmittelbar nach dem Anruf automatisiert an unser eigenes Kundenmanagement-System (CRM). Dort legen wir anhand Ihrer Rufnummer einen Kontakt (Lead) an bzw. ordnen den Anruf einem bereits vorhandenen Kontakt zu, um Ihre Anfrage weiterzubearbeiten. Eine darüber hinausgehende Verknüpfung mit weiteren personenbezogenen Daten (z. B. Schaden- oder Fahrzeugdaten) erfolgt erst, wenn Sie uns mit der Schadenabwicklung beauftragen.
>
> **Verarbeitete Daten:** Anrufende Rufnummer (vollständig), angerufene (dynamische) Rufnummer, Datum und Uhrzeit des Anrufs, Anrufdauer, Anrufstatus, Marketingkanal/Quelle des Anrufs, Session-ID des Webseitenbesuchs, IP-Adresse (gekürzt).
>
> **Rechtsgrundlagen:** Die Anzeige der dynamischen Rufnummer und die Zuordnung zum Marketingkanal erfolgen auf Grundlage Ihrer Einwilligung (Art. 6 Abs. 1 lit. a DSGVO i. V. m. § 25 Abs. 1 TDDDG, Cookie-Kategorie „Marketing"). Die anschließende Anlage eines Kontakts in unserem CRM und die Kontaktaufnahme zu Ihnen erfolgen zur Durchführung vorvertraglicher Maßnahmen auf Ihre Anfrage hin (Art. 6 Abs. 1 lit. b DSGVO). Ohne Ihre Marketing-Einwilligung wird Ihnen unsere statische Hauptrufnummer angezeigt und es findet keine Zuordnung zu Marketingkanälen statt.
>
> **Speicherdauer:** Die Anrufdaten werden bei Matelso für 12 Monate gespeichert und anschließend automatisch gelöscht. Die in unser CRM übernommenen Kontaktdaten werden gemäß Ziffer 5.4 dieser Datenschutzerklärung gelöscht, sofern kein Vertragsabschluss zustande kommt. Mit Matelso besteht ein Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO. Server-Standort ist Deutschland; eine Drittlandsverarbeitung findet nicht statt.
>
> Weitere Informationen finden Sie in der Datenschutzerklärung von Matelso unter matelso.com/datenschutz.

---

## 11. Config & Deploy

- Env `MATELSO_WEBHOOK_SECRET`:
  - Lokal/Staging: `.env.local`.
  - Prod: `/etc/claimondo/.env.local` auf VPS (212.132.119.110) + `pm2 reload claimondo-v2 --update-env`. **Lokaler Claude fährt VPS nicht selbst an** — exakter Befehl wird Aaron im Abschluss genannt (Memory `vps_claude_rolle`).
- Kein `vercel.json`-Eintrag, kein Cron.

---

## 12. Test-Strategie

- **Unit (Vitest)** — `src/lib/matelso/__tests__/process-call.test.ts` + `src/lib/schemas/__tests__/matelso-event.test.ts` (Muster: `aircall-event.test.ts`):
  - Zod-Parse: valider Mail-Payload, fehlende Pflichtfelder, Teilfelder/passthrough.
  - Status-Normalisierung (matelso-Werte → answered/missed/…/other).
  - Dedup-Key-Bildung (mit/ohne `call_id`).
  - Telefon leer/unterdrückt → kein Lead, Notification-Titel-Variante.
  - Link-Auswahl (lead vs fall vs none).
- **Route-Level** — POST mit Mail-Beispiel-Payload: Lead angelegt, `matelso_calls`-Upsert, Notification ausgelöst; Retry mit gleicher `call_id` → kein Dup-Lead, keine 2. Notification; falsches/fehlendes Secret → 401; kaputtes JSON → 400.
- **Smoke** — `scripts/smoke-matelso-webhook.mjs` (Muster `scripts/smoke-*.mjs`): POSTet 4 Szenarien (answered / missed / anonym / retry) gegen lokal bzw. Staging und verifiziert die DB-Zeilen via Service-Client. Screenshot/Output im selben Turn auswerten (Memory `smoke_screenshot_pflicht` analog für DB-Verify).
- **Staging** — `curl` gegen `app.staging.claimondo.de/api/webhooks/matelso/inbound?secret=…` (Staging-Slot hat zusätzlich Basic-Auth — Creds mitgeben).
- **Echtes E2E (Akzeptanz, Aaron+Olaf)** — matelso-Panel auf Prod-URL konfigurieren + Testanruf von fremder SIM → Lead + Notification erscheinen.
- **Build-Gate** — `npm run build` (Route wird build-zeit-validiert) + `npx tsc --noEmit`. 7-Punkte-Audit im Commit-Body (AGENTS.md).

---

## 13. Berührte Dateien

**Neu**
- `src/app/api/webhooks/matelso/inbound/route.ts`
- `src/lib/schemas/matelso-event.ts`
- `src/lib/matelso/process-call.ts` (reine Logik)
- `src/lib/matelso/__tests__/process-call.test.ts`
- `src/lib/schemas/__tests__/matelso-event.test.ts`
- `supabase/migrations/<ts>_matelso_calls_table.sql`
- `scripts/smoke-matelso-webhook.mjs`
- `docs/<DD.MM.YYYY>/matelso-webhook-smoke.md` (Smoke-Report, Memory `smoke_audit_mds`)

**Geändert**
- `src/lib/supabase/database.types.ts` (Type-Regen nach Migration)
- `src/content/legal/datenschutz.md` (§10.5)
- `content/vertraege/02_Datenschutzerklaerung_DSGVO_Claimondo_v2.docx` (§10.5, via docx-Skill; untracked)
- `.env.local` (lokal, nicht committen) / Doku des Env-Namens

---

## 14. Offene Punkte / Externe Aktionen (Aaron + Olaf)

1. **matelso DDD-Keys verifizieren:** Existieren `callData.callId` und `callData.startTime` (oder wie heißen sie genau)? Bestimmt Idempotenz-Robustheit.
2. **matelso „Wohin?/Was?" konfigurieren:** Prod-URL + Secret + POST-Body (§6) im Control-Panel eintragen.
3. **`MATELSO_WEBHOOK_SECRET`** generieren + auf VPS setzen (`pm2 reload --update-env`).
4. **Legal-Review** des §10.5-Wortlauts (§10) für beide Dokumente.
5. **Linear-Ticket** anlegen (optional, für Tracking).

---

## 15. Follow-ups (nicht in diesem PR)

- Dispatch-„Anrufliste"-UI (vereinheitlicht matelso + ggf. aircall).
- Optionale Härtung Auth → HTTP-Basic-Auth.
- Konsolidierung `aircall_calls` + `matelso_calls` in ein provider-agnostisches Schema, falls weitere Call-Tracker hinzukommen.
