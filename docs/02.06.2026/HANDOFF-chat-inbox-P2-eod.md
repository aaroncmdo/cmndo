# HANDOFF — Chat-Inbox-Konsolidierung: P2 DONE + Reststrecke (EOD 02.06.2026)

**Worktree:** `.claude/worktrees/chat-inbox-ssot`
**Branch (P2):** `kitta/chat-inbox-thread-primitive` (HEAD = Smoke-Commit `c9646ba15`)
**Status:** Phase 0 ✅ · P1 ✅ · **P2 ✅ (code-complete + lokal gesmoket)** · P3/P4 offen
**Voller Verlauf/Entscheidungen:** Memory `project_chat_inbox_konsolidierung.md`

---

## TL;DR
Das Chat-System ist von **7 handgebauten Renderern** auf **eine Schicht** geschrumpft:
**eine Kanal-SSoT** (P0) + **ein claim-keyed Thread-Reader** (P1) + **ein headless Engine-Hook
`useChatThread` + 3 Shells + Parts** (P2). Alles `tsc`/Gate-grün + Cross-Portal-Smoke grün.
Offen: **Merge** (Merge-Session) → **Staging-Nachzug-Smoke** (2 Surfaces) → **P3** (claim_id-Cutover, DB)
→ **P4** (View-Hygiene).

---

## PR-/Branch-Stack (WICHTIG: Merge-Reihenfolge)

```
staging
 └─ #2179  kitta/chat-inbox-ssot            P0 Kanal-SSoT (getInboxKanaele)
     └─ #2183  kitta/chat-inbox-threads     P1 Thread-Reader (getChatThreads) + P1-BUILD-FIX (3e80c456e)
         └─ #2241  kitta/chat-inbox-thread-primitive   P2 <ChatThread>-Primitive   ← diese Session

unabhängig gegen staging:
 #2224  kitta/chat-inbox-invalid-date       Quick-Win: ChatInboxLayout "Invalid Date" -> formatInboxTime
```

**Merge-Session, in DIESER Reihenfolge:** #2179 → (Base #2183 auf staging umhängen) #2183 → (Base #2241 auf staging) #2241. **#2224 jederzeit separat** gegen staging.
**ACHTUNG #2183:** dessen `build` war **rot** und wurde von mir gefixt (Commit `3e80c456e` liegt AUF `kitta/chat-inbox-threads`). Vor Merge: CI-`build` von #2183 grün prüfen (`gh pr checks 2183`).

---

## Was P2 baute (Architektur-Referenz für P3/P4)

```
src/lib/chat/thread/         (pure, vitest — 16 Tests grün)
  scope.ts        ChatScope = {kind:'fall', fallIds[], kanaele[]} | {kind:'kanal-allowlist', kanal, senderAllowlist[]}
                  + buildThreadFilter / buildChannelName / matchesScope
  mark-read.ts    buildMarkReadSpec (fall: fall_id+kanal+sender≠me | kanal-allowlist: kanal+empfaenger=me)
  reducer.ts      chatReducer: loaded/realtimeInsert(dedup)/optimisticAdd/sendResolved(id-swap+echo-dedup)/sendFailed
  send-normalize.ts  ChatSendInput/Result/Sender + normalizeLegacyResult
  send-strategies.ts standardSender / kundeSender / maklerSender (-> {ok, messageId?})

src/components/chat/thread/  ('use client')
  useChatThread.ts  ENGINE: Load + EINE Realtime-Konvention (chat:fall: / chat:kanal: + useId-Guard)
                    + optimistic Send + markReadOnView + unreadByKanal + endRef/auto-scroll
                    -> MSG_SELECT bewusst OHNE claim_id (fall_id-keyed in P2)
  mark-read-exec.ts standardMarkRead (Browser-Client)
  MessageBubble.tsx variant tint|avatar|plain + System-Pill + Attachment
  ChatComposer.tsx  Enter-to-send + extras (ReactNode | (sendText)=>ReactNode für tap-to-send)
  KanalTabBar.tsx   Tabs aus getChannelDef + DropletBadge
  DateSeparator.tsx
  ChatThreadTabs.tsx       <- MultiChannelChat (4 Mounts: ChatWindowPanel/KommunikationTab/ChatWithFallSidebar/NachrichtenInboxClient)
  ChatThreadTimeline.tsx   <- ChatTimelineView (ChatWithKundenSidebar)
  ChatThreadStream.tsx     Compact-Basis (props: scope, send, bubbleVariant, withDateSeparators, composerExtras, readOnly, sendKanal/sendFallId/sendEmpfaengerId)
                           <- KundeKbChat (slim-Wrapper, 416->159) + FokusChatPanel-innen + MaklerChatTab-innen
```
`ChatChannel.tsx` (tot, 0 Mounts) **gelöscht**.

**Bewusste Deltas (alle dokumentiert in Commits + smoke-MD):** optimistic-Send überall · Fokus mark-read-on-view (vorher nie) · **entfallen:** Fokus-Undo-Toast (nicht auf Shared-Engine abbildbar), Makler-Avatar+Name (→ Rolle-Label via variant=tint), Kunde-per-Bubble-Fall-Link (Senden-mit-Fall-Bezug via Composer-Picker bleibt). Makler `readOnly=false` (Consent ist server-seitig in `maklerSendMessage`, MaklerChatTab kennt Consent nicht client-seitig).

---

## OFFEN — priorisiert

### 1. Merge (Merge-Session, NICHT eine normale Session)
Reihenfolge oben. #2183-build vorher grün verifizieren.

### 2. Staging-Nachzug-Smoke (nach Deploy)
Lokal NICHT erreichbar (Daten-Voraussetzung), darum auf Staging:
- **FokusChatPanel** (SV-Feldmodus): braucht eine **aktive SV-Tages-Session**, sonst Redirect → `/gutachter/heute`. Mit Session: Sheet öffnen → Stream + Quick-Replies prüfen.
- **Makler-Chat** (per-Akte): braucht eine **Akte mit Vollzugriff-Consent** (`makler_fall_consent.consent_scope='vollzugriff'`). Dann `/makler/akten/<id>` → Chat-Tab.
- Beide nutzen `ChatThreadStream` — lokal via Kunde-Chat-Tab (Stream) + Tabs/Timeline (gleiche Engine+Parts) **schon validiert**, also Low-Risk.
- Smoke-Tooling: `scripts/smoke-chat-thread.mjs` (8 Surfaces, env `SMOKE_BASE_URL`) + `scripts/smoke-stream-kunde.mjs`. Test-User je Rolle: `test-{admin,kb,sv,kunde,makler}@claimondo.de`, PW `Test1234!`, 2FA aus.

### 3. P3 — claim_id-Cutover + RLS + 1 DB-Send-Pfad (DB/koordinationslastig)
Das ist **CMM Track 2 §E** — koordiniert mit der CMM-Strecke, NICHT solo.
- **Heute fall_id-keyed:** `useChatThread.MSG_SELECT` ohne claim_id; `buildChannelName` = `chat:fall:` (→ flip auf `chat:claim:`); `send-strategies` INSERTen `fall_id`; `inbox-reader` führt `fall_id` als **Transitions-Bridge** (Kommentar im File).
- **RLS-Inkonsistenz:** `nachrichten`-Policy `staff_fall_scoped` gatet `can_access_claim(claim_id)`, der App-Code filtert aber `fall_id` → Zeilen mit `claim_id IS NULL` für Nicht-Admin-Staff unsichtbar. **2 verwaiste `whatsapp`-Zeilen** (ohne fall_id/claim_id) backfillen.
- **Send-Pfade:** 3 Server-Actions (sendChatMessage/sendKundeChatMessage/maklerSendMessage) — DB-seitig auf **einen** zusammenführen, immer `claim_id` setzen, tote `portal-*`-Kanäle droppen.
- Refs: North-Star `docs/superpowers/specs/2026-05-31-claimondo-datenmodell-northstar.md` (§8 RLS claim-scoped, §9 claim_id-Kanon) · #2118 (CMM faelle-Drop Track 2).

### 4. P4 — View-/Vokabular-Hygiene
- `v_sv_inbox` umbenennen (z.B. `v_sv_anfragen_inbox`) — „Inbox" doppelt belegt (Chat-Threads vs Embed-Leads).
- Bell-SSoT `mitteilungen` (North-Star §7). Optional DB-View `v_chat_threads`.

### 5. Pre-existing Funde (NICHT P2, eigene Tickets)
- **„Rendered more hooks" auf `/gutachter/heute`** (im Smoke aufgetaucht): Redirect-Ziel ohne SV-Session. P2-Chat-Code ist dort nicht gemountet (FAB rendert ChatThreadTabs nur bei geöffnetem Chat). Eigener Follow-up wert — heute-Render-Pfad hat eine konditionale-Hooks-Stelle.
- **„Invalid Date"** im Inbox-Sidebar = `ChatInboxLayout` → Fix in **#2224** (separat).

---

## Gotchas / Lessons
- **Handoff-„grün" ≠ build-grün:** P1 (#2183) war als „tsc grün" dokumentiert, war aber **rot** (uncommitted Types). Immer `gh pr checks` glauben, nicht den Handoff-Text. (→ Memory `feedback_pr_state_nicht_production_stand`.)
- **Types-Fix chirurgisch, nicht voller Regen:** bei 11 parallelen Sessions hätte `generate_typescript_types` fremde Schema-Drift reingezogen — stattdessen `nachrichten.claim_id` per Hand in `database.types.ts` (live via information_schema verifiziert).
- **component-set --ratchet** flaggt handgerollte `bg-white rounded-* border`-Cards als NEUE Verletzer → in den Shells `primitives.Card p={0}` statt div.
- **`$?` nach Pipe** misst `tail`, nicht das Script — `--ratchet`-Exit separat prüfen.
- Smoke: Dev-Server lazy-kompiliert → erste Logins flaken (cold), 2. Lauf warm grün. Immer Screenshots im selben Turn auswerten.

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
