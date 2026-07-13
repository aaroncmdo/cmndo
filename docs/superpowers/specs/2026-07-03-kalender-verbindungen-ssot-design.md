# SP2a — `kalender_verbindungen` als Single Source of Truth (CalDAV-Storage-Konsolidierung)

**Datum:** 2026-07-03
**Kontext:** 2. Inkrement des universellen Kalender-Sync-Features. SP1 (`kitta/universal-kalender-sync`, PR #3534) hat die Sync-Engine assignee-generisch gemacht und die profil-gekeyte Tabelle `kalender_verbindungen` eingeführt — **aber** die CalDAV-Connect-UI schreibt weiterhin die alte SV-spezifische Tabelle `sv_kalender_verbindungen`, die die Engine nicht mehr liest. SP1 backfillte einmalig; neue/geänderte Verbindungen driften. SP2a behebt das durch Konsolidierung auf **eine** Quelle.

## Ziel

`kalender_verbindungen` (profil-gekeyt) wird die **einzige** Quelle für CalDAV-Verbindungen aller Rollen. Jeder Consumer von `sv_kalender_verbindungen` liest/schreibt stattdessen `kalender_verbindungen` per `profile_id`. Danach ist der SP1-Drift beseitigt und der Boden für rollen-generische Connect-UIs (KB in SP2b) bereitet.

## Nicht-Ziele (YAGNI)

- **Keine** KB-Connect-UI (SP2b).
- **Kein** Termin-Sync-Wiring (SP2c gutachter_termine / SP2d admin_termine).
- **Kein** DROP von `sv_kalender_verbindungen` — Regel 3: Retire erst als separater Cleanup-PR nach Prod-Verifikation. Die alte Tabelle bleibt intakt (Rollback-Sicherheit).
- **Google** (`profiles.google_*`) bleibt unangetastet — bereits rollen-generisch.

## Architektur

**Schlüssel-Fakt:** `profiles.id == auth.users.id`, und `sachverstaendige.profile_id → profiles.id`. Für den **eingeloggten** User gilt daher: `profile_id == user.id`. Die Connect-Action keyt direkt auf `user.id` (kein SV-Umweg). Nur wenn ein Consumer die Verbindung eines **anderen** Users anzeigt (Admin-SV-Detail), wird `sachverstaendige.profile_id` für die betreffende SV-`id` aufgelöst.

### 1. Schema (additive Migration, Regel 2 — `apply_migration`)

`kalender_verbindungen` (SP1) hat 10 Spalten; `sv_kalender_verbindungen` hat 5 zusätzliche, die Consumer brauchen. Ergänze **additiv** (alle nullable — Bestand hat sie nicht):

| Spalte | Typ | Zweck / Consumer |
|---|---|---|
| `calendar_display_name` | text NULL | Anzeigename des gewählten Kalenders (Views, Connect-UI) |
| `provider_label` | text NULL | z.B. „iCloud"/„Fastmail" (Views, Connect-UI) |
| `connected_at` | timestamptz NULL | „verbunden seit" (Views, Onboarding-Status) |
| `last_sync_at` | timestamptz NULL | Healthcheck-Cron schreibt Zeitstempel |
| `fehler_task_id` | uuid NULL | Healthcheck verknüpft Fehler-Task (FK-Ziel wie `sv_kalender_verbindungen.fehler_task_id_fkey` — Ziel während Impl. verifizieren; falls FK-Ersatz Aufwand ist, plain nullable uuid, da nur der Healthcheck es setzt/liest) |

`updated_at`: `kalender_verbindungen` hat nur `erstellt_am`. Falls der Healthcheck/Connect ein `updated_at` schreibt, additiv ergänzen — sonst weglassen (Impl.-Detail, YAGNI). 

**Re-Backfill (idempotent) in derselben Migration:** Upsert **aller** aktuellen `sv_kalender_verbindungen`-Zeilen nach `kalender_verbindungen` (per `sachverstaendige.profile_id`, `onConflict (profile_id,provider)`), inkl. der 5 neuen Spalten. Fängt Verbindungen, die zwischen SP1-Backfill und SP2a-Deploy über die alte UI angelegt wurden. (SP1 backfillte nur die Kernspalten von 4 Zeilen; hier werden display_name/provider_label/connected_at/last_sync_at/fehler_task_id nachgezogen.)

### 2. Connect-Action generalisieren

Heute: `src/app/gutachter/einstellungen/kalender/caldav-actions.ts` — `requireSv()` + Upsert `sv_kalender_verbindungen` per `sv_id`.

Neu: **geteiltes `'use server'`-Modul** `src/lib/kalender/connect/caldav-connect-actions.ts` mit profil-generischen Actions:
- `testCaldavConnection(input)` → unverändert in der Logik (CalDAV-Login testen, iCloud-Retry, Kalenderliste). Auth-Guard: `requireAuthedProfileId()` (neuer Helper: aktueller User → `user.id` = `profile_id`; kein SV-Zwang).
- `saveCaldavConnection(input)` → Upsert **`kalender_verbindungen`** mit `profile_id = user.id`, `onConflict 'profile_id,provider'`, schreibt server_url/username/password_encrypted/calendar_url/calendar_display_name/provider_label/connected_at/last_sync_at + `last_error=null`.
- `disconnectCaldav()` → Delete `kalender_verbindungen` per `profile_id + provider='caldav'`.
- Result-Shapes **unverändert** (`{ success: … }` — CalDavConnectModal ist der Consumer; API-kompatibel halten, damit das Modal-Markup unverändert bleibt).
- `revalidatePath`: die kalender-relevanten SV-Pfade (`/gutachter/einstellungen/kalender`, `/gutachter/einstellungen`, `/gutachter/willkommen`) + für SP2b später `/mitarbeiter/profil`. Über-Revalidierung ist harmlos.

`src/components/CalDavConnectModal.tsx`: Import von `@/app/gutachter/einstellungen/kalender/caldav-actions` → auf das geteilte Modul umbiegen. Die alte `caldav-actions.ts` wird gelöscht (einziger Consumer = das Modal).

### 3. Consumer-Repoint (`sv_kalender_verbindungen` → `kalender_verbindungen` per `profile_id`)

Alle Lese-/Schreibstellen (aus Grep verifiziert). `profile_id`-Quelle je Site:

| # | Datei | Op | profile_id-Quelle |
|---|---|---|---|
| 1 | `gutachter/einstellungen/kalender/caldav-actions.ts` | write | → ersetzt durch geteiltes Modul (user.id) |
| 2 | `gutachter/einstellungen/kalender/page.tsx:34` | read | `user.id` (eingeloggter SV) |
| 3 | `gutachter/einstellungen/page.tsx:35` | read | `user.id` |
| 4 | `gutachter/willkommen/page.tsx:144` | read | `user.id` |
| 5 | `lib/onboarding/lade-sv-onboarding-phasen.ts:97` | read | `user.id` (Funktion bekommt bereits die User-/Profil-id) |
| 6 | `lib/private-events/list-events-for-date.ts:82` | read | `user.id`/Profil (Funktion bekommt die id) |
| 7 | `admin/sachverstaendige/[id]/page.tsx:44` | read | `sachverstaendige.profile_id` für die betrachtete SV-`id` (auflösen) |
| 8 | `lib/kalender/caldav/healthcheck.ts` (5 refs) + `api/cron/caldav-healthcheck/route.ts` | read+write | Row-basiert (per `id`), reine Tabellennamen-Swap; schreibt `last_error/last_error_at/fehler_task_id/last_sync_at` |

Nach dem Repoint darf **kein** produktiver Lese-/Schreibpfad mehr `sv_kalender_verbindungen` referenzieren — außer der Tabellendefinition/Typen (die bis zum Retire bleiben). Verifikation per Grep (Dead-Read-Check).

**Healthcheck-Detail:** `healthcheck.ts` iteriert alle aktiven CalDAV-Verbindungen, pingt sie, setzt `last_error`/`fehler_task_id`. Nach dem Swap arbeitet es auf `kalender_verbindungen` — die 5 neuen Spalten müssen vorher existieren (Migration-Reihenfolge). Die Fehler-Task-Erzeugung (falls `fehler_task_id` einen echten Task referenziert) bleibt logisch identisch.

## Datenfluss (unverändert für den User)

SV/(später KB) im Profil → „CalDAV verbinden" → `CalDavConnectModal` → `testCaldavConnection` (geteilt) → Kalender wählen → `saveCaldavConnection` (geteilt, schreibt `kalender_verbindungen` per `user.id`). Der Healthcheck-Cron pingt periodisch `kalender_verbindungen` und markiert Fehler. Die Engine (SP1) liest `kalender_verbindungen` → sieht neue Verbindungen sofort (Drift weg).

## Error-Handling

Server-Actions behalten das bestehende `{ success: boolean; error? }`-Shape (das Modal erwartet es). Neuer Auth-Helper `requireAuthedProfileId()` liefert `{ ok:true; profileId } | { ok:false; error }` (kein throw). Non-kritische Sub-Ops (revalidate) unkritisch.

## Testing

- **Unit (vitest):** `requireAuthedProfileId` (User vorhanden → profileId=user.id; kein User → ok:false). Die `saveCaldavConnection`-Payload-Konstruktion (die reinen Teile: Provider-Auflösung, serverUrl-Normalisierung, encrypt-Aufruf) soweit ohne echten CalDAV-Server testbar (Provider-Preset-Logik, Validierung wie „Server-URL muss http…"). CalDAV-Netz-I/O bleibt ungetestet (bestehendes Muster).
- **Build/tsc/Ratchets:** voll grün.
- **Dead-Read-Grep:** nach Repoint 0 produktive `sv_kalender_verbindungen`-Referenzen (nur Typdef/Tabellendef).
- **Prod-Smoke (READ, Regel 2):** Migration live (5 Spalten + Re-Backfill: die bestehenden SV-Zeilen in `kalender_verbindungen` tragen jetzt display_name/provider_label/connected_at). `select count(*) from kalender_verbindungen where provider='caldav'` == Anzahl in `sv_kalender_verbindungen` (kein Verlust). Consumer-Queries treffen `kalender_verbindungen` (Code-Review + Build). Ein echter SV-Reconnect (falls Test-Credential verfügbar) schreibt `kalender_verbindungen`, nicht die alte Tabelle — sonst per Code-Pfad + Migration bewiesen.

## Risiko & Rollback

Berührt deployten SV-CalDAV-Connect + Healthcheck-Cron + Onboarding-Status. Mitigation: additive Migration (keine Drops), idempotenter Re-Backfill (kein Datenverlust), `sv_kalender_verbindungen` bleibt vollständig erhalten. **Rollback:** Code-Revert genügt — die Consumer lesen dann wieder die (unveränderte, weiter befüllte) alte Tabelle; da der Backfill bidirektional-datengleich ist, kein Zustandsverlust. Retire der alten Tabelle bewusst separater PR nach Verifikation.

## Reihenfolge im SP2-Rahmen

SP2a (dieses Dokument) → SP2b KB-Connect-UI (klein, additiv auf dem geteilten Modul) → SP2c KB-Beratungstermine-Sync → SP2d Rückruf-Sync (`admin_termine` + CalDAV). Jedes Inkrement eigener Spec+Plan (TDD) + PR gegen `staging`.
