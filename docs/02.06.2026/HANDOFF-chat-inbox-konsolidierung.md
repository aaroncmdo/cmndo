# HANDOFF — Chat-/Nachrichten-/Inbox-Konsolidierung

**Datum:** 2026-06-02
**Branch:** `kitta/chat-inbox-threads` (gestackt auf `kitta/chat-inbox-ssot`)
**Worktree:** `.claude/worktrees/chat-inbox-ssot`
**Status:** Phase 0 ✅ · P1 ✅ (code-complete, lokal gesmoket) · Reststrecke P2–P4 offen

---

## TL;DR

Das Chat-/Inbox-System war ein Patchwork (6 Kanal-Whitelists, 5 Thread-Aggregationen, fall_id-gestreut, storniert/kennzeichen aus `faelle`). Es ist jetzt **eine Schicht**: **eine** Kanal-SSoT + **ein** claim-keyed Thread-Reader, North-Star-konform (`claim_id`). Lokaler 3-Portal-UI-Smoke ist **grün**, inkl. visueller Bestätigung der drei Kanal-Entscheidungen. Offen: Merge (nicht diese Session) + Staging-Smoke + P2–P4.

---

## Das Problem (Ist-Audit)

Vollständiges Audit: **`docs/01.06.2026/chat-inbox-konsolidierung-audit.md`** (im PR). Kern:

- **6** Rolle→Kanal-Whitelists, teils **widersprüchlich** (gleiche Rolle sah je Bildschirm andere Kanäle).
- **5** dupliziert ausprogrammierte Thread-Aggregationen (inbox-threads-API + 4 Pages); **kein** DB-View dafür.
- **7** handgebaute Chat-Renderer, 5 Realtime-Konventionen, 6+ Send-Pfade / 3 Result-Shapes.
- `nachrichten` mit **beiden** Spalten `fall_id`+`claim_id`; Staff-RLS gatet `claim_id`, Code filterte `fall_id`.
- „Inbox" doppelt belegt (Chat-Threads vs `v_sv_inbox` = Embed-Leads).
- **Prod-Realität:** 11 Nachrichten gesamt (9 System-`gruppenchat`, 2 verwaiste `whatsapp`), 0 inbound, 0 echter Mensch-Chat → praktisch Greenfield.

---

## Was gebaut wurde

```
VORHER                              NACHHER
6 Rolle→Kanal-Whitelists      →     1 getInboxKanaele(rolle)   (Inbox/Triage)
                                    + getKanaeleForRolle()      (Fallakte-Decke)
5 Server-Thread-Aggregationen →     1 getChatThreads()          (claim-keyed)
fall_id-gestreut              →     claim_id (North-Star §9), fall_id nur Bridge
storniert/kennzeichen @faelle →     claims-nativ via v_claim_full
```

### Phase 0 — Kanal-SSoT (PR #2179, base `staging`)
- `src/lib/chat/kanal-routing.ts`: `getInboxKanaele(rolle)` ersetzt die 6 Whitelists (VISIBLE/KB/svKanaele/KUNDE/ADMIN/SV/KUNDE_KANAELE).
- `src/lib/communications/channels.ts`: `ChatKanal` + `CHAT_KANAELE` an DB-CHECK angeglichen (6. Kanal `chat_gruppe_mit_makler`) → `getChannelDef`-Fallback-Bug weg.
- **Aaron-Entscheidungen (01.06.):** Makler im Chat · SV sieht WhatsApp **+** internen KB-SV-Kanal · Kunde-Inbox **mit** WhatsApp („alles überblickbar").

### P1 — claim-keyed Thread-Reader (PR #2183, base `kitta/chat-inbox-ssot`)
- **`src/lib/chat/inbox-reader.ts`** — `getChatThreads(db, {userId, rolle, …})` → `ChatThread[]`:
  - Scope je Rolle: kunde=`getOwnedClaimIds` (Service-Role) · sv=`sv_id` · kb=`kundenbetreuer_id` · admin/dispatch=RLS.
  - Metadaten/Scope aus `v_claim_full` (id=claim_id, fall_id=**Transitions-Bridge**, claim_nummer, **kennzeichen**, lead_id).
  - `excludeStorniert` (null-safe: `status IS DISTINCT FROM 'storniert'`), `includeEmpty`, `lastKanal`.
  - `groupThreadsByKunde()` für die KB-Inbox.
- **Alle 5 Surfaces** nutzen den Reader: `inbox-threads`-API + `admin/nachrichten` + `mitarbeiter/nachrichten` + `gutachter/posteingang` + `kunde/chat`. Die Adapter (`ChatWithFallSidebar`/`ChatWithKundenSidebar`/`NachrichtenInboxClient`) sind **unverändert** — nur die Server-Aggregation wurde zentralisiert. **−211 LOC.**

> **Wichtige North-Star-Klarstellung (02.06.):** Ein früherer Auto-Poll wartete auf „claims.status-Cutover". Das war ein **Denkfehler** — `claims.status` ist die *sparse Terminal-Achse* (aktive Claims = NULL, springt nur bei storniert/reguliert/… an), erreicht nie „befüllt". CMM-71 war längst fertig. Beide nötigen Signale liegen in `v_claim_full` (status, kennzeichen). **Lesson:** Readiness an Daten-*Semantik* koppeln, nicht an „Spalte befüllt".

---

## Smoke-Ergebnis (lokal, Worktree-Dev-Server gegen Prod-DB, 02.06.)

Script: `scripts/smoke-chat-inbox.mjs`. Screenshots: `docs/02.06.2026/smoke-chat-inbox/`.

| Portal | Page | Ergebnis | Visuell bestätigt |
|---|---|---|---|
| **Admin** | `/admin/nachrichten` | ✅ PASS, 0 Errors | 9 claim-keyed Threads (CLM-2026-00211/00222/…), Kundennamen aus leads, Unread-Badges; **4 Tabs** (WhatsApp·Chat·Gruppe·Kunde/Gutachter); Suche „Kunde/**Kennzeichen**/Fall" |
| **SV** | `/gutachter/posteingang` | ✅ PASS, 0 Errors | **WhatsApp + Gruppe + Kunde/Gutachter + KB/Gutachter (intern)** = Entscheidung #2 ✅ |
| **Kunde** | `/kunde/chat` | ✅ PASS, 0 Errors | Fall #CLM-2026-00203, **WhatsApp**-Tab sichtbar = Entscheidung #3 ✅ |

Plus **Daten-Smoke** (Query-Simulation des Admin-Readers): 9 Threads mit korrektem claim_nummer/fall_id/kennzeichen/unread/kanaele aus `v_claim_full`-Join; die 2 verwaisten WhatsApp (ohne claim_id) korrekt ausgeschlossen.

**Nicht gesmoket:** KB (`/mitarbeiter/nachrichten`) + Makler — es gibt keinen lokalen Test-User dafür. Code-pfadgleich zu den anderen; auf Staging nachholen.

---

## Gefundener Issue (kein P1-Regression)

- **„Invalid Date" bei leeren Threads** (Thread ohne Nachricht → `lastAt=''` → `new Date('')`). Sichtbar auf SV-Posteingang (alle Threads leer) + Kunde. **Pre-existing** (alter Code erzeugte dieselben Empty-Threads mit `lastAt=''`); liegt im shared `ChatInboxLayout`/Sidebar-Date-Format, das ich bewusst nicht angefasst habe. Quick-Win → siehe Aufgaben.

---

## Schlüssel-Dateien

| Datei | Rolle |
|---|---|
| `src/lib/chat/kanal-routing.ts` | Kanal-SSoT (`getInboxKanaele` + `getKanaeleForRolle`) |
| `src/lib/communications/channels.ts` | `ChatKanal` + `CHAT_KANAELE` (= DB-CHECK) |
| `src/lib/chat/inbox-reader.ts` | **claim-keyed Thread-Reader** (`getChatThreads`, `groupThreadsByKunde`) |
| `src/app/api/chat/inbox-threads/route.ts` | FAB-Badge, dünner Wrapper um den Reader |
| `src/app/{admin/nachrichten,mitarbeiter/nachrichten,gutachter/posteingang,kunde/chat}/page.tsx` | 4 Inbox-Pages, repointet |

---

## Offene Aufgaben

### Sofort / Merge (Merge-Session, NICHT diese Session)
1. **Merge-Reihenfolge:** erst **#2179** → `staging` (Phase 0), dann **#2183** Base auf `staging` umhängen → mergen (P1). #2183 ist auf #2179 gestackt.
2. **Staging-Smoke** nach Deploy: alle 4 Portale + zusätzlich **KB** (`/mitarbeiter/nachrichten`) und **Makler** (lokal kein Test-User). Kanal-Sichtbarkeit + Thread-Listen + Unread-Badges.

### Quick-Win
3. **„Invalid Date"-Fix** im shared `ChatInboxLayout` (bzw. den Sidebar-Adaptern): leeren `lastAt` abfangen → `'—'` statt `Invalid Date`. Pre-existing, trifft alle Inbox-Surfaces.

### Reststrecke (Audit §5)
4. **P2 — ein `<ChatThread>`-Primitive:** die 7 handgebauten Renderer (MultiChannelChat/ChatTimelineView/KundeKbChat/FokusChatPanel/MaklerChatTab/ChatChannel + SupportChat-separat) kollabieren; **eine** Realtime-Channel-Konvention (`chat:claim:${claimId}`), **ein** Mark-Read-Util, **ein** Unread-Util.
5. **P3 — ein Send-Pfad:** `sendChatMessage()` als einziger Chat-Sender mit `{ ok }`; RLS-Triple-Stack auf `nachrichten` konsolidieren; tote `portal-*`-Kanäle droppen; **fall_id→claim_id Write/Realtime-Cutover = CMM Track 2 §E** (koordiniert mit der CMM-Strecke, nicht solo).
6. **P4 — View-/Vokabular-Hygiene:** `v_sv_inbox` umbenennen (z. B. `v_sv_anfragen_inbox`, „Inbox" doppelt belegt); Bell-SSoT `mitteilungen` (North-Star §7); ggf. DB-View `v_chat_threads`.
7. **Optional — Makler-Kanal scharf:** `chat_gruppe_mit_makler` hat 0 Rows (Totgeburt); `getInboxKanaele('makler')` ist bereit. Writer aktivieren oder bei `gruppenchat` belassen.

---

## Referenzen

- **Audit (Ist-Zustand + 5-Phasen-Plan):** `docs/01.06.2026/chat-inbox-konsolidierung-audit.md`
- **North-Star-Datenmodell:** `docs/superpowers/specs/2026-05-31-claimondo-datenmodell-northstar.md` (nachrichten = bleibende Chat-Sub-Entity §1/§7; claim_id-Kanon §9; RLS claim-scoped §8)
- **CMM faelle-Drop Master-Plan:** PR/Issue **#2118** (Track 2) — der `fall_id`-Tod (§E) ist die Heimat des P3-Cutovers
- **PRs:** #2179 (Phase 0) · #2183 (P1)
- **Memory:** `project_chat_inbox_konsolidierung.md` (voller Verlauf + Entscheidungen + Lessons)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
