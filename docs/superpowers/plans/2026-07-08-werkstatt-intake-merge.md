# Werkstatt-Intake-Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Werkstatt füllt auf `/werkstatt/anfragen` alle Haftpflicht-Falldaten selbst; der Kunde unterschreibt nur die Sicherungsabtretung (SA) — primär am Werkstatt-Gerät, optional per Link. „Bearbeiten" + „Flowlink" werden zu einem werkstatt-getriebenen Intake.

**Architecture:** Der SA-Signatur-Block wird aus `FlowWizardKfz` in eine geteilte `SaSignaturStep`-Komponente extrahiert (Approach C) und in einer neuen `WerkstattIntakeSignatur`-Signatur-only-Fläche wiederverwendet. `/flow/[token]` verzweigt auf ein `leads.werkstatt_intake_am`-Flag. Zwei neue Werkstatt-Actions (`starteUnterschriftAmGeraet` = Gerät, `sendeUnterschriftLink` = Versand) setzen das Flag + sichern den Token.

**Tech Stack:** Next.js 15 App Router, Supabase (RLS-Views + service-role writes), React client components, next-intl, vitest.

## Global Constraints

- **DDL nur via Supabase-Plugin** `apply_migration` → `list_migrations` → Migration-File exakt nach getrackter Version benennen → `execute_sql` (READ) verifizieren. **Niemals** raw `execute_sql`-DDL oder CLI. (AGENTS Regel 2.) Prod-Projekt `paizkjajbuxxksdoycev`.
- **Nie auf `main` pushen** — Feature-Branch `kitta/werkstatt-flow-enrichment`, PR gegen `staging`. (Regel 1.)
- **UI-Strings auf Deutsch mit echten Umlauten** (ä/ö/ü/ß). Neue kundensichtbare Flow-Strings als `next-intl`-Keys (`flow`-Namespace), nicht als Literale.
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }` (bzw. `{ ok:true; ... } | { ok:false; error }`), kein `throw`. Jede mutierende Action ruft `revalidatePath`. Keine Konstanten/Types aus `'use server'`-Files exportieren.
- **Ownership statt Role-Only:** Werkstatt-Actions gaten über `v_werkstatt_lead` (auth-aware RLS, Fremd-Lead = 0 Zeilen) + `requirePortalAccess(['werkstatt'])`; Write via `createAdminClient()` (leads default-deny).
- **CREATE OR REPLACE VIEW** darf nur Spalten **ans Ende anhängen** (Reihenfolge/Typ bestehender Spalten unverändert).
- **Post-Task-Audit (7 Punkte)** vor jedem Commit; Audit-Status im Commit-Body. Ratchets (`check:component-set`, `check:token-audit`, `check:status-registry`, `check:knip`, `check:redirect-stubs`) 0-neu.

---

### Task 1: DDL-Migration — Intake-Flag + `v_werkstatt_lead`-Erweiterung

**Ausführung:** DIREKT durch den Orchestrator (nicht Subagent) — Prod-DDL via Plugin (Regel 2).

**Files:**
- Create: `supabase/migrations/<recorded-version>_werkstatt_intake_flag_und_view.sql`

**Interfaces:**
- Produces: Spalten `leads.werkstatt_intake_am timestamptz`, `leads.werkstatt_intake_von uuid`; `v_werkstatt_lead` um 11 Read-Spalten erweitert (Gegner/Unfall/Standort + Flag).

- [ ] **Step 1: `apply_migration`** mit `name: "werkstatt_intake_flag_und_view"` und diesem `query` (Flag + View in einem getrackten Schritt):

```sql
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS werkstatt_intake_am  timestamptz,
  ADD COLUMN IF NOT EXISTS werkstatt_intake_von uuid;

CREATE OR REPLACE VIEW public.v_werkstatt_lead AS
SELECT id, werkstatt_id, vorname, nachname, telefon, email,
       fahrzeug_hersteller, fahrzeug_modell, kennzeichen, fin, erstzulassung,
       schadens_art, schadens_hergang, unfalldatum, unfallort,
       kostenvoranschlag_netto, kostenvoranschlag_brutto,
       status::text AS status, created_at, schadentyp,
       gegner_name, gegner_versicherung, gegner_kennzeichen, gegner_telefon,
       gegner_email, gegner_bekannt, unfallhergang, unfall_konstellation,
       fahrzeug_standort_adresse, fahrzeug_standort_plz, werkstatt_intake_am
FROM leads l
WHERE werkstatt_id IN (SELECT w.id FROM werkstaetten w WHERE w.user_id = (SELECT auth.uid()))
  AND konvertiert_zu_claim_id IS NULL;
```

- [ ] **Step 2: `list_migrations`** — die vom Plugin vergebene Version `<V>` ablesen.
- [ ] **Step 3: Migration-File committen** als `supabase/migrations/<V>_werkstatt_intake_flag_und_view.sql` mit exakt dem DDL aus Step 1 (Dateiname == getrackte Version, gegen Twin-Drift).
- [ ] **Step 4: `execute_sql` (READ) verifizieren:**

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='leads' and column_name like 'werkstatt_intake%';
-- erwartet: werkstatt_intake_am, werkstatt_intake_von
select count(*) from information_schema.columns
where table_schema='public' and table_name='v_werkstatt_lead' and column_name in
  ('gegner_name','unfallhergang','werkstatt_intake_am');  -- erwartet: 3
```

- [ ] **Step 5: Commit** `git add supabase/migrations/<V>_*.sql && git commit` (Audit-Body: „DDL via Plugin, getrackte Version, READ-verifiziert").

---

### Task 2: `WerkstattLead`-Type + Select um neue View-Spalten erweitern

**Files:**
- Modify: `src/lib/werkstatt/leads-queries.ts`

**Interfaces:**
- Consumes: `v_werkstatt_lead` (Task 1).
- Produces: `WerkstattLead` Type mit `gegner_name`, `gegner_versicherung`, `gegner_kennzeichen`, `gegner_telefon`, `gegner_email`, `gegner_bekannt` (`boolean|null`), `unfallhergang`, `unfall_konstellation`, `fahrzeug_standort_adresse`, `fahrzeug_standort_plz` (alle `string|null` außer gegner_bekannt), `werkstatt_intake_am` (`string|null`).

- [ ] **Step 1:** `src/lib/werkstatt/leads-queries.ts` lesen — den `WerkstattLead`-Type + den `.select(...)`-String (oder `select('*')`) der `v_werkstatt_lead`-Query finden.
- [ ] **Step 2:** Type um die 11 neuen Felder ergänzen. Falls der Select eine explizite Spaltenliste ist: die neuen Spalten anhängen (sonst deckt `select('*')` sie automatisch).
- [ ] **Step 3:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` — grün (kein Consumer bricht; neue Felder sind additiv).
- [ ] **Step 4: Commit.**

---

### Task 3: `SaSignaturStep` aus `FlowWizardKfz` extrahieren (Refactor, Parität)

**⚠ Heißer Shared-File — reiner Verhaltens-erhaltender Refactor. Grenzen exakt einhalten.**

**Files:**
- Create: `src/app/flow/[token]/SaSignaturStep.tsx`
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx`
- Test: `src/app/flow/[token]/SaSignaturStep.test.tsx`

**Interfaces:**
- Produces:
```typescript
interface SaSignaturStepProps {
  token: string
  leadId: string
  flowLinkId: string | null
  gutachterAnzeige?: GutachterInfo | null   // null → kein SV-Consent-Häkchen
  legalDocs: ReturnType<typeof getAllLegalDocs>
  onSigned: (fallId: string) => void        // nach erfolgreichem signSAandCreateFall
}
export default function SaSignaturStep(props: SaSignaturStepProps): JSX.Element
```
- Consumes (verschoben aus FlowWizardKfz): `SignatureCanvas`, `LegalDocPopover`, `uploadFlowSignatur` (`@/lib/actions/unterschrift-upload`), `signSAandCreateFall` + `generateSAPdf` (`./actions`), `useTranslations('flow')`.

**Extraktions-Grenze (exakt):** NUR das Signatur-Sub-Block des `'sa'`-Steps — NICHT die vorgelagerte `service_typ`-Auswahl (die bleibt in FlowWizardKfz). Bewegt werden:
- State (heute FlowWizardKfz Z. 191–197): `svRechtsakzeptanz`, `signatureBlob`, `saAccepted`, `saVolltextOffen`, `submittingSA` → in die Komponente. PLUS ein **eigener lokaler** `error`-State (der `error` von Z. 199 bleibt im Parent für den Account-Step).
- Der Volltext-Scroll-Effect (Z. ~348–374, `saVolltextOffen`-abhängig).
- `handleSignSA` (Z. 386–~412) — inkl. `uploadFlowSignatur` → `signSAandCreateFall(leadId, publicUrl, flowLinkId ?? null, gutachterAnzeige ? svRechtsakzeptanz : false, token)` → `onSigned(result.fallId)` (statt `setFallId`) → `generateSAPdf(result.fallId, leadId, publicUrl, token).catch(()=>{})`.
- Das JSX: Volltext-Modal (Z. ~863–912) + Unterschrift-Canvas (Z. 914–922) + AGB-Checkbox (924–939) + SV-Consent-Häkchen (941–972, nur bei `gutachterAnzeige`) + Fehler (974) + Sign-Button (976–982, `disabled={!signatureBlob || !saAccepted || (!!gutachterAnzeige && !svRechtsakzeptanz) || submittingSA}`).

`FlowWizardKfz` behält: `fallId`/`setFallId` + `error` (Account-Step + Selbstzahler-Pfad Z. 607), die `service_typ`-Auswahl, und rendert im `'sa'`-Step `<SaSignaturStep token={token} leadId={lead.id} flowLinkId={flowLinkId} gutachterAnzeige={gutachterAnzeige} legalDocs={legalDocs} onSigned={(fid) => setFallId(fid)} />`. (Kein `setStepIndex` nötig — der Account-Step-Effect Z. 455 triggert auf `fallId`.)

- [ ] **Step 1:** `FlowWizardKfz.tsx` Z. 180–210 (State), 340–415 (Effekte + `handleSignSA`), 810–985 (der ganze `'sa'`-Step inkl. service_typ-Auswahl) lesen. Die service_typ-Auswahl vom Signatur-Sub-Block abgrenzen. Verifizieren, dass die verschobenen State-Namen **außerhalb** des Signatur-Blocks nicht referenziert werden (`grep -n "saAccepted\|svRechtsakzeptanz\|saVolltextOffen\|signatureBlob\|submittingSA"` im File — alle Treffer müssen im Signatur-Block/handleSignSA liegen).
- [ ] **Step 2: Failing test** `SaSignaturStep.test.tsx` (react-testing-library):

```tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import SaSignaturStep from './SaSignaturStep'
// Minimal-Messages für den flow.step_sa-Namespace (nur die genutzten Keys)
const messages = { flow: { step_sa: { unterschrift_label: 'Unterschrift', unterschrift_placeholder: 'x', unterschrift_loeschen: 'Löschen', checkbox_text: 'Ich akzeptiere', agb_link: 'AGB', widerruf_link: 'Widerruf', cta_sign: 'Unterschreiben', submitting: '…', sv_consent_text: 'SV {firma}', volltext: {} } } }
function wrap(ui: React.ReactNode) {
  return render(<NextIntlClientProvider locale="de" messages={messages}>{ui}</NextIntlClientProvider>)
}
const base = { token: 't', leadId: 'l', flowLinkId: 'f', legalDocs: { agb: { titel: 'AGB', markdown: '' } } as never, onSigned: () => {} }

test('Sign-Button ist ohne Signatur + ohne AGB-Häkchen disabled', () => {
  wrap(<SaSignaturStep {...base} gutachterAnzeige={null} />)
  expect(screen.getByRole('button', { name: /Unterschreiben/ })).toBeDisabled()
})
test('ohne gutachterAnzeige wird KEIN SV-Consent-Häkchen gerendert', () => {
  wrap(<SaSignaturStep {...base} gutachterAnzeige={null} />)
  expect(screen.queryByText(/SV /)).toBeNull()
})
```

- [ ] **Step 3: Run** `npx vitest run src/app/flow/[token]/SaSignaturStep.test.tsx` → FAIL (Modul fehlt).
- [ ] **Step 4:** `SaSignaturStep.tsx` erstellen — die abgegrenzten State/Effekte/Handler/JSX **verbatim** aus FlowWizardKfz übernehmen, `setError` auf den lokalen State umbiegen, `setFallId(result.fallId)` durch `props.onSigned(result.fallId)` ersetzen, Props-Interface wie oben.
- [ ] **Step 5:** `FlowWizardKfz.tsx` — die verschobenen State/Effekte/`handleSignSA` entfernen, den Signatur-Sub-Block durch `<SaSignaturStep .../>` ersetzen; ungenutzte Imports (`uploadFlowSignatur`, ggf. `SignatureCanvas`/`LegalDocPopover` falls nur dort genutzt) entfernen.
- [ ] **Step 6: Run** `npx vitest run src/app/flow/[token]/SaSignaturStep.test.tsx` → PASS; `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → grün.
- [ ] **Step 7: Commit** (Audit-Body: „Refactor, Parität per Unit + tsc; service_typ-Auswahl bleibt in FlowWizardKfz").

---

### Task 4: `WerkstattIntakeSignatur`-Komponente (Signatur-only-Fläche)

**Files:**
- Create: `src/app/flow/[token]/WerkstattIntakeSignatur.tsx`
- Modify: `messages/de.json` (+ weitere Locale-Files) — neue `flow.werkstatt_intake.*`-Keys

**Interfaces:**
- Consumes: `SaSignaturStep` (Task 3), `createKundeAccount` (`./actions`), `useTranslations('flow')`.
- Produces:
```typescript
interface WerkstattIntakeSignaturProps {
  token: string; leadId: string; flowLinkId: string | null
  legalDocs: ReturnType<typeof getAllLegalDocs>
  zusammenfassung: {
    vorname: string; nachname: string; fahrzeug: string; kennzeichen: string
    unfalldatum: string | null; unfallort: string | null; unfallhergang: string | null
    gegnerName: string | null; gegnerVersicherung: string | null
  }
  kundeEmail: string; kundeVorname: string; kundeNachname: string; kundeTelefon: string
}
export default function WerkstattIntakeSignatur(props): JSX.Element
```

- [ ] **Step 1:** i18n-Keys ergänzen (`messages/de.json` unter `flow`): `werkstatt_intake.titel` („Bitte bestätigen & unterschreiben"), `.intro`, `.summary_titel` („Ihre Angaben"), `.label_kunde/_fahrzeug/_unfall/_gegner`, `.erfolg_titel` („Danke — wir richten Ihren Vorgang ein"), `.erfolg_text`. Umlaut-korrekt. Für andere Locale-Files denselben Key-Baum mit deutschem Fallback anlegen (oder `de` als Fallback nutzen — dem bestehenden Muster im Repo folgen).
- [ ] **Step 2:** Komponente bauen — Zustände `signed:boolean`, `creatingAccount:boolean`, `accountError:string|null`. Layout: Header (titel/intro) → Read-only-Summary-Card (zusammenfassung, `–` für null) → `<SaSignaturStep token leadId flowLinkId gutachterAnzeige={null} legalDocs onSigned={handleSigned} />`. `handleSigned(fallId)`: `setSigned(true)`; `setCreatingAccount(true)`; `const r = await createKundeAccount(fallId, token, kundeEmail, kundeVorname, kundeNachname, kundeTelefon || null)`; bei Fehler `setAccountError`. Nach Erfolg Erfolgs-Screen (erfolg_titel/erfolg_text). Claimondo-Tokens (`text-claimondo-navy`, `bg-claimondo-bg`, `rounded-ios-*`), keine raw-hex.
- [ ] **Step 3:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → grün. (Kein Unit-Test nötig — reine Komposition; e2e deckt es in Task 8.)
- [ ] **Step 4: Commit.**

---

### Task 5: `/flow/[token]/page.tsx` — Branch auf `werkstatt_intake_am`

**Files:**
- Modify: `src/app/flow/[token]/page.tsx`

**Interfaces:**
- Consumes: `WerkstattIntakeSignatur` (Task 4), `lead.werkstatt_intake_am` (Task 1, via `select('*')` Z. 166–170 schon geladen).

- [ ] **Step 1:** `flowLocale`/`flowMessages`-Auflösung (heute Z. 437–448) **vor** die Termin-/Gutachter-Logik ziehen (sie hängt nur an `flowLink?.sprache`/`lead.sprache`).
- [ ] **Step 2:** Direkt nach `if (!lead) return notFound()` (Z. 172) den Branch einfügen:

```tsx
if (lead.werkstatt_intake_am) {
  return (
    <div style={brandStyle} dir={flowLocale === 'ar' ? 'rtl' : 'ltr'}>
      <LeadRealtimeRefresh leadId={lead.id} />
      <NextIntlClientProvider locale={flowLocale} messages={flowMessages}>
        <WerkstattIntakeSignatur
          token={token} leadId={leadId} flowLinkId={flowLinkId}
          legalDocs={getAllLegalDocs()}
          zusammenfassung={{
            vorname: lead.vorname ?? '', nachname: lead.nachname ?? '',
            fahrzeug: [lead.fahrzeug_hersteller, lead.fahrzeug_modell].filter(Boolean).join(' '),
            kennzeichen: lead.kennzeichen ?? '',
            unfalldatum: lead.unfalldatum ?? null, unfallort: lead.unfallort ?? null,
            unfallhergang: lead.unfallhergang ?? null,
            gegnerName: lead.gegner_name ?? null, gegnerVersicherung: lead.gegner_versicherung ?? null,
          }}
          kundeEmail={lead.email ?? ''} kundeVorname={lead.vorname ?? ''}
          kundeNachname={lead.nachname ?? ''} kundeTelefon={lead.telefon ?? ''}
        />
      </NextIntlClientProvider>
    </div>
  )
}
```

Der Expiry- + `abgeschlossen`-Check (Z. 85–112) läuft davor (unverändert). Der Import `WerkstattIntakeSignatur` oben ergänzen.
- [ ] **Step 3:** `npm run build` (Route → Next-Validator) → grün.
- [ ] **Step 4: Commit** (Audit: „Branch vor Termin-Logik; Expiry/abgeschlossen davor unberührt").

---

### Task 6: `bearbeiteWerkstattLead`-Whitelist + `WerkstattAnfragen`-Edit-UI (Unfall/Gegner)

**Files:**
- Modify: `src/app/werkstatt/(shell)/anfragen/actions.ts` (EDITIERBARE_FELDER)
- Modify: `src/components/werkstatt/WerkstattAnfragen.tsx` (FeldKey, FELDER, GRUPPEN)

**Interfaces:**
- Produces: editierbare Felder `gegner_name, gegner_versicherung, gegner_kennzeichen, gegner_telefon, gegner_email, unfallhergang, unfall_konstellation, fahrzeug_standort_adresse, fahrzeug_standort_plz`.

- [ ] **Step 1:** `actions.ts` — `EDITIERBARE_FELDER` (Z. 19–23) um die 9 Felder erweitern.
- [ ] **Step 2:** `WerkstattAnfragen.tsx` — `FeldKey`-Union (Z. 26–29) + `gruppe`-Union (Z. 33) um `'Unfall' | 'Gegner'` + `GRUPPEN` (Z. 56) um `'Unfall','Gegner'` erweitern. `FELDER` (Z. 40–54) ergänzen: Unfall (`unfallhergang` textarea, `unfall_konstellation`), Gegner (`gegner_name`, `gegner_versicherung`, `gegner_kennzeichen`, `gegner_telefon`, `gegner_email`). **Neue Felder folgen dem bestehenden rohen `<input>/<textarea>`-Muster im Modal** (NICHT TextField — der Modal ist durchgängig raw; Konsistenz im File). Labels umlaut-korrekt („Gegner-Versicherung", „Unfallhergang").
- [ ] **Step 3:** `oeffnen()` (Z. 70–75) füllt `form` aus `FELDER` — deckt die neuen Felder automatisch (Type-Cast `lead[f.key]`; die neuen Keys existieren auf `WerkstattLead` seit Task 2).
- [ ] **Step 4:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → grün.
- [ ] **Step 5: Commit.**

---

### Task 7: Signatur-Actions + `WerkstattAnfragen`-Buttons (Gerät primär, Link sekundär)

**Files:**
- Modify: `src/app/werkstatt/(shell)/anfragen/actions.ts`
- Modify: `src/components/werkstatt/WerkstattAnfragen.tsx`
- Test: `src/app/werkstatt/(shell)/anfragen/actions.test.ts`

**Interfaces:**
- Produces:
```typescript
export async function starteUnterschriftAmGeraet(leadId: string):
  Promise<{ ok: true; url: string } | { ok: false; error: string }>
export async function sendeUnterschriftLink(leadId: string):
  Promise<{ ok: true; kanal: 'whatsapp' | 'email' } | { ok: false; error: string }>
```

- [ ] **Step 1:** Prüfen, ob `oeffneAnfrageFlow`/`resendeAnfrageFlowLink` außerhalb `WerkstattAnfragen.tsx` konsumiert werden: `grep -rn "oeffneAnfrageFlow\|resendeAnfrageFlowLink" src/`. Nur WerkstattAnfragen → in Step 4 ersetzbar.
- [ ] **Step 2: Failing test** `actions.test.ts` — Supabase-Clients mocken (`createClient`/`createAdminClient`), `ensureCanonicalFlowLinkForLead` + `sendFlowLinkMultiChannelCore` mocken:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
// Mocks: requirePortalAccess (no-op), createClient → v_werkstatt_lead maybeSingle,
// createAdminClient → leads.update, ensureCanonicalFlowLinkForLead → {ok:true,token:'TK'}
// (vollständige vi.mock-Blöcke wie in bestehenden werkstatt-action-Tests)

it('starteUnterschriftAmGeraet setzt Flag + gibt /flow/<token>-URL', async () => {
  const { starteUnterschriftAmGeraet } = await import('./actions')
  const r = await starteUnterschriftAmGeraet('lead-1')
  expect(r).toEqual({ ok: true, url: expect.stringContaining('/flow/TK') })
  // leads.update mit werkstatt_intake_am gesetzt aufgerufen
})
it('starteUnterschriftAmGeraet bei Fremd-Lead (owned=null) → error', async () => {
  // v_werkstatt_lead maybeSingle → { data: null }
  const { starteUnterschriftAmGeraet } = await import('./actions')
  const r = await starteUnterschriftAmGeraet('fremd')
  expect(r.ok).toBe(false)
})
it('sendeUnterschriftLink ohne Telefon/Email → error', async () => {
  // owned = { id, telefon:null, email:null }
  const { sendeUnterschriftLink } = await import('./actions')
  const r = await sendeUnterschriftLink('lead-1')
  expect(r.ok).toBe(false)
})
```

- [ ] **Step 3: Run** `npx vitest run src/app/werkstatt/(shell)/anfragen/actions.test.ts` → FAIL.
- [ ] **Step 4: Implementieren** in `actions.ts` — internen Helper + zwei Actions (bestehende `oeffneAnfrageFlow`/`resendeAnfrageFlowLink` durch diese ersetzen):

```typescript
// nicht exportiert
async function markiereIntakeBereit(
  leadId: string,
): Promise<{ ok: true; token: string; actorId: string } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!leadId) return { ok: false, error: 'Anfrage fehlt' }
  const supabase = await createClient()
  const actorId = (await supabase.auth.getUser()).data.user?.id
  if (!actorId) return { ok: false, error: 'Nicht angemeldet' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: owned } = await (supabase as any)
    .from('v_werkstatt_lead').select('id, telefon, email').eq('id', leadId).maybeSingle()
  if (!owned) return { ok: false, error: 'Kein Zugriff auf diese Anfrage' }
  const admin = createAdminClient()
  await admin.from('leads')
    .update({ werkstatt_intake_am: new Date().toISOString(), werkstatt_intake_von: actorId } as never)
    .eq('id', leadId)
  const flRes = await ensureCanonicalFlowLinkForLead(leadId, { admin })
  if (!flRes.ok) return { ok: false, error: flRes.error }
  revalidatePath('/werkstatt/anfragen')
  return { ok: true, token: flRes.token, actorId }
}

export async function starteUnterschriftAmGeraet(
  leadId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const r = await markiereIntakeBereit(leadId)
  if (!r.ok) return r
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  return { ok: true, url: `${appUrl}/flow/${r.token}` }
}

export async function sendeUnterschriftLink(
  leadId: string,
): Promise<{ ok: true; kanal: 'whatsapp' | 'email' } | { ok: false; error: string }> {
  const r = await markiereIntakeBereit(leadId)
  if (!r.ok) return r
  const supabase = await createClient()
  // Kontakt aus v_werkstatt_lead (Ownership schon oben)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: owned } = await (supabase as any)
    .from('v_werkstatt_lead').select('telefon, email').eq('id', leadId).maybeSingle()
  const hatTelefon = Boolean(owned?.telefon); const hatEmail = Boolean(owned?.email)
  if (!hatTelefon && !hatEmail) return { ok: false, error: 'Kein Kontaktkanal (Telefon/E-Mail) hinterlegt' }
  const admin = createAdminClient()
  let kanal: 'whatsapp' | 'email' = hatTelefon ? 'whatsapp' : 'email'
  let res = await sendFlowLinkMultiChannelCore(admin, leadId, kanal, r.actorId)
  if (!res.success && kanal === 'whatsapp' && hatEmail) {
    kanal = 'email'; res = await sendFlowLinkMultiChannelCore(admin, leadId, kanal, r.actorId)
  }
  if (!res.success) return { ok: false, error: res.error ?? 'Versand fehlgeschlagen' }
  return { ok: true, kanal }
}
```

- [ ] **Step 5: Run** `npx vitest run src/app/werkstatt/(shell)/anfragen/actions.test.ts` → PASS.
- [ ] **Step 6:** `WerkstattAnfragen.tsx` — Imports (Z. 12–16) auf `bearbeiteWerkstattLead, starteUnterschriftAmGeraet, sendeUnterschriftLink` umstellen. `handleFlow`→`handleGeraet` (ruft `starteUnterschriftAmGeraet`, `window.open(r.url,...)`), `handleResend`→`handleLink` (ruft `sendeUnterschriftLink`). Buttons (Z. 164–184): „Bearbeiten" + primär **„Zur Unterschrift (am Gerät)"** (`variant="navy"`) + sekundär **„Link an Kunden senden"** (`variant="ghost"`). Busy-Keys anpassen.
- [ ] **Step 7:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → grün. `npm run check:component-set` / `check:token-audit` → 0-neu.
- [ ] **Step 8: Commit.**

---

### Task 8: Build + Prod-Smoke (End-to-End, DB-getrieben)

**Files:**
- Create (lokal, **NIE committen** — enthält Passwort): `scripts/prod-smoke-werkstatt-intake.mjs`

- [ ] **Step 1:** `npm run build` (voll) → grün.
- [ ] **Step 2:** Smoke-Script (Playwright, SW-freier Browser `serviceWorkers:'block'`, nur Test-Accounts): SMOKE-Werkstatt (`werkstatt-smoke@claimondo.de`) einloggen → `/werkstatt/anfragen` → eine Test-Anfrage „Bearbeiten" (Gegner-Felder füllen) → „Zur Unterschrift (am Gerät)" → im geöffneten `/flow/<token>` die Signatur-only-Fläche prüfen (Summary sichtbar, KEIN Datenschritt) → signieren → warten.
- [ ] **Step 3: DB-Assert** (via MCP `execute_sql`, READ): für den Test-Lead `sa_unterschrieben=true`, `konvertiert_zu_claim_id IS NOT NULL`, eine `claims`-Zeile existiert, Lead nicht mehr in `v_werkstatt_lead` (bzw. mit service-role: `konvertiert_zu_claim_id` gesetzt). Test-Isolation: eigener Seed-Lead mit internem Marker, `--clean`-fähig.
- [ ] **Step 4:** Ergebnis dokumentieren (Marker-Update `COORDINATION-werkstatt-intake-merge`), Smoke-Script **nicht** committen.

---

## Reihenfolge & Abhängigkeiten

1 (DDL) → 2 (Type) → {3 (Extraktion), 6 (Whitelist/UI)} parallel möglich → 4 (Fläche, braucht 3) → 5 (Branch, braucht 4) → 7 (Actions/Buttons, braucht 2+6) → 8 (Build+Smoke, braucht alles). Task 3 ist der Kritische-Pfad-Refactor; früh angehen.

## PR-Abschluss

Nach Task 8: PR gegen `staging` (nicht `main`). Session-Abschluss-Checkliste (Regel 3): `git status` clean, `git stash list` leer, alle Commits gepusht. Smoke-Script bleibt ungetrackt.
