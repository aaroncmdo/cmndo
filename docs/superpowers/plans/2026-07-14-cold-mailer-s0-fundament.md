# Cold-Mailer S0 — Fundament — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Admin/Dispatch-Person kann aus dem Vertrieb-Cockpit heraus manuell **eine** Cold-Mail an einen Partner-Lead senden — über eine dedizierte Resend-Sende-Subdomain, mit Pflicht-Abmeldelink, Suppression-Check und persistiertem Sende-Verlauf (`cold_mail_sends`).

**Architecture:** Dünne, reine Lib-Bausteine unter `src/lib/cold-mail/` (merge, send-transport, opt-out-token, render-shell), ein react-email-Wrapper unter `src/lib/email/google/templates/`, eine öffentliche Abmelde-Route, und eine Server-Action im Vertrieb-Cockpit. Der Resend-Client (`src/lib/email/resend-client.ts`) und `createAdminClient()` werden wiederverwendet. Zwei neue Tabellen (`cold_mail_suppression`, `cold_mail_sends`) via Supabase-Plugin.

**Tech Stack:** Next.js 16 (App Router, force-dynamic), React, TypeScript strict, Supabase (Postgres + RLS), `resend@^6.9.4`, `@react-email/render`, `node:crypto` (HMAC), vitest.

## Global Constraints

- **DDL nur via Supabase-Plugin** (`apply_migration`) — dann `list_migrations` → getrackte Version lesen → File exakt als `supabase/migrations/<V>_<name>.sql` committen (Regel 2, Twin-Drift vermeiden). Nie CLI/raw-`execute_sql`-DDL.
- **Server-Actions** (`'use server'`): Result-Object `{ ok: boolean; error?: string }`, **kein throw**; **kein `const`/`type`-Export** aus 'use server'-Files (AAR-664) — Typen/Konstanten leben in normalen Lib-Files.
- **Guard:** `requireRole(['admin','dispatch'])` aus `@/lib/auth/guards` — Return-Shape ist `{ success: boolean; error?: string; user; supabase }` (NICHT `{ok}`). Check via `if (!guard.success) return { ok:false, error: guard.error }`.
- **Öffentliche/Service-Pfade** (Abmelde-Route): `createAdminClient()` aus `@/lib/supabase/admin` (Service-Role, bypasst RLS) — kein anon-RLS-Grant.
- **Umlaute** in allen nutzersichtbaren Texten (Mail-Wrapper-Footer, Abmelde-Bestätigung, Cockpit-Buttons) — echte `ä/ö/ü/ß`.
- **Komponenten-Set:** `@/components/primitives` (Button `variant`/`onClick`/`loading`), `@/components/shared/*`. Kein handgerolltes Button-/Card-Markup.
- **Non-critical Sub-Ops** (der `cold_mail_sends`-Insert nach erfolgreichem Send) in `try/catch` — ein Log-Fail darf den Send-Erfolg nicht umkehren.
- Jede Slice endet mit `npx tsc --noEmit` grün + `next build` grün + eigenem PR gegen `staging`.
- **Prod-Smoke (Regel 4):** gilt für S0, ist aber **gated auf Aarons Resend-Setup** (verifizierte `mail.claimondo.de` + `RESEND_API_KEY`) — Smoke-Plan am Ende dieses Dokuments; bis dahin bleibt S0 „gebaut, Prod-Smoke pending".

---

## Build-Reihenfolge & Gates (WICHTIG)

Logische Task-Nummern unten. **Tatsächliche Bau-Reihenfolge** wegen zweier Gates:

- **MCP-Gate:** Supabase-MCP war bei Planerstellung nicht verbunden → **Task 1 (DDL)** und alles DB-Berührende (**Task 5, 6**) warten auf MCP-Reconnect.
- **Sofort baubar (kein DB, kein Live-Key, unit-testbar):** **Task 2** (transport), **Task 3** (opt-out-token), **Task 4** (react-email-shell).

Reihenfolge: **2 → 3 → 4** jetzt; dann **1 (DDL)** sobald MCP; dann **5 → 6**. Task 6 schließt S0 ab; danach Prod-Smoke sobald Resend-Keys live.

---

## File Structure

- `src/lib/cold-mail/merge.ts` (NEU) — reine Merge-Var-Ersetzung; wiederverwendet von S0-Single-Send + S2-CRON.
- `src/lib/cold-mail/send.ts` (NEU) — dünner Cold-Mail-Resend-Transport (from-domain, List-Unsubscribe, tags); reused resend-Singleton.
- `src/lib/cold-mail/optout-token.ts` (NEU) — HMAC-signiertes stateless Opt-out-Token (sign/verify).
- `src/lib/cold-mail/render-shell.ts` (NEU) — rendert den react-email-Wrapper zu HTML-String.
- `src/lib/email/google/templates/ColdMailShell.tsx` (NEU) — react-email-Wrapper (Header/Body-Injection/Footer mit Abmeldelink+Impressum).
- `supabase/migrations/<V>_cold_mail_s0_suppression_sends.sql` (NEU) — DDL.
- `src/app/abmelden/[token]/page.tsx` (NEU) — öffentliche Abmelde-Seite (prefetch-safe: GET zeigt Bestätigen-Button, kein Write).
- `src/app/abmelden/[token]/AbmeldeForm.tsx` (NEU) — Client-Button → Server-Action.
- `src/app/abmelden/[token]/actions.ts` (NEU, 'use server') — `bestaetigeAbmeldung(token)` schreibt Suppression via Admin-Client.
- `src/app/admin/vertrieb/_actions/cold-mail-send.ts` (NEU, 'use server') — `sendeColdMailAnLead(leadId, {betreff, bodyHtml})`.
- `src/app/admin/vertrieb/drawer/ColdMailComposer.tsx` (NEU) — kleiner Composer (Betreff + Body) im LeadCockpit.
- `src/app/admin/vertrieb/drawer/LeadCockpit.tsx` (MODIFY, additiv) — Trigger-Button „Cold-Mail senden" öffnet den Composer.
- Tests: `src/lib/cold-mail/__tests__/merge.test.ts`, `send.test.ts`, `optout-token.test.ts`, `render-shell.test.ts`.

---

### Task 1: DDL — `cold_mail_suppression` + `cold_mail_sends` (via Supabase-Plugin) — ⚠️ MCP-GATED

**Files:**
- Create (nach Apply): `supabase/migrations/<recorded_version>_cold_mail_s0_suppression_sends.sql`

**Interfaces:**
- Produces: Tabellen `public.cold_mail_suppression` (PK `email`), `public.cold_mail_sends` (PK `id`, `lead_id` FK partner_leads). `cold_mail_sends.enrollment_id/step_id/vorlage_id` sind **nullable uuid OHNE FK** — die FKs kommen in S1/S2, wenn die Zieltabellen existieren.

- [ ] **Step 1: Staff-Prädikat + `gen_random_uuid` verifizieren (READ, MCP `execute_sql`)**

Vor dem Apply prüfen, welches Staff-RLS-Prädikat kanonisch ist (Spec nimmt `is_staff()` an):
```sql
select proname from pg_proc where proname in ('is_staff','ist_staff','is_admin') order by proname;
select extname from pg_extension where extname in ('pgcrypto');  -- gen_random_uuid
```
Erwartung: `is_staff` existiert. Falls der Name abweicht → im Policy-Body unten den korrekten Namen einsetzen. Falls `gen_random_uuid` fehlt → `default gen_random_uuid()` bleibt trotzdem gültig (in PG13+ Core).

- [ ] **Step 2: Migration anwenden (`apply_migration`)**

`name`: `cold_mail_s0_suppression_sends`, `query`:
```sql
-- Cold-Mailer S0: Suppression-Liste + Sende-Verlauf (SSoT).
create table if not exists public.cold_mail_suppression (
  email text primary key,
  grund text not null check (grund in ('opt_out','bounce','beschwerde')),
  lead_id uuid references public.partner_leads(id) on delete set null,
  erstellt_am timestamptz not null default now()
);
alter table public.cold_mail_suppression enable row level security;
create policy cms_supp_staff_all on public.cold_mail_suppression
  for all using (public.is_staff()) with check (public.is_staff());

create table if not exists public.cold_mail_sends (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.partner_leads(id) on delete cascade,
  enrollment_id uuid,   -- FK -> cold_mail_enrollments (S2)
  step_id uuid,         -- FK -> cold_mail_steps (S2)
  vorlage_id uuid,      -- FK -> cold_mail_vorlagen (S1)
  empfaenger_email text not null,
  betreff text not null,
  body_snapshot text,
  resend_message_id text,
  status text not null default 'gesendet'
    check (status in ('gesendet','zugestellt','geoeffnet','geklickt','bounced','beschwerde')),
  gesendet_am timestamptz not null default now(),
  geoeffnet_am timestamptz,
  geklickt_am timestamptz
);
create index if not exists cms_sends_lead_idx on public.cold_mail_sends(lead_id);
create index if not exists cms_sends_msgid_idx on public.cold_mail_sends(resend_message_id);
alter table public.cold_mail_sends enable row level security;
create policy cms_sends_staff_all on public.cold_mail_sends
  for all using (public.is_staff()) with check (public.is_staff());
```

- [ ] **Step 3: Getrackte Version lesen (`list_migrations`)** — die vom Plugin vergebene `<V>` notieren.

- [ ] **Step 4: Verifizieren (READ `execute_sql`)**
```sql
select table_name from information_schema.tables
where table_schema='public' and table_name in ('cold_mail_suppression','cold_mail_sends');
```
Erwartung: beide Zeilen.

- [ ] **Step 5: Migration-File committen** als `supabase/migrations/<V>_cold_mail_s0_suppression_sends.sql` (Inhalt == applied query). Dateiname == `<V>` aus Step 3.

```bash
git add supabase/migrations/<V>_cold_mail_s0_suppression_sends.sql
git commit -m "feat(cold-mailer): S0 DDL — cold_mail_suppression + cold_mail_sends"
```

---

### Task 2: Cold-Mail-Transport — `merge.ts` + `send.ts` — ✅ sofort baubar

**Files:**
- Create: `src/lib/cold-mail/merge.ts`, `src/lib/cold-mail/send.ts`
- Test: `src/lib/cold-mail/__tests__/merge.test.ts`, `src/lib/cold-mail/__tests__/send.test.ts`

**Interfaces:**
- Consumes: `resend` (Singleton) aus `@/lib/email/resend-client`.
- Produces:
  - `buildMergeVars(lead: { ansprechpartner_vorname: string|null; ansprechpartner_nachname: string|null; firma: string|null; ort: string|null }): ColdMailMergeVars`
  - `renderMerge(template: string, vars: ColdMailMergeVars): string`
  - `type ColdMailMergeVars = { Ansprechpartner: string; Firma: string; Ort: string; Vorname: string }`
  - `coldMailFromAddress(): string`
  - `sendColdMail(opts: { to: string; subject: string; html: string; abmeldeUrl: string; leadId: string }): Promise<SendColdMailResult>`
  - `type SendColdMailResult = { ok: true; messageId: string | null } | { ok: false; error: string }`

- [ ] **Step 1: Failing test — `merge.test.ts`**
```typescript
import { describe, it, expect } from 'vitest'
import { buildMergeVars, renderMerge } from '../merge'

describe('renderMerge', () => {
  it('ersetzt bekannte Merge-Vars und lässt unbekannte stehen', () => {
    const vars = { Ansprechpartner: 'Frau Meier', Firma: 'Autohaus Meier', Ort: 'Berlin', Vorname: 'Anna' }
    expect(renderMerge('Hallo {Ansprechpartner} von {Firma} in {Ort}. {Unbekannt}', vars))
      .toBe('Hallo Frau Meier von Autohaus Meier in Berlin. {Unbekannt}')
  })
})

describe('buildMergeVars', () => {
  it('baut vollen Namen und Fallbacks', () => {
    expect(buildMergeVars({ ansprechpartner_vorname: 'Anna', ansprechpartner_nachname: 'Meier', firma: 'Autohaus', ort: 'Berlin' }))
      .toEqual({ Ansprechpartner: 'Anna Meier', Firma: 'Autohaus', Ort: 'Berlin', Vorname: 'Anna' })
  })
  it('nutzt Fallbacks bei fehlenden Feldern', () => {
    expect(buildMergeVars({ ansprechpartner_vorname: null, ansprechpartner_nachname: null, firma: null, ort: null }))
      .toEqual({ Ansprechpartner: '', Firma: 'Ihr Unternehmen', Ort: '', Vorname: '' })
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/cold-mail/__tests__/merge.test.ts`) — „Cannot find module '../merge'".

- [ ] **Step 3: Implement `src/lib/cold-mail/merge.ts`**
```typescript
// Reine Merge-Var-Ersetzung für Cold-Mails. Wiederverwendet von Single-Send (S0) + CRON (S2).
export type ColdMailMergeVars = {
  Ansprechpartner: string
  Firma: string
  Ort: string
  Vorname: string
}

export function buildMergeVars(lead: {
  ansprechpartner_vorname: string | null
  ansprechpartner_nachname: string | null
  firma: string | null
  ort: string | null
}): ColdMailMergeVars {
  const vorname = lead.ansprechpartner_vorname?.trim() ?? ''
  const nachname = lead.ansprechpartner_nachname?.trim() ?? ''
  return {
    Ansprechpartner: [vorname, nachname].filter(Boolean).join(' '),
    Firma: lead.firma?.trim() || 'Ihr Unternehmen',
    Ort: lead.ort?.trim() ?? '',
    Vorname: vorname,
  }
}

export function renderMerge(template: string, vars: ColdMailMergeVars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key as keyof ColdMailMergeVars]) : match,
  )
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Failing test — `send.test.ts`** (mockt den resend-Singleton)
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('@/lib/email/resend-client', () => ({ resend: { emails: { send: (...a: unknown[]) => sendMock(...a) } } }))

import { sendColdMail, coldMailFromAddress } from '../send'

beforeEach(() => { sendMock.mockReset(); delete process.env.COLD_MAIL_FROM_DOMAIN })

describe('coldMailFromAddress', () => {
  it('nutzt Default-Subdomain', () => {
    expect(coldMailFromAddress()).toBe('Claimondo Partnernetzwerk <partner@mail.claimondo.de>')
  })
  it('respektiert COLD_MAIL_FROM_DOMAIN', () => {
    process.env.COLD_MAIL_FROM_DOMAIN = 'post.example.de'
    expect(coldMailFromAddress()).toBe('Claimondo Partnernetzwerk <partner@post.example.de>')
  })
})

describe('sendColdMail', () => {
  it('sendet mit List-Unsubscribe-Header + tags und liefert messageId', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_123' }, error: null })
    const res = await sendColdMail({ to: 'a@b.de', subject: 'Hi', html: '<p>x</p>', abmeldeUrl: 'https://app.claimondo.de/abmelden/tok', leadId: 'lead-1' })
    expect(res).toEqual({ ok: true, messageId: 'msg_123' })
    const arg = sendMock.mock.calls[0][0]
    expect(arg.headers['List-Unsubscribe']).toBe('<https://app.claimondo.de/abmelden/tok>')
    expect(arg.tags).toEqual([{ name: 'typ', value: 'cold_mail' }, { name: 'lead', value: 'lead-1' }])
  })
  it('gibt error zurück wenn Resend error liefert', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'domain not verified' } })
    const res = await sendColdMail({ to: 'a@b.de', subject: 'Hi', html: '<p>x</p>', abmeldeUrl: 'u', leadId: 'l' })
    expect(res).toEqual({ ok: false, error: 'domain not verified' })
  })
})
```

- [ ] **Step 6: Run → FAIL.**

- [ ] **Step 7: Implement `src/lib/cold-mail/send.ts`**
```typescript
// Dünner Cold-Mail-Transport auf dem bestehenden Resend-Singleton.
// Bewusst getrennt vom transaktionalen sendEmail (google/client.ts): eigene Sende-(Sub)domain
// zur Reputations-Isolation, List-Unsubscribe-Header, Webhook-tags, Logging in cold_mail_sends
// statt email_log.
import { resend } from '@/lib/email/resend-client'

export type SendColdMailResult = { ok: true; messageId: string | null } | { ok: false; error: string }

export function coldMailFromAddress(): string {
  const domain = process.env.COLD_MAIL_FROM_DOMAIN || 'mail.claimondo.de'
  return `Claimondo Partnernetzwerk <partner@${domain}>`
}

export async function sendColdMail(opts: {
  to: string
  subject: string
  html: string
  abmeldeUrl: string
  leadId: string
}): Promise<SendColdMailResult> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY ist nicht konfiguriert.' }
  try {
    const res = await resend.emails.send({
      from: coldMailFromAddress(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      headers: {
        'List-Unsubscribe': `<${opts.abmeldeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [
        { name: 'typ', value: 'cold_mail' },
        { name: 'lead', value: opts.leadId },
      ],
    })
    if (res.error) return { ok: false, error: res.error.message }
    return { ok: true, messageId: res.data?.id ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Resend-Send fehlgeschlagen.' }
  }
}
```

- [ ] **Step 8: Run both test files → PASS.**

- [ ] **Step 9: `npx tsc --noEmit` grün.**

- [ ] **Step 10: Commit**
```bash
git add src/lib/cold-mail/merge.ts src/lib/cold-mail/send.ts src/lib/cold-mail/__tests__/merge.test.ts src/lib/cold-mail/__tests__/send.test.ts
git commit -m "feat(cold-mailer): S0 transport — merge vars + Resend cold-mail sender"
```

---

### Task 3: Opt-out-Token-Util — `optout-token.ts` — ✅ sofort baubar

**Files:**
- Create: `src/lib/cold-mail/optout-token.ts`
- Test: `src/lib/cold-mail/__tests__/optout-token.test.ts`

**Interfaces:**
- Produces: `createOptoutToken(email: string): string`, `verifyOptoutToken(token: string): string | null`.
- HMAC-Key: `process.env.COLD_MAIL_OPTOUT_SECRET || process.env.CRON_SECRET` (dedizierter Secret optional später; Fallback macht S0 sofort lauffähig). Wirft, wenn beide fehlen.

- [ ] **Step 1: Failing test — `optout-token.test.ts`**
```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { createOptoutToken, verifyOptoutToken } from '../optout-token'

beforeAll(() => { process.env.CRON_SECRET = 'test-secret-abc' })

describe('optout-token', () => {
  it('round-trip: verify liefert die (normalisierte) Email zurück', () => {
    const t = createOptoutToken('Info@Beispiel.DE')
    expect(verifyOptoutToken(t)).toBe('info@beispiel.de')
  })
  it('manipuliertes Token → null', () => {
    const t = createOptoutToken('a@b.de')
    expect(verifyOptoutToken(t.slice(0, -2) + 'xy')).toBeNull()
  })
  it('malformed Token → null', () => {
    expect(verifyOptoutToken('kein-punkt')).toBeNull()
    expect(verifyOptoutToken('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/lib/cold-mail/optout-token.ts`**
```typescript
// Stateless HMAC-signiertes Opt-out-Token: base64url(email).base64url(hmac).
// Kein DB-Row nötig — der Abmelde-Link trägt die Identität selbst.
import { createHmac, timingSafeEqual } from 'node:crypto'

function secret(): string {
  const s = process.env.COLD_MAIL_OPTOUT_SECRET || process.env.CRON_SECRET
  if (!s) throw new Error('COLD_MAIL_OPTOUT_SECRET/CRON_SECRET ist nicht konfiguriert.')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function createOptoutToken(email: string): string {
  const payload = Buffer.from(email.trim().toLowerCase(), 'utf8').toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifyOptoutToken(token: string): string | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(payload))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return Buffer.from(payload, 'base64url').toString('utf8')
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: `npx tsc --noEmit` grün.**

- [ ] **Step 6: Commit**
```bash
git add src/lib/cold-mail/optout-token.ts src/lib/cold-mail/__tests__/optout-token.test.ts
git commit -m "feat(cold-mailer): S0 opt-out token — HMAC sign/verify"
```

---

### Task 4: react-email Cold-Mail-Wrapper — `ColdMailShell.tsx` + `render-shell.ts` — ✅ sofort baubar

**Files:**
- Create: `src/lib/email/google/templates/ColdMailShell.tsx`, `src/lib/cold-mail/render-shell.ts`
- Test: `src/lib/cold-mail/__tests__/render-shell.test.ts`

**Interfaces:**
- Consumes: `render` aus `@react-email/render`; `@react-email/components`.
- Produces:
  - `ColdMailShell(props: { bodyHtml: string; abmeldeUrl: string }): React.ReactElement`
  - `renderColdMailHtml(opts: { bodyHtml: string; abmeldeUrl: string }): Promise<string>`

**Note:** `bodyHtml` ist bereits gemergter, admin-kuratierter HTML-Body → via `dangerouslySetInnerHTML` in einen Container injiziert. Footer trägt Pflicht-Abmeldelink + Impressum-Zeile (Umlaute!). Token-Audit: react-email-Templates dürfen inline-hex — Skip-Header setzen.

- [ ] **Step 1: Failing test — `render-shell.test.ts`**
```typescript
import { describe, it, expect } from 'vitest'
import { renderColdMailHtml } from '../render-shell'

describe('renderColdMailHtml', () => {
  it('injiziert den Body und rendert Abmeldelink + Footer', async () => {
    const html = await renderColdMailHtml({ bodyHtml: '<p>MEIN_BODY_MARKER</p>', abmeldeUrl: 'https://app.claimondo.de/abmelden/TOK123' })
    expect(html).toContain('MEIN_BODY_MARKER')
    expect(html).toContain('https://app.claimondo.de/abmelden/TOK123')
    expect(html).toContain('Abmelden')
    expect(html).toContain('Claimondo')
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/lib/email/google/templates/ColdMailShell.tsx`**

Orientiere dich am Stil bestehender Templates in `src/lib/email/google/templates/` (z.B. `KundeWelcome.tsx`) für Import-Konventionen. Minimaler eigenständiger Shell:
```tsx
// Token-Audit-Skip: react-email-Template braucht inline-hex (Email-Clients unterstützen keine CSS-Vars).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Html, Head, Body, Container, Section, Text, Hr, Link } from '@react-email/components'
import * as React from 'react'

export function ColdMailShell({ bodyHtml, abmeldeUrl }: { bodyHtml: string; abmeldeUrl: string }) {
  return (
    <Html lang="de">
      <Head />
      <Body style={{ backgroundColor: '#f8f9fb', margin: 0, fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff' }}>
          <Section style={{ padding: '24px 32px 8px', color: '#0D1B3E' }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: '#0D1B3E', margin: 0 }}>
              Claimondo Partnernetzwerk
            </Text>
          </Section>
          <Section style={{ padding: '8px 32px 24px', color: '#0D1B3E', fontSize: '15px', lineHeight: 1.6 }}>
            <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </Section>
          <Hr style={{ borderColor: '#e5e8ef', margin: 0 }} />
          <Section style={{ padding: '16px 32px 24px' }}>
            <Text style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>
              Claimondo GmbH · Deutschlands Plattform für Kfz-Schadensregulierung
            </Text>
            <Text style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
              Sie möchten keine weiteren Nachrichten erhalten?{' '}
              <Link href={abmeldeUrl} style={{ color: '#4573A2' }}>Abmelden</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
```

- [ ] **Step 4: Implement `src/lib/cold-mail/render-shell.ts`**
```typescript
import { render } from '@react-email/render'
import { ColdMailShell } from '@/lib/email/google/templates/ColdMailShell'

export async function renderColdMailHtml(opts: { bodyHtml: string; abmeldeUrl: string }): Promise<string> {
  return render(ColdMailShell({ bodyHtml: opts.bodyHtml, abmeldeUrl: opts.abmeldeUrl }))
}
```

- [ ] **Step 5: Run → PASS.** (Falls vitest JSX in `.tsx` nicht auflöst: der Test importiert nur `render-shell.ts`, das `ColdMailShell` als Funktion aufruft — kein JSX im Test. Sollte mit der bestehenden vitest-Config laufen, die andere `google/templates`-Tests abdeckt.)

- [ ] **Step 6: `npx tsc --noEmit` grün.**

- [ ] **Step 7: Commit**
```bash
git add src/lib/email/google/templates/ColdMailShell.tsx src/lib/cold-mail/render-shell.ts src/lib/cold-mail/__tests__/render-shell.test.ts
git commit -m "feat(cold-mailer): S0 react-email wrapper (Header/Body/Abmelde-Footer)"
```

---

### Task 5: Öffentliche Abmelde-Route — `/abmelden/[token]` — ⚠️ DB-GATED (nach Task 1)

**Files:**
- Create: `src/app/abmelden/[token]/page.tsx`, `src/app/abmelden/[token]/AbmeldeForm.tsx`, `src/app/abmelden/[token]/actions.ts`

**Interfaces:**
- Consumes: `verifyOptoutToken` (Task 3), `createAdminClient` (`@/lib/supabase/admin`), `cold_mail_suppression` (Task 1).
- Produces: Server-Action `bestaetigeAbmeldung(token: string): Promise<{ ok: boolean; error?: string }>`.

**Prefetch-Sicherheit:** GET rendert nur einen Bestätigen-Button (KEIN Write) — Mail-Client-Prefetch darf nicht ungewollt abmelden. Der Write passiert erst auf Button-Klick (Server-Action). Die Seite hat einen Content-`return` (kein Redirect-Stub).

- [ ] **Step 1: Implement `actions.ts`**
```typescript
'use server'
import { verifyOptoutToken } from '@/lib/cold-mail/optout-token'
import { createAdminClient } from '@/lib/supabase/admin'

export async function bestaetigeAbmeldung(token: string): Promise<{ ok: boolean; error?: string }> {
  const email = verifyOptoutToken(token)
  if (!email) return { ok: false, error: 'Ungültiger oder abgelaufener Abmelde-Link.' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('cold_mail_suppression')
    .upsert({ email, grund: 'opt_out' }, { onConflict: 'email' })
  if (error) return { ok: false, error: 'Abmeldung fehlgeschlagen. Bitte später erneut versuchen.' }
  return { ok: true }
}
```

- [ ] **Step 2: Implement `AbmeldeForm.tsx`** (Client, nutzt `@/components/primitives` Button)
```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/primitives'
import { bestaetigeAbmeldung } from './actions'

export default function AbmeldeForm({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [fehler, setFehler] = useState<string | null>(null)

  async function abmelden() {
    setStatus('busy')
    const res = await bestaetigeAbmeldung(token)
    if (res.ok) { setStatus('done'); return }
    setFehler(res.error ?? 'Fehler'); setStatus('error')
  }

  if (status === 'done')
    return <p className="text-claimondo-navy">Sie wurden erfolgreich abgemeldet. Sie erhalten keine weiteren Nachrichten von uns.</p>

  return (
    <div className="space-y-3">
      <p className="text-claimondo-navy">Möchten Sie sich von künftigen Nachrichten des Claimondo Partnernetzwerks abmelden?</p>
      <Button variant="navy" loading={status === 'busy'} onClick={abmelden}>Abmeldung bestätigen</Button>
      {status === 'error' && <p className="text-sm text-danger">{fehler}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Implement `page.tsx`**
```tsx
import AbmeldeForm from './AbmeldeForm'
import { verifyOptoutToken } from '@/lib/cold-mail/optout-token'

export const dynamic = 'force-dynamic'

export default async function AbmeldenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gueltig = verifyOptoutToken(token) !== null
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-4 text-heading-md text-claimondo-navy">Abmelden</h1>
      {gueltig
        ? <AbmeldeForm token={token} />
        : <p className="text-claimondo-navy">Dieser Abmelde-Link ist ungültig oder abgelaufen.</p>}
    </main>
  )
}
```

- [ ] **Step 4: `next build` grün** (Route + Server-Action werden vom Next-Validator geprüft).

- [ ] **Step 5: Commit**
```bash
git add src/app/abmelden
git commit -m "feat(cold-mailer): S0 öffentliche Abmelde-Route (prefetch-safe, Suppression via Service-Client)"
```

---

### Task 6: Single-Send-Action + LeadCockpit-Trigger — ⚠️ DB-GATED (nach Task 1–5)

**Files:**
- Create: `src/app/admin/vertrieb/_actions/cold-mail-send.ts` ('use server'), `src/app/admin/vertrieb/drawer/ColdMailComposer.tsx`
- Modify (additiv): `src/app/admin/vertrieb/drawer/LeadCockpit.tsx`

**Interfaces:**
- Consumes: `requireRole` (`@/lib/auth/guards`, `{success}`-Shape), `buildMergeVars`/`renderMerge` (Task 2), `sendColdMail` (Task 2), `renderColdMailHtml` (Task 4), `createOptoutToken` (Task 3), `cold_mail_suppression`/`cold_mail_sends` (Task 1).
- Produces: `sendeColdMailAnLead(leadId: string, input: { betreff: string; bodyHtml: string }): Promise<{ ok: boolean; error?: string }>`.

**Base-URL:** Abmelde-Link-Basis = `process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'`. Beim Bau prüfen, ob ein kanonischerer Base-URL-Env existiert (grep `NEXT_PUBLIC_.*URL` in `src/`); den nutzen, sonst Fallback.

- [ ] **Step 1: Implement `_actions/cold-mail-send.ts`**
```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { buildMergeVars, renderMerge } from '@/lib/cold-mail/merge'
import { sendColdMail } from '@/lib/cold-mail/send'
import { renderColdMailHtml } from '@/lib/cold-mail/render-shell'
import { createOptoutToken } from '@/lib/cold-mail/optout-token'

export async function sendeColdMailAnLead(
  leadId: string,
  input: { betreff: string; bodyHtml: string },
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error }
  const { supabase } = guard

  const { data: lead, error: leadErr } = await supabase
    .from('partner_leads')
    .select('id, email, ansprechpartner_email, ansprechpartner_vorname, ansprechpartner_nachname, firma, ort')
    .eq('id', leadId)
    .single()
  if (leadErr || !lead) return { ok: false, error: 'Lead nicht gefunden.' }

  const empfaenger = (lead.ansprechpartner_email?.trim() || lead.email?.trim() || '').toLowerCase()
  if (!empfaenger) return { ok: false, error: 'Kein Empfänger (weder Ansprechpartner- noch Firmen-E-Mail).' }

  const { data: supp } = await supabase
    .from('cold_mail_suppression').select('email').eq('email', empfaenger).maybeSingle()
  if (supp) return { ok: false, error: 'Empfänger ist abgemeldet (Opt-out).' }

  const vars = buildMergeVars(lead)
  const betreff = renderMerge(input.betreff, vars)
  const bodyGemergt = renderMerge(input.bodyHtml, vars)
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'
  const abmeldeUrl = `${base}/abmelden/${createOptoutToken(empfaenger)}`
  const html = await renderColdMailHtml({ bodyHtml: bodyGemergt, abmeldeUrl })

  const res = await sendColdMail({ to: empfaenger, subject: betreff, html, abmeldeUrl, leadId })
  if (!res.ok) return { ok: false, error: res.error }

  // Non-critical: Verlauf-Row darf den Send-Erfolg nicht umkehren.
  try {
    await supabase.from('cold_mail_sends').insert({
      lead_id: leadId, empfaenger_email: empfaenger, betreff, body_snapshot: html,
      resend_message_id: res.messageId, status: 'gesendet',
    })
  } catch (err) {
    console.error('cold_mail_sends insert failed', err)
  }

  revalidatePath('/admin/vertrieb')
  return { ok: true }
}
```

- [ ] **Step 2: Implement `ColdMailComposer.tsx`** (Client — Betreff-Input + Body-Textarea + Senden-Button, Merge-Var-Hinweis, Result-Handling; nutzt `@/components/primitives` Button; Umlaute).

- [ ] **Step 3: Modify `LeadCockpit.tsx`** — additiv: State `coldMailOpen`, ein Button „✉️ Cold-Mail senden" in der bestehenden Action-Button-Reihe (neben Vorstellungs-Mail), der `<ColdMailComposer leadId={kontakt.id} onSent={onChanged} onClose={...} />` einblendet. Keine bestehende Logik ändern.

- [ ] **Step 4: `next build` grün.**

- [ ] **Step 5: Commit**
```bash
git add src/app/admin/vertrieb/_actions/cold-mail-send.ts src/app/admin/vertrieb/drawer/ColdMailComposer.tsx src/app/admin/vertrieb/drawer/LeadCockpit.tsx
git commit -m "feat(cold-mailer): S0 manueller Single-Send aus dem LeadCockpit + Verlauf-Row"
```

---

## Prod-Smoke (Regel 4) — gated auf Aarons Resend-Setup

**Voraussetzung (Aaron):** verifizierte `mail.claimondo.de` bei Resend (SPF/DKIM/DMARC), `RESEND_API_KEY` + `COLD_MAIL_FROM_DOMAIN=mail.claimondo.de` in Prod-Env.

**Flow (nach Prod-Deploy):**
1. Als Admin ins Vertrieb-Cockpit → Lead-Modus → Test-Lead mit einer **eigenen** Empfänger-Email (z.B. Aarons Postfach), `telefon = NULL`.
2. „✉️ Cold-Mail senden" → Betreff + kurzer Body mit `{Ansprechpartner}`/`{Firma}` → senden.
3. **Assert:** Mail kommt an, from = `partner@mail.claimondo.de`, Merge-Vars ersetzt, Footer-Abmeldelink vorhanden.
4. Abmeldelink klicken → „Abmeldung bestätigen" → `cold_mail_suppression`-Row (DB-Verify).
5. Erneut senden an dieselbe Email → Action liefert „Empfänger ist abgemeldet (Opt-out)".
6. **DB-Verify:** `cold_mail_sends`-Row mit `resend_message_id`, `status='gesendet'`, `body_snapshot`.

**Kein Kollateralschaden:** nur an eigene/Test-Adresse senden — nie an echte gescrapte Leads, bis die Sequenz-Freigabe (S2/rechtlich) steht.

## Self-Review (durchgeführt)

- **Spec-Coverage:** S0-Scope aus §10 (Resend-Client ✓ reused, From-Domain-Config ✓ send.ts, react-email-Wrapper ✓ Task 4, Opt-out-Route ✓ Task 5, Suppression-Tabelle ✓ Task 1, Single-Send ✓ Task 6, cold_mail_sends ✓ Task 1). Tracking/Sequenzen/KI bewusst S1–S4.
- **Placeholder-Scan:** keine TBD/„handle errors" — Code vollständig.
- **Typ-Konsistenz:** `ColdMailMergeVars` einmal definiert (merge.ts), überall konsumiert; `SendColdMailResult` konsistent; Guard-Shape `{success}` (nicht `{ok}`) an der Call-Site korrekt behandelt.
- **Reuse:** resend-Singleton + createAdminClient + requireRole + primitives.Button wiederverwendet; Transport bewusst separat (begründet).
