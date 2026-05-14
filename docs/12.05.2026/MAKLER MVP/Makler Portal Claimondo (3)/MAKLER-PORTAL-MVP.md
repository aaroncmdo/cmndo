# Makler-Portal Claimondo — MVP-Status & Konsolidierung

**Stand:** 12.05.2026
**Verantwortlich:** Aaron (Build via Claude Code), Nicolas (Konzept/Strategie)
**Quellen:** April-Hi-Fi-Prototyp (25.04.2026) · Notion „Architektur v2" (17.04.2026) · Supabase-Schema (Projekt `paizkjajbuxxksdoycev`, heutiger Stand)

---

## TL;DR

Das Makler-Portal hat **drei Realitätsebenen**, die heute nicht synchron laufen: ein schlanker Hi-Fi-Prototyp (13 Screens, Telefon-Schnellanlage), eine ausführliche Notion-Vision v2 (Self-Service-Flow + Mini-CRM + Mehrsprachigkeit + Voice + KI), und ein DB-Schema, das schon 80 % der Mini-CRM-Strukturen vorbereitet hat (`makler`, `makler_fall_consent`, `makler_provisionen`, `flow_links`, Twilio-WA).

Für den **Pilot** (5–10 Versicherungsmakler in Köln/NRW) bauen wir den Prototyp-Stand vollständig aus, hängen ihn an die existierenden DB-Tabellen, ergänzen eine **zweite Anlage-Variante via WhatsApp-Magic-Link** und liefern Provisionen + Einstellungen + Empfehlungs-Tools mit echter Funktion. Mini-CRM, Voice, Mehrsprachigkeit, DAT-Ersteinschätzung bleiben Post-MVP.

---

## 1 · Quellenlage & Realitätsabgleich

| Ebene | Stand | Was drin ist | Lücke zum MVP |
|---|---|---|---|
| **A · Hi-Fi-Prototyp** | 25.04.2026, 13 Screens + Tweak-Panel + Prototype-Flow | LoginScreen + MagicLinkSent, OB1–OB3, Schnellanlage (5 States), Dashboard, Fall-Detail, je in Desktop+Mobile, DSGVO-Modal, Empty State | DSGVO ist Single-Modal (nicht pro Fall), Empfehlungs-Tools nur Mock, Provisionen/Settings nur „in Kürze", keine Variante B |
| **B · Notion-Architektur v2** | 17.04.2026, ~50 k Zeichen | Self-Service-Lead-Flow für Kunden (DE/TR/AR/RU/PL/EN + Voice + Claude Vision + DAT), Makler-Mini-CRM mit Akten-Read + Copilot, Promo-Code-System `?p=MK-AB12`, Provisions-Backend über `abrechnungen` | Vision ist Post-MVP (zu groß), aber Promo-Code-System + Hybrid-Freischaltung sind Pilot-relevant |
| **C · Supabase-Schema** | heute live | `makler` (1 Row, `status='pending'`-Default), `makler_fall_consent` (mit `consent_scope`), `makler_provisionen` (Tier-Logik, Hold-Periode, FK zu `abrechnungen`), `flow_links`, `airdrop_invitations`, `whatsapp_inbound_messages`, `notification_events`/`_deliveries`, `promo_clicks`, `promotion_codes` | UI-Layer komplett fehlt; einige Status-/Trigger-Werte (Enums) noch nicht entschieden |

**Konsequenz:** Wir bauen nicht „von 0" — wir bauen die UI auf eine bereits halb-fertige Datenbasis. Konzept-Entscheidungen müssen immer vor `makler.status`, `consent_scope`, `service_typ`, `trigger_event` etc. respektieren.

---

## 2 · Pilot-Ziel

- **Zielgruppe:** 5–10 selbständige Versicherungsmakler / Inhaber kleiner Maklerkanzleien, Köln/NRW, 45–60 J., 2–5 Anlagen/Monat. Oft Sekretärin erfasst.
- **Akquise-Trigger:** Direktansprache von Nicolas + 1 Webinar (Datum noch offen, koordiniert mit dem DAT-Rollout-Webinar mit Philipp Sedelmeier).
- **Was am Pilot-Tag funktionieren muss:** Self-Sign-up + Hybrid-Freischaltung → Login per Magic-Link → Onboarding (3 Screens) → Variante A *oder* Variante B Fall anlegen → DSGVO-konformer Consent pro Fall → Dashboard mit echten KPIs → Fall-Detail-Verlauf → Provisionen-Übersicht → IBAN in Einstellungen pflegen → QR-Code/Mail-Vorlage funktioniert.
- **Erfolgskriterien für den Pilot:**
  - 5+ Makler haben sich selbst registriert und wurden freigeschaltet
  - 10+ echte Mandanten-Übergaben innerhalb der ersten 4 Wochen
  - mind. 2 Variante-B-Übergaben (Mandant tippt selbst via WA) zur Validierung des Flows
  - 0 DSGVO-Beschwerden (Audit-Trail über `makler_fall_consent` belastbar)

---

## 3 · MVP-Funktionsumfang (was am Pilot-Tag funktionieren muss)

### 3.1 Auth & Onboarding

| Screen | Status Prototyp | MVP-Anforderung | DB-Anker |
|---|---|---|---|
| `/makler/einladung-anfordern` | **fehlt** | Public-Landing mit nur einem Feld (E-Mail), Headline „Werden Sie Claimondo-Partner". Nach Absenden: Bestätigung „Wir prüfen Ihre Anfrage und melden uns binnen 24 h" → schreibt `makler`-Row mit `status='pending'` und triggert Admin-Notification | `makler.status='pending'`, `makler.email` |
| `/makler/anmelden` | ✓ LoginScreen | E-Mail-Feld + „Login-Link zusenden" → Magic-Link via `email_otp_codes` (existiert, AAR-494, 5-Min-TTL, 3/h-Rate-Limit). Lookup `makler.email` — wenn `status='pending'` Hinweis „Ihre Anfrage wird noch geprüft", wenn `status='gesperrt'` Hinweis „Zugang gesperrt", sonst Magic-Link senden | `email_otp_codes`, `auth_remember_tokens` |
| `/makler/anmelden/gesendet` | ✓ MagicLinkSent | Bestätigung, 15-Min-Gültigkeit, „Link erneut senden" | — |
| `/makler/onboarding/1` | ✓ OB1 | „Willkommen bei [Vorname]" + Info-Block „E-Mail kennen wir aus Ihrer Anfrage, Rest später unter Einstellungen". KEINE Formularfelder — Vorname aus `makler.ansprechpartner_vorname` (vom Admin bei Freischaltung gepflegt) | `makler.ansprechpartner_vorname` |
| `/makler/onboarding/2` | ✓ OB2 | Provisions-Erklärung mit den **echten Beträgen** aus `makler.provision_betrag_komplett_netto` (default 100€) und `makler.provision_betrag_nur_gutachter_netto` (default 50€) | `makler.provision_betrag_*` |
| `/makler/onboarding/3` | ✓ OB3 | „Bereit für ersten Fall" + Recap-Karten + „Ersten Fall anlegen"-CTA | — |

**Wichtig:** Onboarding ist **idempotent**. Wer es überspringt, kann es jederzeit unter Einstellungen wieder starten. Nach erstem erfolgreichem Login wird `onboarding_completed_at` auf `makler` gesetzt (Migration nötig — bisher nicht im Schema).

### 3.2 Variante A — Schnellanlage am Telefon

**Route:** `/makler/fall-anlegen` (oder Dashboard → „+ Fall anlegen")

**Headline-Block:** „Mandant in 30 Sekunden weiterleiten" / Sub „Sie sind am Telefon — drei Felder reichen" / Info-Block (Light-Blue) „Den Rest klärt Claimondo per Rückruf in den nächsten 10 Minuten."

**Pflichtfelder (5 States: empty, filled, error, loading, success):**

| Feld | Typ | Validierung | DB-Mapping |
|---|---|---|---|
| Telefonnummer Mandant | Tel, intl. | E.164 + Inline-Validation | `leads.telefon` |
| Name Fahrzeughalter | Text | min. 2 Zeichen | `leads.vorname` + `leads.nachname` (Server-side gesplittet am letzten Leerzeichen) |
| Kfz-Kennzeichen | Mono, Auto-Caps | Format `XX-AB 1234` regex | `leads.kfz_kennzeichen` (Feld vorhanden? sonst Migration) |

**Pflicht-Checkbox (NEU vs. Prototyp — ersetzt DSGVO-Modal):**

> ☐ *„Mein Mandant hat der Übergabe an Claimondo zugestimmt"*
> + dezenter Link „Was bedeutet das?" → Sidesheet mit Volltext

- Submit-Button ist disabled bis Checkbox gesetzt
- On-Submit schreibt `makler_fall_consent` mit `consent_scope='minimal'` (default) und `consent_gegeben_am=now()`
- DSGVO-Text-Version sollte versioniert in `settings` liegen (Tabelle existiert)

**Optionaler einklappbarer Detail-Bereich:** Unfallzeit, Polizei vor Ort (Bool), Gegnerversicherung (Dropdown aus `versicherungen`-Tabelle, 95 Rows). Felder sind alle bereits im `leads`-Schema vorhanden.

**Submit-Flow:**

```
1. Validate + Submit
2. Insert `leads` Row (source_channel='makler_schnellanlage', makler_id, status='neu', qualifizierungs_phase='erstkontakt', sprache='de')
3. Insert `makler_fall_consent` Row (fall_id wird später per Trigger gemappt wenn lead → fall promoviert wird; vorerst direkt mit lead_id verknüpfen — Schema-Erweiterung nötig)
4. Trigger `notification_event` (event_type='makler.lead_eingegangen') → Worker schickt:
   - SMS/Anruf an Mandant (für Disposition, bestehender Flow)
   - E-Mail-Bestätigung an Makler
5. UI zeigt SuccessAlert „Übergeben. Ihr Mandant erhält in 10 Minuten…" 2 Sek
6. Auto-redirect → Dashboard
```

**State C (Validierungsfehler):** Inline-Error-Text unter Feld, Border `--c-destructive`.
**State D (Loading):** Button-Spinner, Felder disabled.
**State E (Success):** Button wird sekundär-grün, Card zeigt SuccessAlert.

### 3.3 Variante B — Mandant tippt selbst via WhatsApp-Magic-Link

**NEU — fehlt komplett im April-Prototyp. Dock an `flow_links` + Twilio-WA-Infra.**

**Route:** `/makler/fall-anlegen` mit Toggle oben („Ich tippe selbst" / „Mandant trägt selbst ein")

**Flow:**

```
1. Makler wählt Tab „Mandant trägt selbst ein"
2. Felder: Telefonnummer Mandant (einziges Pflichtfeld), optional Vorname/Nachname
3. Pflicht-Checkbox: „Mein Mandant erwartet diesen Link von mir und hat zugestimmt, dass er den Self-Service-Flow durchläuft"
4. Button: „WhatsApp-Link senden"
5. Backend:
   - Insert `leads` (status='neu_eingeladen', source_channel='makler_wa_einladung', makler_id, promotion_code_id)
   - Insert `flow_links` (lead_id, expires_at=now+72h, service_typ='komplett')
   - Insert `makler_fall_consent` (consent_scope='minimal', erfasst die Einwilligung des Makler-Mandant-Verhältnisses)
   - Trigger `notification_event` (event_type='lead.wa_einladung', channel='whatsapp', payload includes flow_links.token)
6. Twilio sendet WA-Template an Mandant:
   „Hallo [Vorname], Ihr Makler [Firma] hat Sie bei Claimondo angemeldet. Hier können Sie Ihren Schaden in 3 Minuten selbst eingeben: claimondo.de/schaden-melden?t=[token]"
7. UI zeigt Confirmation-Card: „Link versendet. Status sehen Sie im Dashboard unter ‚Einladungen unterwegs'"
8. Makler bekommt Push/E-Mail wenn Mandant den Link öffnet (`flow_links.geoeffnet_am`) und wenn er abschließt (`flow_links.abgeschlossen_am`)
```

**Mandanten-Sicht (existiert teilweise — Self-Service-Flow `/schaden-melden`):** Der Token-Flow `?t=...` muss `flow_links` matchen, Makler-Kontext vorbefüllen (Branding-Banner „Eingeladen von [Makler-Firma]"), und nach Abschluss `makler_provisionen` mit `trigger_event='lead_konvertiert'` + `service_typ='komplett'` schreiben.

**Edge Cases:**
- Link expired: Mandant sieht „Link abgelaufen, neuen Link beim Makler anfordern"
- Mandant ignoriert Link: Status bleibt `'erstellt'`, Makler sieht im Dashboard nach 24 h Hinweis „Mandant hat Link noch nicht geöffnet — nochmal senden?"
- Mandant öffnet Link, bricht ab: `flow_links.geoeffnet_am` gesetzt, `abgeschlossen_am=NULL` — Worker triggert nach 6 h eine Reminder-Mail

### 3.4 Dashboard

**Route:** `/makler/dashboard`

**Header:** „Guten Morgen/Tag, [Vorname Nachname]" + Monat in Mono („April 2026") + Primary-Button „+ Fall anlegen".

**4 KPI-Kacheln** (jeweils mit 4px Akzentbalken links):

| KPI | Quelle | Aggregation |
|---|---|---|
| Aktive Fälle (Ondo-blau) | `leads` JOIN `faelle` WHERE `makler_id=X` AND `status NOT IN ('abgeschlossen','storniert','disqualifiziert')` | COUNT, mit Delta zum Vormonat |
| Fälle diesen Monat (Navy) | `leads` WHERE `makler_id=X` AND `created_at` in current month | COUNT |
| Provision [Monat] (Grün) | `makler_provisionen` WHERE `makler_id=X` AND `status IN ('freigegeben','abgerechnet')` AND `trigger_at` in current month | SUM(betrag_netto_eur), Sub-Label „davon X abgeschlossen" |
| Forecast [Monat] (Amber) | `makler_provisionen` WHERE `makler_id=X` AND `status='pending'` AND `hold_until > now()` | SUM(betrag_netto_eur) |

**Fälle-in-Bearbeitung-Card:** Liste mit border-left in Status-Farbe, Mandant + Kennzeichen prominent, Status-Detail muted, Status-Pill rechts. 4 Status-Stufen:

| Status-Pill | Farbe | DB-Mapping |
|---|---|---|
| Rückruf läuft | amber | `leads.qualifizierungs_phase='erstkontakt'` AND `kein_termin` |
| Termin gebucht | blue | EXISTS `gutachter_termine` OR `termine` mit `fall_id` |
| Regulierung läuft | green | `faelle.aktuelle_phase IN (4,5,6)` (siehe `phase_transitions`) |
| In Prüfung | gray | `claim_payments` mit `status='ausstehend'` ODER `kanzlei_faelle.status='versicherungskontakt'` |

(Mapping bitte noch mit Aaron gegen `faelle.aktuelle_phase`-Enum + `phase_transitions` final abklopfen.)

**Empfehlungs-Tools-Block:** 3 Outline-Buttons (siehe 3.8).

**Variante B-Sektion (wenn Einladungen offen):** Card „Einladungen unterwegs" mit Liste der `flow_links` WHERE `makler_id=X` AND `status IN ('erstellt','geoeffnet')` — pro Eintrag Mandant-Tel-Anfang + „vor 2 h erstellt" + Status-Pill (gray „nicht geöffnet" / blue „geöffnet, noch nicht abgeschlossen") + Sekundär-Button „Erinnern".

### 3.5 Fall-Detail

**Route:** `/makler/faelle/[fall_id]` (oder via Magic-Link-Mail `/f/[token]` für Magic-Link-Variante)

**Magic-Link-Banner** (nur wenn aus E-Mail geöffnet ohne Login): Light-Blue, 36px, schließbar, „Geöffnet aus E-Mail · keine Anmeldung nötig" + Mail-Icon.

**Header-Card:** Fall-ID (Mono), Mandantenname (H3 Navy), Kennzeichen + Fahrzeug + Schadensart in einer Zeile. Status-Badge rechts.

**Verlauf (Timeline):** Vertikale Linie, pro Schritt:
- Erledigt: gefüllter Punkt in Status-Farbe
- Aktuell: gefüllter Punkt Ondo-Blau
- Zukunft: gestrichelter Outline-Punkt, 50 % Opazität
- Schritt-Titel H4 Navy, Datum-Detail Mono

Quelle: `timeline`-Tabelle (146 Rows, existiert) + `phase_transitions`. Pro Fall holt das UI alle Timeline-Einträge sortiert nach `erstellt_am`.

**Ansprechpartner-Card (unten):** Name + Telefon + E-Mail des zugewiesenen KB (`faelle.betreuer_user_id` → `profiles`).

**Was der Makler NICHT sieht im MVP** (Post-MVP via `consent_scope='vollzugriff'`): Dokumente, Chat-Verlauf, Gutachten, Zahlungseingänge.

### 3.6 Provisionen (eigener Tab)

**Route:** `/makler/provisionen`

**Header:** Monatswähler (Default aktueller Monat) + Summen-Banner: „Diesen Monat: X € freigegeben · Y € forecast"

**Tabelle (sortiert nach `trigger_at` desc):**

| Spalte | Quelle |
|---|---|
| Datum | `trigger_at` formatiert `DD.MM.YYYY` |
| Mandant | `leads.vorname + nachname` (gekürzt wenn DSGVO-Scope minimal) |
| Service-Typ | `service_typ` als Pill: „Komplett" (€100) / „Nur Gutachter" (€50) |
| Trigger | `trigger_event` als Pill: „Lead konvertiert" / „Fall reguliert" |
| Betrag | `betrag_netto_eur` |
| Status | `status` als Pill: pending (amber) / freigegeben (green) / storniert (gray, mit Tooltip-Grund) / abgerechnet (navy) |
| Hold bis | `hold_until` (nur bei `status='pending'`) |

**Footer:** Button „Aktuellen Monat als PDF" → triggert Worker, generiert `abrechnungen`-Row (existiert) und sendet PDF per Mail. Hinweis: PDF wird auch automatisch zum Monatsanfang versendet (vorhandener Cron-Job `abrechnung_reminders`).

**Pflicht-Verlinkung:** Footer-Link „Vollständige Provisionsvereinbarung" → öffnet PDF aus `vertragsvorlagen` (3 Rows, existiert).

### 3.7 Einstellungen

**Route:** `/makler/einstellungen` mit 4 Sub-Tabs:

| Sub-Tab | Felder | DB |
|---|---|---|
| Kanzlei | `firma`, `ihk_nummer`, `adresse_strasse`/`_plz`/`_ort` | `makler` |
| Person | `ansprechpartner_vorname`/`_nachname`, `telefon`, `email` (readonly nach erstem Login) | `makler` |
| Bankverbindung | `bank_iban`, `bank_bic`, `bank_kontoinhaber` | `makler` |
| Benachrichtigungen | 5 Switches: `neuer_lead`, `kanzlei_uebergabe`, `monats_abrechnung`, `provision_freigegeben`, `woechentlicher_report` | `makler.notification_preferences` (jsonb) |

**Footer-Sektion:** Provisionsvereinbarung als PDF · DSGVO-Auskunft (Magic-Link an Mail) · Konto löschen (DSGVO Art. 17, schreibt `dsgvo_loeschauftraege`).

### 3.8 Empfehlungs-Tools

**Im Dashboard-Block + eigener Tab `/makler/empfehlungs-tools`:**

| Tool | Funktion | DB |
|---|---|---|
| **QR-Visitenkarte** | Generiert PDF mit individuellem `?p=MK-XXXX`-Code (aus `promotion_codes`), bestellbar in 2 Varianten: Druck-PDF zum Selbstausdrucken / Bestellung über Printerei (Post-MVP) | `promotion_codes`, `promo_clicks` |
| **Mandanten-Mail-Vorlage** | Textbaustein mit Makler-Branding, Mandant-Platzhalter, individuellem Promo-Link → Copy-Button + Send-via-Outlook-Button | — |
| **Mandanten-WA-Vorlage** | (NEU) Vortext für WA-Nachricht ohne Magic-Link — für Makler die nicht Variante B nutzen wollen, aber dem Mandanten den Self-Service-Link schicken | — |
| **Schulungsvideo** | 3-Min-Loom-Video „So nutzen Sie Claimondo am Telefon" + Variante-B-Demo (1 Min) | — |

Alle Tools loggen Klicks (`promo_clicks` für Promo-Klicks bzw. Custom-Tracking für Vorlagen-Verwendung).

---

## 4 · Vor Pilot-Start zu revalidieren

| Punkt | Warum kritisch | Wer entscheidet | Bis wann |
|---|---|---|---|
| **DSGVO-Checkbox-Wording** | Rechtlich nicht trivial — Makler sammelt Daten für Claimondo, Auftragsverarbeitung? Eigenständige Verantwortlichkeit? | Anwalt + Nicolas | vor erster Schnellanlage im Live-Betrieb |
| **`consent_scope`-Semantik** | „minimal" = nur Übergabe, „vollzugriff" = Makler darf mitlesen. UI muss differenzieren wo welcher Scope greift. Aktuell wird nur „minimal" geschrieben. | Aaron + Nicolas | vor Mini-CRM-Phase (Post-MVP) |
| **IBAN-Pflicht zum Onboarding-Abschluss?** | Wenn ja, blockiert Pilot-Start. Wenn nein, riskieren wir Auszahlungs-Reibung später. Empfehlung: optional im Onboarding, Pflicht-Banner im Dashboard bis ausgefüllt. | Nicolas | vor Live-Onboarding |
| **`makler.provision_betrag_komplett_netto` Default 100 € / `nur_gutachter` 50 €** | Steht im Code, muss zur Provisionsvereinbarung passen. Wenn wir variabel pro Makler abweichen (Verhandlungssache), muss Settings-Tab das anzeigen können. | Nicolas + Maik | vor Vertragsversand |
| **`hold_until`-Dauer** | Standard im Code? Notion sagt nichts. Üblich: 14–30 Tage nach `lead_konvertiert` als Storno-Schutz. Forecast-KPI hängt davon ab. | Nicolas + Aaron | vor Live-Provisions-Trigger |
| **„Forecast Monat"-Definition für Makler-UX** | Aktuell = SUM(pending). Risiko: Makler erwartet diesen Betrag, bekommt aber nur freigegebenen. UI muss klar kommunizieren: „forecast" ≠ „garantiert". Empfehlung: Tooltip + Sub-Label. | Nicolas | vor Dashboard-Launch |
| **DSGVO bei Variante B (WA-Versand)** | Makler schickt Mandanten-Tel an Twilio — Auftragsverarbeitungsverhältnis? AV-Vertrag mit Twilio existiert? | Nicolas + Anwalt | vor Variante-B-Launch |
| **Variante-B-WA-Template-Approval** | WhatsApp Business braucht für Erst-Outbound-Messages an Kunden ein **approved Template**. Muss bei Meta eingereicht werden — 2–5 Tage. | Aaron | mind. 1 Woche vor Pilot-Start |
| **`flow_links.service_typ='komplett'`-Default** | Bei Variante B greift dieser auf Provision: wenn Mandant nur das Gutachten will, bekommt der Makler trotzdem 100 €? Oder downgraded auf 50 €? | Nicolas | vor Variante-B-Launch |
| **Magic-Link-Sicherheit `flow_links.token`** | Aktuell `gen_random_bytes(16)` = 128 Bit, kein Hash in DB. Reicht für Mandanten-Self-Service? Bei airdrop_invitations wird gehashed gespeichert. Konsistenz prüfen. | Aaron | vor Variante-B-Launch |

---

## 5 · Optimierungs-Backlog (Post-MVP)

Klar nach dem Pilot. In Reihenfolge der Wirkung-Aufwand-Ratio:

1. **`consent_scope='vollzugriff'` mit Mini-CRM-Sicht für Makler** — Makler sieht Fallakte, Timeline, Dokumente, Chat. Wert für Berater-Positionierung enorm.
2. **Push-Notifications** an Makler via `push_subscriptions` (existiert) bei Status-Wechseln.
3. **Mehrsprachigkeit Variante B** — Mandant-Self-Service in 6 Sprachen (Schema-Feld `leads.sprache` existiert mit Check-Constraint, Tabelle ist da).
4. **Voice-Input im Self-Service-Flow** — Whisper + Claude-Sonnet-Extraktion (Architektur v2 dokumentiert).
5. **DAT-Ersteinschätzung-Integration** im Variante-B-Flow — Mandant bekommt Kostenrange schon vor Vor-Ort-Termin.
6. **Bulk-Einladung** — Makler kann CSV mit Mandanten hochladen und an alle eine personalisierte Outreach-WA verschicken.
7. **Multi-User pro Kanzlei** — Sekretärin und Inhaber als separate User mit gemeinsamem `makler_id`. Strukturell schon im Prototyp (Avatar-Initialen-Slot) vorgesehen, DB-seitig Migration nötig (`makler_memberships`).
8. **QR-Visitenkarten-Druckdienst** — Bestellung via API an Online-Druckerei.
9. **Wöchentlicher Report-Mail** an Makler — Trigger ist bereits in `notification_preferences` vorgesehen (`woechentlicher_report`), aber Inhalt + Worker fehlen.
10. **Makler-Mikrosite** `/m/MK-AB12` mit eigenem Branding (Notion v2 Phase 2).
11. **PWA + Install-Prompt** für Mobile-Schnellanlage — Add-to-Homescreen, Offline-Save für Anlagen wenn Funkloch.

---

## 6 · Datenmodell — Andocken an bestehende Tabellen

**Bereits existiert (NICHT neu anlegen!):**

```
makler                       — Stammdaten, Provisions-Sätze, Bank, Status, Notification-Prefs
makler_fall_consent          — Consent pro Fall (scope minimal/vollzugriff), Widerruf
makler_provisionen           — Provisionen-Ledger (service_typ, trigger_event, hold_until, status, FK auf abrechnungen)
flow_links                   — Generische Magic-Links für Lead/Fall mit Token + expiry
airdrop_invitations          — Magic-Link Pattern mit Token-Hash (Vorbild für gehärtete Links)
whatsapp_inbound_messages    — Twilio Inbound-Webhook-Staging
notification_events          — Domain-Events (fan-out worker)
notification_deliveries      — Per-Empfänger × Channel Delivery-Log (Twilio MessageSID)
notification_preferences     — User-seitige Channel + Event Opt-outs
promo_clicks                 — Click-Tracking ?p=MK-xxxx
promotion_codes              — Promo-Code-Stammdaten
leads                        — Hauptobjekt Lead-Stage
faelle                       — Fall (nach Konversion aus Lead)
abrechnungen                 — generisch (auch für Maik-Provisionen genutzt)
email_otp_codes              — 6-stellige OTP für Magic-Link-Login (AAR-494)
auth_remember_tokens         — Persistente Login-Tokens
vertragsvorlagen             — Templates für PDFs (Provisionsvereinbarung)
dsgvo_loeschauftraege        — DSGVO Art. 17 (Konto-Löschung)
settings                     — Konfig (z. B. DSGVO-Text-Version)
phase_transitions, timeline  — Fall-Verlauf für Fall-Detail-Timeline
```

**Migrationen die wir vermutlich brauchen (mit Aaron klären):**

- `makler.onboarding_completed_at TIMESTAMPTZ` — damit der Onboarding-Flow nicht erneut bei jedem Login getriggert wird
- `makler.consent_to_dsgvo_template_version TEXT` — was hat der Makler unterschrieben (Provisionsvereinbarung-Version)
- `leads.kfz_kennzeichen TEXT` (prüfen, ob's das schon gibt — falls nicht, anlegen mit Auto-Caps-Trigger)
- `makler_fall_consent.lead_id UUID NULL` — aktuell ist nur `fall_id` da, aber zum Anlage-Zeitpunkt haben wir noch keinen Fall, nur einen Lead
- `flow_links.makler_id UUID NULL` — wer hat den Link erstellt (für Variante B + Dashboard-Filter „Einladungen unterwegs")

---

## 7 · UI-Komponenten aus Claimondo Design System

Wir verwenden ausschließlich existierende Klassen — KEINE neuen Komponenten anlegen, außer in Ausnahmen (markiert mit ⚠️):

| Use-Case | Klasse / Token |
|---|---|
| Primary-Button | `btn-default` (Navy) `btn-lg` für Form-Submits |
| Sekundärer Button | `btn-outline` |
| Stiller Aktions-Button | `btn-ghost` |
| Status: Rückruf läuft | `pill-amber` |
| Status: Termin gebucht | `pill-blue` |
| Status: Regulierung läuft | `pill-green` |
| Status: In Prüfung | `pill-gray` |
| Status: Fehler | `pill-destructive` |
| Card | `card` |
| Info-Block (Light-Blue) | `alert-info` |
| Success-Banner | `alert-success` |
| Validierungsfehler-Banner | `alert-destructive` |
| Form-Feld | `field` mit Label oben, 32px Höhe, Focus-Ring 3px Ondo-Blau |
| KPI-Karte | `kpi-card` mit `--accent-*`-Variable (4px Akzentbalken links) |
| Fall-Karte (Liste) | `case-row` mit `border-left` in Status-Farbe |
| Sidebar-Item aktiv | `nav-item-active` (Navy-BG, weiße Schrift) |
| Magic-Link-Banner | `alert-info` 36px, schließbar mit X |
| ⚠️ Variante-B-Tab-Toggle | Tab-Component evtl. neu nötig — vorher prüfen ob `tabs-toolbar` existiert |
| ⚠️ Provisions-Tabelle | `table` falls vorhanden, sonst `case-row` adaptieren |

**Typografie:** Montserrat 300/400/500/600/700, JetBrains Mono für Labels/Codes/IDs/Kennzeichen/Datum.
**Farben:** Navy `#0D1B3E`, Ondo-Blau `#4573A2`, Light-Blue `#7BA3CC`, BG `#f8f9fb`, Card `#ffffff`, Border je System.
**Brand-Voice:** Sie-Form, echte Umlaute, Aktionen als Verben, Datum `12.05.2026`, Uhrzeit `14:32`, Währung `1.120 €` (Tausender-Punkt + Leerzeichen vor €).

---

## 8 · Empfohlene Datei- und Routenstruktur

```
src/app/(makler)/
├── einladung-anfordern/page.tsx           # Public, Self-Sign-up → makler.status='pending'
├── anmelden/
│   ├── page.tsx                            # LoginScreen (E-Mail + Magic-Link-Trigger)
│   └── gesendet/page.tsx                   # MagicLinkSent
├── onboarding/
│   ├── 1/page.tsx                          # OB1 Willkommen
│   ├── 2/page.tsx                          # OB2 Provisionserklärung
│   └── 3/page.tsx                          # OB3 Bereit für ersten Fall
├── dashboard/page.tsx                      # S2 Dashboard
├── fall-anlegen/page.tsx                   # Variante A + B Toggle, States A/B/C/D/E
├── faelle/
│   ├── page.tsx                            # Fall-Liste (Filter alle/aktiv/abgeschlossen)
│   └── [fall_id]/page.tsx                  # S3 Fall-Detail mit Timeline
├── provisionen/
│   ├── page.tsx                            # Übersicht aktueller Monat
│   └── [yyyymm]/page.tsx                   # Monatsdetail + PDF-Download
├── empfehlungs-tools/page.tsx              # QR + Mail-Vorlage + WA-Vorlage + Video
└── einstellungen/
    ├── kanzlei/page.tsx
    ├── person/page.tsx
    ├── bankverbindung/page.tsx
    └── benachrichtigungen/page.tsx

src/app/m/[promo_code]/page.tsx             # Makler-Mikrosite (Post-MVP)
src/app/f/[token]/page.tsx                  # Fall-Detail über Magic-Link ohne Login

src/app/api/makler/
├── einladung-anfordern/route.ts            # POST → makler INSERT pending
├── fall-anlegen/route.ts                   # POST → leads INSERT + makler_fall_consent
├── fall-einladen-wa/route.ts               # POST → flow_links + notification_event
└── provisionen/[yyyymm]/pdf/route.ts       # GET → abrechnungen PDF

src/components/makler/
├── SchnellanlageCard.tsx                   # 5-State-Card aus Prototyp übernehmen
├── KPICard.tsx                             # 4px-Akzentbalken-Variante
├── CaseRow.tsx                              # border-left in Status-Farbe
├── ConsentCheckbox.tsx                     # Pflicht-Checkbox + Sidesheet
├── WAEinladungCard.tsx                     # Variante B Form
├── ProvisionsRow.tsx                       # Tabellen-Row für Provisionen-Tab
└── MaklerLayout.tsx                        # Sidebar 240px + Hauptbereich

src/lib/makler/
├── provisionen.ts                          # Forecast-/Freigegeben-Aggregation
├── consent.ts                              # makler_fall_consent helpers
├── flow-links.ts                           # Token-Generation, expiry, lookup
└── permissions.ts                          # makler.status-Checks
```

---

## 9 · Offene Fragen für Nicolas (vor Build-Start)

1. **Pilot-Datum** — wann startet die Akquise? Webinar-Termin mit Sedelmeier?
2. **Standard `hold_until`-Dauer** — 14 Tage? 30 Tage? Hängt vom Storno-Risiko ab.
3. **Provisionsvereinbarung-PDF** — gibt's eine aktuelle Fassung? Muss in `vertragsvorlagen` hinterlegt werden.
4. **WhatsApp Business Sender-Number** — bestätigt aktiv? Falls nein, Twilio-Sandbox als Fallback für Pilot OK?
5. **„Forecast Monat" vs. „Provision Monat"-Wording** — bleibt so oder wollen wir „Erwartet" / „Bestätigt"?
6. **Empty-State QR-Visitenkarte** — Druckdienst Phase 1 (nur PDF) oder Phase 2 (Online-Druckerei)?
7. **Frage zur Pilot-Auswahl** — alle 5–10 Makler in NRW, oder eher gemischt? Beeinflusst ob Mehrsprachigkeit Pilot-relevant ist.
8. **Self-Sign-up-Genehmigungs-Workflow** — wer wird beim Eintrag von `makler` Pending benachrichtigt (Nicolas-E-Mail, internes Slack, Admin-Dashboard)?
9. **DSGVO-Auftragsverarbeitung** — Muster-AV zwischen Makler und Claimondo nötig? Bei der Pilot-Akquise mitnehmen?
10. **Variante-B-Disclaimer** — Was sagen wir dem Mandanten der via WA reinkommt, *bevor* er anfängt Daten einzutippen? Eigene Mini-Landing oder direkt der Self-Service-Flow?

---

## Anhang A · Wireframe- und Hi-Fi-Referenz

Der vollständige April-Prototyp liegt im Workspace unter:

- `Makler Portal Claimondo (3).zip`
  - `Wireframes Maklerportal.html` — 13 Lo-Fi-Screens
  - `Maklerportal HiFi.html` — Hi-Fi-Stand mit Tweak-Panel
  - `hifi-screens.jsx`, `hifi-shared.jsx`, `prototype-screens.jsx` — Quellcode
  - `screenshots/overview.jpg` — Canvas-Übersicht

**Was sich seit dem Prototyp ändert (für Aaron):**

| Änderung | Wo im Prototyp | Begründung |
|---|---|---|
| DSGVO-Modal entfällt → Checkbox in Schnellanlage | `DsgvoModal` löschen, `SchnellanlageCard` erweitern | Pro-Fall-Dokumentation rechtlich nötig |
| Variante-B-Tab neu | `SchnellanlageCard` umhüllen mit Tab-Toggle | WA-Magic-Link-Flow für Mandanten-Self-Service |
| Provisionen + Einstellungen + Empfehlungs-Tools werden voll funktional | Heute „in Kürze verfügbar" | Pilot braucht das, DB ist da |
| Onboarding-Step 1: Vorname kommt aus `makler.ansprechpartner_vorname` | Heute Hardcode „Max Mustermann" | Echte Daten |
| KPI-Karten zeigen echte Aggregate aus `makler_provisionen` | Heute Mock-Werte | Echte Daten |
| Fall-Liste zeigt echte Mandanten + Status aus `leads` JOIN `faelle` | Heute Mock | Echte Daten |
| Empfehlungs-Tools-Buttons sind echt | Heute Klick = nichts | QR-PDF-Generator + Vorlagen-Copy + Loom-Link |

---

*Diese MD ist die Quelle der Wahrheit für den Pilot-MVP. Änderungen bitte als Commit dokumentieren oder in Notion „Architektur v2" gegenspiegeln, damit die drei Realitätsebenen synchron bleiben.*
