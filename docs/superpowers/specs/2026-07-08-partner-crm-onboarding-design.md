# Partner-Leads-CRM — Onboarding-Ausbau (Design)

**Datum:** 2026-07-08 · **Kontext:** `/admin/partner-leads` (Vertriebs-CRM, #3678 live). Aaron-Review „ich muss Leads konvertieren + ins Konto kommen, Termine legen (online/vor Ort), CSV sauber mappen, Adressen geokodieren".

## Phasen-Übersicht

- **Phase 1 — Reanimation fertiger Kinder (bewiesener Code, port+verify):**
  - **#3725** Convert → rollen-spezifische **Login-/Welcome-Mail** mit Recovery-Magic-Link. Schließt „konvertierter Partner kommt ins Konto" (heute: Account mit Random-PW, aber kein Weg hinein). *(portiert)*
  - **#3717** **„Leads scrapen"** (Google-Places-API, Vorschau+Dedup+Bearbeiten). *(Port läuft)*
- **Phase 2 — Neu (dieses Spec):** ③ Onboarding-Termine · ④ CSV Smart-Mapping · ⑤ Geocoding.

---

## ③ Onboarding-Termine (Sales ↔ Prospect, online/vor Ort)

**Ziel:** Aus einem `partner_leads`-Prospect heraus einen **Onboarding-Termin** legen, um den Partner zu gewinnen. **Online** (Video-Call-Link) oder **vor Ort** (Besuch beim Partner). Prospect bekommt eine Einladung; der Termin liegt im Admin/KB-Kalender.

**Anker = `admin_termine`** (nicht neu bauen): hat bereits `titel/beschreibung/start_zeit/end_zeit/zugewiesen_an/status` + **Kalender-Sync** (`google_event_id`, `caldav_*`, `ms_event_id`) + Admin-Kalender-Rendering.

**Additive DDL auf `admin_termine`** (via Supabase-Plugin `apply_migration`):
- `partner_lead_id uuid null references partner_leads(id)` — Bezug zum Prospect (bestehendes `lead_id` FKt auf claim-`leads`, nicht partner_leads → eigene Spalte).
- `kanal text null` — `'online' | 'vor_ort'`.
- `video_link text null` — bei online (Meet/Jitsi-Link).
- `treffpunkt_adresse text null` + `treffpunkt_lat/lng double precision null` — bei vor Ort (geokodiert via ⑤).
- Neuer `typ`-Wert `'partner_onboarding'`.

**Flow:**
1. Im Lead-Detail-Drawer: Button „Termin legen" → Modal (Datum/Zeit, Kanal online/vor-Ort, bei online optional Link / bei vor-Ort Adresse→⑤-Geocode, zugewiesen_an default = aktueller Staff).
2. Server-Action `legePartnerOnboardingTermin(leadId, input)` (`{ ok, error? }`): `admin_termine`-Insert (typ=partner_onboarding, partner_lead_id, kanal, …) + **Auto-Log** als `partner_lead_aktivitaeten` (typ='sonstiges', „Onboarding-Termin am …"). Bestehender Google-/CalDAV-Sync greift automatisch (admin_termine ist schon angebunden).
3. **Einladung an den Prospect** (best-effort, non-critical): Mail mit Datum + Kanal + Link/Adresse + **ICS-Anhang** (reuse bestehender ICS-Generierung falls vorhanden, sonst minimaler VEVENT-Builder).
4. Anzeige der offenen Termine im Lead-Drawer (Liste) + im Admin-Kalender (schon vorhanden via admin_termine).

**Entschieden (Aaron 08.07.):** Video-Link **automatisch als Google Meet, 30 Min Dauer**. Beim Anlegen eines online-Termins erzeugt die Google-Calendar-API (admin_termine synct eh nach Google) via `conferenceData.createRequest` + `conferenceDataVersion=1` einen Meet-Link; `video_link` wird aus der API-Antwort gespeichert, `end_zeit = start_zeit + 30 Min`. Fallback (keine Google-Verbindung des Staff / API-Fehler): Termin bleibt bestehen ohne Link, Warnung im UI.

---

## ④ CSV Smart-Mapping (KI-Vorschlag + manuelles Override)

**Problem heute:** `mapCsvZuLeads` matcht Spalten nur per Heuristik (feste dt./engl. Header) → bricht bei „falsch/ungewöhnlich benannt".

**Lösung — beides in einem (deckt „KI ODER manuell"):**
1. Nach Datei-Parse (`parseCsv`): **KI-Vorschlag** — ein LLM-Call (Anthropic, wie im Rest der App) bekommt die Header + 3–5 Beispielzeilen und liefert ein Mapping `{ csvSpalte → zielFeld | ignorieren }` für die Zielfelder (firma*, email, telefon, ansprechpartner_vorname/nachname, plz, ort, marken/notiz→rollen_details). Deterministischer Fallback = bestehende Heuristik, falls KI nicht verfügbar.
2. **Mapping-Panel (UI):** je CSV-Spalte ein Dropdown (Zielfeld / „ignorieren"), mit der KI-Zuordnung vorbelegt. Live-Vorschau der ersten Zeilen mit dem aktuellen Mapping. User kann jede Zuordnung überschreiben → **das ist die „manuell mappen"-Option**.
3. Import erst nach Bestätigung (wie heute); `firma` bleibt Pflicht; Adressen laufen durch ⑤.

**Server-Action** `schlageCsvMappingVor(header, sampleRows)` → `{ mapping }` (KI, mit Heuristik-Fallback). Reine Mapping-Anwendung bleibt clientseitig/`mapCsvZuLeads` (angepasst auf explizites Mapping statt Auto-Heuristik).

---

## ⑤ Geocoding (Google Maps, alle Eingänge, vollständige Adresse erzwingen)

**Problem heute:** `anlegePartnerKern` setzt `lat/lng=null` („Geocoding später") → konvertierte Partner fehlen auf Karte/Finder. Manuelle/CSV/Public-Form-Leads haben nur Text-Adressen.

**Lösung — ein geteiltes Util an allen Eingängen:** reuse `src/lib/google-geocoding/geocode-address.ts::geocodeAddress` (existiert, Google Maps).
- **Wo:** Scrape (Places liefert schon `formatted_address`; ergänzen um Geocode falls keine Koordinaten) · CSV-Import · manueller „Neuer Prospect" · Public-Form (`/werkstatt-partner-werden`) · **Convert** (setzt beim Anlegen die `lat/lng` der werkstatt/makler/sv-Row).
- **Vollständigkeits-Gate:** eine Adresse gilt nur als vollständig, wenn Google einen eindeutigen Treffer mit **Straße + PLZ + Ort** liefert. Sonst: **Warnung + kein stiller Insert/Convert** — der Nutzer ergänzt/bestätigt. (Convert ohne vollständige geokodierte Adresse blockiert für werkstatt/makler, da sie sonst nicht auf der Karte erscheinen; SV läuft über eigene Isochrone-Logik.)
- **Speicherung — Entschieden (Aaron 08.07.): Geocode schon beim Lead.** `partner_leads` bekommt additiv `lat/lng` (+ optional `strasse`, `google_place_id`). Jeder Lead-Eingang geokodiert sofort → CRM kann Prospects auf Karte zeigen, früh validiert; der **Convert übernimmt die geokodierten Koordinaten** in die werkstatt/makler/sv-Row (statt heute `null`).

---

## Reihenfolge + DDL-Zusammenfassung

1. **Phase 1** (läuft): #3725 + #3717 → 1 PR, kein DDL (nur Code; Places-Key existiert).
2. **⑤ Geocoding** zuerst von Phase 2 (Fundament für saubere Adressen; DDL: `partner_leads.lat/lng` additiv).
3. **④ CSV-Mapping** (nutzt ⑤ für Adressen).
4. **③ Onboarding-Termine** (DDL: `admin_termine` +partner_lead_id/kanal/video_link/treffpunkt_*).

Jede DDL via `apply_migration` (Regel 2). Jede Server-Action `{ ok, error? }` + `revalidatePath`. Umlaute in allen UI-Strings. Ratchets 0-neu.

## Entschieden (Aaron 08.07.)
- ③ Video-Link: **Auto-Google-Meet, 30 Min Dauer** (Calendar-API `conferenceData`).
- ⑤ Geocode: **schon beim Lead** (`partner_leads.lat/lng` additiv).
- ⑤ Convert bei unvollständiger Adresse: **hart blocken** (werkstatt/makler).
- Reihenfolge: **⑤ Geocoding → ④ CSV → ③ Termine**.
- Rest des Specs: approved.
