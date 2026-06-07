# Monika A-Flow — Phase 4: Kunden-Bestätigung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nach Abschluss des Monika-Funnels im Callback-Flow (sv_embed-Variante-A + Cluster-LP, NICHT Variante B) eine Bestätigung an den Kunden senden: „Vielen Dank für Ihre Anfrage bei {X}. Wir melden uns schnellstmöglich bei Ihnen. Mehr über uns: https://claimondo.de" — per WhatsApp mit SMS-Fallback.

**Architecture:** `notifyAnfrage` (lib/embed/anfrage.ts) sendet zusätzlich eine Kunden-Bestätigung via dem bestehenden `sendNachricht`-Wrapper (`fallback:['sms']`). Der SMS-Fallback im Wrapper ist heute ein TODO-Placeholder — ich schließe ihn mit dem fertigen `sendPlainSms` (0 bestehende `fallback:['sms']`-Caller → kein Seiteneffekt). Die `{X}`-Bezeichnung (PURE, vitest-getestet): Cluster-LP → „Sachverständiger {Stadt}" (Mapping aus `cluster`-Key), sv_embed → `embed_sites.name`. Eine additive Migration erweitert `nachrichten.kanal` um `sms`+`email` (fixt zugleich den heute silent-fehlschlagenden email-Fallback-Audit-Log).

**Tech Stack:** TypeScript, `sendNachricht`/`sendPlainSms` (Twilio), Supabase (gfa via service_role, DDL via Plugin), vitest (`node` env). Branch `kitta/aar-939-monika-kunde-bestaetigung` (von staging mit P1+P2+P3).

---

## Scope & Verbindlichkeit

**Phase 4 (eigenständig).** Backend-Erweiterung, additiv. Abgenommen (Aaron 2026-06-07):
- **Anrede Sie** (konsistent mit dem Widget, das durchgängig siezt).
- **Link claimondo.de** überall.
- **Kanal WhatsApp + SMS-Fallback.**
- **Nur Callback-Flow:** sv_embed-Variante-A + Cluster-LP. Variante B (flowlink) geht gar nicht durch `notifyAnfrage` → automatisch ausgeschlossen.
- **{X}:** Cluster → „Sachverständiger Wuppertal/Düsseldorf/Bonn" (echtes Ü); sv_embed → `embed_sites.name` (Fallback „Ihrem Sachverständigen").

**Recherche-Fakten (verifiziert 2026-06-07):**
- `sendNachricht` (src/lib/whatsapp/send.ts) macht WA + Fallback-Kette; `empfaengerRolle:'kunde'` existiert; SMS-Fallback ist Placeholder (Z.128-139). `email`-Fallback ist implementiert.
- `sendPlainSms(to, body)` (src/lib/whatsapp/send-sms-plain.ts) fertig + getestet: Result `{ success, sid?, error? }`, normalisiert E.164, prüft Twilio-Creds.
- **0 Caller** nutzen `fallback:['sms']` (Grep) → Aktivierung ohne Seiteneffekt.
- `embed_sites` hat `name`; `EmbedSiteConfig`/`ladeEmbedSite` laden es noch NICHT.
- `nachrichten.kanal` CHECK = `{whatsapp, chat_kb_kunde, gruppenchat, chat_kunde_sv, chat_kb_sv, chat_gruppe_mit_makler}` → **kein `sms`/`email`** → Audit-Log-Insert für diese Kanäle scheitert (heute silent via try/catch im email-Fallback).
- `notifyAnfrage` läuft im `after()` von route.ts für Variante-A (sv_embed) + Cluster-LP.

---

## File Structure

**Neu:**
- `src/lib/embed/kunde-bestaetigung.ts` — PURE: `svBezeichnung(payload, siteName)` + `kundenBestaetigungText(bezeichnung)` + `CLUSTER_STADT`-Map.
- `src/lib/embed/kunde-bestaetigung.test.ts` — vitest.
- `supabase/migrations/<V>_nachrichten_kanal_sms_email.sql`

**Geändert:**
- `src/lib/whatsapp/send.ts` — SMS-Fallback-Placeholder durch `sendPlainSms` + `logNachricht` ersetzen.
- `src/lib/embed/anfrage.ts` — `EmbedSiteConfig.name` + `ladeEmbedSite`-select; `notifyAnfrage` ruft die Kunden-Bestätigung.

---

## Task 1: Migration — `nachrichten.kanal` um `sms`+`email`

**Files:**
- Create: `supabase/migrations/<recorded-version>_nachrichten_kanal_sms_email.sql`

Additiv: erweitert den CHECK, damit Audit-Logs für SMS/Email-Sends nicht mehr silent scheitern. DDL via Supabase-Plugin (AGENTS.md Regel 2).

- [ ] **Step 1: Bestehenden CHECK-Namen ablesen**

`execute_sql` (READ):
```sql
SELECT conname FROM pg_constraint
WHERE conrelid='nachrichten'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) ILIKE '%kanal%';
```
Notiere `<conname>` (z.B. `nachrichten_kanal_check`).

- [ ] **Step 2: DDL via Plugin**

`apply_migration({ name: "nachrichten_kanal_sms_email", query: <DDL> })` — DROP + ADD mit erweiterter Werte-Liste (conname aus Step 1 einsetzen):
```sql
ALTER TABLE nachrichten DROP CONSTRAINT IF EXISTS <conname>;
ALTER TABLE nachrichten ADD CONSTRAINT nachrichten_kanal_check
  CHECK (kanal = ANY (ARRAY[
    'whatsapp','sms','email',
    'chat_kb_kunde','gruppenchat','chat_kunde_sv','chat_kb_sv','chat_gruppe_mit_makler'
  ]::text[]));
```

- [ ] **Step 3: Getrackte Version ablesen** — `list_migrations` → `<V>`.

- [ ] **Step 4: Migration-File committen — Dateiname == `<V>`**

`supabase/migrations/<V>_nachrichten_kanal_sms_email.sql` mit obigem DDL.
```bash
git add supabase/migrations/<V>_nachrichten_kanal_sms_email.sql
git commit -m "feat(AAR-939 P4): nachrichten.kanal +sms +email (additiv, fixt Audit-Log)"
```

- [ ] **Step 5: Verifizieren (READ)**
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='nachrichten'::regclass AND conname='nachrichten_kanal_check';
```
Expected: Liste enthält `sms` und `email`.

---

## Task 2: `kunde-bestaetigung.ts` — PURE Bezeichnung + Text

**Files:**
- Create: `src/lib/embed/kunde-bestaetigung.ts`
- Test: `src/lib/embed/kunde-bestaetigung.test.ts`

PURE (kein server-only/DB) → vitest-testbar im `node`-Env.

- [ ] **Step 1: Failing-Test**

`src/lib/embed/kunde-bestaetigung.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { svBezeichnung, kundenBestaetigungText, CLUSTER_STADT } from './kunde-bestaetigung'

describe('svBezeichnung', () => {
  it('Cluster wuppertal → Sachverständiger Wuppertal', () =>
    expect(svBezeichnung({ source: 'kfz_gutachter_lp', cluster: 'wuppertal' }, null)).toBe('Sachverständiger Wuppertal'))
  it('Cluster duesseldorf → echtes Ü', () =>
    expect(svBezeichnung({ source: 'kfz_gutachter_lp', cluster: 'duesseldorf' }, null)).toBe('Sachverständiger Düsseldorf'))
  it('Cluster bonn', () =>
    expect(svBezeichnung({ source: 'kfz_gutachter_lp', cluster: 'bonn' }, null)).toBe('Sachverständiger Bonn'))
  it('Cluster unbekannt → generisch', () =>
    expect(svBezeichnung({ source: 'kfz_gutachter_lp', cluster: 'xyz' }, null)).toBe('Ihrem Sachverständigen'))
  it('sv_embed → embed_sites.name', () =>
    expect(svBezeichnung({ source: 'sv_embed', cluster: null }, 'KFZ-Gutachter Müller')).toBe('KFZ-Gutachter Müller'))
  it('sv_embed ohne name → generisch', () =>
    expect(svBezeichnung({ source: 'sv_embed', cluster: null }, null)).toBe('Ihrem Sachverständigen'))
})

describe('kundenBestaetigungText', () => {
  it('Sie-Anrede + claimondo.de-Link', () => {
    const t = kundenBestaetigungText('Sachverständiger Bonn')
    expect(t).toBe('Vielen Dank für Ihre Anfrage bei Sachverständiger Bonn. Wir melden uns schnellstmöglich bei Ihnen. Mehr über uns: https://claimondo.de')
  })
})

describe('CLUSTER_STADT', () => {
  it('hat die 3 Cluster mit Umlaut', () =>
    expect(CLUSTER_STADT).toEqual({ wuppertal: 'Wuppertal', duesseldorf: 'Düsseldorf', bonn: 'Bonn' }))
})
```

- [ ] **Step 2: Test fails** — `npx vitest run --root <wt> kunde-bestaetigung` → FAIL (Modul fehlt).

- [ ] **Step 3: `kunde-bestaetigung.ts`**

```ts
// AAR-939 P4 · Kunden-Bestätigung nach Monika-Funnel (Callback-Flow). PURE: Bezeichnung
// + Text, vitest-testbar (kein server-only). Anrede Sie, Link claimondo.de (Aaron 2026-06-07).

/** Cluster-Key → Stadt-Anzeigename (echte Umlaute). */
export const CLUSTER_STADT: Record<string, string> = {
  wuppertal: 'Wuppertal',
  duesseldorf: 'Düsseldorf',
  bonn: 'Bonn',
}

const GENERISCH = 'Ihrem Sachverständigen'

export interface BezeichnungInput {
  source: 'kfz_gutachter_lp' | 'sv_embed'
  cluster: string | null
}

/**
 * {X} in der Bestätigung:
 *   Cluster-LP → „Sachverständiger {Stadt}" (Mapping; unbekannt → generisch)
 *   sv_embed   → embed_sites.name (fehlt → generisch)
 */
export function svBezeichnung(input: BezeichnungInput, siteName: string | null): string {
  if (input.source === 'kfz_gutachter_lp') {
    const stadt = input.cluster ? CLUSTER_STADT[input.cluster] : undefined
    return stadt ? `Sachverständiger ${stadt}` : GENERISCH
  }
  // sv_embed
  return siteName?.trim() ? siteName.trim() : GENERISCH
}

export function kundenBestaetigungText(bezeichnung: string): string {
  return `Vielen Dank für Ihre Anfrage bei ${bezeichnung}. Wir melden uns schnellstmöglich bei Ihnen. Mehr über uns: https://claimondo.de`
}
```

- [ ] **Step 4: Test passes** — `npx vitest run --root <wt> kunde-bestaetigung` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/embed/kunde-bestaetigung.ts src/lib/embed/kunde-bestaetigung.test.ts
git commit -m "feat(AAR-939 P4): PURE svBezeichnung + Bestaetigungstext + Tests"
```

---

## Task 3: SMS-Fallback in `sendNachricht` aktivieren

**Files:**
- Modify: `src/lib/whatsapp/send.ts`

Den Placeholder (Z.128-139, der `'sms'`-Zweig der Fallback-Schleife) durch echten `sendPlainSms` + `logNachricht` ersetzen.

- [ ] **Step 1: Import ergänzen** (oben in send.ts, bei den anderen Imports):
```ts
import { sendPlainSms } from './send-sms-plain'
```

- [ ] **Step 2: SMS-Zweig ersetzen**

Den bestehenden Block ersetzen:
```ts
    if (ch === 'sms' && phone) {
      // TODO PR #4: Twilio-SMS-Send hier einhaken — heute placeholder
      // Wir loggen den Versuch + returnen, der echte Send erfolgt wenn
      // sendStatusSms() Wrapper migriert wird.
      console.info('[whatsapp/send] sms-fallback noch nicht migriert', {
        entity,
        entityId,
        templateKey,
      })
      continue
    }
```
durch:
```ts
    if (ch === 'sms' && phone) {
      const smsRes = await sendPlainSms(phone, text)
      await logNachricht({
        kanal: 'sms',
        empfaengerEntity: entity,
        empfaengerId: entityId,
        empfaengerRolle,
        empfaengerKontakt: phone,
        text,
        templateKey,
        fallId,
        externalId: smsRes.sid ?? null,
        fehler: smsRes.success ? undefined : smsRes.error,
      })
      if (smsRes.success) {
        return { ok: true, channel: 'sms', messageId: smsRes.sid, whatsappVerfuegbar: waStatus.verfuegbar }
      }
      continue
    }
```

- [ ] **Step 3: Verifizieren (typecheck)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: keine neuen Fehler. (`logNachricht` akzeptiert `kanal:'sms'` — der Typ ist `'whatsapp'|'sms'|'email'`, Z.227; der DB-CHECK ist via Task 1 erweitert.)

- [ ] **Step 4: Commit**
```bash
git add src/lib/whatsapp/send.ts
git commit -m "feat(AAR-939 P4): sendNachricht SMS-Fallback aktiv (sendPlainSms, 0 Bestandscaller)"
```

---

## Task 4: `EmbedSiteConfig.name` + `ladeEmbedSite`

**Files:**
- Modify: `src/lib/embed/anfrage.ts`

- [ ] **Step 1: Interface + select**

In `EmbedSiteConfig` (anfrage.ts) nach `slug` ergänzen:
```ts
  name: string | null
```
In `ladeEmbedSite` den select-String um `name` erweitern:
```ts
    .select('id, slug, name, variante, funnel_modus, einzelpreis_eur, empfaenger_email, cc_email, baileys_routing_nummer, sv_telefon, erlaubte_domains, max_anfragen_pro_h, aktiv')
```

- [ ] **Step 2: Verifizieren** — `npx tsc --noEmit -p tsconfig.json` → keine neuen Fehler (Cast `as unknown as EmbedSiteConfig` deckt das neue Feld).

- [ ] **Step 3: Commit**
```bash
git add src/lib/embed/anfrage.ts
git commit -m "feat(AAR-939 P4): EmbedSiteConfig.name laden (sv_embed-Bezeichnung)"
```

---

## Task 5: `notifyAnfrage` sendet die Kunden-Bestätigung

**Files:**
- Modify: `src/lib/embed/anfrage.ts`

- [ ] **Step 1: Imports**

Oben in anfrage.ts ergänzen:
```ts
import { svBezeichnung, kundenBestaetigungText } from './kunde-bestaetigung'
```

- [ ] **Step 2: Kunden-Bestätigung am Anfang von `notifyAnfrage`**

In `notifyAnfrage`, direkt NACH dem `fireTrackingWebhook`-try/catch und VOR `if (payload.source === 'sv_embed' && variante === 'A' && site)` einfügen:
```ts
  // AAR-939 P4: Kunden-Bestätigung (Callback-Flow). Variante B laeuft nicht durch
  // notifyAnfrage → hier sind nur sv_embed-A + Cluster-LP. Best-effort: ein Fail darf
  // die SV-/Dispatch-Notify nicht brechen. WhatsApp zuerst, SMS-Fallback.
  if (payload.telefon) {
    const bezeichnung = svBezeichnung(
      { source: payload.source, cluster: payload.cluster ?? null },
      site?.name ?? null,
    )
    try {
      await sendNachricht({
        entity: 'gfa',
        entityId: anfrageId,
        phone: payload.telefon,
        text: kundenBestaetigungText(bezeichnung),
        fallback: ['sms'],
        empfaengerRolle: 'kunde',
        templateKey: 'embed_kunde_bestaetigung',
      })
    } catch (err) {
      console.error('[AAR-939 P4] Kunden-Bestaetigung fehlgeschlagen:', err)
    }
  }
```
> `sendNachricht` ist bereits in anfrage.ts importiert (für den SV-Notify). `payload.source` ist `'kfz_gutachter_lp'|'sv_embed'` (EmbedAnfrageSchema-enum) → typkompatibel mit `BezeichnungInput.source`.

- [ ] **Step 3: typecheck:embed nicht betroffen; voller tsc**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: grün.

- [ ] **Step 4: Commit**
```bash
git add src/lib/embed/anfrage.ts
git commit -m "feat(AAR-939 P4): notifyAnfrage sendet Kunden-Bestaetigung (WA+SMS, Callback-Flow)"
```

---

## Task 6: Tests + Build + Gates

**Files:** (keine — Verifikation)

- [ ] **Step 1: Unit-Tests (alle Embed/PURE)**

Run: `npx vitest run --root <wt> kunde-bestaetigung anfrage-columns embed-anfrage`
Expected: alle grün (inkl. der 9 neuen kunde-bestaetigung-Tests).

- [ ] **Step 2: Voller tsc**

Run: `npm run typecheck`
Expected: grün — `send.ts` + `anfrage.ts` + neues Modul kompilieren.

- [ ] **Step 3: Voller Build (Route-Validator)**

Run: `npm run build`
Expected: grün. (Worktree-`node_modules`-Junction → falls Next-Build OOMt: `npx tsc --noEmit` + Verlass auf CI-Build-Gate.)

- [ ] **Step 4: Verifikations-Smoke gegen das Cluster-Mapping**

Run: `npx vitest run --root <wt> kunde-bestaetigung`
Manuell prüfen: `svBezeichnung` für die 3 Cluster + sv_embed deckt die Spec. (Ein echter WA/SMS-Send-Smoke ist erst gegen Staging mit Twilio-Creds + einer echten Test-Anfrage sinnvoll → Aarons Staging-Test.)

- [ ] **Step 5: Commit (falls Gate-Fixes)**
```bash
git add -A
git commit -m "chore(AAR-939 P4): Gates gruen (tsc/build/vitest)"
```

---

## Task 7: PR gegen staging

- [ ] **Step 1: Push**
```bash
git push -u origin kitta/aar-939-monika-kunde-bestaetigung
```

- [ ] **Step 2: PR (`--base staging`)**

`gh pr create --base staging --title "feat(AAR-939): Monika A-Flow Phase 4 — Kunden-Bestaetigung (WA+SMS)" --body "<Audit-Block + Verweis Plan>"`

Body mit 7-Punkte-Audit: Build grün / UI: n/a (Backend) / Redundanz: sendNachricht+sendPlainSms wiederverwendet, kein neuer Sender / Dead-Code: SMS-Placeholder ersetzt / Spec: Sie + claimondo.de + WA+SMS + nur Callback-Flow + Cluster-Mapping / Inkonsistenz: Umlaute (Düsseldorf) + nachrichten.kanal-CHECK additiv / Regression: notifyAnfrage SV-Notify unberührt (Kunden-Send best-effort davor), 0 fallback:['sms']-Bestandscaller.

---

## Self-Review (writing-plans)

**Spec-Coverage:** „Bestätigung nach Funnel-Abschluss, nur Variante A" → Task 5 (notifyAnfrage, läuft nur für Callback-Flow; Variante B ausgeschlossen). Text/Anrede Sie/claimondo.de → Task 2 (`kundenBestaetigungText`). „{X}=SV-Name bzw. Sachverständiger {Stadt}" → Task 2 (`svBezeichnung` + `CLUSTER_STADT`) + Task 4 (`name` laden). WA+SMS-Fallback → Task 3 (SMS-Fallback aktiv) + Task 5 (`fallback:['sms']`). Audit-Log-CHECK → Task 1.

**Platzhalter-Scan:** keine TBD/TODO im neuen Code; der entfernte Code IST der alte TODO-Placeholder. `<conname>`/`<V>`/`<wt>` sind Laufzeit-Ablesewerte mit explizitem Able-Schritt, keine Platzhalter-Lücken.

**Typ-Konsistenz:** `svBezeichnung(BezeichnungInput, siteName)` Signatur identisch Task 2 (Def) ↔ Task 5 (Caller). `BezeichnungInput.source` = `'kfz_gutachter_lp'|'sv_embed'` == `payload.source` (EmbedAnfrageSchema-enum). `kundenBestaetigungText(string)` Task 2 ↔ Task 5. `sendNachricht`-Felder (`entity/entityId/phone/text/fallback/empfaengerRolle/templateKey`) == send.ts `SendNachrichtInput`. `logNachricht({kanal:'sms', …})` == send.ts logNachricht-Signatur (`kanal:'whatsapp'|'sms'|'email'`). `EmbedSiteConfig.name` (Task 4) gelesen in Task 5 (`site?.name`).

**Scope:** fokussiert (eine Funktion + ein Sender-Fix + eine additive Migration). Kein UI. Variante-B-Pfad unangetastet.
