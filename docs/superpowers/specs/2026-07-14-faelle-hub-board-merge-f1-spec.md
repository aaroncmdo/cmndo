# Fälle-Hub Board-Merge (F1 / P4c Weg 2) — Design-Spec

**Datum:** 2026-07-14
**Kontext:** Fälle-Hub-Konvergenz **F1** (aus `program-claim-case-management-map`) = P4c Weg 2 des Detail-View-/Hub-Konsolidierungs-Programms.
**Owner:** ops-cockpit-Lane (`470d55c9-3fe2-4db7-9de5-ec313f15c0c6`, aktuell dormant). Diese Spec macht F1 build-ready.
**Status Weg 1:** ✅ gebaut (PR `kitta/admin-cockpit-to-faelle-hub`) — Cockpit von `/admin` nach `/admin/faelle` gezogen, `/admin` schlank. Cockpit **koexistiert** mit der `FaelleKanban` (Transition). F1 löst die Koexistenz auf.

---

## Problem

E1 (Aaron 10.07.): „**nicht zwei Board-Flächen**". Nach Weg 1 zeigt `/admin/faelle` (Hub-Landing) aber genau zwei:
1. **`AdminOpsCockpit`** (`src/components/admin/AdminOpsCockpit.tsx`) — Rollup-Matrix Phase×Owner + Attention/Überfällig-Drill-in. Daten: `getOpsRollup` (`v_ops_rollup`) + `getMyClaimWorkItems` (`v_claim_workstate`/`WorkItem`).
2. **`FaelleKanban`** (`src/app/admin/faelle/(hub)/FaelleKanban.tsx`) — read-only 4-Phasen-Board pro Claim. Daten: `v_claim_listing` + Enrichment.

F1 = die beiden zu **einem** Board verschmelzen (Rollup-Übersicht **+** editierbares Claim-Board), **ohne Feature-Verlust**.

## Ziel-Architektur (aus program-claim-case-management-map §3/F1)

**Ein workstate-Board je Rolle**, gebaut auf den bestehenden Fundamenten (nicht neu erfinden):
- `v_claim_workstate` / `v_ops_rollup` (schon gebaut, prod).
- `WorkItemCard` + `src/components/ops/*` (editierbar: `updateClaimField` / `overrideClaimPhase`, Audit→timeline).
- Admin-Variante = **Rollup-Matrix (Attention/Drill-in) + editierbares Board** in einer Fläche — wie `AdminOpsCockpit` es beginnt, aber mit den Board-Features der `FaelleKanban`.

## 🔒 Feature-Erhalt-Checkliste (F1 darf NICHTS davon verlieren)

Aus **`FaelleKanban`** (heute):
- [ ] Filter / Suche
- [ ] „+ Fall anlegen" (`/admin/faelle/anlegen`)
- [ ] Badges: ungelesene Nachrichten · ungelesene Updates · KB-Upload · Mitteilung-Hover
- [ ] aktiv / deaktiviert-Marker + `deaktiviert_grund`
- [ ] delete / deactivate
- [ ] Realtime (`KanbanUploadsRealtime`)
- [ ] KB-Filter (`faelle_kundenbetreuer_id` / `claim_kundenbetreuer_id`) — falls KB je Zugang bekommt
- [ ] NULL-safe storniert-Filter (F3, #4212) — frische (NULL-status) Claims bleiben im Board

Aus **`AdminOpsCockpit`** (heute):
- [ ] Rollup-Matrix Phase × Owner
- [ ] Attention / Überfällig-Liste + Klick-Drill-in
- [ ] KPI-Kopf

## Empfohlener Umbau (inkrementell, Regression-arm)

1. **Basis:** die Hub-Landing rendert die Rollup-Matrix (`AdminOpsCockpit`-Teil) als Kopf + darunter ein **editierbares** Claim-Board auf `v_claim_workstate`/`WorkItemCard` statt der read-only `FaelleKanban`.
2. **Feature-Migration:** jedes Häkchen der Checkliste oben auf das WorkItem-Board portieren (Badges/Filter/Realtime/+Fall/delete) — 1 Häkchen = 1 verifizierbarer Schritt.
3. **`FaelleKanban` retiren** erst wenn ALLE Häkchen auf dem neuen Board sind (bis dahin bleibt die Koexistenz aus Weg 1).
4. **Prod-Smoke** je Feature (Regel 4): Badges/Filter/+Fall/deactivate/Realtime live gegen Test-Claims.

## Daten / DDL

`v_claim_workstate` + `v_ops_rollup` + `WorkItem`-Facade existieren (prod). F1 ist **primär Frontend** (Board-Merge + Feature-Port). DDL nur falls ein Feature ein Feld braucht, das die View nicht trägt → dann via Supabase-Plugin (Regel 2), cross-lane an view-owner.

## Abgrenzung

- Weg 1 (Cockpit-Move + `/admin` schlank + Koexistenz) ist **erledigt**.
- F1 überlappt die ops-cockpit-Lane (deren Kern) → dort bauen, mit `WorkItemCard`/`ops/*` als Basis (nicht 4. paralleler Board).
- Disjunkt zu den Detail-View-Lanes (P0–P3) + den Redirect-Slices (P4a/P4b).

Verwandt: `program-claim-case-management-map` · `coordination-faelle-hub-konvergenz-f0` · `coordination-detail-view-konsistenz-programm`
