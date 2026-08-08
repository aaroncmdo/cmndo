# Plan Tranche T4 — Kunde wählt Gutachtertermin aus der Akte (Portal-Einstieg + Engine-Findung)

Spec: `docs/superpowers/specs/2026-08-05-kunde-termin-funnel-design.md` §4.3 (Akte zeigt die Wahrheit) + §4.4 (Dispatch-Zuweisung) + §4.6 (schaden-melden-Anschluss). Nachfolger von T1-T3 (#5012, live) · Tranche W (#5069) · T5 (#5074) · T6 (#5075). Alle Pfade relativ zum Worktree; **Oberfläche kartiert 08.08.** (2 Explore-Agenten + eigene Reads) — file:line hier sind Bau-Anker, vor jedem Edit gegenlesen.

## Kern-Erkenntnisse (aus der Kartierung — vor dem Bau verinnerlichen)

1. **Der Kalender ist KEINE Sackgasse bei vorhandenem SV.** `kalender/page.tsx:42-77` + `KalenderClient.tsx` sind ein funktionierender Slot-Picker (filtert Vergangenheit `:52`, zeigt Belegtheiten). Die Sackgasse ist NUR `page.tsx:31-40` (`if (!svId) return <keinSv>`). **T4 baut genau diesen Zweig um.**
2. **`terminBuchen` (`lib/actions/termin-actions.ts:809-963`) ist CONFIRM-only, nicht CREATE.** Sie sucht eine BEREITS existierende `reserviert`/`gegenvorschlag`-Zeile (`.eq('fall_id', fId)` — **Legacy-Achse!**, `:830-837`) und `.update({status:'bestaetigt',…})`. Setzt `claims.sv_id` UND eine vorhandene Termin-Zeile voraus. Für den Engine-Partner-Pfad (Kunde bucht beim gefundenen SV OHNE vorbestehende Zeile) reicht sie nicht → **eine Zeile muss erst bezug-nativ (`bezug_typ='claim'`) angelegt werden**. Zusätzlich: der Legacy-`fall_id`-Read übersieht umgehängte bezug-native Termine (Klasse #5062) → beim Anfassen bezug-aware ziehen (`bezugOrExpr('fall', …)`).
3. **🔴 Es gibt HEUTE KEINEN Writer, der `sv_gesucht`-`gutachter_termine`-Zeilen anlegt.** Verifiziert: 0 `status:'sv_gesucht'`-Inserts in `src`. Nur Leser (Dispatch-Queue, kunde-claim-view, kunde/termine). Der Wunschtermin→sv_gesucht-Queue-Pfad (Spec Kaskade ③) ist **komplett neu**. (⚠ Namensfalle: `'sv-gesucht'`-Bindestrich in `initial-operative-status.ts` ist der `claims.operative_status`-Cursor — ANDERE Spalte.)
4. **Daten-Realität: nur 3/40 aktive Claims haben `schadenort_lat/lng`, 4 haben PLZ, 28 haben keinen SV.** → Die Engine-Partner-Findung (braucht Standort) greift nur für die Minderheit; der **Wunschtermin→sv_gesucht-Pfad (kein Geo nötig) ist der Hauptweg**. Priorisierung entsprechend: der Wunschtermin-Fallback ist das MVP, die Engine-Partner-Slots die Veredelung.
5. **`planeTerminMitFallback` (`sv-matching-modul/plane-termin-mit-fallback.ts:67-75`) ist server-side wiederverwendbar** (reines lib, kein `'use server'`, leak-sichere Kundenprojektion), Input `{lat,lng,wunschterminIso?,fixerSvId?}`, liefert `{kind:'partner',svs[0].slots}` ODER `{kind:'fallback',deadPins}`. Anker = `claims.schadenort_lat/lng` (`get-claim-for-role.ts:46-47`) — im VM/Kalender-Loader NICHT geladen → nachladen.

## Tasks (Bau-Reihenfolge nach Abhängigkeit + Wert)

### T4-1 (Fundament, lib+TDD): sv_gesucht-Writer + PENDING-Status-Extraktion
- **Neu `src/lib/termine/erstelle-sv-gesucht-termin.ts`** — `erstelleSvGesuchtTermin(admin, { claimId, startIso, besichtigungsort?, quelle })`: INSERT `gutachter_termine {bezug_typ:'claim', bezug_id:claimId, typ:'sv_begutachtung', status:'sv_gesucht', start_zeit, besichtigungsort_*}` (KEIN assignee — „SV noch zu finden"). `.select()`+Row-Check (#4625). Idempotenz: kein Insert, wenn bereits ein offener `sv_begutachtung`-Termin am Claim existiert (bezug-aware `bezugOrExpr('fall',claimId)` + Status-Menge). vitest (noop/insert/error).
- **CHECK-Vorbedingung: ERFÜLLT** — `gutachter_termine_status_check` enthält `'sv_gesucht'` bereits (verifiziert 08.08. per `execute_sql`; die volle Menge trägt reserviert/bestaetigt/…/sv_gesucht/dispatch_pending). Kein Migrations-Prerequisite → der Writer kann direkt inserten (Flag-Drift-Gate grün).
- **Boy-Scout `src/lib/termine/pending-status.ts`** (oder `src/lib/status`): `export const PENDING_TERMIN_STATUS = ['dispatch_pending','sv_gesucht'] as const` + `istPendingTerminStatus(s)`. Ersetzt die Dups: `KundeTerminDetailClient.tsx:101`, `TermineRow.tsx:23`, `StatusZone.tsx:64` (inline-OR), `terminwuensche/page.tsx:70`, `terminwuensche/actions.ts:149`, `kunde-claim-view.ts:298` (+ `SV_STATUS_PRIO:533`). `DOT_CLS` (`TermineHub.tsx:17-20`) um beide Pending-Slots → warning ergänzen (Status-Registry-Slot, kein raw). *Rein mechanisch, tsc+Ratchets decken.*

### T4-2 (Engine-Zuweisung, lib+TDD): weiseSvGesuchtZu
- **Neu in `src/lib/termine/engine/state-transitions.ts`** (neben `reassigniereDeadPin`): `weiseSvGesuchtZu(terminId, { partnerId, db })` — race-sicher wie `reassigniereDeadPin`, aber gegatet `.eq('status','sv_gesucht')` (statt `dispatch_pending`+`sv_lead`), setzt `assignee_typ:'sachverstaendiger', assignee_id:partnerId, status:'bestaetigt'`; 23P01 (Exclusion `gutachter_termine_no_assignee_overlap`) → `{ok:false,error:'belegt'}`. vitest analog `reassigniereDeadPin`.
- **Alternativ** (Design-Entscheidung im Bau): `reassigniereDeadPin` generalisieren auf `{fromStatus, fromAssigneeTyp}` — aber getrennte Primitive ist klarer + risikoärmer (der Dead-Pin-Pfad bleibt unberührt).

### T4-3 (Dispatch, Server-Action + UI): sv_gesucht aus der Queue zuweisen
- `terminwuensche/actions.ts:51-53`: den `sv_gesucht`-Block ersetzen — statt Fehler jetzt `weiseSvGesuchtZu(terminId,{partnerId:svId,db:admin})`. Der bestehende Claim-Nachlauf (`setSvIdForFall` + `transitionFallStatus('sv-termin')` + `createGutachterMitteilung`, `:67-106`) greift für beide Pfade unverändert.
- `TerminAktionen.tsx:36`: `zuweisenGesperrt = status==='sv_gesucht'` entfernen (Button aktivieren).
- **Build-Gate:** Route-Change → Vollbuild.

### T4-4 (Akte-CTA, lib+Component): Aufgabe „Gutachtertermin wählen"
- **VM erweitern** (`kunde-claim-view.ts`): `schadenort_lat/lng` in den claims-Read aufnehmen (für T4-5) + ein `istTerminal`-Boolean exponieren (`istClaimGeschlossen` wird intern schon genutzt, `:586`) ODER in `deriveKundeAufgaben` aus `vm.lifecycle.mainPhase !== 'abschluss'` ableiten.
- **Neue Aufgabe `termin_waehlen`** in `deriveKundeAufgaben` (`kunde-zonen.ts:29-68`, Typ `:9-16` um die ID erweitern): sichtbar wenn `vm.status.svTermin == null` (kein offener sv_begutachtung-Termin) UND nicht terminal UND `!vm.flags.istNurReparatur` (braucht Begutachtung — `istReparaturRoute`/`istNurGutachter`/`abrechnungsweg` prüfen). Label „Gutachtertermin wählen".
- **Href:** `AufgabenZone.tsx` `hrefFor()` (`:25-30`) um `termin_waehlen → /kunde/faelle/${claimId}/kalender` erweitern (Präzedenz `sa_vollmacht`).
- **Spec-Gate:** „Bis T4-5 gebaut, erscheint die Aufgabe nur bei vorhandenem `sv_id`" — d.h. T4-4 kann VOR T4-5 mergen (Aufgabe zeigt nur wenn `vm.status.svId` gesetzt → Kalender funktioniert). Sobald T4-5 den `!svId`-Zweig baut, das sv_id-Gate der Aufgabe entfernen.

### T4-5 (der große Umbau, Route+Component): Kalender `!svId` → Engine-Findung + Wunschtermin-Fallback
- **`kalender/page.tsx:31-40` ersetzen:** Claim-Standort auflösen (`schadenort_lat/lng`; Fallback-Kette dokumentieren, s.u.). Dann:
  - `lat/lng` vorhanden → `planeTerminMitFallback({lat,lng})`. `kind:'partner'` → `svs[0]` + dessen `.slots` an einen (leicht angepassten) `KalenderClient` reichen, der die Engine-Slots statt der Arbeitszeit-Raster anzeigt; Buchung legt bezug-nativ eine Zeile beim Partner-SV an + bestätigt (T4-6). `kind:'fallback'` (nur Dead-Pins) → wie „kein Geo".
  - `lat/lng` fehlt (Hauptfall, 37/40) → **Wunschtermin-Formular** (den `WunschterminPicker` aus dem Embed wiederverwenden, jetzt vergangenheits-gefiltert dank T5) → `erstelleSvGesuchtTermin` (T4-1) → Bestätigung „Wir bestätigen deinen Wunschtermin in Kürze" (Termin landet in der Dispatch-Queue).
- **Standort-Fallback-Kette (Design-Entscheidung im Bau):** `claims.schadenort_lat/lng` → (Lead) `unfallort_lat/lng`/`besichtigungsort` → `kunde_plz`/`halter_plz` geocode. MVP: nur `schadenort_*`; fehlt es → direkt Wunschtermin-Pfad (kein Geocode-Ausbau in T4).
- **Build-Gate:** Route+Component → Vollbuild Pflicht.

### T4-6 (Buchungs-Contract): terminBuchen für den Engine-Partner-Pfad heben
- Für T4-5 Partner-Pfad braucht es „SV zuweisen + Termin-Zeile anlegen + bestätigen". Zwei Optionen (im Bau entscheiden):
  - (a) `terminBuchen` erweitern: wenn keine aktive Zeile existiert, den Engine-`reserviere`-Pfad (`src/lib/termine/engine`) nutzen (bezug-nativ `'claim'` anlegen) + `setSvIdForFall(partnerId)` + Cursor `transitionFallStatus('sv-termin')`.
  - (b) Neue Action `bucheEngineTermin({claimId, svId, slot})` — sauberer getrennt vom Legacy-Confirm.
- **Zusätzlich (Bezug-Fix, unabhängig wertvoll):** `terminBuchen:832` `.eq('fall_id', fId)` → `.or(bezugOrExpr('fall', fId))` (findet umgehängte Termine; Termin-Bezug-Gate-Baseline senkbar).

## Nicht-Ziele / bewusste Grenzen
- **Kein Geocode-Ausbau** in T4 (schadenort fehlt → Wunschtermin-Pfad statt PLZ→lat/lng-Auflösung). Separate Datenpflege-/Backfill-Frage.
- **§4.5 Finder-Hygiene (2 h Mindestvorlauf + SV-Slot-Listen):** T5 (#5074) hat den Vergangenheits-Filter im WunschterminPicker gebaut; der 2-h-Buffer + SV-Slot-Listen bleiben Follow-up (aar-956-koordiniert).
- **Kein Modell-Umbau am Werkstatttermin** (§4.8) — separate Lane (W, #5069).

## Verifikation (Regel 4 / Audit)
- **vitest** für alle lib-Teile (T4-1 Writer, T4-2 Primitive, PENDING-Helper).
- **Vollbuild** Pflicht (T4-3 Action + T4-4/T4-5 Route/Component ändern Routen).
- **Ratchets:** termin-bezug (T4-6 senkt Baseline), flag-drift (`sv_gesucht`-Insert braucht den CHECK), component-set/status-registry (neue UI), operative-status-writes (Cursor nur via `transitionFallStatus`).
- **Regel-4-Prod-Smoke (deploy-gated):** (1) Akte ohne Termin zeigt „Gutachtertermin wählen"; (2) Kalender bei Claim ohne SV → Wunschtermin wählbar → `sv_gesucht`-Zeile in der Dispatch-Queue (DB-Probe); (3) Dispatch weist den sv_gesucht-Wunsch einem Wegwerf-SV zu → `bestaetigt` + Cursor `sv-termin`; (4) bei Geo-Claim: Engine-Partner-Slots erscheinen + Buchung legt bezug-native Zeile an.

## Bau-Reihenfolge (Abhängigkeitsgraph)
T4-1 (Writer+CHECK+Extraktion) → T4-2 (Zuweisungs-Primitive) → {T4-3 (Dispatch-Zuweisung), T4-5 (Kalender-Umbau, nutzt T4-1-Writer)} → T4-6 (Buchungs-Contract für Partner-Pfad) → T4-4 (Aufgabe, surfaced den fertigen Kalender). T4-1/T4-2 sind lib+vitest (build-arm, fleet-robust); T4-3/4/5/6 sind build-lastig (Routen) → bei Fleet-Saturation gestaffelt.
