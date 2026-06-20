# Rückruf-Kanonisierung — DB-native via `notification_events` (Scope B)

**Datum:** 2026-06-20
**Status:** Design (Spec) — genehmigt, Plan folgt
**Ticket:** AAR-956 (Self-Service/FlowLink) · Folge-Ticket „Rückruf-Kanonisierung" anzulegen
**Leitprinzip (Aaron 2026-06-20):** *Alles aus der Datenbank heraus. Funktionen greifen auf
kanonische DB-Quellen zu (Views/RPCs/Trigger/Events) statt Konsistenz in App-Code „von Hand" zu
koordinieren.*

---

## 1. Kontext & Problem

**Speicher/Read sind kanonisch (AAR-637):** Rückrufe leben in `admin_termine` (`typ='rueckruf'`,
`status ∈ offen/erledigt/abgesagt`, `lead_id` ODER `fall_id`). Legacy `leads.rueckruf_datum/notiz/erledigt`
gedroppt. Eine Liste für Dispatch + Admin-Kalender + Mitarbeiter-Kalender.

**Write + Notify sind NICHT kanonisch.** 8 Schreibwege rollen jeder seinen eigenen `admin_termine`-Insert
+ eigene Seiteneffekte. Dasselbe Ereignis verhält sich je Eintrittspunkt anders:

| # | Writer | Datei | Bell | Team | Kunde-WA | GCal | Dauer | zugewiesen_an | Lead-Flag |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `saveRueckruf` | `dispatch/leads/[id]/_actions/rueckruf.ts` | ❌ | ❌ | ❌ | ✅ | 15m | user | phase+geplant_am |
| 2 | `saveFallRueckruf` | `faelle/[id]/_sidebar/rueckruf-actions.ts` | ❌ | ❌ | ❌ | ❌ | 15m | kundenbetreuer | — |
| 3 | `erstelleOeffentlichenRueckruf` | `lib/actions/public-rueckruf.ts` | ✅ | ✅ | ✅ | ❌ | 30m | **keiner** | status+phase |
| 4 | `upsertReservierungsRueckruf(false)` | `lib/embed/reservierungs-rueckruf.ts` | ❌ | (Lead-Create) | ❌ | ❌ | 30m | dispId | — |
| 5 | `upsertReservierungsRueckruf(true)` | (via `bucheRueckrufBeimDispatcher`) | ✅ | ❌ | ✅ | ❌ | 30m | dispId | — |
| 6 | `markRueckrufErledigtMitErgebnis` (Folgetermin) | `dispatch/rueckrufe/actions.ts` | ❌ | ❌ | ❌ | ✅* | 15m | user | phase+anruf_* |
| 7 | `aendereTerminFlow` | `flow/[token]/self-service-actions.ts` | ❌ | ❌ | ❌ | ❌ | — | — | **status-only, KEIN admin_termine** |
| 8 | `BeratungVereinbarenButton`/`BeratungModal` | `components/shared/glass/*` | ? | ? | ? | ? | ? | ? | ? |

**Der zentrale Befund:** Es existiert bereits eine **vollständige, gesunde, kanonische
Notification-Pipeline** (AAR-497/500/764) — die Rückrufe komplett umgehen:

- `notification_events` (Event-Quelle, Queue-Semantik: `status/processed_at/retry_count/next_retry_at`).
- `api/notifications/process/route.ts` (Worker: fan-out → `notification_deliveries` → Channel-Handler, Retry-Backoff 1/5/30/120min → dead-letter).
- `EVENT_MATRIX` (`lib/notifications/channel-matrix.ts`): Policy *Event × Rolle → Channels*.
- `CHANNEL_HANDLERS`: `in_app` (→ `mitteilungen` via `createMitteilung`), `whatsapp`, `email`, `web_push`.
- `notification_preferences` (quiet-hours, opt-outs) + `decideDeliveries`.

Heute schreiben die Rückruf-Wege `mitteilungen`/WA **direkt von Hand** statt über diese Quelle.
Das ist genau das „Funktions-Herumgefuchtel", das wir beseitigen.

**Impedanz, die wir lösen müssen:** Die Pipeline ist **claim-/user-zentrisch**
(`computeRecipients` braucht `fall_id`, löst Claim-Beteiligte als User-IDs auf; `whatsappHandler`
holt die Nummer aus `profiles.telefon`). Rückrufe sind **lead-/extern** (kein Claim, Kunde ist kein
User, Dispatcher ist keine Fall-Rolle). Es gibt aber den `task.*`-Sonderfall, der Empfänger direkt
aus dem Payload nimmt — der Andockpunkt. Und die `mitteilungen`-`'anruf'`-Kategorie ist mangels
Anruf-Events bis heute leer — Rückrufe füllen sie sinnvoll.

---

## 2. Ziele / Nicht-Ziele

**Ziele**
- Eine kanonische DB-Quelle treibt **alles**: Rückruf-Zeile → Event → Worker → {Glocke, Kunde-WA, Team-Mail}.
- Schreiben über **ein RPC**, Dedup als **DB-Invariante** (kein App-Race), Lesen über **eine View**.
- Konsistente Zuweisung (kein `zugewiesen_an=niemand`).
- „Reservierung bestätigen" semantisch vom echten Rückruf trennen.
- Weg 7 reparieren (sichtbar in `/dispatch/rueckrufe`).

**Nicht-Ziele**
- Den Notification-Scheduler neu bauen — der bestehende Worker + Cron + `pg_net`-Ping reichen.
- `anruf_log`/`anruf_versuche`/`letzter_anruf_*` umbauen (Anruf-Historie, eigenes Konzept).
- Generischer Admin-Kalender-CRUD (`admin-termine-actions.ts`).
- `mitteilungen` als Bell-Store ersetzen — der `in_app`-Handler schreibt da bereits hin.

---

## 3. Architektur-Überblick (DB-first)

```
  TS-Writer (8)                      DATENBANK (kanonisch)                  Pipeline (bestehend)
  ─────────────                      ─────────────────────                  ───────────────────
  .rpc('rueckruf_upsert') ─────────► rueckruf_upsert()  ──► admin_termine
                                       │  (Dedup=partial unique idx,           │ (typ='rueckruf')
                                       │   Zuweisung in SQL)                    │
                                       │                              AFTER-Trigger
                                       │                                        │ INSERT
                                       ▼                                        ▼
  Reader (~10) ◄───────────────────  v_rueckrufe (View)            notification_events ──► Worker
                                                                     + pg_net-Ping            │ fan-out
                                                                                              ▼
                                                                    {in_app→mitteilungen, whatsapp→Kunde, email→Team}
```

Notification-Logik lebt damit in **Trigger (Enqueue) + `EVENT_MATRIX` (Policy) + Pipeline (Delivery)** —
**null** hand-geschriebene Notification in den Rückruf-Flows.

---

## 4. Schicht 1 — Work-Item (`admin_termine`)

### 4.1 RPC `rueckruf_upsert` (SECURITY DEFINER)
Einziger Schreibweg. Signatur:
```sql
rueckruf_upsert(
  p_lead_id uuid, p_fall_id uuid,          -- genau einer gesetzt
  p_start timestamptz,                      -- NULL = ASAP (now()+5min)
  p_anlass text,                            -- 'kunde_anfrage'|'dispatcher_plan'|'flow_abbruch'|'public_form'|'disposition_followup'
  p_von_kunde boolean,
  p_zuweisen_an uuid DEFAULT NULL,          -- expliziter Owner (höchste Präzedenz)
  p_notiz text DEFAULT NULL
) RETURNS uuid   -- termin_id
```
Atomar in SQL: Zuweisung auflösen (§5) → `INSERT … ON CONFLICT (partieller Unique-Index)
DO UPDATE` → `qualifizierungs_phase`/`rueckruf_geplant_am` pflegen (§7). Feste Dauer **30 min**.
Persistiert `anlass` + `von_kunde` als Spalten (Audit + Trigger-Kontext).

### 4.2 Dedup als DB-Invariante
Partielle Unique-Indizes statt App-seitigem „find-then-insert":
```sql
CREATE UNIQUE INDEX … ON admin_termine (lead_id) WHERE typ='rueckruf' AND status='offen' AND lead_id IS NOT NULL;
CREATE UNIQUE INDEX … ON admin_termine (fall_id) WHERE typ='rueckruf' AND status='offen' AND fall_id IS NOT NULL;
```
Sicher (anders als ein globaler Index, vor dem AAR-637 warnte): nur **ein offener** pro Lead/Fall;
erledigte/abgesagte kollidieren nicht; verschiedene Leads kollidieren nicht.
**Migrations-Vorbedingung:** bestehende Doppel-offene-Rückrufe vorher bereinigen (ältere auf
`abgesagt`), sonst schlägt die Index-Erstellung fehl.

### 4.3 Read-View `v_rueckrufe`
Eine kanonische View — alle ~10 Reader (`dispatch/rueckrufe`, `dispatch/dashboard`, `mitarbeiter`,
`NeueTermineBadge`, `FallRueckrufSection`, `admin-kalender`, `RueckrufTerminPanel`, `flow/actions.ts`)
machen nur noch `select … from v_rueckrufe`. Spalten: termin + aufgelöster Bezug (Lead **oder**
Fall→`claims`), Name/Telefon/Email, `qualifizierungs_phase`, `anruf_versuche`/`letzter_anruf_*`,
berechnet `ist_ueberfaellig`, `gesehen`.

---

## 5. Schicht 2 — Verteilung (Zuweisung, in der RPC)
Präzedenz, in SQL aufgelöst:
1. **`p_zuweisen_an`** explizit (dispatcher_plan: handelnder User) — höchste Präzedenz.
2. **Bezug-Owner erben** — `leads.zugewiesen_an` bzw. `claims.kundenbetreuer_id`.
3. **Fallback fair verteilen** — least-loaded-Picker in SQL (zählt offene nicht-terminale Leads je
   echtem Dispatcher, filtert Test-Accounts). Portiert die Regel aus `lib/start-link/pick-dispatcher.ts`
   nach SQL, damit die Verteilung **eine** Quelle hat. (Da der Embed dem Lead schon bei Anlage einen
   Owner gibt, greift meist Regel 2; nur Public-Form trifft Regel 3.) **`zugewiesen_an=niemand`
   strukturell weg.**

---

## 6. Schicht 3 — Notification via `notification_events`

### 6.1 Trigger (Enqueue, DB-nativ)
`AFTER INSERT OR UPDATE ON admin_termine` `WHEN (typ='rueckruf')` → `INSERT notification_events`:
- `event_type`: `'rueckruf.erstellt'` (Neuanlage/Auto) bzw. `'rueckruf.kunde_wunsch'` (von_kunde, Wunschzeit).
- `payload`: `{ leadId, fallId, terminId, dispatcherUserId, kundeName, kundeVorname, kundeTelefon, vonKunde, startIso }`.
- danach `pg_net.http_post` → `/api/notifications/process` `{eventId}` (instant; **Cron */5min als
  garantierter Fallback**). Secret/URL aus DB-Setting bzw. `vault` (Plan-Detail).

### 6.2 Pipeline-Erweiterung (additiv, das ist die „OP")
1. **`EVENT_MATRIX`**: `rueckruf.erstellt` → `dispatch: ['in_app']`, `admin: ['in_app']`;
   `rueckruf.kunde_wunsch` → zusätzlich `kunde: ['whatsapp']` (Kunde-Bestätigung). Priorität `urgent`.
2. **`dispatch`-Rolle** in `Role` + `ROLE_MAP` (in-app-Handler) ergänzen.
   `mitteilungen.empfaenger_rolle='dispatch'` ist bereits zulässig (Weg 3 nutzt es heute).
3. **fan-out-Sonderfall** für `rueckruf.*` (analog `task.*`): Empfänger direkt aus Payload —
   `dispatcherUserId` (Bell, Rolle `dispatch`) + synthetischer Kunde-Empfänger mit `kundeTelefon`.
   Kein `fall_id` nötig.
4. **`whatsappHandler`**: bei `rueckruf.*` die Nummer aus `payload.kundeTelefon` nehmen (Lead-Kunde =
   kein User → kein `profiles`-Lookup). Kleiner, gezielter Zweig.
5. **in-app-Mapping** für `rueckruf.*` → Titel „Rückruf: {Name}", **`kategorie='anruf'`** (füllt die
   bislang leere Anruf-Kategorie), `kontext_typ='lead'`/`route_url=/dispatch/rueckrufe?open=…`.
6. **WA-Template** Rückruf-Bestätigung in `lib/notifications/templates/whatsapp.ts`.

Damit: Glocke + Kunde-WA + Team-Mail laufen durch **eine** Pipeline mit Retry/Preferences/Audit.

---

## 7. Schicht 4 — Reservierung ≠ Rückruf (Semantik-Trennung)
Weg 4 (Embed-Auto, `start=now+5min`, „dauernd überfällig") **entfällt**. „Offene Reservierung
bestätigen" = `gutachter_termine.status='reserviert'` (Basis: `v_lead_termin_gutachter` #2959 +
`LeadTerminGutachterBanner`). Echter Rückruf im Embed nur noch bei `von_kunde=true` (Weg 5).
**Eigentümer:** aktive `kitta/aar-956-embed-reservierung-rueckruf`-Linie (deren `reservierungs-rueckruf.ts`).

---

## 8. Datenmodell-Entscheidungen
- **Neue Spalten** auf `admin_termine`: `anlass text`, `von_kunde boolean` (Audit + Trigger-Kontext).
- **Flag-Regel:** RPC setzt `qualifizierungs_phase='rueckruf'` + `rueckruf_geplant_am`; **fasst
  `leads.status` nicht an** — `pickRoundRobinDispatcher` zählt `status='rueckruf'` als Last; der Lead
  hat ohnehin einen nicht-terminalen Status. Public-Form-Neuleads behalten `status='rueckruf'` aus
  `createLead`. Weg 7 verliert seinen nackten `status='rueckruf'`-Write.
- **`rueckruf_geplant_am`** bleibt, RPC-konsistent gepflegt (Drop→View = späterer Hygiene-Schritt).
- **`anruf_log`/`anruf_versuche`/`letzter_anruf_*`** unangetastet.

---

## 9. Migration der 8 Wege
Alle → `.rpc('rueckruf_upsert', …)`:

| Weg | anlass / von_kunde | Effekt-Änderung |
|---|---|---|
| 1 saveRueckruf | dispatcher_plan / false (p_zuweisen_an=user) | + Glocke via Pipeline |
| 2 saveFallRueckruf | dispatcher_plan / false | + Glocke + GCal-Konsistenz; 15→30m |
| 3 public-form | public_form / true (istNeuerLead) | zugewiesen statt niemand; Team-Mail via Pipeline |
| 4 embed reservation | **entfällt** | → `gutachter_termine`-Sicht (§7) |
| 5 embed danke | kunde_anfrage / true | konsistent via Pipeline |
| 6 disposition-followup | disposition_followup / false | via RPC |
| 7 aendereTerminFlow | flow_abbruch / true (p_start=NULL) | **echtes admin_termine → sichtbar** |
| 8 BeratungModal | public_form / true | konsistent (Audit beim Umbau) |

**GCal-Sync** wird ein Pipeline-Channel `gcal` (Handler ruft `syncAdminTerminCalendarEvent`), damit
alle Wege gleich syncen statt nur 1/6 — niedrige Priorität, darf WP-C-Nachzügler sein.

---

## 10. Testing
- **pgTAP** (Extension verfügbar, im Plan aktivieren) für RPC + Trigger + Unique-Index: Dedup-Invariante, Zuweisungs-
  Präzedenz, Event-Enqueue bei Insert/Update.
- **vitest** für die Pipeline-Erweiterung: fan-out-Sonderfall (`rueckruf.*` → dispatcher+kunde),
  WA-Handler Payload-Telefon-Zweig, in-app-Mapping.
- **Integration/Smoke:** je Weg ein offener Rückruf, Glocke beim Owner, Kunde-WA nur bei `von_kunde`,
  Weg 7 erscheint in `/dispatch/rueckrufe`.
- **Regression:** Claim-Stage-Events (`fall.created`, `sa.signed`, …) unverändert grün (fan-out-
  Sonderfall ist additiv); alle Reader über `v_rueckrufe` unverändert.

---

## 11. Arbeits-Verteilung (Work-Packages)

| WP | Inhalt | Surface | Kollision |
|---|---|---|---|
| **A — DDL-Fundament** (ich) | Spalten `anlass`/`von_kunde` · Daten-Dedup · partielle Unique-Indizes · `rueckruf_upsert`-RPC + SQL-Picker · `v_rueckrufe` · Trigger (Enqueue+pg_net) | `apply_migration` (Regel 2), getrackt | **gering** (additiv) |
| **B — Pipeline-Erweiterung** (ich) | `EVENT_MATRIX` + `dispatch`-Rolle + fan-out-Sonderfall + WA-Payload-Telefon + in-app-Mapping + WA-Template | `lib/notifications/*` (shared!) | **koordinieren** — Shared-System |
| **C — Writer-Repoint** (ich) | 7 Wege → `.rpc()` (inkl. Weg 7-Fix), Reader → `v_rueckrufe` | bestehende Action-Files, Boy-Scout | gering, sequenziell |
| **D — Reservierung-Trennung** (Embed-Linie) | Weg 4 raus + „offene Reservierungen"-Sicht | `reservierungs-rueckruf.ts` | **deren Revier** — Handoff |

**Reihenfolge:** A → B (gated auf A) → C (gated auf A+B, ein Weg pro PR, Build+Smoke je Schritt) →
D parallel/danach. Jeder Schritt eigener PR.

**Koordination:** WP-B berührt das geteilte Notification-System; vor Touch Memory-Marker + Abgleich
mit Sessions, die `lib/notifications/*` anfassen. WP-A-Migration + WP-C-Repoint von
`reservierungs-rueckruf.ts` mit der `embed-reservierung-rueckruf`-Linie abstimmen (ersetzt deren
app-seitigen `upsertReservierungsRueckruf`/#2993).

---

## 12. Risiken & offene Punkte
- **OP am Shared-Notification-System** (WP-B) — additiv + getestet, darf Claim-Events nicht brechen.
- **`pg_net`-Secret/URL** für den Trigger-Ping — via DB-Setting/`vault` lösen (Plan-Detail); Cron-
  Fallback macht Delivery auch ohne Ping garantiert (≤5min).
- **Daten-Dedup vor Unique-Index** — sonst schlägt die Index-Migration fehl. Erst zählen/bereinigen.
- **`von_kunde` Kunde-WA** braucht echte Nummer; Baileys-Fail ist non-critical (Worker-Retry/skip).
- **Latenz:** ohne `pg_net`-Ping bis 5min (Cron). Mit Ping instant.
- **WP-D-Abhängigkeit:** bis Weg 4 entfällt, erzeugen Embed-Reservierungen weiter „überfällige"
  Pseudo-Rückrufe. WP-A/B/C sind unabhängig lieferbar.

---

## 13. Definition of Done
- Alle Wege (außer 4 = entfällt) gehen durch `rueckruf_upsert`; Reader über `v_rueckrufe`.
- Jeder Rückruf erzeugt **genau ein** `notification_events` → Glocke beim Owner (mitteilungen),
  Kunde-WA nur bei `von_kunde`, Team-Mail nur bei Neulead — alles über die eine Pipeline.
- Dedup ist DB-Invariante; `zugewiesen_an=niemand` unmöglich.
- Weg 7 sichtbar in `/dispatch/rueckrufe`; Embed-Reservierungen erzeugen keine Pseudo-Rückrufe (WP-D).
- pgTAP + vitest + Build + 4 Ratchets grün; Claim-Stage-Notifications unverändert.
