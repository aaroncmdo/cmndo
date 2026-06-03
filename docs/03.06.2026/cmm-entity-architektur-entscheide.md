# CMM Entity-Model — Architektur-Entscheide 03.06.2026 (Aaron)

**Stand 2026-06-03. Aaron-Entscheide zu den 3 offenen §3-Architektur-Calls (Master-HANDOFF §3 🟡). Diese Datei supersedet die 🟡-Flags.** Ausführung = je eigene **supervised** Session; hier Richtung + Pfad + ehrliche Kosten/Gates. Nicht im aar-939-Hotpath kalt starten.

Kontext-PRs dieser Session: Phase-4 Reader-Inventar (**#2372**), Trio additive (**#2375**, Mig `20260603205846`). Master-HANDOFF: `HANDOFF-identity-writer-wiring-und-entity-reststrecke.md` (Branch `kitta/cmm-identity-slice-b`).

---

## Entscheid 1 — Ansprechpartner: **ALLES VEREINHEITLICHEN**

Aaron-Wahl: interne Staff-Rollen (Kundenbetreuer/Dispatcher/Makler/SV) werden — wie externe Beteiligte — als `claim_parties`-Rollen modelliert. Konsequente „jeder Beteiligte = Party"-Linie (North-Star: flache Dopplung stirbt).

**Umfang:**
- Neue interne Rollen in `claim_parties.rolle`-CHECK: `kundenbetreuer`, `dispatcher`, `makler`, `sv` (+ ggf. `kanzlei_ansprechpartner`).
- FK-Spalten → Party-Rows migrieren: `claims.kundenbetreuer_id` (**382 Code-Hits**), `claims.sv_id`, `claims.makler_id`, `faelle.dispatch_id`, `leads.zugewiesen_an`.
- Kanzlei-AP: flache `claims.kanzlei_ansprechpartner_{name,email,telefon,position}` → `personen` (externe Person) + Party-Rolle. VS-Kontakt analog (war „später", jetzt im selben Modell).

**⚠️ Kosten/Risiken (ehrlich):**
- **Sehr groß** — 382 Hits allein auf `kundenbetreuer_id`. Phase-4-Skala-Refactor.
- **§2-Invariante-Spannung:** Staff-Zugriff ist heute ROLLEN-basiert (`is_admin`/`is_dispatch`/`is_kb`), NICHT party-membership. „Staff als Party" darf §2 NICHT brechen — interne Parties tragen `user_id` (Account-Link), die RLS-Wege bleiben rollenbasiert. Saubere Trennung: **Party = Daten-/Anzeige-Modell, NICHT Access-Pfad.**
- **`person_id` vs `user_id`:** interne Staff = `claim_parties.user_id` (Account), `person_id` null (sie sind keine externen `personen`). Kein Zwang, Staff in `personen` zu duplizieren.

**Pfad (phasiert, supervised):**
1. `rolle`-CHECK um interne Rollen erweitern (additiv, wie Trio).
2. Dual-write: bei KB/SV/Makler/Dispatch-Zuweisung zusätzlich Party-Row (`user_id`) schreiben — FK-Spalte bleibt SoT bis Reader umgestellt.
3. Reader inkrementell auf Party-Query umstellen (Phase-4-artig, 382 Hits in Tranchen).
4. FK-Spalten droppen (Phase-5), wenn 0 Reader.
5. Kanzlei-AP/VS-Kontakt → `personen`+Party separat.

---

## Entscheid 2 — Person-Dedup: **READ-ONLY DUBLETTENLISTE (jetzt)**

Aaron-Wahl: Admin-View, der Dubletten-Kandidaten ZEIGT (nicht merged). Mittelweg — Sichtbarkeit ohne Merge-Risiko. Voller Hard-Merge (§12-6) bleibt YAGNI bis echter Dublettendruck.

**Ist-Zustand:** `personen`=76, getombstoned=0, Self-Confirm (Slice B) noch 0× gefeuert. Infra (`canonical_person_id`/`previous_person_id`) liegt.

**Pfad (klein, read-only, baubar JETZT — außerhalb Conversion-Hotpath, Admin-Portal):**
1. DB: read-only **SECDEF admin-only** Funktion `admin_person_dupe_candidates()` — Cluster gleicher Identitätssignale (email; nachname+geburtsdatum) über `personen` mit `canonical_person_id is null`. service_role/admin-only (PII; §unverhandelbar — NIE anon/authenticated).
2. Server-Action (admin-guarded, Service-Client) + Admin-Page mit sichtbarem Einstiegspunkt (Nav/Link).
3. Minimal-PII (§13-A), `shared/DataTable`+`primitives` (Component-Set-Policy), **kein** Merge-Button (read-only).
4. Vorstufe des späteren Hard-Merge-Tools, wenn echte Dubletten auftauchen.

**→ Diese Session: wird gebaut.**

---

## Entscheid 3 — Termin-Tabellen: **ALLES IN EINE**

Aaron-Wahl: alle 4 Termin-Tabellen in EINE generische, assignee-basierte Tabelle — inkl. `gutachter_termine`.

**Ist-Zustand:** `gutachter_termine` **115 Spalten / 20 Rows / 339 Code-Hits** (SV-Kalender, domänenreich); `admin_termine` 9 Rows; `termine` 0 Rows (hat schon `assignee_typ/assignee_id/typ/bezug_typ/bezug_id/reserviert_bis`); `kanzlei_admin_termine` 0 Rows. `v_belegung`-View existiert.

**⚠️ Kosten/Risiken (ehrlich):**
- **Sehr groß + riskant** — `gutachter_termine` = 339 Hits, 115 SV-Spalten (Besichtigung/Navigation/Nachbesichtigung/CalDAV/Verlegungs-State-Machine AAR-864/EXCLUSION-Constraint AAR-865). Eine generische Tabelle muss diese tragen ODER per Sub-Detail-Tabelle (`gutachter_termin_details`) / JSON auslagern.
- **Koordinations-Pflicht:** assignee-Spalten + `v_belegung` + EXCLUSION-on-assignee sind GERADE in Arbeit (Migs 01.–02.06.; evtl. aktive `dispatch-flowlink-tz-418`-Session). **Nicht kalt parallel bauen** → erst mit dem in-flight-Owner synchronisieren (gleiche Ziel-Tabelle `termine`?).

**Pfad (phasiert, supervised, koordiniert):**
1. Mit der laufenden assignee/`v_belegung`-Vereinheitlichung abstimmen.
2. Kleine Tabellen zuerst (`admin_termine` 9 / `kanzlei_admin_termine` 0 / `termine` 0) → generische `termine`.
3. `gutachter_termine` zuletzt, mit Strategie für die 115 SV-Spalten (Sub-Tabelle vs breite Tabelle) — eigener Design-Schritt.
4. `v_belegung`/Reader-Repoint, dann Alt-Tabellen-Drop (Phase-5, Pre-Drop **ungekappt**).

---

## Sequenz-Empfehlung (gegen §9-A Konvergenz-Deferral)

- **JETZT safe:** Entscheid 2 (read-only Dublettenliste) — klein, read-only, Admin-Portal (nicht Conversion-Hotpath). → diese Session.
- **Erst Phase 4 (Konvergenzpunkt §9-A)** abräumen (PR #2372 Inventar), **DANN** die großen additiven Modell-Erweiterungen 1 + 3 — sonst wächst die Parallelschicht weiter und das Modell konvergiert nie.
- Entscheid 1 + 3 = je eigene supervised Phase: additive Vorstufe (CHECK/Spalten) zuerst, Reader-Umstellung in Tranchen, Drop zuletzt. Entscheid 3 zwingend mit dem in-flight-Termin-Owner koordiniert.

**Unverhandelbar (Wiederholung):** §2-Invariante (Access nie über `person_id`; Staff-Access bleibt rollenbasiert) · `verified_contacts`/Definer-Fns + neue Dedup-Fn = service_role-only · Pre-Drop ungekappt · DDL nur via `apply_migration` · nie main / PR gegen staging / nicht selbst mergen.
