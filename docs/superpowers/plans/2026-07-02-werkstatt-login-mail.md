# Werkstatt Login-/Willkommens-Mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Admin kann aus `/admin/werkstaetten` eine Claimondo-gebrandete Login-/Willkommens-Mail an eine Werkstatt senden (Magic-Link + — wo sicher — Einmalpasswort), aus der Liste und aus dem Anlage-Dialog.

**Architecture:** Reuse des SV-Willkommensmail-Stacks: neues react-email-Template + Flow-Funktion (`flows.ts`) + Server-Action (`admin/werkstaetten/actions.ts`) nach `resendWelcomeMail`-Muster. Zugang via Supabase-Recovery-Magic-Link; Einmalpasswort ohne Clobber (aktive Werkstatt behält ihr Passwort).

**Tech Stack:** Next.js 15 Server-Actions, react-email + Resend (`sendEmail`), Supabase Auth Admin-API (`generateLink`/`updateUserById`), vitest.

## Global Constraints

- **Branch:** Alles auf `kitta/werkstatt-auftrag-view` (PR #3449). Kein neuer Branch (Konflikt-Vermeidung auf `actions.ts`/`WerkstaettenClient.tsx`).
- **DDL nur via Plugin** (`apply_migration` → `list_migrations` → File==Version). `execute_sql` nur READ. (Regel 2)
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }` (dieses File nutzt `ok`, nicht `success`). Kein `throw` (außer Auth-Guard). E-Mail-Send-Fehler → `{ ok:false, error }` (Senden ist der Zweck).
- **UI-Strings:** echte Umlaute (`ä/ö/ü/ß`). `Button` aus `@/components/primitives`.
- **Email-Templates:** `// Token-Audit-Skip:`-Header (inline-Hex Pflicht). Claimondo-Default, KEIN `resolveEmailBranding` (Werkstatt = interner Partner).
- **Magic-Link redirectTo:** `${APP_URL}/passwort-zuruecksetzen` (wie `sendWillkommenSv`). `APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'`.
- **Passwort-Helper:** bestehenden `generatePassword()` in `admin/werkstaetten/actions.ts` wiederverwenden (nicht neu bauen).

---

### Task 1: Migration — `email_log.empfaenger_typ` um `'werkstatt'` + `SendEmailOpts`-Union

**Files:**
- Create: `supabase/migrations/<version>_email_log_empfaenger_typ_werkstatt.sql` (Version vom Plugin)
- Modify: `src/lib/email/google/client.ts` (Union `empfaengerTyp`)

**Interfaces:**
- Produces: `empfaengerTyp?: 'kunde'|'sv'|'kanzlei'|'admin'|'werkstatt'` in `SendEmailOpts`.

- [ ] **Step 1: Migration anwenden (Plugin)**

`apply_migration({ name: "email_log_empfaenger_typ_werkstatt", query: <DDL> })` mit:

```sql
-- email_log.empfaenger_typ additiv um 'werkstatt' erweitern (Werkstatt-Login-Mail).
ALTER TABLE public.email_log DROP CONSTRAINT email_log_empfaenger_typ_check;
ALTER TABLE public.email_log ADD CONSTRAINT email_log_empfaenger_typ_check
  CHECK (empfaenger_typ = ANY (ARRAY['kunde'::text, 'sv'::text, 'kanzlei'::text, 'admin'::text, 'werkstatt'::text]));
```

- [ ] **Step 2: Version ablesen + File committen**

`list_migrations` → Version `<V>` ablesen. File als `supabase/migrations/<V>_email_log_empfaenger_typ_werkstatt.sql` mit exakt obigem DDL committen (Dateiname == `<V>`).

- [ ] **Step 3: Constraint verifizieren (READ)**

`execute_sql`:
```sql
select pg_get_constraintdef(oid) from pg_constraint where conname='email_log_empfaenger_typ_check';
```
Expected: enthält `'werkstatt'`.

- [ ] **Step 4: Union erweitern**

In `src/lib/email/google/client.ts` die `empfaengerTyp`-Zeile ändern zu:
```ts
  empfaengerTyp?: 'kunde' | 'sv' | 'kanzlei' | 'admin' | 'werkstatt'
```

- [ ] **Step 5: tsc + Commit**

`npx tsc --noEmit` (grün). Commit: `git add supabase/migrations/<V>_*.sql src/lib/email/google/client.ts` + Message mit 7-Punkte-Audit (kurz, „Build: tsc grün / kein UI").

---

### Task 2: Email-Template `WillkommenWerkstatt.tsx`

**Files:**
- Create: `src/lib/email/google/templates/WillkommenWerkstatt.tsx`
- Test: `src/lib/email/google/templates/__tests__/WillkommenWerkstatt.test.tsx`

**Interfaces:**
- Produces: `type Props = { werkstattName: string; email: string; loginUrl: string; magicLink: string | null; einmalpasswort: string | null }`; `subject(p: Props): string`; `WillkommenWerkstattEmail(p: Props)`.

- [ ] **Step 1: Failing Test**

`src/lib/email/google/templates/__tests__/WillkommenWerkstatt.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { WillkommenWerkstattEmail, subject } from '../WillkommenWerkstatt'

const base = {
  werkstattName: 'Auto-Service Müller GmbH',
  email: 'werkstatt@example.com',
  loginUrl: 'https://app.claimondo.de/login',
  magicLink: 'https://app.claimondo.de/passwort-zuruecksetzen?token=abc',
}

describe('WillkommenWerkstattEmail', () => {
  it('subject nennt Claimondo', () => {
    expect(subject({ ...base, einmalpasswort: null })).toContain('Claimondo')
  })

  it('mit Einmalpasswort: enthält Passwort + Magic-Link + Login-URL', async () => {
    const html = await render(WillkommenWerkstattEmail({ ...base, einmalpasswort: 'GeheimA1!' }))
    expect(html).toContain('GeheimA1!')
    expect(html).toContain(base.magicLink)
    expect(html).toContain(base.loginUrl)
    expect(html).toContain('Müller')
  })

  it('ohne Einmalpasswort: kein Passwort-Wert, aber Hinweis auf bestehendes Passwort', async () => {
    const html = await render(WillkommenWerkstattEmail({ ...base, einmalpasswort: null }))
    expect(html).toContain(base.magicLink)
    expect(html).toContain('bestehende')  // Hinweistext
  })
})
```

- [ ] **Step 2: Test → FAIL**

Run: `npx vitest run src/lib/email/google/templates/__tests__/WillkommenWerkstatt.test.tsx`
Expected: FAIL (`Cannot find module '../WillkommenWerkstatt'`).

- [ ] **Step 3: Template implementieren**

`src/lib/email/google/templates/WillkommenWerkstatt.tsx`:
```tsx
// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// Werkstatt Login-/Willkommens-Mail. Claimondo-Standard (Werkstatt = interner Partner,
// kein Whitelabel). Enthaelt Magic-Link ("Passwort setzen") + — wenn vorhanden —
// Direkt-Login (Login-URL + Email + Einmalpasswort). Ohne Einmalpasswort: Hinweis
// aufs bestehende Passwort.

import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'
import { email } from '../../tokens'

type Props = {
  werkstattName: string
  email: string
  loginUrl: string
  magicLink: string | null
  einmalpasswort: string | null
}

export function subject(_p: Props): string {
  return 'Willkommen bei Claimondo – Ihr Werkstatt-Zugang'
}

const codeStyle = {
  fontFamily: 'monospace' as const,
  fontSize: '15px',
  color: email.color.navy,
  background: '#f1f4f8',
  padding: '2px 6px',
  borderRadius: '4px',
  wordBreak: 'break-all' as const,
}

export function WillkommenWerkstattEmail({ werkstattName, email: mail, loginUrl, magicLink, einmalpasswort }: Props) {
  return (
    <EmailShell preview="Ihr Zugang zum Claimondo-Werkstatt-Portal.">
      <Hero logoUrl={null} headline={`Willkommen, ${werkstattName}!`} />
      <Card>
        <Paragraph>
          Ihre Werkstatt wurde auf Claimondo angelegt. Über das Werkstatt-Portal sehen
          Sie vermittelte Aufträge, Besichtigungstermine und Abrechnungen.
        </Paragraph>

        {magicLink && (
          <>
            <Button href={magicLink}>Passwort setzen &amp; einloggen</Button>
            <Paragraph>
              Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:{' '}
              <a href={magicLink} style={{ color: email.color.ondo, wordBreak: 'break-all' as const }}>
                {magicLink}
              </a>
            </Paragraph>
          </>
        )}

        <Paragraph>
          <strong>Direkt einloggen</strong> unter{' '}
          <a href={loginUrl} style={{ color: email.color.ondo }}>{loginUrl}</a>:
        </Paragraph>
        <Paragraph>
          E-Mail: <span style={codeStyle}>{mail}</span>
        </Paragraph>
        {einmalpasswort ? (
          <Paragraph>
            Passwort: <span style={codeStyle}>{einmalpasswort}</span>
          </Paragraph>
        ) : (
          <Paragraph>
            Nutzen Sie Ihr bestehendes Passwort. Passwort vergessen? Setzen Sie es über den
            Button oben neu.
          </Paragraph>
        )}

        <Paragraph>
          Bitte ändern Sie Ihr Passwort beim ersten Login. Der Anmelde-Link ist 24 Stunden gültig.
        </Paragraph>
      </Card>
      <Footer onDark={false} />
    </EmailShell>
  )
}
```

- [ ] **Step 4: Test → PASS**

Run: `npx vitest run src/lib/email/google/templates/__tests__/WillkommenWerkstatt.test.tsx`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

`git add` beide Files + Commit (7-Punkte-Audit kurz).

---

### Task 3: Flow `sendWillkommenWerkstatt` in `flows.ts`

**Files:**
- Modify: `src/lib/email/google/flows.ts` (Import oben + Funktion)
- Test: `src/lib/email/google/__tests__/willkommen-werkstatt-flow.test.ts`

**Interfaces:**
- Consumes: `WillkommenWerkstattEmail`, `subject` (Task 2); `sendEmail` (`./client`); `createAdminClient`.
- Produces: `sendWillkommenWerkstatt(params: { to: string; werkstattName: string; einmalpasswort: string | null }): Promise<void>`.

- [ ] **Step 1: Failing Test**

`src/lib/email/google/__tests__/willkommen-werkstatt-flow.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendEmailMock = vi.fn().mockResolvedValue({ messageId: 'x' })
vi.mock('../client', () => ({ sendEmail: (o: unknown) => sendEmailMock(o) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { generateLink: vi.fn().mockResolvedValue({
      data: { properties: { action_link: 'https://app.claimondo.de/passwort-zuruecksetzen?t=1' } }, error: null,
    }) } },
  }),
}))

beforeEach(() => sendEmailMock.mockClear())

describe('sendWillkommenWerkstatt', () => {
  it('sendet mit empfaengerTyp werkstatt und rendert Passwort in html', async () => {
    const { sendWillkommenWerkstatt } = await import('../flows')
    await sendWillkommenWerkstatt({ to: 'w@example.com', werkstattName: 'Test-Werkstatt', einmalpasswort: 'PwA1!' })
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const arg = sendEmailMock.mock.calls[0][0]
    expect(arg.to).toBe('w@example.com')
    expect(arg.empfaengerTyp).toBe('werkstatt')
    expect(arg.template).toBe('willkommen_werkstatt')
    expect(arg.html).toContain('PwA1!')
    expect(arg.html).toContain('Test-Werkstatt')
  })
})
```

- [ ] **Step 2: Test → FAIL**

Run: `npx vitest run src/lib/email/google/__tests__/willkommen-werkstatt-flow.test.ts`
Expected: FAIL (`sendWillkommenWerkstatt` nicht exportiert).

- [ ] **Step 3: Import ergänzen**

In `src/lib/email/google/flows.ts` bei den Template-Imports (nach Zeile 29, `SvBasicClaimLink`-Import):
```ts
import { WillkommenWerkstattEmail, subject as willkommenWerkstattSubject } from './templates/WillkommenWerkstatt'
```

- [ ] **Step 4: Funktion implementieren**

Am Ende von `flows.ts` anhängen:
```ts
/**
 * Login-/Willkommens-Mail an eine Werkstatt. Generiert einen Recovery-Magic-Link
 * (Passwort-Setzen) und rendert — wenn uebergeben — zusaetzlich das Einmalpasswort.
 * Caller (sendWerkstattLoginMail) entscheidet ueber das Passwort (kein Clobber).
 */
export async function sendWillkommenWerkstatt(params: {
  to: string
  werkstattName: string
  einmalpasswort: string | null
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  let magicLink: string | null = null
  try {
    const { data: linkData, error: linkErr } = await createAdminClient().auth.admin.generateLink({
      type: 'recovery',
      email: params.to,
      options: { redirectTo: `${appUrl}/passwort-zuruecksetzen` },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[sendWillkommenWerkstatt] Magic-Link fehlgeschlagen:', linkErr?.message)
    } else {
      magicLink = linkData.properties.action_link
    }
  } catch (err) {
    console.error('[sendWillkommenWerkstatt] Magic-Link-Sub-Op fehlgeschlagen:', err)
  }

  const props = {
    werkstattName: params.werkstattName,
    email: params.to,
    loginUrl: `${appUrl}/login`,
    magicLink,
    einmalpasswort: params.einmalpasswort,
  }
  const html = await render(WillkommenWerkstattEmail(props))
  await sendEmail({
    to: params.to,
    subject: willkommenWerkstattSubject(props),
    html,
    fallId: null,
    empfaengerTyp: 'werkstatt',
    template: 'willkommen_werkstatt',
  })
}
```

- [ ] **Step 5: Test → PASS + tsc**

Run: `npx vitest run src/lib/email/google/__tests__/willkommen-werkstatt-flow.test.ts` → PASS. `npx tsc --noEmit` → grün.

- [ ] **Step 6: Commit** (7-Punkte-Audit kurz).

---

### Task 4: Server-Action `sendWerkstattLoginMail` + `createWerkstatt` liefert `werkstattId`

**Files:**
- Modify: `src/app/admin/werkstaetten/actions.ts`
- Test: `src/app/admin/werkstaetten/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `sendWillkommenWerkstatt` (Task 3, via dynamic import); lokaler `generatePassword()`; lokaler `requireAdmin()`.
- Produces: `sendWerkstattLoginMail(werkstattId: string, knownPassword?: string): Promise<{ ok: boolean; error?: string }>`; `createWerkstatt` Return zusätzlich `werkstattId: string`.

- [ ] **Step 1: Failing Test** — in `__tests__/actions.test.ts` ergänzen. Zuerst den Admin-Mock um `maybeSingle` (werkstaetten/profiles) + `auth.admin.updateUserById` erweitern und den Flow mocken. Oben im File ergänzen:

```ts
// Mock des Email-Flows (dynamischer Import in der Action)
const sendWillkommenWerkstattMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/email/google/flows', () => ({
  sendWillkommenWerkstatt: (p: unknown) => sendWillkommenWerkstattMock(p),
}))
```

`mockConfig` um ein Feld erweitern:
```ts
type MockConfig = {
  authUser: { id: string } | null
  profileRolle: string | null
  adminCreateUserError?: { message: string } | null
  werkstattForcePwChange?: boolean   // fuer sendWerkstattLoginMail
}
```

Im Admin-Client-Mock (`vi.mock('@/lib/supabase/admin', …)`) die `werkstaetten`- und `profiles`-Branches um `select().eq().maybeSingle()` + `updateUserById` erweitern. `auth.admin` bekommt zusätzlich:
```ts
updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
```
`from('werkstaetten')` Branch ergänzen:
```ts
select: vi.fn().mockReturnThis(),
eq: vi.fn().mockReturnThis(),
maybeSingle: vi.fn().mockResolvedValue({
  data: { id: 'w-1', name: 'Test-Werkstatt', email: 'w@example.com', user_id: 'wk-user-1' }, error: null,
}),
```
`from('profiles')` Branch (Admin-Client) ergänzen:
```ts
select: vi.fn().mockReturnThis(),
eq: vi.fn().mockReturnThis(),
update: vi.fn().mockReturnThis(),
maybeSingle: vi.fn().mockImplementation(async () => ({
  data: { force_password_change: mockConfig.werkstattForcePwChange ?? false }, error: null,
})),
```

Dann die Test-Fälle:
```ts
describe('sendWerkstattLoginMail', () => {
  it('gibt ok:false wenn nicht Admin', async () => {
    mockConfig.authUser = { id: 'u' }; mockConfig.profileRolle = 'dispatch'
    const { sendWerkstattLoginMail } = await import('../actions')
    const res = await sendWerkstattLoginMail('w-1')
    expect(res.ok).toBe(false)
  })

  it('force_password_change=true → resettet Passwort + ruft Flow', async () => {
    mockConfig.authUser = { id: 'admin' }; mockConfig.profileRolle = 'admin'
    mockConfig.werkstattForcePwChange = true
    sendWillkommenWerkstattMock.mockClear()
    const { sendWerkstattLoginMail } = await import('../actions')
    const res = await sendWerkstattLoginMail('w-1')
    expect(res.ok).toBe(true)
    const arg = sendWillkommenWerkstattMock.mock.calls[0][0]
    expect(typeof arg.einmalpasswort).toBe('string')   // frisch gesetzt
  })

  it('force_password_change=false, ohne knownPassword → kein Passwort im Flow', async () => {
    mockConfig.authUser = { id: 'admin' }; mockConfig.profileRolle = 'admin'
    mockConfig.werkstattForcePwChange = false
    sendWillkommenWerkstattMock.mockClear()
    const { sendWerkstattLoginMail } = await import('../actions')
    const res = await sendWerkstattLoginMail('w-1')
    expect(res.ok).toBe(true)
    expect(sendWillkommenWerkstattMock.mock.calls[0][0].einmalpasswort).toBeNull()
  })

  it('knownPassword → nutzt es (kein Reset)', async () => {
    mockConfig.authUser = { id: 'admin' }; mockConfig.profileRolle = 'admin'
    mockConfig.werkstattForcePwChange = false
    sendWillkommenWerkstattMock.mockClear()
    const { sendWerkstattLoginMail } = await import('../actions')
    const res = await sendWerkstattLoginMail('w-1', 'DialogPwA1!')
    expect(res.ok).toBe(true)
    expect(sendWillkommenWerkstattMock.mock.calls[0][0].einmalpasswort).toBe('DialogPwA1!')
  })
})
```

- [ ] **Step 2: Test → FAIL**

Run: `npx vitest run src/app/admin/werkstaetten/__tests__/actions.test.ts`
Expected: FAIL (`sendWerkstattLoginMail` nicht exportiert).

- [ ] **Step 3: Action implementieren**

In `src/app/admin/werkstaetten/actions.ts` am Ende ergänzen:
```ts
export async function sendWerkstattLoginMail(
  werkstattId: string,
  knownPassword?: string,
): Promise<{ ok: boolean; error?: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Login-Mails senden.' }

  const admin = createAdminClient()
  const { data: w, error: wErr } = await admin
    .from('werkstaetten')
    .select('id, name, email, user_id')
    .eq('id', werkstattId)
    .maybeSingle()
  if (wErr || !w) return { ok: false, error: wErr?.message ?? 'Werkstatt nicht gefunden.' }
  if (!w.email) return { ok: false, error: 'Werkstatt hat keine E-Mail-Adresse.' }
  if (!w.user_id) return { ok: false, error: 'Werkstatt hat keinen Login-Account.' }

  // Passwort-Logik (kein Clobber): knownPassword > frisch (nur wenn nie eingeloggt) > null.
  let einmalpasswort: string | null = knownPassword ?? null
  if (!einmalpasswort) {
    const { data: prof } = await admin
      .from('profiles')
      .select('force_password_change')
      .eq('id', w.user_id)
      .maybeSingle()
    if (prof?.force_password_change === true) {
      const pw = generatePassword()
      const { error: authErr } = await admin.auth.admin.updateUserById(w.user_id, {
        password: pw,
        user_metadata: { force_password_change: true },
      })
      if (authErr) return { ok: false, error: `Passwort-Reset fehlgeschlagen: ${authErr.message}` }
      await admin.from('profiles').update({ force_password_change: true }).eq('id', w.user_id)
      einmalpasswort = pw
    }
  }

  try {
    const { sendWillkommenWerkstatt } = await import('@/lib/email/google/flows')
    await sendWillkommenWerkstatt({ to: w.email, werkstattName: w.name, einmalpasswort })
  } catch (err) {
    console.error('[sendWerkstattLoginMail] Versand fehlgeschlagen:', err)
    const msg = err instanceof Error ? err.message : 'E-Mail-Versand fehlgeschlagen'
    return { ok: false, error: msg }
  }

  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}
```

- [ ] **Step 4: `createWerkstatt` Return um `werkstattId` erweitern**

Signatur ändern:
```ts
): Promise<{ ok: true; email: string; password: string; werkstattId: string } | { ok: false; error: string }> {
```
Und den Erfolgs-Return (aktuell `return { ok: true, email, password }`) ersetzen durch:
```ts
  return { ok: true, email, password, werkstattId: w.id }
```

- [ ] **Step 5: Test → PASS**

Run: `npx vitest run src/app/admin/werkstaetten/__tests__/actions.test.ts`
Expected: PASS (alte createWerkstatt-Tests + 4 neue).

- [ ] **Step 6: tsc + Commit**

`npx tsc --noEmit` grün. Commit (7-Punkte-Audit).

---

### Task 5: UI — Buttons in `WerkstaettenClient.tsx`

**Files:**
- Modify: `src/app/admin/werkstaetten/WerkstaettenClient.tsx`

**Interfaces:**
- Consumes: `sendWerkstattLoginMail(werkstattId, knownPassword?)` (Task 4); `createWerkstatt`-Return mit `werkstattId` (Task 4).

- [ ] **Step 1: Import + State**

Import ergänzen (`lucide-react`): `MailIcon` zur bestehenden Import-Zeile hinzufügen. `sendWerkstattLoginMail` aus `'./actions'` importieren (zur bestehenden `import { createWerkstatt } from './actions'`-Zeile → `import { createWerkstatt, sendWerkstattLoginMail } from './actions'`).

`createdCredentials`-State-Typ um `werkstattId` erweitern:
```ts
const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; werkstattId: string } | null>(null)
```
Neuen State ergänzen:
```ts
const [loginMailLoadingId, setLoginMailLoadingId] = useState<string | null>(null)
const [dialogMailSending, setDialogMailSending] = useState(false)
```

- [ ] **Step 2: Handler + createWerkstatt-Ergebnis durchreichen**

In `handleCreate` den Erfolgsfall anpassen:
```ts
setCreatedCredentials({ email: result.email, password: result.password, werkstattId: result.werkstattId })
```
Handler ergänzen:
```ts
async function sendLoginMail(w: Werkstatt) {
  setLoginMailLoadingId(w.id)
  try {
    const res = await sendWerkstattLoginMail(w.id)
    if (!res.ok) { toast.error(res.error ?? 'Fehler'); return }
    toast.success(`Login-Mail gesendet an ${w.email ?? 'die Werkstatt'}`)
  } finally {
    setLoginMailLoadingId(null)
  }
}

async function sendDialogLoginMail() {
  if (!createdCredentials) return
  setDialogMailSending(true)
  try {
    const res = await sendWerkstattLoginMail(createdCredentials.werkstattId, createdCredentials.password)
    if (!res.ok) { toast.error(res.error ?? 'Fehler'); return }
    toast.success(`Login-Mail gesendet an ${createdCredentials.email}`)
  } finally {
    setDialogMailSending(false)
  }
}
```

- [ ] **Step 3: Listen-Spalte**

Header ergänzen (nach der Staffelung-`<Th>`):
```tsx
<Th className="text-left text-claimondo-ondo!">Login-Mail</Th>
```
Zelle ergänzen (nach der Staffel-`<Td>`, vor `</Tr>`):
```tsx
<Td>
  <Button
    size="sm"
    variant="ghost"
    loading={loginMailLoadingId === w.id}
    onClick={() => sendLoginMail(w)}
    iconLeft={<MailIcon className="w-4 h-4" />}
  >
    Senden
  </Button>
</Td>
```
Die leere-Liste-Zeile `colSpan={7}` auf `colSpan={8}` erhöhen.

- [ ] **Step 4: Dialog-Button**

Im `createdCredentials`-Block, direkt vor dem „Schließen"-Button, ergänzen:
```tsx
<Button
  variant="navy"
  fullWidth
  loading={dialogMailSending}
  onClick={sendDialogLoginMail}
  iconLeft={<MailIcon className="w-4 h-4" />}
>
  Login-Mail an Werkstatt senden
</Button>
```
Den bestehenden „Schließen"-Button auf `variant="ghost"` ändern (damit „Senden" die Primär-Aktion ist).

- [ ] **Step 5: Build + Commit**

`npx tsc --noEmit` grün, dann `npm run build` (Route/Action-Change → voller Build Pflicht; 8 GB Heap: `$env:NODE_OPTIONS="--max-old-space-size=8192"`). Commit (7-Punkte-Audit).

---

### Task 6: Gesamt-Verifikation + Prod-Doku

- [ ] **Step 1: Volle Test-Suite der berührten Files**

Run: `npx vitest run src/app/admin/werkstaetten src/lib/email/google` → alle grün.

- [ ] **Step 2: Ratchets**

`npm run check:token-audit` (Template hat Skip-Header → 0 Verstöße). `npm run check:component-set -- --warn` (Buttons = primitives, keine neuen Verstöße).

- [ ] **Step 3: Push + PR-Kommentar**

Push auf `kitta/werkstatt-auftrag-view`. PR #3449-Kommentar: Feature-Zusammenfassung + „Post-Deploy-Smoke offen: Button klicken → E-Mail + `email_log`-Row `empfaenger_typ='werkstatt'` prüfen".

- [ ] **Step 4: Marker + Merge-Session-Flag**

`COORDINATION-werkstatt-auftrag-view.md` um das Login-Mail-Feature erweitern; Merge-Session flaggen „#3449 komplett mergen (Login-Mail-Feature inklusive)".

**Post-Deploy (Merge-Session/Aaron, nicht in diesem Branch):** Als Admin in `/admin/werkstaetten` „Login-Mail senden" klicken → E-Mail-Empfang + `email_log`-Row (`empfaenger_typ='werkstatt'`, `template='willkommen_werkstatt'`) auf Prod verifizieren („1+").

---

## Self-Review (writing-plans)

- **Spec-Coverage:** Mail-Inhalt beides (Task 2) ✓ · Password-Mechanik kein-Clobber (Task 4, 3 Branches getestet) ✓ · Flow (Task 3) ✓ · empfaenger_typ-Migration + Union (Task 1) ✓ · Trigger Liste+Dialog (Task 5) ✓ · createWerkstatt.werkstattId (Task 4) ✓ · Branding Claimondo/kein resolveEmailBranding (Task 2 Template) ✓ · Testing (Tasks 2/3/4 + Task 6) ✓ · Coordination gleicher Branch + shared-file-Flag (Global Constraints + Task 6) ✓.
- **Platzhalter:** Kein TBD/TODO; jeder Code-Step zeigt echten Code; Migration-DDL + Constraint-Name (`email_log_empfaenger_typ_check`) konkret; Template/Flow/Action vollständig.
- **Typ-Konsistenz:** `sendWillkommenWerkstatt({ to, werkstattName, einmalpasswort })` identisch in Task 3 (def) + Task 4 (call). `sendWerkstattLoginMail(werkstattId, knownPassword?) → { ok, error? }` identisch Task 4 (def) + Task 5 (call). `createWerkstatt`-Return `{ ok, email, password, werkstattId }` in Task 4 (def) + Task 5 (consume). Template-Props identisch Task 2 (def) + Task 3 (call). `empfaengerTyp:'werkstatt'` in Task 1 (Union) + Task 3 (Nutzung) + email_log-CHECK (Task 1).
