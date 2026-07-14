# Firmen-Flotte Slice 2c — SMS-Verify + VS-Meldung an die Gegner-Haftpflicht

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nachdem ein Unfallgegner über die NFC-Schadenkarte seine Seite erfasst hat, bestätigt er per SMS-Magic-Link seine Handynummer — und daraufhin geht der Schaden automatisch per E-Mail (inkl. Fotos als Anhang) an die Haftpflichtversicherung des Gegners raus.

**Architecture:** Claim-first (Bestand, unverändert). Nach dem Claim wird ein Airdrop-Invite erzeugt (`airdrop_invitations`, Hash+Prefix-Token) und per Twilio-SMS als Link verschickt. Tippt der Gegner den Link an, öffnet sich `/unfallmeldung/[token]`: er sieht seine Meldung, den gesetzlichen Pflicht-Hinweis, und bestätigt. Die Bestätigung ist ein **Compare-and-Swap** (`UPDATE … WHERE responded_at IS NULL`) — nur der Gewinner triggert den VS-Versand, damit ein Doppelklick nie zwei Meldungen an die Versicherung schickt. Der Versand rendert ein react-email-Template, hängt die Schadenfotos aus `fall_dokumente` an, sendet über den bestehenden `sendEmail` und protokolliert in `vs_korrespondenz`. Jeder Pfad, der nicht automatisch gehen kann (kein Telefon, keine Versicherung gewählt, Versicherer ohne `schaden_email`, Send-Fehler), endet in einem **Dispatch-Task** — kein Claim versandet still.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (PostgREST + Service-Role-Client), Twilio (SMS via `fetch`), Resend/Nodemailer via `sendEmail`, react-email, vitest.

## Global Constraints

- **KEIN DDL.** Slice 2c kommt ohne Schema-Änderung aus — alle Tabellen/Spalten existieren. Das Supabase-MCP-Plugin ist in dieser Session nicht geladen, und AGENTS.md Regel 2 verbietet DDL auf jedem anderen Weg. Wenn du glaubst, DDL zu brauchen: **stopp und melde es**, statt einen anderen Pfad zu nehmen.
- **Fremdes Territorium — nur importieren, NIE editieren:** `src/app/flow/[token]/*`, `src/app/api/v1/melde-schaden/*`, `src/lib/leads/*` (`createLead`, `convertLeadToClaim`), `src/lib/start-link/*`, `src/lib/termine/*`. Das ist der aar-956-Cluster (mehrere aktive Sessions).
- **Umlaute:** Alle nutzersichtbaren Texte (Wizard, Accept-Page, SMS-Text, E-Mail-Template, Task-Titel) auf Deutsch mit echten `ä/ö/ü/ß`. Code-Kommentare/Commits dürfen ASCII sein.
- **Server-Actions liefern Result-Objects** (`{ ok: boolean; error?: string }`), kein `throw`. Non-kritische Sub-Operationen (SMS-Send, Mail-Send) in try/catch, damit sie den Hauptpfad nie brechen.
- **DB-Constraints, die still zubeißen** (verifiziert in `supabase/migrations/00000000000000_baseline_public_schema.sql`):
  - `airdrop_invitations.invited_via` CHECK: nur `qr_code|airdrop|whatsapp|sms|email|manual_link|telegram|signal` → wir nutzen **`'sms'`**.
  - `airdrop_invitations.status` CHECK: nur `offen|geoeffnet|daten_eingegeben|widerrufen|abgelaufen|konvertiert` → **kein `'accepted'`/`'verifiziert'`**. Lebenszyklus: `offen` (SMS raus) → `geoeffnet` (Link angetippt) → `daten_eingegeben` (bestätigt).
  - `airdrop_invitations`: `token_hash` NOT NULL + UNIQUE, `token_lookup_prefix` varchar(8) NOT NULL, `expires_at > invited_at`, `responded_at >= opened_at`.
  - `vs_korrespondenz.status` CHECK: nur `gesendet|wartet_auf_antwort|ohne_antwort_abgelaufen|beantwortet|archiviert` → **kein `'pending'`**. `kanal` nur `email|post|fax|telefon|portal`. `richtung` nur `eingehend|ausgehend`.
  - `tasks.entity_type` CHECK: nur `fall|lead|abrechnung|reklamation|sv_onboarding|gutachter|kunde|case|termin|gutschrift|fall_dokumente` → **`'versicherung'` würde still verworfen**. Nutze `entity_type: 'fall'`.
- **Kill-Switch:** `VS_MELDUNG_ENABLED` — Default `true` (prod ist nach dem Merge live, so gewollt). Auf **staging MUSS `false`** gesetzt sein, sonst schickt ein Smoke eine echte Unfallmeldung an einen echten Versicherer. `SIDE_EFFECT_MODE` ist projektweit **nicht gesetzt = `live`** und filtert nur *interne* Adressen — er schützt hier **nicht**.
- **Reihenfolge-Regel bei Side-Effects** (Lehre aus `cron/vs-timer/route.ts:66-75`): Zustand **vor** dem Side-Effect persistieren. Sonst geht die Mail raus, der Status-Write scheitert, und der nächste Trigger sendet erneut = Doppel-Meldung an die Versicherung.

---

## Bestand (verifiziert am 14.07. — Code + prod-DB, nicht raten)

Diese Signaturen sind echt. Ändere sie nicht, importiere sie.

| Was | Wo | Signatur / Fakt |
|---|---|---|
| SMS senden | `src/lib/whatsapp/send-sms-plain.ts:26` | `sendPlainSms(to: string, body: string): Promise<{ success: boolean; sid?: string; error?: string }>` — Result-Object, kein throw |
| E.164 | `src/lib/whatsapp/send-sms-plain.ts:14` | `normalizeE164(to: string): string` — **diese** nutzen (die Inline-Variante in `send-sms-template.ts:36` hat einen `00`-Bug) |
| Mail senden | `src/lib/email/google/client.ts:44` | `sendEmail(opts: SendEmailOpts): Promise<{ messageId: string }>` — **kann `attachments: Array<{filename, content: Buffer\|string, contentType?}>`**; wirft nach 3 Retries |
| Anhang aus Storage | `src/lib/email/google/flows.ts:538-567` | Vorbild `attachFromStorage`: `getStorageUrl(db, 'fall-dokumente', storage_path, {ttl: STORAGE_TTL.download})` → `fetch` → `Buffer.from(await res.arrayBuffer())`; **20-MB-Total-Guard** |
| Versicherer + Mail | `src/lib/versicherungen/search-actions.ts:44` | `getVersicherungById(id): Promise<VersicherungSuggestion \| null>` mit `{ id, name, schaden_telefon, schaden_email, bafin_nummer }` — Admin-Client, leak-sicher |
| Dispatch-Task | `src/lib/tasks/create-task.ts:42` | `createLinkedTask(params): Promise<{ task_id: string \| null }>` — Auto-Assign + Reminder. **Dedupliziert NICHT** → `task_code` setzen und vorher selbst prüfen (Muster: `src/lib/termine/embed-b-klaerung-task.ts:53-72`) |
| Dead-Letter | `src/lib/reliability/dead-letter.ts:41` | `recordFailedOperation({ operationType, dedupKey, entityType?, entityId?, payload?, error, escalateAfterMinutes? }): Promise<void>` → `cron/recovery-monitor` eskaliert nach 6 h an einen Menschen |
| Cron-Auth | `src/lib/auth/cron-auth.ts:13` | `assertCronAuth(request: Request): boolean` — fail-closed. **Jede** neue Cron-Route nutzt diesen Helper |
| Admin-Client | `src/lib/supabase/admin.ts:8` | `createAdminClient()` — Service-Role, RLS-frei |
| Gegner-Submit | `src/app/schaden/[token]/actions.ts:39` | `submitSchadenGegner(token, data: GegnerFormData): Promise<{ok:true;leadId;vehicleId;claimId?} \| {ok:false;error}>` — **Andock-Punkt für Task 4 ist Zeile 183–186**, dort sind `claimId`, `fallId`, `res.leadId`, `ctx.context`, `data.telefon` im Scope |
| Fall-ID | `src/lib/leads/convert-lead-to-claim.ts:899` | **`fallId === claimId`** (identische UUID) |
| Gegner-VS-Kette | `actions.ts:115` → `convert-lead-to-claim.ts:323,669` | `data.versicherungId` → `leads.gegner_versicherung_id` → **beides**: `claims.gegner_versicherung_id` UND `claim_parties(rolle='verursacher').versicherung_id`. `gegner_schadennummer` → `claim_parties.versicherungs_aktenzeichen` |
| Gegner-Telefon | `actions.ts:111` | Landet **nur** auf `leads.gegner_telefon` (optional!). NICHT auf `claim_parties`/`personen`. `leads.telefon` bleibt bei diesem Flow **immer NULL** |
| Gegner-Fotos | `src/lib/schadenkarte/gegner-dokumente.ts:72,150` | `fall_dokumente`, Bucket `fall-dokumente` (Foto) / `unterschriften` (Signatur). `dokument_typ`: `gegner_fahrzeug_foto`, `eigenes_fahrzeug_foto`, `unfallort_foto`, `gegner_unterschrift`. `sichtbar_fuer` = `['admin','kundenbetreuer','sachverstaendiger','kanzlei','flottenmanager']` |
| Hash-Token-Muster | `src/lib/auth/twofa/remember-me.ts:20-21,50-51` | Raw `randomBytes(...).toString('base64url')` an den User, **SHA-256** in die DB, Lookup über Hash |
| Test-Framework | `package.json` | `vitest` (`npm test` = `vitest run`). Mock-Muster: `src/lib/email/google/__tests__/client-send-isolation.test.ts` |

**Was NICHT existiert** (nicht suchen, es ist weg): `src/lib/airdrop/*`, `inviteGegnerViaAirdrop`, jede `/airdrop`-Route, ein accountloser OTP-Baustein (alle 3 Telefon-Verify-Wege hängen an `auth.users`), `unfallberichte` (Tabelle **und** Code), `v_claim_dokumente`, jeder Sendepfad an `versicherungen.schaden_email`. `airdrop_invitations` und `vs_korrespondenz` sind in prod **beide leer** (0 Zeilen) — du bist der erste Nutzer.

**Bekannter Bug, den Task 1 fixt:** `phoneWriteCapExceeded` (`src/lib/api-v1/write-abuse-guard.ts:71`) ruft `countRecentMcpLeadsByPhone` (`src/lib/api-v1/recent-lead-dedup.ts:59`), das auf `.eq('telefon', tel)` + `.eq('source_channel','mcp')` filtert. Der Gegner-Flow schreibt aber `source_channel='schaden-karte'` und legt die Nummer in `gegner_telefon` ab → **beide Filter matchen nie, der Cap ist ein No-Op.** Ohne Fix wird jeder SMS-Versand zum SMS-Bombing-Vektor auf fremde Nummern.

---

## File Structure

**Neu:**
| Datei | Verantwortung |
|---|---|
| `src/lib/airdrop/token.ts` | Token erzeugen/hashen/prefixen (pure, testbar) |
| `src/lib/airdrop/gegner-invite.ts` | Invite anlegen + SMS senden; Token auflösen; Bestätigung (CAS) |
| `src/lib/vs-meldung/empfaenger.ts` | Auflösen: Claim → Gegner-Haftpflicht → `schaden_email` (pure Entscheidung: senden vs. Task) |
| `src/lib/vs-meldung/claim-daten.ts` | Loader: alle Daten für die Meldung (Claim, Parteien, Firma, Fahrzeuge, Personen) |
| `src/lib/vs-meldung/sende-unfallmeldung.ts` | Orchestrierung: Empfänger → Template → Anhänge → `sendEmail` → `vs_korrespondenz` → Fallback-Task |
| `src/lib/vs-meldung/dispatch-task.ts` | Der eine Fallback-Task-Helper (dedupliziert, für alle 4 Fallback-Gründe) |
| `src/lib/email/google/templates/UnfallmeldungVs.tsx` | react-email-Template der Unfallmitteilung |
| `src/app/unfallmeldung/[token]/page.tsx` | Public Accept-Page (Server Component) |
| `src/app/unfallmeldung/[token]/actions.ts` | `bestaetigeGegnerMeldung(token)` |
| `src/app/unfallmeldung/[token]/BestaetigungClient.tsx` | UI: Zusammenfassung + Pflicht-Hinweis + Bestätigen-Button |
| `src/app/api/cron/gegner-invite-nachfassen/route.ts` | 48 h unbestätigt → Dispatch-Task |

**Modifiziert:**
| Datei | Änderung |
|---|---|
| `src/lib/api-v1/recent-lead-dedup.ts` | + `countRecentGegnerLeadsByPhone` |
| `src/lib/api-v1/write-abuse-guard.ts` | + `gegnerPhoneWriteCapExceeded` |
| `src/app/schaden/[token]/actions.ts` | Zeile ~67: Cap-Aufruf tauschen. Zeile ~183: Invite anstoßen (fail-soft) |
| `src/app/schaden/[token]/SchadenGegnerWizard.tsx` | Erfolgs-Screen: SMS-Hinweis |
| `src/lib/supabase/middleware.ts` | `/unfallmeldung` in `isPublicPath` |
| `docs/vps-crontab.md` | Cron-Eintrag dokumentieren |
| `.env.example` | `VS_MELDUNG_ENABLED` dokumentieren |

---

## Task 1: Abuse-Cap für den Gegner-Flow scharf machen (Security-Vorbedingung)

Ohne diesen Fix ist jeder SMS-Versand aus Task 3 ein Bombing-Vektor auf beliebige fremde Nummern.

**Files:**
- Modify: `src/lib/api-v1/recent-lead-dedup.ts` (neue Funktion ans Ende)
- Modify: `src/lib/api-v1/write-abuse-guard.ts` (neue Funktion, `PHONE_CAP_24H` wiederverwenden)
- Modify: `src/app/schaden/[token]/actions.ts:67-75`
- Test: `src/lib/api-v1/__tests__/gegner-write-cap.test.ts`

**Interfaces:**
- Produces: `countRecentGegnerLeadsByPhone(telefon: string, hours: number): Promise<number>`, `gegnerPhoneWriteCapExceeded(telefon: string): Promise<boolean>`

- [ ] **Step 1: Failing test schreiben**

`src/lib/api-v1/__tests__/gegner-write-cap.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const eqCalls: Array<[string, unknown]> = []
const countRef = { value: 0 }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = (col: string, val: unknown) => {
        eqCalls.push([col, val])
        return builder
      }
      builder.gt = () => Promise.resolve({ count: countRef.value, error: null })
      return builder
    },
  }),
}))

beforeEach(() => {
  eqCalls.length = 0
  countRef.value = 0
})

describe('countRecentGegnerLeadsByPhone', () => {
  it('filtert auf gegner_telefon + source_channel=schaden-karte (NICHT auf telefon/mcp)', async () => {
    const { countRecentGegnerLeadsByPhone } = await import('../recent-lead-dedup')
    await countRecentGegnerLeadsByPhone('+491701234567', 24)

    expect(eqCalls).toContainEqual(['gegner_telefon', '+491701234567'])
    expect(eqCalls).toContainEqual(['source_channel', 'schaden-karte'])
    // Der alte Cap filterte auf diesen beiden — genau deshalb griff er nie:
    expect(eqCalls.map(([c]) => c)).not.toContain('telefon')
  })

  it('liefert den Count durch', async () => {
    countRef.value = 7
    const { countRecentGegnerLeadsByPhone } = await import('../recent-lead-dedup')
    expect(await countRecentGegnerLeadsByPhone('+491701234567', 24)).toBe(7)
  })

  it('leere Nummer -> 0 ohne DB-Call', async () => {
    const { countRecentGegnerLeadsByPhone } = await import('../recent-lead-dedup')
    expect(await countRecentGegnerLeadsByPhone('  ', 24)).toBe(0)
    expect(eqCalls).toHaveLength(0)
  })
})

describe('gegnerPhoneWriteCapExceeded', () => {
  it('true, sobald das Limit erreicht ist', async () => {
    countRef.value = 3 // Default-Cap = 3 / 24 h
    const { gegnerPhoneWriteCapExceeded } = await import('../write-abuse-guard')
    expect(await gegnerPhoneWriteCapExceeded('+491701234567')).toBe(true)
  })

  it('false unterhalb des Limits', async () => {
    countRef.value = 2
    const { gegnerPhoneWriteCapExceeded } = await import('../write-abuse-guard')
    expect(await gegnerPhoneWriteCapExceeded('+491701234567')).toBe(false)
  })

  it('ohne Nummer false (kein Cap moeglich — Dispatch-Fallback greift stattdessen)', async () => {
    const { gegnerPhoneWriteCapExceeded } = await import('../write-abuse-guard')
    expect(await gegnerPhoneWriteCapExceeded('')).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/api-v1/__tests__/gegner-write-cap.test.ts`
Expected: FAIL — `countRecentGegnerLeadsByPhone is not a function`.

- [ ] **Step 3: `countRecentGegnerLeadsByPhone` implementieren**

Ans Ende von `src/lib/api-v1/recent-lead-dedup.ts` (nach `countRecentMcpLeadsByPhone`):

```ts
/**
 * Wie countRecentMcpLeadsByPhone, aber fuer den oeffentlichen Gegner-Flow der NFC-
 * Schadenkarte (/schaden/[token]). Der schreibt source_channel='schaden-karte' und legt
 * die Nummer in leads.gegner_telefon ab (leads.telefon bleibt NULL) — die MCP-Variante
 * filtert auf telefon + 'mcp' und greift hier deshalb NIE. Ohne diesen Cap waere der
 * SMS-Versand (Slice 2c) ein Bombing-Vektor auf beliebige fremde Nummern.
 * Best-effort: bei DB-Fehler 0 (der globale Circuit-Breaker faengt Massen-Missbrauch).
 */
export async function countRecentGegnerLeadsByPhone(telefon: string, hours: number): Promise<number> {
  const tel = telefon.trim()
  if (!tel) return 0
  const sinceIso = new Date(Date.now() - hours * 60 * 60_000).toISOString()
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('gegner_telefon', tel)
    .eq('source_channel', 'schaden-karte')
    .gt('created_at', sinceIso)
  if (error) {
    console.error('[api-v1/dedup] countRecentGegnerLeadsByPhone fehlgeschlagen:', error.message)
    return 0
  }
  return count ?? 0
}
```

- [ ] **Step 4: `gegnerPhoneWriteCapExceeded` implementieren**

In `src/lib/api-v1/write-abuse-guard.ts` — Import ergänzen und neben `phoneWriteCapExceeded` (Z. 71) einfügen. `PHONE_CAP_24H` (Default 3, ENV `MCP_WRITE_CAP_PER_PHONE_24H`) wird wiederverwendet:

```ts
import { countRecentGegnerLeadsByPhone } from './recent-lead-dedup'

/**
 * Per-Telefon-Velocity fuer den oeffentlichen NFC-Gegner-Flow. Dasselbe Limit wie die
 * MCP-Variante, aber gegen die Spalten, die dieser Flow tatsaechlich schreibt.
 * Ohne Nummer: false — es gibt nichts zu limitieren; der Flow faellt stattdessen in den
 * Dispatch-Task-Pfad (keine SMS, kein Auto-Send).
 */
export async function gegnerPhoneWriteCapExceeded(telefon: string): Promise<boolean> {
  const tel = telefon.trim()
  if (!tel) return false
  return (await countRecentGegnerLeadsByPhone(tel, 24)) >= PHONE_CAP_24H
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run src/lib/api-v1/__tests__/gegner-write-cap.test.ts`
Expected: PASS (6 Tests).

- [ ] **Step 6: Aufrufer im Gegner-Flow umstellen**

In `src/app/schaden/[token]/actions.ts`, Block ab Zeile 67. Import `phoneWriteCapExceeded` → `gegnerPhoneWriteCapExceeded` tauschen und den Aufruf ersetzen. Der irreführende Kommentar darüber muss mit:

```ts
  // Abuse-Cap: Per-Telefon-Velocity (3/24h gegen leads.gegner_telefon + source_channel=
  // 'schaden-karte' — die MCP-Variante filtert auf telefon/'mcp' und greift hier NICHT)
  // + globaler Circuit-Breaker. Scharf, weil dieser Endpunkt oeffentlich + unauthentifiziert
  // ist UND (Slice 2c) eine SMS an eine frei waehlbare Nummer ausloest.
  const telefon = data.telefon?.trim()
  if (telefon && (await gegnerPhoneWriteCapExceeded(telefon))) {
    return { ok: false, error: 'Von dieser Telefonnummer wurden zu viele Meldungen erfasst. Bitte später erneut versuchen.' }
  }
```

- [ ] **Step 7: Typecheck + Commit**

```bash
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck
git add src/lib/api-v1/ src/app/schaden/
git commit -m "fix(schaden-karte): Per-Telefon-Abuse-Cap greift jetzt wirklich

Der Cap rief countRecentMcpLeadsByPhone, das auf leads.telefon + source_channel='mcp'
filtert. Der Gegner-Flow schreibt aber 'schaden-karte' und legt die Nummer in
gegner_telefon ab -> beide Filter matchten nie, der Cap war ein No-Op. Vor dem
SMS-Versand (Slice 2c) waere das ein Bombing-Vektor auf fremde Nummern.

Audit:
- Build: tsc --noEmit gruen
- UI: n/a (kein UI-Change)
- Redundanz: PHONE_CAP_24H + Guard-Muster wiederverwendet, keine Duplikation
- Dead-Code: nichts entfernt (die MCP-Variante bleibt fuer melde-schaden noetig)
- Spec: Voraussetzung fuer 2c-SMS (Bauplan 2c-3 'Abuse-Cap ist PFLICHT')
- Inkonsistenz: Result-Object, Umlaute in der User-Message
- Regression: phoneWriteCapExceeded unveraendert -> melde-schaden intakt"
```

---

## Task 2: Airdrop-Token (pure Lib)

**Files:**
- Create: `src/lib/airdrop/token.ts`
- Test: `src/lib/airdrop/__tests__/token.test.ts`

**Interfaces:**
- Produces: `generateAirdropToken(): { token: string; tokenHash: string; lookupPrefix: string }`, `hashAirdropToken(token: string): string`, `airdropLookupPrefix(token: string): string`

Das Schema erzwingt Hash+Prefix (`token_hash` NOT NULL UNIQUE, `token_lookup_prefix` varchar(8) NOT NULL) — anders als das sonstige Klartext-Token-Hausmuster. Vorbild: `src/lib/auth/twofa/remember-me.ts`.

- [ ] **Step 1: Failing test schreiben**

`src/lib/airdrop/__tests__/token.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { generateAirdropToken, hashAirdropToken, airdropLookupPrefix } from '../token'

describe('generateAirdropToken', () => {
  it('liefert Token, SHA-256-Hash und 8-Zeichen-Prefix', () => {
    const { token, tokenHash, lookupPrefix } = generateAirdropToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/) // 16 Byte base64url
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(lookupPrefix).toBe(token.slice(0, 8))
    expect(lookupPrefix).toHaveLength(8) // varchar(8) — laenger wuerde die DB abweisen
  })

  it('ist bei jedem Aufruf verschieden', () => {
    const a = generateAirdropToken()
    const b = generateAirdropToken()
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).not.toBe(b.tokenHash)
  })
})

describe('hashAirdropToken / airdropLookupPrefix', () => {
  it('sind deterministisch — derselbe Token ergibt denselben Hash', () => {
    const { token, tokenHash, lookupPrefix } = generateAirdropToken()
    expect(hashAirdropToken(token)).toBe(tokenHash)
    expect(airdropLookupPrefix(token)).toBe(lookupPrefix)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/airdrop/__tests__/token.test.ts`
Expected: FAIL — Modul `../token` existiert nicht.

- [ ] **Step 3: Implementieren**

`src/lib/airdrop/token.ts`:

```ts
// Airdrop-Token fuer die Gegner-Einladung (Slice 2c).
//
// Anders als das sonstige Klartext-Token-Hausmuster (schadenkarte/token.ts) erzwingt
// airdrop_invitations Hash+Prefix: token_hash NOT NULL UNIQUE + token_lookup_prefix
// varchar(8) NOT NULL. Der Klartext-Token geht nur per SMS an den Gegner und liegt nie
// in der DB. Vorbild: src/lib/auth/twofa/remember-me.ts.
import { createHash, randomBytes } from 'node:crypto'

const TOKEN_BYTES = 16 // -> 22 Zeichen base64url, 128 Bit Entropie
const PREFIX_LEN = 8 // == varchar(8) des Schemas

export function hashAirdropToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function airdropLookupPrefix(token: string): string {
  return token.slice(0, PREFIX_LEN)
}

export function generateAirdropToken(): { token: string; tokenHash: string; lookupPrefix: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return { token, tokenHash: hashAirdropToken(token), lookupPrefix: airdropLookupPrefix(token) }
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/lib/airdrop/__tests__/token.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/airdrop/
git commit -m "feat(airdrop): Token-Primitive (Hash+Prefix, Schema-konform)

Audit: Build tsc gruen | UI n/a | Redundanz: remember-me-Hash-Muster wiederverwendet |
Dead-Code: keiner | Spec: 2c-1 Token | Inkonsistenz: varchar(8)-Prefix respektiert |
Regression: neue Datei, 0 Consumer bisher"
```

---

## Task 3: Invite anlegen + SMS senden

**Files:**
- Create: `src/lib/airdrop/gegner-invite.ts`
- Test: `src/lib/airdrop/__tests__/gegner-invite.test.ts`

**Interfaces:**
- Consumes: `generateAirdropToken` (Task 2), `sendPlainSms`/`normalizeE164` (Bestand)
- Produces:
  - `inviteGegnerViaAirdrop(claimId: string, telefon: string, opts?: { partyId?: string | null }): Promise<{ ok: true; inviteId: string; smsSent: boolean } | { ok: false; error: string }>`
  - `INVITE_TTL_STUNDEN = 72`

- [ ] **Step 1: Failing test schreiben**

`src/lib/airdrop/__tests__/gegner-invite.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertedRows: Array<Record<string, unknown>> = []
const smsCalls: Array<{ to: string; body: string }> = []
const insertResult = { data: { id: 'invite-1' } as { id: string } | null, error: null as { message: string } | null }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        insertedRows.push(row)
        return { select: () => ({ single: async () => insertResult }) }
      },
    }),
  }),
}))

vi.mock('@/lib/whatsapp/send-sms-plain', () => ({
  normalizeE164: (t: string) => (t.startsWith('0') ? '+49' + t.slice(1) : t),
  sendPlainSms: async (to: string, body: string) => {
    smsCalls.push({ to, body })
    return { success: true, sid: 'SM123' }
  },
}))

beforeEach(() => {
  insertedRows.length = 0
  smsCalls.length = 0
  insertResult.data = { id: 'invite-1' }
  insertResult.error = null
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.claimondo.de'
})

describe('inviteGegnerViaAirdrop', () => {
  it('legt eine Schema-konforme Invite-Zeile an', async () => {
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res.ok).toBe(true)
    const row = insertedRows[0]
    expect(row.claim_id).toBe('claim-1')
    expect(row.invited_via).toBe('sms') // CHECK erlaubt nur qr_code|airdrop|whatsapp|sms|email|manual_link|telegram|signal
    expect(row.status).toBe('offen') // CHECK erlaubt kein 'pending'/'accepted'
    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(String(row.token_lookup_prefix)).toHaveLength(8)
    expect(new Date(row.expires_at as string).getTime()).toBeGreaterThan(Date.now()) // chk_airdrop_expires_after_invite
    expect(row).not.toHaveProperty('token') // Klartext darf NIE in die DB
  })

  it('schickt die SMS an die normalisierte Nummer, mit Klartext-Token im Link', async () => {
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(smsCalls).toHaveLength(1)
    expect(smsCalls[0].to).toBe('+491701234567')
    const link = smsCalls[0].body.match(/https:\/\/\S+/)?.[0] ?? ''
    expect(link).toContain('/unfallmeldung/')
    // Der Token im Link muss zum gespeicherten Hash passen:
    const { hashAirdropToken } = await import('../token')
    const token = link.split('/unfallmeldung/')[1]
    expect(hashAirdropToken(token)).toBe(insertedRows[0].token_hash)
  })

  it('ohne Telefonnummer: kein Insert, kein Send, klarer Fehler', async () => {
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '  ')

    expect(res).toEqual({ ok: false, error: 'Keine Telefonnummer' })
    expect(insertedRows).toHaveLength(0)
    expect(smsCalls).toHaveLength(0)
  })

  it('DB-Fehler: kein SMS-Versand (kein Invite ohne Zeile)', async () => {
    insertResult.data = null
    insertResult.error = { message: 'boom' }
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res.ok).toBe(false)
    expect(smsCalls).toHaveLength(0)
  })

  it('SMS-Fehler: Invite bleibt bestehen, ok:true mit smsSent=false (Cron fasst nach)', async () => {
    const sms = await import('@/lib/whatsapp/send-sms-plain')
    vi.spyOn(sms, 'sendPlainSms').mockResolvedValueOnce({ success: false, error: 'twilio down' })
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res).toMatchObject({ ok: true, smsSent: false })
    expect(insertedRows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/airdrop/__tests__/gegner-invite.test.ts`
Expected: FAIL — Modul `../gegner-invite` existiert nicht.

- [ ] **Step 3: Implementieren**

`src/lib/airdrop/gegner-invite.ts`:

```ts
// Slice 2c — Schritt 1: Nach dem Claim bekommt der Unfallgegner per SMS einen Magic-Link.
// Tippt er ihn an und bestaetigt, gilt seine Handynummer als verifiziert (Besitz-Nachweis)
// und die Unfallmeldung geht an seine Haftpflicht (siehe vs-meldung/sende-unfallmeldung).
//
// Kein 'use server' — das ist eine Lib, kein Action-Modul (Konstanten-Export waere sonst
// im Client-Bundle undefined, s. AGENTS.md/AAR-664).
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeE164, sendPlainSms } from '@/lib/whatsapp/send-sms-plain'
import { generateAirdropToken } from './token'

export const INVITE_TTL_STUNDEN = 72

type InviteResult =
  | { ok: true; inviteId: string; smsSent: boolean }
  | { ok: false; error: string }

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')
}

export function buildBestaetigungsLink(token: string): string {
  return `${baseUrl()}/unfallmeldung/${token}`
}

/**
 * Legt die airdrop_invitations-Zeile an und schickt den Magic-Link per SMS.
 *
 * Reihenfolge ist bewusst DB-zuerst: ohne persistierte Zeile darf keine SMS rausgehen
 * (sonst haette der Gegner einen Link, den niemand aufloesen kann). Scheitert dagegen nur
 * die SMS, bleibt der Invite gueltig und der Nachfass-Cron eskaliert ihn an Dispatch —
 * deshalb ok:true mit smsSent:false statt eines harten Fehlers.
 */
export async function inviteGegnerViaAirdrop(
  claimId: string,
  telefon: string,
  opts?: { partyId?: string | null },
): Promise<InviteResult> {
  const tel = telefon?.trim()
  if (!tel) return { ok: false, error: 'Keine Telefonnummer' }

  const { token, tokenHash, lookupPrefix } = generateAirdropToken()
  const jetzt = Date.now()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('airdrop_invitations')
    .insert({
      claim_id: claimId,
      token_hash: tokenHash,
      token_lookup_prefix: lookupPrefix,
      invited_via: 'sms',
      status: 'offen',
      invited_at: new Date(jetzt).toISOString(),
      expires_at: new Date(jetzt + INVITE_TTL_STUNDEN * 60 * 60_000).toISOString(),
      invited_by_party_id: opts?.partyId ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('[airdrop] Invite-Insert fehlgeschlagen:', error?.message)
    return { ok: false, error: error?.message ?? 'Invite konnte nicht angelegt werden' }
  }

  const empfaenger = normalizeE164(tel)
  const body = `Ihre Unfallmeldung bei Claimondo: Bitte bestätigen Sie kurz Ihre Angaben, damit wir den Schaden Ihrer Haftpflichtversicherung melden können: ${buildBestaetigungsLink(token)}`

  let smsSent = false
  try {
    const res = await sendPlainSms(empfaenger, body)
    smsSent = res.success
    if (!res.success) console.error('[airdrop] SMS-Versand fehlgeschlagen:', res.error)
  } catch (err) {
    console.error('[airdrop] SMS-Versand warf:', err)
  }

  return { ok: true, inviteId: data.id as string, smsSent }
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/lib/airdrop/__tests__/gegner-invite.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/airdrop/
git commit -m "feat(airdrop): inviteGegnerViaAirdrop — Invite-Zeile + SMS-Magic-Link

Audit: Build tsc gruen | UI n/a (Lib) | Redundanz: sendPlainSms/normalizeE164 reused |
Dead-Code: keiner | Spec: 2c-1 | Inkonsistenz: CHECK-konforme Werte (invited_via='sms',
status='offen'), Klartext-Token nie in der DB | Regression: additive Lib, 0 Consumer"
```

---

## Task 4: Invite im Gegner-Flow anstoßen + Wizard-Hinweis

**Files:**
- Modify: `src/app/schaden/[token]/actions.ts` (nach dem Foto-Block, ~Z. 183)
- Modify: `src/app/schaden/[token]/SchadenGegnerWizard.tsx` (Erfolgs-Screen)
- Create: `src/lib/vs-meldung/dispatch-task.ts`
- Test: `src/lib/vs-meldung/__tests__/dispatch-task.test.ts`

**Interfaces:**
- Consumes: `inviteGegnerViaAirdrop` (Task 3), `createLinkedTask` (Bestand)
- Produces: `erstelleVsDispatchTask(input: VsDispatchTaskInput): Promise<{ ok: boolean }>` mit
  ```ts
  type VsDispatchTaskGrund = 'kein_telefon' | 'keine_versicherung' | 'keine_schaden_email' | 'nicht_bestaetigt' | 'send_fehler'
  type VsDispatchTaskInput = { claimId: string; grund: VsDispatchTaskGrund; detail?: string }
  ```

Ein Helper für alle vier Fallback-Gründe (DRY) — `createLinkedTask` dedupliziert nicht, deshalb prüfen wir `task_code` selbst vor dem Insert (Muster: `src/lib/termine/embed-b-klaerung-task.ts:53-72`).

- [ ] **Step 1: Failing test für den Task-Helper schreiben**

`src/lib/vs-meldung/__tests__/dispatch-task.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createdTasks: Array<Record<string, unknown>> = []
const existingTask = { value: null as { id: string } | null }

vi.mock('@/lib/tasks/create-task', () => ({
  createLinkedTask: async (p: Record<string, unknown>) => {
    createdTasks.push(p)
    return { task_id: 'task-1' }
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.in = () => b
      b.maybeSingle = async () => ({ data: existingTask.value, error: null })
      return b
    },
  }),
}))

beforeEach(() => {
  createdTasks.length = 0
  existingTask.value = null
})

describe('erstelleVsDispatchTask', () => {
  it('legt einen Dispatch-Task mit CHECK-konformem entity_type an', async () => {
    const { erstelleVsDispatchTask } = await import('../dispatch-task')
    await erstelleVsDispatchTask({ claimId: 'claim-1', grund: 'keine_versicherung' })

    expect(createdTasks).toHaveLength(1)
    const t = createdTasks[0]
    expect(t.empfaenger_rolle).toBe('dispatch')
    expect(t.claim_id).toBe('claim-1')
    expect(t.entity_type).toBe('fall') // 'versicherung' steht NICHT im DB-CHECK -> Silent Fail
    expect(t.task_code).toBe('vs_meldung_keine_versicherung:claim-1')
    expect(String(t.titel)).toContain('Versicherung') // Umlaut-/Deutsch-Pflicht
  })

  it('dedupliziert: existiert schon ein offener Task mit dem task_code, kein zweiter', async () => {
    existingTask.value = { id: 'task-existing' }
    const { erstelleVsDispatchTask } = await import('../dispatch-task')
    const res = await erstelleVsDispatchTask({ claimId: 'claim-1', grund: 'keine_versicherung' })

    expect(res.ok).toBe(true)
    expect(createdTasks).toHaveLength(0)
  })

  it('jeder Grund bekommt einen eigenen Titel + task_code', async () => {
    const { erstelleVsDispatchTask } = await import('../dispatch-task')
    for (const grund of ['kein_telefon', 'keine_schaden_email', 'nicht_bestaetigt', 'send_fehler'] as const) {
      await erstelleVsDispatchTask({ claimId: 'c', grund })
    }
    const codes = createdTasks.map((t) => t.task_code)
    expect(new Set(codes).size).toBe(4)
    expect(createdTasks.every((t) => String(t.titel).length > 10)).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/vs-meldung/__tests__/dispatch-task.test.ts`
Expected: FAIL — Modul `../dispatch-task` existiert nicht.

- [ ] **Step 3: Task-Helper implementieren**

`src/lib/vs-meldung/dispatch-task.ts`:

```ts
// Slice 2c — der eine Fallback-Kanal. Jeder Pfad, auf dem die VS-Meldung nicht automatisch
// rausgehen kann, landet hier als Dispatch-Task. Kein Claim versandet still.
//
// Zwei Fallen, die hier bewusst umgangen werden:
//  - tasks.entity_type CHECK kennt KEIN 'versicherung' (nur fall|lead|abrechnung|... ) —
//    ein falscher Wert wird still verworfen. Deshalb 'fall'.
//  - createLinkedTask dedupliziert NICHT -> task_code selbst pruefen (Muster:
//    src/lib/termine/embed-b-klaerung-task.ts).
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'

export type VsDispatchTaskGrund =
  | 'kein_telefon'
  | 'keine_versicherung'
  | 'keine_schaden_email'
  | 'nicht_bestaetigt'
  | 'send_fehler'

export type VsDispatchTaskInput = {
  claimId: string
  grund: VsDispatchTaskGrund
  detail?: string
}

const TEXTE: Record<VsDispatchTaskGrund, { titel: string; beschreibung: string; prioritaet: 'normal' | 'dringend' }> = {
  kein_telefon: {
    titel: 'VS-Meldung manuell: Gegner ohne Telefonnummer',
    beschreibung:
      'Der Unfallgegner hat keine Handynummer hinterlassen — die Nummer kann nicht per SMS bestätigt werden, die Unfallmeldung geht deshalb nicht automatisch an seine Haftpflicht. Bitte den Schaden manuell an die gegnerische Versicherung melden.',
    prioritaet: 'normal',
  },
  keine_versicherung: {
    titel: 'VS-Meldung manuell: Haftpflicht des Gegners unbekannt',
    beschreibung:
      'Der Unfallgegner hat seine Haftpflichtversicherung nicht aus der Liste ausgewählt. Bitte die Versicherung ermitteln (Kennzeichen → Zentralruf der Autoversicherer) und den Schaden manuell melden.',
    prioritaet: 'dringend',
  },
  keine_schaden_email: {
    titel: 'VS-Meldung manuell: Versicherer ohne Schaden-E-Mail',
    beschreibung:
      'Für die Haftpflicht des Gegners ist keine Schaden-E-Mail-Adresse hinterlegt (betrifft rund 11 % der Versicherer). Bitte den Schaden per Post/Fax/Portal melden — und die Adresse anschließend unter /admin/versicherungen nachtragen.',
    prioritaet: 'dringend',
  },
  nicht_bestaetigt: {
    titel: 'VS-Meldung manuell: Gegner hat die SMS nicht bestätigt',
    beschreibung:
      'Der Unfallgegner hat den Bestätigungs-Link aus der SMS nicht angetippt. Die Handynummer gilt damit als unbestätigt, die automatische Meldung wurde NICHT ausgelöst. Bitte prüfen und manuell entscheiden.',
    prioritaet: 'normal',
  },
  send_fehler: {
    titel: 'VS-Meldung fehlgeschlagen: E-Mail an die Versicherung ging nicht raus',
    beschreibung:
      'Die automatische Unfallmeldung an die Haftpflicht des Gegners konnte nicht zugestellt werden. Bitte manuell nachfassen.',
    prioritaet: 'dringend',
  },
}

export async function erstelleVsDispatchTask(input: VsDispatchTaskInput): Promise<{ ok: boolean }> {
  const taskCode = `vs_meldung_${input.grund}:${input.claimId}`
  const admin = createAdminClient()

  const { data: vorhanden } = await admin
    .from('tasks')
    .select('id')
    .eq('task_code', taskCode)
    .in('status', ['offen', 'in-bearbeitung'])
    .maybeSingle()

  if (vorhanden) return { ok: true } // schon offen -> nicht doppelt anlegen

  const t = TEXTE[input.grund]
  const { task_id } = await createLinkedTask({
    titel: t.titel,
    beschreibung: input.detail ? `${t.beschreibung}\n\nDetail: ${input.detail}` : t.beschreibung,
    prioritaet: t.prioritaet,
    empfaenger_rolle: 'dispatch',
    claim_id: input.claimId,
    fall_id: input.claimId, // fallId === claimId (convert-lead-to-claim.ts:899)
    entity_type: 'fall',
    entity_id: input.claimId,
    typ: 'vs_meldung',
    task_code: taskCode,
    trigger_event: `vs_meldung_${input.grund}`,
    auto_erstellt: true,
  })

  return { ok: task_id !== null }
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/lib/vs-meldung/__tests__/dispatch-task.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Invite in `submitSchadenGegner` anstoßen**

In `src/app/schaden/[token]/actions.ts`, direkt **nach** dem `if (fallId && claimId) { … }`-Foto-Block und **vor** `revalidatePath` (~Z. 183). Imports oben ergänzen.

```ts
  // Slice 2c: Nach dem Claim laedt der Gegner-Flow zur SMS-Bestaetigung ein. Erst wenn der
  // Gegner den Magic-Link antippt, gilt seine Nummer als verifiziert und die Unfallmeldung
  // geht an seine Haftpflicht (Fraud-Gate). Ohne Nummer ist das unmoeglich -> Dispatch.
  // Fail-soft wie der Convert darueber: ein Fehler hier darf den Gegner-Submit nie brechen.
  if (claimId) {
    try {
      const tel = data.telefon?.trim()
      if (tel) {
        const invite = await inviteGegnerViaAirdrop(claimId, tel)
        if (!invite.ok) {
          await erstelleVsDispatchTask({ claimId, grund: 'send_fehler', detail: invite.error })
        }
      } else {
        await erstelleVsDispatchTask({ claimId, grund: 'kein_telefon' })
      }
    } catch (err) {
      console.error('[schaden-gegner] Airdrop-Invite fehlgeschlagen:', err)
    }
  }
```

- [ ] **Step 6: Erfolgs-Screen im Wizard**

In `src/app/schaden/[token]/SchadenGegnerWizard.tsx`, im Success-State (~Z. 148). Den Bestätigungstext um den SMS-Hinweis + den gesetzlichen Pflicht-Hinweis erweitern (Spec §„Haftpflicht-Meldung + Hinweis"):

```tsx
<p className="text-body-sm text-claimondo-navy/70">
  Wir haben Ihnen eine SMS geschickt. Bitte tippen Sie den Link darin an und bestätigen Sie
  Ihre Angaben — erst dann melden wir den Schaden Ihrer Haftpflichtversicherung.
</p>
<p className="mt-3 text-body-xs text-claimondo-navy/60">
  Hinweis: Sie sind unabhängig davon verpflichtet, den Schaden auch selbst Ihrer
  Haftpflichtversicherung zu melden.
</p>
```

- [ ] **Step 7: Typecheck + Commit**

```bash
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck
npx vitest run src/lib/vs-meldung src/lib/airdrop src/lib/api-v1
git add src/app/schaden/ src/lib/vs-meldung/
git commit -m "feat(schaden-karte): SMS-Bestaetigung nach Gegner-Submit + Dispatch-Fallback

Nach dem Claim geht ein Magic-Link per SMS an den Gegner. Ohne Telefonnummer (oder wenn der
Invite scheitert) legt der Flow stattdessen einen Dispatch-Task an — kein Claim versandet.

Audit: Build tsc gruen + vitest gruen | UI: Erfolgs-Screen nennt SMS + gesetzlichen
Pflicht-Hinweis | Redundanz: erstelleVsDispatchTask ist DER eine Fallback-Kanal |
Dead-Code: keiner | Spec: 2c-1 + Pflicht-Hinweis | Inkonsistenz: fail-soft wie der Convert
darueber, Umlaute | Regression: Submit-Pfad unveraendert (try/catch gekapselt)"
```

---

## Task 5: Empfänger auflösen (pure Entscheidung)

**Files:**
- Create: `src/lib/vs-meldung/empfaenger.ts`
- Test: `src/lib/vs-meldung/__tests__/empfaenger.test.ts`

**Interfaces:**
- Consumes: `getVersicherungById` (Bestand)
- Produces:
  ```ts
  type VsEmpfaenger =
    | { kann: true; versicherungId: string; name: string; email: string }
    | { kann: false; grund: 'keine_versicherung' | 'keine_schaden_email'; versicherungName?: string }
  resolveVsEmpfaenger(gegnerVersicherungId: string | null): Promise<VsEmpfaenger>
  ```

Bewusst als eigene, pure-ish Einheit: die Entscheidung „senden oder Task" ist die riskanteste Verzweigung im Slice und muss isoliert testbar sein.

- [ ] **Step 1: Failing test schreiben**

`src/lib/vs-meldung/__tests__/empfaenger.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const versicherung = {
  value: null as null | { id: string; name: string; schaden_email: string | null; schaden_telefon: string | null; bafin_nummer: string | null },
}

vi.mock('@/lib/versicherungen/search-actions', () => ({
  getVersicherungById: async () => versicherung.value,
}))

beforeEach(() => {
  versicherung.value = null
})

describe('resolveVsEmpfaenger', () => {
  it('kann senden, wenn Versicherung + schaden_email da sind', async () => {
    versicherung.value = { id: 'v1', name: 'Allianz Versicherungs-AG', schaden_email: 'sachschaden@allianz.de', schaden_telefon: null, bafin_nummer: null }
    const { resolveVsEmpfaenger } = await import('../empfaenger')

    expect(await resolveVsEmpfaenger('v1')).toEqual({
      kann: true,
      versicherungId: 'v1',
      name: 'Allianz Versicherungs-AG',
      email: 'sachschaden@allianz.de',
    })
  })

  it('keine Versicherung gewaehlt -> Task-Grund keine_versicherung (KEIN Send)', async () => {
    const { resolveVsEmpfaenger } = await import('../empfaenger')
    expect(await resolveVsEmpfaenger(null)).toEqual({ kann: false, grund: 'keine_versicherung' })
  })

  it('Versicherer ohne schaden_email -> Task-Grund keine_schaden_email, Name bleibt erhalten', async () => {
    versicherung.value = { id: 'v2', name: 'ADLER Versicherung AG', schaden_email: null, schaden_telefon: null, bafin_nummer: null }
    const { resolveVsEmpfaenger } = await import('../empfaenger')

    expect(await resolveVsEmpfaenger('v2')).toEqual({
      kann: false,
      grund: 'keine_schaden_email',
      versicherungName: 'ADLER Versicherung AG',
    })
  })

  it('leere schaden_email zaehlt wie keine', async () => {
    versicherung.value = { id: 'v3', name: 'X', schaden_email: '   ', schaden_telefon: null, bafin_nummer: null }
    const { resolveVsEmpfaenger } = await import('../empfaenger')
    expect((await resolveVsEmpfaenger('v3')).kann).toBe(false)
  })

  it('unbekannte ID -> keine_versicherung', async () => {
    const { resolveVsEmpfaenger } = await import('../empfaenger')
    expect(await resolveVsEmpfaenger('gibts-nicht')).toEqual({ kann: false, grund: 'keine_versicherung' })
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/vs-meldung/__tests__/empfaenger.test.ts`
Expected: FAIL — Modul `../empfaenger` existiert nicht.

- [ ] **Step 3: Implementieren**

`src/lib/vs-meldung/empfaenger.ts`:

```ts
// Slice 2c — die Verzweigung "koennen wir automatisch melden?".
// 85 von 96 aktiven Versicherern haben eine schaden_email (88,5 %, geprueft 14.07.).
// Die restlichen 11,5 % + jeder Gegner, der seine VS nicht aus der Liste gewaehlt hat,
// laufen bewusst NICHT ins Leere, sondern in einen Dispatch-Task.
import { getVersicherungById } from '@/lib/versicherungen/search-actions'

export type VsEmpfaenger =
  | { kann: true; versicherungId: string; name: string; email: string }
  | { kann: false; grund: 'keine_versicherung' | 'keine_schaden_email'; versicherungName?: string }

export async function resolveVsEmpfaenger(gegnerVersicherungId: string | null): Promise<VsEmpfaenger> {
  if (!gegnerVersicherungId) return { kann: false, grund: 'keine_versicherung' }

  const vs = await getVersicherungById(gegnerVersicherungId)
  if (!vs) return { kann: false, grund: 'keine_versicherung' }

  const email = vs.schaden_email?.trim()
  if (!email) return { kann: false, grund: 'keine_schaden_email', versicherungName: vs.name }

  return { kann: true, versicherungId: vs.id, name: vs.name, email }
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/lib/vs-meldung/__tests__/empfaenger.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vs-meldung/
git commit -m "feat(vs-meldung): Empfaenger-Resolver (senden vs. Dispatch-Task)

Audit: Build tsc gruen | UI n/a | Redundanz: getVersicherungById reused (projiziert
schaden_email bereits leak-sicher) | Dead-Code: keiner | Spec: 2c-2 Kanal + Fallback |
Inkonsistenz: Result-Union statt throw | Regression: additive Lib"
```

---

## Task 6: Claim-Daten laden + E-Mail-Template

**Files:**
- Create: `src/lib/vs-meldung/claim-daten.ts`
- Create: `src/lib/email/google/templates/UnfallmeldungVs.tsx`
- Test: `src/lib/vs-meldung/__tests__/claim-daten.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type VsMeldungDaten = {
    claimId: string
    claimNummer: string | null
    unfallDatum: string | null
    hergang: string | null
    gegnerVersicherungId: string | null   // Task 7 nutzt DIESE — kein zweiter DB-Call!
    geschaedigt: { firmaName: string | null; kennzeichen: string | null; fahrzeug: string | null }
    gegner: { name: string | null; kennzeichen: string | null; versicherungsnummer: string | null; versicherungsAktenzeichen: string | null }
  }
  ladeVsMeldungDaten(claimId: string): Promise<VsMeldungDaten | null>
  ```
  und aus dem Template: `UnfallmeldungVsEmail(props: VsMeldungDaten & { absender: string }): JSX.Element`, `subject(props: VsMeldungDaten): string`

Template-Konvention (`src/lib/email/google/templates/*`): jedes Modul exportiert die Komponente **und** eine `subject(props)`-Funktion; gerendert wird als **Funktionsaufruf** `render(Template(props))`, nicht als JSX (`flows.ts:625`).

- [ ] **Step 1: Failing test schreiben**

`src/lib/vs-meldung/__tests__/claim-daten.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = {
  claim: null as Record<string, unknown> | null,
  parties: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.maybeSingle = async () => ({ data: db.claim, error: null })
      b.then = undefined
      if (table === 'claim_parties') {
        b.eq = () => Promise.resolve({ data: db.parties, error: null })
      }
      return b
    },
  }),
}))

beforeEach(() => {
  db.claim = null
  db.parties = []
})

describe('ladeVsMeldungDaten', () => {
  it('mappt Claim + Parteien in die Melde-Struktur', async () => {
    db.claim = {
      id: 'c1',
      claim_nummer: 'CLM-2026-00635',
      unfall_datum: '2026-07-13',
      hergang_kunde_text: 'Gegner fuhr auf.',
      gegner_versicherung_id: 'v1',
    }
    db.parties = [
      {
        rolle: 'geschaedigter',
        kennzeichen: 'B-FL 202',
        firmen: { name: 'Test-Flotte GmbH' },
        vehicles: { hersteller: 'BMW', modell: '320d' },
      },
      {
        rolle: 'verursacher',
        kennzeichen: 'B-XX 9999',
        versicherungsnummer: 'POL-123',
        versicherungs_aktenzeichen: 'AZ-9',
        personen: { vorname: 'Max', nachname: 'Mustermann' },
      },
    ]

    const { ladeVsMeldungDaten } = await import('../claim-daten')
    const d = await ladeVsMeldungDaten('c1')

    expect(d).not.toBeNull()
    expect(d!.claimNummer).toBe('CLM-2026-00635')
    expect(d!.gegnerVersicherungId).toBe('v1') // Task 7 liest sie hier — kein zweiter Query
    expect(d!.geschaedigt.firmaName).toBe('Test-Flotte GmbH')
    expect(d!.geschaedigt.kennzeichen).toBe('B-FL 202')
    expect(d!.geschaedigt.fahrzeug).toBe('BMW 320d')
    expect(d!.gegner.name).toBe('Max Mustermann')
    expect(d!.gegner.kennzeichen).toBe('B-XX 9999')
    expect(d!.gegner.versicherungsnummer).toBe('POL-123')
    expect(d!.hergang).toBe('Gegner fuhr auf.')
  })

  it('unbekannter Claim -> null', async () => {
    const { ladeVsMeldungDaten } = await import('../claim-daten')
    expect(await ladeVsMeldungDaten('gibts-nicht')).toBeNull()
  })
})

describe('UnfallmeldungVs — Betreff', () => {
  it('nennt Kennzeichen des Gegners und die Police', async () => {
    const { subject } = await import('@/lib/email/google/templates/UnfallmeldungVs')
    const s = subject({
      claimId: 'c1',
      claimNummer: 'CLM-2026-00635',
      unfallDatum: '2026-07-13',
      hergang: null,
      gegnerVersicherungId: 'v1',
      geschaedigt: { firmaName: 'Test-Flotte GmbH', kennzeichen: 'B-FL 202', fahrzeug: null },
      gegner: { name: 'Max Mustermann', kennzeichen: 'B-XX 9999', versicherungsnummer: 'POL-123', versicherungsAktenzeichen: null },
    })
    expect(s).toContain('B-XX 9999')
    expect(s).toContain('POL-123')
    expect(s).toMatch(/Schadenmeldung|Haftpflichtschaden/)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/vs-meldung/__tests__/claim-daten.test.ts`
Expected: FAIL — Module existieren nicht.

- [ ] **Step 3: Loader implementieren**

`src/lib/vs-meldung/claim-daten.ts`:

```ts
// Slice 2c — alle Daten, die in die Unfallmeldung an die Gegner-Haftpflicht gehoeren.
// Bewusst ein expliziter Admin-Client-Loader statt v_claim_full: der Trigger laeuft im
// anonymen Gegner-Kontext (kein User, keine RLS-Session).
import { createAdminClient } from '@/lib/supabase/admin'

export type VsMeldungDaten = {
  claimId: string
  claimNummer: string | null
  unfallDatum: string | null
  hergang: string | null
  /** Die Gegner-Haftpflicht. Wird HIER mitgeladen, damit sendeUnfallmeldung sie nicht erneut holen muss. */
  gegnerVersicherungId: string | null
  geschaedigt: { firmaName: string | null; kennzeichen: string | null; fahrzeug: string | null }
  gegner: {
    name: string | null
    kennzeichen: string | null
    versicherungsnummer: string | null
    versicherungsAktenzeichen: string | null
  }
}

/** Supabase liefert eingebettete Relationen je nach Cardinality als Objekt ODER Array. */
function eins<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function fahrzeugName(v: { hersteller?: string | null; modell?: string | null } | null): string | null {
  if (!v) return null
  const teile = [v.hersteller, v.modell].filter((t): t is string => Boolean(t && t !== 'Unbekannt'))
  return teile.length ? teile.join(' ') : null
}

export async function ladeVsMeldungDaten(claimId: string): Promise<VsMeldungDaten | null> {
  const admin = createAdminClient()

  const { data: claim, error } = await admin
    .from('claims')
    .select('id, claim_nummer, unfall_datum, hergang_kunde_text, gegner_versicherung_id')
    .eq('id', claimId)
    .maybeSingle()

  if (error || !claim) {
    if (error) console.error('[vs-meldung] Claim-Load fehlgeschlagen:', error.message)
    return null
  }

  const { data: parties } = await admin
    .from('claim_parties')
    .select(
      'rolle, kennzeichen, versicherungsnummer, versicherungs_aktenzeichen, firmen(name), vehicles(hersteller, modell), personen(vorname, nachname)',
    )
    .eq('claim_id', claimId)

  const rows = (parties ?? []) as Array<Record<string, unknown>>
  const g = rows.find((p) => p.rolle === 'geschaedigter') ?? null
  const v = rows.find((p) => p.rolle === 'verursacher') ?? null

  const gegnerPerson = eins(v?.personen as { vorname?: string | null; nachname?: string | null } | null)
  const gegnerName = gegnerPerson
    ? [gegnerPerson.vorname, gegnerPerson.nachname].filter(Boolean).join(' ').trim() || null
    : null

  return {
    claimId: claim.id as string,
    claimNummer: (claim.claim_nummer as string | null) ?? null,
    unfallDatum: (claim.unfall_datum as string | null) ?? null,
    gegnerVersicherungId: (claim.gegner_versicherung_id as string | null) ?? null,
    // Der Gegner-Hergang landet heute in hergang_kunde_text (semantisch unsauber; die
    // saubere Spalte hergang_gegner_text ist auf die claims-DDL-Lane gegated).
    hergang: (claim.hergang_kunde_text as string | null) ?? null,
    geschaedigt: {
      firmaName: eins(g?.firmen as { name?: string } | null)?.name ?? null,
      kennzeichen: (g?.kennzeichen as string | null) ?? null,
      fahrzeug: fahrzeugName(eins(g?.vehicles as { hersteller?: string | null; modell?: string | null } | null)),
    },
    gegner: {
      name: gegnerName,
      kennzeichen: (v?.kennzeichen as string | null) ?? null,
      versicherungsnummer: (v?.versicherungsnummer as string | null) ?? null,
      versicherungsAktenzeichen: (v?.versicherungs_aktenzeichen as string | null) ?? null,
    },
  }
}
```

- [ ] **Step 4: Template implementieren**

`src/lib/email/google/templates/UnfallmeldungVs.tsx` — orientiere dich an einem bestehenden Template im selben Ordner (Struktur/Imports/Styles übernehmen). Pflichtinhalt:

```tsx
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { VsMeldungDaten } from '@/lib/vs-meldung/claim-daten'

export function subject(d: VsMeldungDaten): string {
  const teile = [
    'Schadenmeldung Haftpflichtschaden',
    d.gegner.kennzeichen ? `Kennzeichen ${d.gegner.kennzeichen}` : null,
    d.gegner.versicherungsnummer ? `Vers.-Nr. ${d.gegner.versicherungsnummer}` : null,
    d.claimNummer,
  ].filter(Boolean)
  return teile.join(' — ')
}

export function UnfallmeldungVsEmail(d: VsMeldungDaten & { absender: string }) {
  const zeile = (label: string, wert: string | null) =>
    wert ? (
      <Text style={{ margin: '2px 0', fontSize: '14px' }}>
        <strong>{label}:</strong> {wert}
      </Text>
    ) : null

  return (
    <Html lang="de">
      <Head />
      <Preview>{subject(d)}</Preview>
      <Body style={{ backgroundColor: '#f8f9fb', fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ backgroundColor: '#ffffff', padding: '24px', maxWidth: '640px' }}>
          <Heading style={{ fontSize: '18px', color: '#0D1B3E' }}>Schadenmeldung — Haftpflichtschaden</Heading>

          <Text style={{ fontSize: '14px' }}>Sehr geehrte Damen und Herren,</Text>
          <Text style={{ fontSize: '14px' }}>
            wir zeigen Ihnen einen Haftpflichtschaden an, an dem ein bei Ihnen versichertes Fahrzeug beteiligt ist.
            Der Unfallgegner hat die nachfolgenden Angaben selbst erfasst und bestätigt; seine Mobilfunknummer wurde
            per SMS verifiziert. Die Schadenfotos finden Sie im Anhang.
          </Text>

          <Section style={{ marginTop: '16px' }}>
            <Heading as="h2" style={{ fontSize: '15px', color: '#0D1B3E' }}>Bei Ihnen versicherte Seite</Heading>
            {zeile('Name', d.gegner.name)}
            {zeile('Kennzeichen', d.gegner.kennzeichen)}
            {zeile('Versicherungsnummer', d.gegner.versicherungsnummer)}
            {zeile('Schaden-/Aktenzeichen', d.gegner.versicherungsAktenzeichen)}
          </Section>

          <Section style={{ marginTop: '16px' }}>
            <Heading as="h2" style={{ fontSize: '15px', color: '#0D1B3E' }}>Geschädigte Seite</Heading>
            {zeile('Halter', d.geschaedigt.firmaName)}
            {zeile('Kennzeichen', d.geschaedigt.kennzeichen)}
            {zeile('Fahrzeug', d.geschaedigt.fahrzeug)}
          </Section>

          <Section style={{ marginTop: '16px' }}>
            <Heading as="h2" style={{ fontSize: '15px', color: '#0D1B3E' }}>Zum Unfall</Heading>
            {zeile('Unfalldatum', d.unfallDatum)}
            {zeile('Vorgang', d.claimNummer)}
            {d.hergang ? <Text style={{ fontSize: '14px', marginTop: '8px' }}>{d.hergang}</Text> : null}
          </Section>

          <Text style={{ fontSize: '14px', marginTop: '16px' }}>
            Wir machen die Ansprüche der geschädigten Seite nach § 249 BGB geltend. Ein Sachverständigengutachten
            wird beauftragt und Ihnen nach Fertigstellung übermittelt. Für Rückfragen stehen wir zur Verfügung.
          </Text>
          <Text style={{ fontSize: '14px', marginTop: '12px' }}>Mit freundlichen Grüßen<br />{d.absender}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default UnfallmeldungVsEmail
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run src/lib/vs-meldung/__tests__/claim-daten.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 6: Commit**

```bash
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck
git add src/lib/vs-meldung/ src/lib/email/
git commit -m "feat(vs-meldung): Claim-Loader + Unfallmeldungs-Template

Audit: Build tsc gruen | UI n/a (Email) | Redundanz: Template-Konvention (Komponente +
subject) uebernommen | Dead-Code: keiner | Spec: 2c-2 | Inkonsistenz: Nested-FK mit
Array.isArray normalisiert (AGENTS.md), Umlaute im Mailtext, Claimondo-Navy statt
Tailwind-Default | Regression: additive Files"
```

---

## Task 7: Der Versand (Orchestrierung, Kill-Switch, Idempotenz, Tracking)

**Files:**
- Create: `src/lib/vs-meldung/sende-unfallmeldung.ts`
- Test: `src/lib/vs-meldung/__tests__/sende-unfallmeldung.test.ts`
- Modify: `.env.example` (`VS_MELDUNG_ENABLED` dokumentieren)

**Interfaces:**
- Consumes: `resolveVsEmpfaenger` (T5), `ladeVsMeldungDaten` + Template (T6), `erstelleVsDispatchTask` (T4), `sendEmail`, `getStorageUrl`/`STORAGE_TTL`, `recordFailedOperation`
- Produces:
  ```ts
  type SendeErgebnis =
    | { ok: true; gesendet: true; empfaenger: string; anhaenge: number }
    | { ok: true; gesendet: false; grund: 'kill_switch' | 'dispatch_task' }
    | { ok: false; error: string }
  sendeUnfallmeldungAnGegnerVs(claimId: string): Promise<SendeErgebnis>
  ```

- [ ] **Step 1: Failing test schreiben**

`src/lib/vs-meldung/__tests__/sende-unfallmeldung.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sent: Array<Record<string, unknown>> = []
const tasks: Array<Record<string, unknown>> = []
const korrespondenz: Array<Record<string, unknown>> = []
const deadLetters: Array<Record<string, unknown>> = []
const state = {
  empfaenger: { kann: true, versicherungId: 'v1', name: 'Allianz', email: 'sachschaden@allianz.de' } as Record<string, unknown>,
  dokumente: [] as Array<Record<string, unknown>>,
  sendThrows: false,
}

vi.mock('../empfaenger', () => ({ resolveVsEmpfaenger: async () => state.empfaenger }))
vi.mock('../dispatch-task', () => ({
  erstelleVsDispatchTask: async (i: Record<string, unknown>) => {
    tasks.push(i)
    return { ok: true }
  },
}))
vi.mock('../claim-daten', () => ({
  ladeVsMeldungDaten: async () => ({
    claimId: 'c1', claimNummer: 'CLM-1', unfallDatum: '2026-07-13', hergang: 'Auffahrunfall',
    gegnerVersicherungId: 'v1',
    geschaedigt: { firmaName: 'Test-Flotte GmbH', kennzeichen: 'B-FL 202', fahrzeug: 'BMW 320d' },
    gegner: { name: 'Max Mustermann', kennzeichen: 'B-XX 9999', versicherungsnummer: 'POL-123', versicherungsAktenzeichen: null },
  }),
}))
vi.mock('@/lib/email/google/client', () => ({
  sendEmail: async (o: Record<string, unknown>) => {
    if (state.sendThrows) throw new Error('resend down')
    sent.push(o)
    return { messageId: 'msg-1' }
  },
}))
vi.mock('@react-email/render', () => ({ render: async () => '<html>x</html>' }))
vi.mock('@/lib/storage/url', () => ({
  getStorageUrl: async () => 'https://storage.example/foto.jpg',
  STORAGE_TTL: { download: 300 },
}))
vi.mock('@/lib/reliability/dead-letter', () => ({
  recordFailedOperation: async (i: Record<string, unknown>) => { deadLetters.push(i) },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => (t === 'fall_dokumente' ? Promise.resolve({ data: state.dokumente, error: null }) : b)
      b.is = () => Promise.resolve({ data: state.dokumente, error: null })
      b.insert = (row: Record<string, unknown>) => { korrespondenz.push(row); return Promise.resolve({ error: null }) }
      return b
    },
  }),
}))

const globalFetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
vi.stubGlobal('fetch', globalFetch)

beforeEach(() => {
  sent.length = 0; tasks.length = 0; korrespondenz.length = 0; deadLetters.length = 0
  state.empfaenger = { kann: true, versicherungId: 'v1', name: 'Allianz', email: 'sachschaden@allianz.de' }
  state.dokumente = []
  state.sendThrows = false
  process.env.VS_MELDUNG_ENABLED = 'true'
})

describe('sendeUnfallmeldungAnGegnerVs', () => {
  it('sendet an die schaden_email und protokolliert in vs_korrespondenz', async () => {
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    expect(res).toMatchObject({ ok: true, gesendet: true, empfaenger: 'sachschaden@allianz.de' })
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('sachschaden@allianz.de')

    expect(korrespondenz).toHaveLength(1)
    const k = korrespondenz[0]
    expect(k.claim_id).toBe('c1')
    expect(k.richtung).toBe('ausgehend')  // CHECK: eingehend|ausgehend
    expect(k.kanal).toBe('email')         // CHECK: email|post|fax|telefon|portal
    expect(k.status).toBe('wartet_auf_antwort') // CHECK kennt kein 'pending'
    expect(k.versicherung_id).toBe('v1')
  })

  it('haengt Schadenfotos an (mit korrekter Dateiendung — Resend leitet den MIME daraus ab)', async () => {
    state.dokumente = [
      { id: 'd1', dokument_typ: 'gegner_fahrzeug_foto', storage_path: 'claims/c1/a.jpg', original_filename: 'a.jpg', mime_type: 'image/jpeg', groesse_bytes: 1000 },
      { id: 'd2', dokument_typ: 'unfallort_foto', storage_path: 'claims/c1/b.jpg', original_filename: 'b.jpg', mime_type: 'image/jpeg', groesse_bytes: 1000 },
    ]
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    expect(res).toMatchObject({ gesendet: true, anhaenge: 2 })
    const att = sent[0].attachments as Array<{ filename: string; contentType?: string }>
    expect(att).toHaveLength(2)
    expect(att[0].filename).toMatch(/\.jpg$/)
    expect(att[0].contentType).toBe('image/jpeg')
  })

  it('KILL-SWITCH aus: kein Send, aber Tracking-Zeile mit Dry-Run-Marker', async () => {
    process.env.VS_MELDUNG_ENABLED = 'false'
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    expect(res).toMatchObject({ ok: true, gesendet: false, grund: 'kill_switch' })
    expect(sent).toHaveLength(0) // NICHTS geht an einen echten Versicherer
    expect(korrespondenz).toHaveLength(1)
    expect(korrespondenz[0].status).toBe('archiviert') // CHECK-konform
    expect(String(korrespondenz[0].notiz)).toContain('DRY-RUN')
  })

  it('keine Versicherung -> Dispatch-Task, kein Send', async () => {
    state.empfaenger = { kann: false, grund: 'keine_versicherung' }
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    expect(res).toMatchObject({ ok: true, gesendet: false, grund: 'dispatch_task' })
    expect(sent).toHaveLength(0)
    expect(tasks[0]).toMatchObject({ claimId: 'c1', grund: 'keine_versicherung' })
  })

  it('Versicherer ohne schaden_email -> Dispatch-Task, kein Send', async () => {
    state.empfaenger = { kann: false, grund: 'keine_schaden_email', versicherungName: 'ADLER' }
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    await sendeUnfallmeldungAnGegnerVs('c1')

    expect(sent).toHaveLength(0)
    expect(tasks[0]).toMatchObject({ grund: 'keine_schaden_email' })
  })

  it('Send-Fehler -> Dead-Letter + Dispatch-Task, kein Tracking-Eintrag als gesendet', async () => {
    state.sendThrows = true
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    expect(res.ok).toBe(false)
    expect(deadLetters[0]).toMatchObject({ operationType: 'vs_meldung_email', dedupKey: 'vs_meldung:c1' })
    expect(tasks[0]).toMatchObject({ grund: 'send_fehler' })
    expect(korrespondenz).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/vs-meldung/__tests__/sende-unfallmeldung.test.ts`
Expected: FAIL — Modul `../sende-unfallmeldung` existiert nicht.

- [ ] **Step 3: Implementieren**

`src/lib/vs-meldung/sende-unfallmeldung.ts`:

```ts
// Slice 2c — Herzstueck: die Unfallmeldung an die Haftpflicht des Gegners.
//
// KILL-SWITCH (VS_MELDUNG_ENABLED, Default true): Diese Funktion schickt E-Mails an ECHTE
// Versicherer. Der projektweite SIDE_EFFECT_MODE schuetzt hier NICHT — er ist per Default
// 'live' und filtert nur INTERNE Empfaenger (@claimondo.de); sachschaden@allianz.de ist
// extern und wuerde real zugestellt. Auf staging MUSS VS_MELDUNG_ENABLED=false stehen.
import { render } from '@react-email/render'
import { sendEmail } from '@/lib/email/google/client'
import { UnfallmeldungVsEmail, subject } from '@/lib/email/google/templates/UnfallmeldungVs'
import { recordFailedOperation } from '@/lib/reliability/dead-letter'
import { getStorageUrl, STORAGE_TTL } from '@/lib/storage/url'
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeVsMeldungDaten } from './claim-daten'
import { erstelleVsDispatchTask } from './dispatch-task'
import { resolveVsEmpfaenger } from './empfaenger'

const ABSENDER = 'Claimondo GmbH — Schadenmanagement'
const MAX_ANHANG_BYTES = 20 * 1024 * 1024 // Gmail bounct ueber ~25 MB (Muster: flows.ts:553)
const FOTO_TYPEN = ['gegner_fahrzeug_foto', 'eigenes_fahrzeug_foto', 'unfallort_foto']

export type SendeErgebnis =
  | { ok: true; gesendet: true; empfaenger: string; anhaenge: number }
  | { ok: true; gesendet: false; grund: 'kill_switch' | 'dispatch_task' }
  | { ok: false; error: string }

function sendAktiv(): boolean {
  return (process.env.VS_MELDUNG_ENABLED ?? 'true') !== 'false'
}

type Anhang = { filename: string; content: Buffer; contentType?: string }

async function ladeFotoAnhaenge(claimId: string): Promise<Anhang[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('fall_dokumente')
    .select('id, dokument_typ, storage_path, original_filename, mime_type, groesse_bytes')
    .eq('claim_id', claimId)

  const fotos = ((data ?? []) as Array<Record<string, unknown>>).filter((d) =>
    FOTO_TYPEN.includes(d.dokument_typ as string),
  )

  const anhaenge: Anhang[] = []
  let summe = 0

  for (const d of fotos) {
    try {
      const url = await getStorageUrl(admin, 'fall-dokumente', d.storage_path as string, {
        ttl: STORAGE_TTL.download,
      })
      const res = await fetch(url)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (summe + buf.byteLength > MAX_ANHANG_BYTES) {
        console.warn('[vs-meldung] Anhang-Limit erreicht, weitere Fotos ausgelassen')
        break
      }
      summe += buf.byteLength
      anhaenge.push({
        // Dateiname MUSS die Endung tragen: der Resend-Pfad in sendEmail reicht contentType
        // nicht durch (client.ts:140) und leitet den MIME-Typ aus dem Namen ab.
        filename: (d.original_filename as string) ?? `${d.dokument_typ}-${d.id}.jpg`,
        content: buf,
        contentType: (d.mime_type as string) ?? 'image/jpeg',
      })
    } catch (err) {
      console.error('[vs-meldung] Anhang konnte nicht geladen werden:', err)
    }
  }
  return anhaenge
}

async function protokolliere(
  claimId: string,
  versicherungId: string,
  versicherungName: string,
  betreff: string,
  status: 'wartet_auf_antwort' | 'archiviert',
  notiz: string | null,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('vs_korrespondenz').insert({
    claim_id: claimId,
    richtung: 'ausgehend',
    kanal: 'email',
    typ: 'unfallmeldung_gegner',
    status,
    datum: new Date().toISOString(),
    versicherung_id: versicherungId,
    versicherung: versicherungName,
    betreff,
    notiz,
  })
  if (error) console.error('[vs-meldung] vs_korrespondenz-Insert fehlgeschlagen:', error.message)
}

/**
 * Meldet den Schaden der Haftpflicht des Unfallgegners. Wird ausgeloest, sobald der Gegner
 * seine Handynummer per SMS-Link bestaetigt hat (siehe app/unfallmeldung/[token]).
 *
 * Der Aufrufer garantiert die Idempotenz (Compare-and-Swap auf airdrop_invitations.
 * responded_at) — diese Funktion selbst ist NICHT gegen Doppelaufruf geschuetzt.
 */
export async function sendeUnfallmeldungAnGegnerVs(claimId: string): Promise<SendeErgebnis> {
  const daten = await ladeVsMeldungDaten(claimId)
  if (!daten) return { ok: false, error: 'Claim nicht gefunden' }

  const empfaenger = await resolveVsEmpfaenger(daten.gegnerVersicherungId)

  if (!empfaenger.kann) {
    await erstelleVsDispatchTask({
      claimId,
      grund: empfaenger.grund,
      detail: empfaenger.versicherungName ?? undefined,
    })
    return { ok: true, gesendet: false, grund: 'dispatch_task' }
  }

  const betreff = subject(daten)

  if (!sendAktiv()) {
    await protokolliere(
      claimId,
      empfaenger.versicherungId,
      empfaenger.name,
      betreff,
      'archiviert',
      `[DRY-RUN] VS_MELDUNG_ENABLED=false — nicht versendet. Empfaenger waere: ${empfaenger.email}`,
    )
    console.warn(`[vs-meldung] DRY-RUN — kein Versand an ${empfaenger.email} (VS_MELDUNG_ENABLED=false)`)
    return { ok: true, gesendet: false, grund: 'kill_switch' }
  }

  const anhaenge = await ladeFotoAnhaenge(claimId)

  try {
    const html = await render(UnfallmeldungVsEmail({ ...daten, absender: ABSENDER }))
    await sendEmail({
      to: empfaenger.email,
      subject: betreff,
      html,
      attachments: anhaenge,
      fallId: claimId,
      template: 'unfallmeldung_vs',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[vs-meldung] Versand fehlgeschlagen:', msg)
    await recordFailedOperation({
      operationType: 'vs_meldung_email',
      dedupKey: `vs_meldung:${claimId}`,
      entityType: 'claim',
      entityId: claimId,
      payload: { empfaenger: empfaenger.email, versicherungId: empfaenger.versicherungId },
      error: msg,
    })
    await erstelleVsDispatchTask({ claimId, grund: 'send_fehler', detail: msg })
    return { ok: false, error: msg }
  }

  await protokolliere(
    claimId,
    empfaenger.versicherungId,
    empfaenger.name,
    betreff,
    'wartet_auf_antwort',
    `Automatische Unfallmeldung nach SMS-Bestätigung des Gegners. ${anhaenge.length} Foto-Anhänge.`,
  )

  return { ok: true, gesendet: true, empfaenger: empfaenger.email, anhaenge: anhaenge.length }
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/lib/vs-meldung/__tests__/sende-unfallmeldung.test.ts`
Expected: PASS (6 Tests).

- [ ] **Step 5: `.env.example` ergänzen**

Bei den Feature-Flags:

```bash
# Slice 2c — Automatische Unfallmeldung an die Haftpflicht des Unfallgegners.
# Default true (prod sendet). Auf STAGING zwingend false: SIDE_EFFECT_MODE filtert nur
# interne Empfaenger, eine echte Versicherer-Adresse wuerde real angeschrieben.
VS_MELDUNG_ENABLED=false
```

- [ ] **Step 6: Commit**

```bash
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck
git add src/lib/vs-meldung/ .env.example
git commit -m "feat(vs-meldung): Unfallmeldung an die Gegner-Haftpflicht (Mail + Fotos + Tracking)

Kill-Switch VS_MELDUNG_ENABLED (Default true, staging=false): SIDE_EFFECT_MODE schuetzt
hier nicht, er filtert nur interne Empfaenger. Jeder nicht-automatisierbare Pfad endet in
einem Dispatch-Task; Send-Fehler zusaetzlich im Dead-Letter (recovery-monitor eskaliert).

Audit: Build tsc gruen + vitest 6/6 | UI n/a | Redundanz: sendEmail/attachFromStorage-
Muster/createLinkedTask/recordFailedOperation reused | Dead-Code: keiner | Spec: 2c-2
(Fotos als Anhang, schaden_email-Kanal, Fallback) | Inkonsistenz: CHECK-konforme
vs_korrespondenz-Werte, Umlaute | Regression: additive Lib, 0 bestehende Consumer"
```

---

## Task 8: Bestätigungs-Route `/unfallmeldung/[token]`

**Files:**
- Create: `src/app/unfallmeldung/[token]/page.tsx`
- Create: `src/app/unfallmeldung/[token]/actions.ts`
- Create: `src/app/unfallmeldung/[token]/BestaetigungClient.tsx`
- Modify: `src/lib/airdrop/gegner-invite.ts` (+ Resolve + CAS-Bestätigung)
- Modify: `src/lib/supabase/middleware.ts` (`/unfallmeldung` public)
- Test: `src/lib/airdrop/__tests__/bestaetigung.test.ts`

**Interfaces:**
- Produces (in `gegner-invite.ts`):
  ```ts
  type InviteKontext = { inviteId: string; claimId: string; status: string; abgelaufen: boolean; bereitsBestaetigt: boolean }
  resolveInviteToken(token: string): Promise<InviteKontext | null>
  markiereInviteGeoeffnet(inviteId: string): Promise<void>
  bestaetigeInvite(inviteId: string): Promise<{ gewonnen: boolean }>   // CAS
  ```

Der **Compare-and-Swap** ist die Idempotenz-Garantie des ganzen Slices: `UPDATE … SET responded_at=now() WHERE id=? AND responded_at IS NULL` — nur wenn das genau eine Zeile trifft, wird gesendet. Doppelklick, Link zweimal geöffnet, Retry: alles kann die Meldung nicht doppelt auslösen. (Lehre aus `cron/vs-timer/route.ts:66-75`: Zustand vor dem Side-Effect.)

- [ ] **Step 1: Failing test schreiben**

`src/lib/airdrop/__tests__/bestaetigung.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  row: null as Record<string, unknown> | null,
  updateTrifft: 1, // wie viele Zeilen das CAS-UPDATE trifft
  updateFilter: [] as Array<[string, unknown]>,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (c: string, v: unknown) => { state.updateFilter.push([c, v]); return b }
      b.is = (c: string, v: unknown) => { state.updateFilter.push([c, v]); return b }
      b.maybeSingle = async () => ({ data: state.row, error: null })
      b.update = () => b
      // Supabase gibt bei .select() nach update die betroffenen Zeilen zurueck:
      b.then = (r: (x: { data: unknown[]; error: null }) => unknown) =>
        r({ data: state.updateTrifft > 0 ? [{ id: 'i1' }] : [], error: null })
      return b
    },
  }),
}))

beforeEach(() => {
  state.row = null
  state.updateTrifft = 1
  state.updateFilter = []
})

describe('resolveInviteToken', () => {
  it('findet den Invite ueber den Hash (nicht ueber den Klartext-Token)', async () => {
    const { generateAirdropToken } = await import('../token')
    const { token, tokenHash, lookupPrefix } = generateAirdropToken()
    state.row = {
      id: 'i1', claim_id: 'c1', status: 'offen', responded_at: null,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      token_hash: tokenHash, token_lookup_prefix: lookupPrefix,
    }

    const { resolveInviteToken } = await import('../gegner-invite')
    const ctx = await resolveInviteToken(token)

    expect(ctx).toMatchObject({ inviteId: 'i1', claimId: 'c1', abgelaufen: false, bereitsBestaetigt: false })
    expect(state.updateFilter).toContainEqual(['token_lookup_prefix', lookupPrefix])
  })

  it('abgelaufener Invite wird als abgelaufen markiert', async () => {
    const { generateAirdropToken } = await import('../token')
    const { token, tokenHash, lookupPrefix } = generateAirdropToken()
    state.row = {
      id: 'i1', claim_id: 'c1', status: 'offen', responded_at: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      token_hash: tokenHash, token_lookup_prefix: lookupPrefix,
    }
    const { resolveInviteToken } = await import('../gegner-invite')
    expect((await resolveInviteToken(token))?.abgelaufen).toBe(true)
  })

  it('falscher Token (Hash passt nicht) -> null', async () => {
    const { generateAirdropToken } = await import('../token')
    const a = generateAirdropToken()
    const b = generateAirdropToken()
    state.row = {
      id: 'i1', claim_id: 'c1', status: 'offen', responded_at: null,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      token_hash: a.tokenHash, token_lookup_prefix: a.lookupPrefix,
    }
    const { resolveInviteToken } = await import('../gegner-invite')
    expect(await resolveInviteToken(b.token)).toBeNull()
  })
})

describe('bestaetigeInvite — Compare-and-Swap', () => {
  it('erster Aufruf gewinnt', async () => {
    state.updateTrifft = 1
    const { bestaetigeInvite } = await import('../gegner-invite')
    expect(await bestaetigeInvite('i1')).toEqual({ gewonnen: true })
    // Das CAS-Praedikat MUSS auf responded_at IS NULL filtern:
    expect(state.updateFilter).toContainEqual(['responded_at', null])
  })

  it('zweiter Aufruf verliert -> kein zweiter VS-Versand', async () => {
    state.updateTrifft = 0
    const { bestaetigeInvite } = await import('../gegner-invite')
    expect(await bestaetigeInvite('i1')).toEqual({ gewonnen: false })
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/airdrop/__tests__/bestaetigung.test.ts`
Expected: FAIL — `resolveInviteToken is not a function`.

- [ ] **Step 3: Resolve + CAS in `gegner-invite.ts` ergänzen**

Ans Ende von `src/lib/airdrop/gegner-invite.ts`:

```ts
import { timingSafeEqual } from 'node:crypto'
import { airdropLookupPrefix, hashAirdropToken } from './token'

export type InviteKontext = {
  inviteId: string
  claimId: string
  status: string
  abgelaufen: boolean
  bereitsBestaetigt: boolean
}

function hashGleich(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Loest den Klartext-Token aus der SMS auf: Lookup ueber den Prefix, Vergleich ueber den Hash. */
export async function resolveInviteToken(token: string): Promise<InviteKontext | null> {
  const t = token?.trim()
  if (!t) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('airdrop_invitations')
    .select('id, claim_id, status, responded_at, expires_at, token_hash')
    .eq('token_lookup_prefix', airdropLookupPrefix(t))
    .maybeSingle()

  if (error || !data) return null
  if (!hashGleich(data.token_hash as string, hashAirdropToken(t))) return null

  return {
    inviteId: data.id as string,
    claimId: data.claim_id as string,
    status: data.status as string,
    abgelaufen: new Date(data.expires_at as string).getTime() < Date.now(),
    bereitsBestaetigt: data.responded_at !== null,
  }
}

export async function markiereInviteGeoeffnet(inviteId: string): Promise<void> {
  const admin = createAdminClient()
  // opened_at nur beim ERSTEN Oeffnen setzen (chk_airdrop_responded_after_opened).
  await admin
    .from('airdrop_invitations')
    .update({ status: 'geoeffnet', opened_at: new Date().toISOString() })
    .eq('id', inviteId)
    .is('opened_at', null)
}

/**
 * Compare-and-Swap: setzt responded_at NUR, wenn es noch NULL ist. Genau ein Aufrufer
 * gewinnt — er (und nur er) loest die Unfallmeldung an die Versicherung aus. Doppelklick,
 * erneutes Oeffnen des Links oder ein Retry koennen die Meldung damit nicht doppelt
 * verschicken (eine zweite Mail an einen Versicherer waere nicht zurueckholbar).
 */
export async function bestaetigeInvite(inviteId: string): Promise<{ gewonnen: boolean }> {
  const admin = createAdminClient()
  const jetzt = new Date().toISOString()
  const { data, error } = await admin
    .from('airdrop_invitations')
    .update({ responded_at: jetzt, status: 'daten_eingegeben' }) // CHECK kennt kein 'bestaetigt'
    .eq('id', inviteId)
    .is('responded_at', null)
    .select('id')

  if (error) {
    console.error('[airdrop] Bestaetigung fehlgeschlagen:', error.message)
    return { gewonnen: false }
  }
  return { gewonnen: (data?.length ?? 0) > 0 }
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/lib/airdrop/__tests__/bestaetigung.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Server-Action**

`src/app/unfallmeldung/[token]/actions.ts`:

```ts
'use server'

import { bestaetigeInvite, resolveInviteToken } from '@/lib/airdrop/gegner-invite'
import { sendeUnfallmeldungAnGegnerVs } from '@/lib/vs-meldung/sende-unfallmeldung'

export async function bestaetigeGegnerMeldung(token: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolveInviteToken(token)
  if (!ctx) return { ok: false, error: 'Dieser Link ist ungültig.' }
  if (ctx.abgelaufen) return { ok: false, error: 'Dieser Link ist abgelaufen. Bitte wenden Sie sich an uns.' }
  if (ctx.bereitsBestaetigt) return { ok: true } // idempotent: schon bestaetigt = Erfolg

  const { gewonnen } = await bestaetigeInvite(ctx.inviteId)
  if (!gewonnen) return { ok: true } // ein paralleler Aufruf war schneller — auch Erfolg

  // Nur der CAS-Gewinner meldet. Fail-soft: der Gegner hat seinen Teil getan; scheitert der
  // Versand, faengt ihn der Dead-Letter/Dispatch-Task ab (in sendeUnfallmeldung gekapselt).
  try {
    await sendeUnfallmeldungAnGegnerVs(ctx.claimId)
  } catch (err) {
    console.error('[unfallmeldung] VS-Meldung nach Bestaetigung fehlgeschlagen:', err)
  }

  return { ok: true }
}
```

- [ ] **Step 6: Page + Client**

`src/app/unfallmeldung/[token]/page.tsx`:

```tsx
// Public — der Token IST die Autorisierung (Muster: /schaden/[token]).
import { notFound } from 'next/navigation'
import { markiereInviteGeoeffnet, resolveInviteToken } from '@/lib/airdrop/gegner-invite'
import { ladeVsMeldungDaten } from '@/lib/vs-meldung/claim-daten'
import { BestaetigungClient } from './BestaetigungClient'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await resolveInviteToken(token)
  if (!ctx) notFound()

  await markiereInviteGeoeffnet(ctx.inviteId)
  const daten = await ladeVsMeldungDaten(ctx.claimId)

  return (
    <BestaetigungClient
      token={token}
      abgelaufen={ctx.abgelaufen}
      bereitsBestaetigt={ctx.bereitsBestaetigt}
      gegnerName={daten?.gegner.name ?? null}
      kennzeichen={daten?.gegner.kennzeichen ?? null}
      unfallDatum={daten?.unfallDatum ?? null}
      hergang={daten?.hergang ?? null}
    />
  )
}
```

`src/app/unfallmeldung/[token]/BestaetigungClient.tsx` — 'use client'. Inhalt:
- Abgelaufen → freundlicher Hinweis + Telefonnummer, kein Button.
- Bereits bestätigt → Danke-Screen.
- Sonst: Zusammenfassung (Name, Kennzeichen, Datum, Hergang) + **Pflicht-Hinweis** („Der Schaden wird der Haftpflichtversicherung des Unfallverursachers gemeldet. Sie sind verpflichtet, den Schaden auch selbst Ihrer Haftpflichtversicherung zu melden.") + Button „Angaben bestätigen" (`primitives.Button`, `loading`-State) → ruft `bestaetigeGegnerMeldung(token)` → Danke-Screen.
- Alle Texte deutsch mit Umlauten. Karten/Buttons aus `@/components/primitives/*` (Komponenten-Set-Policy — handgerolltes `<button className="...">` wird vom CI-Ratchet geblockt).

- [ ] **Step 7: Route public schalten**

In `src/lib/supabase/middleware.ts`, `isPublicPath` — analog zum bestehenden `/schaden`-Eintrag `/unfallmeldung` ergänzen.

- [ ] **Step 8: Verifizieren + Commit**

```bash
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck
npx vitest run src/lib/airdrop src/lib/vs-meldung src/lib/api-v1
npm run check:component-set && npm run check:token-audit
git add src/app/unfallmeldung/ src/lib/airdrop/ src/lib/supabase/middleware.ts
git commit -m "feat(unfallmeldung): Bestaetigungs-Route + Compare-and-Swap-Trigger

Der Gegner tippt den SMS-Link an, sieht seine Meldung samt Pflicht-Hinweis und bestaetigt.
Der CAS-Update (responded_at IS NULL) stellt sicher, dass genau EIN Aufruf die Meldung an
die Versicherung ausloest — eine doppelte Mail an einen Versicherer waere nicht
zurueckholbar.

Audit: Build tsc gruen + vitest gruen + component-set/token-audit gruen | UI: public Route
/unfallmeldung/[token], Bestaetigen-Button, Pflicht-Hinweis | Redundanz: /schaden/[token]-
Token-Muster + primitives reused | Dead-Code: keiner | Spec: 2c-1 Accept-Route + Hinweis |
Inkonsistenz: CHECK-konformer Status 'daten_eingegeben', Umlaute | Regression: middleware
nur additiv (neuer public-Pfad)"
```

---

## Task 9: Nachfass-Cron (unbestätigte Invites → Dispatch)

**Files:**
- Create: `src/app/api/cron/gegner-invite-nachfassen/route.ts`
- Modify: `docs/vps-crontab.md`
- Test: `src/app/api/cron/gegner-invite-nachfassen/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `assertCronAuth`, `erstelleVsDispatchTask`

Der Gegner tippt den Link nicht an → die Meldung geht nie raus. Ohne diesen Cron würde der Claim still liegenbleiben. Nach 48 h bekommt Dispatch einen Task (`erstelleVsDispatchTask` dedupliziert selbst, ein zweiter Lauf legt also keinen zweiten Task an).

- [ ] **Step 1: Failing test schreiben**

`src/app/api/cron/gegner-invite-nachfassen/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tasks: Array<Record<string, unknown>> = []
const state = { authed: true, invites: [] as Array<Record<string, unknown>>, updated: [] as string[] }

vi.mock('@/lib/auth/cron-auth', () => ({ assertCronAuth: () => state.authed }))
vi.mock('@/lib/vs-meldung/dispatch-task', () => ({
  erstelleVsDispatchTask: async (i: Record<string, unknown>) => { tasks.push(i); return { ok: true } },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.in = () => b
      b.is = () => b
      b.lt = async () => ({ data: state.invites, error: null })
      b.update = () => b
      b.eq = async (_c: string, v: string) => { state.updated.push(v); return { error: null } }
      return b
    },
  }),
}))

beforeEach(() => {
  tasks.length = 0
  state.authed = true
  state.invites = []
  state.updated = []
})

describe('GET /api/cron/gegner-invite-nachfassen', () => {
  it('ohne CRON_SECRET: 401, keine Nebenwirkung', async () => {
    state.authed = false
    const { GET } = await import('../route')
    const res = await GET(new Request('http://x'))
    expect(res.status).toBe(401)
    expect(tasks).toHaveLength(0)
  })

  it('unbestaetigte Invites aelter als 48h -> Dispatch-Task je Claim', async () => {
    state.invites = [
      { id: 'i1', claim_id: 'c1' },
      { id: 'i2', claim_id: 'c2' },
    ]
    const { GET } = await import('../route')
    const res = await GET(new Request('http://x'))

    expect(res.status).toBe(200)
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({ claimId: 'c1', grund: 'nicht_bestaetigt' })
    expect(state.updated).toEqual(['i1', 'i2']) // als abgelaufen markiert -> kein zweiter Lauf
  })

  it('nichts zu tun -> 200 mit 0', async () => {
    const { GET } = await import('../route')
    const res = await GET(new Request('http://x'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ eskaliert: 0 })
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/app/api/cron/gegner-invite-nachfassen`
Expected: FAIL — Route existiert nicht.

- [ ] **Step 3: Route implementieren**

`src/app/api/cron/gegner-invite-nachfassen/route.ts`:

```ts
// Slice 2c — Auffangnetz: Der Unfallgegner hat den SMS-Bestaetigungs-Link nicht angetippt.
// Ohne Bestaetigung geht KEINE Meldung an seine Haftpflicht (Fraud-Gate). Nach 48 h uebernimmt
// ein Mensch. erstelleVsDispatchTask dedupliziert per task_code -> mehrfache Laeufe sind sicher.
//
// Schedule (VPS-crontab, NICHT vercel.json): 0 7 * * *  cron-call.sh /api/cron/gegner-invite-nachfassen
import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { erstelleVsDispatchTask } from '@/lib/vs-meldung/dispatch-task'

export const dynamic = 'force-dynamic'

const FRIST_STUNDEN = 48

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const grenze = new Date(Date.now() - FRIST_STUNDEN * 60 * 60_000).toISOString()

  const { data, error } = await admin
    .from('airdrop_invitations')
    .select('id, claim_id')
    .in('status', ['offen', 'geoeffnet'])
    .is('responded_at', null)
    .lt('invited_at', grenze)

  if (error) {
    console.error('[cron/gegner-invite-nachfassen] Query fehlgeschlagen:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const invites = (data ?? []) as Array<{ id: string; claim_id: string }>
  let eskaliert = 0

  for (const inv of invites) {
    try {
      await erstelleVsDispatchTask({
        claimId: inv.claim_id,
        grund: 'nicht_bestaetigt',
        detail: `Einladung seit über ${FRIST_STUNDEN} Stunden unbestätigt.`,
      })
      // Status VOR/ohne weiteren Side-Effect fortschreiben: der naechste Lauf soll denselben
      // Invite nicht erneut aufgreifen (der Task selbst ist per task_code eh dedupliziert).
      await admin.from('airdrop_invitations').update({ status: 'abgelaufen', abgelaufen_am: new Date().toISOString() }).eq('id', inv.id)
      eskaliert++
    } catch (err) {
      console.error('[cron/gegner-invite-nachfassen] Invite', inv.id, 'fehlgeschlagen:', err)
      continue // Fehler pro Item -> weiter, nie throw (Cron-Hausmuster)
    }
  }

  return NextResponse.json({ geprueft: invites.length, eskaliert })
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/app/api/cron/gegner-invite-nachfassen`
Expected: PASS (3 Tests).

- [ ] **Step 5: Crontab dokumentieren**

In `docs/vps-crontab.md` bei den täglichen Jobs ergänzen — **und im Abschluss-Report erwähnen, dass der Eintrag auf dem VPS noch gesetzt werden muss** (das Repo-Doc ist nur der Abzug, die Wahrheit ist `crontab -e` auf `212.132.119.110`):

```cron
0    7 * * *  cron-call.sh /api/cron/gegner-invite-nachfassen
```

- [ ] **Step 6: Volle Verifikation + Commit**

```bash
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck
npx vitest run src/lib/airdrop src/lib/vs-meldung src/lib/api-v1 src/app/api/cron/gegner-invite-nachfassen
npm run check:component-set && npm run check:token-audit && npm run check:knip
git add src/app/api/cron/ docs/vps-crontab.md
git commit -m "feat(cron): unbestaetigte Gegner-Invites nach 48h an Dispatch eskalieren

Audit: Build tsc gruen + vitest gruen + alle Ratchets gruen | UI: Task erscheint im
Dispatch-Dashboard | Redundanz: assertCronAuth + erstelleVsDispatchTask reused |
Dead-Code: keiner | Spec: 2c Fallback 'Gegner ohne Handy/ohne Reaktion' | Inkonsistenz:
fail-closed Auth, continue-statt-throw (Cron-Hausmuster) | Regression: neue Route, keine
bestehende beruehrt. TODO Deploy: crontab-Zeile auf dem VPS setzen"
```

---

## Verifikation vor dem PR

- [ ] `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck` → 0 Fehler
- [ ] `npm test` → alle grün (die ~28 neuen Tests aus diesem Plan inklusive)
- [ ] `npm run check:component-set` / `check:token-audit` / `check:knip` → keine neuen Verstöße
- [ ] **Staging-Smoke (Playwright, Regel 4)** — Ablauf, der **keine** echte Versicherer-Mail auslöst:
  1. `VS_MELDUNG_ENABLED=false` auf staging setzen (**vor** dem Deploy prüfen!).
  2. `https://app.staging.claimondo.de/schaden/SKT-N9EAA4Y6MJYYCT3W` (Karte ist an B-FL 202 gebunden), Wizard ausfüllen — **mit** Telefonnummer, **mit** Versicherer-Auswahl, **mit** einem Foto. Genau das hat der 2b-Smoke ausgelassen.
  3. DB: neue `airdrop_invitations`-Zeile (`status='offen'`, `invited_via='sms'`)? Kam die SMS an?
  4. Link antippen → `/unfallmeldung/[token]` → bestätigen.
  5. DB-Assert: `airdrop_invitations.responded_at` gesetzt, `status='daten_eingegeben'`; **`vs_korrespondenz`** hat eine Zeile mit `typ='unfallmeldung_gegner'`, `status='archiviert'`, Notiz enthält `[DRY-RUN]` + die Zieladresse. **`email_log` darf KEINEN Versand an den Versicherer zeigen.**
  6. Zweiter Klick auf denselben Link → **keine zweite** `vs_korrespondenz`-Zeile (CAS greift).
  7. Fallback-Pfad: zweiter Durchlauf **ohne** Versicherer-Auswahl → Dispatch-Task „Haftpflicht des Gegners unbekannt" erscheint unter `/dispatch/dashboard`.
- [ ] Test-Artefakte notieren (Claims/Leads/Invites an der Test-Flotte), damit sie beim nächsten prod-Cleanup erfasst werden.
- [ ] PR gegen **`staging`** (Regel 1 — niemals direkt auf `main`).
- [ ] **Im PR-Body prominent:** Vor dem Prod-Deploy muss `VS_MELDUNG_ENABLED` auf prod bewusst gesetzt/weggelassen werden (Default `true` = live, wie entschieden) **und** die Crontab-Zeile auf dem VPS eingetragen werden. Der DPIA-Status („Entwurf, DSB-Prüfung aussteht") gehört ebenfalls in den PR-Body — Aaron hat den Go-Live bewusst freigegeben, aber die Nachvollziehbarkeit muss im PR stehen.

## Ausdrücklich NICHT in diesem Slice

- **Kein `hergang_gegner_text`** — die saubere Spalte ist auf die claims-DDL-Lane (a6c863e2) gegated; wir lesen weiter `hergang_kunde_text` (mit Kommentar im Code).
- **Kein `unfallberichte`** — die Tabelle existiert nicht und braucht DDL. Die Unterschrift liegt bereits in `fall_dokumente` (`gegner_unterschrift`); der Rest ist ein eigener Slice.
- **Kein Account-Upgrade des Gegners** (`konvertiert_zu_voll_am`/`resulting_user_id`) — separater Schritt.
- **Kein Freitext-Versicherer** (bewusst, Aaron-Entscheidung 14.07.): Der Picker bleibt streng, unbekannte Versicherer laufen in den Dispatch-Task.
