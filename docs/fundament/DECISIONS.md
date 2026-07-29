# DECISIONS — Fundament-Programm (append-only)

> Protokoll nach FUNDAMENT.md §8. Jede unterwegs getroffene Entscheidung, die weder im Steuerdokument noch in den Journeys stand. Review-Spalte bleibt `offen`, bis Aaron sie bestätigt/revidiert.

## 2026-07-28 · SV-Org-Lane · organisationen/Verwalter/Pool-Lead-Modell (KFZ-152 / #4579) retiren

**Lücke:** Aaron wies die SV-Org-Lane zu ([[coordination-an-a6c863e2-sv-org-organisation-id-wiring]]): `assignPoolLead` / `/gutachter/team` ist auf prod **unerreichbar** (`v_claim_full.organisation_id` ist hardcoded `NULL::uuid` in `v_claim_base`, verifiziert via `pg_get_viewdef`; 0 `organisationen`, 0 `sachverstaendige.organisation_id`). Erste Aufgabe = Entscheidung **Launch (View verdrahten) vs Retire (toten Pfad entfernen)**, abzustimmen mit dem Netzwerk-Epic (paused), das die kanonische SV-Struktur bestimmt.

**Entscheidung:** **RETIRE** des Code-Pfads — `/gutachter/team` (`page.tsx` + `TeamClient.tsx` + `actions.ts`: `assignPoolLead`/`ensureVerwalter`/`toggleSubSvSperre`) + der `showTeam`-Nav-Thread (`GutachterShell.tsx`/`layout.tsx`/`_shell/page-titles.ts`). **Schema bleibt unangetastet** (`organisationen`-Tabelle, `sachverstaendige.organisation_id`/`rolle_in_organisation`/`ist_parent_account`) — FUNDAMENT §10 Nicht-Ziel „keine Drops".

**Begründung (Verfassung §3 „kein totes Gerüst" + Roadmap):**
1. Der Pfad ist **tot** (0 Orgs, kaputte View → unerreichbar). Belassen = ein stiller Deadlock-Erwartungswert, der bei künftigem Org-Anlegen tot startet.
2. Die **kanonische SV-Struktur-Richtung** ist das Netzwerk-Epic (`netzwerk_owner_id` = Profil-Graph, `docs/superpowers/specs/2026-07-21-netzwerk-verbindungen-freundschaft-design.md:93/99`), das **Multi-Account-Organisationen für v1 explizit ausklammert** (`sv_buero ausgeklammert`, :109). Das organisationen/Verwalter/Pool-Lead-Modell ist damit **off-roadmap** für v1.
3. **Reversibel:** Git-Historie + Schema intakt; bei künftigem Agentur-Bedarf neu gebaut (voraussichtlich netzwerk-aligned).

**Nicht in Scope:** Die `sv-zuweisung/route.ts`-Org-Pool-Branche (schreibt `sv-gesucht` für Pool-Verteilung) ist separat tot UND zugleich der A2-Fund #6 (WILD-`operative_status`-Write, der den Ratchet per Type-Cast umgeht) → gehört zu **C1**. Ein Schema-Drop der org-Spalten liegt **außerhalb** des Fundament-Programms (§10).

**Review:** offen (Aaron)

## 2026-07-29 · A1-Review · P1-Entscheidungen (Aaron)

Antworten auf die konsolidierten P1-Fragen (`docs/fundament/OFFENE-FRAGEN.md`). Damit sind die C-blockierenden Produkt-Weichen gesetzt.

1. **P1.1 Notification-Redundanz → EIN Willkommens-Set.** Die bis zu 6 Kunden-WhatsApp am SA-Moment werden auf **ein** Set pro Ereignis konsolidiert; alles Ausgehende über die C3-Outbox mit Dedup-Key. → **C3**.
2. **P1.2 Status-Dubletten → verschmelzen, wenn operativ korrekt.** Die bereinigte `operative_status`-Achse mit der A2-State-Machine (#4819) festlegen; Dubletten (`abgelehnt`/`abgelehnt_final`, `regulierung`/`-laeuft`/`reguliert_vollstaendig`, `kanzlei-uebergeben`/`an_externe_kanzlei_uebergeben`) **nur** zusammenführen, wo sie operativ dasselbe bedeuten — kein blindes Mergen. → **A2/C1**.
3. **P1.3 KVA-Betrag Pflicht → ja.** Bereits umgesetzt via **#4804** (gemergt, „KVA-Betrag ist Pflicht — sonst keine Kunde-Freigabe"). Erledigt.
4. **P1.4 Netzwerk-Ranking → harter Override.** Ein zahlender Netzwerkpartner rankt **immer** über jedem kostenfreien SV (nicht nur Tiebreaker bei gleicher Eignung). Überstimmt die ursprüngliche Tiebreaker-Empfehlung. → **J10/`matching-score.ts`/Netzwerk-Lane 332d22f1**.
5. **P1.5 Freundes-Graph → gegenseitig bestätigte Verbindung.** Intra-Netzwerk (beidseitig bestätigt) = **keine** Provision (Abo deckt es); Suppression an Release-Zeit (`completion-release-gate.ts`). → **J9/C3/Netzwerk-Lane**.
6. **P1.6 Preismodell → erstmal wie designt.** Netzwerkpartner-Flat-Abo (Monats-Flat + einmalige Setup-Fee, beide via Stripe), Bestand comped. **Per-Kunde-/nutzungsbasiertes Pricing = spätere Skalierungs-Option** (Beispiel-Trigger ~50 Kunden), jetzt **nicht** zu bauen. Konkrete Fee-/Abo-Zahlen bleiben offen (Aaron/Netzwerk-Lane legt sie bei P0-Bau fest). → **J8/J9/Netzwerk-Lane**.

**P2** (7 Soll-Klärungen): ohne Widerspruch gelten die vorgeschlagenen Defaults (`OFFENE-FRAGEN.md` §P2). **P3**: C-intern, kein Aaron-Input.

**Review:** getroffen (Aaron, 29.07.) — P1 sind die A1-Review-Freigabe der kritischen Punkte; die Journey-Review-Haken (§2) können gesetzt werden.
