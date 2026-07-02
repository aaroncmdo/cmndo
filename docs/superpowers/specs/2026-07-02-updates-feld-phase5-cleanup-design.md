# Updates-Feld Phase 5 — Cleanup & Konsolidierung (Design/Spec)

**Datum:** 2026-07-02 · **Status:** Design (Aaron-freigegeben — Forks entschieden) · **Session:** 2cc586af
**Parent-Design:** `docs/superpowers/specs/2026-06-29-updates-feld-rebuild-design.md` §9 (Phase 5)
**Branch:** `kitta/updates-feld-phase5-cleanup` (off staging)

---

## 1. Kontext & Ziel

Der Updates-Feld-Rebuild (DB-getriebenes Action-Modell, `get_updates_action` derive + Info-Log in `mitteilungen`) ist bis **Phase 0+1** (#3329) **+ Phase 4** (#3392, gemergt 01.07. 17:32) auf staging. **Phase 5 = der Cleanup**, der die Alt-/Doppel-Systeme konsolidiert, damit es genau **einen** Notification-Pfad gibt.

Phase 5 hat vier Teile (Parent §9):
- **A** — `gutachter_mitteilungen` **retiren + Tabelle droppen** (Fork-Entscheidung Aaron)
- **B** — `kategorie='task'` in `mitteilungen` **stoppen** (deprecated, weil Tasks jetzt abgeleitet werden)
- **C** — die direkten `createMitteilung`-Caller **normalisieren**
- **D** — `/updates`-**Vollseite** für operative Rollen (Fork-Entscheidung Aaron: rein)

## 2. Prerequisites & Sequenz

| Phase | Stand | Für Phase 5 nötig? |
|---|---|---|
| 0 (`get_updates_action` derive + Read-API) | ✅ #3329 | **Ja** — der eigentliche Prerequisite (Tasks/Nachrichten/etc. werden abgeleitet) |
| 1 (Rollen-Fix ROLE_MAP + `werkstatt`-Type) | ✅ #3329 | Ja |
| 2 (Read-Modell: `mitteilungen` +typ/modus/gesehen_am, Badge=Action-Count, in-app-Channel nur Info) | ❌ übersprungen | **Nein** — Cleanup braucht nur Phase 0 |
| 3 (UI-Rebuild Popover) | ⚠️ teilweise (`UpdatesNav` „Braucht dich/Verlauf" existiert) | Nein |
| 4 (weitere Action-Sources) | ✅ #3392 | Teilweise (siehe A: DROP-typ mappen auf Sources) |

**Wichtig:** Das Team ist von 0+1 direkt zu Phase 4 gesprungen; 2/3 (Read-Modell + voller UI-Rebuild) sind **nicht** gelandet. Phase 5 hängt aber nur an Phase 0 (done) → **läuft jetzt**. Wo Phase-5-Wirkung von Phase 2 abhinge (z. B. Badge = Action-Count), ist das unten explizit markiert.

## 3. Prod-Grounding (PFLICHT vor Implementierung)

Der Spec nutzt die **29.06-Audit-Zahlen** (`gutachter_mitteilungen` = 0 rows/tot · `kategorie='task'` = deprecated, ~120 Zeilen geschrieben). **Die Prod-DB war beim Spec-Schreiben (02.07.) nicht erreichbar** (Connection-Timeout — passt zum global-roten Supabase-Preview-CI). **Schritt 1 jedes Implementierungs-Plans MUSS re-verifizieren** (Regel 2 / read-only `execute_sql`):

```sql
-- A: ist gutachter_mitteilungen wirklich tot? (Drop-Sicherheit)
select count(*) total, count(*) filter (where gelesen=false) ungelesen, max(created_at) neueste
from gutachter_mitteilungen;
-- B: Volumen der task-Kategorie (letzte 7 Tage = noch aktiv?)
select kategorie, count(*) n, count(*) filter (where created_at > now()-interval '7 days') letzte_7t
from mitteilungen group by kategorie order by n desc;
-- Schema: bestätigen dass mitteilungen KEIN typ/modus hat (Phase 2 nicht gelandet)
select column_name from information_schema.columns
where table_name='mitteilungen' and table_schema='public' order by ordinal_position;
```

Wenn `gutachter_mitteilungen` wider Erwarten > (klein) Zeilen hat → Migration statt Blind-Drop erwägen (Info-Zeilen in `mitteilungen` backfillen).

---

## 4. Teil A — `gutachter_mitteilungen` retiren + droppen

### 4.1 Ist-Zustand (staging-gegroundet)

**Ein Legacy-SV-only-System, parallel zur kanonischen `mitteilungen`:**

- **Writer:** `src/lib/mitteilungen.ts` → `createGutachterMitteilung(sv_id, typ, fall_id, extras)` (`'use server'`, 18 typ-Templates via `buildMessage`, `DRINGEND_TYPEN`-Set). Insert in `gutachter_mitteilungen`.
- **Direct-Inserts (bypass Helper):** `src/app/flow/[token]/actions.ts:1243` (Termin, `sv_id = terminRow.assignee_id`) · `src/app/api/seed-testdata/route.ts:778` (Seed) + Delete `:70`.
- **9 Caller** von `createGutachterMitteilung`: `kunde/re-termin/[token]/actions.ts:204` · `lib/auftrag/side-quest.ts:75` · `lib/auftrag/qc.ts:421` · `dispatch/leads/[id]/_actions/sv-termin.ts:263` · `api/sv-zuweisung/route.ts:404` · `faelle/[id]/_actions/kanzlei-paket.ts:202,256` · `faelle/[id]/_actions/filmcheck.ts:146,340` · `lib/actions/dispatch-fall-actions.ts:107,121,153,176,229`.
- **Reader:** **nur** `src/app/gutachter/GutachterShell.tsx` — Badge-Count (`:284`) + Realtime-Sub (`:319`). **Kein List-Reader** rendert die Zeilen → die Tabelle ist **display-orphaned** (Badge zählt, aber nichts zeigt sie). `/gutachter/posteingang` existiert nicht als eigene Route.
- **Cascade-Ref:** `src/app/faelle/[id]/_actions/core.ts:45` (Tabellen-Liste für Fall-Delete/Anonymisierung).

### 4.2 Kern-Entscheidung: typ-Klassifikation (18 typ → Ziel)

Beim Umzug auf `mitteilungen` wird **jeder** typ klassifiziert. Prinzip: repräsentiert der typ **laufenden State-zu-lösen** → er ist bereits als **abgeleitete Action-Source** (Phase 0/4) abgedeckt → **DROP** (nicht materialisieren, sonst Doppel-Eintrag). Ist er ein **einmaliges FYI** → **Info** (`kategorie='update'` in `mitteilungen`).

| typ | Klassifikation | Begründung / Ziel |
|---|---|---|
| `kunde_chat_nachricht` | **DROP** | abgedeckt durch derived `unbeantw_nachricht` (`nachrichten.gelesen=false`) |
| `gutachten_erinnerung` | **DROP** | abgedeckt durch derived `gutachten_ueberfaellig` |
| `qc_nachbesserung` | **DROP** | abgedeckt durch derived `nachbesserung` — ⚠️ die Source MUSS den `kommentar` tragen (verifizieren) |
| `re_termin_kundenwahl` | **DROP** | abgedeckt durch derived `re_termin_wahl` |
| `neuer_auftrag` | Info (normal) | Action deckt bereits der GutachterShell-`auftraege`-Badge (status='sv-zugewiesen', unterminiert); Mitteilung = FYI |
| `termin_bestaetigt` | Info | FYI |
| `termin_geaendert` | Info | FYI |
| `kunde_dokument_hochgeladen` | Info | FYI |
| `qc_bestanden` | Info | FYI |
| `kanzlei_as_gesendet` | Info | FYI |
| `kanzlei_regulierung` | Info | FYI |
| `kanzlei_zahlung` | Info | FYI |
| `auftrag_storniert` | Info | FYI |
| `vorschaden_warnung` | Info (**hoch**) | wichtiger Hinweis vor Gutachten; kein sauberer State zum Ableiten |
| `paket_fast_voll` | Info (**hoch**) | SV-Billing-FYI |
| `guthaben_niedrig` | Info (**hoch**) | SV-Billing-FYI |
| `nachbesichtigung_beauftragt` | Info (**hoch**) | ⚠️ Action-Kandidat: könnte künftig derived Source `nachbesichtigung_offen` werden (Phase-4-Follow-up); MVP = Info-hoch |
| `stellungnahme_beauftragt` | Info (**hoch**) | ⚠️ Action-Kandidat (analog); MVP = Info-hoch |

→ **4 DROP · 9 Info-normal · 5 Info-hoch.**

### 4.3 Mechanismus

1. **`createGutachterMitteilung` umschreiben** (Body, nicht Signatur → 0 Caller-Churn): DROP-typ = früher `return` (no-op); Info-typ = `createMitteilung({ empfaenger_id: sv_id, empfaenger_rolle: 'sachverstaendiger', kategorie: 'update', titel, inhalt: nachricht, kontext_typ: 'fall', kontext_id: fall_id, prioritaet: HOCH.has(typ) ? 'hoch' : 'normal' })`. `buildMessage` bleibt (Templates), `DRINGEND_TYPEN` → `HOCH_TYPEN`. Import von `@/lib/mitteilungen/create-mitteilung` (server→server, ok trotz `'use server'`). Kommentar: „schreibt jetzt kanonisch in `mitteilungen`; Tabelle `gutachter_mitteilungen` retired (Phase 5)."
2. **2 Direct-Inserts migrieren:** `flow/[token]/actions.ts:1243` → `createGutachterMitteilung(assignee_id, 'termin_geaendert'|passenden typ, fallId, {...})` statt raw insert (nutzt jetzt den umgeschriebenen Helper) · `seed-testdata` → gutachter_mitteilungen-Insert/Delete **entfernen** (oder auf `mitteilungen` umstellen).
3. **GutachterShell-Reader umbiegen:** Badge-Count + Realtime-Sub von `gutachter_mitteilungen` → `mitteilungen` (`empfaenger_id in svIds`, `gelesen=false`, `kategorie='update'`). Der Nachrichten-Teil des aggregierten Badges bleibt. **Phase-2-Hinweis:** Badge bleibt „unread count" (nicht Action-Count) bis Phase 2; kein Regression, da nur die Quelle wechselt.
4. **Cascade + Seed bereinigen:** `gutachter_mitteilungen` aus `core.ts:45`-Liste entfernen; Seed-Block weg.
5. **Regel-2-DROP-Migration** (NACH Code-Merge, Regel 3 — kein Drop bei liegendem Code):
   `apply_migration({ name: "drop_gutachter_mitteilungen", query: "DROP TABLE IF EXISTS public.gutachter_mitteilungen;" })` → `list_migrations` → File `supabase/migrations/<V>_drop_gutachter_mitteilungen.sql` == getrackte Version → `execute_sql` READ (Tabelle weg) → Types regen.

### 4.4 Tests (A)
- vitest: `createGutachterMitteilung` — DROP-typ → `createMitteilung` **nicht** gerufen; Info-typ → gerufen mit korrekter `kategorie/prioritaet/kontext` (mock `createMitteilung`).
- Regressions-Smoke: `grep` dass kein `.from('gutachter_mitteilungen')` mehr in `src/` (außer Migration) existiert.

---

## 5. Teil B — `kategorie='task'` stoppen

Tasks werden seit Phase 0 **abgeleitet** (`get_updates_action`/`offene_aufgabe`) → materialisierte `kategorie='task'`-Mitteilungen sind **Doppel-Einträge**. **8 Write-Sites** (staging):

| Site | vermutlich | Regel |
|---|---|---|
| `lib/tasks/create-task.ts:142` | Task-Spiegel (erzeugt `tasks`-Row **und** Mitteilung) | **entfernen** (derived deckt) |
| `lexdrive/process-event.ts:484,529` | per-Site prüfen | Task-Row? → entfernen; sonst → `'update'` |
| `cron/re-termin-eskalation:83` | Eskalation | Task-Row? → entfernen; sonst → `'update'` |
| `cron/vs-korrespondenz-review:135` | Review-Hinweis | dito |
| `lib/actions/sv-verifizierung-actions:166` | Verifizierung | dito |
| `lib/fall/event-stream:202` | Event | dito |
| `admin/marketing/linkedin/actions:24` | LinkedIn-Freigabe-Queue | eigenständige Notif → **`'update'`** |

**Per-Site-Regel:** erzeugt die Stelle auch eine echte `tasks`-Row → Mitteilung **entfernen** (derived `offene_aufgabe` deckt). Ist es eine eigenständige, als `task` fehlklassifizierte Notif → **auf `'update'` umtaggen**. Danach `'task'` aus `MitteilungKategorie` (`src/lib/mitteilungen/types.ts`) + `autoIcon` (`create-mitteilung.ts:69`) entfernen (+ `TYP_CHIPS`/`filterByTyp` prüfen, ob 'task'-Filter noch sinnvoll — der bezieht sich auf `UpdateItem.typ='task'` aus der derive, **nicht** auf `kategorie`, bleibt also).
**Phase-2-Hinweis:** ohne Phase-2-Badge=Action-Count zählt der aktuelle Unread-Badge auch task-Mitteilungen → Entfernen **senkt** Lärm (gewollt, kein Regression).

### Tests (B)
- vitest/grep: kein `kategorie: 'task'` mehr in `src/` (außer bewusst umgetaggte → `'update'`); Type-Removal → `tsc` fängt verbliebene Referenzen.

---

## 6. Teil C — direkte `createMitteilung`-Caller normalisieren

**13 Files** rufen `createMitteilung*` direkt (ungegated, inkonsistent) — Hotspot `lib/lexdrive/process-event.ts` (8×). Normalisierung = alle über den kanonischen `createMitteilung`/`createMitteilungMulti` aus `lib/mitteilungen/create-mitteilung.ts`, mit korrekter `kategorie`/`kontext_typ`/`prioritaet`, **keine** deprecated `'task'` (Overlap mit Teil B — dieselben Files → **B+C zusammen** umsetzen), konsistente `route_url` (Auto via `autoRouteUrl`).
**Abgrenzung:** die Parent-Phase-2-Regel „in-app-Channel schreibt nur Info" ist der **Endzustand**, aber nicht blockierend — Teil C ist eine Konsistenz-Runde auf dem kanonischen Helper, Info/Action-Feinschnitt kommt mit Phase 2.

### Tests (C): tsc + grep (kein raw `admin.from('mitteilungen').insert` mehr außerhalb des Helpers).

---

## 7. Teil D — `/updates`-Vollseite (greenfield)

Parent §7: operative Rollen (dispatch/SV/KB/kanzlei/werkstatt) bekommen eine **Worklist-Vollseite**; Kunde/makler = Popover reicht.

- **Neu:** `src/app/updates/page.tsx` (Server-Component) + Rollen-Guard (nur operative Rollen; Kunde/makler → redirect auf Portal-Home oder Popover-Hinweis).
- **Datenquelle:** bestehendes `getUpdates(db, userId, rolle)` (`lib/updates/get-updates.ts`) — **kein neues Backend nötig**.
- **UI:** „Braucht dich" (Action, sort prio+zeit) + „Verlauf" (Info) + Typ-Filter-Chips — **dieselbe Item-Darstellung wie `UpdatesNav`**. Redundanz vermeiden: das Item-Rendering + `TYP_CHIPS` + `fmtRelative`/`typIcon` aus `UpdatesNav.tsx` in eine geteilte `components/shared/updates/UpdateItemList.tsx` extrahieren, die Popover **und** Vollseite nutzen (Boy-Scout, Komponenten-Set-Policy).
- **Einstiegspunkt (Pflicht, Audit-Punkt 2):** Link/Nav-Item „Updates" in den operativen Portalen (Sidebar/Header) → `/updates`. Popover-Bell bleibt zusätzlich.
- **Phase-2-Hinweis:** Vollseite nutzt aktuelles `getUpdates`/Badge-Semantik; wenn Phase 2 kommt, erbt sie die Verfeinerung automatisch.
- **Branding:** `bg-claimondo-*`-Tokens (greifen aufs Brand-Theme); keine Inline-Hex.

### Tests (D): vitest für Guard/Rollen-Weiche; Playwright-Smoke (operative Rolle sieht Worklist, Kunde redirect).

---

## 8. Implementierungs-Schnitt — 4 kleine PRs off staging

| PR | Inhalt | Abhängigkeit | Konflikt-Fläche |
|---|---|---|---|
| **A** | `gutachter_mitteilungen` retire + DROP-Migration | — | `lib/mitteilungen.ts`, GutachterShell, 2 Direct-Inserts, core.ts, seed |
| **B+C** | `task`-Kategorie raus + Direct-Caller normalisieren (gleiche Files → zusammen) | — | `create-task.ts`, `lexdrive/process-event.ts`, 2 Crons, `sv-verifizierung`, `event-stream`, `linkedin`, `mitteilungen/types.ts`, `create-mitteilung.ts` |
| **D** | `/updates`-Vollseite (greenfield + `UpdateItemList`-Extraktion) | — | neue Route + `UpdatesNav.tsx` (Extraktion), operative Portal-Navs |

Reihenfolge: A · B+C · D sind **unabhängig** (können parallel/beliebig). Jede klein → schnell reviewbar, kleiner Blast-Radius.

## 9. Koordination (10 parallele Sessions)

- **Session `55042b94`** fragt „ist der mitteilungsrefactor vollständig + prod-verifiziert?" — **dieselbe Domäne**. Vor PR-Start Stand von 55042b94 abgleichen (evtl. hat sie Prod-Befunde, die Schritt-3-Grounding liefern).
- Berührt geteilte `mitteilungen`-Infra (`create-mitteilung.ts`, `types.ts`, `lexdrive/process-event.ts`, Crons) → **vor jedem PR** `gh pr list` + Marker prüfen. Marker: `memory/COORDINATION-werkstatt-bell-and-phase5-spec.md`.
- `lexdrive/process-event.ts` (8× createMitteilung + 2× task) ist Hotspot — mit LexDrive-Sessions abstimmen.

## 10. Verifikation (Aaron-Broadcast: bis 1+, prod-verifiziert, DB-getrieben)

Pro PR: vitest (TDD) + `tsc` + `next build` (`NODE_OPTIONS=--max-old-space-size=8192` bei OOM unter Session-Last) + Ratchets (token-audit/component-set/knip). **Danach Prod-Smoke als echte Rolle** (RLS via JWT, nie service-role-0-Zeilen): SV sieht seine Info-Mitteilungen in der Bell; operative Rolle öffnet `/updates`; kein `kategorie='task'` mehr geschrieben (Prod-Query); `gutachter_mitteilungen` weg (Prod). **DB-Getriebenheit** ist bereits erfüllt (Actions abgeleitet aus State via `get_updates_action`) — Phase 5 entfernt nur die letzten materialisierten Doppel-Pfade.

## 11. Risiken / Offene Punkte

- **Prod-Re-Verify (Schritt 1)** — DB war beim Spec-Schreiben down; Zahlen aus 29.06-Audit.
- **4 DROP-typ** brauchen, dass ihre derived Sources den Kontext tragen (v. a. `nachbesserung.kommentar`, `re_termin_wahl`-Datum) — im A-Plan gegen die Source-SQL prüfen; sonst als Info behalten.
- **`nachbesichtigung_/stellungnahme_beauftragt`** = Action-Kandidaten → MVP Info-hoch, Phase-4-Follow-up für echte derive.
- **B/C-File-Overlap** → zusammen umsetzen.
- **`/updates`-Guard** darf Kunde/makler nicht in eine leere/kaputte Seite lassen (redirect).
- Whitelabel: SV-Notifs jetzt in `mitteilungen` → `autoRouteUrl` routet SV korrekt (`/gutachter/fall/...`); Branding unberührt (rollen-basiert).
