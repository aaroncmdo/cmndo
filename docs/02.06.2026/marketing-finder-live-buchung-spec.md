# Spec — Live-Slot-Buchung auf dem Marketing-Finder (`claimondo.de/gutachter-finden`)

**Datum:** 2026-06-02 · **Autor:** Claude (Marketing-Session) · **Status:** ENTWURF zur Koordination
**Kontext:** Aaron will auf der öffentlichen Karte echte **Sofort-Slot-Buchung** beim gewählten SV (statt App-Link / Rückruf-Anfrage).

## 0. Stand heute (was schon live ist)

- **SV-Profile sichtbar** (PR #2253): alle verifizierten SVs sind klickbare Profile auf der Karte (anon-Read-Breaker gefixt, `paket`-Gate geöffnet).
- **Anfrage-Wizard live** (PR #2259, dieser Branch): „Termin"-Tab = 2-Schritt-Wizard (Schaden → Kontakt + **Wunschtermin als Freitext-Datetime**) → `erstelleGutachterFinderAnfrage` → Dispatch-Task → **telefonische** Bestätigung. SV aus Karten-Klick vorausgewählt.
- **Das ist der Interim.** Die Live-Buchung ersetzt nur den **Wunschtermin-Schritt** durch einen echten Slot-Picker + sofortige Reservierung.

## 1. Ziel

Anon-Nutzer auf der Marketing-Karte:
1. klickt SV-Profil → Wizard,
2. sieht **echte freie Slots** des SV,
3. wählt einen Slot, gibt Kontaktdaten ein,
4. bekommt eine **sofort reservierte** (vorläufig bestätigte) Zeit.

## 2. Warum das NICHT trivial / nicht solo ist (die Kernspannung)

- **Kalender-Exposure:** freie Slots eines SV öffentlich (anon) lesbar zu machen ist heute **bewusst app-only**. Muss bewusst freigegeben werden — aber **nur freie Zeit-Slots**, NIE Event-Details/Titel/Kunden.
- **Buchungs-Missbrauch:** anon, das echte Termine schreibt → Bot-Spam blockiert SV-Kalender. Braucht Rate-Limit + Hold-Expiry + ggf. Verifikation.
- **Doppel-Arbeit / Kollision:** Slot-Berechnung + Reservierung werden **gerade aktiv gebaut**:
  - **Termin-Engine** — `src/lib/termine/engine/{slots,index,types}.ts` (Branch `kitta/termin-engine-p2-*`).
  - **AAR-940 / Monika anon-Self-Service** — `src/lib/self-service/issue-flowlink.ts`, `sv-matching-modul/match-and-slots.ts` (FlowLink → Matching → SA → Termin), Branch `gutachter-finder-self-service`.
  - **Verfügbarkeits-Cache** — `src/lib/kalender/cache-busy.ts` + `sync-to-cache.ts` (`sv_kalender_events_cache`).

→ **Wir bauen das Availability-/Reservierungs-Primitive EINMAL (in/auf der Termin-Engine) und konsumieren es, statt eine zweite anon-Buchung im Marketing zu erfinden.**

## 2.5 Bestehende Bausteine — WIEDERVERWENDEN statt neu bauen (Update 02.06.)

Linear-Recherche zeigt: die Slot-Buchungs-Bausteine existieren bereits — die
Marketing-Live-Buchung ist primär eine **Komposition**, KEIN neuer roh-anon-
Kalender-API. Das entschärft die Kalender-Exposure-Sorge erheblich (token-gated
statt roh-anon):

- **AAR-940 (DONE)** — Monika anon-Self-Service: anon-Anfrage → eigener FlowLink →
  Selbst-Quali (Wizard) → SA → **Termin selbst buchen**, token-gebunden + RLS-sicher,
  `check_gfa_rate_limit` (Abuse). **Das ist genau der anon-Buchungs-Flow.**
- **CMM-40 (DONE)** — `/kunde/re-termin/[token]`: public, token-gated Slot-Picker,
  zeigt freie Slots des SV (14 Tage), Kunde wählt → bucht. **RLS-Vorlage.**
- **AAR-900 (DONE)** — `TerminPicker` Shared-Component (Onboarding/Fallakte/Re-Termin).
- **AAR-195 (DONE)** — `getNextFreeSlotsForSv()` (freie-Slots-Primitive).

**Reframe:** Statt freie Slots roh-anon zu exponieren, gibt der Marketing-Finder
beim Buchen einen **Self-Service-FlowLink aus** (wie AAR-940) und routet in den
bestehenden **token-gated** Slot-Picker (CMM-40/AAR-900). Der Token ist das
Sicherheits-/Abuse-Gate; kein neuer roh-anon-Verfügbarkeits-Endpoint nötig.
→ Damit ist die Marketing-Live-Buchung ≈ „AAR-940-Flow, getriggert aus dem
Karten-Klick statt aus einer Dispatcher-Anfrage". Owner-Klärung mit AAR-939/940 +
Termin-Engine (`kitta/termin-engine-p2-3c`) nötig.

## 3. Vorgeschlagene Architektur (falls doch ein roh-anon-Pfad gewünscht — Fallback)

### 3.1 Anon-Availability-Primitive (Termin-Engine-Owner)
- **`SECURITY DEFINER`-Function** `oeffentliche_freie_slots(p_sv_id uuid, p_von date, p_bis date)` → `[{ start, end }]`.
  - Leitet sich aus `sv_kalender_events_cache` (busy) + SV-Arbeitszeiten/Engine-Slots ab.
  - Gibt **ausschließlich** freie Zeit-Fenster zurück — **keine** Event-Titel, Kunden, Orte.
  - Gate: nur für `verifiziert && ist_aktiv && geloescht_am IS NULL` SVs (gleiche Bedingung wie `sachverstaendige_anon_select_map_ready`).
  - `GRANT EXECUTE TO anon`. (Kein direkter Tabellen-Grant auf den Cache.)
- Begrenzung: nur N Tage Vorschau (z.B. 14), max. Slots pro Tag.

### 3.2 Anon-Reservierung (Termin-Engine-Owner)
- **`SECURITY DEFINER`-Function** `reserviere_oeffentlichen_slot(...)` → erzeugt einen **HOLD** (Status `vorlaeufig`, Expiry z.B. 30 Min) statt Hartbuchung, ODER eine `gutachter_finder_anfragen`-Zeile mit `wunschtermin = slot` + Flag `slot_reserviert`.
  - Missbrauchsschutz: Rate-Limit pro IP (z.B. via `client_ip` + Zeitfenster), Hold-Expiry-Cron, max. offene Holds pro IP/Telefon.
  - Dispatch/SV bestätigt den Hold → Hartbuchung (`gutachter_termine`). Bis dahin blockiert ein Hold den Slot nur temporär.
- **Idempotenz** + Konflikt-Handling (Slot inzwischen weg → 409 → Picker neu laden).

### 3.3 Marketing-UI (Marketing-Session)
- `GutachterFinderAnfrageWizard`: **Wunschtermin-Schritt → Slot-Picker.** Nach SV-Auswahl + Schadentyp:
  - `oeffentliche_freie_slots(svId, …)` laden (Server-Action, anon),
  - Slots als Tag/Uhrzeit-Grid,
  - Auswahl + Kontakt → `reserviere_oeffentlichen_slot(...)`,
  - Erfolgs-State „Termin reserviert — Bestätigung folgt".
- **i18n ×6** für den Wizard nachziehen (Interim ist German-only).
- Fallback: kein Slot frei / kein SV gewählt → der heutige Rückruf-Anfrage-Pfad (`erstelleGutachterFinderAnfrage`) bleibt als Graceful-Degradation.

## 4. Offene Entscheidungen (für Aaron / die Strecken-Owner)

1. **Hard-Booking vs Hold-with-Confirm?** Empfehlung: **Hold** (vorläufig) + Dispatch/SV-Bestätigung — schützt vor Bot-Hartbuchungen, behält den menschlichen Check.
2. **Missbrauchsschutz-Level:** Rate-Limit reicht, oder Turnstile/Captcha vor der Reservierung?
3. **Welche SVs live-buchbar?** Alle verifizierten, oder nur ein Paket-Tier (z.B. `pro`)?
4. **Owner des Availability-Primitives:** Termin-Engine-Strecke (`termin-engine-p2`) — die Marketing-UI konsumiert nur. Bitte bestätigen, damit kein Doppelbau.

## 5. Abhängigkeiten / Reihenfolge

1. Termin-Engine exponiert `oeffentliche_freie_slots` + `reserviere_oeffentlichen_slot` (DDL via Supabase-Plugin, Regel 2).
2. Marketing baut den Slot-Picker drauf + i18n.
3. Smoke: anon sieht echte Slots, Reservierung erzeugt Hold, Dispatch bestätigt, Doppelbuchung unmöglich.

## 6. Koordination

- **Mit:** `kitta/termin-engine-p2-*` (Slot-/Engine-Owner) + `gutachter-finder-self-service` / AAR-940 (anon-Self-Service-Buchung — gleiche Primitives).
- **Nicht** parallel eine zweite anon-Buchung im Marketing-Repo bauen.
- Interim (Anfrage-Wizard, PR #2259) deckt die UX ab, bis das Primitive steht.
