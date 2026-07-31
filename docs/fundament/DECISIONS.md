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

## 2026-07-28 · Bug3 (C2/C4-Vorgriff) · Logged-in-Redirect → onboarding-details kanonisch

**Lücke:** Welche Erhebungs-Strecke ist kanonisch für eingeloggte Kunden — /flow FlowWizardKfz (Flow A, leads.*) oder /kunde/onboarding-details (Flow B, claims.*)? Beide erheben Unfall-Hergang/Service/Kanzlei/SA in teils anderen Spalten (leads.unfallhergang vs claims.hergang_kunde_text) = die „zwei Feststellungen".

**Entscheidung:** onboarding-details (Flow B) ist kanonisch für eingeloggte Kunden; FlowWizardKfz bleibt anon/Magic-Link-Fallback. Der Logged-in-Redirect (src/app/flow/[token]/page.tsx) lag tot im try/catch (NEXT_REDIRECT wurde ohne isRedirectError-Re-throw verschluckt) und wurde reaktiviert (redirect außerhalb des try).

**Begründung:** Verfassung §4 (eine Akte) + §5 (ein Intake); folgt dem Funnel-v2-Plan (docs/plans/funnel-vereinfachung-2026-05-11.md — „/kunde/onboarding ersetzt FlowWizardKfz"). Dedup: convertLeadToClaim kopiert leads.unfallhergang → claims.hergang_kunde_text.

**Review:** offen (Aaron) — Regel-4-Prod-Smoke 28.07. GELAUFEN (Session 264a7df6, 4 geseedete Sub-Fälle, echte UI, Seeds aufgeräumt): (a) ERLEDIGT. Kernpfade GRÜN wie entschieden: offene Feststellung → Redirect /kunde/onboarding-details mit hergang-Phase; SA-offen (haftpflicht) → FokusSignatur direkt auf /flow/<token>. VERFEHLT: „erledigte Feststellung → Fallakte" — die felderlose sa-Phase (onboarding_phasen kunde-onboarding, ord 40, 0 Felder) ist für den Server-Skip (`pflichtFelder.length > 0`-Guard in ladeNoetigePhasen) nie skippbar → `phases.length === 0` unerreichbar → der Fallakte-Redirect in onboarding-details/page.tsx ist toter Code; ein Kunde mit längst signierter SA sieht stattdessen Schritt 1/1 „Schaden-Abtretung unterschreiben" (irreführende Aufforderung, kein Bruch/500/Sackgasse → kein Revert, fix-forward). (c) dedupe-Edge BESTÄTIGT: hergang-Skip+Prefill sehen nur claims.hergang_kunde_text — leads.unfallhergang wird weder geskippt noch vorbefüllt (textarea leer, per eval verifiziert) = Doppel-Erhebung; Bestand quantifiziert 0/6 echte Kunde-Claims in dieser Konstellation → dormant, fix-forward statt Revert. (b) C2/C4-Vorgriff unverändert offen. NEU (Nebenbefund): Wizard-localStorage-Key `claimondo-wizard-state:<flowKey>` trägt keine fallId → Restore-Banner übernimmt Zustand aus dem ZULETZT bearbeiteten Fall desselben Kunden (Cross-Fall-Contamination bei Mehrfall-Kunden).

## 2026-07-29 · C1 · Event-Log = bestehende `phase_transitions` (kein neues `claim_events`)

**Lücke:** C1 (FUNDAMENT §5) verlangt ein Event-Log und lässt offen, ob eine bestehende Tabelle das Format trägt oder eine additive Migration `claim_events` nötig ist.

**Entscheidung (VORSCHLAG):** **`phase_transitions` ist das Event-Log** — keine neue Tabelle. Verifiziertes Prod-Schema (`id · fall_id · claim_id · from_phase · to_phase · transition_at · transitioned_by · actor_rolle · trigger_type · grund · payload jsonb · created_at`) deckt das geforderte `{claim_id, event, actor, payload, created_at}` mehr als ab; die Engine (`state-machine.ts:324`, AAR-586) schreibt es bereits. C1 schließt nur die Gaps: `claim_id` in den Insert, fire-and-forget → `await`+non-fatal, WILD-Writer funneln. Details: `c1-transition-claim-plan.md` §2.

**Review:** offen (Aaron)

## 2026-07-29 · C1 · C1/FG1-Partition (Matrix-Funnel vs Terminal-Sync)

**Lücke:** C1 und das FG1-Programm (`flag-fg1-claims-writer-funnel`) berühren beide `operative_status`-Writer. Doc-Vorgabe „andocken, nicht parallel erfinden" — Überschneidung ausweisen.

**Entscheidung (VORSCHLAG):** Saubere Partition — **C1 = Matrix-Transition-Funnel** (Lifecycle-Writer durch `transitionFallStatus`; einziger engine-funnel-fähiger WILD-Rest = `sv-zuweisung/route.ts:284`). **FG1 = Terminal-Sync** (`status`→`operative_status` via Trigger/Mapping, Engine bewusst unangetastet; besitzt die 2 C1-Baseline-Writer). Berührungspunkt: der `operative_status`-CHECK (bereits gelandet, 33 Werte — C1 erbt ihn). Folge: C1a-Beweis = `sv-zuweisung` funneln + Event-Log-`claim_id`; die 2 Baseline-Writer zieht C1 nur nach, wenn FG1 sie synct. Details: `c1-transition-claim-plan.md` §4.

**Review:** offen (Aaron)

## 2026-07-29 · C1 · Abschluss-Pfad = Schlussabrechnung + 48h-Karenz (Option B)

**Lücke:** Der Kern-Haftpflichtfall hat zwei Abschluss-Terminals (`abgeschlossen` via Engine-Cascade vs. `reguliert_vollstaendig` via Endzustand) und einen **toten** 48h-Grace-Cron (`cron/fall-abschluss` gated auf `schlussabrechnung_am`, das nie geschrieben wird — 0/23 Prod). Verifiziert: [[audit-c1-auto-close-luecke-zahlung-eingegangen]] (j01 #8, PR #4835). Nach VS-Zahlung: sofort schließen oder Karenz?

**Entscheidung:** **Aaron 29.07.: Option B** — nach VS-Zahlung schließt der Fall NICHT sofort, sondern wartet auf eine echte Schlussabrechnung + 48h-Karenz. Umsetzung (C1c): Cascade-Regel `regulierung/… → abgeschlossen` (bei `zahlungEingegangen`, `autophase-decision.ts:72`) → **`→ zahlung-eingegangen`**; **neue KB-Aktion „Schlussabrechnung erstellt"** setzt `schlussabrechnung_am`; der bestehende 48h-Cron schließt dann `zahlung-eingegangen → abgeschlossen`. EIN Terminal = `abgeschlossen` (`reguliert_vollstaendig` darauf vereinheitlichen). Cron + Gate bleiben.

**Review:** Richtung von Aaron **bestätigt** (29.07.); offenes Design-Detail (was genau die „Schlussabrechnung" ist — Dokument-Typ / KB-Bestätigung / `abrechnungen`-Anbindung) → C1c-Design. Behavior-Change am Kern-Close-Pfad → erst nach B1 bauen.

## 2026-07-30 · P4 (Netzwerk) · Kunden-Bestätigungs-Gate = `sa_unterschrieben`, nicht `onboarding_complete`

**Lücke:** Der SV-Vermittlungs-Sofort-Claim (P4) wird un-onboardet in `gutachten-eingegangen` geboren — die Mid-Funnel-Reader (AutoPhase, case-billing-batch, Werkstatt-Zuweisung, Kanzlei-Handoff) brauchen ein Gate, das ihn blockt, ohne Normalfall-Claims zu stranden.

**Entscheidung:** Gate-Prädikat = **`sa_unterschrieben === true`** (`kundeHatBestaetigt`, `src/lib/faelle/onboarding-gate.ts`). NICHT `onboarding_complete`: ein Normalfall-Claim erreicht `gutachten-eingegangen` legitim mit `onboarding_complete=false` (Portal-Wizard aufgeschoben) — ein Gate darauf würde die Regulierung stranden. Jeder Nicht-SV-Flow-Claim wird `sa_unterschrieben=true` geboren (Claim entsteht am SA-Signing) → das Gate ist dort inert; nur der SV-Sofort-Claim (geboren `false`) wird geblockt. Der sign-into-existing-Pfad setzt BEIDE Flags.

**Review:** offen (Aaron) — Plan `docs/superpowers/plans/2026-07-28-netzwerk-p4-sv-vermittlungs-flow.md` Global Constraints.

## 2026-07-30 · P4 (Netzwerk) · SV-Flow-Reparatur = Nebenschauplatz auf `reparatur_vermittlung_status`-Achse (J4 Offene Frage 3)

**Lücke:** J4 ließ offen, ob die Haftpflicht-Reparatur des SV-Vermittlungs-Flows auf der `operative_status`-`reparatur-*`-Lane läuft.

**Entscheidung:** SV-Flow-Claim = Abrechnungsweg `haftpflicht`, `service_typ='komplett'` → die SV-/Regulierungs-Achse läuft regulär (J1). Reparatur = **Nebenschauplatz** auf `reparatur_vermittlung_status`/`reparatur_termine` via `assignReparaturWerkstatt` (abrechnungsweg-agnostisch); die `operative_status`-`reparatur-*`-Lane bleibt reduced-repair-only (verifiziert: `advanceReparaturCursorTo` ist auf `abrechnungsweg ∈ {selbstzahler, kasko}` gegatet → bei Haftpflicht No-op).

**Review:** offen (Aaron) — Plan P4, Abschnitt „Invariante & Reparatur-Achse".

## 2026-07-31 · C4 · Tranchen-Reihenfolge = SV vor Werkstatt (C4b=SV, C4c=Werkstatt)

**Lücke:** `c4-eine-akte-plan.md §6-Q2` ließ offen, welche Custom-Sicht nach dem Kunde-Prototyp (C4a) zuerst auf den `<FallAkte>`-Kern migriert. Die C4b-Ist-Erhebung (SV, #4916) fand: SV ist der strukturell GRÖSSERE Sonderfall (Client-Tree + Server-Block-Bridge + Stellungnahme-Sub-Route + Sidebar-Layout), Werkstatt der kleinere (linearer 5-Sektionen-Stack). Empfehlung war Werkstatt-zuerst („kleinste zuerst", §5).

**Entscheidung:** **Aaron 31.07.: SV vor Werkstatt** (behält die tentative `c4-plan §4`-Zuordnung: C4b=SV, C4c=Werkstatt). Der größere Sonderfall härtet die Kern-Generalisierung zuerst; Werkstatt (kleiner) folgt als C4c.

**Review:** Aaron 31.07. entschieden (AskUserQuestion). C4-Code gated auf B1/J4.

## 2026-07-31 · C4 · `<FallAkte>`-Kern wird generalisiert (alle 5 Rollen über EINEN Kern)

**Lücke:** Die C4b-Ist (SV) zeigte, dass der c4a-Kern (aus dem Kunde-Prototyp: Server-Component, `columns-2`-Masonry, `{title,description}`-Header) die SV-Client-Sicht nicht 1:1 hostet — 3 harte Divergenzen (Client-Tree, Sidebar-Layout, server-injizierte ReactNode-Blöcke). Kern generalisieren (alle 5 über einen Kern) oder SV/Werkstatt teilen nur Sub-Pieces + behalten ihre Shell?

**Entscheidung:** **Aaron 31.07.: Kern generalisieren.** `<FallAkte>` wächst um (a) `layout`-Variante (`columns` | `sidebar` | später `tabs`), (b) optionalen Custom-Header-Slot (ReactNode statt nur `{title,description}`), (c) server-injizierte ReactNode-Blöcke (`topBlocks`/`footer`). Alle 5 Rollen rendern echt über den Kern (C4-DoD erfüllt). **Feed-Forward:** die Nähte schon bei der C4a-Kunde-Ausführung offen lassen (Kunde nutzt nur `columns` + `{title,description}`) → SV/Werkstatt erzwingen keinen Kern-Refactor.

**Review:** Aaron 31.07. entschieden (AskUserQuestion). Löst zugleich `c4-plan §6-Q1` (Zone- vs Tab-Chrome → Chrome wird eine `layout`-Variante).

## 2026-07-31 · C4 · `<FallAkte>`-Kern bleibt Server-Component (Client-Zonen für Interaktivität)

**Lücke:** SV/Werkstatt-Sichten sind `'use client'` (Geo-Hook, Drawer-/Modal-State). Wird der generalisierte Kern eine Client-Component (einfacher für SV) oder bleibt er Server-Component?

**Entscheidung:** **Aaron 31.07.: Server-Kern + Client-Zonen.** `<FallAkte>` bleibt Server-Component; die Interaktivität (Geo/Drawer/Modal) lebt in den (Client-)Zone-Komponenten + den ReactNode-Slots. Kunde/Staff (heute Server-Components) behalten die RSC-Vorteile (Bundle, Streaming) — kein Regressions-Risiko.

**Review:** Aaron 31.07. entschieden (AskUserQuestion).
