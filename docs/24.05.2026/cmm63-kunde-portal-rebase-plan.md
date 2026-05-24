# CMM-63 Implementation Plan — kunde-Portal `faelle → claims` Rebase (inkl. Route-Key-Switch)

> **Für agentic worker:** Dieser Plan folgt dem **CMM-44-Slice-Rezept** (AGENTS.md): pro PR die Call-Sites **gegen aktuellen staging re-greppen** (statisches Inventar ist stale), `information_schema` **live** vor jeder Migration, **CLI-Migration** (Regel 2), **2-Stufen-Review**, **Portal-Smoke pro Rolle** nach jedem Schritt. PR **immer gegen `staging`** (Regel 1). Kein TDD-first-Zwang (Projekt-Pattern = Sweep + Smoke), aber `npm run build` (NODE_OPTIONS=8192) + `vitest` müssen grün sein.

**Goal:** Das kunde-Portal liest seine Fall-Daten aus `claims` (+ Sub-Tabellen) statt `faelle`, routet auf `claim_id` statt `faelle.id`, und resolved Ownership über `claim_parties(rolle=geschaedigter).user_id` — sodass `faelle` für die kunde-Oberfläche droppbar wird (Beitrag zu Phase 6 / SP-L).

**Architecture:** `claims` = SSoT-Anker; `claim_parties(geschaedigter)` = Ownership-SSoT (empirisch 45/45 sauber, == faelle.kunde_id). Route-Param wandert `faelle.id → claim_id`; Alt-Bookmarks `/kunde/faelle/<faelleId>` werden via Redirect-Shim (faelle lebt noch bis SP-L) auf `<claimId>` gemappt. Reads, die heute faelle-Spalten ziehen, kommen aus claims/Sub-Tables (viele schon da: SP-A/B/D/I + CMM-60 sv_id); verbleibende faelle-only-Reads (`fahrzeug_*`=SP-E, `created_at`=CMM-65) laufen bis zu deren Slice über einen markierten Transitions-Read.

**Tech Stack:** Next.js 15 App Router (RSC + Server Actions), Supabase (PostgREST + RLS), TypeScript. Migrationen via `npx supabase db query --linked --file` + `migration repair`.

---

## Präkondition (live verifiziert 2026-05-24, prod 49 faelle / 45 mit kunde_id)

- ✅ `claim_parties(geschaedigter).user_id` deckt **45/45** ab, == `faelle.kunde_id` überall → **Ownership-Ziel**. Kein Backfill nötig.
- ⚠️ `claims.geschaedigter_user_id` hat **1 Drift** (CLM-2026-00115, beides Test-User) → **NICHT** als Ownership-Filter nutzen. (Optional: in PR0 als Datenhygiene fixen.)
- Quelle: `scripts/probe-cmm63-ownership-backfill.mjs` (im Worktree, curl/PostgREST-basiert; supabase-js node-Client hängt in dieser Env).

## Kreuz-Slice-Abhängigkeiten (Gates für VOLLE faelle-Freiheit der kunde-Reads)

| Domäne im kunde-Read | Heimat | Slice-Stand | Konsequenz |
|---|---|---|---|
| kunde_id / Parteien | claim_parties | **dieser Slice** | — |
| sa_unterschrieben/vollmacht/szenario/onboarding/schadenort/kundenbetreuer | claims | SP-A/A2/B ✅ | direkt aus claims lesbar |
| sv_id | claims | CMM-60 ✅ | direkt |
| regulierung_am/anschlussschreiben_am | kanzlei_faelle | SP-I ✅ | via Embed/View |
| besichtigungsort/nachbesichtigung/termin | gutachter_termine | SP-D ✅ | via Embed/View |
| **fahrzeug_* / kennzeichen** | vehicles | **SP-E PENDING (CMM-50)** | Transitions-Read bis CMM-50 |
| **created_at/updated_at** | claims | **CMM-65 offen** | Transitions-Read bis CMM-65 |

> Folge: Dieser Slice macht das kunde-Portal **claims-zentriert + claim_id-geroutet + claim_parties-ownership**. Die letzten faelle-Spalten-Reads (`fahrzeug_*`, `created_at`) bleiben über einen klar markierten `// CMM-63 TRANSITION: bis CMM-50/65`-Read, bis die jeweiligen Slices landen. Der finale `from('faelle')`-Nullstand für kunde ist erst nach CMM-50 + CMM-65 erreicht — das ist im Smoke-/Re-Grep-Gate von SP-L (CMM-49) abzufangen.

---

## Surface (Stand 2026-05-24, re-grep vor jedem PR Pflicht)

- **21 Files / 39 `from('faelle')`** unter `src/app/kunde/` (Liste unten).
- **Routen mit id-Param:** `kunde/faelle/[id]`, `kunde/nachbesichtigung/[fall_id]`, `kunde/termine/[id]` (id = faelle.id heute). Token-Routen `re-termin/[token]`, `termin/[token]` sind token-basiert → separat, kein faelle.id-Key.
- **Ownership-Helfer:** `src/lib/claims/kunde-ownership.ts` (`assertKundeOwnsFall`, 1 Caller: `faelle/[id]/actions.ts`).
- **Loader:** `src/lib/claims/get-kunde-faelle.ts` (6 Caller), gibt heute `id = faelle.id` zurück.
- **Peripher (server-seitig, fallId→kunde-Lookup):** `lib/notifications/fan-out.ts:29`, `lib/whatsapp.ts:265`, KB-Termin-Cron-Reminder, `lib/actions/termin-actions.ts`.

---

## PR-Phasen

### PR0 (optional, klein) — Datenhygiene + Ownership-Helfer auf claim_parties härten

**Files:**
- Modify: `src/lib/claims/kunde-ownership.ts`
- (optional) Migration: 1 UPDATE claims.geschaedigter_user_id für CLM-2026-00115 (Test-Drift)

**Scope:** `assertKundeOwnsFall` nutzt `claim_parties(geschaedigter)` als **autoritativen** Pfad (ist schon Pfad 2b); `faelle.kunde_id` (Pfad 2a) wird zu deprecated-Fallback mit `// CMM-63 TRANSITION`-Kommentar markiert. KEINE Verhaltensänderung (claim_parties == kunde_id verifiziert) → reines Re-Sortieren + Markieren, smoke-baseline-identisch.

- [ ] Re-grep `assertKundeOwnsFall`-Caller (erwartet: 1).
- [ ] claim_parties-Pfad vor faelle.kunde_id-Pfad ziehen, faelle-Pfad als Fallback markieren.
- [ ] `npm run build` (NODE_OPTIONS=--max-old-space-size=8192) grün.
- [ ] Portal-Smoke kunde: Fall-Detail erreichbar (Owner sieht seinen Fall, Fremder 403).
- [ ] (optional) Migration Test-Drift-Fix + repair.

### PR1 — Loader `getKundeFaelle` + Ownership claim-id-fähig (additiv, nicht-brechend)

**Files:**
- Modify: `src/lib/claims/get-kunde-faelle.ts`, `src/lib/claims/kunde-ownership.ts`

**Scope:** `KundeFallView` bekommt `claim_id` verlässlich gefüllt (ist schon im Typ); neue Funktion `assertKundeOwnsClaim(admin, userId, email, claimId)` parallel zu `assertKundeOwnsFall` (claim_parties-primär, claims-Basis-Read statt faelle-Basis-Read). `assertKundeOwnsFall` bleibt als Wrapper (mappt fallId→claim_id via faelle solange faelle lebt) → keine Caller brechen. Additiv.

- [ ] Re-grep Reader-Surface.
- [ ] `assertKundeOwnsClaim` schreiben (Basis-Read `from('claims').eq('id', claimId)`, Owner via claim_parties; lead-email-Fallback via claims.lead_id).
- [ ] `assertKundeOwnsFall` → dünner Wrapper: faelle.id→claim_id auflösen, dann `assertKundeOwnsClaim`.
- [ ] build + vitest grün; Smoke baseline-identisch.

### PR2 — Route-Key-Switch `faelle/[id]` → `[id]=claim_id` + Redirect-Shim (CMM-28β/γ Kern)

**Files:**
- Modify: `src/app/kunde/faelle/[id]/page.tsx`, `.../actions.ts`, `.../_actions/*`, `.../kalender/page.tsx`, `.../beratung-actions.ts`, `.../google-review-actions.ts`
- Modify: `src/lib/claims/get-kunde-faelle.ts` (Rückgabe `id = claim.id`)
- Modify: Linkquellen (`KundeNav`, FallKarte, layout `singleFallId`/`fallOptionsForChat`)
- Add: Redirect-Shim für Alt-Bookmarks (faelle.id → claim_id)

**Scope:** `[id]` ist ab hier `claim_id`. Alle `getKundeFaelle`-Konsumenten linken auf `claim_id`. Server-Reads/Writes in der Detail-Page lösen über `claim_id` auf. Alt-Pfad `/kunde/faelle/<faelleId>`: Shim erkennt UUID-ist-faelle.id (Lookup faelle→claim_id, 308-Redirect auf claim_id) solange faelle lebt.

- [ ] Re-grep alle internen Links auf `/kunde/faelle/${...id}`.
- [ ] Detail-Page + Actions auf claim_id-Auflösung umstellen (Ownership via `assertKundeOwnsClaim`).
- [ ] Redirect-Shim + Test (alt-bookmark → 308 → claim_id).
- [ ] build + Portal-Smoke: alte URL redirected, neue URL lädt, fremder Claim 403.

### PR3 — Restliche id-Routen + kunde-Reads auf claims/Sub-Tables

**Files:** `kunde/nachbesichtigung/[fall_id]` + `actions.ts`, `kunde/termine/[id]` + `page.tsx`, `kunde/layout.tsx` (5 faelle-Queries → claims.eq(...)/claim_parties), `kunde/page.tsx`, `kunde/onboarding*`, `kunde/chat`, `kunde/_components/kb-chat-actions.ts`.

**Scope:** Pro File: `from('faelle').eq('kunde_id', user.id)` → claims-zentrierter Read (Owner-Claims via claim_parties → `claims.in('id', claimIds)` bzw. `claims.eq('geschaedigter...'）` NICHT — claim_parties join). Verbleibende faelle-only-Spalten (`fahrzeug_*`/`created_at`) als markierter Transitions-Read bis CMM-50/65.

- [ ] Pro File re-grep + Read ±20 Zeilen, dann umstellen (1 File = 1 Commit).
- [ ] build + vitest + Portal-Smoke nach jedem File-Cluster.

### PR4 — Peripher: fallId-Konsumenten auf claim_id

**Files:** `lib/notifications/fan-out.ts`, `lib/whatsapp.ts`, KB-Termin-Cron, `lib/actions/termin-actions.ts`.

**Scope:** „Wer ist der Kunde dieses Falls" → `claim_parties(geschaedigter).user_id` statt `faelle.kunde_id`; Lookups by claim_id. Caller-Signaturen ggf. fallId→claimId.

- [ ] Re-grep Konsumenten + deren Caller.
- [ ] Umstellen, build + vitest grün, Cron-Smoke (Reminder feuert, richtiger Empfänger).

### PR5 — Views (mit CMM-66 Teil 2 koordinieren)

`faelle_kunde_view` (kunde/faelle + nachbesichtigung) exponiert `f.kunde_id` + `f.fahrzeug_*`. Auf `FROM claims` re-basen — koordiniert mit CMM-66 (Views) + CMM-50 (vehicles). Hier nur kunde-relevante Views; nicht den ganzen View-Satz (CMM-66).

---

## Gates (jeder PR)
1. Re-grep Call-Sites gegen aktuellen `origin/staging` (statisches Inventar stale).
2. `information_schema` live vor jeder Migration (DB flappt — curl/PostgREST mit Retry, supabase-js hängt).
3. CLI-Migration (Regel 2), repair, LOCAL==REMOTE prüfen.
4. `npm run build` (NODE_OPTIONS=--max-old-space-size=8192) + `vitest` grün.
5. 2-Stufen-Review (additiver/maskierter Reader-Miss-Schutz).
6. Portal-Smoke kunde **+** Nachbar-Rollen (SV/Admin lesen denselben Fall) mit Screenshot.
7. PR gegen `staging`; nach Merge weiter (NICHT selbst mergen — keine Merge-Session).

## Risiken
- **Zugriffskontroll-Lockout / Daten-Leak** (höchstes): Ownership-Quelle wechselt → nach jedem PR Owner-sieht/Fremder-403-Smoke. claim_parties==kunde_id ist verifiziert, aber `claims.geschaedigter_user_id` NICHT nutzen.
- **Alt-Bookmarks** brechen ohne Redirect-Shim (faelle.id→claim_id).
- **Cross-Slice:** volle faelle-Freiheit erst nach CMM-50 (vehicles) + CMM-65 (timestamps) — Transitions-Reads markieren, im SP-L-Gate abfangen.
- **DB-Flakiness** (Cloudflare 522): Migration/Probe ggf. retryen; bei Outage Aaron DB-Neustart.
