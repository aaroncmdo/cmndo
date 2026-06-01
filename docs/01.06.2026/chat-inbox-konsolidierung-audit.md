# Audit: Chat-/Nachrichten-/Inbox-System — Ist-Zustand & Konsolidierung

**Datum:** 2026-06-01
**Scope:** Alles rund um Chat im Claim/Fall + die Multi-Channel-Inbox (UI, Send-Pfade, Daten-Layer, RLS, Views).
**Auftrag:** Erst Ist-Aufnahme ("wie laeuft das aktuell"), dann Konsolidierungs-Vorschlag ("kein Tohuwabohu mehr").
**Methodik:** 2 parallele Explore-Agenten (UI-Inventar + Plumbing) + Live-DB-Queries gegen Prod (`paizkjajbuxxksdoycev`).

---

## 0. TL;DR

Das Chat-System ist funktional **fertig gebaut, aber als Patchwork**: 7 handgebaute Chat-UIs, 5 Re-Implementierungen der Thread-Aggregation, 6+ Send-Pfade mit 3 verschiedenen Result-Shapes, die Rolle-Kanal-Zuordnung an 4 Stellen mit **echten Widerspruechen**, TS-Kanal-Registry (5) != DB-CHECK (6), und eine RLS, die auf `claim_id` gatet waehrend der gesamte Code auf `fall_id` filtert.

**Der wichtigste Befund ist aber die Datenbasis:** In Prod existieren **11 Nachrichten gesamt** — 9 System-Posts im `gruppenchat`, 2 verwaiste `whatsapp` ohne Fall-/Claim-Bezug, **0 inbound, 0 echter Mensch-zu-Mensch-Chat**. Das gesamte System ist praktisch ungenutzt. Eine harte Vereinheitlichung kostet damit fast nichts an Migration und ist jetzt der richtige Zeitpunkt — bevor echte Last drauf kommt.

---

## 1. Datenbasis (Live-DB, 2026-06-01)

### `nachrichten` — reale Verteilung

| Kanal | inbound | outbound | ungelesen | total |
|---|---|---|---|---|
| `gruppenchat` | 0 | 9 | 9 | 9 |
| `whatsapp` | 0 | 2 | 2 | 2 |
| **Summe** | **0** | **11** | **11** | **11** |

Weitere Fakten:
- `total=11`, davon `is_system=9` (alle gruppenchat sind System-Posts, kein Mensch-Chat)
- `claim_id IS NULL`: 2 · `fall_id IS NULL`: 2 · beide gesetzt: 9
- → Die 2 `whatsapp`-Zeilen haben **weder fall_id noch claim_id** (verwaist), `lead_id` nirgends genutzt.
- **0 inbound** → der Inbound-Pfad (Twilio/Baileys-Webhook → `nachrichten`) hat noch nie eine Zeile erzeugt.

**Konsequenz:** Das ist Greenfield. Kein vorsichtiges Inkrement noetig — wir koennen sauber neu schneiden.

### Nachbar-Tabellen (Kommunikations-Domaene, alle existent)
`nachrichten` (Chat) · `mitteilungen` (Events→Tasks, AAR-764) · `benachrichtigungen` (Bell) · `email_log` (Email-Tracking) · `calls` (Voice) · `fall_summaries` (KI-Assistent-History).
→ Mindestens **3 ueberlappende "Nachrichten"-Begriffe**: nachrichten / mitteilungen / benachrichtigungen.

---

## 2. Ist-Architektur

### 2.1 Datenmodell `nachrichten`

Spalten (Live): `id, fall_id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, anhang_typ, gelesen, created_at, empfaenger_id, is_system, system_event, lead_id, kb_empfaenger_id, external_id, richtung, external_message_id, empfaenger_kontakt, template_key, fehlermeldung, status, claim_id`.

- **Doppel-Schluessel `fall_id` + `claim_id`** (beide FK, beide ON DELETE CASCADE). CMM-44-Uebergang ist im Chat angekommen: DB hat claim_id, der Code adressiert weiter fall_id.
- CHECK `kanal`: `whatsapp, chat_kb_kunde, gruppenchat, chat_kunde_sv, chat_kb_sv, chat_gruppe_mit_makler` (**6**).
- CHECK `status`: `gesendet, fehlgeschlagen, zugestellt, gelesen, queued` (nullable).

### 2.2 UI-Oberflaechen (7 handgebaute Chat-Renderer)

| # | Komponente | Datei | Realtime-Channel | Eigene Mark-Read? | Scope |
|---|---|---|---|---|---|
| 1 | MultiChannelChat | `src/components/chat/MultiChannelChat.tsx` | `chat:${fallId}` | ja | fall |
| 2 | ChatTimelineView | `src/components/chat/ChatTimelineView.tsx` | `chat-kunde:${fallIds.join(',')}` | ja | kunde (multi-fall) |
| 3 | KundeKbChat | `src/app/kunde/_components/KundeKbChat.tsx` | `kunde-chat-${kanal}-${userId}` | ja | fall optional |
| 4 | FokusChatPanel | `src/app/gutachter/feldmodus/FokusChatPanel.tsx` | `fokus-chat-${fallId}-${suffix}` | ja | fall, nur chat_kunde_sv |
| 5 | MaklerChatTab | `src/components/makler/akte-detail/MaklerChatTab.tsx` | `fall-chat-${fallId}` | ja | fall, gruppenchat |
| 6 | ChatChannel | `src/components/ChatChannel.tsx` | nachrichten/fall_id | — | fall |
| 7 | SupportChat | `src/components/support/SupportChat.tsx` | — (eigenes Backend) | — | global, NICHT nachrichten |

**Wrapper/Container** darum: `ChatInboxLayout`, `ChatWithFallSidebar`, `ChatWithKundenSidebar`, `NachrichtenInboxClient`, `ChatWindowPanel` + `PinnedChatBubble` (FAB, `global-chat-store`), `KommunikationTab` (Fallakte-Tab), `GlobalPosteingangFab`.

→ **5 verschiedene Realtime-Channel-Namenskonventionen**, **5 verschiedene Mark-Read-Implementierungen**, **3 verschiedene Input-Patterns** (Tab-Wahl erzwingt Kanal / Fall+Kanal-Dropdown / Fall-Picker-Icon).

### 2.3 Send-Pfade (mind. 6 parallel, 3 Result-Shapes)

| Funktion | Datei | Result-Shape |
|---|---|---|
| `sendChatMessage` | `src/lib/communications/send-chat.ts` | `{ success, error? }` |
| `sendChatNachricht` | `src/app/faelle/[id]/_actions/chat.ts` | `{ success, error? }` |
| `maklerSendMessage` | `src/lib/actions/makler-send-message.ts` | `{ success:true, messageId } \| { success:false, error }` |
| `sendKundeChatMessage` | `src/app/kunde/_components/kb-chat-actions.ts` | `{ success, error? }` |
| `sendCommunication` / `sendFallCommunication` | `src/lib/communications/send.ts`, `send-fall.ts` | **throws / void** |
| `sendSmartChannel` | `src/lib/communications/channel-router.ts` | `{ success, kanal, sid?, versuche }` |
| `sendStatusWhatsApp` / `sendManualWhatsApp` | `src/lib/whatsapp.ts` | async void / `{ success }` |

→ Verstoss gegen die Hausregel (`AGENTS.md`): neue Server-Actions sollen `{ ok }` liefern, nicht `{ success }`. Persistierungs-Logik (INSERT in `nachrichten`) liegt an **3+ Stellen** verteilt; manche INSERTen vor dem Send, manche danach, manche gar nicht.

### 2.4 Thread-Aggregation (5 Re-Implementierungen desselben "group by fall_id")

1. `src/app/api/chat/inbox-threads/route.ts` (eigener Reader, Rolle-Switch ADMIN/SV/KUNDE)
2. `src/app/admin/nachrichten/page.tsx` (Page-Level, group by fall_id)
3. `src/app/mitarbeiter/nachrichten/page.tsx` (Page-Level, group by lead_id/kundeId)
4. `src/app/gutachter/posteingang/page.tsx` (Page-Level, group by fall_id)
5. `src/app/kunde/chat/page.tsx` (Page-Level, group by fall_id)

→ Die `inbox-threads`-API **existiert bereits als geteilter Reader**, wird aber von den Pages ignoriert — jede Page baut die Aggregation nochmal selbst. **Es gibt keinen DB-View dafuer** (siehe 2.8).

### 2.5 Kanal- & Rollen-Routing — WIDERSPRUECHE

Rolle→sichtbare-Kanaele ist an **4+ Stellen** definiert, mit unterschiedlichem Inhalt:

| Quelle | SV sieht | Kunde sieht |
|---|---|---|
| `src/lib/chat/kanal-routing.ts` `getKanaeleForRolle()` | `gruppenchat, chat_kunde_sv, chat_kb_sv` (**kein WhatsApp, MIT intern**) | `whatsapp, chat_kb_kunde, gruppenchat, chat_kunde_sv` |
| `src/app/api/chat/inbox-threads/route.ts` | `whatsapp, chat_kunde_sv, gruppenchat` (**MIT WhatsApp, KEIN intern**) | `whatsapp, chat_kb_kunde, chat_kunde_sv, gruppenchat` |
| `/gutachter/posteingang/page.tsx` `svKanaele` | `whatsapp, chat_kunde_sv, gruppenchat` | — |
| `/kunde/chat/page.tsx` `KUNDE_KANAELE` | — | `chat_kb_kunde, chat_kunde_sv, gruppenchat` (**kein WhatsApp**) |

**Konkrete Folgen:**
- Ein **SV sieht in der Fallakte** (KommunikationTab → kanal-routing) den internen KB↔SV-Kanal **aber kein WhatsApp** — **im Posteingang** (inbox-threads/posteingang) genau umgekehrt: WhatsApp ja, intern nein. Gleiche Rolle, andere Kanaele je Bildschirm.
- Ein **Kunde sieht WhatsApp** im inbox-threads-Reader, **aber nicht** auf `/kunde/chat`.

Plus weitere Whitelists: `VISIBLE_KANAELE` (admin), `KB_KANAELE` (mitarbeiter), `CHAT_KANAELE`/`visibleInInbox` (channels.ts). **Bei einem neuen Kanal muessen 6 Stellen geaendert werden.**

### 2.6 Kanal-Vokabular: TS != DB != RLS

- **TS** `ChatKanal` / `CHAT_KANAELE` (`channels.ts`): **5** Kanaele (ohne `chat_gruppe_mit_makler`).
- **DB-CHECK**: **6** Kanaele (mit `chat_gruppe_mit_makler`).
- **`chat_gruppe_mit_makler`**: in CHECK + von `MaklerChatTab` **gelesen** (Z. 133/167), aber **nie geschrieben** (Makler schreibt `gruppenchat`, `makler-send-message.ts:67`) → **0 Zeilen, Totgeburt**. Da nicht in `CHAT_KANAELE`, faellt `getChannelDef()` auf `CHAT_KANAELE[0]` (WhatsApp) zurueck → falsches Icon/Label/Farbe, falls je geschrieben.
- **Legacy** `portal-kunde-claimondo` / `portal-kunde-gutachter`: nicht in CHECK (nicht mehr insertbar), aber **noch in RLS-Policies + in `kanal-routing.ts`-Aliasen** → toter Code.

### 2.7 RLS — Dreifach-Stack auf `nachrichten`

| Policy | cmd | Logik |
|---|---|---|
| `admin_nachrichten` | ALL | `profiles.rolle = 'admin'` |
| `staff_fall_scoped` | ALL | `can_access_claim(claim_id)` ← **gatet auf claim_id** |
| `nachrichten_select_public_consol` | SELECT | fall_id-basiert + Legacy `portal-*`-Kanaele |
| `nachrichten_insert_public_consol` | INSERT | fall_id-basiert + Legacy `portal-*`-Kanaele |

**Inkonsistenz:** `staff_fall_scoped` gatet auf `claim_id`, der **gesamte App-Code filtert/inserted aber `fall_id`**. Zeilen mit `claim_id IS NULL` (z. B. die 2 verwaisten WhatsApp, und kuenftig jeder Inbound ohne aufgeloesten Fall) sind fuer Nicht-Admin-Staff **unsichtbar**. Die `public_consol`-Policies tragen weiter totes `portal-*`-Vokabular.

### 2.8 Die "View" (`v_sv_inbox`)

Einziger View mit Inbox-Bezug. **Referenziert `nachrichten` NICHT** — basiert auf `gutachter_finder_anfragen` JOIN `embed_sites` (AAR-939 Stream 7: SV-**Anfragen**-Inbox aus dem Embed, keine Chat-Threads).

→ "Inbox" ist doppelt belegt: einmal **Chat-Threads** (app-seitig aggregiert, kein View) und einmal **Embed-Leads** (`v_sv_inbox`). Das ist Teil des Tohuwabohu: derselbe Begriff, zwei Bedeutungen. **Es gibt keinen DB-View fuer Chat-Threads.**

---

## 3. Inkonsistenz-Matrix (priorisiert)

| # | Befund | Schwere | Evidenz |
|---|---|---|---|
| I1 | Rolle→Kanal an 4+ Stellen, **inhaltlich widerspruechlich** (SV/Kunde sehen je Bildschirm andere Kanaele) | 🔴 Hoch | 2.5 |
| I2 | 5 Re-Implementierungen der Thread-Aggregation; geteilter Reader (`inbox-threads`) ignoriert | 🔴 Hoch | 2.4 |
| I3 | RLS gatet `claim_id`, Code filtert `fall_id` → Zeilen ohne claim_id unsichtbar | 🔴 Hoch | 2.1, 2.7 |
| I4 | 6+ Send-Pfade, 3 Result-Shapes, `{success}` statt Hausregel `{ok}`, verteilte Persistierung | 🟡 Mittel | 2.3 |
| I5 | 7 handgebaute Chat-Renderer, 5 Realtime-Konventionen, 5 Mark-Read, 3 Input-Patterns | 🟡 Mittel | 2.2 |
| I6 | Kanal-Vokabular TS(5) != DB(6); `chat_gruppe_mit_makler` Totgeburt; Legacy `portal-*` in RLS | 🟡 Mittel | 2.6, 2.7 |
| I7 | "Inbox" doppelt belegt (Chat-Threads vs `v_sv_inbox` Embed-Leads); 3 "Nachrichten"-Tabellen | 🟠 Niedrig | 2.8, 1 |
| I8 | Component-Set-Verstoesse (z. B. `MaklerChatTab` handgerolltes `bg-white rounded-2xl border`-Card) | 🟠 Niedrig | `MaklerChatTab.tsx:259` |

---

## 4. Soll-Architektur (Ziel)

**Leitidee:** Eine Schicht je Verantwortung. Trenne sauber **Chat** (Mensch, Freitext, in `nachrichten`) von **Transaktional** (Template, Registry, Multi-Channel-Routing via `sendCommunication`/`sendSmartChannel`). Das sind zwei Systeme, die heute vermischt sind.

1. **Eine Kanal-SSoT** — `channels.ts` ist die einzige Registry. `ChatKanal` exakt = DB-CHECK (Makler-Kanal aufnehmen **oder** droppen — Entscheidung noetig). Eine Funktion `getVisibleKanaele(rolle)` (ein Ort), die **alle** Pages, die API und alle Komponenten importieren. Die 6 Whitelists (`VISIBLE_KANAELE`, `KB_KANAELE`, `svKanaele`, `KUNDE_KANAELE`, `ADMIN/SV/KUNDE_KANAELE`) werden geloescht. SV-/Kunde-Widerspruch **einmal** aufloesen.

2. **Ein Thread-Reader** — `inbox-threads` wird DER Reader (auf `claim_id` keyen, `fall_id`-Fallback waehrend Uebergang), alle 5 Pages rufen ihn auf. Optional dahinter ein DB-View `v_chat_threads` (last_message, unread, kanaele je claim) — sauberer Langzeit-Weg, passt zur CMM-44-Claim-SSoT.

3. **Ein Chat-Renderer** — `<ChatThread>` (ein Primitive) mit Props `scope`, `visibleKanaele`, `layout: tabs|timeline|compact`. Die Wrapper (Sidebar/Window/Fokus/Makler) komponieren ihn. **Eine** Realtime-Konvention (`chat:claim:${claimId}`), **ein** Mark-Read-Util, **ein** Unread-Util. Kollabiert 1–6 aus 2.2 (SupportChat bleibt separat, anderes Backend).

4. **Ein Send-Pfad** — `sendChatMessage()` als einziger Chat-Sender: INSERT in `nachrichten` (claim_id **und** fall_id im Uebergang), Rueckgabe `{ ok, error? }`, optionaler externer Fan-out ueber die Communications-Registry. Die transaktionalen Sender bleiben fuer ihren Zweck, aber die Grenze wird dokumentiert.

5. **Ein Scope-Key** — `claim_id` kanonisch (CMM-44-Linie). 2 verwaiste Zeilen backfillen, INSERTs setzen immer claim_id, RLS auf claim-scoped Party-Check zusammenfuehren, tote `portal-*`-Zweige droppen.

6. **View-Hygiene** — `v_sv_inbox` umbenennen (z. B. `v_sv_anfragen_inbox`), damit "Inbox" nicht zwischen Chat-Threads und Embed-Leads kollidiert. Falls gewuenscht, `v_chat_threads` einfuehren.

---

## 5. Phasenplan (guenstigstes/risikoaermstes zuerst)

- **Phase 0 — Kanal-SSoT** (rein konsolidierend, Risiko ~0 bei 11 Zeilen): eine Registry + ein `getVisibleKanaele(rolle)`, 6 Whitelists loeschen, Makler-Kanal-Entscheidung, SV/Kunde-Widerspruch aufloesen. `tsc` + Smoke je Portal.
- **Phase 1 — Ein Thread-Reader**: `inbox-threads` = einzige Quelle (claim_id, fall_id-Fallback), 5 Pages repointen; optional `v_chat_threads`.
- **Phase 2 — Ein `<ChatThread>`**: 6 Renderer kollabieren, Wrapper komponieren; eine Realtime-/Mark-Read-/Unread-Konvention.
- **Phase 3 — Ein Send-Pfad + `{ok}`**: Chat vs. Transaktional trennen, Persistierung zentralisieren, RLS zusammenfuehren, claim_id backfillen, tote Kanaele droppen.
- **Phase 4 — View-/Vokabular-Hygiene**: `v_sv_inbox` umbenennen, "Inbox"/"Nachrichten"-Begriffe entwirren (Anschluss an DB-Lifecycle-Audit "6→1 Bell").

---

## 6. Offene Entscheidungen (brauchen Aaron)

1. **Makler-Kanal**: `chat_gruppe_mit_makler` ausbauen (scharf schalten) **oder** droppen und bei `gruppenchat` bleiben?
2. **SV-Kanaele**: Soll der SV WhatsApp sehen? Soll er den internen KB↔SV-Kanal sehen? (Heute je Bildschirm anders.)
3. **Kunde-WhatsApp**: Kunde mit oder ohne WhatsApp-Tab?
4. **Scope-Key**: jetzt hart auf `claim_id` (CMM-44) oder `fall_id` bis zum faelle-Drop behalten?
5. **Thread-View**: DB-View `v_chat_threads` bauen oder TS-Reader reicht (11 Zeilen)?

---

## 7. Koordination

Dieser Branch (`kitta/aar-939-monika-embed`) hat aktuell **3 weitere aktive Sessions** (Embed-Arbeit). Die Konsolidierung gehoert **nicht** hierhin — sie braucht ein eigenes Linear-Ticket + eigenen Branch (Vorschlag: `kitta/<ticket>-chat-inbox-konsolidierung`, isolierter Worktree via `node scripts/new-session-worktree.mjs`). Dieses Audit ist read-only; es wurde nichts am Code geaendert.
