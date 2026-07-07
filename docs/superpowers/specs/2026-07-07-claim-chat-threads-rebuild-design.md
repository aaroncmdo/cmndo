# Claim-Chat als Thread-Modell — sauberer Rebuild (Gruppe + Team-intern + private DMs)

**Datum:** 2026-07-07
**Autor:** Session `2cc586af` (Werkstatt-Login-Mail-Lane), gemeinsam mit Aaron
**Status:** Design — wartet auf Aaron-Review vor dem Implementierungs-Plan

---

## 1. Motivation

Der Claim-Chat funktioniert technisch, ist aber **konzeptionell fragmentiert**: es gibt **6 rollenpaar-benannte Kanäle** mit einer Sichtbarkeits-Matrix pro Rolle:

`whatsapp` · `chat_kb_kunde` · `chat_kunde_sv` · `chat_kb_sv` (intern) · `gruppenchat` · `chat_gruppe_mit_makler`

Das ist schwer zu verstehen (welche Rolle sieht welchen Kanal?), lässt sich nicht sauber erweitern (die **Werkstatt hat heute gar keinen Chat**, obwohl sie ein Claim-Beteiligter ist), und mischt einen **Transport-Kanal** (WhatsApp) mit **logischen Gesprächen** (die Rollenpaar-Chats).

**Gute Ausgangslage:** Das Backend ist bereits weitgehend zentralisiert — **eine Tabelle `nachrichten`**, **eine Kern-Komponente `MultiChannelChat`** + geteilte Layouts (`ChatInboxLayout`, `ChatWithFallSidebar`, …), **eine Send-Action `sendChatMessage`**. Wir bauen also nicht bei null an, sondern ersetzen das **Kanal-Modell** durch ein **Thread-Modell**.

### Nicht-Ziele / außerhalb des Scopes
- **Makler-KI-Copilot** (`/api/makler/copilot`, Streaming, nicht persistiert) — bleibt.
- **Support-Widget** (Linear-Tickets) — bleibt.
- **Community-Leaderboard** — separat, bleibt.
- **Benachrichtigungen/Mitteilungen** (`mitteilungen`, `UpdatesNav`) — orthogonales System, bleibt unangetastet (es ist die Benachrichtigungs-Ebene ÜBER dem Chat, keine Duplikation).

---

## 2. Zielmodell (von Aaron bestätigt)

Statt 6 Kanälen gibt es pro Claim **drei Thread-Arten**:

| Art | Wer ist drin | Zweck |
|-----|--------------|-------|
| **`kunde_gruppe`** | Kunde + Kernteam (Betreuer, Gutachter) | Das kundensichtbare Hauptgespräch. 1 pro Claim. |
| **`team_intern`** | Nur Claimondo-Staff (Betreuer, Gutachter; Admin/Dispatch per Oversight) — **ohne Kunde** | Interne Absprachen. 1 pro Claim. Löst `chat_kb_sv` ab. |
| **`direkt`** | Genau 2 Beteiligte | Private DM mit **jedem** — auch Werkstatt & Makler (die heute keinen Chat haben). On-demand. |

**WhatsApp/E-Mail sind kein Thread, sondern Zustellung.** Der Kunde ist Thread-Mitglied wie jeder andere; ist er nicht im Portal aktiv, wird eine an ihn gerichtete Nachricht per WhatsApp/E-Mail zugestellt, und sein eingehendes WhatsApp landet im richtigen Thread. Kein „WhatsApp-Tab" mehr — nur ein dezenter „via WhatsApp"-Indikator pro Nachricht.

---

## 3. Datenmodell

Zwei neue Tabellen + eine neue Spalte auf `nachrichten`. **Alle DDL ausschließlich über das Supabase-Plugin (`apply_migration`)** — Regel 2.

### 3.1 `chat_threads`
```
id            uuid PK default gen_random_uuid()
claim_id      uuid NOT NULL   -- FK -> claims (bzw. faelle/faelle_claim_bridge, an bestehende Konvention angleichen)
art           text NOT NULL CHECK (art IN ('kunde_gruppe','team_intern','direkt'))
erstellt_am   timestamptz NOT NULL default now()
```
- **Uniqueness:** genau EIN `kunde_gruppe`- und EIN `team_intern`-Thread pro `claim_id` (Partial-Unique-Index auf `(claim_id, art) WHERE art IN ('kunde_gruppe','team_intern')`).
- **`direkt`:** beliebig viele pro Claim, aber je Personen-Paar nur einer — durchgesetzt über die Teilnehmer-Tabelle (s.u.), nicht hier.

### 3.2 `chat_thread_teilnehmer`
```
thread_id          uuid NOT NULL   -- FK -> chat_threads ON DELETE CASCADE
user_id            uuid NOT NULL   -- FK -> auth.users
rolle              text            -- denormalisiert fuer Anzeige ('kunde'|'kundenbetreuer'|'sachverstaendiger'|'werkstatt'|'makler'|'admin'|'dispatch')
zuletzt_gelesen_am timestamptz     -- fuer Ungelesen-Zaehler
hinzugefuegt_am    timestamptz NOT NULL default now()
PRIMARY KEY (thread_id, user_id)
```
- Für `direkt`-Threads: ein deterministischer **Paar-Schlüssel** verhindert Duplikate. Umsetzung: beim Anlegen eines Direkt-Threads prüfen, ob bereits ein `direkt`-Thread mit exakt diesem Paar `{userA,userB}` für den Claim existiert (Lookup über die Teilnehmer-Tabelle). Optional als DB-Garantie: eine generierte Spalte `paar_key text` (sortierte user-ids, nur für `direkt`) mit Partial-Unique-Index `(claim_id, paar_key)`.

### 3.3 `nachrichten.thread_id` (neue Spalte)
```
ALTER TABLE nachrichten ADD COLUMN thread_id uuid;   -- FK -> chat_threads
CREATE INDEX idx_nachrichten_thread ON nachrichten (thread_id, created_at DESC);
```
- Bestehende Spalten bleiben: `fall_id`, `sender_id`, `sender_rolle`, `nachricht`, `richtung`, `status`, `external_message_id`, `gelesen`, … — sie liefern die **Zustell-Metadaten** (via WhatsApp/E-Mail/in-app) und die Provider-Message-ID.
- Die alte `kanal`-Spalte bleibt zunächst (für Rückwärts-Kompatibilität während der Phasen), wird aber vom neuen Modell nicht mehr gelesen. In der Schluss-Phase entfernt.

### 3.4 RLS (konsistent, im Gegensatz zu heute)
- **`chat_threads` / `chat_thread_teilnehmer`:** SELECT/INSERT für Authenticated, wenn der User **Teilnehmer** ist ODER `is_staff()` (Admin/Dispatch-Oversight). `REVOKE ALL FROM anon` (Regel: nach jeder View/Tabelle anon entziehen).
- **`nachrichten`:** Zugriff, wenn der User Teilnehmer des `thread_id` ist ODER `is_staff()`. Ersetzt die heutige `kanal`-basierte Sichtbarkeits-Matrix durch **Thread-Mitgliedschaft** = die eigentliche saubere Access-Control.

---

## 4. Thread-Lebenszyklus & Teilnehmer-Regeln

- **`kunde_gruppe` + `team_intern`** werden **automatisch beim Claim** angelegt (Trigger bei Claim-Erstellung ODER lazy beim ersten Chat-Zugriff — Entscheidung im Plan; lazy ist migrations-schonender).
  - `kunde_gruppe`-Teilnehmer: der Kunde (Lead-User) + zugewiesener Betreuer + zugewiesener Gutachter. Synchronisiert, wenn sich Zuweisungen ändern.
  - `team_intern`-Teilnehmer: zugewiesener Betreuer + Gutachter. Admin/Dispatch sehen alles per `is_staff()`-RLS (nicht zwingend als Member gelistet).
- **`direkt`** entsteht **on-demand**: „X privat anschreiben" → Thread anlegen (falls nicht vorhanden), Nachricht senden. Funktioniert für **jede** Person am Claim, inklusive Werkstatt & Makler.

---

## 5. Nachrichten-Fluss (Send / Empfang / Zustellung)

- **`sendChatMessage`** wird umgestellt: statt `{fallId, kanal}` nimmt es `{threadId, nachricht}`. Insert in `nachrichten` mit `thread_id`, danach **pro Thread-Mitglied Zustellung entscheiden**:
  - Mitglied ist internes Portal-Nutzer → in-app (Realtime), plus Mitteilung/Badge.
  - Mitglied ist Kunde/Werkstatt/Makler, extern erreichbar → WhatsApp (falls Telefon) bzw. E-Mail (Fallback), über die bestehende `sendCommunication`/`sendNachricht`-Infra. Provider-Message-ID zurück in `nachrichten.external_message_id`.
- **Eingehendes WhatsApp** (`whatsapp_inbound_messages` → matched `fall_id`): wird in den **`kunde_gruppe`-Thread** des Claims geschrieben (team-sichtbar). Falls später „privater WhatsApp-Faden" gewünscht: in den Direkt-Thread Kunde↔Betreuer — als spätere Verfeinerung.
- **Realtime:** Supabase `postgres_changes` auf `nachrichten` gefiltert nach `thread_id` (statt `fall_id`+`kanal`).

---

## 6. Migration (kein Datenverlust)

Backfill-Skript (als Migration über das Plugin), mappt jede bestehende `nachrichten`-Zeile auf einen Thread:

| Alt `kanal` | Neuer Thread |
|-------------|--------------|
| `gruppenchat` | `kunde_gruppe` des Claims |
| `chat_kb_kunde` | `direkt`(Betreuer, Kunde) |
| `chat_kunde_sv` | `direkt`(Kunde, Gutachter) |
| `chat_kb_sv` | `team_intern` des Claims |
| `chat_gruppe_mit_makler` | **offen** — siehe §8 (Makler-Verortung) |
| `whatsapp` | `kunde_gruppe` des Claims (team-sichtbar) — **zur Bestätigung**, siehe §8 |

Threads + Teilnehmer werden im selben Skript aus den vorhandenen Nachrichten + Claim-Zuweisungen abgeleitet. Idempotent (mehrfach lauffähig).

---

## 7. UI & Rollout

**UI-Ziel:** Pro Claim ein Chat mit **Gruppe-first** (Kunde-Gruppe offen) + einer **Beteiligten-/Thread-Liste** (Team-intern, „Privat mit Betreuer/Gutachter/Werkstatt/…"). Baut auf `MultiChannelChat` + `ChatInboxLayout` auf (die Tab-Kanäle werden zur Thread-Liste). Der globale `GlobalPosteingangFab` listet künftig **Threads** statt Kanal-gefilterter Fälle.

**Neu erreichbar:** Werkstatt-Portal + Kanzlei-Portal bekommen Chat (heute keiner).

**Phasen (zwingend wegen 11 paralleler Sessions an geteilten Chat-Files):**
1. **Schema + Backfill** — neue Tabellen, `thread_id`, Migration. Altes UI liest weiter `kanal` (unverändert lauffähig). **Kein UI-Risiko.**
2. **Neue Send-/Read-Schicht** — `sendChatMessage`/Reader auf `thread_id` umstellen, dual-kompatibel. Neues Gruppe+DM-UI **hinter Feature-Flag**, Portal für Portal (inkl. Werkstatt/Kanzlei).
3. **Cutover** — Flag an für alle, alte `kanal`-Logik + tote Kanal-Routing-Files entfernen, `kanal`-Spalte droppen.

Mehrere PRs, je Phase mindestens einer.

---

## 8. Offene Punkte (für Aaron-Review)

1. **Makler-Verortung:** Der heutige `chat_gruppe_mit_makler` ist eine Gruppe (Makler + Team). Im 3-Arten-Modell — wird der Makler (a) über **private DMs** angebunden (Makler↔Betreuer), (b) in die **`kunde_gruppe`** aufgenommen, oder (c) kriegt er einen **eigenen Gruppen-Typ** (`makler_gruppe`)? Vorschlag: (a) DMs für den Normalfall; alte Makler-Gruppen-Nachrichten → `team_intern`. Zu bestätigen.
2. **WhatsApp-Historie:** Alt-`whatsapp`-Nachrichten → `kunde_gruppe` (team-sichtbar). Passt das, oder sollen sie in den Direkt-Thread Kunde↔Betreuer?
3. **Thread-Anlage:** Trigger bei Claim-Erstellung vs. lazy beim ersten Zugriff (lazy = migrations-schonender, empfohlen).
4. **Team-intern-Mitgliedschaft:** Nur zugewiesener Betreuer+Gutachter als Member (Admin/Dispatch per RLS-Oversight) — oder Admin/Dispatch explizit als Member listen?

---

## 9. Risiken & Koordination

- **Geteilte Hot-Files** (andere Sessions fassen sie evtl. an): `src/components/chat/*` (v.a. `MultiChannelChat`, `ChatInboxLayout`, `GlobalPosteingangFab`), `src/lib/communications/send-chat.ts`, `src/lib/chat/kanal-routing.ts`, `src/lib/communications/channels.ts`, `nachrichten`-Tabelle. → Phase 1 (rein additive Schema-Arbeit) kollidiert kaum; die UI-Phasen brauchen Koordination. Marker anlegen, Lane beanspruchen.
- **Migrations-Risiko:** Backfill muss idempotent + gegen Prod-Daten getestet sein (Read-Only-Verifikation vor dem Insert-Lauf).
- **DDL nur via Plugin** (Regel 2). **Nach jeder Tabelle `REVOKE anon`.**
- **Kein Big-Bang:** Phase 1 ist rein additiv und für sich mergebar, ohne bestehendes Verhalten zu ändern.

---

## 10. Nächster Schritt

Nach Aaron-Review dieser Spec → `writing-plans`-Skill für den detaillierten, TDD-getriebenen Implementierungs-Plan (Phase 1 zuerst: Schema + Backfill).
