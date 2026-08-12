# FUNDAMENT — Rückführungsprogramm für claimondo-v2

> **Für Claude-Code-Sessions:** Dies ist ein Steuerdokument, kein einmaliger Plan. Lies zuerst §0 (Betriebsanleitung), claime genau EIN Paket in §2 (Statustabelle) und arbeite es nach seinem Paketblock ab. Code-Pakete (Phase C) erzeugen vor dem Bau einen eigenen Implementierungsplan nach `superpowers:writing-plans` unter `docs/superpowers/plans/`.

**Ziel:** Die Greenfield-Fundament-Prinzipien (Gedankenexperiment 28.07.2026) inkrementell in den Bestand zurückführen — ohne Rewrite, ohne Infrastruktur-Wechsel, mit den bestehenden Mitteln (Supabase-MCP, PR→staging-Flow, Playwright, Ratchet-Muster).

**Endzustand:** definiert durch die Checkliste in §9. „Fundament vollständig" ist eine Liste, kein Gefühl.

**Methode:** Strangler-Fig. Der Bestand bleibt in jedem Zwischenzustand lauffähig und grün. Erst Wissen destillieren (A), dann Prüfstand spannen (B), dann Kern umbauen (C), dann Arbeitsweise dauerhaft umstellen (D).

---

## 0 · Betriebsanleitung für die ausführende Session

### 0.1 Session-Start-Ritual (immer, in dieser Reihenfolge)

1. Dieses Dokument vollständig lesen. `AGENTS.md` gilt zusätzlich und **gewinnt bei jedem Konflikt** (insb. Regel 1: nie direkt auf main; Regel 2: DDL nur über Supabase-MCP `apply_migration` inkl. Twin-Drift-Schritt 3+4; Regel 3: kein unbegleiteter Stash; 7-Punkte-Audit vor jedem Commit).
2. §2 Statustabelle prüfen: Welche Pakete sind offen? Abhängigkeiten (Spalte „braucht") respektieren.
3. Genau EIN Paket wählen. Wenn zwei Sessions parallel laufen: nur Pakete ohne gemeinsame Dateien (Phase-A-Pakete sind untereinander parallel-sicher).
4. Paket claimen: Statuszelle in §2 auf `in Arbeit (<datum>, <branch>)` setzen UND einen Koordinations-Marker ins Memory-Verzeichnis schreiben (Projekt-Konvention).
5. Frischen Worktree anlegen: `node scripts/new-session-worktree.mjs fundament-<paket>`. **⚠ Bekannte Falle:** das Script zweigt vom HEAD des aktuellen Checkouts ab, und der Haupt-Checkout ist notorisch Tausende Commits stale. Nach dem Anlegen zwingend den Branch auf `origin/staging` setzen (`git fetch origin` + Branch auf `origin/staging` neu aufsetzen) und das verifizieren (`git log -1 origin/staging` vs. eigener HEAD).
6. Linear-Ticket je Paket; Branch-Schema `kitta/aar-<nr>-fundament-<paket>`.
7. **Ist-Erhebung ausschließlich im frischen Worktree.** Nichts aus diesem Dokument über Dateipfade oder Verhalten ungeprüft übernehmen — das Dokument beschreibt Erhebungsaufträge, keine verbürgten Pfade.

### 0.2 Harte Arbeitsregeln

- **Scope-Zaun:** Du baust ausschließlich, was im Paketblock steht. „Wo ich schon mal dabei bin"-Umbauten sind verboten — auch offensichtliche. Fund → als Notiz ins Paket-Ergebnis oder als Decision-Log-Eintrag, nicht fixen.
- **Spec-Lücke:** Wenn eine Entscheidung nötig ist, die weder hier noch in den Journeys steht: Entscheidung nach §1 (Verfassung) treffen, in `docs/fundament/DECISIONS.md` protokollieren (Format §8), weiterarbeiten. **Nie raten und schweigen, nie blockieren.**
- **Paket zu groß:** Wenn absehbar ist, dass das Paket nicht in eine Session passt: Paket in §2 in Tranchen splitten (z. B. `C1a`, `C1b`), nur die erste Tranche bauen, Rest sauber dokumentiert offen lassen. Niemals halbfertig ohne Statustabellen-Update enden.
- **Phase-C-Pakete:** Nach der Ist-Erhebung zuerst einen Implementierungsplan nach `superpowers:writing-plans` schreiben (`docs/superpowers/plans/YYYY-MM-DD-fundament-<paket>.md`), dann ausführen. Phase A/B (Doku + Tests) brauchen keinen separaten Plan.
- **Bestand bleibt grün:** Jedes Paket merged über normalen PR gegen `staging`. Kein langlebiger Programm-Branch. Bestehende CI-Gates (Build, Ratchets, knip) müssen grün bleiben.
- **Fertig-Ritual:** DoD-Nachweise im PR dokumentieren (Kommandos + Output), Statuszelle auf `PR #<n>` bzw. nach Merge `done (<datum>)`, Memory-Marker aktualisieren, Session-Abschluss-Checkliste aus AGENTS.md fahren.

### 0.3 Wo Wahrheit liegt

| Frage | Quelle |
|---|---|
| Wie arbeiten wir (Git, DDL, Audit)? | `AGENTS.md` |
| Was ist das operative Soll? | `docs/fundament/journeys/` (entsteht in A1) — bei Widerspruch zum Code gewinnt die reviewte Journey |
| Was wurde unterwegs entschieden? | `docs/fundament/DECISIONS.md` |
| Incident-Historie / Warum-Wissen | Memory-Verzeichnis des Projekts (MEMORY.md) |
| Ist-Verhalten | ausschließlich frischer Worktree auf origin/staging |

---

## 1 · Verfassung — 10 Prinzipien (Zielbild jeder Entscheidung)

1. **Der Fall ist das einzige Aggregat.** Wahrheit über einen Fall liegt am Claim und seinem Event-Log — nirgendwo sonst.
2. **Status wird nie direkt geschrieben.** Ziel: genau ein Übergangs-Modul (`transitionClaim`) für `operative_status`; jede Rolle, jeder Cron, jede API geht da durch (→ C1).
3. **Events statt Flags.** Timeline, Badges, „wartet auf X" werden aus dem Event-Log abgeleitet. Keine neuen `ist_*`/`hat_*`-Interaktions-Spalten (das FG-Programm ist die bestehende Umsetzung dieser Regel — andocken, nicht duplizieren).
4. **Eine Akte, viele Sichten.** Eine Fall-Detailansicht als gemeinsamer Kern, rollen-parametrisiert (→ C4). Neue Rolle = Konfiguration, nicht neues Portal.
5. **Ein Intake.** Alle Meldewege münden in ein `createCase`-Modul mit garantierten Nachwirkungen: Pflichtdok-Slots, FlowLink, Erstnotification, Dedup (→ C2).
6. **Magic-Link-first für Externe.** Kein Pflicht-Account für Kunde/Werkstatt/Gegner; Token-Zugänge sind der Normalweg, Accounts ein Upgrade.
7. **Server-first-Zugriff.** Client liest über definierte Views/RPCs je Rolle, schreibt über Server-Actions mit Guard + Row-Rückprüfung (`.select()`-Check). RLS ist Sicherheitsnetz, nicht Feinsteuerung (→ C5).
8. **Eine Outbox für alles Ausgehende.** WhatsApp/Email/In-App als Rows mit Dedup-Key, Fehlschlag erzeugt einen sichtbaren Task. Stilles Sterben ist verboten (→ C3).
9. **Ein Komponentensystem, Tokens als einzige Farbquelle.** Gilt bereits (AGENTS.md Komponenten-Set + Token-Ratchets) — dieses Programm fügt nichts hinzu, verstößt aber nie dagegen.
10. **Kein Feature ohne Reise.** Operatives Soll in Prosa VOR dem Bau, Journey-Smoke VOR dem Merge (→ B, D1). „OFFEN: Regel-4" als Dauerschuld wird strukturell abgeschafft.

---

## 2 · Statustabelle

Pflege-Regeln: claimen vor Arbeitsbeginn (§0.1 Schritt 4); Tranchen-Splits hier eintragen; niemals Zeilen löschen. **Referenz ist die getrackte Version auf `staging`** (`docs/fundament/FUNDAMENT.md`): Statuszellen werden im jeweiligen Paket-PR mitgepflegt; Echtzeit-Sichtbarkeit eines Claims leistet der Memory-Marker (§0.1 Schritt 4), nicht diese Tabelle; nach jeder Änderung dieser Datei das Artifact auf dieselbe URL republishen (URL in Memory `fundament-programm-pflichtlektuere`).

| Paket | Titel | braucht | Status | PR |
|---|---|---|---|---|
| A1 | Journey-Bibel (J1–J10) | — | ✅ **done** — alle 10 destilliert + Aaron-reviewt (29.07., `docs/fundament/journeys/`) | #4828/#4830/#4832/#4837 |
| A2 | State-Machine-Tabelle (Ist + Soll) | — | ✅ **done** (`docs/fundament/state-machine.md`) | #4819 |
| A3 | Notification-Matrix (Ist + Lücken) | — | ✅ **done** (`docs/fundament/notification-matrix.md`) | #4823 |
| A4 | Entry-Point-Register | — | ✅ **done** (`entry-points.md` + `entry-points-flowlink.md`) | #4816/#4818 |
| B1 | Journey-Smokes (Oracle) | A1 | ✅ **done** — Oracle-Matrix `journey-smokes.md` + Anchoring der bestehenden `golden-path-*`/`reparatur-weg-*`-Flows-Specs + J1/J4-Soll-Assert; Grün-Nachweis via **B2/CI** | #4846/#4856 |
| B2 | CI-Gate + Pending-Backlog | B1 | ✅ **done** (8c6de199, 01.08.) — Journey-Smoke-Step (J1-deep + J4) im `e2e`-Job, verlässlich grün nach Cross-Run-Serialisierung (#4911) + Hydration-Fix (#4929); der Grün-Nachweis entsperrte die C-Code-Phase. Skip-Politik in AGENTS.md §Feature-DoD (D1) verankert | #4866/#4889/#4911/#4929 |
| B3 | Journey-Suite J2–J10 in CI (§9-P2) | B1, B2 | ✅ **done (05.08.)** — **§9-P2 NACHGEWIESEN: alle 10 Journeys + J9-`lifecycle` als CI-Steps GRÜN gelaufen** (post-merge-`e2e`-Lauf **Run 30996577437** nach dem #5024-Merge, Squash `c189c390`): J1-deep/J4 · **J9 „13 passed" inkl. erstem scharfen CI-Flip pending→freigegeben** (lifecycle S8 über den echten Release-Cron; Geld-Guard ließ korrekt durch) · J8 · **J5 „1 passed"** (nach GH-Secret-Fix `TEST_ADMIN_PASSWORD` — trug einen Altwert, Auth-API-bewiesen; im Erst-Attempt deshalb skipped) · J10 S1+S3 (S2 = designtes `test.skip`) · J3 · J6 · **J7 „3 passed"** (inkl. Prod-Fix der schema-gedrifteten DSGVO-RPC Mig `20260804193646`) · **J2 „3 passed"**. Der e2e-JOB bleibt rot allein durch den Fremd-Blocker `feststellung-flow-gate`-ENOENT im finalen „Run E2E Tests"-Step (Owner: feststellung-Lane) — die Journey-Steps sind davon unabhängig. Kette konsolidiert gemergt via #5024 (Stacked-Squash-Livelock-Auflösung). Details: `journey-smokes.md` + DECISIONS 04./05.08. | #4948/#4955/#5024 |
| C1 | Ein Status-Writer: transitionClaim + Event-Log | A2, B1 | ✅ **done (11.08.) — prod-bewährt** — C1a-Funnel (#4935) + **C1-Finish (#5114): Ratchet-Baseline 2→0**, die 2 letzten Direkt-Writer (`kanzlei-wunsch/actions.ts`, `termine/close-nur-gutachter-termin.ts`) auf `transitionFallStatus` gehoben. Die beiden Nicht-Matrix-Terminals (`an_externe_kanzlei_uebergeben`/`termin_durchgefuehrt`) sind jetzt `BROADLY_REACHABLE_TERMINALS` (aus jedem AKTIVEN Zustand erreichbar, Muster `storniert` — die Direkt-Writes hatten keine Source-Guard) + Engine setzt `abgeschlossen_am`; 4 tote Smoke-Reset-Actions (0 Consumer) gelöscht statt allowlistet. **Voll-Achsen-Verifikation 11.08.:** TS-Achse `check:operative-status-writes` = 0 Verletzer (2781 Files) · **DB-Achse = 0** (Prod-READ: kein Trigger, keine Function schreibt `operative_status`; `cron_verjaehrungs_warner` liest nur) · `reparatur-cursor.ts` = Engine-Wrapper · `endzustand-actions` (Allowlist) schreibt eigenes `phase_transitions`+Emit. **Regel 4 GRÜN (11.08. 19:59 UTC, echter Prod-Traffic):** `phase_transitions` `from_phase=regulierung` → `to_phase=an_externe_kanzlei_uebergeben`, `payload.via=transitionFallStatus`, `abgeschlossen_am` gesetzt (CLM-2026-04139) — der Übergang steht **nicht** in der Matrix, lief also über `BROADLY_REACHABLE_TERMINALS`, und hinterließ vorher **kein** Event-Log. Ohne Prod-Vorkommen (kein Traffic, kein Fehler): `termin_durchgefuehrt` + der `manual`-Override — selber Engine-Pfad, passiv beobachtbar. | #4845 · #4935 · **#5114** |
| C2 | Ein Intake: createCase | A4, B1 | 🟡 **Code läuft, Tranchen a+b done (11.08.)** — Zelle war bis 12.08. auf „Plan done, Code gated" stehengeblieben, obwohl seit 04.08. Code gemergt ist (Status-Nachzug nach §8.1 versäumt). Ist-Stand verifiziert (alle PRs `MERGED`): **C2a** `createCase`-Modul + Wizard-A-1-Adapter (#4992, 04.08.) · **C2b-1** Pflichtdok-Slots im Konversions-Kern (#5126, 11.08.) · **C2b-Rest** Embed-Werkstatt-Finder B-1 + Aircall-Inbound D-4b (#5137, 11.08.). **Bewusst NICHT done:** §9-#5 zählt weiterhin **~13 Intake-Writer außerhalb `createCase`** (dispatch/leads, admin/faelle/anlegen, flow, schaden/[token], makler, flotte, public-rueckruf, matelso, spontan, …) → nächste Tranchen: Marketing C2c + Restliste | #4992 · #5126 · #5137 |
| C3 | Notification-Outbox | A3, C1 | 🟡 **Code läuft, Outbox live mit echten Consumern (11.08.)** — Zelle war bis 12.08. auf „Plan done, Code gated" (Nachzug versäumt). Verifiziert (alle `MERGED`): **C3a** enqueue + Worker (#5011, 08.08.) · toter `dispatch-fall-actions.ts`-Pfad entfernt (#5090) · **echter Consumer** in `process-event.ts` (#5109, 09.08.) · **Cron-Kunden-Sends** durable (#5131, 11.08.) · **Fall-Lifecycle-Kunden-Sends** durable (#5139, 11.08.). **Offen für §9-#6:** Dedup-Vollabdeckung + „0 offene P1-Lücken aus A3" sind noch nicht nachgewiesen; C3c (SA-Moment 6–7 WA, Marker `COORDINATION-sa-moment-wa-konsolidierung-handoff`) ist der meistzitierte Rest | #5011 · #5090 · #5109 · #5131 · #5139 |
| C4 | Eine Akte (rollen-parametrisierter Kern) | B1 | 🟡 **Code done (04.08.), DoD-Rest offen** — Zelle war bis 12.08. auf „Plan done, Code gated" (Nachzug versäumt). Verifiziert: **C4a** `<FallAkte>`-Kern (#4940, 03.08.) + **C4 komplett** SV+Werkstatt+Staff (#4977, 04.08.). Kern `src/components/fall-akte/FallAkte.tsx` + 3 Layouts (`Columns`/`Stack`/`Tabs`), **rollen-parametrisiert** (`FallakteRolle` → `viewerRole` in `faelle/[id]/page.tsx`), **5 Consumer über 4 Rollen-Oberflächen**: Staff `faelle/[id]/FallakteShell` · SV `gutachter/fall/[id]/FallDetailClient` · Kunde `kunde/claim-view/KundeClaimView` · Werkstatt `WerkstattAuftragDetail`+`WerkstattDisplayZones`. **Warum §9-#7 trotzdem NICHT hakbar** (Erhebung 12.08.): (a) **8 tote Akte-/Fall-Files** laut `knip` — u.a. `components/faelle/FallActivityFeed`, `components/fall/DokumentenListe`, `components/fall/TerminVorschlagModal`, `lib/fall/{communication-timeline,sla-config,urls}` → „Alt-Implementierungen gelöscht" ist unerfüllt; (b) **Kanzlei** hat keine Kern-Consumer (`src/app/kanzlei/**` importiert `fall-akte` nirgends) und fällt im `viewerRole`-Mapping auf `'kunde'` zurück — obwohl #4977 die Kanzlei im Titel führt. Beides = konkrete Rest-Arbeit, kein Blocker für C2/C3 | #4940 · #4977 |
| C5 | Zugriffs-Doktrin + View/RPC-Konsolidierung | A1 | ✅ **done (08.08., doc-close)** — Doktrin (`zugriffs-doktrin.md` #4860) jetzt im Review-Prozess verankert: `AGENTS.md`-Dach-Absatz „Zugriffs-Doktrin (Server-first)" + `.github/pull_request_template.md` mit 6-Punkt-Checkliste (§3). §9-#8 erfüllt (Client-Direkt-Selects = 0 → „Top-Abweichler" gegenstandslos). **Folge-Tranche (offen, kein Sicherheits-Thema):** server-seitige `from('claims')`→`v_claim_*`-Konsolidierung (Doktrin §5) — collision-prone, eigene Erhebung | #4860 + doc-close |
| D1 | Feature-DoD umstellen (AGENTS.md) | B2 | 🟢 **in Arbeit** (8c6de199, 03.08., `kitta/fundament-d1-feature-dod`) — AGENTS.md-Abschnitt „Feature-Definition-of-Done" (Journey-Zyklus, ≤½ Seite, verweist auf FUNDAMENT.md); 2. DoD-Klausel („erstes Feature durchgelaufen") folgt beim nächsten Journey-Feature | PR (folgt) |
| D2 | Lebende Spec (Pflege-Rhythmus) | D1 | 🟢 **in Arbeit (08.08., `kitta/fundament-d2-lebende-spec`)** — Pflege-Rhythmus in §8.1 verankert (Status-Nachzug als Abschluss-Pflicht · Decision-Review-Zyklus · Journeys/Doktrin nur per PR · §7-Format) + erster Decision-Review-Digest `DECISION-REVIEW-2026-08-08.md` (24 Einträge gruppiert: 14 bestätigbar · 2 überholt · 7 echter Entscheid). Rest = Aaron-Review-Handoff (der Review selbst) | PR (folgt) |

Journey-Feinstatus (A1):

| Journey | Titel | destilliert | Aaron-Review |
|---|---|---|---|
| J1 | Haftpflicht-Standardfall end-to-end | ☑ #4828 | ☑ 29.07. |
| J2 | Meldung über alle Kanäle (Wizard/Embed/API/Karte/FlowLink) | ☑ #4828 | ☑ 29.07. |
| J3 | Unterschriften SA/Vollmacht inkl. Nachsignieren | ☑ #4830 | ☑ 29.07. |
| J4 | Reparatur-Weg (KVA → Freigabe → Schlussrechnung) | ☑ #4832 | ☑ 29.07. |
| J5 | Kasko + Selbstzahler (Abrechnungsweg-Varianten) | ☑ #4837 | ☑ 29.07. |
| J6 | Kanzlei-Übergabe / Mandat | ☑ #4837 | ☑ 29.07. |
| J7 | Storno / DSGVO-Löschung | ☑ #4837 | ☑ 29.07. |
| J8 | Onboarding je Rolle (SV, Werkstatt, Kanzlei) | ☑ #4837 | ☑ 29.07. |
| J9 | Honorar / Provision / Zahlung | ☑ #4837 | ☑ 29.07. |
| J10 | Dispatch-Ausnahmen (kein SV, Eskalation, Reservierung) | ☑ #4837 | ☑ 29.07. |

> J8/J9/J10 als **Netzwerk-Ökosystem-Modell**-Soll destilliert (Lane 332d22f1, abgestimmt); Org/Pool-Lead retired (a6c863e2, `DECISIONS.md`). Konsolidierte Review-Fragen: `docs/fundament/OFFENE-FRAGEN.md`.
>
> **✅ Aaron-Review erteilt (29.07.)** — gestützt auf die **P1-Entscheidungen** (`DECISIONS.md` 2026-07-29) + Freigabe „ja starten". Die 10 Journeys sind damit **B1/C-Grundlage**. (A1-DoD erfüllt: destilliert + reviewt.)

---

## 3 · Phase A — Soll destillieren (Wissen; kein Produktions-Code, keine Migrationen)

Phase-A-Pakete sind untereinander parallel-sicher (nur neue Dateien unter `docs/fundament/`).

### A1 · Journey-Bibel

**Ziel:** Für J1–J10 je ein Soll-Ablauf in Prosa aus Nutzersicht — die verbindliche Produkt-Spec. Ablage: `docs/fundament/journeys/j<NN>-<slug>.md`.

**Warum:** Das Produktwissen liegt heute verteilt in Code, Incident-Memories und Aarons Kopf. Jede bisherige Lücke (KVA-ohne-Betrag-Deadlock, verschluckter Redirect, notification-taube Rollen) war eine nicht aufgeschriebene Soll-Erwartung. Aarons Regel vom 27.07. („operatives Soll VOR Smoke, alles per UI") wird hier eine Stufe vorgezogen: operatives Soll vor allem anderen.

**Format je Journey (verbindlich):**

```markdown
# J<N> — <Titel>
Rollen: … | Vorbedingungen: … | Startpunkt(e): …

## Ablauf
1. <Akteur> tut <Handlung> → System: <Status-Übergang?> <Notifications: Kanal + Kerninhalt>
   <neue Tasks/Dokument-Slots> <sichtbarer Screen-Zustand je beteiligter Rolle>
2. …

## Varianten / Abzweige
## Fehlerfälle und ihr Soll-Verhalten
## ⚠ IST weicht ab (beobachtete Abweichungen im Code, mit Fundort)
## Offene Fragen an Aaron (max. 5)
```

**Ist-Erhebung/Quellen:** Code im frischen Worktree (Routen, Server-Actions, Cron-Jobs des jeweiligen Ablaufs), Memory-Historie (Incidents = gelebte Soll-Klärungen), bestehende Audits unter `docs/` (Entry-Point-Audit, Claim-Detail-Audits, Repair-Audit — per Glob/Grep auffinden). **Direktive: Soll ≠ Ist.** Wo der Code vom sinnvollen Soll abweicht, wird das Soll geschrieben und die Abweichung unter „⚠ IST weicht ab" dokumentiert — nicht der Ist-Zustand zur Norm erklärt.

**Schritte:** (1) Journey-Feinstatus in §2 claimen (2–3 Journeys pro Session, J1+J2 zuerst). (2) Erhebung. (3) Journey schreiben, ≤ 2 Seiten. (4) Offene Fragen sammeln. (5) PR mit den Journey-Dateien. (6) Aaron-Review einholen; Korrekturen einarbeiten; Review-Haken in §2 setzen.

**DoD:** Alle geclaimten Journeys geschrieben im Pflichtformat; „Offene Fragen" ≤ 5 pro Journey; Aaron-Review erfolgt und eingearbeitet (ohne Review-Haken ist eine Journey NICHT Grundlage für B1/C).

**Nicht-Ziele:** Keine Code-Änderungen. Keine Bewertung/Behebung der IST-Abweichungen (nur dokumentieren).

### A2 · State-Machine-Tabelle

**Ziel:** `docs/fundament/state-machine.md` — (a) Ist-Register aller Schreibstellen von `operative_status` (und der Nebenachsen wie Reparatur-/Mandats-/Zahlungsstatus) mit `file:line`, (b) Soll-Tabelle: Zustand × Event → Folgezustand + Pflicht-Effekte (Notifications, Tasks, Slots).

**Warum:** `operative_status` ist per Lane-Beschluss die einzige Achse; trotzdem fand das Operativ-Audit vom 17.07. Schreibpfade, die die State-Machine umgehen (Werkstatt). C1 braucht die vollständige Writer-Liste als Arbeitsvorrat.

**Ist-Erhebung:** Grep im Worktree nach allen Update-Pfaden auf die Statusfelder (Server-Actions, RPCs, Crons, Admin-Tools, Smoke-Scripts); je Fund: Datei:Zeile, Auslöser, gesetzter Wert, Nebenwirkungen (sendet es? legt es Tasks an?). Zusätzlich per Supabase-MCP (READ-only `execute_sql`): existierende Status-Werte in Prod zählen, um tote/undokumentierte Werte zu finden.

**DoD:** Jeder gefundene Writer ist genau einem Soll-Event zugeordnet ODER explizit als `WILD` markiert (Liste der wilden Writes = priorisierter Input für C1). Soll-Tabelle deckt jeden in Prod vorkommenden Statuswert. Effekte-Spalte verweist auf A3-Zellen.

**Nicht-Ziele:** Keine Writer umbauen. Keine neuen Status-Werte erfinden.

### A3 · Notification-Matrix

**Ziel:** `docs/fundament/notification-matrix.md` — Matrix Event (aus A2) × Rolle × Kanal (WA/Email/In-App) → Template/Kerninhalt, plus markierte `LÜCKE`-Zellen (Event passiert, Rolle müsste es erfahren, erfährt nichts) mit Priorität P1/P2.

**Warum:** Audit 17.07.: Flotte und Kanzlei notification-taub. Dedup-Probleme traten dreimal unabhängig auf (SA-signed, Schlussrechnung #4799, Nudge-30d) — die Matrix plus C3 lösen die Klasse statt des Einzelfalls.

**Ist-Erhebung:** Alle Sende-Pfade im Worktree lokalisieren (Kommunikations-Libs, react-email-Templates, WA-Template-Aufrufe, In-App-Mitteilungen); je Sende-Stelle: auslösendes Event, Empfänger-Rolle, Kanal, Dedup-Verhalten (vorhanden/fehlt).

**DoD:** Matrix deckt alle A2-Events; jede Zelle gefüllt oder bewusst „—"; Lücken-Liste mit P1/P2 priorisiert; Dedup-Spalte je Sende-Pfad.

**Nicht-Ziele:** Keine Sends bauen oder ändern.

### A4 · Entry-Point-Register

**Ziel:** `docs/fundament/entry-points.md` — vollständiges Register aller Meldewege (Wizard, Embed-Engine, `POST /api/v1/melde-schaden`, Schadenkarte QR/NFC, FlowLink, Telefon/Manuell, Cold-Mail-CTAs, …), je Eingang eine Pflicht-Nachwirkungen-Checkliste mit ✓/✗: Fall angelegt · Pflichtdok-Slots · FlowLink · Erstnotification · Dedup gegen Doppelmeldung · Reservierungs-Verhalten.

**Warum:** Das Entry-Point-Audit vom 24.07. fand ~14 Eingänge und zwei Löcher (#4778/#4780); die Embed-Lane hatte fehlende Pflichtdok-Slots, die öffentliche API einen Hard-Reservierungs-Bug. Jeder Eingang mit eigenem Code-Pfad reproduziert diese Fehlerklasse.

**Ist-Erhebung:** Bestehendes Audit in `docs/` und Memory auffinden, gegen den aktuellen Worktree verifizieren (Eingänge können dazugekommen/entfallen sein), Checkliste je Eingang durch Code-Lektüre füllen.

**DoD:** Register vollständig (Abgleich gegen Audit + frische Route-/API-Suche); ✗-Matrix als priorisierter Input für C2.

**Nicht-Ziele:** Keine Löcher fixen.

---

## 4 · Phase B — Oracle (Prüfstand vor Umbau)

### B1 · Journey-Smokes

**Ziel:** Je reviewter Journey ein Playwright-Spec `tests/e2e/journeys/j<NN>-<slug>.spec.ts`, dessen Testschritte die nummerierten Journey-Schritte spiegeln (Schrittnummer als Kommentar → Traceability Spec ↔ Test).

**Warum:** Ohne Oracle ist „vollständig" ein Gefühl. Die Journey-Smokes sind die maschinenprüfbare Definition des Produkts; jede C-Änderung muss sie grün lassen. Sie beenden außerdem die „Regel-4 offen"-Dauerschuld für die abgedeckten Abläufe.

**Ist-Erhebung:** Bestehende E2E-Infrastruktur im Worktree klären (Playwright-Config, vorhandene Specs unter `tests/e2e/`, Seed-/Smoke-Muster unter `scripts/smoke/`, Test-Accounts). Vorhandene Smoke-Specs, die Journey-Schritte bereits abdecken, einbinden statt duplizieren.

**Schritte:** (1) J1 + J4 zuerst (Kern-Wertschöpfung + Reparatur-Weg). (2) Seeds/Fixtures aus bestehenden Mustern; deterministisch, aufräumend. (3) Schritte, die lokal nicht automatisierbar sind (device-gated: NFC, HEIC, echte WA-Zustellung), als `test.skip` mit Begründung + Verweis auf Journey-Schritt — niemals stillschweigend weglassen. (4) Lauf gegen lokale Dev-Umgebung bzw. den im Repo etablierten E2E-Weg.

**DoD:** J1- und J4-Spec laufen grün (Nachweis im PR: Kommando + Output); übrige geclaimte Journeys mindestens als Skeleton mit begründeten Skips; kein Spec ohne Journey-Schritt-Referenzen.

**Nicht-Ziele:** Keine Produktfixes für dabei gefundene Bugs (→ Befund-Liste im PR + Decision-Log; Fix ist eigenes Ticket außerhalb des Programms oder Teil des passenden C-Pakets).

### B2 · CI-Gate + Pending-Backlog

**Ziel:** Journey-Suite läuft in CI; Regel: einmal grüne Journey-Specs dürfen nie wieder rot gemergt werden; die Skip-Liste ist das einzige ehrliche Rest-Backlog.

**Ist-Erhebung:** Bestehende CI-Workflows (`.github/workflows/`) und deren Playwright-Lage klären; Laufzeit-Budget prüfen (Journey-Suite ggf. als eigener Job, nur bei `src/**`-Änderungen).

**DoD:** CI-Lauf mit Journey-Stage nachweisbar; README-Abschnitt in `tests/e2e/journeys/` erklärt Skip-Politik (neue Skips brauchen Begründung + Journey-Referenz im PR).

---

## 5 · Phase C — Kern-Rückführung (Code; strangler-fig; erst wenn das betroffene Oracle steht)

Für jedes C-Paket gilt: Ist-Erhebung → Implementierungsplan nach `superpowers:writing-plans` → Ausführung in Tranchen → jede Tranche merged einzeln, Journey-Smokes grün. DDL ausschließlich additiv und über den Supabase-MCP-Ablauf aus AGENTS.md Regel 2.

### C1 · Ein Status-Writer: `transitionClaim` + Event-Log

**Ziel:** Ein Modul (Arbeits-Zielpfad `src/lib/claims/transition.ts`, final an Repo-Konvention anpassen) mit Signatur sinngemäß `transitionClaim(claimId, event, ctx) → { ok, error? }`, das: Übergang gegen die A2-Soll-Tabelle validiert → Status schreibt → Event-Log-Zeile schreibt → Pflicht-Effekte anstößt (Notifications — bis C3 über die bestehenden Sende-Pfade —, Tasks, Slots). Dazu ein Event-Log als Tabelle (Ist-Erhebung klärt, ob eine bestehende Timeline-Tabelle das Format trägt; sonst additive Migration `claim_events`: claim_id, event, actor, payload jsonb, created_at).

**Warum:** Verfassung §2/§3. Wilde Status-Writes (A2-`WILD`-Liste, u. a. Werkstatt-Pfad) sind die Wurzel mehrerer Inkonsistenz-Klassen. Das committete FG-Programm (docs(flags)-Commits, FG1–FG8) ist die Flag-Seite derselben Rückführung — **andocken, nicht parallel erfinden:** vor dem Plan die FG-Pläne lesen und Überschneidungen im Plan ausweisen.

**⚠ Ist-Anker (28.07., staging):** Die Engine existiert bereits — `transitionFallStatus` (state-machine.ts) samt CI-Ratchet `check:operative-status-writes` (Baseline 2 grandfatherte Direkt-Writer, Allowlist in AGENTS.md dokumentiert). C1 heißt hier also: Engine **vervollständigen** (Event-Log-Vollständigkeit, Effekte aus A2/A3 anbinden, Baseline → 0), nicht neu bauen. Erhebung wie immer im frischen Worktree.

**Tranchen (Vorgabe):** C1a = Modul + Event-Log-Migration + Umstellung von genau 2 Writern (einer davon ein `WILD`er) als Beweis; C1b+ = restliche Writer-Liste aus A2 in Tranchen; letzte Tranche = Ratchet-Script nach dem Muster der bestehenden Ratchets (`scripts/check-*.mjs` + Baseline), das neue direkte Status-Writes außerhalb des Moduls blockt.

**DoD (Gesamt):** Grep-Nachweis: 0 Schreibstellen auf `operative_status` außerhalb des Moduls (bzw. Baseline dokumentiert Rest-Tranchen); Journey-Smokes J1 + J4 grün; Ratchet in CI aktiv; Event-Log wird bei jedem Übergang geschrieben (SQL-Stichprobe via MCP READ).

**Nicht-Ziele:** Keine neuen Statuswerte, keine Timeline-UI-Umbauten, keine Flag-Migrationen (das bleibt beim FG-Programm).

### C2 · Ein Intake: `createCase`

**Ziel:** Ein Modul (Arbeits-Zielpfad `src/lib/intake/create-case.ts`), das jede Fallanlage kapselt und die Pflicht-Nachwirkungen **garantiert und idempotent** ausführt: Fall/Lead-Anlage · Pflichtdok-Slots · FlowLink · Erstnotification · Dedup gegen Doppelmeldung. Alle Eingänge aus A4 werden dünne Adapter auf dieses Modul.

**Warum:** A4-✗-Matrix; Embed-Pflichtdok-Slot-Lücke; melde-schaden-Reservierungs-Bug. Jeder Eingang mit Eigenlogik ist ein künftiger Incident.

**Tranchen:** C2a = Modul + Umstellung des Haupt-Wizards; C2b+ = je Tranche 1–2 weitere Eingänge nach A4-Priorität (✗-Zellen zuerst).

**DoD:** Alle A4-Eingänge rufen das Modul (Register aktualisiert: alle Zellen ✓); Grep-Nachweis: keine Fall-/Lead-Anlage außerhalb des Moduls; J2-Smoke grün über mindestens 3 Kanäle; Idempotenz-Test (doppelter Aufruf → keine Duplikate).

**Nicht-Ziele:** Keine neuen Meldekanäle; keine Wizard-UX-Umbauten.

### C3 · Notification-Outbox

**Ziel:** Additive Tabelle `notifications_outbox` (kanal, empfänger, template, payload, dedup_key UNIQUE, status, fehler, created_at) + `enqueue()`-API mit Dedup-Key-Pflicht + Versand über den bestehenden Job-/Cron-Mechanismus; Fehlschlag nach Retries erzeugt einen sichtbaren Task statt still zu sterben. P1-Lücken aus A3 werden über die Outbox geschlossen.

**Warum:** Verfassung §8; drei unabhängig gebaute Dedup-Lösungen; notification-taube Rollen; Non-Critical-Send-try/catch-Muster verliert heute Fehlschläge unsichtbar in Logs.

**Tranchen:** C3a = Tabelle + Sender + Umstellung der Sends aus `transitionClaim` (J1-Statuswechsel); C3b+ = restliche Sende-Pfade nach A3, P1-Lücken schließen.

**DoD:** J1-Statuswechsel-Kommunikation läuft nachweisbar über die Outbox (SQL-Stichprobe); Dedup-Test: doppeltes `enqueue` mit gleichem Key → 1 Versand; simulierter Versand-Fehlschlag → Task sichtbar; 0 offene P1-Zellen in A3.

**Nicht-Ziele:** Keine neuen Templates/Texte über die A3-Lücken hinaus; kein Kanal-Neubau.

### C4 · Eine Akte

**Ziel:** Ein gemeinsamer Fall-Akte-Kern (Zonen: Kopf/Status+nächster Schritt · Beteiligte · Dokumente · Kommunikation · rollen-spezifische Zone) mit Rollen-Konfiguration; die per-Rolle-Detailseiten werden Portal für Portal auf den Kern migriert, Alt-Implementierungen gelöscht (knip-Baseline sinkt mit).

**Warum:** Verfassung §4. Die Claim-Detail-Audits (K1–K7, S1–S7) zeigen: gleiche Fehlerklassen je Portal einzeln gefixt. Referenz-Memory „Claim-Detailansicht pro Rolle" listet die bestehenden Routen+Gates — die Routen bleiben, der Innenteil wird gemeinsam.

**Tranchen:** C4a = Kern-Komponente + Migration Kunde-Akte; C4b = SV; C4c = Werkstatt; C4d = Kanzlei; C4e = Admin/Dispatch. Reihenfolge fix (kleinste Sonderfälle zuerst).

**DoD je Tranche:** Portal rendert über den Kern; Journey-Smokes der betroffenen Rolle grün; Alt-Komponenten gelöscht (`git status` + knip); Rollen-Gates unverändert (Regression-Check §7 AGENTS.md).

**Nicht-Ziele:** Kein visuelles Redesign (Token/Primitives-Regeln gelten, Look bleibt); keine neuen Zonen-Features.

### C5 · Zugriffs-Doktrin + View/RPC-Konsolidierung

**Ziel:** `docs/fundament/zugriffs-doktrin.md` als verbindliche Regeln (Client liest nur über definierte Views/RPCs je Rolle; Writes nur über Server-Actions mit Guard + `.select()`-Row-Rückprüfung; RLS als Netz mit explizitem `TO <rolle>`; Checkliste „neue Tabelle" inkl. Grants — Default-Privileges granten anon nichts) + Konsolidierung der Ist-Abweichler auf das etablierte `v_claim_base`-Muster.

**Warum:** Die gesamte RLS-Incident-Familie (DSGVO-Storno stiller Fehlschlag #4625, Default-Privileges-Wurzel #4555, Realtime-column-cap-Kollision, Kanzlei-Grant-CI-Blocker) ist eine Klasse: Feinsteuerung in RLS statt definierter Lese-Schicht.

**Ist-Erhebung:** Client-seitige Direkt-Selects auf Basistabellen im Worktree listen (Supabase-Client-Aufrufe außerhalb der View/RPC-Schicht); RLS-Policies-Inventar via MCP READ. ⚠ Realtime-Regression-Memory beachten: Realtime-Themen NICHT unilateral fixen.

**DoD:** Doktrin-Dokument gemergt + aus AGENTS.md verlinkt (ein kurzer Verweis-Absatz, AGENTS.md nicht aufblähen); Abweichler-Liste mit Tranchen-Status; Top-3-Abweichler migriert; Checkliste „neue Tabelle" im PR-Template/Review-Prozess verankert.

**Nicht-Ziele:** Kein RLS-Großumbau in einem Rutsch; keine Grant-Änderungen ohne den Check-Fixture-Kontext (#4789-Lehre).

---

## 6 · Phase D — Dauerbetrieb

### D1 · Feature-DoD umstellen

**Ziel:** AGENTS.md erhält einen kompakten Abschnitt „Feature-Definition-of-Done": (1) Soll-Prosa (Journey-Delta) VOR dem Bau — neue/geänderte Journey-Abschnitte im selben PR; (2) Journey-Spec-Update; (3) Journey-Smoke grün VOR Merge. Damit ist „OFFEN: Regel-4" für Neues strukturell abgeschafft.

**DoD:** AGENTS.md-Abschnitt gemergt (≤ 1/2 Seite, verweist hierher); das erste danach gebaute Feature hat den Zyklus nachweisbar durchlaufen.

### D2 · Lebende Spec

**Ziel:** Pflege-Regeln verankern: Journeys ändern sich nur per PR (Review wie Code); `DECISIONS.md` wird in einem festen Rhythmus mit Aaron durchgesehen (offene Einträge → bestätigt/revidiert); Statustabelle §2 bleibt aktuell; neue Programm-Pakete folgen dem Paketformat §7.

**DoD:** Regeln stehen in diesem Dokument (§7/§8 ergänzt), erster Decision-Review mit Aaron hat stattgefunden.

---

## 7 · Paketformat (Schablone für Splits und neue Pakete)

```markdown
### <ID> · <Titel>
**Ziel:** <ein Satz, prüfbares Ergebnis>
**Warum:** <Incident-/Verfassungs-Anker>
**Ist-Erhebung:** <konkrete Greps/Reads/SQL-READS im frischen Worktree>
**Schritte / Tranchen:** <nummeriert; Tranchen einzeln mergebar>
**DoD:** <verifizierbare Nachweise: Kommandos, grüne Specs, Grep-Nullstände, SQL-Stichproben>
**Nicht-Ziele:** <expliziter Scope-Zaun>
```

## 8 · DECISIONS.md-Protokoll

Datei: `docs/fundament/DECISIONS.md`, append-only. Format je Eintrag:

```markdown
## <YYYY-MM-DD> · <Paket> · <Kurztitel>
**Lücke:** <welche Entscheidung fehlte>
**Entscheidung:** <was gewählt wurde>
**Begründung:** <nach Verfassungs-Prinzip Nr. X / Journey JN>
**Review:** offen | bestätigt (Aaron, <datum>) | revidiert → <Folge-Ticket>
```

## 8.1 · Pflege-Rhythmus — „Lebende Spec" (D2)

Die Spec bleibt nur lebendig, wenn Status + Entscheidungen aktiv nachgezogen werden. Vier Regeln, verbindlich für jede Fundament-berührende Session:

1. **Status-Nachzug ist Teil des Paket-Abschlusses.** Wer ein Paket merged + prod-bewährt, zieht **im selben Zug** nach: (a) §2-Statuszelle → `done (<datum>)`; (b) die zugehörige `DECISIONS.md`-`Review:`-Zeile von `offen (im PR)` auf `bestätigt (Aaron, <datum>)` bzw. `revidiert → <Folge>` — sobald Aaron sie im Review quittiert hat; (c) §9-Checkbox, falls ein Endzustand-Punkt fällt. **Anti-Muster (real geblutet, 08.08.):** 9 B-Suite-Entscheidungen standen nach Merge + Prod-Bewährung noch wochenlang auf `offen (im PR)` — die DECISIONS-Historie widersprach dem Live-Stand.
2. **Decision-Review-Zyklus.** Wenn ≥10 `Review: offen`-Einträge aufgelaufen sind ODER ein Programm-Meilenstein erreicht ist (Phase-Abschluss), wird ein Digest `docs/fundament/DECISION-REVIEW-<datum>.md` erstellt (nur offene Einträge, gruppiert nach empfohlener Aktion: bestätigen / revidiert-überholt / echter Entscheid). Aaron geht ihn durch; die Ergebnisse fließen per Regel 1(b) zurück in `DECISIONS.md`. Der Digest ist wegwerfbar (nächster Zyklus = neues File). **Erster Zyklus: `DECISION-REVIEW-2026-08-08.md`.**
3. **Journeys + Doktrin nur per PR.** Änderungen an `docs/fundament/journeys/*`, `zugriffs-doktrin.md`, `state-machine.md` etc. laufen über den normalen PR-Flow (nie Direkt-Edit auf einem gemergten Doc ohne Review). Bei Widerspruch Code ↔ reviewte Journey **gewinnt die Journey** (§0.3) — der Code ist dann der Bug.
4. **Neue Pakete/Tranchen nach §7-Format.** Splits (`C1a`/`C1b`) + neue Pakete werden in §2 eingetragen und im §7-Schablonen-Format beschrieben; niemals Zeilen aus §2 löschen (Historie).

**DoD D2:** §8.1 verankert (dies) + erster Decision-Review-Digest erstellt (`DECISION-REVIEW-2026-08-08.md`) + erster Review mit Aaron durchlaufen (Handoff — der Review selbst ist Aarons Akt, D2 liefert die Vorbereitung).

## 9 · End-Checkliste „Fundament vollständig"

- [x] 10/10 Journeys geschrieben UND von Aaron reviewt (§2-Feinstatus komplett) — *Beleg 11.08.: §2-Journey-Feinstatus zeigt für **alle 10** Zeilen BEIDE Haken (destilliert ☑ + Aaron-Review ☑ 29.07.); PRs #4828/#4830/#4832/#4837.*
- [x] Journey-Smoke-Suite in CI; J1–J10 grün oder mit begründetem, journey-referenziertem Skip — *Beleg: B3 (#5024) + post-merge-`e2e`-Lauf **31260565130** (08.08., nach dem J10-Seed-Clean-Fix #5053): **alle 10 Journey-Steps `success`** (J1-deep/J4 · J9 inkl. lifecycle-Geld-Guard · J8 · J5 · J10 · J3 · J6 · J7 · J2). Einziges Job-Rot = Fremd-Blocker `feststellung-flow-gate`-ENOENT im finalen „Run E2E Tests"-Step (andere Lane), unabhängig von den Journey-Steps.*
  > **Nachtrag 12.08. — der Fremd-Blocker ist weg, der Nachweis ist jetzt reproduzierbar:** Der ENOENT ist gefixt (#5140), die Klasse per Ratchet `check:e2e-toplevel-fs` (#5146) + Shared-Helper `tests/e2e/lib/seed-fixture.ts` (#5153, Baseline 11→7) geschlossen. **Zusätzlich war der Job monatelang gar nicht auswertbar:** er hing an `push` und wurde bei der Fleet-Frequenz permanent aus der `prod-e2e-smoke`-Queue verdrängt (Messung: 21 cancelled · 10 failure · **0 success** über 37 Läufe) → seit #5165 läuft er **nightly 03:30 + `workflow_dispatch`**. **Zwei vollständige Läufe belegen 10/10 grün:** on-demand `31535504632` (11.08., erster manueller Nachweis überhaupt) und der erste automatische Nightly `31565748829` (12.08.). ⚠ Beide enden formal `cancelled`, weil der e2e-Job bei `timeout-minutes: 20` gekappt wird — gemessen: Setup ~1:40, **alle 10 Journeys zusammen ~4:00**, `Run E2E Tests` >14:30 → Kill. Nicht die Journeys sind langsam, der Sammel-Step ist es; Fix offen als **#5178** (Cap 20→45).*
- [x] `operative_status` hat genau einen Writer (transition-Modul); Ratchet blockt neue Direkt-Writes (C1-Finish #5114, 11.08.: Baseline **2→0**, `check:operative-status-writes --ratchet` scharf in CI. Beide Achsen verifiziert — TS: 0 Verletzer/2781 Files; **DB: 0** Trigger/Functions, die `operative_status` schreiben (Prod-READ). Sanktionierte Allowlist bleibt: `state-machine` (=die Engine), `endzustand-actions` (Cursor-Outcomes, schreibt eigenes Event-Log), `lexdrive` `manual_status_override` (bewusst validierungsfrei))
- [x] Event-Log wird bei jedem Übergang geschrieben; seit C1 keine neue `ist_*`/`hat_*`-Interaktions-Spalte — *Stand 11.08.: **alle** Status-Schreibpfade schreiben `phase_transitions` — Engine · `endzustand-actions` (eigenes) · `reparatur-cursor` (via Engine) · die 2 mit #5114 gefunnelten Terminals · `lexdrive manual_status_override` (#5127: `trigger_type='manual'` + `payload.via`, ohne den Override zu funneln). **PROD-BEWEIS (Regel 4, 11.08. 19:59 UTC):** ein echter Kunden-Vorgang lief über den gefunnelten Pfad — `phase_transitions` mit `from_phase='regulierung'` (steht **nicht** in `FALL_STATUS_TRANSITIONS` ⇒ lief über `BROADLY_REACHABLE_TERMINALS`), `to_phase='an_externe_kanzlei_uebergeben'`, `payload.via='transitionFallStatus'`, `abgeschlossen_am` gesetzt (claim CLM-2026-04139). Genau dieser Close hinterließ vorher **kein** Event-Log. Forensik der 52 prod-Claims „ohne Event-Log": 43 = Initial-Cursor (nie transitioniert), Rest = Test-Seeds + 1 historisches Opfer des mit #5114 behobenen Direkt-Writes → **kein unbekannter Bypass**. Ohne Prod-Vorkommen (kein Traffic, kein Fehler): `termin_durchgefuehrt` + `trigger_type='manual'` — selber Engine-Pfad, passiv beobachtbar.*
- [ ] Alle Meldewege laufen über `createCase`; A4-Register komplett ✓ — *Teilfortschritt 11.08.: C2a (#4992) hebt Wizard A-1 als Adapter auf `createCase`; C2b-1 (#5126) zieht die **Pflichtdok-Garantie in den Konversions-Kern**, womit sie für ALLE Direkt-Claim-Wege gilt (j02-IST-Delta #2 zu); **C2b-Rest (#5137) hebt Embed-Werkstatt-Finder B-1 + Aircall-Inbound D-4b** (`createCase.triggerByUserId` dafür optional gemacht — public Eingänge ohne User; im direct-claim-Zweig per Guard weiter Pflicht). Aircall gewinnt dadurch den **garantierten FlowLink** (vorher: Anrufer-Lead ohne jeden Kunde-Kanal). **Bewusst NICHT abgehakt:** „ALLE Meldewege" ist noch weit — `git grep` zählt weiterhin **~13 Intake-Writer außerhalb `createCase`** (dispatch/leads, admin/faelle/anlegen, flow, schaden/[token], makler, flotte, public-rueckruf, matelso, spontan, …). Nächste Tranchen: Marketing C2c + diese Restliste.*
- [ ] Ausgehende Kommunikation läuft über die Outbox mit Dedup; 0 offene P1-Lücken aus A3
- [ ] Ein Akte-Kern, alle Rollen-Detailseiten migriert, Alt-Implementierungen gelöscht — *DoD-Erhebung 12.08. (B0): **Kern + Migration erfüllt**, `src/components/fall-akte/FallAkte.tsx` + 3 Layouts, rollen-parametrisiert (`FallakteRolle`→`viewerRole`), **5 Consumer über 4 Rollen-Oberflächen** (Staff/SV/Kunde/Werkstatt) aus #4940+#4977. **Zwei belegte Rest-Punkte halten den Haken offen:** (1) **Alt-Implementierungen NICHT gelöscht** — `knip` meldet 8 tote Akte-/Fall-Files (`components/faelle/FallActivityFeed`, `components/fall/DokumentenListe`, `components/fall/TerminVorschlagModal`, `lib/fall/communication-timeline`, `lib/fall/sla-config`, `lib/fall/urls`, `lib/finance/fall-finanzen`, `gutachter/fall/[id]/cardentity-actions`) → prüfen + löschen + knip-Baseline senken (Boy-Scout); (2) **Kanzlei-Rolle nicht am Kern** — `src/app/kanzlei/**` importiert `fall-akte` nirgends und fällt im `viewerRole`-Mapping auf `'kunde'` zurück, obwohl #4977 „…+Kanzlei…" im Titel führt: entweder migrieren oder als bewusstes Nicht-Ziel dokumentieren (Kanzlei sieht Mandate, nicht die volle Akte).*
- [x] Zugriffs-Doktrin dokumentiert, verlinkt, Checkliste im Review-Prozess; Top-Abweichler migriert (C5-doc-close 08.08.: AGENTS.md-Verweis + PR-Template-Checkliste; Client-Abweichler = 0)
- [x] Feature-DoD in AGENTS.md umgestellt; erstes Feature nach neuem Zyklus durchgelaufen — *Beleg 11.08.: AGENTS.md-Abschnitt „Feature-Definition-of-Done — Journey-Zyklus" vorhanden (D1, #4942). Erste Features nach dem Zyklus durchgelaufen: die Journey-Suite-Tranchen J5/J10/J3/J6/J7/J2 (Soll → Spec → Smoke vor Merge) und zuletzt C2b-1 (#5126: j02-Soll-Delta VOR dem Code, Spec als Wächter nachgezogen).*

## 10 · Nicht-Ziele des Programms

- Kein Rewrite, kein Repo-/Framework-/Hosting-Wechsel, kein Monorepo-Umbau.
- Keine DB-Neumodellierung: bestehende Tabellen bleiben; Migrationen sind additiv (neue Tabellen/Spalten), Drops nur außerhalb dieses Programms.
- Kein UI-Redesign, kein Whitelabel-Ausbau, keine neuen Produktfeatures als Beifang.
- Keine Rollen-Reduktion im Bestand (Makler/Kundenbetreuer/Flotte bleiben, werden hier nur nicht vertieft).
- Keine Realtime-Eingriffe ohne Abstimmung (bekannte Regression-Klasse).
