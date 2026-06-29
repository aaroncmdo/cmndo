# KB-Fakt-getriebene Kanzlei-Strecke (derived phase) — Design

**Datum:** 2026-06-29 · **Branch:** `kitta/kanzlei-kb-fakt-strecke` (gestapelt auf `kitta/autophase-signal-repair` / PR #3285)

## Ziel
Die Kanzlei-Lifecycle-Phasen (ab `kanzlei-uebergeben`) werden aus **KB-befüllten Fakten** abgeleitet — kein Verlass auf eine externe LexDrive-API/Webhook (kommt absehbar nicht). KB trägt ein, was die Kanzlei meldet (Telefon/Email); die Phase + Side-Effects (Kunde-Comm, Tasks, Timeline) leiten daraus ab.

## Architektur — Erweiterung der bestehenden Derive-Engine (#3285)
Kein zweiter Mechanismus. Wir erweitern die in #3285 gebaute Engine:
- **Fakten = SSoT** (bestehende Spalten — KEIN DDL).
- **`computeNextOperativePhase(status, signals)`** (rein, `src/lib/autophase-decision.ts`) wird um die Kanzlei-Fakten + VS-Branches erweitert. Emittiert nur **gültige** FALL_STATUS_TRANSITIONS-Übergänge (one-hop; der Cascade-Loop fährt weiter).
- **`checkFallAutoPhase`** (`src/lib/autoPhase.ts`): lädt die Kanzlei-Signale zusätzlich + feuert pro **erreichtem Meilenstein** die Kunde-Comm (neuer STATUS→COMM-Map) — zusätzlich zu den bestehenden `transitionFallStatus`-Side-Effects (Timeline, Notification-Events, SLA, Kanzlei-Mail).
- **`applyKanzleiFakt(claimId, faktKey, wert, userId)`** = Shared Core: schreibt das Fakt-Feld in die richtige Tabelle → ruft `checkFallAutoPhase`. **Einziger** KB-Schreibpfad. (Ein künftiger LexDrive-Webhook ruft denselben Core → konvergiert.)
- **Panel-Umbau:** `LexDriveTriggerPanel` (Fallakte VS-Regulierung-Tab) von „Event-Buttons + Payload-Modal" → **Fakt-Erfassungs-Maske** (aktuelle Phase + die Meilenstein-Felder datierbar). Save → `applyKanzleiFakt`.

## Phasen-Modell: abgeleitet + gecacht
`operative_status` bleibt eine Spalte (Consumer/Indizes unverändert), aber == `derive(facts)` **by construction**: der KB-Save schreibt sie über `transitionFallStatus` im Cascade — der EINZIGE Treiber für die Kanzlei-Phasen ist die Fakten-Ableitung. Kein Drift.

## Die ~8 Meilenstein-Fakten → Felder → Phase
| Fakt (KB) | Feld | → Phase |
|---|---|---|
| Mandat bei Kanzlei | `claims.kanzlei_uebergeben_am` (aus QC/`saveFilmcheck`) | kanzlei-uebergeben |
| Anschlussschreiben raus | `kanzlei_faelle.anschlussschreiben_am` (+ `anschlussschreiben_sendedatum`) | anschlussschreiben |
| VS-Reaktion | `kanzlei_faelle.vs_reaktion_typ` ∈ {voll, gekuerzt, abgelehnt} + `vs_reaktion_am` (+ `kuerzungs_betrag`/`vs_kuerzung_grund`) | regulierung-laeuft / vs-kuerzt / vs-abgelehnt |
| Regulierung | `kanzlei_faelle.regulierung_am` (+ `regulierungsweise`) | regulierung-laeuft |
| Klage | `kanzlei_faelle.klage_uebergeben_am` (+ `claims.geschlossen_grund`) | klage |
| Zahlung | `claim_payments.zahlungseingang_am` (+ `erhaltener_betrag`) | zahlung-eingegangen |
| Abschluss | `claims.abgeschlossen_am` | abgeschlossen |

Nachbesichtigung = optionaler Branch (`nachbesichtigung-laeuft`). **Rügen/Fristen/Eskalation** (`ruege_*`, `eskalation_tag_14/21/28_*`, `vs_frist_bis`) = optionale Notiz-Felder im Panel, **nicht** phasen-treibend (Entscheidung 3).

## Derivation (one-hop Regeln, alle gültige FALL_STATUS_TRANSITIONS-Ziele)
- `kanzlei-uebergeben` + anschlussschreiben_am → `anschlussschreiben`
- `anschlussschreiben`: klage_uebergeben_am → `klage`; sonst vs_reaktion_typ='abgelehnt' → `vs-abgelehnt`; sonst vs_reaktion_typ='gekuerzt' → `vs-kuerzt`; sonst (regulierung_am ∨ vs_reaktion_typ='voll') → `regulierung-laeuft`
- `regulierung-laeuft`: klage_uebergeben_am → `klage`; sonst zahlungseingang → `zahlung-eingegangen`
- `vs-kuerzt`: klage_uebergeben_am → `klage`; sonst regulierung_am → `regulierung-laeuft`
- `vs-abgelehnt`: klage_uebergeben_am → `klage`
- `klage`: abgeschlossen_am → `abgeschlossen`
- `zahlung-eingegangen`: abgeschlossen_am → `abgeschlossen`

(SV-Track ersterfassung→…→filmcheck bleibt wie in #3285. `filmcheck → null` = KB-QC-Grenze.)

## Kunde-Comm pro Meilenstein (STATUS→COMM, Keys existieren in EVENT_COMM_MAP)
- `anschlussschreiben` → `as_gesendet`
- `regulierung-laeuft` → `regulierung_angekuendigt`
- `zahlung-eingegangen` → `zahlung_eingegangen`
- (vs-kuerzt/vs-abgelehnt/klage/abgeschlossen: keine automatische Kunde-Comm im MVP — KB informiert ggf. manuell; später erweiterbar.)

Comm feuert im Cascade-Loop wenn der Hop diesen Status NEU erreicht (idempotent via bestehende sendFallCommunication-Dedup).

## Anti-Drift + Bonus
`operative_status == derive(facts)` immer (ein Pfad). **Bonus-Drift-Detektor** (Cron, eigener kleiner Folge-PR): vergleicht operative_status vs. derive(facts) aller Claims → Admin-Alert bei Divergenz. Nutzt dieselbe reine Funktion.

## Koexistenz / Non-Goals
- **#3285 (autoPhase A)** bleibt SV-Track bis `filmcheck`; `saveFilmcheck` setzt `kanzlei_uebergeben_am` = Übergabe-Fakt → ab da KB-Fakt-getrieben. Nahtlos.
- **Webhook/`processLexDriveEvent`**: bleibt dormant; falls LexDrive je postet → ruft denselben `applyKanzleiFakt`-Core (Fakt schreiben → derive), nicht Status direkt. NICHT in diesem PR umgestellt (dormant, 0 echte Events) — nur dokumentiert.
- **Kein DDL** (alle Felder existieren).
- **Non-Goal:** volle ~30-Event-VS-Korrespondenz als Phasen; Drift-Detektor-Cron (Folge-PR); Kanzlei-Portal-Detailseite (separat verworfen).

## Test-Strategie
- `autophase-decision.test.ts`: erweitert um alle Kanzlei-Branches (anschlussschreiben→{abgelehnt/gekuerzt/voll/klage}, regulierung→zahlung, zahlung→abgeschlossen, klage→abgeschlossen) + Kaskaden-Sim (kanzlei-uebergeben + alle Fakten → endet korrekt).
- `applyKanzleiFakt`: reine Fakt→Tabelle-Routing-Logik als testbare Funktion extrahieren.
- tsc grün; CI = Build-Gate (env-junction lokal).

## Bau-Reihenfolge
1. `computeNextOperativePhase` Kanzlei-Branches + Tests (TDD, RED→GREEN).
2. `checkFallAutoPhase` Signal-Load (Kanzlei-Fakten) + STATUS→COMM-Map.
3. `applyKanzleiFakt` Shared Core (+ Fakt→Tabelle-Routing-Test).
4. Panel-Umbau (LexDriveTriggerPanel → Fakt-Maske) + Verdrahtung.
5. Verifikation (tsc, vitest, Dry-Run prod, Audit) → PR (gestapelt auf #3285).

## Koordination
⚠️ `kanzlei_faelle`/Kanzlei-Files + `processLexDriveEvent`/`LexDriveTriggerPanel` werden von `fbca7869` (vollmacht/lexdrive-Linie) berührt — Panel-Umbau + applyKanzleiFakt sind disjunkt zu deren vollmacht/filmcheck-Gating, aber vor dem Panel-Umbau deren aktuellen Stand prüfen. `autoPhase.ts`/`autophase-decision.ts` = diese Linie (unowned sonst).
