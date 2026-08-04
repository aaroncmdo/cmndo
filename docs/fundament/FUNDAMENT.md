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
| B3 | Journey-Suite J2–J10 in CI (§9-P2) | B1, B2 | 🟡 **in Arbeit — alle Skips → CI-Steps** (Aaron-Direktive 04.08. „keine Skips"; §9-P2 erst erfüllt, wenn alle 10 wirklich CI-grün laufen — die 03.08.-„§9 via Skips"-Deklaration ist revidiert). **Grün in CI:** J1, J4 (B2) + **J9** (#4948) + **J8** (#4955) + **J5** (04.08.: deterministischer kasko-Seed `kasko-reparatur-seed.mjs`, aal1-Login, lokal Seed 5/5 + Smoke 1 passed). **Im Bau (Skip → CI-Step):** J10 (`db()`-Fix + Szenario-1-Isolation), J3/J6 (dedizierte Seeds+Specs), J7 (Skeleton → echte Logik), J2 (Multi-Kanal), J9-`lifecycle` (Release-Cron Test-Row-Isolation, ggf. Produkt-Change). Klassifikation + Reihenfolge: `journey-smokes.md` + DECISIONS 04.08. | #4948/#4955 + J5 |
| C1 | Ein Status-Writer: transitionClaim + Event-Log | A2, B1 | 🟢 **Plan done** (`c1-transition-claim-plan.md`: Ist-Erhebung + C1a-Tranchen); **Code gated auf B2-Grün** | #4845 |
| C2 | Ein Intake: createCase | A4, B1 | 🟢 **Plan done** (`c2-create-case-plan.md`); Code gated auf B2 | — |
| C3 | Notification-Outbox | A3, C1 | 🟢 **Plan done** (`c3-notification-outbox-plan.md`); Code gated auf C1 | — |
| C4 | Eine Akte (rollen-parametrisierter Kern) | B1 | 🟢 **Plan done** (`c4-eine-akte-plan.md`); Code gated auf B2 | #4875 |
| C5 | Zugriffs-Doktrin + View/RPC-Konsolidierung | A1 | 🟢 **Doktrin done** (`zugriffs-doktrin.md`) + Server-Achse erhoben; offen: 17-Read-Surface-Migration + AGENTS.md-Verweis | #4860 |
| D1 | Feature-DoD umstellen (AGENTS.md) | B2 | 🟢 **in Arbeit** (8c6de199, 03.08., `kitta/fundament-d1-feature-dod`) — AGENTS.md-Abschnitt „Feature-Definition-of-Done" (Journey-Zyklus, ≤½ Seite, verweist auf FUNDAMENT.md); 2. DoD-Klausel („erstes Feature durchgelaufen") folgt beim nächsten Journey-Feature | PR (folgt) |
| D2 | Lebende Spec (Pflege-Rhythmus) | D1 | offen | — |

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

## 9 · End-Checkliste „Fundament vollständig"

- [ ] 10/10 Journeys geschrieben UND von Aaron reviewt (§2-Feinstatus komplett)
- [ ] Journey-Smoke-Suite in CI; J1–J10 grün oder mit begründetem, journey-referenziertem Skip
- [ ] `operative_status` hat genau einen Writer (transition-Modul); Ratchet blockt neue Direkt-Writes
- [ ] Event-Log wird bei jedem Übergang geschrieben; seit C1 keine neue `ist_*`/`hat_*`-Interaktions-Spalte
- [ ] Alle Meldewege laufen über `createCase`; A4-Register komplett ✓
- [ ] Ausgehende Kommunikation läuft über die Outbox mit Dedup; 0 offene P1-Lücken aus A3
- [ ] Ein Akte-Kern, alle Rollen-Detailseiten migriert, Alt-Implementierungen gelöscht
- [ ] Zugriffs-Doktrin dokumentiert, verlinkt, Checkliste im Review-Prozess; Top-Abweichler migriert
- [ ] Feature-DoD in AGENTS.md umgestellt; erstes Feature nach neuem Zyklus durchgelaufen

## 10 · Nicht-Ziele des Programms

- Kein Rewrite, kein Repo-/Framework-/Hosting-Wechsel, kein Monorepo-Umbau.
- Keine DB-Neumodellierung: bestehende Tabellen bleiben; Migrationen sind additiv (neue Tabellen/Spalten), Drops nur außerhalb dieses Programms.
- Kein UI-Redesign, kein Whitelabel-Ausbau, keine neuen Produktfeatures als Beifang.
- Keine Rollen-Reduktion im Bestand (Makler/Kundenbetreuer/Flotte bleiben, werden hier nur nicht vertieft).
- Keine Realtime-Eingriffe ohne Abstimmung (bekannte Regression-Klasse).
