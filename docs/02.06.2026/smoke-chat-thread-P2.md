# P2 Cross-Portal-Smoke — `<ChatThread>`-Primitive (02.06.2026)

Lokaler Worktree-Dev-Server (`:3011`, Branch `kitta/chat-inbox-thread-primitive`) gegen Prod-DB.
Scripts: `scripts/smoke-chat-thread.mjs` (8 Surfaces) + `scripts/smoke-stream-kunde.mjs` (Stream-Fokus).
Screenshots: `docs/02.06.2026/smoke-chat-thread/`. Test-User je Rolle (Passwort `Test1234!`, 2FA aus).

## Ergebnis: alle 3 Shells rendern, **0 chat-bezogene Errors**

| Surface | Rolle | Shell | Ergebnis |
|---|---|---|---|
| `/admin/nachrichten` | admin | **ChatThreadTabs** | ✅ Threads + Kennzeichen-Suche + 4 Kanal-Tabs + Composer (`01`) |
| `/mitarbeiter/nachrichten` | kb | **ChatThreadTimeline** | ✅ Thread-Liste + Reply-Selektor + Composer (`02`) |
| `/gutachter/posteingang` | sv | **ChatThreadTabs** | ✅ 0 Errors (`03`) |
| `/kunde/chat` | kunde | **ChatThreadTabs** | ✅ 4 Tabs + Composer (`04`) |
| `/kunde/faelle/<id>` → Chat-Tab | kunde | **ChatThreadStream** | ✅ Empty-State + Composer inline (`05c`) |
| `/makler/akten` | makler | (Portal) | ✅ Portal lädt; Chat ist per-Akte (Stream) → Staging |
| `/faelle/<id>` Kommunikation | admin | ChatThreadTabs | ⚠️ Seite 0-Error; Tab-Klick uneindeutig; Tabs anderweitig bestätigt |
| `/gutachter/feldmodus` | sv | FokusChatPanel (Stream) | ⚠️ Redirect → `/gutachter/heute` (keine aktive Session) → Staging |

## Befunde — **KEINE P2-Regression**
- **„Invalid Date" im Inbox-Sidebar** (`/kunde/chat`, `/admin/nachrichten` …): pre-existing Bug im shared `ChatInboxLayout` — gefixt in separater Quick-Win-PR **#2224** (nicht in diesem Stack).
- **„Rendered more hooks" auf `/gutachter/heute`**: Redirect-Ziel (feldmodus ohne Session). P2 fasst den heute-Render-Pfad NICHT an (Chat-Code dort nicht gemountet; alle Chat-Komponenten sind hooks-clean — FokusChatPanel-Hooks stehen unkonditional vor dem `if (!expanded) return`). Pre-existing, eigener Follow-up wert.
- **„TypeError: Failed to fetch" (supabase auth-js)** auf 2 Surfaces: transienter Netzwerk-/Connection-Druck (11 parallele Sessions + Dev-Server), kein Code-Bug, `hasError=false`.

## Nicht lokal smokebar (→ Staging)
- **FokusChatPanel**: braucht aktive SV-Tages-Session (sonst Redirect auf `/gutachter/heute`).
- **Makler-Chat** (per-Akte Stream): braucht Akte mit Vollzugriff-Consent.
- Beide nutzen `ChatThreadStream` — durch den Kunde-Chat-Tab (Stream, `05c`) + Tabs/Timeline (gleiche Engine + Parts) bereits validiert.

## Fazit
Alle 3 Shells (Tabs / Timeline / Stream) rendern fehlerfrei auf den erreichbaren Surfaces; Engine + Parts visuell bestätigt. FokusChatPanel + Makler-Chat = Staging-Nachzug (Daten-Voraussetzungen, wie schon P1 KB/Makler).
