# Offline-First-Datenlayer für Feld-Rollen — Design-Spec

**Datum:** 2026-07-13
**Branch:** `kitta/offline-first-field-cache` (aus `origin/staging`)
**Status:** Design abgenommen (Brainstorming-Gate) → bereit für writing-plans
**Autor:** Session offline-first (Aaron approved 2026-07-13)

---

## 1 · Problem & Kontext

Die App hat bereits eine **funktionierende, aber schmale** Offline-Infrastruktur (KFZ-180, AAR-388, KFZ-171, C13), gebaut für den **SV-Feldmodus** (Funklöcher Eifel/Sauerland, Tiefgaragen):

- **Storage:** `src/lib/offline/outbox.ts` — Dexie/IndexedDB, 2 Tabellen `upload_outbox` + `gps_outbox`, Idempotency-Key, Status `pending→uploading→failed→dead`, `MAX_RETRIES=10`, Crash-Recovery.
- **Sync:** `sync-outbox.ts` / `sync-gps-outbox.ts` — exp. Backoff (1s→10min), Auto-Sync bei `online`, 23505-UNIQUE = „schon synced".
- **Service-Worker:** `public/sw.js` — cached NUR statische Assets + TTS + Mapbox-Tiles; lässt Navigation/API/RSC **bewusst** durch (kein Offline-Lesen; CMM-14-Narbe).
- **UI:** `OfflineBanner` + `ServiceWorkerBoot` + `PersistStorageToast` global; `OutboxBadge` in admin/kunde/gutachter/faelle.

**Die Lücke:** Offline erfasst werden nur **2 Datentypen** — Dokument-Uploads (`fall_dokumente`) und GPS-Positionen. Alles andere (Formulare, Status, Chat, Lead-Anlage, Gutachten-Werte, Unterschriften) geht **nicht** offline: ohne Netz schlägt die Server-Action fehl und die Eingabe ist verloren. **Offline-Lesen** existiert gar nicht.

**Ziel:** Ein sauberer, generalisierter Offline-First-Datenlayer, damit die **Feld-Rollen** (SV, Kunde, Werkstatt) ihre echten Daten verlust-sicher offline erfassen **und** ihr aktives Arbeitsset offline lesen können. Sync bei Reconnect.

---

## 2 · Scope-Entscheidungen (abgenommen)

| Entscheidung | Wahl |
|---|---|
| Rollen-Scope | **A — Feld-Rollen zuerst**: SV, Kunde, Werkstatt. Office-Rollen (Admin/Dispatch/Makler/Kanzlei) bekommen die Plumbing „gratis", aber keine eigenen Offline-Flows. |
| Offline-Lesen | **Ja**, dazu (view-through Snapshots). |
| Architektur | **Ein Dexie-Layer**: Snapshot-Store (Read) + Mutation-Outbox mit Handler-Registry (Write), kein SW-RSC-Cache. |
| Working-Set | **view-through automatisch** (was du online öffnest, ist danach offline da) + SV-Feldmodus-Prefetch der Tagestermine. |
| Rollen-Reihenfolge | **SV → Kunde → Werkstatt** (SV-Write-Hälfte existiert bereits = geringstes Risiko). |
| Bestehende Outboxes | **Vereinen** zu einem `mutation_outbox` (Dexie v3-Migration, behavior-preserving in Slice 0). |

### Non-Goals (YAGNI)

- Keine eigenen Offline-Flows für Office-Rollen (WLAN-gebunden).
- **Kein** Service-Worker-Caching von RSC-Streams / Navigation / Auth (CMM-14 — führte zu weißer Seite + stale Auth). SW bleibt static-only.
- Keine generische „beliebige Server-Action aufzeichnen & replayen"-Maschine — nur getippte, klassifizierte Operationen.
- Keine SV-Unterschrift offline (existiert im Feldmodus real nicht — bewusst weggelassen).
- Keine React-Native-Mobile-App (separates Repo; dieses Design ist Web-PWA).

---

## 3 · Architektur — ein Dexie-Layer, zwei Hälften, eine Kohärenz-Schleife

```
src/lib/offline/
  db.ts         Dexie-Schema v3: mutation_outbox + snapshots (+ Migration aus upload_outbox/gps_outbox)
  ops.ts        Typen: OutboxOp, ReplayClass, ReplayResult, OfflineHandler
  registry.ts   registerHandler(kind, handler) · getHandler(kind) — verallgemeinert uploadSingleItem
  enqueue.ts    enqueueOp(kind, {payload, blob?, entity_ref?}) → schreibt Op + optimistischer Snapshot-Patch
  snapshot.ts   saveSnapshot(key, data) · readSnapshot(key) · evictLRU()
  use-offline-data.ts   useOfflineData(key, { serverData?, scope, role }) React-Hook
  sync.ts       drainOutbox() · Backoff · Dead-Letter · registerOnlineSync (aus sync-outbox.ts generalisiert)
  handlers/
    fall-dokument-upload.ts   (Klasse A — migriert aus sync-outbox.ts)
    gps-position.ts           (Klasse A — migriert aus sync-gps-outbox.ts)
    <weitere pro Slice>
  + reuse unverändert: use-online-status.ts, use-pending-count.ts

Grenze: NUR die Feld-Views lesen/schreiben durch diesen Layer.
        Rest der App unverändert. SW bleibt static-only.
```

**Kohärenz-Kern:** Ein Offline-Write landet nicht nur in der Outbox, `enqueueOp` **patcht sofort den zugehörigen Snapshot** (via `entity_ref` + `handler.optimisticPatch`). Dadurch sieht der Feld-Nutzer seine eigene Eingabe sofort, obwohl noch nichts hochgeladen ist. Read + Write sind dieselbe lokale Wahrheit.

### 3.1 Kern-Typen (Vertrag für die Pläne)

```ts
// ops.ts
type ReplayClass = 'A' | 'B' | 'C' | 'D'          // s. §5
type OutboxStatus = 'pending' | 'uploading' | 'failed' | 'dead'

interface OutboxOp {
  id?: number
  kind: string                       // Registry-Key, z.B. 'fall_dokument_upload'
  idempotency_key: string            // UUID
  replay_class: ReplayClass
  payload: unknown                   // JSON-serialisierbar (kind-spezifisch, zod-validiert im Handler)
  blob?: Blob                        // optional (Uploads) — Dexie speichert Blob nativ
  blob_meta?: { file_name: string; content_type: string; file_size: number }
  entity_ref?: { scope: string; id: string }   // für optimistischen Snapshot-Patch + Invalidierung
  status: OutboxStatus
  retry_count: number
  last_attempt_at: number | null
  last_error?: string
  created_at: number
}

type ReplayResult =
  | { outcome: 'done' }              // Effekt persistiert (oder war schon da) → Op löschen
  | { outcome: 'retry'; error: string }   // transient → Backoff
  | { outcome: 'conflict'; error: string } // server moved on (CAS-Guard) → Op löschen, Snapshot-Refresh gewinnt

interface OfflineHandler {
  kind: string
  replay(op: OutboxOp): Promise<ReplayResult>
  optimisticPatch?(current: unknown, op: OutboxOp): unknown   // lokaler Snapshot-Patch beim Enqueue
}
```

```ts
// snapshot.ts
interface Snapshot {
  key: string          // '<scope>:<id>', z.B. 'feldmodus-fallakte:<claimId>'
  scope: string        // 'feldmodus-fallakte' | 'kunde-flow' | ...   (LRU-Eviction pro scope)
  role: string         // Besitzer-Rolle → Multi-Account-Sicherheit (kein Cross-User-Leak)
  data: unknown        // serialisiertes View-Model (JSON-safe)
  saved_at: number
  last_read_at: number // LRU
}
```

```ts
// use-offline-data.ts
function useOfflineData<T>(
  key: string,
  opts: { serverData?: T; scope: string; role: string },
): { data: T | null; source: 'live' | 'snapshot' | 'empty'; staleSince: number | null }
// serverData vorhanden (Online-SSR): persistiert Snapshot, source='live'
// sonst: liest Snapshot → source='snapshot'+staleSince, oder source='empty'
```

---

## 4 · Datenfluss

| Situation | Verhalten |
|---|---|
| **Online lesen** | Server-Shell liefert View-Model → `useOfflineData(serverData)` spiegelt in `snapshots` → rendert `source='live'` |
| **Offline lesen** | `useOfflineData` liest Snapshot → rendert mit „Offline · Stand vor X" · leerer Offline-State (`source='empty'`) wenn nichts gecached |
| **Offline schreiben** | `enqueueOp` → Op in `mutation_outbox` (idempotency_key) → **optimistischer Snapshot-Patch** → UI „lokal gespeichert, wird synchronisiert" |
| **Reconnect** | `online`-Event → `drainOutbox` (nach Backoff) → `handler.replay` → `done`/`conflict`: Op weg + Snapshot-Refresh · `retry`: Backoff/Dead-Letter |

---

## 5 · Replay-Sicherheitsklassen — das Korrektheits-Herz

Jede Op bekommt eine **Klasse**; der Handler wird zur Klasse geschrieben; was nicht sicher idempotent geht, wird **explizit online-only eingezäunt** (nicht still gequeued → sonst Dupes/State-Korruption).

| Klasse | Mechanismus | Replay-Verhalten |
|---|---|---|
| **A · Idempotent-Create** | `idempotency_key` + DB-UNIQUE-Constraint; Storage-Pfad enthält Key (`upsert:true`) | Erstinsert = ok; Retry → 23505 → „schon synced" → Op sauber löschen |
| **B · Idempotent-Field-Set** | LWW per entity-id; Replay = „setze Feld = erfasster Wert" | Mehrfach-Replay = idempotent (gleicher Wert). Letzter Offline-Wert gewinnt; Cross-User → server-autoritativ |
| **C · Guarded-Set** | Bedingtes Update `IF <feld> IS NULL` (Einweg-Flags/Timestamps) | No-op wenn schon gesetzt → natürlich idempotent |
| **D · Compare-and-Set** | Op trägt **erwarteten Vorzustand**; Replay wendet nur an, wenn Server noch in diesem Zustand ist | Guard trifft nicht → `conflict` → No-op, nächster Online-Read/Snapshot gewinnt (verhindert „doppeltes Advance") |
| **Zaun · Online-only** | nicht offline-fähig, im UI klar markiert (Button disabled offline / „braucht Verbindung") | wird gar nicht gequeued |

**Kern-Prinzip:** State-Machine-Übergänge (Klasse D) werden als **Compare-and-Set** formuliert — die Op trägt den erwarteten Server-Vorzustand mit; beim Replay wird nur mutiert, wenn der Server noch dort steht. So kann ein zweifach abgespielter „nächster Schritt" nie zweimal weiterschalten.

---

## 6 · Konkrete Operationen pro Rolle (gegroundet)

Quelle: Codebase-Kartierung 2026-07-13 (SV + Kunde sauber verifiziert; Werkstatt-Portal-Details zur Implementierungszeit zu bestätigen — s. §12).

### 6.1 SV (Gutachter) — `src/app/gutachter/**`, v.a. `feldmodus/`

| Operation | Ziel | Klasse | Status |
|---|---|---|---|
| Dokument/Foto-Upload | `fall_dokumente` (+`pflichtdokumente`), Storage `fall-dokumente` | **A** | ✅ existiert (`uploadDokumentToOutbox` → `addToOutbox`) |
| GPS-Position | `POST /api/sv/position-batch` | **A** | ✅ existiert (`addGpsPosition` → batch) |
| Vor-Ort-Notizen | `auftraege.sv_notizen_vor_ort` | **B** | neu |
| angekommen / besichtigung-gestartet | `gutachter_termine` Timestamps (`sv_angekommen_am`, `besichtigung_gestartet_am`) | **C** (bereits als `IF !feld` implementiert) | neu (offline-fähig machen) |
| Stop abschließen + weiter (`completeAndAdvance`) | `gutachter_termine.abschluss_zeit/status` **[C]** + `sv_tages_session`-Advance **[D-CAS]** | **C + D** | neu (Session-Advance als CAS) |

**Offline-Read (SV):** `feldmodus-fallakte:<claimId>` (`loadFeldmodusFallakteData`), `feldmodus-route:<svId>:<date>` (Tagestermine/Stops), `sv-session:<svId>` (`getTagesSession`). Feldmodus ist bereits stark client-getrieben → guter Fit. Realtime-Subscriptions bleiben online-only (kein Offline-Push).

### 6.2 Kunde — Roadside `/flow/[token]` + `/kunde/**`

| Operation | Ziel | Klasse | Status |
|---|---|---|---|
| Flow-Schritte (Stammdaten/Quali/Termin-Choice) | `leads.*` per `lead_id` | **B** | neu |
| Foto/Dok-Upload (`uploadDokumentViaAnfrageToken`) | `fall_dokumente` / `dokument_upload_anfragen` slots | **A** | teils (`FallDokumentDropzone` vorhanden) |
| Signatur (`uploadFlowSignatur`) | Storage `unterschriften`, timestamp-keyed | **A** (idempotency_key in Pfad ergänzen) | neu |
| Finaler Submit (`signSAandCreateFall` → claim+faelle) | `claims`, `faelle`, `fall_dokumente` | **A** (token-gated idempotent) | neu (als terminale Op queuen) |
| Account-Anlage (`createKundeAccount` → `auth.users`) | Auth | **Zaun** | online-only |

**Offline-Read (Kunde):** `kunde-flow:<token>` (Lead+Flow-Daten beim Token-Load — Roadside), `kunde-fall:<claimId>` (`KundeFallView` aus `get-kunde-faelle.ts`). FlowWizard ist bereits Client mit Server-Inject → Snapshot einfach persistierbar.

**Roadside-Sequenz:** Kunde öffnet Magic-Link (online, Token+Lead werden gesnapshottet) → erfasst offline alle Schritte + Fotos + Signatur → bei Reconnect drainen: Field-Sets [B] + Uploads [A] + finaler `signSAandCreateFall` [A] → Claim entsteht. Account-Anlage passiert später im Portal (online).

### 6.3 Werkstatt — Portal (`v_werkstatt_auftrag` / `WerkstattAuftragDetail`, `reparatur_termine`)

| Operation | Ziel | Klasse | Status |
|---|---|---|---|
| Status-Update / „Reparatur abgeschlossen" | `reparatur_termine.status` (+ ggf. `erledigt_am`) | **C** (guarded) bzw. **D-CAS** | neu |
| Schlussrechnung / KVA / Reparatur-Foto | `fall_dokumente`, Storage | **A** (`FallDokumentDropzone` wiederverwendbar) | Muster vorhanden |

**Offline-Read (Werkstatt):** `werkstatt-auftrag:<id>` (`v_werkstatt_auftrag`). Slice 3.
**⚠ Zu verifizieren:** genaue Tabelle (`reparatur_termine` vs. Legacy `repairs`), Portal-Route, RLS-Guards (s. §12).

---

## 7 · Offline-Lesen — view-through Snapshots

**Refactor-Muster pro Ziel-View** (klein & isoliert):
1. Dünne **Server-Shell** bleibt für den Online-SSR-Pfad (fetch des View-Models).
2. **Client-View** rendert aus den Daten und wird von `useOfflineData(key, { serverData, scope, role })` umhüllt.
3. Online: `serverData` → Snapshot persistiert + gerendert. Offline/Navigation: aus Snapshot gerendert + „Offline · Stand X"-Strip. Nichts gecached → leerer Offline-State.

**Populations-Strategie:** view-through (öffnen = cachen) für alle drei Rollen. Zusätzlich **SV-Feldmodus-Prefetch**: beim Online-Öffnen des Feldmodus werden die Fallakten der heutigen Termine vorab gesnapshottet (der SV kann die Tour durchfahren, ohne jeden Fall vorher online geöffnet zu haben).

**Snapshot-Eviction:** LRU pro scope, Cap ~50 Entities gesamt (Default, konfigurierbar). `requestPersist` (existiert) reduziert Browser-Eviction-Risiko.

---

## 8 · Komponenten / UX — reuse-schwer

| Baustein | Aktion |
|---|---|
| `OfflineBanner` (global) | reuse unverändert |
| `OutboxBadge` | erweitern: zählt **alle** kinds (nicht nur upload) via `use-pending-count` |
| `DeadLetterDialog` | reuse; Fehlermeldungen pro kind verständlich machen |
| `PersistStorageToast`, `ServiceWorkerBoot` | reuse unverändert |
| `useOnlineStatus`, `usePendingCount` | reuse (usePendingCount auf kinds generalisieren) |
| **neu** `useOfflineData` | Hook (§3.1) |
| **neu** „Offline · Stand X"-Strip | kleine Shared-Component, aus vorhandenen Tokens (`warning`/`info`) |
| **neu** „lokal gespeichert"-Indicator | aus `FallDokumentDropzone` in Shared extrahieren, wiederverwenden |

Keine neuen Design-Tokens. Umlaute in allen nutzersichtbaren Strings (Brand-Standard).

---

## 9 · Fehlerbehandlung & Konflikte

- **Retry/Backoff/Dead-Letter:** reuse (`BACKOFF_MS=[1s,5s,30s,2min,10min]`, `MAX_RETRIES=10`, `recoverOutbox` beim App-Start).
- **Konflikte:** Creates idempotent (23505) · Field-Sets LWW/server-autoritativ · Guarded-Sets No-op · State-Machine als CAS (`conflict` → Snapshot-Refresh gewinnt).
- **Storage/Quota:** `requestPersist` (existiert) + Snapshot-LRU-Cap + Blob-Größen-Limit (z.B. Foto-Downscale vor Enqueue — prüfen, ob bereits im Upload-Pfad).
- **Auth/RLS beim Replay:** eingeloggte Rollen → authentifizierter Client bei Reconnect. Magic-Link → Token.
  **Token-TTL-Falle:** Läuft der Flow-Token ab, während der Kunde offline ist, scheitert der finale Submit beim Replay → landet **sauber im Dead-Letter** mit klarer Meldung („Sitzung abgelaufen — bitte Link erneut öffnen"). Kein stiller Datenverlust. (Follow-up-Option: Token-Lebensdauer für angefangene Flows verlängern.)

---

## 10 · Testing (Prod-Smoke-Mandat)

- **Unit (vitest):** Handler-Idempotenz (2× Replay = 1 Effekt) pro Klasse; `enqueueOp` + optimistischer Patch; Snapshot read/write/LRU; Backoff; CAS-Guard-Logik (D).
- **Integration:** offline enqueue → online drain → Server-State korrekt **ohne Dupes** (23505-Pfad + CAS-conflict-Pfad).
- **E2E (Playwright, `context.setOffline(true)`):** pro Rolle — offline gehen, erfassen, reconnect, „synced" assert. **Auf prod** `PLAYWRIGHT_BASE_URL=https://app.claimondo.de` (Test-Konten `telefon=NULL`).
- **Behavior-preserving-Gate (Slice 0):** Feldmodus (Upload + GPS) verhält sich **identisch** — Regression-Beweis vor Merge.
- CI-Gates unverändert grün halten (component-set/knip/token-audit/i18n Ratchets).

---

## 11 · Slicing / Rollout — jede Slice = eigener writing-plans-Plan

- **Slice 0 · Foundation** — `mutation_outbox` + `snapshots` (Dexie v3-Migration aus `upload_outbox`/`gps_outbox`) + `registry.ts` + `enqueue.ts` + `snapshot.ts` + `use-offline-data.ts` + generalisierter `sync.ts`. Bestehende Upload+GPS als Registry-Handler re-wiren. **Behavior-preserving**, gegen Feldmodus validiert. → **Erster Plan.**
- **Slice 1 · SV** — Offline-Read (Fallakte + Route + Session-Snapshot) + Writes: Notizen [B], Timestamps [C], `completeAndAdvance` [C+D-CAS].
- **Slice 2 · Kunde** — Roadside `/flow/[token]` voll offline: Snapshot (Token+Lead) + Flow-Schritte [B] + Signatur [A] + finaler Submit [A]. Account = Zaun.
- **Slice 3 · Werkstatt** — Portal verifizieren, dann Status [C/D-CAS] + Uploads [A].

Diese Spec ist das **Dach**; jede Slice bekommt ihren eigenen Plan + PR (gegen `staging`, Regel 1).

---

## 12 · Offene Punkte / zur Implementierungszeit zu verifizieren

1. **Werkstatt-Portal-Realität:** Tabelle (`reparatur_termine` vs. `repairs`), Route, View-Model (`v_werkstatt_auftrag`), RLS-Guards. Der Kartierungs-Agent war hier unzuverlässig — vor Slice 3 sauber neu kartieren.
2. **Dexie v3-Migration:** In-flight-Items (`status='uploading'`) müssen migrationssicher überleben; alte Tabellen nach Migrate deprecaten (nicht hart droppen, bis alle Clients v3 haben).
3. **Foto-Downscale vor Enqueue:** prüfen, ob der bestehende Upload-Pfad bereits verkleinert (Quota-Schutz).
4. **CAS-Vorzustand für `sv_tages_session`:** exakten erwarteten Zustand (welche Felder) beim Enqueue festhalten.
5. **Kein DDL erwartet** in Slice 0/1/2 (nur Client-Layer + bestehende Server-Actions offline-fähig verdrahten). Falls doch eine Spalte fehlt (z.B. `idempotency_key` auf einem neuen Ziel) → über Supabase-Plugin (Regel 2).

---

## 13 · Betroffene Dateien (Grob-Map)

**Neu (Slice 0):** `src/lib/offline/{db,ops,registry,enqueue,snapshot,use-offline-data,sync}.ts`, `src/lib/offline/handlers/{fall-dokument-upload,gps-position}.ts`.
**Migriert/ersetzt:** `outbox.ts` (→ `db.ts` + `enqueue.ts`), `sync-outbox.ts` + `sync-gps-outbox.ts` (→ `sync.ts` + handlers). Alt-Exports als dünne Re-Exports halten, bis alle Call-Sites um sind (knip-Ratchet beachten).
**Consumer (Slice 1-3):** `gutachter/feldmodus/*`, `flow/[token]/*`, Werkstatt-Portal + die jeweiligen View-Models.
**Cross-Session-Hinweis:** `src/lib/offline/*` wird von der Feldmodus-Lane (SV) berührt — Koordinations-Marker anlegen, bevor Slice 0 gemergt wird.
