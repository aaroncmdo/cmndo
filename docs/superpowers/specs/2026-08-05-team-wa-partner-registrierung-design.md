# Team-WhatsApp bei Partner-Registrierung (Werkstatt / Makler / Gutachter) — Design

**Datum:** 2026-08-05 · **Auftrag:** Aaron („WhatsApp an uns bei Registrierung einer Werkstatt,
Makler oder Gutachter aus den Marketing-Seiten") · **Branch:** `kitta/team-wa-partner-signup`

## Problem

Alle Partner-Registrierungen aus dem Marketing-Funnel erzeugen heute nur **In-App-Sichtbarkeit**
(`benachrichtigungen`-Insert an Admins bzw. Admin-Task) — das Team sieht neue Partner erst beim
naechsten Blick ins Admin-Portal. Bei Kunden-**Leads** existiert dagegen seit 2026-05-20 der
Echtzeit-Kanal `notifyTeamWhatsApp` (Baileys → feste Team-Nummern, `src/lib/whatsapp/team-notify.ts`).
Der LP-embedded SV-Claim-Flow (`claimondo-marketing/lib/sv-basic/claim-actions.ts`) hatte bis
jetzt GAR keine Team-Benachrichtigung.

## Loesung (gewaehlter Ansatz)

**Ein Shared-Helper + 7 Call-Sites**, exakt im etablierten Lead-Notify-Muster:

`src/lib/partner/notify-team-signup.ts` → `notifyTeamPartnerSignup(opts)`
- baut einen kompakten WA-Text (Typ-Emoji, Firma, Ansprechpartner, Kontakt, Ort, Extras, Admin-Link)
- sendet via `notifyTeamWhatsApp` (feste Team-Nummern, eine Pflege-Stelle)
- **non-throwing + fire-and-forget** (AGENTS §Server-Actions, non-critical sub-op)
- **Gate `istInterneIdentitaet`** (`src/lib/testdaten/interne-identitaet.ts`): interne/Test-
  Registrierungen (@claimondo.de, example.*, test/smoke/e2e-Marker) loesen KEINE Team-WA aus —
  Muster `gutachter-finder-actions.ts` (sonst spammen Regel-4-Smokes + Gruender-Tests das Team).

### Call-Sites

| # | Flow | Datei | art | Admin-Link |
|---|---|---|---|---|
| 1 | Werkstatt-Self-Signup | `src/app/werkstatt/registrieren/actions.ts` | registrierung | /admin/werkstaetten |
| 2 | Werkstatt-Partner-Anfrage (Interesse-Prospect) | `src/app/werkstatt-partner-werden/actions.ts` | anfrage | /admin/partner-leads |
| 3 | Makler-Self-Signup | `src/app/makler/registrieren/actions.ts` | registrierung | /admin/makler |
| 4 | SV Cold-Pin-Claim (App) | `src/lib/sv-basic/claim-actions.ts` (8d) | registrierung | /admin/sachverstaendige/basic-freigaben |
| 5 | SV Neu-Registrierung (App) | `src/lib/sv-basic/claim-actions.ts` (9e) | registrierung | /admin/sachverstaendige/basic-freigaben |
| 6 | SV Cold-Pin-Claim (Marketing-LP embedded) | `claimondo-marketing/lib/sv-basic/claim-actions.ts` | registrierung | dito |
| 7 | SV Neu-Registrierung (Marketing-LP embedded) | `claimondo-marketing/lib/sv-basic/claim-actions.ts` | registrierung | dito |

Site 2 ist bewusst dabei (mit eigenem Label „Partner-Anfrage"): gleicher Funnel, gleiche
Team-Relevanz — im PR-Review streichbar, wenn nicht gewuenscht.

### Marketing-App (separater Build, eigene lib-Spiegel)

Die Marketing-App importiert nicht aus `src/` — sie bekommt (etabliertes Spiegel-Muster wie
`lib/whatsapp/baileys-client.ts`):
- `claimondo-marketing/lib/whatsapp/team-notify.ts` (Spiegel; `lib/leads/notify-new-lead.ts`
  behaelt seine Inline-Nummern vorerst — Konsolidierung erst nach Merge von #4950, das die Datei anfasst)
- `claimondo-marketing/lib/testdaten/interne-identitaet.ts` (schlanker Spiegel: nur Identitaets-Checks)
- `claimondo-marketing/lib/partner/notify-team-signup.ts` (Spiegel des Helpers)

## Verworfene Alternativen

1. **Event-Bus (`notification_events` → channel-matrix):** Rolle `admin` bekommt dort bewusst nur
   `in_app`; die C3-Notifications-Outbox ist noch nicht gebaut (C3a-Plan). Umbau des Busses fuer
   diesen Push-Blast = Overkill + kollidiert mit der C3-Lane.
2. **Direkter `notifyTeamWhatsApp`-Call pro Action ohne Helper:** 7 Call-Sites mit identischem
   Text-Bau = Redundanz (Audit-Punkt 3); das Intern-Gate wuerde pro Site vergessen werden koennen.

## Fehlerverhalten

Jeder WA-Fail (Baileys down, Config fehlt) wird nur `console.error`-geloggt — Registrierung
bleibt erfolgreich. Kein Retry, keine Queue (Muster notifyNewLead; die kuenftige C3-Outbox kann
das spaeter uebernehmen).

## Journey-Bezug (D1)

J8 „Onboarding je Rolle" — Soll-Delta im selben PR (`docs/fundament/journeys/j08-onboarding-je-rolle.md`):
Team-Echtzeit-Sichtbarkeit als Teil des gemeinsamen Onboarding-Musters. Ein automatisierter
Journey-Smoke-Assert ist fuer diesen Schritt **nicht** moeglich (echter externer WA-Send; interne
Test-Identitaeten werden vom Gate bewusst unterdrueckt) → Beweis via Regel-4-Prod-Smoke mit
externer Wegwerf-Identitaet, dokumentiert im PR.

## Test/Abnahme (Regel 4)

Nach Deploy: 1× `/werkstatt-partner-werden`-Anfrage mit **externer** Wegwerf-Identitaet (KEIN
test/smoke-Marker, keine claimondo-/example-Domain — sonst greift das Intern-Gate) → WA kommt
auf den Team-Handys an → Prospect in `/admin/partner-leads` wieder entfernen. Die uebrigen
Call-Sites sind derselbe Helper (nur Parameter); Flow-Regression der Registrierungen selbst via
bestehender Smokes.
