# AI-Claim-Orchestrator Phase 2 — Auto-Graduierung — Design-Spec

> **Status:** Draft zur Review (2026-07-06). Baut auf Phase-1-PoC (`2026-07-05-ai-claim-orchestrator-design.md`, PR #3687).
> Modell **(B) System empfiehlt, Admin flippt** von Aaron gewählt. Scope: **nur Task-Routing**.
> Implementierungsplan folgt erst nach Freigabe — **und erst nachdem Phase 1 in Prod genug Entscheidungsdaten gesammelt hat** (die Graduierung braucht echte Annahme-Quoten).

---

## 1 · Goal

Bewährte Vorschlagstypen aus Phase 1 zu **Auto-Ausführung** graduieren: der Cron erzeugt den Task **direkt** (via bestehende `createLinkedTask`), statt auf Admin-Approve zu warten — **aber nur für Typen, die ein Admin bewusst freigeschaltet hat**, gestützt auf die gemessene Annahme-Quote. Die Annahme-Quote treibt die **Empfehlung**; der Mensch trifft die **Graduierungs-Entscheidung**.

**Nicht-Ziel:** Vollautonomes Auto-Flippen (Modell A, verworfen). Auto für irgendetwas Kundengerichtetes / Fall-Entscheidung / Zahlung. Ersatz des Shadow-Mode für nicht-graduierte Typen.

---

## 2 · Motivation

Phase 1 sammelt pro `(vorschlag_typ, ziel_rolle)` echte Admin-Entscheidungen (angenommen/verworfen). Wenn ein Typ — z.B. „Task an Kundenbetreuer bei stagnierendem Fall" — über viele Entscheidungen konstant hoch angenommen wird, ist der Admin-Approve für diesen Typ **repetitive Bestätigungsarbeit**. Die sicher zu automatisieren spart Durchlaufzeit, ohne die riskanteren/mehrdeutigen Typen anzufassen. Das Vertrauen kommt aus **Daten** (Quote), nicht aus Bauchgefühl — und die Graduierung bleibt ein bewusster, auditierbarer Akt.

---

## 3 · Design-Prinzip

> **Die Quote empfiehlt, der Mensch graduiert. Auto gilt nur für `propose_task`. Alles ist per-Typ reversibel und self-correcting.**

- **Kein Auto-Flip.** Das System berechnet Readiness + zeigt sie; ein Admin drückt „Graduieren".
- **Nur Task-Routing.** `flag_escalation` + `suggest_next_step` bleiben immer advisory (weicher/mehrdeutiger). Zahlung/Fall-Annahme/Regulierung sind **nie** Orchestrator-Auto (Art. 22, §7).
- **Safe-by-default.** Phase 2 shippt mit **allen Typen auf `manual`**. Die Auto-Maschinerie ist gebaut, aber schlafend, bis ein Admin bewusst einen Typ flippt.
- **Self-correcting.** Die Quote graduiert hoch; eine Qualitäts-Regression (Auto-Tasks werden später gehäuft verworfen) graduiert automatisch **zurück** auf manuell (§8). Der Loop schließt sich.

---

## 4 · Architektur

```
                       PHASE-1-DATEN (ai_claim_proposals: status je typ×rolle)
                                        │
                       ┌────────────────┴─────────────────┐
                       ▼                                   ▼
          getTypeStats(typ,rolle)              Admin-Panel „Graduierung"
       (Annahme-Quote über Fenster)   ──────►  zeigt Quote + [Graduieren]-Button
                                                (enabled nur ab Schwelle)
                                                        │ Admin flippt
                                                        ▼
                                          orchestrator_auto_policy(typ,rolle,mode)
                                                        │
   CRON (reviewClaim → drafts) ─── pro draft ──────────┤
        │                                               │
        ├─ (typ,rolle)=auto + typ=task + kill-switch-on ──► createLinkedTask()
        │                                                    + proposal status=angenommen,
        │                                                      auto_ausgefuehrt=true, erzeugte_task_id
        └─ sonst (Phase-1-Verhalten) ─────────────────────► proposal status=offen (Admin entscheidet)
                                                        │
                       ┌────────────────────────────────┘
                       ▼
   QUALITÄTS-REGRESSIONS-MONITOR (Cron/Health):
     Auto-Tasks-Bad-Rate über Fenster > Schwelle
       → policy zurück auf manual + Admin-Alert
```

### Bausteine
- **`orchestrator/policy.ts`** — `getAutoMode(typ, rolle): 'manual'|'auto'` (liest `orchestrator_auto_policy`, default manual) + `setAutoMode(...)` (Admin-Flip, gated). Pure `isAutoEligible(typ, mode, killSwitch)` (nur task + auto + global-on).
- **`orchestrator/stats.ts`** — pure `computeReadiness(rows): { decisionCount, angenommen, verworfen, quote, ready }` + `getTypeStats()` (DB, aggregiert `ai_claim_proposals` je typ×rolle über Fenster).
- **`orchestrator/run.ts` (erweitert)** — `reviewClaim` verzweigt pro Draft: auto-eligible → `executeAutoDraft` (createLinkedTask + proposal angenommen/system/auto-flag); sonst persist 'offen' (unverändert).
- **`orchestrator/quality-regression.ts`** — pure `classifyAutoQuality(stats): { badRate, revert }` + Monitor (findet Auto-Tasks via `erzeugte_task_id`, prüft deren spätere Verwerfung/Stornierung).
- **Admin-Surface `/admin/ai-vorschlaege` erweitert** — Tab/Sektion „Graduierung": Tabelle typ×rolle mit Quote, Entscheidungszahl, mode, [Graduieren]/[Zurücksetzen] (admin-gated Server-Actions).
- **Health-Check erweitert** — `orchestrator-pipeline` + Auto-Rate + Auto-Task-Bad-Rate-Signal.
- **Kill-Switch** — global `ORCHESTRATOR_AUTO_ENABLED` (env, default `false`) — ein Schalter deaktiviert alle Auto, ohne Policy-Zeilen zu ändern.

### Datenmodell (additiv, via `apply_migration`)
```sql
create table public.orchestrator_auto_policy (
  id uuid primary key default gen_random_uuid(),
  vorschlag_typ text not null,          -- nur 'task' relevant (Guard erzwingt)
  ziel_rolle text not null,             -- sachverstaendiger|kundenbetreuer|admin
  mode text not null default 'manual' check (mode in ('manual','auto')),
  geflippt_von uuid references auth.users(id),
  geflippt_am timestamptz,
  auto_revert_grund text,               -- gesetzt wenn Qualitäts-Regression zurückflippte
  unique (vorschlag_typ, ziel_rolle)
);
alter table public.orchestrator_auto_policy enable row level security;
revoke all on public.orchestrator_auto_policy from anon, authenticated;

-- ai_claim_proposals: Auto-Ausführung nachvollziehbar machen
alter table public.ai_claim_proposals add column auto_ausgefuehrt boolean not null default false;
alter table public.ai_claim_proposals add column erzeugte_task_id uuid;  -- FK-frei (tasks-Lebenszyklus getrennt)
```
Kein Backfill nötig (Default manual / false). Auto-Proposals: `status='angenommen'`, `entschieden_von=null` (System, kein auth-User), `auto_ausgefuehrt=true`, `erzeugte_task_id` = die vom `createLinkedTask` erzeugte Task-ID (für den Regressions-Monitor).

---

## 5 · Ablauf im Cron (Delta zu Phase 1)

Phase-1-`reviewClaim` endet mit `persistProposals(claimId, model, drafts)`. Phase 2 ersetzt das durch eine Verzweigung pro Draft:

```
für jeden draft aus extractProposalsFromToolUse(...):
  mode = getAutoMode(draft.vorschlagTyp, draft.zielRolle)
  wenn isAutoEligible(draft.vorschlagTyp, mode, killSwitch):   // task + auto + global-on
      task_id = createLinkedTask({ ...mapping wie annehmenVorschlag... })
      persist proposal: status=angenommen, auto_ausgefuehrt=true, erzeugte_task_id=task_id, entschieden_von=null
      rate-cap: max N Auto-Tasks pro Lauf (Überschuss → als 'offen' persistieren, nicht auto)
  sonst:
      persist proposal: status=offen   // Phase-1-Verhalten unverändert
```

Die Mapping-Logik (payload → `createLinkedTask`-Args) ist **exakt die aus `annehmenVorschlag`** (Phase 1) — als geteilte Funktion extrahieren (`buildTaskFromProposal`), damit Auto-Pfad und Admin-Approve-Pfad **byte-identisch** dieselbe Task erzeugen (kein Divergenz-Risiko).

---

## 6 · Readiness + Graduierung (Admin)

**Readiness-Query** je `(vorschlag_typ, ziel_rolle)` über ein Fenster (letzte T Tage ODER letzte N Entscheidungen): `decision_count`, `angenommen`, `verworfen`, `quote = angenommen/(angenommen+verworfen)`.

**Schwelle (Default, konfigurierbar):** `quote ≥ 0.80` **UND** `decision_count ≥ 30`. Nur wenn beide erfüllt, ist der [Graduieren]-Button aktiv. (Verhindert Graduierung auf dünner Datenbasis.)

**Admin-Panel:** Tabelle aller `(typ, rolle)` mit Quote + Entscheidungszahl + aktuellem mode + Aktion. Graduieren → `setAutoMode(typ, rolle, 'auto')` (server-action, admin-gated, schreibt `geflippt_von/am`). Zurücksetzen → `'manual'`. `escalation`/`next_step`-Zeilen zeigen die Quote (Transparenz), aber **kein** Graduieren-Button (Scope-Guard).

---

## 7 · Compliance (Art. 22 DSGVO) — die Grenze explizit

Auto-Ausführung erzeugt einen **internen Arbeits-Task** (z.B. „KB soll Fall X nachfassen"). Das ist **keine** „ausschließlich automatisierte Entscheidung mit rechtlicher Wirkung / erheblicher Beeinträchtigung gegenüber der betroffenen Person" i.S.d. Art. 22 — es ist interne Workflow-Steuerung. Die **fall-entscheidenden** Schritte (Annahme/Ablehnung, Regulierung, Auszahlung) bleiben zu 100% menschlich (Phase 1 unverändert; `datenschutz.md:343` bleibt wahr).

Zusätzliche Absicherung, die über die Pflicht hinausgeht: der Mensch bleibt auch in der **Graduierungs-Entscheidung** (Modell B). Damit ist selbst die Meta-Ebene („welche Typen dürfen auto") menschlich verantwortet + auditiert. **Keine** Datenschutz-Anpassung nötig; sollte der Scope je über internes Task-Routing hinaus wollen → separate Prüfung + Art.-22-Safeguards (out-of-scope).

---

## 8 · Qualitäts-Regressions-Auto-Revert (die Sicherheitsnetz-Mechanik)

Die Annahme-Quote graduiert **hoch**. Damit ein Modell-Drift nach der Graduierung nicht unbemerkt schlechte Auto-Tasks produziert, graduiert eine Qualitäts-Regression automatisch **zurück**:

- **Signal:** Ein Auto-Task „ging schlecht", wenn die per `erzeugte_task_id` verknüpfte Task später **storniert / gelöscht / als irrelevant geschlossen** wird (Task-Status-Endzustände, die „hätte nicht sein sollen" bedeuten — genaue Menge beim Bau gegen `tasks`-Status verifizieren).
- **Metrik:** `bad_rate = schlechte Auto-Tasks / alle Auto-Tasks` je `(typ,rolle)` über die letzten M Auto-Tasks (z.B. M=20).
- **Trigger:** `bad_rate > 0.30` → `setAutoMode(typ, rolle, 'manual')` automatisch + `auto_revert_grund` setzen + **Admin-Alert** (In-App/Email, wie Health-Alerts). Der Typ fällt zurück in Shadow-Mode; Re-Graduierung erst wieder manuell nach erneut guter Quote.
- **Wo:** im Cron (nach dem Review-Lauf) oder als eigener Health-Check-Punkt. Bevorzugt Health-Check (`orchestrator-pipeline` erweitern) — dann ist die Auto-Qualität dauerhaft sichtbar.

Das schließt den Regelkreis: Auto ist nie „fire-and-forget", sondern datengetrieben rückholbar.

---

## 9 · Safe-by-default Rollout

| Schritt | Was | Auto-Wirkung |
|---|---|---|
| **P2a — Stats + Empfehlung** | `orchestrator_auto_policy` (leer=manual) + Readiness-Query + Admin-Panel (nur Anzeige + Flip-Buttons, aber `ORCHESTRATOR_AUTO_ENABLED=false`) | **0** — reine Sichtbarkeit |
| **P2b — Auto-Maschinerie** | Cron-Verzweigung + `buildTaskFromProposal`-Extraktion + Rate-Cap + Regressions-Monitor. Kill-Switch bleibt `false`. | **0** — schlafend |
| **P2c — Scharfschalten** | `ORCHESTRATOR_AUTO_ENABLED=true` + Admin graduiert *einen* Typ mit belegter Quote | erst hier läuft Auto, per-Typ |

P2a+P2b sind gefahrlos mergebar (nichts auto). P2c ist ein bewusster Betriebsschritt nach Datenlage — kein Code-Deploy, nur ENV + ein Admin-Flip.

---

## 10 · Offene Entscheidungen (Review mit Aaron)

1. **Schwelle:** Quote ≥ 0.80 + ≥ 30 Entscheidungen — passt, oder konservativer (0.85/50)?
2. **Fenster:** letzte 30 Entscheidungen vs. letzte 60 Tage — welche Basis für die Quote?
3. **Regressions-Trigger:** bad_rate > 0.30 über letzte 20 Auto-Tasks — passt die Schärfe?
4. **Rate-Cap:** max N Auto-Tasks/Lauf — Zahl? (Vorschlag: 10.)
5. **„Schlechter Auto-Task"-Definition:** welche `tasks`-Endzustände zählen als Regression (storniert/gelöscht — welche noch)? Beim Bau gegen echtes tasks-Schema festzurren.

---

## 11 · Success-Kriterien

- Admin sieht pro `(typ,rolle)` echte Quote + Entscheidungszahl; [Graduieren] nur ab Schwelle aktiv.
- Nach Graduierung eines task-Typs (+ Kill-Switch on): der Cron erzeugt für diesen Typ Tasks **auto**, byte-identisch zum Admin-Approve-Pfad, voll auditiert (`auto_ausgefuehrt`, `erzeugte_task_id`, trigger_event).
- Nicht-graduierte Typen + escalation/next_step: unverändert Shadow-Mode.
- Qualitäts-Regression flippt einen Typ nachweislich zurück auf manual + alertet.
- Kill-Switch `false` ⇒ 0 Auto, egal welche Policy-Zeilen. Health zeigt Auto-Rate + Auto-Qualität.
- Compliance: keine kundengerichtete/fall-entscheidende Auto-Aktion; Graduierung menschlich.

---

## 12 · Referenzen
- Phase-1-Spec: `docs/superpowers/specs/2026-07-05-ai-claim-orchestrator-design.md`
- Phase-1-Plan/Code: `docs/superpowers/plans/2026-07-05-ai-claim-orchestrator-poc.md`, `src/lib/orchestrator/*`
- Wiederverwenden: `createLinkedTask` (`src/lib/tasks/create-task.ts`), `annehmenVorschlag`-Mapping (`src/app/admin/ai-vorschlaege/actions.ts`), Health-Registry (`src/lib/health/checks/`)
- Compliance: `src/content/legal/datenschutz.md:343`
- **Voraussetzung:** Phase 1 muss in Prod laufen + Entscheidungsdaten gesammelt haben, bevor P2c sinnvoll ist.
