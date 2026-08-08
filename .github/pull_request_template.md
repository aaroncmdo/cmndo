<!--
  Claimondo PR-Template. Die Pflicht-Details stehen in AGENTS.md — dies ist nur die
  Review-Checkliste, damit nichts durchrutscht. Nicht-zutreffende Blöcke löschen/leer lassen.
-->

## Was & Warum

<!-- Kurz: was ändert dieser PR, welches Problem löst er (+ Linear-Ticket / Marker). -->

## Pflicht-Checks (AGENTS.md)

- [ ] **7-Punkte-Audit** im Commit-Body (Build · UI · Redundanz · Dead-Code · Spec · Inkonsistenz · Regression)
- [ ] **Build/tsc grün** (bei Routen/Layouts/Server-Actions: voller `npm run build`)
- [ ] **Regel 4 — Prod-Smoke** nach Deploy geplant/gelaufen (Flows + Test-Konten benannt) — _oder_ „n/a (reine Docs/Config/Scripts ohne Runtime-Flow)"
- [ ] Bei **Journey-berührung** (J1–J10): Journey-DoD (Soll zuerst · Spec nachgezogen · Journey-Smoke grün vor Merge)

## Zugriffs-Doktrin — nur bei NEUER Tabelle / View / RPC

<!-- Wenn dieser PR keine DB-Tabelle/View/RPC anlegt: diesen Block löschen. -->
<!-- Volltext + Begründung: docs/fundament/zugriffs-doktrin.md §3. -->

- [ ] **Grants default-closed** — nach `CREATE TABLE` nichts an anon/authenticated granten, bis bewusst nötig
- [ ] **Spalten-Grants statt Table-Grants** für sensible Tabellen (PII/`iban`/`token` nie an anon)
- [ ] **RLS aktiv + jede Policy `TO <rolle>`** (nie `TO public`, außer `AS RESTRICTIVE`)
- [ ] **Client-Reads → View/RPC**, nicht Basistabelle; **Writes → Server-Action** mit Guard + `.select()`-Row-Check
- [ ] **PII-Spalten** → kein anon-Grant + keine anon-reachable Policy (uid-/`is_*()`-gated)
- [ ] **Migration nur via Supabase-MCP** (`apply_migration`, Regel 2) + Types regeneriert & committet
