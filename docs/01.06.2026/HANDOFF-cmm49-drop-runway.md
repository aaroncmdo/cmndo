# HANDOFF — CMM-49 faelle-Drop-Runway (Stand 01.06.2026, EOD)

> **Für die nächste Session.** Diese Lane (Session `cmm-49-t1-2-cutover`) hat heute die §6.5-fall_status-Reader-Strecke abgeschlossen, die b″-Engine-Entscheidung getroffen, **die Ownership der faelle-Drop-Runway übernommen**, den Stand live-revalidiert (die Linear-Labels logen) und den ersten Reader-Sweep-Brick geliefert. Hier steht alles + was du JETZT tust.

---

## 0. Verbindliche Referenzen (IMMER zuerst lesen)

| Doc | Pfad | Was |
|---|---|---|
| **North-Star** (Datenmodell-SSoT) | `docs/superpowers/specs/2026-05-31-claimondo-datenmodell-northstar.md` (PR #2118) | DIE Datenmodell-Referenz. claims-God-Table-Dekomposition, Lifecycle (claims.status + Sub-Entity + v_claim_phase abgeleitet), eine Engine, text+CHECK statt Enums, can_access_claim. |
| **Master-Plan** (faelle-Komplett-Removal) | `docs/superpowers/plans/2026-05-31-cmm49-faelle-komplett-removal-master-plan.md` (PR #2118) | Die verbindliche Reststrecke. Phasen **A** (Heimat) → **B** (5 Views) → **C** (Reader ~338) → **D** (Writer ~40) → **E** (fall_id-Tod + Route) → **F** (Trigger/Fn/29 RLS) → **G** (DROP, Aaron-gated). |
| **Drop-Runway Live-Revalidierung** | `docs/01.06.2026/faelle-drop-runway-live-revalidation.md` (PR #2184) | Der **de-driftete** Stand gegen die Live-DB (heute geschrieben). Per-View-Blocker, Homing-Status, sichere Reihenfolge. |
| **b″-Entscheidungsvorlage** | `docs/01.06.2026/T1.2-b-cutover-decision.md` (PR #2176) | Warum b″ (Engine-faelle.status-Write-Stopp) in den Drop gefaltet ist + das Engine-Cursor-Re-Base-Design. |
| **T1.2-Cutover-Handoff** | `docs/31.05.2026/T1.2-claims-status-cutover-handoff.md` | Die b‴/d/§6.5-Strecke (Vorgeschichte). |
| **Operative-States-Plan** | `docs/superpowers/plans/2026-05-31-track1-2-operative-states-rehoming.md` | §D3-Engine-Umbau-Design (für b″/CMM-74). |

**Master-Plan-Verortung:** „Track 1 / T1.x" (Lifecycle/fall_status) war das Subframing dieser Lane; es entspricht im Master-Plan dem Lifecycle-Slice von **Phase C+D gegen §A7**. Der faelle-Drop selbst ist **Phasen A–G** des Master-Plans, getrackt unter **CMM-49**.

---

## 1. Was diese Session geliefert hat (01.06.)

### 1a · §6.5 fall_status-Reader-Cutover — KOMPLETT, auf prod
Alle `faelle.status`-**Reader** auf die abgeleitete Phase (`v_claim_phase` main/sub_phase bzw. `claims.status`):
- **b‴** Backfill (0-Row) + **d-rest** (Display-Badges + abgeschlossen-KPIs) → PR #2160 (merged+prod).
- **CMM-69** (#2167) PHASE_VISIBLE_SECTIONS + Edit-Lock + Server-Gate · **CMM-70** (#2164) SV-Subphase-Stepper · **CMM-72** (#2169) gutachter/abrechnung · **CMM-71** (#2175→#2178) makler — **alle merged + auf main/prod**.
- **b′** (additiver `claims.status`-Dual-Write in `transitionFallStatus`) ist **live + verifiziert** (#2151/#2153): Mapping pure + 26 Tests, c-Konsistenz live bewiesen (alle 8 Werte von `v_claim_phase` erkannt). `claims_status_set=0` nur weil alle 76 Claims pre-regulierung sind.
- ⇒ **`faelle.status` hat 0 Produkt-Reader mehr.** Der einzige verbleibende Consumer ist der **Write** in der Engine (= b″/CMM-74).

### 1b · b″-Entscheidung (CMM-74 angelegt)
b″ = `transitionFallStatus` hört auf, `faelle.status` zu schreiben (state-machine.ts Z.172-173). **Kein 1-Zeilen-Drop:** die Engine ist `fall_status`-NATIV — liest `fall.status` als eigenen Transition-**Cursor** (Z.69) + validiert gegen den 19-Enum-Graphen (Z.76-81). Write stoppen ohne Cursor-Re-Base ⇒ nächster Übergang bricht. Mapping ist lossy (13 aktive Werte → claims.status=null). **Aaron-Entscheidung: b″ in die Drop-Runway falten** (kein vorgezogener ⚠️SM-Rewrite). Design in #2176.

### 1c · Drop-Runway-Ownership + Tracking de-driftet
- **CMM-49** (DROP) + **CMM-66** (Views) standen fälschlich auf „Done" (GitHub-Release-PR-Artefakt) → **zurück auf In Progress**. faelle existiert (75 Rows), nie gedroppt.
- **CMM-74** neu = diskretes b″-Ticket (blockt CMM-49).

### 1d · Live-Revalidierung (#2184) — die Labels logen
- **75 faelle-Rows**, **47 FKs** auf `faelle.id`, **5 Views**, **421 `.from('faelle')` in 223 Files / 32 Writes**.
- **KEIN sauberer Freebie:** `v_claim_listing.fall_id` ist load-bearing (admin-Kanban Detail-Link + kanzlei_faelle/Message-Joins + Kanban-FILTERT-Rows-ohne-fall_id-raus + `/faelle` linkId).
- **Homing ist trivial:** organisation_id/dispatch_id/auszahlung_kunde_*/bank_name = **0 Daten**, gegner_* = **0** (claim_parties hat nur geschaedigter, 0 verursacher), halter meist nur der Bool, kunde_id/source haben Homes (geschaedigter_user_id / leads). ⇒ **Der Drop ist überwiegend eine CODE-Migration, nicht Daten-Homing.**

### 1e · Erster Reader-Sweep-Brick (#2187)
`admin/faelle/(hub)/page.tsx` Supplement-Query `.from('faelle')` → `.from('claims')` (keyed claim_id; mandatsnummer via kanzlei_faelle(claim_id)-Embed). **File ist jetzt `.from('faelle')`-tabellenfrei.** Verifiziert: Kollision clean, Daten-äquivalent (mandatsnummer 0 Mismatch, lead_id 2/75 SSoT-Delta), PostgREST-Embed-FK adversarial bestätigt, tsc grün. **Etabliert das wiederholbare Reader-Sweep-Pattern** (siehe §4).

---

## 2. Der wahre Stand (live-gemessen 01.06., paizkjajbuxxksdoycev)

```
faelle:            75 Rows  (NICHT gedroppt)
FKs auf faelle.id: 47       (alte fall_id-FKs + additive claim_id-FKs nebeneinander)
Views an faelle:   5        v_claim_listing, faelle_sv_view, faelle_kunde_view,
                            v_claim_full, v_faelle_mit_aktuellem_termin
Code:              421 .from('faelle') / 223 Files / 32 Writes (~389 Reads)
claims.status:     77/77 NULL (pre-launch, Terminal-Achse)
```

**Per-View-faelle-Blocker** (aus `view_column_usage`):
| View | #faelle-Spalten | echter Blocker |
|---|---|---|
| v_claim_listing | 2 (claim_id, id→fall_id) | **nur fall_id-Tod** |
| faelle_sv_view | 9 | fall_id + kunde_id/status-Repoint (Homes da) |
| faelle_kunde_view | 11 | + auszahlung_kunde_* (0 Daten) |
| v_claim_full | 13 | + gegner_*/org/dispatch (0 Daten) |
| v_faelle_mit_aktuellem_termin | **53** | das Monster, zuletzt |

---

## 3. Sichere Reihenfolge (de-driftet — Master-Plan A–G, live-präzisiert)

- **A — Homing-Löcher:** quasi geschenkt (Daten pre-launch-leer). Wo nötig additive claims-Spalte/Sub-Entity + EXCEPT-0/0. NICHT der Engpass.
- **B — 5 Views faelle-frei** (CMM-66 Teil 2): pro View, sobald dessen Spalten gehomed + fall_id-Tod erledigt ist.
- **C — fall_id-Tod (DER KEYSTONE, Phase E im Master-Plan):** Detail-Route `/faelle/[id]`→`claim_id` (CMM-28) + die fall_id-Joins (kanzlei_faelle/nachrichten/fall_read_state/mitteilungen/Uploads/RPC) → claim_id + Kanban-Filter. Entsperrt v_claim_listing + viele der 389 Reader.
- **D — Reader/Writer-Sweep** (421/32) auf claims/Views. **Hier läuft der Reader-Sweep (§4), unabhängig von C startbar für File die NUR `.from('faelle')` lesen (nicht fall_id-Identity).**
- **E — b″ Engine-Cutover (CMM-74)** + `v_claim_phase` operative sub_phase (5 Rest-Zustände). Braucht Termin-Engine-Koordination (geteilte View).
- **F — 47 FKs entfernen + 29 RLS-Policies + tote Trigger.**
- **G — `DROP TABLE faelle CASCADE`** (Aaron-gated, voller Portal-Smoke Kunde/SV/KB/Admin/Kanzlei).

---

## 4. WAS DU JETZT TUST (nächste Session)

**Modus = inkrementell-koordiniert (Aaron 01.06.).** Kein Freeze der anderen Lanes; isolierte/additive Bricks zuerst, geteilte Flächen pro Stück abgestimmt. **Kein `DROP TABLE` ohne explizites Aaron-Go.**

### Primär: Reader-Sweep weiter batchen (Phase D)
Es gibt **~389 `.from('faelle')`-Reads in 223 Files**. Viele lesen nur Duplikat-Spalten (auf claims/`v_claim_full` vorhanden) und sind trivial repointbar — wie #2187. **Batch sie** (5–10 pro PR, nach Domäne gruppiert).

**Reader-Sweep Verify-Pattern (VERBINDLICH, pro Brick):**
1. **Kollisions-Check:** `git log --all --since="3 days ago" -- <file>` + `git diff --stat origin/staging...<jede-offene-kitta-branch> -- <file>` → keine offene Divergenz. (8 Sessions aktiv — §7.)
2. **Daten-Äquivalenz live** (execute_sql): die claims/View-Quelle liefert dieselben Werte wie der faelle-Read (EXCEPT-0/0 bzw. Mismatch-Count). Bei Spalten mit Home-unter-anderem-Namen (kunde_id→geschaedigter_user_id) den Mismatch zählen.
3. **Adversarial:** wenn ein PostgREST-**Embed** off claims genutzt wird (`claims.select('...x(...)')`), die FK-Constraint `x_claim_id_fkey → claims` per `pg_constraint` prüfen — **tsc fängt Runtime-Embed-Fehler NICHT**.
4. **tsc grün** (`npx tsc --noEmit`; next build OOMt im Worktree).
→ Branch `kitta/cmm49-readersweep-<bereich>` **off origin/staging**, PR gegen staging, Merge-Session merged.

**Hilfreich:** `grep -rn "from('faelle')" src/` und nach Domäne clustern (admin/dispatch/kunde/sv/kanzlei). Reine Duplikat-Reader zuerst; fall_id-Identity-Reader (Route/Joins) NICHT hier — die gehören zu C.

### Sekundär (koordiniert): fall_id-Tod (Phase C / CMM-28) anstoßen
Der größte Einzel-Unlock, aber **kontestiert** (Fallakte-Routing = 939-/Fallakte-Lane-Terrain). **Vor jedem Touch der Detail-Route `/faelle/[id]` oder der Fallakte: mit der 939-/Fallakte-Lane abstimmen** (SendMessage an Peers geht NICHT zuverlässig → über Aaron + Marker). Die fall_id-Joins zu Sub-Entities (nachrichten/tasks/etc.) haben dank FK-Re-Key bereits `claim_id` und sind isoliert repointbar.

### Gegated, NICHT jetzt: b″ (CMM-74)
Braucht (a) `v_claim_phase` operative sub_phase (5 Rest-Zustände filmcheck/qc/vs-kuerzt/nachbesichtigung/anschlussschreiben → mit **Termin-Engine-Session** `kitta/unisone-termin-engine` abstimmen, sie ownt die View) + (b) state-machine.ts = **Single-Toucher** (vor jedem Commit Re-Check + 939-Koordination). Erst NACH Reader-Sweep + nahe am Drop.

---

## 5. Verbindliche Lektionen / Fallen

- **Label-vs-Body-Drift:** Linear-„Done" ≠ fertig (CMM-49/66 logen; CMM-63/64/65 als „Done" gelabelt, aber Spalten nicht gehomed). **IMMER live gegen DB/Code prüfen** ([[feedback_pr_state_nicht_production_stand]], [[feedback_information_schema_check]]).
- **Geteilte prod+staging-DB:** nur additiv, EXCEPT-0/0, DDL **nur** via Supabase-Plugin (`apply_migration`, Twin-Drift beachten — AGENTS Regel 2). `execute_sql` nur READ.
- **CHECK nie enger als der älteste laufende Writer** (T1.1c-Prod-Breaker-Lektion).
- **PostgREST-Embed adversarial prüfen** (FK-Constraint), nicht nur tsc.
- **state-machine.ts = Single-Toucher** (⚠️SM). 01.06. verifiziert: kein 939-Branch hat es committed angefasst.
- **Write-Tool-Pfad-Falle:** Im Multi-Worktree-Setup schreibt das Write-Tool manchmal in den Haupt-Repo-Pfad statt den Worktree — nach Write `ls` im Worktree prüfen, ggf. cp + rm. (`</content>`-Artefakt-Scan ebenfalls — [[feedback_write_tool_content_artifact]]).

---

## 6. Tickets + PRs (Stand 01.06. EOD)

**Linear (Team Claimondo Migration, Parent CMM-44):**
- **CMM-49** (DROP) — In Progress (Owner: Drop-Runway-Lane). blockedBy: CMM-66, CMM-74, + Homing-Reste.
- **CMM-66** (5 Views faelle-frei) — In Progress (Teil 2 offen).
- **CMM-74** (b″ Engine-Write-Stopp) — Backlog, blockt CMM-49.
- **CMM-67** (Halter→claim_parties) — Backlog (75 Rows, aber meist nur ist_fahrzeughalter-Bool; Daten sparse).
- CMM-69/70/71/72 — **Done** (prod). CMM-73 (v_claim_phase begutachtung) — **Done** (Termin-Engine-Session).

**PRs (Merge-Session landet build-grüne):**
| PR | Was | Status |
|---|---|---|
| #2176 | b″-Entscheidungsvorlage (Doc) | merged staging |
| #2184 | Drop-Runway Live-Revalidierung (Doc) | offen |
| #2187 | Reader-Sweep #1: admin-Kanban-Supplement → claims | offen |
| #2175→#2178 | CMM-71 makler (prod) | merged main |

---

## 7. Koordination — die parallelen Lanes (Stand 01.06. EOD)

| Branch / Session | Terrain | Kollisions-Relevanz für Drop |
|---|---|---|
| `kitta/aar-939-monika-embed` (mehrere) | Monika-Embed, leads, parties, Fallakte | **hoch** — parties + Fallakte-Route (fall_id-Tod) |
| `kitta/unisone-termin-engine` | **v_claim_phase**, gutachter_termine, Termin-Engine | **hoch** — b″-Prereq (v_claim_phase) ist ihre View |
| `kitta/aar-939-embed-b-cascade-6b` | embed-B Claim-Kaskade | mittel — claims-Lifecycle direkt |
| `kitta/dispatch-leads-config-unify` | dispatch/leads | niedrig |
| `kitta/sv-onboarding-audit` | SV-Onboarding/Billing | niedrig |
| `kitta/personal-cleanup` | personal-DB-Cleanup | niedrig |

**Regel:** vor dem Anfassen geteilter Flächen (parties, v_claim_phase, Fallakte-Route, state-machine.ts) Kollisions-Check + Abstimmung. Marker unter `…/.claude/projects/…/memory`. SendMessage an Peers ist unzuverlässig → über Aaron.

---

## 8. Einstieg für dich (TL;DR)
1. North-Star + Master-Plan + #2184 lesen.
2. `git fetch origin` + **live** prüfen (DB-Stand + welche der 8 Lanes was anfassen) — NICHT auf Memory/Labels vertrauen.
3. **Reader-Sweep batchen** (Phase D, Pattern §4) — der sichere, parallelisierbare Hauptstrom.
4. fall_id-Tod (CMM-28) nur koordiniert anstoßen.
5. b″/CMM-74 + Views/CMM-66 bleiben gated. DROP = Aaron-Go.
