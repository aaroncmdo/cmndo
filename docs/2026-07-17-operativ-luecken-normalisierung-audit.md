# Operativ-Lücken- & Normalisierungs-Audit (17.07.2026)

**Auftrag (Aaron):** „Wo gibts operativ noch Probleme oder Lücken, damit alles zusammenhängt
und alle die Infos haben die sie brauchen? Was ist noch nicht normalisiert und/oder DB-driven?
Groß angelegt."

**Methode:** 4 parallele Read-only-Erhebungen (Session b0e963b6, je ein Agent):
**A** Code-Scan hartkodierte Business-Konfig · **B** Live-DB-Integritäts-/Normalisierungs-Proben
(prod `paizkjajbuxxksdoycev`, nur SELECT) · **C** Notification-/Info-Fluss-Coverage-Matrix über
alle 9 Rollen · **D** Re-Verifikation aller bekannt-offenen Baustellen gegen heute (Code
origin/staging + prod-Schema + Postgres-Logs 24h). Vorab konsolidiert: bestehende Audits
(Flag-DB-Driven #4136, Status-Achsen ✅, Provision ✅, View-Konsistenz T1 ✅).

**Kontext-Hinweis DB-Volumen:** prod ist klein (claims=8, leads=16, tasks=40) — B-Findings sind
**strukturell**, nicht volumetrisch. Das ist die gute Nachricht: JETZT ist der billigste
Fix-Zeitpunkt (FKs/CHECKs ohne Altlast-Bereinigung).

---

## Executive Summary — 4 Bänder

| Band | Inhalt | Charakter |
|---|---|---|
| **P0 Blutend** | 4 live feuernde Bugs/Ausfälle (Logs belegt) + 1 herrenloser Fix-PR | Tage |
| **P1 Rollen-Taubheit** | 2 Rollen strukturell ohne jede Benachrichtigung; KB in Alt-Pfaden taub; 1 State-Machine-Bypass | 1–2 Wochen, programmatisch |
| **P2 DB-driven-Config** | Die ENV-Gate-Klasse (4 Gates strukturell unsicher) + Fristen/Preise/Taxonomien deploy-pflichtig | Architektur-Slice `app_config` |
| **P3 Schema-Normalisierung** | FKs, Doppel-Spalten, Referenz-Generationen, CHECK-Lücken — jetzt billig | Sammel-Migrations-Slices |

Bereits gelöst und NICHT Teil dieses Audits: Status-Achsen (operative_status = eine Achse, Lane
läuft weiter an kasko-reparatur-phase), FG1/2/6/7/8 des Flag-Audits (FG7 heute verifiziert:
1 statt 69 gestauter sla_breach-Tasks), Provision inbound-only, 5 von 8 Schema-Drift-Bugs.

---

## P0 — Operativ blutend (Logs/DB belegt, jetzt handeln)

### P0.1 · PR #4455 ist OPEN und herrenlos — 2 Drift-Bugs feuern live
`gutachter_termine.adresse` (Spalte heißt `besichtigungsort_adresse`) bricht
`mitarbeiter/kundentermine` **live** (Postgres-Log 24h), `leads.fall_id` bricht
`erstelle-abrechnung`. Der Fix-PR `kitta/fix-kundentermine-abrechnung-drift` (#4455) existiert,
ist aber ungemergt und keiner Session zugeordnet. **Empfehlung: CI prüfen → mergen.** (Ein
früheres Memory behauptete fälschlich, #4455 sei durch.)

### P0.2 · Reliability-Alerts laufen ins Leere (3 Task-Waisen, Muster wächst)
`tasks.empfaenger_user_id` zeigt bei 3 offenen `reliability`-Tasks (13.–14.07.) auf
nicht-existente `profiles.id`s — stiller Admin-Alerting-Ausfall. **Fix:** FK
`tasks.empfaenger_user_id → profiles.id` (hätte es verhindert) + Quelle der IDs im
Reliability-Generator finden. Möglicher Zusammenhang: Log-Nebenbefund
`invalid input value for enum user_role: "firma"` (unkatalogisiert).

### P0.3 · Timeline-Query `email_log.body_html` feuert weiter live
`lib/fall/communication-timeline.ts:102` — bekannt, Owner existiert (Session-Lane
„aktivitätenverlauf detailviews", 8e584af2). Nur nachhalten, nicht doppeln.

### P0.4 · `kanzlei_abrechnungen.fall_id`-Query kaputt — Produktfrage
`flows.ts:592` liest Spalten, die es nie gab (nur `created_at` existiert). **Entscheidung
Aaron:** Funktion+Testzweig löschen oder gegen das Monats-Schema neu bauen.

### P0.5 · Eskalation „Kanzlei-Rückfrage überfällig" alarmiert nur den Kunden
`claim.kanzlei_re_frage_due` (channel-matrix.ts:378) → `kunde: in_app` — die Rolle, die
antworten muss (KB/Admin), fehlt im Eskalationssignal. Ein-Zeilen-Klasse-Fix in der Matrix.

---

## P1 — Rollen-Taubheit (Info-Fluss; Agent-C-Matrix im Anhang)

**Architektur-Befund:** Es gibt ZWEI Systeme — neu/zentral (`emitEvent` → `notification_events`
→ Fan-Out via `channel-matrix.ts`, Rollen hart auf kunde/SV/KB/admin/makler typisiert) und
alt/direkt (`sendCommunication` + verstreute `createMitteilung`). Die neueren Pfade (Endzustände
AAR-840/841, Gutachten-fertig, Werkstatt-Vermittlung) sind vorbildlich — die Lücken sind
**Rückport-Schulden auf Alt-Events + fehlende Aufnahme neuer Rollen**.

### P1.1 · Flottenmanager ist strukturell taub (härtester Fund)
Die Rolle existiert in KEINEM Empfänger-Typ (`EmpfaengerRolle`, `Role`, `ROLE_MAP`);
`src/lib/flotte/**` hat 0 Notify-Aufrufe; `convertLeadToClaim` löst die Flotte nur für
Provision auf, notifiziert nie. **Ein Flottenmanager erfährt von nichts** — nicht vom neuen
Schaden am Flottenfahrzeug, nicht vom Status, nicht von der Regulierung — obwohl sein Portal
eine Update-Glocke rendert. Fix-Slice: Rolle in die 3 Typ-/Map-Stellen + `fall.created`/
`fall.status_changed`/`claim.*`-Fan-Out um Flotten-Auflösung (claim → vehicle →
flotten_fahrzeuge → firmen_flotten_konten) erweitern.

### P1.2 · Kanzlei-Portal-Glocke ist strukturell leer
`empfaenger_rolle: 'kanzlei'` wird **repo-weit von keinem Call-Site** befüllt (Typ existiert).
Mandats-Push notifiziert bei FEHLSCHLAG KB/Admin, bei Erfolg niemanden in der Kanzlei.

### P1.3 · KB-Rückport auf 4 Alt-Pfade
KB fehlt in: generischem `fall.status_changed` (~14 operative Übergänge!), Standard-Storno
(`fall.storniert` — das neuere `claim.storniert` hat KB korrekt), SV-Zuweisung
(`fall.sv_assigned`), klassischen Termin-Events (bestätigt/abgelehnt/storniert/Gegenvorschlag —
die neuere Verlegungs-Familie hat KB). Muster existiert, nur zurückportieren.

### P1.4 · Werkstatt-Reparatur-Abschluss umgeht die State-Machine
`werkstatt/(shell)/auftraege/reparatur-abschluss-actions.ts:95` schreibt
`operative_status='abgeschlossen'` per direktem `.update()` — kein Event, **kein
Timeline-Eintrag**, KB/Admin sehen den Abschluss nirgends. Das ist exakt die FG1-Klasse
(Single-Writer-Funnel), neu entstanden nach dem FG1-Fix. → `transitionFallStatus` nutzen.
**Empfehlung zusätzlich:** FG1-Ratchet-Idee reaktivieren (Direkt-`operative_status`-Writes
außerhalb der Engine per Scan blocken), sonst wächst diese Klasse nach.

### P1.5 · Dokument-Anforderer ohne Rückkanal
`dokumentAnfordern` speichert `angefordert_von_user_id`, aber Upload notifiziert den
Anforderer nicht gezielt — wer anfordert, muss manuell nachschauen.

---

## P2 — Nicht DB-driven (Konfig im Code; Agent A)

### P2.1 · Die ENV-Gate-Klasse: 4 Flags strukturell unsicher (prod+staging teilen EIN env-File)
| Flag | Stelle | Problem |
|---|---|---|
| `VS_MELDUNG_ENABLED` | `vs-meldung/sende-unfallmeldung.ts:30` (Default true) | Eigener Kommentar verlangt „staging MUSS false" — physisch unmöglich |
| `CANONICAL_FLOWLINK_ENABLED` | `flow/[token]/page.tsx:291` | Rollout-Gate nicht staging-only testbar |
| `SELF_SERVICE_AUTO_ISSUE` | `api/anfrage-from-lp/route.ts:213` | dito |
| `CHANNEL_ROUTER_MODE` | `communications/channel-router.ts:40` | Phasen-Flag (Meta-Approval) — muss pro Umgebung/Zeitpunkt schaltbar sein |

**Ziel-Architektur:** `app_config(key, environment, value)`-Tabelle (+ typed Reader mit
Code-Default als Fallback). Löst zugleich das dokumentierte VS-Meldung-Smoke-Risiko. Das ist
DIE eine strukturelle Investition dieses Bands.

### P2.2 · Business-Zahlen deploy-pflichtig / dupliziert
- **„14 Tage" = 4 verschiedene Regeln in 5+ Files** (SV-Verifizierungsfrist ×5-Stellen,
  Säumnis-Schwelle ×3, Kanzlei-Zahlungsziel, Anzahlung) — je als rohes `14*24*60*60*1000`.
  Änderung einer Frist erfordert das Treffen der richtigen Teilmenge. → benannte Konstanten
  (Muster `finance/constants.ts` existiert) bzw. `app_config`.
- **`FINANCE`** (CPA 150 €, Split 75/25, Rabatte) + **`PAKETE`** (Preise 1500/3750/7500 €,
  Kontingente, Radien) — sauber zentralisiert, aber jede Preisanpassung = Deploy. → DB-Tabelle,
  Code-Konstante als Fallback.
- **Alert-/Dispatch-Mails:** `ADMIN_NOTIFICATION_EMAIL||'aaron.sprafke@…'` vs.
  `ADMIN_ALERT_EMAIL||'aaron@…'` (2 ENV-Namen, 2 Fallback-Adressen, 5 Stellen) +
  `info@claimondo.de` 4× dupliziert (Migration zu `schaden@` laut Kommentar geplant → Drift
  vorprogrammiert). → eine Konfig-Quelle.
- **Radius-Fallback-Drift bereits eingetreten:** 25 km (`lade-deadpin-fallback.ts:22`) vs.
  40 km (`debugSvMatching.ts:89`) für DIESELBE Spalte `paket_umkreis_km`.
- **Taxonomien als TS-Arrays:** `QUALIFIKATIONEN`/`SPEZIFIKATIONEN`/`SCHADENARTEN`
  (8/18/15 Einträge, 6 Consumer, nachweislich pflege-intensiv AAR-238) → Referenztabellen.
- **Partner-Sondercron:** `maik-monatsabrechnung` + Tabelle `provisionen_maik` — skaliert
  nicht auf Partner #2 → generische `marketing_partner`-Struktur.

**Sauber (DB-driven bestätigt):** Versicherer-Stammdaten, Geo-Exklusivität, SLA-Fristen
(`sla_tracking`), SV-Radien (`paket_umkreis_km`), Embed-Rate-Caps.

---

## P3 — Schema-Normalisierung (Agent B; jetzt billig, n ist klein)

1. **Fehlende FKs (Top):** `tasks.empfaenger_user_id→profiles` (**hat schon Waisen**, P0.2),
   `personen.user_id→profiles`, `fall_dokumente.hochgeladen_von_user_id→profiles`,
   `claims.eskaliert_an_admin_id→profiles`, `partner_provisionen.fall_id/lead_id` (Geschwister
   `claim_id` HAT FK — Inkonsistenz in derselben Tabelle).
2. **`fall_id`/`claim_id`-Doppelspalten** auf 4 Tabellen (fall_dokumente, tasks,
   partner_provisionen, gutachter_termine) — heute wertgleich, aber nichts erzwingt es.
   → pro Tabelle: Consumer-Grep, dann Legacy-Spalte droppen (oder GENERATED).
3. **`gutachter_termine` in 2 Referenz-Generationen:** 5/15 Termine NUR über polymorphes
   `bezug_typ/bezug_id` erreichbar — naive `lead_id`-Queries unterzählen um 1/3.
   → Konsolidierung (Backfill `lead_id` ODER alle Consumer auf polymorph).
4. **Claim-Anlagepfad `manuell_admin` lässt Kernfelder leer:** `vehicle_id` (7/8 NULL
   gesamt!), `claim_parties.person_id` (Namensauflösung fällt auf gemeinsames Profil zurück
   → 5 Fälle zeigen identisch falschen Namen), `leads.konvertiert_zu_claim_id`
   (Vorwärts-Pointer fehlt bei 4/7 konvertierten — Reverse-Join stimmt). Hinweis: die
   konkreten Rows sind Test-Claims (16.07. 22:43-Batch), der PFAD-Befund ist real.
5. **Tote/Deprecated-Spalten:** `tasks.task_typ` (92 % NULL, Rest dupliziert `typ`),
   `claims.makler_id` (0 Writes, polymorphes `vermittler_*` ersetzt es).
6. **CHECK-Lücken mit Konventions-Mix:** `tasks.typ` + `leads.source_channel` mischen
   Bindestrich/Unterstrich ohne CHECK; `partner_provisionen.status='pending'` als einziger
   englischer Statuswert. → CHECKs jetzt setzen (n=16–40).
7. **`operative_status`-CHECK trägt ~15 Legacy-Synonyme** (z.B. `vs-abgelehnt`/`abgelehnt`/
   `abgelehnt_final`) — **gehört der laufenden Status-Achsen-Lane** (3cff8e12), nur bestätigt.

---

## Offen/Unklar (beobachtet, nicht belegt)

- **Realtime `permission denied for table claims`:** Code-Fix (#4398) ist deployt, Grants
  konsistent — Fehler taucht trotzdem im 24h-Log auf, clustert aber mit Audit-RPC-Proben →
  vermutlich synthetisches Grant-Audit-Rauschen paralleler Sessions. Klären via
  `application_name` bei Reproduktion.
- **Log-Nebenbefunde:** `invalid input value for enum user_role: "firma"` (wiederholt,
  Quelle unbekannt — evtl. verwandt mit P0.2) · `column "erstellt_am" does not exist`
  (umgekehrte Drift-Richtung, unkatalogisiert).
- **Chat: 4 nachrichten-Policies mit toten Kanal-Zweigen** (`portal-kunde-*` nicht im CHECK) —
  bestätigt, unverändert, gehört der Chat-Lane; nichts bricht.
- **`v_werkstatt_auftrag` kunde-Name** nutzt weiter profiles/leads statt
  `v_claim_kunde_name`-Helper (View-Konsistenz Teil 2). Blockade (ws6) wirkt aufgelöst
  (View nutzt schon partner_provisionen) — mit ws6-Lane bestätigen, dann bauen (Rezept liegt).

## Lane-Zuordnung (Stand 17.07., aktive Sessions respektiert)

| Paket | Vorschlag |
|---|---|
| P0.1 #4455-Merge + P0.2 FK/Waisen + P0.5 Matrix-Zeile | Sofort-Slice, 1 Session (kann ich übernehmen) |
| P0.3 | läuft (8e584af2-Lane) · P0.4 Aaron-Entscheid |
| P1.1 Flottenmanager-Notifications | passt zu meiner Flotten-Lane (Kontext frisch) |
| P1.2–P1.5 KB/Kanzlei-Rückport + Bypass-Fix | eigener „Notification-Rückport"-Slice; P1.4 ggf. mit Status-Achsen-Lane abstimmen |
| P2.1 `app_config` | eigener Architektur-Slice (klein, hoher Hebel) — danach P2.2 schrittweise |
| P3.1–3.6 | 1–2 Sammel-Migrations-Slices (Regel 2, MCP) |
| P3.7 Status-CHECK · Chat-Zweige · Detail-View-Routen | laufen bereits (3cff8e12 · Chat-Lane · b28f5568) |

**Rohdaten:** Die 4 Agenten-Vollreports liegen im Session-Log (b0e963b6/bec7fba4, 17.07.);
Kern-Inhalte sind oben vollständig konsolidiert.
