# AI-Claim-Orchestrator — Design-Spec

> **Status:** Draft zur Review (2026-07-05). Strategisches Fundament, kein Implementierungsplan.
> Der Implementierungsplan (writing-plans) folgt **nur für Phase 1 (Shadow-Mode-PoC)** nach Freigabe.

**Autor-Kontext:** Aarons Vision — „Claude als treibende Kraft für die DB-Ops im Claim + ein Modell,
das die nötigen Tasks an die entsprechenden Rollen steuert." Also ein AI-Orchestrator über dem
Fall-Lebenszyklus, statt (bzw. **über**) der heutigen deterministischen Regel-Engine.

---

## 1 · Goal

Ein **AI-Orchestrator**, der pro Fall den vollen Kontext liest, den **nächsten sinnvollen Schritt
beurteilt** (Task an Rolle X, Eskalation, Hinweis) und diesen — **ausschließlich über validierte,
deterministische Tools** — vorschlägt bzw. (später, graduiert) ausführt. Der Orchestrator **ergänzt**
die deterministische Engine (die als zuverlässiger Boden + Fallback bleibt) und **konsolidiert** die
heute fragmentierten *Judgment*-KI-Aufrufe in eine kontextreiche Instanz.

**Nicht-Ziel:** Die Regel-Engine ersetzen. Die spezialisierten Extraction-/Vision-KIs (OCR, Foto-Analyse)
ersetzen. Vollautomatische Fall-Entscheidungen ohne Menschen (→ §7 Compliance verbietet das).

---

## 2 · Problem / Motivation

Zwei Beobachtungen aus dem Code-Ist-Zustand motivieren das:

**(a) Die Orchestrierung ist heute rein deterministisch — stark bei klaren Pfaden, blind im Long-Tail.**
`state-machine.ts` (Status-Transitions), `createLinkedTask` + `chooseAssigneeForRolle` (Round-Robin-Assign),
die SLA-Tracker und die `EVENT_MATRIX` decken die *erwartbaren* Übergänge sauber ab. Aber:
- **Routing ist naiv:** `chooseAssigneeForRolle` = least-loaded Round-Robin. Kein Blick auf Expertise
  (E-Auto, Oldtimer, Region), Kontext-Fit oder Dringlichkeit.
- **Der Long-Tail fällt durch:** „SV antwortet seit 10 Tagen nicht + Frist naht + Kunde nervös → eskalieren,
  an wen?" ist keine Regel, sondern Judgment. Solche Fälle bleiben liegen, bis ein Mensch sie zufällig sieht.
- **Priorisierung fehlt:** Ein KB mit 50 offenen Tasks bekommt keine Hilfe, *welche* jetzt dringend ist.

**(b) Die vorhandene KI ist fragmentiert.** Es gibt bereits ~6 KI-Aufrufe im Produkt, aber jeder lädt
seinen eigenen Kontext, macht *eine* Sache, und keiner *orchestriert*. Eine kontextreiche Instanz, die den
ganzen Fall sieht, kann mehrere dieser Judgment-Aufgaben kohärenter erledigen als N isolierte Calls (→ §6).

---

## 3 · Ist-Zustand — die zwei Schichten, die der Orchestrator berührt

### 3a · Deterministische Orchestrierung (bleibt der Boden)
| Baustein | Datei | Rolle |
|---|---|---|
| Status-Transitions | `src/lib/claims/state-machine.ts` (`transitionFallStatus`) | Regel-getriebener Lebenszyklus |
| Task-Erzeugung | `src/lib/tasks/create-task.ts` (`createLinkedTask`) | Deterministischer Insert + Reminder-Kaskade + `task.created`-Event |
| Auto-Assign | `chooseAssigneeForRolle` (least-loaded Round-Robin) | Wer bekommt den Task |
| Notifications | `EVENT_MATRIX` + `api/notifications/process` | Event×Rolle→Kanäle, deterministischer Fan-out |
| SLA / Phase | SLA-Tracker, `v_claim_phase` (= `lifecycle.ts`) | Fristen, Phasen-Ableitung |

### 3b · Bestehende KI-Aufrufe (die „anderen KI-Funktionen im Claim")
| # | Funktion | Datei | Typ | Input → Output | Modell |
|---|---|---|---|---|---|
| 1 | Gutachten-OCR | `src/lib/ai/gutachten-ocr.ts` | **Extraction** | PDF → strukturierte Felder | Claude Vision |
| 2 | Kostenvoranschlag-OCR | `src/lib/ai/kostenvoranschlag-ocr.ts` | **Extraction** | KVA → strukturierte Positionen | Claude Vision |
| 3 | Anspruch-Foto-Analyse | `src/app/embed/anspruch-pruefen/actions.ts` (`VISION_SYSTEM`) | **Extraction + Schätzung** | Schadenfotos → `{teile, schweregrad, segment, kosten_min/max}` → `berechneAnspruchsSpanne` | Claude Vision |
| 4 | Branding-Logo-Analyse | `src/lib/branding/claude-vision.ts` | **Extraction** | Logo → primary/secondary Farbe | `AI_MODELS.vision_branding` |
| 5 | Filmcheck / QC | `src/app/faelle/[id]/_actions/filmcheck.ts` | **Judgment** | Fall-Daten → QC-Auffälligkeiten | Claude |
| 6 | Wissen-Generierung | `src/lib/wissen/generate.ts` | **Content** | Prompt → Artikel | Claude |

**Gemeinsame Infra (wiederverwenden, nicht neu bauen):**
`src/lib/ai/models.ts` (`AI_MODELS`-Registry) · `src/lib/ai/vision/client.ts` (`getAnthropicVisionClient`,
`buildImageBlocks`) · `src/lib/ai/usage-log.ts` (`logAiUsage` — Kosten-/Nutzungs-Tracking existiert schon).

---

## 4 · Die eine Design-Regel (nicht verhandelbar)

> **Claude ENTSCHEIDET (Judgment). Claude führt NIE roh aus.**
> Jede Zustandsänderung läuft über ein **validiertes, deterministisches Tool**, das dieselben Invarianten
> erzwingt wie heute — `create_task(role, …)` prüft die Rolle, `advance_phase(claim, phase)` prüft die
> Transition-Legalität, `assign_to(role, userId)` prüft Kapazität. Der Orchestrator wählt das Verb + die
> Argumente; das Verb entscheidet, ob es zulässig ist.

**Warum:** DB-Ops sind konsequent. Ein Modell rohe Updates/SQL schreiben zu lassen = Halluzination →
Daten-Korruption + nicht auditierbar. Über getoolte Verben bekommt man AI-Adaptivität **ohne** die
DB-Korrektheit zu opfern — und jede Aktion ist per Konstruktion geloggt. (Das ist exakt die Richtung der
bereits begonnenen **MCP-Write-API**: Claude ruft ein Verb, nicht die Tabelle.)

---

## 5 · Architektur

```
                    ┌─────────────────────────────────────────────┐
   Trigger          │            AI-CLAIM-ORCHESTRATOR             │
   (Cron: stagnie-  │  liest v_claim_full + Timeline + offene      │
   rende Fälle,     │  Tasks + Phase  →  reasoning  →  wählt        │
   später on-event) │  0..n TOOL-CALLS mit Begründung              │
                    └───────────────┬─────────────────────────────┘
                                    │  (nur validierte Verben)
              ┌─────────────────────┼──────────────────────┐
              ▼                     ▼                      ▼
     propose_task(role,…)   flag_escalation(…)    suggest_next_step(…)
              │                     │                      │
     ┌────────┴─────────────────────┴──────────────────────┴────────┐
     │  PHASE 1 (Shadow):  schreibt in `ai_claim_proposals`          │
     │                     (advisory) — KEIN Write am Fall            │
     │  PHASE 2 (Trusted): bewährte Verben rufen die deterministische │
     │                     Action (createLinkedTask, transitionFall…) │
     └───────────────────────────────────────────────────────────────┘
              │
              ▼  Mensch sieht Vorschlag (Admin-Surface / Bell „AI schlägt vor")
        approve / dismiss / edit  →  Feedback-Loop (misst Judgment-Qualität)

   ┌───────────────────────────────────────────────────────────────┐
   │  DETERMINISTISCHE ENGINE (unverändert) = Boden + Fallback:      │
   │  state-machine · createLinkedTask · EVENT_MATRIX · SLA         │
   │  Orchestrator down  →  System läuft normal weiter.             │
   └───────────────────────────────────────────────────────────────┘
```

### Bausteine (jeder isoliert testbar)
- **`orchestrator/context.ts`** — `buildClaimContext(claimId)` → verdichtet `v_claim_full` + Timeline +
  offene Tasks + Phase + SLA-Reststand zu einem kompakten JSON-Kontext. **Pure Datenbeschaffung**, keine KI.
- **`orchestrator/tools.ts`** — die validierten Verben als getypte Tool-Definitionen
  (`propose_task`, `flag_escalation`, `suggest_next_step`, später `advance_phase`, `assign_to`).
  Jedes Verb hat ein Zod-Schema + eine deterministische `execute`-Funktion, die die Invariante prüft.
- **`orchestrator/run.ts`** — `reviewClaim(context)`: baut den Prompt, ruft Claude mit den Tools, sammelt
  die Tool-Calls + Begründungen. **Kein direkter DB-Write** in Phase 1 — Tool-Calls werden materialisiert.
- **`orchestrator/proposals.ts`** — schreibt/liest `ai_claim_proposals` (Vorschlag, Begründung, Status,
  Feedback). Die einzige Schreib-Oberfläche in Phase 1.
- **Trigger:** `api/cron/claim-orchestrator/route.ts` — selektiert stagnierende Fälle (dieselbe Signatur
  wie die bestehenden Health-Checks: `status`/`last_activity`-basiert) und ruft `reviewClaim` je Fall.
- **Surface:** Admin-Panel „AI-Vorschläge" + (Phase 1b) Bell-Eintrag „AI schlägt vor" für die Zielrolle.

### Datenmodell (Phase 1, additiv — Regel 2: via `apply_migration`)
```
ai_claim_proposals (
  id, claim_id, erstellt_am,
  vorschlag_typ,        -- 'task' | 'escalation' | 'next_step'
  ziel_rolle,           -- an welche Rolle
  payload jsonb,        -- die konkreten Tool-Args (title, prio, …)
  begruendung text,     -- WARUM (der Kern-Wert für Vertrauen + Audit)
  modell text,          -- welches Modell + Version (Reproduzierbarkeit)
  status,               -- 'offen' | 'angenommen' | 'verworfen' | 'bearbeitet'
  entschieden_von, entschieden_am,
  feedback text         -- optionaler Mensch-Kommentar → Kalibrierung
)
```
Jeder Vorschlag ist auditierbar (Begründung + Modellversion), jede Mensch-Entscheidung wird zum
Kalibrierungs-Signal. **Keine** Änderung an `claims`/`tasks` in Phase 1.

---

## 6 · KI-Funktions-Konsolidierung (die Analyse, die Aaron wollte)

**Kernfrage:** Kann der zentrale Orchestrator die 6 bestehenden KI-Funktionen ersetzen?
**Antwort:** Nur die *Judgment*-Klasse — und das ist genau der Sinn. Extraction/Content bleiben spezialisiert.

| # | Funktion | Ersetzbar? | Begründung |
|---|---|---|---|
| 1 | Gutachten-OCR | **Nein — konsumieren** | Präzise Dokument→Feld-Extraktion ist eine spezialisierte Perzeptions-Aufgabe (Genauigkeit zählt, ist in `datenschutz.md` als Google-Vision/Claude-OCR *namentlich* deklariert). Der Orchestrator *liest* die extrahierten Felder als Kontext und kann OCR *triggern*, macht sie aber nicht selbst. |
| 2 | Kostenvoranschlag-OCR | **Nein — konsumieren** | Dito. Spezialisierte Extraktion. |
| 3 | Anspruch-Foto-Analyse | **Nein — konsumieren** | Vision-Schätzung aus Fotos; Präzision + eigener Kalibrierungs-Korridor (`berechneAnspruchsSpanne`). Orchestrator nutzt das Ergebnis, ersetzt es nicht. |
| 4 | Branding-Logo-Analyse | **Nein — irrelevant** | Gehört nicht zum Claim-Lebenszyklus (Onboarding/Branding). |
| 5 | **Filmcheck / QC** | **Ja — subsumierbar** | QC = „lies Fall-Kontext → beurteile Auffälligkeiten". Das *ist* Orchestrator-Judgment. Der Orchestrator kann die QC-Beurteilung als einen seiner Reasoning-Schritte liefern, statt als isolierten Call, der den Kontext neu lädt. |
| 6 | Wissen-Generierung | **Nein — anderer Bereich** | Content/SEO, kein Fall-Transaktions-Pfad. |

**Fazit der Konsolidierung:** Der Orchestrator **vereint die fragmentierte Judgment-Schicht** (heute:
Filmcheck-QC + die hardcodeten Routing-/Eskalations-Regeln; künftig: Next-Step, Priorisierung, smartes
Routing) in **eine kontextreiche Instanz**. Er **konsumiert** die spezialisierten Extraction-KIs (OCR/Vision)
als Input/Tools und **lässt Content** (Wissen) unberührt. Das reduziert Fragmentierung *und* füllt die
Orchestrierungs-Lücke — ohne die präzisen Perzeptions-Aufgaben mit einem General-Reasoner zu verwässern.

**Konkreter Konsolidierungs-Pfad (nach dem PoC):** Filmcheck/QC ist der erste Kandidat, den man in den
Orchestrator zieht — gleiche Judgment-Natur, KB-intern (niedrig-Stakes), bereits ein bestehender Consumer.

---

## 7 · Compliance — Art. 22 DSGVO (harte Leitplanke)

`src/content/legal/datenschutz.md:343` sagt **wörtlich**:

> „Eine vollautomatisierte Entscheidungsfindung im Sinne des Art. 22 DSGVO findet nicht statt … die finale
> Entscheidung über die Annahme eines Falls und die weitere Bearbeitung erfolgt jedoch **stets durch einen
> Menschen**."

**Konsequenz für dieses Design:**
- Ein Orchestrator, der Fall-Entscheidungen/DB-Ops **auto** treibt, würde die eigene Datenschutzerklärung
  (und potenziell Art. 22 DSGVO) **verletzen**.
- Deshalb ist **human-in-the-loop keine Vorsicht, sondern Pflicht.** Phase 1 (nur Vorschläge, Mensch
  entscheidet) ist die **compliance-konforme** Bauform.
- Phase 2 (graduiertes Auto-Ausführen) ist **nur** für Aktionen zulässig, die *keine* rechtlich relevante
  Einzelfall-Entscheidung mit erheblicher Auswirkung sind (interne Task-Erzeugung/-Routing = ok;
  Fall-Annahme/-Ablehnung, Zahlung, Regulierungs-Entscheid = **nie** auto, immer Mensch).
- Falls je echtes Auto-Deciding gewünscht wird: erst Datenschutz anpassen + Art.-22-Safeguards
  (Info, Widerspruch, menschliche Überprüfung) bauen. Out-of-Scope hier.

---

## 8 · Rollout — Shadow-Mode zuerst, dann graduiert

| Phase | Was | Risiko | Compliance |
|---|---|---|---|
| **1 — Shadow (PoC)** | Orchestrator *schlägt vor* → `ai_claim_proposals` → Mensch approved/dismissed. Kein Fall-Write. | ~0 | ✅ konform |
| **1b — Bell-Surface** | Vorschläge erscheinen als „AI schlägt vor" bei der Zielrolle, nicht nur im Admin. | ~0 | ✅ |
| **2 — Trusted Auto (selektiv)** | Vorschlags-*Typen* mit belegter Trefferquote (aus dem Feedback der Phase 1) führen via validiertes Verb aus. Nur niedrig-Stakes (interne Tasks/Routing). | mittel, gedeckelt | ✅ (nur Nicht-Art.-22) |
| **3 — Konsolidierung** | Filmcheck/QC in den Orchestrator ziehen; smartes Routing ersetzt Round-Robin dort wo belegt besser. | mittel | ✅ |

**Graduierungs-Kriterium (Phase 1→2):** Ein Vorschlagstyp geht erst dann auf Auto, wenn seine
**Annahme-Quote** (angenommen / (angenommen+verworfen)) über einem Fenster (z. B. ≥ 50 Entscheidungen)
einen Schwellwert überschreitet — datengestützt, nicht nach Gefühl.

---

## 9 · PoC-Zuschnitt (Phase 1 — was der erste Plan baut)

**Ein Claim-Review-Agent im Shadow-Mode, fokussiert auf Task-Routing an Rollen** (Aarons „Tasks an die
entsprechenden Rollen steuern" — niedrig-Stakes, hoch-Wert, sicherer Einstieg):

1. **Cron** selektiert stagnierende Fälle (kein Fortschritt seit N Tagen, offene Phase).
2. Pro Fall: `buildClaimContext` → `reviewClaim` mit den Tools `propose_task`, `flag_escalation`,
   `suggest_next_step`.
3. Tool-Calls werden als `ai_claim_proposals` materialisiert (mit Begründung + Modellversion).
4. **Admin-Surface** listet offene Vorschläge; Approve → (Phase 1 noch manuell) legt der Mensch den Task an
   bzw. ein Klick ruft die *bestehende* `createLinkedTask`. Dismiss → Feedback.
5. **Observability:** an den bestehenden Pipeline-Health-Wächter andocken (Anzahl Vorschläge, Annahme-Quote,
   Fehlerrate der Läufe) — dieselbe Check-Registry (`src/lib/health/checks/`).

**Bewusst NICHT im PoC (YAGNI):** Auto-Ausführung · on-event-Trigger (erst Cron) · Konsolidierung von
Filmcheck · smartes Expertise-Routing · Multi-Modell-Voting. Alles Phase 2+.

---

## 10 · Guardrails, Kosten, Failure-Modes

- **Kosten:** Nur stagnierende Fälle (kleine Menge), gebatcht, Kontext verdichtet. `logAiUsage` (existiert)
  trackt Tokens/Kosten pro Lauf → im Health-Check sichtbar. Budget-Deckel pro Lauf.
- **Latenz:** Vollständig async (Cron), nie im Request-Pfad einer Nutzer-Aktion.
- **Reliability:** Orchestrator down/fehlerhaft → deterministische Engine unberührt (Boden). Ein
  fehlgeschlagener Lauf ist ein Health-Warn, kein Fall-Breaker.
- **Halluzination:** Über validierte Verben kann der Orchestrator keinen ungültigen Zustand erzeugen; ein
  unsinniger Vorschlag wird vom Menschen (Phase 1) verworfen und kalibriert.
- **Idempotenz:** Ein Fall darf pro Lauf nicht denselben Vorschlag doppelt erzeugen — Dedup über
  `(claim_id, vorschlag_typ, payload-hash, status=offen)`.
- **Audit:** Jeder Vorschlag = Begründung + Modellversion + Mensch-Entscheidung. Vollständige Spur.

---

## 11 · Offene Entscheidungen (für die Review mit Aaron)

1. **Erster Aktions-Typ:** PoC-Vorschlag = **Task-Routing an Rollen** bei stagnierenden Fällen. Bestätigt?
   Oder zuerst reine „Next-Step-Hinweise" ohne Rollen-Zuordnung?
2. **Trigger:** PoC = **Cron** (stagnierende Fälle). On-event später. Ok?
3. **Surface Phase 1:** Nur **Admin-Panel** zuerst, oder direkt auch **Bell an Zielrolle**?
4. **Modell:** `claude-sonnet` für den Reviewer (Kosten/Qualität-Balance) — oder Opus für die Judgment-Tiefe?
5. **Stagnations-Definition:** Welche Schwelle (Tage ohne Aktivität) + welche Phasen zählen als „braucht Blick"?

---

## 12 · Success-Kriterien (PoC)

- Der Cron läuft stabil, erzeugt für stagnierende Fälle nachvollziehbare Vorschläge (mit Begründung).
- Ein Mensch kann jeden Vorschlag in ≤ 1 Klick annehmen/verwerfen; Entscheidung wird geloggt.
- **Annahme-Quote messbar** → Grundlage für die Phase-1→2-Graduierung.
- Kein Eingriff in den deterministischen Pfad; Orchestrator-Ausfall = 0 Fall-Impact.
- Health-Check zeigt Läufe, Kosten, Annahme-Quote.

---

## 13 · Referenzen (Code)
- Deterministik: `src/lib/claims/state-machine.ts`, `src/lib/tasks/create-task.ts`, `src/lib/notifications/*`
- KI-Infra: `src/lib/ai/models.ts`, `src/lib/ai/vision/client.ts`, `src/lib/ai/usage-log.ts`
- Bestehende KI: `src/lib/ai/gutachten-ocr.ts`, `src/app/embed/anspruch-pruefen/actions.ts`,
  `src/app/faelle/[id]/_actions/filmcheck.ts`, `src/lib/wissen/generate.ts`
- Compliance: `src/content/legal/datenschutz.md:343`
- Observability-Andock: `src/lib/health/checks/`
