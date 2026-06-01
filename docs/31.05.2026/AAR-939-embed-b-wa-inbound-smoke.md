# AAR-939 — embed-B WhatsApp-Inbound JA/NEIN (Stream 6a)

**Datum:** 31.05.2026 · **Branch:** `kitta/aar-939-embed-b-wa-inbound` (stacked auf `kitta/aar-939-embed-b-claim-kaskade` / PR #2101)
**Scope:** Handoff `docs/31.05.2026/HANDOFF-embed-b-kaskade-naechste-session.md` §6a.

## Ziel

Antwortet ein embed-B / `nur_gutachter`-Kunde per **WhatsApp** mit „JA"/„NEIN" auf den
Resolution-Ping (Cron, `end_zeit + 24h`), wird der überfällige Termin **direkt aufgelöst —
ohne Portal**:

- **JA** → Gutachter war da → Termin `durchgefuehrt_am` + Claim terminal (`termin_durchgefuehrt`).
- **NEIN** → Gutachter nicht erschienen → Dispatcher-Klärungs-Task (Team bestätigt No-Show +
  vermittelt neuen Termin). **Kein** direkter Claim-Move, **kein** `sv_no_show_am` (Anti-Gaming,
  identisch zur Portal-NEIN-Action). €70 bleibt per Default-Cron fällig.

## Was gebaut wurde

| Datei | Änderung |
|---|---|
| `src/app/api/webhooks/twilio/inbound/route.ts` | Additiver Resolution-Block VOR den bestehenden Intents (+131 LOC). Findet den stale `nur_gutachter`-Termin des gematchten Kunden, ruft JA/NEIN-Writes, früh-`return`. |
| `src/lib/termine/close-nur-gutachter-termin.ts` | `byUserId` auf `string \| null` geweitet (WA-Pfad hat keinen eingeloggten User; Spalte nullable). |
| `scripts/smoke-embed-b-wa-inbound.mjs` | Smoke-Fixture (neu). |

## Kern-Designentscheidung (wichtig)

Der Handoff §6a sagt „JA → `bestaetigeTerminAlsKunde(terminId)`". Diese Actions sind aber
`'use server'` und machen `supabase.auth.getUser()`-Ownership → im **Webhook gibt es keine
User-Session** → sie lieferten `{ ok:false, 'Nicht angemeldet' }`. Lösung: der Webhook ruft die
**bereits geteilten, admin-basierten Core-Helper direkt** (`closeNurGutachterTerminAlsDurchgefuehrt`
/ `createEmbedBKlaerungTask`) — genau die Writes, die auch die Portal-Actions intern nutzen.
**Ownership im Webhook = Twilio-Signatur (HMAC-SHA1, oben validiert) + Phone-Match** (etablierte
Sicherheits-Posture dieses Webhooks, der auch ZB1/Polizeibericht-Uploads per Phone-Match annimmt).

## Empirische DB-Verifikation (vor dem Code, Supabase-MCP READ)

- `nur_gutachter`-Termine tragen **immer `claim_id` UND `fall_id`** (`claim_only_no_fall=0`,
  `fall_only_no_claim=0`) → Match über `fall_id` (wie der Kunde-Banner) tragfähig.
- `claims.endzustand_gesetzt_durch_user_id` = **nullable** → `byUserId` darf null sein.
- `claims.kunde_id` **existiert nicht** (nur `lead_id`) → Kunde-Auflösung über `faelle.kunde_id`.
- Alle 45 `nur_gutachter`-Fälle haben `fall.status='sv-termin'` (nicht abgeschlossen/storniert)
  → `matchInboundToFall` (Filter auf offene Fälle) gibt sie zurück.
- `matchInboundToFall` selbst nutzt `id.in.(<uuids>)` in `.or()` → mein `.or('fall_id.in.(…),lead_id.eq.…')`
  ist im Codebase etabliert.

## Stale-Gate (DRY)

Identisch zu Kunde-Banner (`kunde/faelle/[id]/page.tsx`) + Resolution-Cron — geteilte Konstanten
`TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE` + `CLAIM_TERMINAL_STATUSES`:
überfällig (`end_zeit < now`), `durchgefuehrt_am/sv_no_show_am/sv_ablehnung_am IS NULL`, Status
nicht in der Ausschlussliste, Claim `service_typ='nur_gutachter'` + nicht terminal.
**Unterschied zum Banner:** KEIN „kein offener Klärungs-Task"-Ausschluss — der Cron legt Task + Ping
gleichzeitig an, beim WA-Reply existiert der Task also erwartungsgemäß (= positives Signal).

## Smoke — `node scripts/smoke-embed-b-wa-inbound.mjs run`

Repliziert die novel Kernlogik **verbatim** gegen die **Live-DB** (kein Dev-Server → connection-
schonend bei vielen parallelen Sessions; kein Twilio-Signatur-Dev-Bypass vorhanden). Nutzt den
Test-Claim `smoke-kunde-…@claimondo.test` (Lead + Profil bereits mit `+4915112345678` verdrahtet),
reversibel, restlos aufräumend.

**Ergebnis: 14/14 PASS, 0 fail.**

- `matchInboundToFall('+4915112345678')` → Test-Fall ✅
- exakte `.or`-Stale-Gate-Query findet den seeded Termin + liefert `claim_id` ✅
- **JA:** Termin `durchgefuehrt_am`+`abgeschlossen`, Claim `termin_durchgefuehrt`, kein CHECK-Fehler,
  `endzustand_gesetzt_durch_user_id`=Kunde; danach **Gate idempotent** (kein stale-Termin mehr) ✅
- **NEIN:** Klärungs-Task erstellt + **idempotent** (2. Aufruf `created=false`, genau 1 offener
  `dispatch`-Task) ✅
- Cleanup: Claim zurück auf `komplett`/`dispatch_done`, 0 Leftover (per execute_sql gegengeprüft) ✅

## Nicht abgedeckt (bewusst)

- **HTTP-Layer nicht per echtem POST getestet:** Twilio-Signatur hat keinen Dev-Bypass + kein
  Dev-Server (Connection-Limit-Risiko bei 7 parallelen Sessions). Intent-Parsing/Signatur/early-return
  sind unveränderte Bestands-Logik bzw. struktur-/tsc-verifiziert; die Laufzeit-Risiken (PostgREST-
  Query-Syntax, CHECK-Constraints, Idempotenz) sind über das Smoke-Script empirisch abgedeckt.
- **Lead-only-JA (byUserId=null):** typ-/Spalten-seitig verifiziert (nullable), keine separate Fixture.
- **Regression Nicht-embed-B:** logisch über den `service_typ='nur_gutachter'`-Filter abgesichert
  (komplett-Claims fallen durch → bestehende Buchungs-Intents greifen unverändert).

## 7-Punkte-Audit

1. **Build:** `npx tsc --noEmit` EXIT 0. Route-Export-Signatur unverändert → Next-Build-Validator n/a.
2. **UI:** kein UI-Change. Einstiegspunkt = WhatsApp-Reply auf den bestehenden Cron-Ping.
3. **Redundanz:** geteilte Helper + Konstanten wiederverwendet, `matchInboundToFall` wiederverwendet.
4. **Dead-Code:** nichts entfernt, keine toten Imports. Smoke-Script konsistent mit `smoke-embed-b-kaskade.mjs`.
5. **Spec:** §6a (1)/(2)/(3) erfüllt. Abweichung dokumentiert: Core-Helper statt `'use server'`-Actions.
6. **Inkonsistenz:** DB via MCP verifiziert; Umlaute in WA-/Timeline-Texten korrekt; Nested-FK normalisiert; kein `throw`.
7. **Regression:** 4 Konsumenten von `closeNurGutachterTerminAlsDurchgefuehrt` geprüft — `string`→`string|null` backward-compatible; bestehende Intents fall-through-sauber.

## Offen (Stream 6b)

Self-Service-Verlegung — Handoff sagt „vor Bau koordinieren" (Overlap mit SV-Routing der Session
`aar-939-dispatch-offene-anfragen`). Separat behandelt.
