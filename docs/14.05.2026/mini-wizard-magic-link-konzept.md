# Mini-Wizard + Magic-Link-Brücke + Adaptives Onboarding

**Status:** Konzept — in Brainstorming am 14.05.2026 mit Aaron abgestimmt
**Trigger:** Smoke-Run der `/schaden-melden` Wizard hat Redundanz zwischen 4-Step-Selfservice und 5-Step-Onboarding aufgedeckt (insgesamt 9 Steps für was per Magic-Link-Pfad in 1 Step möglich ist)
**Reference:** `tests/e2e/flows/smoke-kunde-selfservice.spec.ts` (Smoke-Skript auf altem Wizard, wird mit Implementierung obsolet)

## Problemstellung

Heute existieren zwei parallele Lead→Fall-Wege:

| Pfad | Wer triggert | SA + Vollmacht | Onboarding nach | Steps gesamt |
|---|---|---|---|---|
| `/schaden-melden` Wizard | Kunde selbst | ❌ Nein, `sa_unterschrieben=false` | ✅ 5-Step Wizard `/kunde/onboarding` | 4 + 5 = **9** |
| `/flow/[token]` Magic-Link | Dispatch lädt ein | ✅ Ja, SA + Vollmacht inline | ❌ direkt `/kunde` | **1** |

Der Selfservice ist 9 Steps lang, der Dispatch-Lead ist 1 Step — das ist UX-Redundanz und doppelter Code-Pfad. Außerdem versteht der Marketing-Lead-Capture nicht, dass es nur Haftpflicht-Schäden gibt → Selbstverschuldete kommen erst nach Schritt 1 zum Exit, der Dispatcher sieht sie nicht.

## Ziel

**Ein Pfad** für Lead → Account → Fall mit:
- 4-Felder-Mini-Wizard zur Qualifizierung (Schuldfrage als Haftpflicht-Filter)
- Magic-Link-Brücke (WhatsApp bevorzugt via Baileys, Email-Fallback)
- SA + Vollmacht-Signatur im Magic-Link-Klick (existierender `signSAandCreateFall`-Pfad)
- Adaptives Onboarding nach Login: Steps werden nur gerendert wenn entsprechende Daten fehlen
- Termin-Buchung als gemeinsame Shared-Component für Onboarding + Fallakte + Re-Termin

## Architektur-Überblick

### Phase 1 — Mini-Wizard (anonym)

`GET /schaden-melden` (heute Redirect-Stub, künftig direkt der Mini-Wizard, kein `/schritt-1` mehr)

Form:
- Schuldfrage (Radio: Gegner / Unklar / Selbst-schuld)
- Unfalldatum (datetime-local) + Unfallort (Google-Place-Autocomplete)
- Email
- Telefon (+49 …)
- DSGVO-Consent-Checkbox

Submit-Server-Action `createLeadFromMiniWizard`:
1. Lead-Row insert in `leads` mit minimal Felder + `qualifizierungs_phase`:
   - `gegner` / `unklar` → `'in-qualifizierung'`
   - `selbst` → `'disqualifiziert'`
2. Fire-and-forget: `void checkWhatsAppViaBaileys(leadId, telefon)` (siehe Phase 1b)
3. Wenn nicht disqualifiziert: `flow_links` Token erstellen + `dispatchMagicLink(...)` aufrufen
4. Response liefert `{ ok: true, redirect: '/schaden-melden/link-versendet' | '/schaden-melden/selbstverschulden' }`

Bestätigungs-Page `/schaden-melden/link-versendet`:
- Zeigt "Wir haben dir gerade einen sicheren Login-Link an `mas***@example.com` (oder per WhatsApp an `+49 …45`) geschickt"
- Erklärt: Klick öffnet Signatur-Page, danach landest du im Kundenportal
- Resend-Button (rate-limited: 1×/Minute, max 3×)

Selbstverschulden-Page `/schaden-melden/selbstverschulden`:
- Lead bleibt in DB als `qualifizierungs_phase='disqualifiziert'` (für Dispatch sichtbar)
- Soft-Filter, kein Magic-Link
- Zwei CTAs: "Anwalt prüfen lassen" (Re-Eval-Form) / "Kasko-Partner-Empfehlung"

### Phase 1b — Baileys-WhatsApp-Worker-Service

Baileys läuft **als eigener Node-Service auf dem VPS** (PM2-Process `claimondo-baileys`), nicht im Next.js-Server. Begründung:
- Persistente WA-Web-Session (file-based Auth-State in `/etc/claimondo/baileys-auth/`)
- Initial-QR-Login einmalig durch Aaron (SSH auf VPS → `pm2 logs claimondo-baileys` zeigt QR-Code im Terminal → mit Handy scannen)
- Reconnect-Loops + Keepalive ohne Next.js-Cold-Starts zu blockieren
- Eigener Restart-Cycle wenn WA-Session expired (Banning-Risiko isoliert)

**Service-Layout:**
```
/opt/claimondo-baileys/
  package.json
  src/
    server.ts        # Express-API auf localhost:4001
    baileys-sock.ts  # connect, reconnect, auth-state
    routes/
      lookup.ts      # POST /lookup { phone } → { hasWhatsApp }
      send.ts        # POST /send { phone, text, mediaUrl? } → { sent, messageId }
  auth/              # Baileys session files (gitignored, backup im VPS)
```

**Interne API (nicht öffentlich, nur via localhost-Proxy):**
- `POST /lookup` Body `{ phone: "+4915112345678" }` → `{ hasWhatsApp: true, jid: "4915112345678@s.whatsapp.net" }` über `sock.onWhatsApp([phone])`
- `POST /send` Body `{ phone, text }` → `{ sent: true, messageId }` über `sock.sendMessage(jid, { text })`
- Shared-Secret-Header `X-Internal-Token: ${BAILEYS_INTERNAL_TOKEN}` aus `.env.local` (auch im Baileys-Service-Env)

**Next.js-Integration:**
- `src/lib/whatsapp/baileys-client.ts` — typisierter Wrapper um die HTTP-API
- `BAILEYS_BASE_URL` = `http://localhost:4001` in `.env.local` auf VPS (Lokal-Dev: nicht gesetzt → Methoden return `{ hasWhatsApp: false, sent: false }` und überspringen WA)

**Fail-Modes:**
- Baileys-Service down → `checkWhatsAppViaBaileys` liefert `null` → `hat_whatsapp` bleibt `null` → Magic-Link geht via Email (saubere Degradation)
- Number-Ban (WhatsApp sperrt unsere Web-Session): Aaron bekommt Sentry-Alert, muss QR-Re-Login machen, in der Zwischenzeit alle Magic-Links via Email. **Risiko-Akzeptanz**: ToS-Grauzone, aber für Lead-Capture-Use-Case bei moderatem Volumen tolerabel. Bei Skalierung > 1000 Magic-Links/Tag auf offizielle WhatsApp Business API umstellen.

### Phase 2 — Magic-Link-Klick (SA + Vollmacht-Signatur)

`GET /flow/[token]` — existierender Pfad, **keine Änderungen am Signatur-UI nötig**.

Refactor in `src/app/flow/[token]/actions.ts:signSAandCreateFall`:
- Akzeptiert künftig Leads mit `qualifizierungs_phase='in-qualifizierung'` (heute vermutlich erwartet `'qualifiziert'`) — kleines Schema-Branching
- `onboarding_complete=false` bleibt gesetzt → triggert Phase 3
- Setzt `auth.users.user_metadata.from_mini_wizard=true` (für Analytics/Tracking, kein Funktions-Gate)

### Phase 3 — Adaptives Onboarding `/kunde/onboarding`

`/kunde/page.tsx` redirected weiterhin auf `/kunde/onboarding` wenn `onboarding_complete=false`.

`OnboardingWizard.tsx` Refactor:
- Reine Funktion `getOnboardingSteps(claim: ClaimFull): StepId[]`
- Steps-Reihenfolge stabil: `welcome → fall → zb1 → fotos → gegner → termin → fertig`
- Filter pro Step:

| Step | Skip wenn… | Pflicht? |
|---|---|---|
| welcome | nie | nein, aber 1s Intro-Animation |
| fall | nie | ja (Übersicht) |
| zb1 | `claim.fahrzeug_hsn AND fahrzeug_tsn AND fahrzeug_fin` alle gesetzt | nein |
| fotos | `claim.fotos.length >= 3` | nein |
| gegner | `claim.gegner_name AND claim.gegner_kennzeichen` gesetzt | nein |
| **termin** | nie | **ja — einziger harter Pflicht-Step** |
| fertig | nie | ja (Abschluss) |

Pflichtdokumente bleiben als **Banner-Section auf Fallakte** sichtbar (`PflichtdokumenteSection`, CMM-33) — kein separater Onboarding-Step, weil Kunden sie über Tage nachreichen.

## Termin-Picker-Konsolidierung

Heute drei Stellen mit jeweils eigenem Code:
- `OnboardingWizard.tsx` Step Termin (via `getFreieSlotsFuerKunde`)
- `kunde/re-termin/[token]/ReTerminPickerClient.tsx` (Re-Booking)
- vermutlich inline-Termin-Card in `kunde/faelle/[id]`

**Soll:** Eine Shared-Component `src/components/shared/termin/TerminPicker.tsx`:

```ts
type TerminPickerProps = {
  fallId: string
  mode: 'erstbuchung' | 'verlegung'
  currentTerminId?: string                  // bei mode='verlegung'
  onBooked: (termin: BookedTermin) => void  // Caller entscheidet was danach
  showAnfahrtHinweis?: boolean
}
```

- Slot-Daten kommen aus zentralem Loader `getFreieSlotsFuerFall(fallId)` in `src/lib/termine/freie-slots.ts`
- Submit-Action:
  - `mode='erstbuchung'` → `bucheNeuenTermin(fallId, slotId)` → `gutachter_termine.status='reserviert'`
  - `mode='verlegung'` → `verlegeTermin(currentTerminId, slotId)` — nutzt AAR-864 State-Machine (siehe Memory `project_termin_kalender_modell`)
- Liefert keine Navigation; der Caller entscheidet (Onboarding-Step weiter, Detail-Page Toast, Re-Termin-Page Redirect)

Einsatz nach Refactor:
- `/kunde/onboarding` Step termin → `<TerminPicker mode="erstbuchung" />`
- `/kunde/faelle/[id]` Fallakten-Section "Termin verlegen"-Drawer → `<TerminPicker mode="verlegung" currentTerminId=... />`
- `/kunde/re-termin/[token]` → Token-Validation + `<TerminPicker mode="verlegung" />`

## Datenmodell-Änderungen

**`leads`:**
- ➕ `hat_whatsapp BOOLEAN` (nullable, default NULL = noch nicht geprüft via Baileys)
- ➕ `whatsapp_geprueft_am TIMESTAMPTZ` (Cache, Re-Check nach 90 Tagen)
- ✏️ `qualifizierungs_phase` CHECK-Constraint erweitert um `'disqualifiziert'`

**Migration via Supabase CLI** (AGENTS.md Regel 2 — niemals Management-API für DDL):

```bash
npx supabase migration new add_whatsapp_check_to_leads
# SQL in die generierte Datei:
ALTER TABLE leads
  ADD COLUMN hat_whatsapp BOOLEAN,
  ADD COLUMN whatsapp_geprueft_am TIMESTAMPTZ;

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_qualifizierungs_phase_check;
ALTER TABLE leads
  ADD CONSTRAINT leads_qualifizierungs_phase_check
  CHECK (qualifizierungs_phase IN (
    'kalt','in-qualifizierung','qualifiziert','konvertiert',
    'verloren','disqualifiziert'
  ));

npx supabase db push
```

**`flow_links`:** keine Schema-Änderung, nur neuer `kanal`-Wert `'mini-wizard'`.

**`faelle`:** keine Änderung — `signSAandCreateFall` setzt bereits korrekt `sa_unterschrieben` + `onboarding_complete=false`.

## Magic-Link-Versand

`src/lib/magic-link/dispatch-magic-link.ts` (neu):

```ts
export async function dispatchMagicLink(opts: {
  leadId: string
  token: string
  email: string
  telefon: string
}): Promise<{ kanal: 'whatsapp' | 'email' | 'both-failed'; sent: boolean }> {
  // 1. Bis zu 3s warten ob Baileys-Lookup das Lead-Flag schon gesetzt hat
  //    (Twilio-Race-Condition: Lookup fire-and-forget aus createLead)
  const hatWa = await pollLeadHatWhatsapp(opts.leadId, 3_000)

  // 2. WA bevorzugt
  if (hatWa === true) {
    const wa = await sendWhatsAppMagicLink(opts.telefon, opts.token)
    if (wa.sent) return { kanal: 'whatsapp', sent: true }
    // WA-Send fail → Email-Fallback
  }

  // 3. Email-Fallback (immer wenn WA nicht erfolgreich oder nicht verfügbar)
  const email = await sendEmailMagicLink(opts.email, opts.token)
  if (email.sent) return { kanal: 'email', sent: true }

  return { kanal: 'both-failed', sent: false }
}
```

`sendWhatsAppMagicLink` ruft den Baileys-Worker via interne API auf. Text-Template:

> Hi {vorname}, danke für deine Schadenmeldung bei Claimondo.
>
> Hier dein sicherer Login-Link (gültig 24 Stunden):
> {magic-link-url}
>
> Mit einem Klick legst du SA + Vollmacht ab und kommst direkt in dein Portal.

## Selbstverschulden-Soft-Filter

`/schaden-melden/selbstverschulden/page.tsx` Refactor:
- Lead wird **angelegt** mit `qualifizierungs_phase='disqualifiziert'`
- Kein Magic-Link, keine Email an Kunde
- Page-Content:
  - Header: "Bei Selbstverschuldung übernimmt das deine Kasko"
  - CTA 1 "Schuldfrage prüfen lassen" → öffnet Re-Eval-Mini-Form (Hergang detaillierter beschreiben) → Lead-Flag `re_pruefung_angefragt=true`, Task an Dispatcher
  - CTA 2 "Kasko-Anwalt empfehlen" → Conversion-Event tracken, Click-out zu Empfehlungs-Partner

Im Dispatch-Portal: Neuer Tab "Disqualifiziert (re-prüfen)" filtert `qualifizierungs_phase='disqualifiziert' AND re_pruefung_angefragt=true`.

## Migration + Rollout

**Bestandsleads:**
- One-Off-Script `scripts/reactivate-stale-wizard-leads.mjs` — sucht `leads WHERE qualifizierungs_phase='in-qualifizierung' AND created_at > NOW() - INTERVAL '30 days' AND NOT EXISTS (SELECT 1 FROM faelle WHERE faelle.lead_id = leads.id)` und schickt einmaligen Reaktivierungs-Magic-Link
- Manueller Trigger durch Aaron nach Deploy

**Routen-Redirects** (next.config.ts):
- `/schaden-melden/schritt-1` → `/schaden-melden` (301)
- `/schaden-melden/schritt-2*` → `/schaden-melden` (301)
- `/schaden-melden/schritt-3` → `/schaden-melden` (301)
- `/schaden-melden/schritt-4` → `/schaden-melden` (301)
- `/schaden-melden/selbstverschulden` bleibt (neuer Inhalt)

**Code-Löschungen:**
- `src/app/schaden-melden/schritt-{1,2,3,4}/` — komplette Ordner
- `src/lib/flow/schemas/{schritt1,schritt2c,schritt3,schritt4}.ts` — vorher prüfen ob andere Caller
- `src/lib/flow/upload-foto.ts`, `src/lib/flow/voice-extraction.ts`, `src/lib/flow/vision-result.ts` — vermutlich obsolet, prüfen
- `src/lib/actions/{create-lead,update-lead-fotos,update-lead-gegner,update-lead-zb1-manual,signup-and-convert}.ts` — größtenteils obsolet, `signupAndConvertLead` wird durch `signSAandCreateFall` (existiert) ersetzt
- `src/app/schaden-melden/_components/FlowShell.tsx` — wird durch Mini-Wizard-Shell ersetzt

**Code-Neu:**
- `src/lib/whatsapp/baileys-client.ts` — HTTP-Client zum VPS-Worker
- `src/lib/magic-link/dispatch-magic-link.ts` — Kanal-Switch-Logik
- `src/app/schaden-melden/page.tsx` — Mini-Wizard-Form (ersetzt Redirect-Stub)
- `src/app/schaden-melden/link-versendet/page.tsx` — Bestätigungs-Page
- `src/components/shared/termin/TerminPicker.tsx` — konsolidierter Termin-Picker
- `src/lib/termine/freie-slots.ts` — zentraler Slot-Loader
- `src/lib/termine/{buche-neuen-termin,verlege-termin}.ts` — Server-Actions
- VPS: `/opt/claimondo-baileys/` Worker-Service mit eigener `pm2 start` config

## Tests

E2E-Test `tests/e2e/flows/smoke-kunde-selfservice.spec.ts` (heute auf altem 4-Step-Wizard) wird komplett umgeschrieben:

1. `/schaden-melden` (Mini-Wizard) → 4 Felder ausfüllen + Submit
2. Mock-WA-Lookup: Playwright route-interception für `localhost:4001/lookup` → liefert `{ hasWhatsApp: false }`
3. Mock-Email-Send → liefert Magic-Link-Token
4. Direkt zu `/flow/[token]` navigieren mit dem gemockten Token
5. SA-Signatur-Pad bedienen (Canvas-Pointer-Events)
6. Verifizieren: Redirect auf `/kunde` → wegen `onboarding_complete=false` weiter zu `/kunde/onboarding`
7. Adaptive-Onboarding: nur Welcome/Fall/Termin/Fertig-Steps sichtbar (Fahrzeug-Daten fehlen → ZB1-Step rendert sich auch, Fotos fehlen → Fotos-Step rendert sich auch — Test prüft Step-Array)
8. Termin-Slot buchen über `<TerminPicker mode="erstbuchung" />`
9. Onboarding-Complete → `/kunde` → Fallakte sichtbar

Baileys-Worker selbst wird **nicht** im E2E gestartet — nur die HTTP-API gemockt. Unit-Test für den Worker liegt im `/opt/claimondo-baileys`-Repo (eigenes Repo, weil Worker eigener Service).

## Offene Punkte / Risiken

1. **Baileys-ToS-Risiko**: WhatsApp kann die Web-Session jederzeit sperren ohne Vorwarnung. Mitigation: Sentry-Alert auf Reconnect-Loops, Email-Fallback als Auto-Switch, manueller QR-Re-Login durch Aaron. Bei kommerzieller Skalierung > 1000 WA/Tag → migrieren auf offizielle WhatsApp Business API.

2. **DSGVO bei Baileys-Lookup**: `sock.onWhatsApp(['phone'])` sendet die Telefonnummer an WhatsApp-Server. Im DSGVO-Consent-Text muss erwähnt sein: "Wir prüfen, ob Ihre Nummer auf WhatsApp aktiv ist, um Ihnen Statusinformationen schneller zustellen zu können." Aaron / Datenschutz-Beauftragten freigeben.

3. **Magic-Link-Expiry**: `flow_links.expires_at` heute auf 24h gesetzt. Bei Mini-Wizard-Drop-Off-Reaktivierung verlängern auf 7d? Diskussion offen.

4. **Existing FlowLink-Smoke**: `tests/e2e/flows/flowlink-kunde.spec.ts` bleibt unverändert valide — testet den Magic-Link-Pfad selbst, ist von Mini-Wizard unabhängig.

5. **Promo-Code-Attribution**: Heute setzt `/schaden-melden/page.tsx` einen Cookie aus dem `?p=`-Param. Logik bleibt im Mini-Wizard, wird beim Lead-Insert in `leads.promotion_code_id` gemappt — keine UX-Änderung.

## Implementations-Reihenfolge

Empfehlung für PR-Slicing:

1. **PR 1** — Baileys-Worker-Service auf VPS aufsetzen (eigenes Repo / Ordner, pm2-Config, QR-Login-Flow)
2. **PR 2** — `src/lib/whatsapp/baileys-client.ts` + `src/lib/magic-link/dispatch-magic-link.ts` mit Email-Only-Fallback (Baileys-URL noch nicht gesetzt → läuft sauber im Dev)
3. **PR 3** — `TerminPicker` Shared-Component + Server-Actions, **zuerst** in `re-termin`-Route einsetzen (kleinster Risikoradius), dann Onboarding, dann Fallakte
4. **PR 4** — Migration `leads` Schema (hat_whatsapp + qualifizierungs_phase-Constraint)
5. **PR 5** — Mini-Wizard `/schaden-melden/page.tsx` + Bestätigungs-Page + Selbstverschulden-Refactor; Wizard-Steps 1–4 noch nicht löschen (parallel laufen lassen)
6. **PR 6** — Adaptiver Onboarding-Wizard mit Skip-Logic
7. **PR 7** — Bestandsleads-Reaktivierungs-Script + Old-Wizard-Code-Löschung + Routen-Redirects
8. **PR 8** — Smoke-Test umschreiben, alte E2E entfernen

Jeder PR landet zuerst auf `staging`, smoke + manueller QA durch Aaron, danach Merge auf `main`.

## Was nicht in diesem Konzept ist

- Native App / Mobile-Variante des Mini-Wizards (kommt separat, vermutlich identische Server-Actions, nur RN-UI)
- NFC-Unfallgegner-Flow (siehe Memory `project_nfc_unfallgegner_flow.md` — eigenes Konzept)
- Voice-Input-Modus aus altem Schritt-1 (`/schaden-melden/schritt-1/voice`) — heute wenig genutzt, wird mit dem Wizard zusammen entfernt; falls Re-Implementation gewünscht, separater Mini-Voice-Modus auf der Bestätigungs-Page
