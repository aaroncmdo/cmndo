# SV-Tier "Basic" — Self-Onboarding + WhatsApp-Termin-Push

**Stand:** 2026-05-11 (Skizze, nicht aktiv)
**Auslöser:** Aaron 2026-05-11 — Konvertierung aus Free-Tier-Lead-Partnern
über DAT-Newsletter-Strecke.

---

## 1. Drei-Tier-Modell

```
┌─────────────────────────────────────────────────────────────┐
│  Pro/Premium  →  Vollintegriert: Calendar-Sync, Pakete,     │
│   Tier 1         App-Login, Branding, Auto-Dispatching.     │
│                  Tabelle: sachverstaendige                  │
├─────────────────────────────────────────────────────────────┤
│  Basic        →  Self-Onboarded, WhatsApp-only-Workflow,    │
│   Tier 2         kein App-Login. Bekommen Termine per WA,   │
│                  bestätigen per WA-Button. Kein Calendar.   │
│                  Tabelle: sv_leads.tier='basic'             │
├─────────────────────────────────────────────────────────────┤
│  Free         →  Lead-Partner aus DAT-Import. Wir kennen    │
│   Tier 3         Adresse + Standort, sonst nichts. Termine  │
│                  per Telefon vom Dispatcher bestätigt.      │
│                  Tabelle: sv_leads.tier='free' (default)    │
└─────────────────────────────────────────────────────────────┘
```

## 2. Konvertierungs-Pfad Free → Basic

```
DAT-Newsletter mit Aaron-CTA "Werden Sie Claimondo-Partner"
   ↓
/sv-onboarding-basic (Public-Page, neue Route)
   ↓
DynamicWizard mit flow_key='sv-basic-onboarding'
   - Name + Anrede
   - DAT-Expert-Nr + IHK/BVSK-Zertifikat (optional)
   - WhatsApp-Nummer (Pflicht, Twilio-Verify)
   - Spezifikationen (PKW/LKW/Motorrad/Wohnmobil)
   - Schadenarten (Standard/Premium-only-Toggle)
   - Einsatzradius in km (default 25)
   - Vereinfachter Vertrag (PDF-Link + Checkbox)
   - SA-Style-Signatur
   ↓
   INSERT/UPDATE sv_leads SET tier='basic', warteliste_status='basic_aktiv',
                            self_onboarded_am=now()
   ↓
   Twilio Verify SMS-Code zur WA-Nummer-Bestätigung
   ↓
   Status: aktiv im Matching
```

## 3. WhatsApp-Termin-Workflow

Basic-SVs haben keinen Calendar. Termine werden über WhatsApp koordiniert:

**Beim Match (Kunde wählt Basic-SV auf der Karte):**

1. INSERT `gutachter_termine` (sv_lead_id, status='angefragt_basic')
2. Twilio WA-Template `basic_sv_termin_anfrage`:
   ```
   Hallo {SV_VORNAME},
   Termin-Anfrage von Claimondo:
   Kunde: {KUNDE_NAME}
   Adresse: {STANDORT}
   Wunsch: {DATUM} {UHRZEIT}

   👍 = Zusagen | ✋ = Alternative
   ```
3. SV antwortet `👍` → Webhook `/api/webhooks/twilio/basic-confirm` setzt `status='bestaetigt'`
4. SV antwortet `✋` → Conversational-Flow mit Alternative-Vorschlag, Loop bis OK oder Cancel

**Reminder-Cron:**

- 24h vor Termin: WA mit `basic_termin_24h_reminder`
- 2h vor Termin: WA mit `basic_termin_2h_reminder`
- Kein-Antwort 1h nach Termin: WA `basic_termin_status_check` → "War der Termin OK?"

**Gutachten-Upload:**

- WA-Template `basic_gutachten_upload_anfrage` mit Upload-Token-Link
- Public-Page `/sv-basic/upload/[token]` für Basic-SV (kein Login nötig)
- Token-validiert per HMAC, schreibt direkt in `fall_documents`

## 4. Matching-Priorisierung (3-Tier)

In `findSvsForLocation(lat, lng)`:

```ts
1. Tier 1: sachverstaendige (Iso-Polygon-Check, Paket-Priorität)
2. Tier 2: sv_leads WHERE tier='basic' AND aktiv
   (Iso-Polygon-Check, Score nach Reaktions-Zeit der letzten Termine)
3. Tier 3: sv_leads WHERE tier='free' (Iso oder Haversine ≤25km)

→ Wenn Treffer in Tier 1: nur Tier 1 anzeigen
→ Wenn 0 Tier 1, ≥1 Tier 2: nur Tier 2 anzeigen
→ Wenn 0 Tier 1+2: Tier 3 mit Warnung "Termin wird manuell koordiniert"
```

## 5. DB-Schema

```sql
-- Migration: sv_leads erweitern
ALTER TABLE sv_leads
  ADD COLUMN tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'pro_eingeladen')),
  ADD COLUMN self_onboarded_am TIMESTAMPTZ,
  ADD COLUMN whatsapp_nummer TEXT,
  ADD COLUMN whatsapp_verified_am TIMESTAMPTZ,
  ADD COLUMN vertrag_signiert_am TIMESTAMPTZ,
  ADD COLUMN vertrag_signatur_data_url TEXT,
  ADD COLUMN spezifikationen TEXT[],
  ADD COLUMN schadenarten TEXT[],
  ADD COLUMN reaktions_zeit_avg_min INTEGER,
  ADD COLUMN auftraege_basic_count INTEGER DEFAULT 0,
  ADD COLUMN ablehnungen_basic_count INTEGER DEFAULT 0;

CREATE INDEX idx_sv_leads_tier_aktiv ON sv_leads(tier, ist_aktiv);

-- gutachter_termine: Status-Werte erweitern fuer Basic-Tier
-- ('angefragt_basic', 'bestaetigt_basic', etc.) → Migration mit
-- CHECK-Constraint-Update
```

## 6. Self-Onboarding-Wizard Phasen (flow_key='sv-basic-onboarding')

| # | phase_key | Felder | Pflicht |
|---|---|---|---|
| 1 | identitaet | vorname, nachname, anrede | ✓ |
| 2 | qualifikation | dat_expert_nr, bvsk_nr, ihk_zertifikat | mind 1 |
| 3 | kontakt | whatsapp_nummer (mit Twilio-Verify), email | ✓ |
| 4 | gebiet | standort_adresse (Google-Place), paket_umkreis_km | ✓ |
| 5 | spezifikationen | spezifikationen[], schadenarten[] | ✓ |
| 6 | vertrag | vertrag_pdf_link, signatur (Canvas), DSGVO | ✓ |

→ INSERT `sv_leads` + Twilio-Verify-Trigger.

## 7. UI-Reflektion auf der Karte

In `/gutachter-finden` Karte:

- **Tier 1 (Pro/Premium):** Goldener Border, Photo-Avatar, Pulse-Dot-grün
- **Tier 2 (Basic):** Ondo-Border, Initialen-Avatar, Pulse-Dot-blau
- **Tier 3 (Free):** Grauer Border, Initialen-Avatar, kein Pulse (statisch)

User sieht visuell sofort den Tier. SEO-Trust: Karte zeigt "60+ verifizierte
Partner-Sachverständige" als Pulse-Pill.

## 8. PR-Plan

Nicht aktiv. Wird nach Funnel-Vereinfachung (Plan v2 main) und nach
mindestens 5 Basic-Sign-ups als separate Strecke umgesetzt:

| PR | Was | Aufwand |
|---|---|---|
| 1 | DB-Migration `sv_leads` tier + WA-Spalten | 1h |
| 2 | `/sv-onboarding-basic` Public-Page + DynamicWizard | 4h |
| 3 | Twilio WA-Verify + WA-Templates anlegen | 3h |
| 4 | Matching-Erweiterung 3-Tier | 2h |
| 5 | Twilio-Webhook für `👍`/`✋`-Antworten | 4h |
| 6 | `/sv-basic/upload/[token]` Public-Upload-Page | 3h |
| 7 | Cron `basic-sv-reminder` (24h/2h/follow-up) | 2h |

**Gesamt:** ~19h.

## 9. Voraussetzungen vor Umsetzung

- [ ] Funnel-Vereinfachung (Plan v2) live mit Tier-1+3 stabil
- [ ] ≥5 Basic-Anwärter aus DAT-Newsletter
- [ ] Twilio WA-Template-Approval für die 5 neuen Templates
- [ ] Datenschutz-Klärung für SV-Personalbezogene Daten ohne App-Login
- [ ] Vereinfachter Vertrag (PDF) von Anwalt geprüft
