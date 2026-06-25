# KB-Konsultations-Cockpit — Design (AAR-956)

**Datum:** 2026-06-24
**Branch:** `kitta/aar-956-kb-konsultation-cockpit`
**Status:** Design (freigegeben durch Aaron, „ok go")

## Problem

Der Auto-Beratungstermin (gerade gebaut, `gutachter_termine.typ='kb_beratung'`, lead-gebunden,
`status='reserviert'`) ist heute **wertlos für den KB**: Er erscheint zwar in `/mitarbeiter/termine`
als Listenzeile „KB-Beratung · [Kunde]", aber

- die Zeile ist **statisch** — der einzige „Action" ist ein Klick, und für lead-gebundene
  Auto-Termine (kein Claim, `fall_id=NULL`) ist der `href` **`'#'` (toter Link)**; für claim-gebundene
  zeigt er auf `/faelle/[id]`, das der KB **gar nicht öffnen darf** (admin/dispatch-gated).
- es gibt **keinen Weg**, vom Termin aus den Kunden anzurufen, den Lead-Kontext zu sehen oder
  den Lead voranzubringen.

Der Beratungstermin ist der höchste Conversion-Hebel (Funnel-Abbrecher zurückholen), aber der KB
hat kein Werkzeug, um ihn zu nutzen.

## Ziel

Ein **KB-eigenes Konsultations-Cockpit** (`/mitarbeiter/konsultation/[terminId]`), das vom
Beratungstermin aus:

1. **Kontext zeigt** — wer ist der Kunde, wo steht der Lead, was ist sein Schaden/Fahrzeug.
2. **Anrufen lässt** — Aircall-Click-to-Call (bestehende `PhoneButton`-Infra).
3. **Lead voranbringt (schlank)** — **FlowLink erneut senden** (WA/SMS/Email); der Kunde macht
   den Flow selbst fertig (SV-Termin, SA, Claim-Erstellung laufen automatisch). KEIN direkter
   Convert / kein SV-Termin-Buchen durch den KB (Entscheidung Aaron: „FlowLink re-senden, schlank").
4. **Ergebnis loggt** — Disposition (`durchgeführt` / `nicht erreicht` / `verschoben`) + Notiz.

## Architektur-Treiber: RLS

Per `pg_policies` (verifiziert 2026-06-24) hat die Rolle `kundenbetreuer` auf `leads`
**ausschließlich** Zugriff, wenn ein **Claim** existiert mit `claims.lead_id = leads.id AND
claims.kundenbetreuer_id = auth.uid()` (Policies `leads_staff_all_consolidated` für ALL,
`leads_kanzlei_kb_select_consolidated` für SELECT). Funnel-Abbrecher haben **per Definition
noch keinen Claim** → der KB hat auf genau diese Leads **keinen RLS-Pfad**.

**Konsequenz:** Cockpit-Page UND alle Cockpit-Actions laufen über **`createAdminClient()`
(service-role)**, abgesichert durch einen **expliziten Ownership-Gate**: jede Operation lädt
zuerst `gutachter_termine` (id=terminId) per service-role und verifiziert
`termin.typ='kb_beratung' && termin.kb_id === user.id`. Das ist exakt das Muster der bestehenden
`kb-termin-reminder`-Crons (service-role + lead_id-Lookup) und vermeidet eine RLS-Migration
(kein Konflikt mit der laufenden Types-Capstone-Session).

**Kein DB-Change.** Das Cockpit nutzt nur bestehende Spalten: `gutachter_termine.notiz_intern`,
`durchgefuehrt_am`, `status`, `verlegung_initiator_kunde`, `start_zeit`, `end_zeit`; `leads.*`;
`timeline`; `flow_links` (read); optional `aircall_calls` (read).

## Komponenten

### 1. Shared Send-Core (Extraktion) — `src/lib/start-link/send-flowlink-multichannel.ts`

`sendFlowLinkMultiChannel` (in `src/app/dispatch/leads/[id]/_actions/flowlink.ts`) bindet heute
`createClient()` (KB-RLS) hart ein → für claim-lose Leads bricht es bei `if (!lead)` (Zeile 27),
weil der Lead-SELECT unter KB-RLS `null` liefert. Daher wird der Körper in eine Lib extrahiert,
die den DB-Client + Actor injiziert bekommt:

```
export async function sendFlowLinkMultiChannelCore(
  db: SupabaseClient,            // RLS-Client (dispatch) ODER admin-Client (KB)
  leadId: string,
  kanal: 'whatsapp' | 'sms' | 'email',
  actorId: string,              // für zugewiesen_an + timeline.erstellt_von
  telefonOverride?: string | null,
): Promise<{ success: boolean; error?: string; token?: string }>
```

Die Logik bleibt 1:1 (Kanonischer Link via `ensureCanonicalFlowLinkForLead`, Termin-Variablen,
3-Kanal-Versand, `persistFlowLinkVersand` via service-role, Lead-Status-Advance auf
`flow-gesendet`/`flow-versendet`, timeline-Insert). **`revalidatePath` wird aus dem Core
herausgezogen** in die jeweiligen Wrapper (Dispatch revalidiert Dispatch-Pfade, KB den
Konsultations-Pfad). Keine `'use server'`-Direktive (reine Lib → darf Typen/Helper nutzen).

### 2. Dispatch-Wrapper (Refactor) — `flowlink.ts` bleibt thin

`sendFlowLinkMultiChannel(leadId, kanal, telefonOverride?)` wird zum dünnen Wrapper:
`createClient` + `getUser` + `sendFlowLinkMultiChannelCore(supabase, leadId, kanal, user.id,
telefonOverride)` + `revalidatePath('/dispatch/leads/${leadId}')` + `revalidatePath('/dispatch/dashboard')`.
**Verhalten bit-identisch** — alle bestehenden Dispatch-Consumer (`DispatchFlowlinkPanel` u.a.)
bleiben unverändert.

### 3. Cockpit-Page — `src/app/mitarbeiter/konsultation/[terminId]/page.tsx`

Server-Component (`force-dynamic`). Ablauf:
1. `createClient()` → `getUser()` → KB (sonst `redirect('/login')`). Die `/mitarbeiter`-Layout-Gate
   (`requirePortalAccess(['kundenbetreuer','admin'])`) greift bereits.
2. `createAdminClient()` → Termin laden (`id=terminId`, select `id, typ, kb_id, lead_id, start_zeit,
   end_zeit, status, kanal, notiz_intern, durchgefuehrt_am`). Gate: `typ==='kb_beratung' &&
   kb_id===user.id`, sonst `notFound()`.
3. Lead-Kontext laden (service-role, via `termin.lead_id`): `vorname, nachname, telefon, email,
   service_typ, schaden_beschreibung, kennzeichen/fahrzeug-Felder, qualifizierungs_phase, status`.
4. FlowLink-Stand laden (service-role, `flow_links` für den Lead): zuletzt gesendet? wann? Kanal?
5. Render `KonsultationCockpit` (Client) mit den Daten.

### 4. Cockpit-UI — `src/app/mitarbeiter/konsultation/[terminId]/KonsultationCockpit.tsx`

`'use client'`. Sektionen (token-konform, `primitives.Button`/`shared`-Komponenten, Umlaute):
- **Kunde-Karte:** Name, `PhoneButton` (mode=`aircall`, variant=`card`, leadId gesetzt), Email,
  Schaden-Typ/Beschreibung, Fahrzeug/Kennzeichen.
- **Stand:** `qualifizierungs_phase` (lesbar gemappt) + FlowLink-Indikator („zuletzt gesendet
  am … via …" / „noch nie gesendet").
- **Termin-Info:** Datum/Uhrzeit (Berlin), Status-Badge, Kanal.
- **Aktionen:**
  - *FlowLink erneut senden:* 3 Buttons (WhatsApp/SMS/Email) → `sendeKonsultationsFlowLink`.
  - *Ergebnis loggen:* Disposition-Auswahl (`durchgeführt`/`nicht erreicht`/`verschoben`) +
    Notiz-Textarea → `protokolliereKonsultation`. „verschoben" blendet einen Datum/Zeit-Picker
    ein (reuse `WunschterminPicker` o. ä.) und sendet `neuStartIso` mit.

### 5. KB-Actions — `src/app/mitarbeiter/konsultation/[terminId]/actions.ts`

`'use server'`. Gemeinsamer privater Helper `ladeEigenenKbTermin(terminId, userId)`:
service-role-Lookup + Ownership-Gate, liefert `{ termin, leadId }` oder `null`.

- `sendeKonsultationsFlowLink(terminId, kanal): Promise<{ ok; error? }>`
  → `getUser` → `ladeEigenenKbTermin` → `sendFlowLinkMultiChannelCore(createAdminClient(), leadId,
  kanal, user.id)` → `revalidatePath('/mitarbeiter/konsultation/${terminId}')` +
  `revalidatePath('/mitarbeiter/termine')`. Mappt `{success}`→`{ok}`.

- `protokolliereKonsultation(terminId, disposition, notiz?, neuStartIso?): Promise<{ ok; error? }>`
  → `getUser` → `ladeEigenenKbTermin` → service-role-Update auf `gutachter_termine`:
  - `durchgeführt` → `durchgefuehrt_am=now`, notiz an `notiz_intern` anhängen.
  - `nicht erreicht` → notiz anhängen (kein Status-/Zeit-Change).
  - `verschoben` → `start_zeit=neuStartIso`, `end_zeit=+30min`, `status='bestaetigt'`,
    `verlegung_initiator_kunde=false` (KB-initiiert), notiz anhängen. Validierung: gültiges
    ISO-Datum + in der Zukunft.
  - Danach service-role-`timeline`-Insert (`lead_id`, `typ='system'`, `titel='KB-Beratung:
    <Disposition>'`, `beschreibung=notiz`, `erstellt_von=user.id`), non-fatal try/catch.
  - `revalidatePath` wie oben. Result-Object `{ ok; error? }`.

### 6. Listen-Link-Fix — `src/app/mitarbeiter/termine/page.tsx`

In der Row-`href`-Berechnung: für `t.typ === 'kb_beratung'` → `/mitarbeiter/konsultation/${t.id}`
(statt des toten `'#'` / unzugänglichen `/faelle/...`). Andere Typen (rueckruf/kunde/intern)
unverändert.

## Sicherheit

- Jede Action + die Page gaten hart auf `gutachter_termine.kb_id === user.id` (service-role-Lookup).
  Ein KB kann keinen fremden Termin öffnen/manipulieren (Page → `notFound()`, Actions → `{ok:false}`).
- `/mitarbeiter/*`-Layout gated bereits `['kundenbetreuer','admin']`.
- service-role wird nur **nach** bestandenem Ownership-Gate verwendet; der Lead wird nie ohne
  bestätigte Termin-Zugehörigkeit geladen.

## Bewusst NICHT im Scope (YAGNI / „schlank")

- Kein direkter Lead→Claim-Convert, kein SV-Termin-Buchen durch den KB (macht der Flow/Dispatch).
- Kein Voll-Fall-Hub / keine Lead-Feld-Bearbeitung (bleibt Dispatch).
- Keine neue RLS-Policy, keine Migration, kein Types-Regen.

## Testing

- **Unit (vitest):** `sendFlowLinkMultiChannelCore` (injizierter Mock-Client; 3 Kanäle, claim-loser
  Lead findet jetzt statt `null`) · `protokolliereKonsultation` (3 Dispositionen, Ownership-Gate
  reject, verschoben-Validierung) · `sendeKonsultationsFlowLink` (Gate-reject, ok-Mapping).
- **Build:** `npm run build` grün (Route/Server-Action → Voll-Build laut Audit-Punkt 1).
- **Ratchets:** token-audit / component-set / knip / termin-engine-contract. ⚠ Letzteres:
  `gutachter_termine`-Touch — KEINE neuen `.eq('lead_id')`/`.eq('sv_id')` außerhalb der Engine
  (die Cockpit-Lookups gaten auf `id`/`kb_id`, nicht `lead_id`/`sv_id` → contract-safe).
- **Live-Smoke (DB):** auto-rollback-Probe (Termin-Update + timeline-Insert + Gate-Reject eines
  fremden kb_id), kein persistenter Testdatensatz.

## Koordination (parallele Sessions)

- Touch `src/app/dispatch/leads/[id]/_actions/flowlink.ts` (Extraktion→Wrapper) — mögliche
  Überschneidung mit `kitta/aar-956-embed-reservierung-rueckruf`. Vor Task 1 prüfen, Marker setzen.
- Kein Migration/Types-Touch → kein Konflikt mit `kitta/types-capstone-regen` /
  `kitta/cmm49-gutachter-honorar`.
