# Werkstatt Login-/Willkommens-Mail — Design

**Datum:** 2026-07-02
**Kontext:** Admin soll aus `/admin/werkstaetten` eine Login-/Willkommens-Mail an eine Werkstatt versenden können. Baut auf dem bestehenden SV-Willkommensmail-Muster auf.

## Ziel

Ein Admin kann einer Werkstatt eine Claimondo-gebrandete Willkommens-Mail schicken, die **beide** Zugangswege enthält: einen Magic-Link („Passwort setzen & einloggen") **und** — wo sicher — die Direkt-Login-Zugangsdaten (E-Mail + Einmalpasswort). Auslösbar aus der Werkstatt-Liste (jederzeit) und direkt im „Werkstatt angelegt"-Dialog.

## Architektur

Reuse des bestehenden react-email-Stacks: `sendEmail()` (`src/lib/email/google/client.ts`) + Flow-Funktion in `flows.ts` + Template in `templates/`. Zugang über Supabase-Recovery-Magic-Link (`auth.admin.generateLink`), analog `sendWillkommenSv`. Server-Action nach dem Muster `resendWelcomeMail(svId)`.

## Kern-Entscheidung: Password-Mechanik (kein Clobber)

`createWerkstatt` erzeugt ein Einmalpasswort mit `force_password_change=true`, **speichert es aber nicht** (nur einmalige Rückgabe an den Dialog). Daher:

| Auslöser | Einmalpasswort in der Mail | Magic-Link | Passwort-Reset? |
|---|---|---|---|
| **Anlage-Dialog** (`knownPassword` durchgereicht) | das im Dialog gezeigte Passwort | ✅ | nein |
| **Listen-Re-Send**, Werkstatt nie eingeloggt (`force_password_change=true`) | frisch zurückgesetztes Einmalpasswort | ✅ | ja (harmlos, temp war ungenutzt) |
| **Listen-Re-Send**, Werkstatt hat eigenes Passwort (`force_password_change=false`) | **keins** — Hinweis „bestehendes Passwort nutzen / per Link neu setzen" | ✅ | **nein (kein Lockout)** |

**Begründung:** Der Magic-Link (Recovery) ist der universelle, immer gültige Zugangsweg und deckt „Zugang verloren" vollständig ab. Das selbstgesetzte Passwort einer aktiven Werkstatt wird **nie** überschrieben. „Beides" wird geliefert, wo es sicher ist; sonst sauberer Fallback auf Magic-Link.

## Komponenten

### 1. Template `src/lib/email/google/templates/WillkommenWerkstatt.tsx` (neu)
- Claimondo-gebrandet (kein `resolveEmailBranding` — Werkstatt = interner Partner). Vorlage: `SvBasicClaimLink.tsx`. `// Token-Audit-Skip`-Header (inline-Hex in Mails Pflicht).
- Exporte: `subject(props)` → „Willkommen bei Claimondo – Ihr Werkstatt-Zugang"; `WillkommenWerkstattEmail(props)`.
- Props: `{ werkstattName: string; email: string; loginUrl: string; magicLink: string | null; einmalpasswort: string | null }`.
- Rendert: Begrüßung; Magic-Link-Button (wenn `magicLink`); Direkt-Login-Block mit `loginUrl` + `email` + `einmalpasswort` (nur wenn `einmalpasswort` gesetzt), sonst Hinweis auf bestehendes Passwort; Note „Passwort beim ersten Login ändern".

### 2. Flow `sendWillkommenWerkstatt(params)` in `src/lib/email/google/flows.ts` (neu)
- `params: { to: string; werkstattName: string; einmalpasswort: string | null }`.
- Generiert Magic-Link: `createAdminClient().auth.admin.generateLink({ type:'recovery', email: to, options:{ redirectTo: '${APP_URL}/passwort-aendern' } })` in try/catch (non-fatal → `magicLink=null`).
- `loginUrl = '${APP_URL}/login'`. `const html = await render(WillkommenWerkstattEmail({...}))`.
- `await sendEmail({ to, subject: subject(props), html, fallId:null, empfaengerTyp:'werkstatt', template:'willkommen_werkstatt' })`.

### 3. Migration: `email_log.empfaenger_typ` CHECK um `'werkstatt'` erweitern + `SendEmailOpts`-Union
- Plugin-Migration (Regel 2): `ALTER TABLE email_log DROP CONSTRAINT <name>; ADD CONSTRAINT ... CHECK (empfaenger_typ = ANY(ARRAY['kunde','sv','kanzlei','admin','werkstatt']))`. Additiv (erlaubt nur einen Wert mehr).
- `src/lib/email/google/client.ts`: `empfaengerTyp?: 'kunde'|'sv'|'kanzlei'|'admin'|'werkstatt'` (additive Union-Erweiterung).

### 4. Server-Action `sendWerkstattLoginMail(werkstattId, knownPassword?)` in `src/app/admin/werkstaetten/actions.ts` (neu)
- `requireAdmin()` (existiert lokal) → `{ ok:false, error }` wenn nicht Admin.
- Werkstatt laden (`werkstaetten` → name, email, user_id); Profil laden (`profiles.force_password_change` via user_id).
- Passwort-Logik (Tabelle oben): `knownPassword ?? (force_password_change ? freshResetAndReturn() : null)`. `freshResetAndReturn()` = `generatePassword()` (lokaler Helper) + `admin.auth.admin.updateUserById(user_id, { password, user_metadata:{ force_password_change:true } })`.
- `sendWillkommenWerkstatt({ to: email, werkstattName: name, einmalpasswort })` in try/catch (E-Mail-Send non-fatal, aber hier ist Senden der Zweck → Fehler ⇒ `{ ok:false, error }`).
- `revalidatePath('/admin/werkstaetten')`; `return { ok:true }`. Result-Shape `{ ok, error? }` (File-Konvention).

### 5. `createWerkstatt` gibt `werkstattId` zurück
- Return erweitern: `{ ok:true; email; password; werkstattId }`. Nötig, damit der Anlage-Dialog `sendWerkstattLoginMail(werkstattId, password)` rufen kann.

### 6. UI `src/app/admin/werkstaetten/WerkstaettenClient.tsx`
- **Listen-Zeile**: Button „Login-Mail" (`MailIcon`, analog QR/Staffel-Buttons, `loading`-State pro Zeile) → `sendWerkstattLoginMail(w.id)` → `toast.success/error`.
- **Anlage-Dialog**: Button „Login-Mail senden" neben der Zugangsdaten-Anzeige → `sendWerkstattLoginMail(createdCredentials.werkstattId, createdCredentials.password)`. `createdCredentials`-State um `werkstattId` erweitern.
- Alle Strings echte Umlaute; `Button` aus `@/components/primitives`.

## Error-Handling
- Server-Actions: Result-Object `{ ok, error? }`, kein `throw` (Auth-Guard `requireAdmin` gibt `null` → `{ ok:false }`).
- Magic-Link-Generierung: try/catch, non-fatal (Mail geht auch ohne Link raus, mit Passwort/Login-URL).
- E-Mail-Send in `sendWerkstattLoginMail`: Fehler ⇒ `{ ok:false, error }` (Senden ist der Zweck der Action).

## Branding
Claimondo-Default (kein `resolveEmailBranding`-Aufruf). Werkstatt-Portal = interner Partner-Bereich (AGENTS.md §Whitelabel: interne Portale werden nicht gebrandet).

## Testing (TDD)
- `__tests__/actions.test.ts` erweitern (bestehende Supabase-Mock-Konvention):
  - `sendWerkstattLoginMail` non-admin → `{ ok:false }`.
  - admin + `force_password_change=true` → `updateUserById` aufgerufen (Reset) + Flow aufgerufen → `{ ok:true }`.
  - admin + `force_password_change=false`, ohne `knownPassword` → `updateUserById` **nicht** aufgerufen, Flow mit `einmalpasswort=null` → `{ ok:true }`.
  - admin + `knownPassword` → kein Reset, Flow mit dem Passwort.
  - Flow (`sendWillkommenWerkstatt`) + Supabase gemockt.
- Optional: Template-Render-Test (`render(WillkommenWerkstattEmail(...))` enthält Magic-Link + Passwort wenn gesetzt; ohne Passwort kein Passwort-Block).

## Umsetzung / Koordination
- **Gleicher Branch `kitta/werkstatt-auftrag-view` / PR #3449** — berührt die 2 werkstaetten-Files, die #3449 schon ändert (kein Konflikt); neue Feature-Files additiv. Separater Branch off staging → Konflikt auf `actions.ts`/`Client.tsx`.
- ⚠️ Shared Files: `flows.ts` (+ neue Funktion + 1 Import) und `client.ts` (+ 1 Union-Member) — beide rein additiv; koordinieren gg. Session 6f9b2dea (`email-hero-blur`).
- ⚠️ Merge-Session: #3449-Scope wächst um dieses Feature → im Marker flaggen „komplett mergen, nicht mid-flight".

## Out of Scope
- SMS/WhatsApp-Login-Info (nur E-Mail).
- Werkstatt-spezifische Login-Seite (alle nutzen `/login`).
- Umbau des bestehenden Einmalpasswort-Dialogs (bleibt; Mail ist additiv).
