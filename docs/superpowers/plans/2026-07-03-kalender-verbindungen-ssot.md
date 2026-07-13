# SP2a — `kalender_verbindungen` als Single Source of Truth — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** `kalender_verbindungen` (profil-gekeyt) wird die einzige Quelle für CalDAV-Verbindungen; alle `sv_kalender_verbindungen`-Consumer werden darauf repointet. Behebt den SP1-Drift.

**Architecture:** Additive Spalten-Migration + idempotenter Re-Backfill → geteiltes profil-generisches Connect-Action-Modul (keyt `user.id`) → mechanischer Repoint aller ~10 Consumer inkl. Healthcheck-Cron (der für die SV-Task-Verlinkung `sachverstaendige` per `profile_id` auflöst).

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres), `apply_migration`-Plugin, vitest.

## Global Constraints

- **Regel 1:** Feature-Branch `kitta/kalender-verbindungen-ssot` (bereits erstellt, off SP1-HEAD), PR gegen `staging`, nie direkt `main`.
- **Regel 2:** DDL nur via `apply_migration` → `list_migrations` → File==Version. `execute_sql` nur READ.
- **Regel 3:** Kein DROP von `sv_kalender_verbindungen` (Retire = separater PR nach Verifik). Kein unbegleiteter Stash.
- **Umlaute** in UI-Strings (hier fast keine — Backend-Konsolidierung).
- **Server-Actions:** Result-Shape `{ success: boolean; error? }` beibehalten (CalDavConnectModal-Kompat).
- **7-Punkte-Audit** vor jedem Commit; **Nested-FK** `Array.isArray(x)?x[0]:x` normalisieren.
- `profiles.id == auth.uid` und `sachverstaendige.profile_id → profiles.id`: für den eingeloggten User ist `profile_id == user.id`.

---

## File Structure

- **Create:** `supabase/migrations/<V>_kalender_verbindungen_ssot_columns.sql` — +5 Spalten + Re-Backfill.
- **Create:** `src/lib/kalender/connect/caldav-connect-actions.ts` — geteiltes `'use server'`-Connect-Modul (profil-generisch).
- **Delete:** `src/app/gutachter/einstellungen/kalender/caldav-actions.ts` — ersetzt.
- **Modify:** `src/components/CalDavConnectModal.tsx` — Import auf geteiltes Modul.
- **Modify (Repoint reads):** `src/app/gutachter/einstellungen/kalender/page.tsx`, `src/app/gutachter/einstellungen/page.tsx`, `src/app/gutachter/willkommen/page.tsx`, `src/lib/onboarding/lade-sv-onboarding-phasen.ts`, `src/lib/private-events/list-events-for-date.ts`, `src/app/admin/sachverstaendige/[id]/page.tsx`.
- **Modify (Repoint read+write):** `src/lib/kalender/caldav/healthcheck.ts`.

---

### Task 1: Migration — 5 Spalten + Re-Backfill

**Files:** Create `supabase/migrations/<V>_kalender_verbindungen_ssot_columns.sql` (via `apply_migration`).

- [ ] **Step 1: DDL via `apply_migration`** (name `kalender_verbindungen_ssot_columns`):

```sql
-- SP2a: kalender_verbindungen als SSoT. Die 5 Spalten ergaenzen, die sv_kalender_verbindungen
-- hat und Consumer (Connect-UI, Views, Healthcheck) brauchen. Alle nullable (Bestand hat sie nicht).
alter table kalender_verbindungen
  add column if not exists calendar_display_name text,
  add column if not exists provider_label text,
  add column if not exists connected_at timestamptz,
  add column if not exists last_sync_at timestamptz,
  add column if not exists fehler_task_id uuid;

-- Re-Backfill (idempotent): alle aktuellen sv_kalender_verbindungen -> kalender_verbindungen,
-- inkl. der 5 neuen Spalten. Faengt Verbindungen aus dem Fenster SP1-Backfill..SP2a-Deploy.
insert into kalender_verbindungen (
  profile_id, provider, server_url, username, password_encrypted, calendar_url,
  calendar_display_name, provider_label, connected_at, last_sync_at, last_error, last_error_at, fehler_task_id
)
select s.profile_id, v.provider, v.server_url, v.username, v.password_encrypted, v.calendar_url,
       v.calendar_display_name, v.provider_label, v.connected_at, v.last_sync_at, v.last_error, v.last_error_at, v.fehler_task_id
from sv_kalender_verbindungen v
join sachverstaendige s on s.id = v.sv_id
where s.profile_id is not null
on conflict (profile_id, provider) do update set
  server_url = excluded.server_url, username = excluded.username,
  password_encrypted = excluded.password_encrypted, calendar_url = excluded.calendar_url,
  calendar_display_name = excluded.calendar_display_name, provider_label = excluded.provider_label,
  connected_at = excluded.connected_at, last_sync_at = excluded.last_sync_at,
  last_error = excluded.last_error, last_error_at = excluded.last_error_at,
  fehler_task_id = excluded.fehler_task_id;
```

(`fehler_task_id` = plain nullable uuid, kein FK — nur der Healthcheck setzt/liest es als Soft-Link. `updated_at` NICHT ergänzt — kein Consumer schreibt es, YAGNI.)

- [ ] **Step 2: `list_migrations`** → getrackte Version `<V>` ablesen.
- [ ] **Step 3: Migration-File** `supabase/migrations/<V>_kalender_verbindungen_ssot_columns.sql` mit exakt der DDL, Dateiname==`<V>`.
- [ ] **Step 4: READ-Verify** (`execute_sql`): `select count(*) from kalender_verbindungen where provider='caldav'` == `select count(*) from sv_kalender_verbindungen where provider='caldav'` (kein Verlust); die 5 Spalten existieren + sind bei den Bestandszeilen gefüllt.
- [ ] **Step 5: Commit** (`feat(kalender-ssot): Task 1 — kalender_verbindungen +5 Spalten + Re-Backfill`).

---

### Task 2: Geteiltes Connect-Action-Modul

**Files:** Create `src/lib/kalender/connect/caldav-connect-actions.ts`; Modify `src/components/CalDavConnectModal.tsx`; Delete `src/app/gutachter/einstellungen/kalender/caldav-actions.ts`.

**Interfaces:** Produces `testCaldavConnection` / `saveCaldavConnection` / `disconnectCaldav` mit **identischem** Result-Shape wie heute; keyt `user.id` (= `profile_id`), schreibt `kalender_verbindungen`.

- [ ] **Step 1: Neues Modul** — 1:1-Kopie der Logik aus `caldav-actions.ts` (inkl. `listCalendarsWithIcloudRetry`, iCloud-Retry, Provider-Preset-Validierung), mit diesen Änderungen:
  - `'use server'` beibehalten.
  - `requireSv()` → ersetzen durch inline:
    ```ts
    async function requireProfileId() {
      const supabase = await createClient()
      const user = (await supabase.auth.getUser())?.data?.user ?? null
      if (!user) return { ok: false as const, error: 'Nicht angemeldet' }
      return { ok: true as const, profileId: user.id } // profiles.id == auth.uid
    }
    ```
  - `saveCaldavConnection`: Upsert-Target `sv_kalender_verbindungen`/`sv_id`/`onConflict:'sv_id,provider'` → `kalender_verbindungen`/`profile_id: auth.profileId`/`onConflict:'profile_id,provider'`. Payload behält `calendar_display_name`, `provider_label`, `connected_at`, `last_sync_at`, `last_error:null`, `last_error_at:null` (Spalten existieren jetzt).
  - `disconnectCaldav`: `.from('kalender_verbindungen').delete().eq('profile_id', auth.profileId).eq('provider','caldav')`.
  - `revalidatePath`: `/gutachter/einstellungen/kalender`, `/gutachter/einstellungen`, `/gutachter/willkommen`, `/mitarbeiter/profil`.
- [ ] **Step 2: Modal-Import** (`CalDavConnectModal.tsx:16-19`): `from '@/app/gutachter/einstellungen/kalender/caldav-actions'` → `from '@/lib/kalender/connect/caldav-connect-actions'`.
- [ ] **Step 3: Alte Datei löschen** `src/app/gutachter/einstellungen/kalender/caldav-actions.ts`. Grep bestätigen: kein weiterer Importer (`grep -rn "kalender/caldav-actions" src/`).
- [ ] **Step 4: tsc** `npx tsc --noEmit` (0).
- [ ] **Step 5: Commit** (`feat(kalender-ssot): Task 2 — geteiltes profil-generisches CalDAV-Connect-Modul`).

---

### Task 3: Repoint SV-Context-Reads (Pages + Onboarding + private-events)

**Files:** Modify `src/app/gutachter/einstellungen/kalender/page.tsx`, `src/app/gutachter/einstellungen/page.tsx`, `src/app/gutachter/willkommen/page.tsx`, `src/lib/onboarding/lade-sv-onboarding-phasen.ts`, `src/lib/private-events/list-events-for-date.ts`.

Alle diese lesen die Verbindung des **eingeloggten/betreffenden** Users. Muster je Stelle: `.from('sv_kalender_verbindungen').eq('sv_id', <svId>)` → `.from('kalender_verbindungen').eq('profile_id', <profileId>)`, wobei `<profileId>` = `user.id` (Pages/Onboarding kennen den User) bzw. der bereits übergebene Profil-Parameter (`list-events-for-date` bekommt die id als Argument).

- [ ] **Step 1:** Jede der 5 Dateien an der `sv_kalender_verbindungen`-Zeile lesen, den Reader auf `kalender_verbindungen`/`profile_id` umstellen. `sv_id`→`profile_id` Selektionsspalte anpassen falls selektiert. Falls eine Stelle bisher `sv.id` nutzt: durch `user.id` (== profile_id) ersetzen; das spart oft den vorherigen `getGutachterForUser`-Call (nur entfernen, wenn er ausschließlich dafür da war — sonst stehen lassen).
- [ ] **Step 2: tsc** (0) + `npm run build` grün (Routen betroffen → Full-Build Pflicht laut Audit).
- [ ] **Step 3: Commit** (`feat(kalender-ssot): Task 3 — SV-Reads auf kalender_verbindungen repointet`).

---

### Task 4: Repoint Admin-SV-Detail (fremder User → profile_id auflösen)

**Files:** Modify `src/app/admin/sachverstaendige/[id]/page.tsx`.

Hier zeigt ein Admin die Verbindung **einer bestimmten** SV (`[id]`). `profile_id` = `sachverstaendige.profile_id` für diese `id`.

- [ ] **Step 1:** Zeile 44 lesen. Falls das SV-Objekt schon geladen wird, `profile_id` mitselektieren und `.from('kalender_verbindungen').eq('profile_id', sv.profile_id)`. Sonst einen kleinen Lookup `sachverstaendige.profile_id` ergänzen. Nested-FK ggf. normalisieren.
- [ ] **Step 2: tsc** (0).
- [ ] **Step 3: Commit** (`feat(kalender-ssot): Task 4 — Admin-SV-Detail auf kalender_verbindungen`).

---

### Task 5: Repoint Healthcheck-Cron (read+write, SV-Task-Verlinkung)

**Files:** Modify `src/lib/kalender/caldav/healthcheck.ts`.

Der Healthcheck liest alle CalDAV-Verbindungen, pingt, setzt `last_error`/`last_sync_at`/`fehler_task_id` und erzeugt bei Fehler `gutachter`-Tasks (verlinkt per `sv_id`). Nach dem Repoint hat die Row nur `profile_id` — die SV-`id` für die Task-Verlinkung wird per `sachverstaendige.profile_id` aufgelöst.

- [ ] **Step 1: `VerbindungRow.sv_id` → `profile_id`**; Query `.from('sv_kalender_verbindungen')` → `.from('kalender_verbindungen')`, Select `sv_id` → `profile_id`.
- [ ] **Step 2: Alle 6 `.from('sv_kalender_verbindungen').update(...).eq('id', v.id)`** → `.from('kalender_verbindungen')` (reine Tabellennamen-Swaps; Update-Payloads unverändert).
- [ ] **Step 3: SV-Auflösung für Task-Verlinkung** — Helper einführen:
    ```ts
    async function svFuerProfil(db, profileId: string) {
      const { data } = await db.from('sachverstaendige')
        .select('id, firmenname, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
        .eq('profile_id', profileId).maybeSingle()
      return data ?? null
    }
    ```
    - Recovery-Zweig: `resolveTasksForEntity('gutachter', v.sv_id, …)` → SV per `svFuerProfil(db, v.profile_id)` auflösen; nur wenn vorhanden `resolveTasksForEntity('gutachter', sv.id, …)`.
    - Neu-Fehler-Zweig: `sv` = `svFuerProfil(db, v.profile_id)`. **Falls `sv` null** (Nicht-SV/künftige KB-Verbindung, SP2b): nur `last_error` setzen, `gutachter`-Task-Erzeugung überspringen (`console.warn` „kein SV für Profil …, Task übersprungen"). Falls vorhanden: Task-Logik wie bisher mit `entity_id: sv.id`, `task_code: sv_caldav_error_${sv.id}`, `empfaenger_user_id: v.profile_id` (direkt aus der Row).
- [ ] **Step 4: tsc** (0). (Kein reiner Unit-Test — I/O-lastig; Healthcheck-Verhalten via Prod-Smoke in Task 7.)
- [ ] **Step 5: Commit** (`feat(kalender-ssot): Task 5 — Healthcheck-Cron auf kalender_verbindungen + SV-Task-Auflösung`).

---

### Task 6: Dead-Read-Gate + fehlende Consumer

**Files:** Grep-getrieben.

- [ ] **Step 1:** `grep -rn "sv_kalender_verbindungen" src/` — verbleibende Treffer dürfen **nur** sein: `src/lib/supabase/database.types.ts` (generierte Typen) + evtl. Kommentare. **Kein** produktiver `.from('sv_kalender_verbindungen')`-Read/Write mehr. Jeder verbleibende produktive Treffer wird repointet.
- [ ] **Step 2:** Falls ein bisher übersehener Consumer auftaucht → gleiche Swap-Regel anwenden, committen.

---

### Task 7: Verifikation + PR

- [ ] **Step 1: Full-Build** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (0).
- [ ] **Step 2: tsc** (0), **vitest** (touched — mind. keine Regression), **3 Ratchets** (`check:token-audit`, `check:component-set -- --ratchet`, `check:knip -- --ratchet`) 0 neue.
- [ ] **Step 3: Prod-Smoke (READ, Regel 2):** `kalender_verbindungen`-caldav-Count == `sv_kalender_verbindungen`-caldav-Count; die 5 neuen Spalten bei Bestandszeilen gefüllt (Re-Backfill); Consumer-Code trifft nur noch `kalender_verbindungen`.
- [ ] **Step 4: 7-Punkte-Audit** dokumentieren, **Session-Abschluss-Checkliste** (git status/stash/unpushed).
- [ ] **Step 5: Push + PR** gegen `staging` (Body: Ziel, Migration, Repoint-Liste, Rollback, Retire-Schuld, Abhängigkeit #3534).
- [ ] **Step 6: Marker** `COORDINATION-universal-kalender-sync.md` + MEMORY.md aktualisieren (SP2a gebaut).

---

## Self-Review

- **Spec-Coverage:** Migration (Task 1), Connect-Generalisierung (Task 2), alle ~10 Repoints (Task 3–5), Dead-Read-Gate (Task 6), Verifik+PR (Task 7) — deckt die Spec ab.
- **Platzhalter:** Repoint-Tasks nennen keine Zeilen-verbatim-Diffs (mechanisch identisches Muster über die Dateien; exakte Zeile beim Ausführen gelesen) — bewusst, kein TBD. Migration + Healthcheck-Helper + Connect-Modul haben exakten Code/Signaturen.
- **Typ-Konsistenz:** `profile_id` durchgängig; `VerbindungRow.profile_id`; Result-Shape `{ success }` überall gleich (Modal-Kompat).
- **Risiko:** additive Migration, Re-Backfill idempotent, alte Tabelle bleibt — Rollback = Code-Revert.
