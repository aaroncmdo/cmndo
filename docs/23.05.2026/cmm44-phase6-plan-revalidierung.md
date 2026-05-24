# CMM-44 — Revalidierung des Gesamtplans bis Phase 6

**Datum:** 2026-05-23 · **Branch:** `kitta/cmm44-phase6-reader-sweep`
**Frage (Aaron):** Wurde der gesamte Plan bis Phase 6 **vollständig und richtig** abgearbeitet?
**Evidenz:** `docs/23.05.2026/cmm44-phase6-reader-sweep-inventory.md` (417 faelle-Direktzugriffe, slice-gemappt) + Slice-Status-Memories + Phase-1-Doc.

---

## 0 · Verdikt (Executive)

**NEIN — der Plan ist nicht Phase-6-reif.** Die Schema-Hälfte (additive `ADD COLUMN` + Backfill auf die Sub-Tabellen) ist bei den DONE-Slices weitgehend gelaufen. Aber die **zweite Hälfte jedes Slices — der Reader/Writer-Sweep (PR2) — wurde systematisch unvollständig gemacht.** Das statische Inventar findet **417 faelle-Direktzugriffe über 133 Files**, die beim `DROP TABLE faelle` brechen.

Zwei Qualitäten von Problemen:
1. **Korrektheits-Fehler (JETZT aktiv, nicht nur Phase 6):** DONE-Slices, deren SSoT auf die Sub-Tabelle umgezogen ist, haben **Writer**, die weiter `faelle` beschreiben → der Wert landet in einer toten Kopie, der echte SSoT bleibt leer. Das ist **stiller Datenverlust heute**, kein zukünftiges Risiko.
2. **Vollständigkeits-Lücken (Phase-6-Breaker):** Reader/Filter auf relocatete faelle-Spalten, die beim Drop `column does not exist` werfen.

Genau die Drift, vor der die Slice-Memories selbst gewarnt haben: *„2-Stufen-Review Pflicht — additiver Sweep maskiert Reader-Misses (faelle behält Werte, Reader brechen erst für neue Fälle)."* Die Reviews haben das nicht durchgängig gefangen.

---

## 1 · Per-Slice-Vollständigkeitsmatrix

| Slice | Ziel-Sub-Tabelle | Claimed (Memory) | Schema | Code-Sweep (Inventar-Evidenz) | Verdikt |
|---|---|---|---|---|---|
| **SP-A / A2 / A3** | claims (DUP-Drops + fall_nummer) | DONE/gemergt | ✅ Drops gelaufen | ⚠️ 22 claims-Business-Reader übrig (lead_preis/marketing/polizei/org) | **partiell** |
| **SP-B** | claims (64 claim-globale, additiv) | DONE (#1441..1473) | ✅ additiv | ⚠️ Teil der 22 claims-Business-Reader = SP-B-Spalten nicht gesweept | **Sweep unvollständig** |
| **SP-C** | claim_parties (Parteien-Snapshots) | **IN-FLIGHT** (PR #1535 offen) | 🟡 läuft | 🟡 117 Breaker (erwartet) — **inkl. `kunde_id`-Ownership 61×** | **in Arbeit, kritisch** |
| **SP-D** | gutachter_termine (25 Termin-Spalten) | DONE (#1526..1533) | ✅ | ⚠️ 5 Breaker — v.a. `besichtigungsort`-Fallback-Write (§7-Grenzfall) | **fast vollständig** |
| **SP-E** | vehicles (Fahrzeug-Spec) | **PENDING** (blockiert) | ❌ nicht gestartet | 55 Stellen (faelle ist HEUTE noch SSoT → korrekt) | **nicht gestartet** |
| **SP-F** | ? (Vorschäden/Cardentity) | **PENDING** | ❌ | 20 Stellen (faelle noch SSoT) | **nicht gestartet** |
| **SP-G / G2** | gutachten + gutachter_termine.claim_id | DONE (#1518/1519/1521/1525) | ✅ | ⚠️ 2 Reader (nutzungsausfall_tagessatz, wertminderung) | **fast vollständig** |
| **SP-H** | auftraege (18 LC-Spalten) | DONE (#1520) | ✅ | ✅ keine prominenten Breaker (peelAuftraegeColumns greift) | **sauber** |
| **SP-I1–I6** | kanzlei_faelle (48 Spalten) | **DONE** (gerade „komplett") | ✅ | ❌ **64 Breaker** — Reader **und** Writer, inkl. Datenverlust | **Sweep gravierend unvollständig** |
| **SP-J** | claim_payments + claims | DONE (#1545/1547) | ✅ | ⚠️ 2 (`zahlungsweg`, bewusst faelle laut #1551 — §6-Grenzfall) | **fast vollständig** |
| **Timestamps** | claims.created_at/updated_at | DUP→claims | 🟡 | 93 mechanische Filter/Order/Update — **Grenzfall: nur Breaker bei Full-Table-Drop** | **Scope-Entscheidung offen** |
| **Seed/Test** | gemischt | dev-only | — | 33 (create-test-fall 19, seed-testdata 11) | **dev-only, niedrig** |

---

## 2 · Die gravierendsten Funde — Writer mit stillem Datenverlust (JETZT)

Diese Stellen schreiben relocatete Spalten **direkt auf `faelle`**, obwohl der SSoT seit dem jeweiligen Slice auf `kanzlei_faelle` lebt. Der echte SSoT wird **nicht** aktualisiert:

| Datei:Zeile | Spalte(n) | Slice (SSoT) | Effekt heute |
|---|---|---|---|
| `app/faelle/[id]/_actions/kanzlei-paket.ts`:357 | `regulierung_am` | SP-I3 | **Stale-Kommentar „bleibt faelle-only"** widerspricht SP-I3. Regulierungs-Datum fehlt in Finance-Reports |
| `app/api/cron/vs-timer/route.ts`:66 | `vs_eskalationsstufe` | SP-I3 | VS-Eskalationsstufe wird in tote Kopie geschrieben |
| `app/faelle/[id]/_actions/prozess.ts`:160/242 | `ruege_counter`, `ruege_gesendet_am`, `vs_eskalationsstufe` | SP-I5/I3 | Rüge-Zähler + Eskalation gehen nicht in den SSoT |
| `app/faelle/[id]/_actions/filmcheck.ts`:49 | `mandatsnummer` | SP-I2 | Mandatsnummer-Write in tote Kopie |
| `lib/kanzlei/push-mandat.ts`:225 | `mandatsnummer` | SP-I2 | dito |
| `app/api/stripe/webhook/route.ts`:338 | `kanzlei_provision_status`, `kanzlei_provision_ausgezahlt_am` | SP-I/J | Provisions-Status-Write in tote Kopie |
| `app/faelle/[id]/_actions/dokumente.ts`:302/336 | `anschlussschreiben_url/_ocr_am/_sendedatum/_unterschrift` | SP-I2 | AS-Metadaten gehen nicht in den SSoT |
| `app/api/ocr-trigger/route.ts`:137 | `halter_geburtsdatum` | SP-C | (in-flight) Halter-Daten |

> **Hinweis Eigen-Arbeit:** Ein paar SP-I6-`kanzlei_id`-Reader (`erstelle-abrechnung:101`, `get-kunde-faelle:419`) sind in meinem offenen **PR #1613** bereits gefixt — das Inventar lief gegen staging (vor #1613). Der **Großteil der 64** (SP-I2–I5-Spalten) ist davon NICHT abgedeckt.

---

## 3 · Grenzfälle — brauchen Entscheidung (gaten den Scope)

1. **Timestamps (93):** Droppt Phase 6 die **ganze Tabelle** (dann sind alle 93 `faelle.created_at/updated_at`-Filter Breaker) oder nur die Business-Spalten (dann bleiben die 93 erlaubt)? → entscheidet, ob 93 Stellen in den Sweep müssen.
2. **`kunde_id`-Ownership (61×):** Doc mappt → claim_parties, realer SSoT `claims.geschaedigter_user_id`. Bleibt `faelle.kunde_id` als Ownership-Filter bis zuletzt, oder Umbau auf `claims.geschaedigter_user_id`? **Höchstes Risiko** (Kunden-Zugriffskontrolle portalweit). Zentral in `lib/claims/kunde-ownership.ts` + `app/kunde/layout.tsx`.
3. **`zahlungsweg` (2):** Laut #1551 bewusst faelle-bleibend bis eigene `claims.zahlungsweg`-Spalte. Eigene Migration anlegen oder bis Phase 6 schieben?

---

## 4 · Was diese Revalidierung NOCH NICHT abdeckt (Ehrlichkeit)

Das Inventar ist **code-seitig** (Reader/Writer). Für ein *vollständiges* „richtig & vollständig" fehlt die **DB-/Schema-Seite**, live zu verifizieren (Memory-Snapshots sind stale, `feedback_information_schema_check`):
- Existieren alle Sub-Tabellen-Spalten je Slice tatsächlich (information_schema)?
- Sind die Backfills gelaufen (keine NULL-Lücken in der SSoT-Spalte bei alten Fällen)?
- Sind alle Migrations `repaired`/applied (kein Twin-Drift)?
- Stimmen die repointeten Views (`v_faelle_mit_aktuellem_termin` etc.) mit dem Code-Erwartung überein?
- Linear-Reconciliation: Sind CMM-45..52 / SP-Tickets als Done markiert, die es real nicht sind?

→ **Vorschlag:** als nächster Schritt ein DB-seitiger Verifikations-Pass (pro Slice information_schema + Backfill-NULL-Count + migration-list), ggf. parallele Agenten pro Slice-Cluster.

---

## 5 · Empfohlener Weg zur Phase-6-Reife

1. **Sofort (Korrektheit):** Die ~8 Writer mit Datenverlust (§2) fixen — die bluten heute. Klein, hoher Wert. Stale Kommentare mit.
2. **DONE-Sweeps schließen:** kanzlei_faelle 64 + claims-Business 22 + gutachten 2 + gutachter_termine-Fallback. SSoT existiert → sofort machbar (Embed/View/Helper-Pattern wie in den Slices).
3. **DB-Verifikation** (§4) pro DONE-Slice.
4. **SP-C fertig** (claim_parties, inkl. `kunde_id`-Ownership zentral).
5. **SP-E + SP-F bauen** (vehicles/vorschäden) — die einzigen echten „noch nicht gestartet".
6. **Grenzfall-Entscheidungen** (§3) vor dem jeweiligen Sweep.
7. **Dann erst** Phase 6 (`DROP`), mit Portal-Smoke nach jedem Drop (`feedback_post_drop_smoke`) — statisch nicht gefundene dynamische `fall[feld]`-Writes abfangen.

**Kernaussage:** „bis Phase 6" ist nicht ein letzter Schliff, sondern noch ~3 unfertige Slices (C/E/F) **plus** das systematische Nachholen der Sweeps in den als DONE markierten Slices. Phase 6 selbst (der Drop) ist erst danach gefahrlos.

---

## 6 · Plan/Linear-Abgleich (2026-05-23)

Dritte Dimension der Revalidierung: stimmt das Linear-Tracking mit der Realität?

**Master `CMM-44` = „In Progress"** (statusType started, NICHT completed) — korrekt, nicht fälschlich abgeschlossen. Aber:

1. **Die Sub-Tickets `CMM-45..52` beschreiben eine VIEL kleinere Scope** als real ausgeführt: die ursprüngliche „Phase 2-4 Finishing"-Idee = nur die **41 faelle↔claims-Duplikate** migrieren + droppen. Status:
   - `CMM-46` Reader-Audit (506) · `CMM-47` Reader-Migration · `CMM-48` Writer-Migration (54) → **alle „Done"** (14.–16.05.)
   - `CMM-45` (fall_typ/unfall_konstellation Quick-Drop) → **Canceled** (Pre-Check: aktiv genutzt)
   - `CMM-49` (DROP 41 Duplikate) → **Backlog** ✓ · `CMM-50` (vehicles = SP-E) → **Backlog** ✓ · `CMM-51` (gutachten) → **In Progress** · `CMM-52` (Prod-Data-Audit) → **Done** (No-Op)

2. **`CMM-47`/`CMM-48` „Done" ist irreführend.** Sie betreffen nur die 41 claims-Duplikate-Reader/Writer. Die **danach** gestartete, viel größere **SP-A..SP-L-Dekomposition** (335 Spalten über 7 Sub-Tabellen: kanzlei_faelle/gutachter_termine/gutachten/auftraege/claim_parties/claim_payments/vehicles) hat **eigene** Reader/Writer-Sweeps — und genau die zeigt das Inventar als 417 Breaker unvollständig. Wer nur Linear liest, denkt „Reader/Writer-Migration: Done".

3. **SP-A..SP-L existieren NICHT als Linear-Issues** — nur als 50+ PR-Attachments am Master + Decomposition-Doc + Memories. **Kein Linear-Status pro Slice** → keine saubere Tracking-Quelle, welcher Slice wirklich fertig ist.

4. **SP-C real kaum gestartet:** nur PR #1535 (SP-C1 PR1, Backfill kunde→claim_parties). Kein SP-C1-PR2-Sweep, kein SP-C2/C3 → die 117 claim_parties-Breaker sind ungesweept (konsistent mit „in-flight").

**Fazit Plan-Dimension:** Die Strecke wurde **über ihre Linear-Definition hinaus erweitert**, ohne die Tickets nachzuziehen. Empfehlung: SP-A..L als echte Sub-Issues unter CMM-44 anlegen (mit realem Status aus dieser Revalidierung), CMM-47/48 als „nur 41-Duplikate-Scope" annotieren, sonst ist der Plan-Stand für jeden außer den Ausführenden irreführend.

---

## 7 · Status der Revalidierung selbst

| Dimension | Stand |
|---|---|
| **Code-Seite** (Reader/Writer-Sweep) | ✅ fertig — Inventar 417 Breaker, §0–§5 |
| **Plan/Linear-Seite** | ✅ fertig — §6 |
| **DB-Seite** (information_schema / Backfill-Gaps / Migrations-Drift) | ✅ fertig (2026-05-24, nach DB-Recovery) — §8 |

---

## 8 · DB-Seite — Live-Verifikation (2026-05-24)

Gegen Prod `paizkjajbuxxksdoycev` (supabase CLI `db query --linked`, nach 544-Recovery).

### 8.1 Struktur
`faelle` = **278 Spalten** (von urspr. 341 → ~63 gedroppt; SP-A/A2/A3-Drops real passiert). Sub-Tabellen existieren: claims 154 · kanzlei_faelle 56 · gutachter_termine 107 · gutachten 78 · claim_parties 54 · claim_payments 13 · auftraege 35 · vehicles 45. **`vorschaeden` existiert NICHT** → SP-F-Zieltabelle nie angelegt (bestätigt: nicht gestartet).

### 8.2 SP-I Backfill/Write-Integrität (49 faelle, 12 mit kanzlei_faelle-Row)
**Backfill sauber:** `gap=0` für regulierung_am/mandatsnummer/kuerzungs_betrag/anschlussschreiben_am/kanzlei_id/ruege_gesendet_am/vs_kuerzung_grund — wo eine kf-Row existiert, faelle==kf. **Die Datenverlust-Writer (§2) haben in Prod noch KEINEN echten Schaden angerichtet** (nur 12 Kanzlei-Fälle). Code-Risiko bleibt für künftige Writes. `gap_vs_eskstufe=37` = die 37 faelle OHNE kf-Row, alle DEFAULT `'vs-01'` → **benignes Artefakt.**

### 8.3 Inventar-Korrektur (Mapping-Fehler)
`kanzlei_honorar` + `kanzlei_provision_status` + `kanzlei_provision_ausgezahlt_am` liegen **NUR auf faelle** (nicht claims/kanzlei_faelle/claim_payments), nicht in `KANZLEI_FAELLE_COLS`. → Inventar hat sie wegen „kanzlei"-Präfix fälschlich als kanzlei_faelle-Breaker gezählt. Sie sind **faelle-native Operativ-Spalten** → Reads/Writes korrekt. **~8 der 64 kanzlei_faelle-„Breaker" sind False Positives.**

### 8.4 FUNDAMENTALE REFRAME — Phase 6 ≠ `DROP TABLE faelle`
CMM-44-Master + CMM-49: *„faelle = Operative/Workflow-Tabelle … die Duplikat-Datenspalten sollen weg."* **faelle ÜBERLEBT** als Operativ-Tabelle; gedroppt werden nur relocatete DATEN-Spalten. Das Inventar nahm Full-Table-Drop an → die **417 sind eine Obergrenze.** faelle-native Operativ-Spalten sind keine Breaker (honorar/provision belegt; `kunde_id`/`created_at`/`updated_at` = offene Grenzfälle §3 — bleiben sie operativ, fallen ~150 der 417 weg).

### 8.5 Migrations-Drift
SP-Ära (…–20260523202538, inkl. alle SP-I) durchgängig **LOCAL == REMOTE** → kein Twin-Drift, reproduzierbar.

### 8.6 DB-Verdikt
Schema-Seite **gesund** (Drops real, Backfills sauber, keine Drift, kein realer Prod-Datenverlust bisher). Die **Code-Sweep-Lücken bleiben das eigentliche Problem** — ihr Phase-6-Impact hängt aber an der Scope-Entscheidung §8.4/§3. **Empfehlung: zuerst die Drop-Liste fixieren** (welche Spalten gehen wirklich, was bleibt operativ?), dann ist klar welche der 417 echte Breaker sind.
