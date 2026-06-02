# AAR-956 Phase A — `/start/[anfrageId]` (anon Konversion + kanonischer FlowLink-Issue)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development oder executing-plans.

**Branch:** `kitta/aar-956-phase-a-start` (off staging) · **Ticket:** AAR-956 · **Blockt:** Phase B (Marketing).
**Kontrakt (gelockt, AAR-956-Kommentar 21:17 + Phase-B commit `09ae79bff`):**
- Route **`/start/[anfrageId]?exp=<unixSek>&sig=<hex>`** (anon, Main-App).
- `signedString = ${anfrageId}.${exp}` · `sig = HMAC_SHA256(signedString, START_LINK_HMAC_SECRET).digest('hex')` (lowercase) · `exp` = Unix-**Sekunden**.
- Verify: `exp`+`sig` aus Query → HMAC mit `exp` **unverändert** neu bilden → `crypto.timingSafeEqual` → ablehnen wenn `exp < nowSeconds`.
- Aktion: (1) gfa-Anfrage→Lead (kanonisch, `zugewiesen_an = Dispatcher` Round-Robin, `zugeordneter_sv_id`+Besichtigungsort durchreichen), (2) EIN `flow_links`-FlowLink mint + **einfacher** Initial-Link-Versand, (3) Redirect `/flow/[token]`.
- **Kein Prod-Impact** bis Phase B `CANONICAL_FLOWLINK_ENABLED` flippt (nach Review). @Aaron setzt `START_LINK_HMAC_SECRET` (gleicher Wert) in Main- + Marketing-ENV.

**Goal:** Ein anon, HMAC-gateter Main-App-Einstieg, der eine Monika-Anfrage konversion-first in einen dispatcher-eigenen Lead + den EINEN kanonischen FlowLink verwandelt.

---

## Task 1: HMAC-Verify-Helper (TDD)
**Files:** Create `src/lib/start-link/verify-sig.ts` + Test `src/lib/start-link/__tests__/verify-sig.test.ts`
- `verifyStartSig({ anfrageId, exp, sig }): { ok: true } | { ok: false; reason: 'bad_sig'|'expired'|'missing_secret'|'malformed' }`.
- `const expected = 'sha256'? nein — nur hex` → `createHmac('sha256', secret).update(\`${anfrageId}.${exp}\`).digest('hex')`; `timingSafeEqual(Buffer.from(sig,'hex'), Buffer.from(expected,'hex'))` (Längen-Guard vorher, sonst wirft timingSafeEqual); `Number(exp) >= Math.floor(nowMs/1000)`.
- Secret aus `process.env.START_LINK_HMAC_SECRET`; fehlt → `{ok:false, reason:'missing_secret'}` (fail-closed).
- **Pure** (kein server-only) → vitest. Tests: known-vector (fixe anfrageId+exp+secret → erwarteter hex), bad sig, abgelaufenes exp, fehlendes Secret, Längen-Mismatch (kein throw).

## Task 2: Round-Robin-Dispatcher-Picker
**Files:** Create `src/lib/start-link/pick-dispatcher.ts`
- `pickRoundRobinDispatcher(db): Promise<string|null>` (profile_id eines aktiven Dispatchers).
- **Zu pinnen:** Dispatcher-Rolle = `'dispatch'` (Memory: Dispatch-Rolle) — verifizieren via `profiles.rolle`. Strategie: Dispatcher mit den **wenigsten offenen** (`status` nicht terminal) zugewiesenen Leads; Tie → zufällig/ältester. Fallback `null` (Lead bleibt `zugewiesen_an=null` → erscheint trotzdem in der Dispatch-Queue).
- **Zu pinnen:** ob es schon einen Picker gibt (Migration `convert_round_robin_dispatch` ist in die Baseline gesquasht → Logik aus Baseline ablesen + ggf. wiederverwenden statt neu).

## Task 3: Anon kanonischer Issue-Pfad
**Files:** Create `src/lib/start-link/issue-canonical-flowlink.ts` (server-only)
- `issueCanonicalFlowLinkForAnfrage(anfrageId): { ok:true; token; leadId; kanal } | { ok:false; error }` via `createAdminClient`.
- Ablauf: gfa laden → **Idempotenz** (hat sie schon `konvertiert_zu_lead_id` + gültigen flow_link → reuse) → Lead INSERT (Felder aus gfa: vorname/nachname/telefon/email/schadentyp/kennzeichen/besichtigungsort_adresse + lat/lng/`zugeordneter_sv_id`/ga_client_id; `source_channel`='monika_embed'|cluster; `status='neu'`; **`zugewiesen_an` = pickRoundRobinDispatcher**; `service_typ`) → `gfa.konvertiert_zu_lead_id` setzen → `flow_links` INSERT (lead_id, expires_at +72h, service_typ, sprache) → **einfachen** Link senden.
- **Versand (Wrinkle 1):** NICHT `flowlink_versand` (braucht SV+Termin). Stattdessen Plain-Text wie `issueSelfServiceFlowLink.buildText` aber URL = `${APP}/flow/${token}` (WA via `sendWhatsAppText`/`sendNachricht`, Email-Fallback `sendEmail`). Best-effort, non-fatal.
- **Zu pinnen:** existiert `createLead`-Helper (Phase-B-Plan referenziert ihn)? Wenn ja → nutzen statt Raw-INSERT (kanonisch). Lead-Pflichtfelder/CHECKs (analog `convert_embed_anfrage_zu_lead`-Mapping: schadentyp-Enum-Clamp!).

## Task 4: `/start/[anfrageId]`-Route
**Files:** Create `src/app/start/[anfrageId]/route.ts` (GET, `dynamic='force-dynamic'`)
- Query `exp`+`sig` lesen → `verifyStartSig` → fail → `redirect('/?startlink=ungueltig')` (oder dedizierte Fehlerseite).
- ok → `issueCanonicalFlowLinkForAnfrage(anfrageId)` → fail → redirect Fehler; ok → `redirect(\`/flow/${token}\`)` (307).
- Anon: KEIN auth-Gate. Rate-Limit via bestehendem `check_gfa_rate_limit` (IP-hash) optional.

## Task 5: Build-Gate + Test-SV-Smoke
- `tsc --noEmit` + vitest (Task 1).
- **Smoke (Test-SV, kein echter Gutachter — Memory-Regel):** Test-Embed-Site/anfrage (wie Stream-7-Smoke) → signierten `/start`-URL bauen (mit dem ENV-Secret) → aufrufen → verifizieren: Lead erzeugt (`zugewiesen_an`=Dispatcher, `zugeordneter_sv_id` durchgereicht), `flow_links`-Token gemintet, Redirect `/flow/[token]`, /flow lädt. Danach Cleanup (0 Reste).
- **Smoke-Voraussetzung:** `START_LINK_HMAC_SECRET` muss auf staging gesetzt sein (sonst missing_secret).

## Task 6: PR + Signal
- PR gegen `staging` (7-Punkte-Audit). Build-Gate grün.
- AAR-956-Kommentar an Phase B: „`/start` auf staging + reviewbar" → sie smoket den vollen Pfad + flippt das Flag.

## Non-Goals
- §3a Slot/SV-Logik im `/flow` (cdd8f4f3/termin-engine-Lane) — Phase A füttert nur Lead-State.
- `/anfrage/[token]`-Deprecation (Phase C, cdd8f4f3).

## Offene Pin-Punkte (Task-1..3-Start)
1. Dispatcher-Rolle-Wert + Round-Robin-Quelle (Baseline-Logik reuse?).
2. `createLead`-Helper vorhanden? Lead-Pflichtfelder + schadentyp-Enum.
3. `flow_links`-Spalten + ob `/flow` mit lead-only (ohne Termin) sauber startet (datengetrieben — cdd8f4f3 baut den Slot-Step; bis dahin könnte `/flow` einen termin-losen Lead noch nicht voll rendern → Smoke deckt's auf, ggf. mit cdd8f4f3 koordinieren).
