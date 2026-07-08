# Chat-Vervollständigung: Zustellungs-Routing (Thread↔WhatsApp/E-Mail) + P3 kanal-drop

**Status:** Design (Review offen). Voraussetzung: Chat-Thread-Rebuild ist live (Modell + 5 Portale flag-gated `?chatv2=1`, RLS real-role-verifiziert). Siehe Marker `COORDINATION-claim-chat-threads-rebuild`.

## Kontext / Lücke

- **Thread-Modell (v2, live):** `chat_threads` (kunde_gruppe/team_intern/direkt), `nachrichten.thread_id` (thread-nativ = `kanal` NULL), gelesen per `thread_id`.
- **Kanal-Modell (v1, Default):** WhatsApp/E-Mail/Chat als `nachrichten.kanal` (kein `thread_id`), gelesen per `fall_id`+`kanal`. Send via `lib/communications` (`channel-router.ts`/`send-chat.ts`), Inbound via `api/twilio/inbound-kb-whatsapp`, `api/baileys/inbound`, `api/aircall/*`.
- **Die zwei Welten sind getrennt.** Konsequenz: (a) der Admin-v2 (#3939) zeigt bewusst nur Chat-Threads, nicht WhatsApp/E-Mail; (b) eine Kunden-Thread-Nachricht erreicht den Kunden nur im Portal (das er evtl. nicht checkt), nicht via WhatsApp.

Zustellungs-Routing schließt die Lücke und entsperrt den vollen Admin-v2.

## #2 Zustellungs-Routing

Ziel: Thread-Nachrichten an den Kunden werden via seinen Kanal (WhatsApp/E-Mail) **zugestellt**; eingehende WhatsApp/E-Mail werden **Thread-Nachrichten**.

### Datenmodell-Entscheidung (OFFEN — Aaron)
Wie repräsentiert man eine Thread-Nachricht, die AUCH via WhatsApp zugestellt wurde?
- **A (empfohlen):** EINE `nachrichten`-Zeile mit `thread_id` GESETZT **und** `kanal` = Zustellkanal (whatsapp/email statt NULL). Thread-Reader (thread_id) UND Kanal-Reader (kanal) sehen sie → sichtbar in v1 **und** v2 während der Transition, kein Duplikat. Die „thread-nativ = kanal NULL"-Konvention wird bewusst aufgeweicht: `kanal` = Zustell-Marker, `thread_id` = Thread-Zugehörigkeit.
- B: Thread-Zeile (kanal NULL) + separater Twilio-Send ohne Zeile → keine Zustell-Status-Spur.
- C: Thread-Zeile + `delivery_log`-Tabelle → Overkill für jetzt.

### OUTBOUND (Thread → Kanal)
- **Hook:** `sendeThreadNachricht` (`src/lib/chat/thread-actions.ts`), NACH dem Insert.
- **Regel:** nur wenn `thread.art = kunde_gruppe` UND Sender = **Staff** (nicht der Kunde) → an den Kunden zustellen. `team_intern` / `direkt`-zwischen-Staff → NIE nach außen.
- **Zustellung:** die BESTEHENDE isolierte Send-Infra wiederverwenden (`lib/communications/channel-router`), NICHT Twilio direkt. Empfänger = `geschaedigter_user_id` → Telefon/E-Mail.
- ⚠ Braucht die `art` im `sendeThreadNachricht` — aktuell liest `hatThreadZugriff` nur `id`+`claim_id`; `art` nachladen.

### INBOUND (Kanal → Thread)
- **Hooks:** `api/twilio/inbound-kb-whatsapp`, `api/baileys/inbound`, `api/aircall/*`.
- Nach dem bestehenden kanal-Insert: Sender-Telefon → Claim (bestehende Zuordnung) → `holeOderErstelleGruppenThread(claim, 'kunde_gruppe')` → `thread_id` auf die Nachricht setzen.
- Ergebnis: Inbound-Nachricht hat `kanal`=whatsapp UND `thread_id` → in v1 UND v2 sichtbar. Sender = Kunde.

### Send-Isolation (KRITISCH — HARTE Regel)
Test-Accounts (`@claimondo.de` / Test-Marker) dürfen NIE echte WhatsApp/E-Mail bekommen. Die OUTBOUND-Zustellung MUSS durch **denselben Isolations-Guard** laufen wie die bestehende Send-Infra — NICHT umgehen. Bei Implementierung zuerst verifizieren: **wo sitzt der Guard** (`channel-router`? `send.ts`?) → Zustellung dort einhängen, hinter dem Guard.

### Loop-Vermeidung
Inbound (Kunde) → Thread-Nachricht mit `sender=Kunde`. Die Outbound-Regel („nur Staff-Sender stellen zu") überspringt sie → kein Loop. ✓

### Phasing
- **P1: OUTBOUND WhatsApp** (Staff-Thread → Kunde). Bounded, höchster Wert. Isolations-Reuse verifizieren.
- **P2: INBOUND WhatsApp** (Kunde → Thread). Webhook-Änderung + phone→claim→thread.
- **P3: E-Mail** analog.

### Risiken
1. **Send-Isolation-Bruch (spammt echte Kunden)** — HÖCHSTES Risiko. Isolations-Reuse ist Pflicht, nicht optional.
2. Doppel-Zustellung — verhindert durch `art=kunde_gruppe` + Sender-Staff-Check.
3. `phone→claim`-Mehrdeutigkeit (ein Telefon → mehrere Claims) — bestehende Zuordnungs-Logik der Inbound-Webhooks prüfen/wiederverwenden.

## #3 P3 kanal-drop — BLOCKIERT (nicht jetzt machbar)

Ziel: `nachrichten.kanal` droppen + tote Kanal-Routing-Files entfernen. **Würde JETZT prod brechen**, weil die `?chatv2=1`-Flags DEFAULT AUS sind → v1 (kanal-basiert) ist überall der aktive Pfad (`MultiChannelChat`, die kanal-Inbox-Loader, `sendChatMessage`, die Inbound-Webhooks schreiben `kanal`).

**Voraussetzungs-Sequenz (in dieser Reihenfolge):**
1. **Zustellungs-Routing (#2) fertig** — sonst verliert v2 die WhatsApp/E-Mail-Sicht.
2. **Flag-Flip:** `?chatv2=1` → v2 als DEFAULT pro Portal (Produkt-Entscheidung, schrittweise + Smoke pro Portal).
3. **v1-Entfernung:** `MultiChannelChat` + `ChatWithFallSidebar` + `NachrichtenInboxClient` + kanal-Loader entfernen (knip-Baseline senken).
4. **DANN erst** `kanal` droppen (DDL via Plugin, Regel 2) + kanal-routing-Files raus + Types regenerieren.

Bis dahin ist `kanal` NICHT tot. **Kein Teil von P3 ist jetzt sicher machbar.**

## Offene Entscheidungen (Aaron)
1. **Datenmodell A/B/C** — empfohlen **A** (kanal wird Zustell-Marker auf der Thread-Zeile).
2. **Zustell-Trigger** — immer bei jedem Staff-Thread-Send, oder nur wenn der Kunde nicht „online"/im Portal ist? Empfohlen: **immer** (wie heute WhatsApp).
3. **Flag-Flip-Reihenfolge** der Portale (P3-Voraussetzung Schritt 2).
