# Claim-AI-Konsole — Design-Spec

**Datum:** 2026-07-07
**Branch:** `kitta/claim-ai-konsole` (Worktree)
**Status:** Design — wartet auf Aaron-Review vor writing-plans
**Verwandt:** [[coordination-ai-claim-orchestrator]] (der Vorschlags-Spine, auf dem wir bauen)

---

## 1 · Problem & Ziel

Zwei zusammenhängende Wünsche von Aaron (07.07.):

1. **„Werden die Copilot-Chats gespeichert und pro Rolle am Claim angezeigt?"** — Aktuell **nein**. Der einzige echte interaktive Chat (Makler-Copilot, `/api/makler/copilot`) ist bewusst ephemer (Code-Kommentar: *„Persistiert die Session nicht (MVP)"*). Nur Token-Logging (`ai_usage`) wird geschrieben, kein Chat-Inhalt. Es gibt **keine** Stelle, an der ein Admin die AI-Interaktionen aller Rollen an einem Claim gebündelt sieht.
2. **„Claude tiefer ins Produkt, damit Admins mehr steuern können — aber der AI-Vorschlag muss als Admin freigegeben werden, in der Claim-View."**

**Ziel:** Ein per-Claim-AI-Layer, in dem Claude (interaktiv vom Admin getrieben **und** — später — autonom vom Orchestrator) **Aktions-Vorschläge** erzeugt, die **in der Claim-View** als freigabepflichtige Karten erscheinen. Der Admin gibt frei oder verwirft. Freigabe wirkt **hybrid** (siehe §7). Konversation, Vorschläge und ausgeführte Aktionen hängen **persistent am Claim** und sind **pro Rolle gefiltert** sichtbar.

## 2 · Ausgangslage (im Code verifiziert)

| Surface | Rolle | Typ | Persistiert? | Sichtbar wo |
|---|---|---|---|---|
| Makler-Copilot (`/api/makler/copilot`) | Makler | echter Chat | ❌ nein (MVP-ephemer); nur `ai_usage` | Makler-Akte, weg beim Schließen |
| KI-Fall-Zusammenfassung (`fall_summaries`, AAR-104, `faelle/[id]/ai-actions.ts`) | intern | One-Shot auf Knopfdruck | ✅ `claim_id` | `/faelle/[id]` |
| Call-Vorschläge (`call_copilot_suggestions`) | intern | One-Shot nach Call | ✅ | Kommunikations-Timeline |
| FAQ-Bot / KB-Assistent | Kunde/KB | Chat | Tabelle `ki_gespraeche` existiert (Fall+Rolle+User+RLS), **aktuell nicht verdrahtet** (brach) | — |
| **AI-Claim-Orchestrator** (PR #3687, LIVE) | Admin | autonom (Cron) | ✅ `ai_claim_proposals` | `/admin/ai-vorschlaege` (Queue) |

**Kern-Erkenntnis:** Der Vorschlags-/Freigabe-Spine existiert bereits und läuft in Produktion. Was fehlt, ist genau Aarons Wunsch: (a) ein **interaktiver** Produzent (Admin treibt Claude am Claim), (b) Freigabe **in der Claim-View** statt nur in der zentralen Queue, (c) **Aktions-Verben mit echter Ausführung** (der Orchestrator erzeugt heute nur Tasks), (d) **persistente, rollen-gefilterte Konversation**.

## 3 · Kernentscheidung: auf dem Orchestrator-Spine bauen, nicht daneben

Wir **konvergieren auf `ai_claim_proposals`** statt eine zweite Vorschlags-Tabelle zu bauen (das wäre die Redundanz, die der Post-Task-Audit §3 verbietet). Konkret:

- **Datenlayer geteilt:** dieselbe Tabelle `ai_claim_proposals`, **additiv** um Copilot-/Aktions-Felder erweitert (§5). Additive Migration = minimales Kollisionsrisiko mit den laufenden Orchestrator-Sessions.
- **Executor importiert, nicht dupliziert:** `buildTaskFromProposal` (kein `'use server'`, explizit als importierbar markiert) und `decideProposal`/`verwerfenVorschlag` werden **importiert**. Ich editiere **nicht** `src/lib/orchestrator/*` oder `src/app/admin/ai-vorschlaege/*`.
- **Mein Code in eigenem Namespace:** `src/lib/claim-ai/*`, `src/app/api/admin/claim-copilot/`, In-Claim-Komponenten + eine neue Freigabe-Action colocated unter `faelle/[id]`.
- **Komplementär, nicht redundant zur Queue:** `/admin/ai-vorschlaege` bleibt die cross-claim Queue; die In-Claim-Konsole ist die per-Claim-Sicht + der interaktive Einstieg. Beide lesen dieselbe Tabelle.

## 4 · Architektur (Units mit je einem Zweck)

1. **Context-Builder** `src/lib/claim-ai/context.ts` → `buildClaimAiContext(claimId)`. Lädt Fall+Lead+Doku+Timeline+Nachrichten+Termine+Tasks in einen kompakten Prompt-Kontext. **Extrahiert aus dem bestehenden Loader in `faelle/[id]/ai-actions.ts`** (der lädt exakt diese Nebentabellen) → beide teilen einen Loader (Boy-Scout gegen Redundanz). Service-role-Pfad → liest **Basis-Tabellen**, nicht `v_claim_*` (die sind auth-gated → 0 Zeilen für Admin-Client; verifizierte Orchestrator-Lehre).
2. **Copilot-Endpoint** `src/app/api/admin/claim-copilot/route.ts` — Streaming (Sonnet 4.6), **Tool-Use**. Claude ruft Verb-Tools (`propose_*`) oder `answer`. Tool-Calls **schreiben Proposals (`status='offen'`), führen NICHTS aus**. Guard: nur Admin. Konversation → `ki_gespraeche`.
3. **Verb-Registry** `src/lib/claim-ai/verbs.ts` — pro Verb: Zod-Schema (payload) + `kind: 'task' | 'auto' | 'draft'` + `execute()`-Mapping auf eine **bestehende** Server-Action. Einzige Wahrheit, was Claude vorschlagen darf. **Kein `'use server'`** (exportiert Konstanten/Types — AGENTS.md-Regel).
4. **Freigabe-Action** `src/app/faelle/[id]/claim-ai-actions.ts` (`'use server'`) → `freigebenClaimAiVorschlag(id)` / verwerfen (importiert `verwerfenVorschlag`). Result-Object-Pattern, `requireAdmin`. Freigabe-Logik siehe §7.
5. **In-Claim-Panel** `src/app/faelle/[id]/_components/ClaimAiPanel.tsx` — Copilot-Eingabe (Admin) · Vorschlags-Karten `[Freigeben][Verwerfen]` mit Claude-Begründung · **AI-Verlauf** (Konversation + Vorschläge + ausgeführte Aktionen), rollen-gefiltert. Component-Set (`shared/SectionCard`, `primitives.Button variant=navy|ondo|ghost|bare|danger|success`), Status-Badges aus `src/lib/status/`-Registry (Status-Registry-Gate).

## 5 · Datenmodell (rein additiv auf `ai_claim_proposals`)

Bestehende Spalten (verifiziert): `id, claim_id, vorschlag_typ, ziel_rolle, payload (jsonb), status ('offen'|'angenommen'|'bearbeitet'|'verworfen'), dedupe_key, decided_by, …`. RLS = nur `service_role`.

**Additive Migration** (über Supabase-Plugin `apply_migration`, Regel 2):

- `quelle text NOT NULL DEFAULT 'orchestrator'` — `'orchestrator' | 'copilot'`. Unterscheidet Produzent; filtert die interaktive Konsole; hält Aktions-Verben aus der Auto-Graduierung (die ohnehin nur `typ='task'` betrifft).
- `ausgefuehrt_am timestamptz NULL` + `execution_result jsonb NULL` — Ausführungs-Audit (analog zu den Phase-2-Spalten `auto_ausgefuehrt`/`erzeugte_task_id`).
- `entwurf_ref uuid NULL` — Referenz auf den erzeugten Nachrichten-Entwurf (draft-Verben).
- **`vorschlag_typ`-Constraint:** bei Plan-Start prüfen (`information_schema`/Migrationsfile). Falls CHECK-Constraint auf `task|escalation|next_step` → additiv um die Aktions-Verben erweitern. Falls nur app-seitig (Zod) validiert → keine DDL nötig.

**Konversation:** `ki_gespraeche` wiederbeleben (wörtlich für *„ein Gespräch pro Fall+Rolle+User"* gebaut, RLS: eigener User + Staff). Schema bei Plan-Start verifizieren (claim_id vs. fall_id nach CMM-49). Falls inkompatibel → neue schlanke `claim_ai_threads`. Entscheidung im Plan nach Schema-Check.

## 6 · Verb-Registry

Jedes Verb = Zod-Payload + `kind` + Mapping auf eine bestehende Server-Action. Start klein (YAGNI):

**Inkrement 1 — die Schleife sicher beweisen:**

| Verb | kind | Ausführung bei Freigabe | Reuse |
|---|---|---|---|
| `create_task` | `task` | Task an Zielrolle | **`buildTaskFromProposal`** (import) — byte-identisch zum Orchestrator |
| `draft_message` | `draft` | Nachrichten-**Entwurf** erzeugen, Absenden = 2. Klick | bestehender Nachrichten-/Draft-Pfad |
| `add_note` | `auto` | interne Timeline-Notiz | bestehender `timeline`-Insert |

**Inkrement 2 — operative Steuerung:**

| Verb | kind | Anmerkung |
|---|---|---|
| `assign_sv` | `auto` | SV-Zuweisung + Slot; braucht Integration mit dem Dispatch-Zuweisungspfad |
| `set_status` | `auto` | **nur operative, reversible Status** — Regulierung/Zahlung/Fall-Annahme AUSGESCHLOSSEN (Art. 22, §9) |
| `request_document` | `auto`/`draft` | Doku-Anforderung an Kunde (Outbound → draft) |

## 7 · Freigabe-Executor (Hybrid — Aarons Entscheidung)

`freigebenClaimAiVorschlag(id)`:

1. `requireAdmin`; Proposal laden; **Idempotenz-Guard** `status==='offen'` (wie `annehmenVorschlag`).
2. Verb aus Registry auflösen → nach `kind`:
   - **`task`** → `buildTaskFromProposal(payload, ziel_rolle, claim_id, 'claim_ai_copilot')` (import). `erzeugte_task_id` setzen.
   - **`auto`** (reversibel/intern) → gemappte Server-Action ausführen → `ausgefuehrt_am` + `execution_result` setzen.
   - **`draft`** (Outbound) → Nachrichten-**Entwurf** anlegen → `entwurf_ref` setzen. Kein Versand. In-Claim erscheint „Entwurf bereit → prüfen & senden" (bestehender Send-Pfad = 2. Klick).
3. Status → `decideProposal(id, 'angenommen', userId)` (import).
4. Timeline-Event „KI-Vorschlag freigegeben & ausgeführt: …" (KI-Attribution: vorgeschlagen von KI, freigegeben von Admin X). Non-critical → try/catch.
5. `revalidatePath('/faelle/${fallId}')` (+ betroffene Rollen-Views).

Fehler in der Ausführung → `status` bleibt/`execution_result.error`; Result-Object `{ ok:false }`.

## 8 · Persistenz & Rollen-Filter

- **Konversation** → `ki_gespraeche` (pro Claim+Rolle+User). RLS liefert die Filterung: eigener User sieht seinen Thread, Staff sieht alle.
- **Vorschläge/Aktionen** → `ai_claim_proposals`, gelesen über Admin-Client-Server-Action (RLS = service_role). `ziel_rolle` steuert per-Rollen-Sichtbarkeit; **Admin sieht alles**.
- **Ausgeführte Aktionen** erscheinen ohnehin in den bestehenden Rollen-Views (gesendete Nachricht → Kunde-Chat, SV-Zuweisung → Dispatch/SV) — mit KI-Attribution im Timeline-Event.
- **Inkrement 1:** In-Claim-Panel in `/faelle/[id]` (intern). **Inkrement 2:** rollen-gefilterte Read-Slices in Makler-/Kunde-Views.

## 9 · Sicherheit, DSGVO, Auto-Graduierungs-Ausschluss

- **DSGVO Art. 22** (Leitplanke `src/content/legal/datenschutz.md:343` — „finale Entscheidung stets durch Menschen"): Die **Admin-Freigabe ist die menschliche Letztentscheidung** → Auto-Ausführung nach Freigabe ist keine „vollautomatisierte Entscheidung", also compliant. **Ausgeschlossen** aus den Auto-Verben bleiben Fall-Annahme, Zahlung, Regulierung — die brauchen separate Art.-22-Safeguards. `set_status` wird auf operative, reversible Status eingegrenzt.
- **Outbound immer draft** → kein versehentlicher Kundenkontakt.
- **Doppel-Gate:** Zod bei Vorschlag (Tool-Use) UND vor Ausführung.
- **Auto-Graduierungs-Ausschluss:** Phase-2-`isAutoEligible` greift nur bei `vorschlag_typ==='task'`. Meine Aktions-Verben (`assign_sv`/`set_status`/…) sind kein `'task'` → Cron kann sie **nie** autonom ausführen. Als Test-Assertion festhalten.
- Nur bestehende Server-Actions, keine Raw-Mutations. Auth: `requireAdmin` an jeder mutierenden Stelle.

## 10 · Koordination (Multi-Session)

- **Aktiv angrenzend:** Orchestrator-Sessions (`kitta/orchestrator-phase2-graduierung`, `kitta/admin-ai-vorschlaege-nav`). Aaron koordiniert dieses Thema gerade aktiv (Broadcast-Wunsch).
- **Shared-File-Edits (minimal, additiv):** `src/lib/ai/models.ts` (+1 Key `claim_copilot`, wie der Orchestrator `claim_orchestrator` ergänzte). Sonst **nur neue Dateien** + **additive** Migration.
- **Nicht anfassen:** `src/lib/orchestrator/*`, `src/app/admin/ai-vorschlaege/*` (nur importieren).
- **Konvergenz:** langfristig kann die Queue `quelle`-agnostisch beide Produzenten zeigen; kein Bruch nötig, da geteilte Tabelle.
- Memory-Marker `COORDINATION-claim-ai-konsole.md` anlegen.

## 11 · Inkremente

- **Ink. 1 (Stufe-1-MVP):** additive Migration · Context-Builder-Extraktion · Copilot-Endpoint (Tool-Use) · 3 Verben (`create_task`/`draft_message`/`add_note`) · **„Fall prüfen"-Diagnose-Button (§15)** · Freigabe-Action (hybrid) · In-Claim-Panel in `/faelle/[id]` (Admin) · `ki_gespraeche`-Persistenz · rollen-gefilterter Read. Durchgehend TDD.
- **Ink. 2:** operative Verben (`assign_sv`/`set_status`/`request_document`) · Rollen-Slices in Makler-/Kunde-Views · „vor Freigabe bearbeiten".
- **Ink. 3 (Stufe 2):** Orchestrator-Vorschläge erscheinen in denselben In-Claim-Karten (nur Read/Approve — Producer existiert schon).
- **Ink. 4 (Stufe 3):** Cross-Claim-Cockpit-Aggregation.

## 12 · Testing (TDD)

- Verb-Registry: Zod-Round-Trip pro Verb (valide/invalide Payloads).
- Freigabe-Executor: `task`→buildTaskFromProposal aufgerufen; `auto`→gemappte Action aufgerufen + Status/Spalten-Transition; `draft`→**kein** Versand, Entwurf erzeugt; Idempotenz (2. Freigabe = no-op).
- Rollen-Filter-Query: Admin sieht alle, Rolle sieht nur `ziel_rolle`-Slice.
- Copilot-Tool-Call → Proposal-Zeile (`quelle='copilot'`, `status='offen'`).
- **Safety-Assertion:** Aktions-Verb ist nie auto-graduierungs-berechtigt.
- Env=node, Funktions-Level (No-DOM-Test-Lehre); Module mocken statt echte Sends.

## 13 · Offene Verifikationen (Plan-Phase, gegen echte Datei/DB)

1. `ai_claim_proposals.vorschlag_typ` — CHECK-Constraint vorhanden? (bestimmt additive DDL).
2. `decideProposal` — akzeptierte Decision-Werte (`'angenommen'` für Aktions-Verben ok?).
3. `ki_gespraeche` — aktuelles Schema (claim_id vs fall_id, Message-Storage) → revive vs. neue Tabelle.
4. Exakte Server-Action-Namen/Signaturen für `assign_sv` (Dispatch-Zuweisung), `set_status`, `request_document`, Nachrichten-Entwurf.
5. `createLinkedTask`-Signatur (via `buildTaskFromProposal` bereits gekapselt).

## 14 · Verifizierte Fakten (aus Orchestrator-Marker + Code-Reads)

- `logAiUsage`-Sig = `{ endpoint, model, fallId, usage:{ input_tokens, output_tokens } }`.
- `tasks.fall_id == claims.id`; `timeline` hat `claim_id` UND `fall_id`, Timestamp `created_at`, `titel`.
- `TaskPrioritaet = 'normal'|'dringend'|'kritisch'`; `PRIO_MAP` (niedrig→normal, hoch→dringend) in `task-from-proposal.ts`.
- `primitives.Button variant = navy|ondo|ghost|bare|danger|success`.
- `AI_MODELS` in `src/lib/ai/models.ts`; neuer Key `claim_copilot: 'claude-sonnet-4-6'`.
- Service-role-Pfade lesen Basis-Tabellen, nie `v_claim_*` (auth-gated → 0 Zeilen).
- Migrationen nur über Supabase-Plugin `apply_migration`; File-Name == getrackte Version (Twin-Drift-Regel).

## 15 · Proaktive Diagnose („Fall prüfen") — die KI deckt Probleme auf & leitet Notwendigkeiten ab

Über den reaktiven Modus (Admin fragt → Claude schlägt vor) hinaus bekommt der Copilot einen **proaktiv-diagnostischen Modus**: Claude scannt den vollen Claim-Kontext (den der Context-Builder ohnehin lädt) und liefert (a) **erkannte Probleme** (Findings) + (b) die **nötigen Schritte** als freigabepflichtige Vorschläge — dieselbe Freigabe-Mechanik, keine neue Ausführungslogik.

Beispiel-Findings → abgeleitete Notwendigkeit (Verb):

- Fehlende Pflichtdokumente (ZB1/Vollmacht/Abtretung), fehlende VIN/Kennzeichen → Doku anfordern (`request_document`/`draft_message`)
- SLA-/Fristrisiko (Termin überfällig, N Tage ohne Aktivität, Versicherer-Frist) → Eskalation/Nachfassen (`create_task`)
- Widersprüche (Gutachten vs. KVA, Schadensdatum Lead≠Fall, Haftpflicht ohne Gegnerversicherung) → Prüfaufgabe (`create_task`/`add_note`)
- Prozess-Stall (Phase X seit Y Tagen, SV zugewiesen ohne Termin, Abtretung signiert ohne Kanzlei-Push) → nächster Schritt (`create_task`/`assign_sv`)
- Kommunikations-Gap (Kunde wartet seit N Tagen) → Antwort-Entwurf (`draft_message`)
- Compliance-Flags (Personenschaden ohne Kanzlei, Leasing ohne Freigabe) → Task an KB/Kanzlei (`create_task`)

**Konsistenz mit dem Orchestrator:** Der Diagnose-System-Prompt teilt die „Was ist ein Problem"-Heuristik mit dem Orchestrator (der cron-getrieben cross-claim dasselbe Urteil fällt). Ein Definitionsort für Probleme, zwei Auslöser (on-demand in-claim vs. autonom cron). Gemeinsamen Prompt-Baustein ggf. extrahieren (Plan-Phase).

**Guardrails:** Findings tragen `schweregrad` (info/warnung/kritisch) → Alarm-Fatigue vermeiden, Kritisches zuerst. Jede *Aktion* bleibt freigabepflichtig (§7) → kein Risiko durch False-Positives, der Admin filtert. Reine Findings ohne sauberes Verb werden als Hinweis gezeigt (keine Zwangs-Aktion).

**Inkremente:** Ink. 1 = „Fall prüfen"-Button (Diagnose-Preset-Prompt über denselben Copilot-Endpoint — ~0 Zusatzcode, nutzt Tool-Use). Ink. 2 = strukturierte Findings mit `schweregrad`. Ink. 3 = automatischer Scan beim Öffnen des Claims („N Auffälligkeiten erkannt"-Badge) + gemeinsamer Prompt-Baustein mit Orchestrator.
