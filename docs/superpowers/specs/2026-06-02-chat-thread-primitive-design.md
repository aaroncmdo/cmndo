# Design: `<ChatThread>`-Primitive (Chat-Inbox-Konsolidierung P2)

**Datum:** 2026-06-02
**Status:** Design approved (Aaron, 02.06.) — Spec
**Branch:** `kitta/chat-inbox-thread-primitive` (gestackt auf `kitta/chat-inbox-threads` / #2183)
**Scope-Entscheidung (Aaron):** Voll-Collapse aller lebenden Renderer in einer Strecke.
**Architektur-Entscheidung (Aaron):** Approach A — headless Engine-Hook + dünne Layout-Shells + geteilte Parts.

**Referenzen:**
- Audit (Ist-Zustand + 5-Phasen-Plan): `docs/01.06.2026/chat-inbox-konsolidierung-audit.md` (§4 Soll, §5 Phase 2)
- Handoff (Stand P0/P1): `docs/02.06.2026/HANDOFF-chat-inbox-konsolidierung.md` (Aufgabe P2)
- Interface-Map der 6 Renderer: im Brainstorm dieser Session erhoben (Agent), Fakten unten eingearbeitet
- North-Star-Datenmodell: `docs/superpowers/specs/2026-05-31-claimondo-datenmodell-northstar.md` (claim_id-Kanon §9, RLS §8)
- PRs der Strecke: #2179 (P0 Kanal-SSoT), #2183 (P1 Thread-Reader)

---

## 1. Problem

Heute existieren **6 handgebaute Chat-Renderer** auf einer einzigen Tabelle (`nachrichten`), mit
**5 Realtime-Konventionen, 4 Mark-Read-Mechanismen, 4 Send-Pfaden** (`{success}` vs `{ok}` vs throw)
und 4 Bubble-Stylings. Das ist das in Audit §2.2-§2.3 / I5 dokumentierte Patchwork. Der Datenstand
ist praktisch leer (~0 echter Chat), der Umbau also risikoarm — jetzt ist der richtige Zeitpunkt.

**Befund der Interface-Map (entscheidet das Design):**
- `ChatChannel.tsx` ist **tot** (0 Mount-Sites) → wird gelöscht, nicht migriert. Effektiv **5 lebende Renderer**.
- Bereits einheitlich: dieselbe `nachrichten`-Tabelle, derselbe Realtime-Mechanismus (nur Name+Filter
  variieren), Auto-Scroll, Enter-to-send, SendIcon-Composer.
- Echte Divergenz auf 4 Achsen: **Scope** (single fall / fall-array / kanal+sender-allowlist),
  **Layout** (Tabs / Timeline / Compact-Sheet / Date-Separators), **Mark-Read** (4 Varianten),
  **Send** (4 Pfade).
- **`KundeKbChat` ist der Outlier:** nicht fall-gekeyt, sondern `kanal` + Sender-ID-Allowlist;
  Mark-Read über `empfaenger_id`. Ein naiver Einzel-Komponenten-Ansatz kann das nicht ohne Verrenkung.
- Der **gesamte Renderer-Stack ist `fall_id`-gekeyt** (kein Renderer referenziert `claim_id`; claim_nummer
  nur als Display-Label).

---

## 2. Ziel & Nicht-Ziel

**Ziel:** Eine Schicht für den Chat-*Thread*: ein headless Engine-Hook + 3 Layout-Shells + geteilte
Parts. Alle 5 lebenden Renderer sitzen darauf; ihre legitimen Unterschiede werden über
**Scope-Deskriptor / injizierte Strategien / Layout-Shell** ausgedrückt — nicht über 5 Re-Implementierungen.

**Nicht-Ziel (bewusst ausgeklammert):**
- **`fall_id` → `claim_id` Realtime/Write-Cutover** = P3 / CMM Track 2 §E. P2 bleibt `fall_id`-gekeyt.
  (Die Thread-*Liste* ist via P1-Reader bereits claim-keyed; der *Renderer* folgt erst in P3.)
- **SupportChat** (`components/support/SupportChat.tsx`) — eigenes Backend, kein `nachrichten`. Bleibt.
- **`GlobalPosteingangFab`** Realtime-Channel `global-inbox-${userId}` — Listen-Refetch, kein Thread-Renderer. Unangetastet.
- **RLS-Konsolidierung / claim_id-Backfill / Send-Pfad-Vereinheitlichung auf DB-Ebene** = P3.
  (P2 normalisiert nur die App-seitigen Send-*Rückgaben* auf `{ok}` via Adapter; die Server-Actions selbst bleiben.)

---

## 3. Architektur (Approach A)

```
src/lib/chat/thread/                 (pure, vitest-testbar, server-safe)
  scope.ts          ChatScope-Typ + buildThreadFilter + buildChannelName + matchesScope
  mark-read.ts      buildMarkReadSpec(scope, userId)  (reine WHERE-Spezifikation)
  send-strategies.ts  Adapter: sendChatMessage/sendKundeChatMessage/maklerSendMessage -> {ok, messageId?}

src/components/chat/thread/          ('use client')
  useChatThread.ts  ENGINE: load, realtime(subscribe+cleanup), dedup, optimistic+rollback,
                    markRead-on-view, unreadByKanal, scrollRef
  ChatThreadTabs.tsx       Shell  (<- MultiChannelChat)
  ChatThreadTimeline.tsx   Shell  (<- ChatTimelineView)
  ChatThreadStream.tsx     Shell-Basis fuer Compact (<- KundeKbChat/Fokus/Makler-Inneres)
  MessageBubble.tsx        variant: 'tint' | 'avatar' | 'plain'  (+ Attachment + System-Pill)
  ChatComposer.tsx         Textarea + SendIcon + Enter-to-send + extras-Slot
  KanalTabBar.tsx          Tabs aus getChannelDef + Unread-Badges
  DateSeparator.tsx
```

### 3.1 Scope-Deskriptor (das Herz)

```ts
type ChatScope =
  | { kind: 'fall';            fallIds: string[]; kanaele: ChatKanal[] }
  | { kind: 'kanal-allowlist'; kanal: ChatKanal;  senderAllowlist: string[] }
```

- `kind:'fall'` deckt MultiChannelChat (fallIds=[einer]), ChatTimelineView (fallIds=[viele]),
  FokusChatPanel (fallIds=[einer], kanaele=['chat_kunde_sv']), MaklerChatTab (fallIds=[einer],
  kanaele=['gruppenchat','chat_gruppe_mit_makler']).
- `kind:'kanal-allowlist'` deckt KundeKbChat (kanal fix, Filter über Sender-ID-Menge; `fall_id` nur
  Per-Message-Tag, **nicht** im Query-Filter).

**Pure Builder (`scope.ts`):**
- `buildThreadFilter(scope)` → Parameter für das initiale `nachrichten`-Select
  (`fall`: `.in('fall_id', fallIds).in('kanal', kanaele)`; `kanal-allowlist`: `.eq('kanal', kanal)`).
- `buildChannelName(scope, instanceId)` → Realtime-Channel-Name (siehe 3.2).
- `matchesScope(row, scope)` → client-seitiger Filter (Multi-Fall: `fallIds.includes`; Allowlist:
  `senderAllowlist.includes(sender_id)`; immer `kanaele/kanal`-Check).

### 3.2 Realtime (5 → 1 Konvention)

Ein einziger Subscribe/Cleanup im Hook. Name aus `buildChannelName`:
- `kind:'fall'` → `chat:fall:${fallIds.join(',')}:${instanceId}`
- `kind:'kanal-allowlist'` → `chat:kanal:${kanal}:${userId}:${instanceId}`

`instanceId = useId()` (Strict-Mode-Guard, den FokusChatPanel bereits nutzt — generalisiert; siehe
Memory „Supabase-Realtime Channel-IDs"). `postgres_changes` INSERT auf `nachrichten`; **Server-Filter**
`fall_id=eq` nur bei genau einem fallId, sonst **kein** Server-Filter + `matchesScope` client-seitig
(Supabase kann kein `IN`-Filter — wie ChatTimelineView heute schon). **`fall:`-Namespace bleibt in P2;
P3 flippt auf `claim:`.**

### 3.3 Mark-Read (4 → 1)

`buildMarkReadSpec(scope, userId)` (pure) liefert die WHERE-Spezifikation. Die Ausführung läuft über
eine **injizierte Strategie** `markRead?(scope, userId)` (parallel zu `send`), mit zwei Default-Impls —
Standard-Client für `kind:'fall'`, Admin-Client für den Kunde-Pfad (`kind:'kanal-allowlist'`):
- `kind:'fall'` → `fall_id IN ∧ kanal IN ∧ gelesen=false ∧ sender_id≠userId` (verallgemeinert `markMessagesRead`).
- `kind:'kanal-allowlist'` → `kanal=eq ∧ empfaenger_id=userId ∧ gelesen=false` (erhält KundeKbChat-Keying).

Trigger: on-load + on-inbound-realtime. **`markReadOnView` ist eine Hook-Option (default `true`)** —
siehe §5 (FokusChatPanel-Delta).

### 3.4 Send (4 → injizierte Strategie, normalisiert auf `{ok}`)

Hook-Option `send: (input) => Promise<{ ok: boolean; error?: string; messageId?: string }>`.
Adapter in `send-strategies.ts` wrappen die bestehenden Server-Actions:
- `sendChatMessage` (`{success}`→`{ok}`; **erhält neu `messageId`** via `.select('id')`).
- `sendKundeChatMessage` (bereits `{ok}` + messageId, Admin-Client).
- `maklerSendMessage` (`{success,messageId}`→`{ok}`; Consent-Gate bleibt im Adapter/Consumer).

Der Hook macht **optimistic add + rollback + id-swap** einheitlich (§5).

### 3.5 Unread

`unreadByKanal` wird aus den geladenen Messages abgeleitet (`gelesen=false ∧ sender_id≠me`, gruppiert
nach `kanal`) — speist die Tab-Badges von `ChatThreadTabs`. Andere Shells ignorieren es. (Die
Thread-*Listen*-Unread der Inbox kommt weiterhin aus dem P1-Reader `getChatThreads`, separat.)

---

## 4. Shells & Consumer-Mapping

| Alt-Renderer | Neu | Consumer (Mount) | Migration |
|---|---|---|---|
| **MultiChannelChat** (305) | `<ChatThreadTabs>` | ChatWindowPanel · KommunikationTab · ChatWithFallSidebar · NachrichtenInboxClient | 4 Mounts auf Shell umstellen, Props ~gleich; dann löschen |
| **ChatTimelineView** (255) | `<ChatThreadTimeline>` | ChatWithKundenSidebar | 1 Mount umstellen; dann löschen |
| **KundeKbChat** (416) | Wrapper über `<ChatThreadStream>` | KundenbetreuerCard · GutachterCard | `kind:'kanal-allowlist'`, `bubbleVariant='avatar'`, composer-extras=Bezug-Fall-Picker |
| **FokusChatPanel** (344) | Sheet-Chrome bleibt; Innen `<ChatThreadStream>` | FeldmodusClient | Bottom-Sheet + Quick-Replies bleiben Consumer-Chrome; Innen Engine |
| **MaklerChatTab** (416) | Consent/Banner bleibt; Innen `<ChatThreadStream>` | MaklerAkteDetail | `withDateSeparators`, `bubbleVariant='avatar'`, `send=maklerSend` |
| **ChatChannel** (92) | **gelöscht** | — (0 Mounts) | Dead-Code-Removal (+ knip-Baseline senken) |

`<ChatThreadStream>` ist die Compact-Basis und nimmt **wenige fokussierte Präsentations-Props**
(`bubbleVariant`, `withDateSeparators`, `composerExtras`, plus die Engine-Optionen `scope/send/markReadOnView`).
Die schwere Consumer-Chrome (Fokus-Sheet, Makler-Consent-Banner, Kunde-iMessage-Avatare) bleibt im
jeweiligen dünnen Wrapper — so wird weder die Basis zur Flag-Suppe noch ein Consumer zur Re-Implementierung.

Die 3 Sidebar-Adapter (`ChatWithFallSidebar`/`ChatWithKundenSidebar`/`NachrichtenInboxClient`) teilen
sich bereits `ChatInboxLayout` (Listen-Chrome); sie unterscheiden sich nur im `renderDetail`-Renderer +
Prop-Mapping → minimale Änderung.

---

## 5. Bewusste Verhaltens-Deltas (beide adoptiert, Aaron 02.06.)

1. **Optimistic Send überall.** Heute nur Kunde/Makler optimistic; MultiChannel/Timeline/Fokus warten auf
   Realtime-Echo. Vereinheitlichung = optimistic + rollback + id-swap für alle (sicher via id-Dedup;
   braucht `messageId` aus `sendChatMessage`). Konsistente, snappy UX.
2. **FokusChatPanel markiert read-on-view.** Heute clear't Feldmodus Unread nie. Engine-Default
   `markReadOnView=true` → korrekt (Ansehen = gelesen). (Beide Deltas sind via Hook-Option abschaltbar,
   falls ein Consumer das Alt-Verhalten doch braucht.)

---

## 6. Migrations-Reihenfolge (eine Strecke, reviewbare Commits)

1. **Pure Layer** (`lib/chat/thread/`): `scope.ts`, `mark-read.ts`, `send-strategies.ts` — **TDD**.
2. **Engine** `useChatThread.ts` + geteilte Parts (`MessageBubble`, `ChatComposer`, `KanalTabBar`, `DateSeparator`).
3. **`<ChatThreadTabs>`** + die 4 MultiChannelChat-Mounts umstellen → MultiChannelChat löschen.
4. **`<ChatThreadTimeline>`** + ChatWithKundenSidebar umstellen → ChatTimelineView löschen.
5. **`<ChatThreadStream>`** + KundeKbChat-Wrapper (2 Cards) → KundeKbChat-Altcode löschen/abspecken.
6. **FokusChatPanel** + **MaklerChatTab** auf `<ChatThreadStream>` innen umstellen.
7. **`ChatChannel.tsx` löschen** + knip-Baseline aktualisieren.
8. `sendChatMessage` um `messageId` erweitern (Schritt 1-begleitend, da Adapter es braucht).

Jeder Schritt: `tsc --noEmit` grün halten.

---

## 7. Verifikation

- **`tsc --noEmit`** grün (Worktree-Gate; `next build` OOMt im verschachtelten Worktree — bekannt).
- **Vitest** (TDD-Targets): die 4 pure Builder (`buildThreadFilter`, `buildChannelName`, `matchesScope`,
  `buildMarkReadSpec`) + die Send-Normalizer + die Engine-Reduzierlogik (Load/Realtime-Insert/Dedup/
  optimistic-rollback) so weit headless testbar (Realtime/Supabase via dünnem Inject/Fake).
- **Cross-Portal-Smoke (Pflicht, Screenshots):** Admin-Nachrichten · KB-Inbox (`/mitarbeiter/nachrichten`)
  · Fallakte-KommunikationTab · SV-Feldmodus · Kunde (`/kunde` Karten) · Makler-Akte. Pro Surface:
  rendert fehlerfrei, 0 Console-Errors, Senden/Empfangen (Realtime) ok, Kanal-Sichtbarkeit korrekt.
  (Prod ~greenfield → Laufzeitrisiko niedrig, aber Fläche breit.)

---

## 8. Akzeptanzkriterien

- [ ] Ein Engine-Hook `useChatThread`; **kein** Renderer subscribed/markiert/sendet mehr selbst inline.
- [ ] Eine Realtime-Namenskonvention (`chat:fall:` / `chat:kanal:` + `useId()`), ein Subscribe/Cleanup.
- [ ] Ein Mark-Read-Pfad (2 Keying-Modi via Scope), ein Unread-Util.
- [ ] Alle Send-Pfade liefern `{ok}` (Adapter); optimistic überall; FokusChat read-on-view.
- [ ] 5 lebende Renderer ersetzt; `MultiChannelChat`/`ChatTimelineView`/`KundeKbChat`(-Altcode) gelöscht;
      `FokusChatPanel`/`MaklerChatTab` nutzen `<ChatThreadStream>` innen; `ChatChannel.tsx` gelöscht.
- [ ] Kein Renderer referenziert `claim_id` (bleibt `fall_id`; claim-Cutover = P3).
- [ ] `tsc` grün, pure-Layer + Engine vitest grün, Cross-Portal-Smoke grün (Screenshots im docs-Ordner).
- [ ] knip-/component-set-Baselines nicht verschlechtert (eher gesenkt durch Löschungen).

---

## 9. Risiken & Mitigation

- **Breite Migrationsfläche** (6 Portale) → schrittweise (§6), `tsc` nach jedem Schritt, Cross-Portal-Smoke am Ende.
- **KundeKbChat-Semantik** (nicht fall-gekeyt) → exakt erhalten via `kind:'kanal-allowlist'` (kein claim/fall-Zwang).
- **Optimistic-Echo-Doppelung** → id-Dedup im Reducer (KundeKbChat/Makler-Muster, bereits erprobt).
- **Realtime-Channel-Rename** → rein client-seitig/ephemeral, alle Consumer deployen zusammen → kein Kompat-Bruch.
- **Consent-Gate (Makler)** → bleibt im Makler-Send-Adapter/Wrapper, nicht in der Engine.

---

## 10. Out of Scope (Folge-Phasen)

P3: claim_id-Cutover (Realtime+Write), RLS-Triple-Stack-Konsolidierung, claim_id-Backfill, tote
`portal-*`-Kanäle, ein DB-seitiger Single-Send-Pfad. · P4: View-/Vokabular-Hygiene (`v_sv_inbox`-Rename,
Bell-SSoT). · Makler-Kanal `chat_gruppe_mit_makler` scharfschalten (heute 0 Rows).
