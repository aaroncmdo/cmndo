# A2 — State-Machine (Ist + Soll)

> Fundament-Paket A2 (FUNDAMENT.md §3). Ist-Register aller `operative_status`-Schreibstellen (+ Nebenachsen) und die Soll-Übergangstabelle. **Reine Doku — kein Code, keine Writer-Umbauten** (Nicht-Ziele §3·A2). Speist C1 (transitionClaim).

**Quelle:** `origin/main` @ `a24285c3d` (Ist-Erhebung im frischen Worktree; Haupt-Checkout ist stale). **Prod-Werte:** Supabase-MCP READ 28.07.2026.

---

## 0 · Kernbefund

1. **Es GIBT bereits einen Single-Writer:** `transitionFallStatus` (`src/lib/faelle/state-machine.ts`) validiert gegen die Matrix, schreibt `claims.operative_status` an genau **einer** Stelle (`:239`) und feuert die Pflicht-Effekte (Timeline, `phase_transitions`, `fall.status_changed`-Event, SLA, Billing, Auto-Tasks). C1 muss ihn nicht erfinden — nur **die Umgeher einsammeln**.
2. **6 direkte WILD-Writes umgehen die Engine** (kein Event/keine Timeline). 5 sind im Ratchet-Baseline/Allowlist bekannt; **einer ist unsichtbar** — `sv-zuweisung/route.ts:284` entgeht dem Scanner (Type-Cast bricht die Regex). Das ist der wichtigste C1-/Gate-Befund.
3. **Legacy-Achsen sind retired:** `claims.status` (T3-S4) und `faelle.status` (CMM-74/AAR-939) haben **0 Live-Writer** in `src/**`. Es leben nur `operative_status` + 3 Nebenachsen (`reparatur_termine.status`, `kanzlei_faelle.status`, `claim_payments.status`).
4. **Prod-Anomalien:** 1 Claim mit `operative_status = NULL` (Engine wirft bei NULL-Cursor → nicht transitionierbar); `termin_durchgefuehrt`/`reguliert_vollstaendig`/`verjaehrt`/`abgelehnt_final`/`an_externe_kanzlei_uebergeben` sind **Fine-Terminals, die KEINE Matrix-Ziele sind** — sie entstehen nur über Direkt-/Allowlist-Writer (endzustand-actions, close-nur-gutachter, kanzlei-wunsch).

---

## 1 · Die Engine (Single-Writer)

**`src/lib/faelle/state-machine.ts` — `transitionFallStatus(fallId, newStatus, metadata?)`** (async, `void`, **wirft** bei ungültigem Übergang — NICHT Result-Pattern).
- **Cursor** = aktueller `claims.operative_status`, claim-nativ via `faelle_claim_bridge` gelesen (`:130-155`; AAR-939, kein `faelle`-Read mehr). NULL-Cursor → hard throw (`:159`).
- **Der EINE Write:** `:239` `claimsUpdate.operative_status = resolveCursorOperativeStatus(newStatus, currentStatus)` → `.from('claims').update(...)` (`:249-253`) — inkl. `klage`→`klage_rechtsstreit`-Konvergenz + Terminal-Clobber-Guard.
- **`claims.status`/`faelle.status` werden NICHT geschrieben** (retired, `:172-178`, `:230-237`).
- **Timestamps** (via `peel*Columns`/`splitOrKeepFaelleUpdate` an claims/auftraege/kanzlei_faelle geroutet): `status_changed_at`, `storniert_am`/`storno_grund`, `abgeschlossen_am`/`geschlossen_grund`, `kanzlei_uebergeben_am`, `anschlussschreiben_am`, `regulierung_am`, `vs_reaktion_*` (`:180-217`).
- **Pflicht-Effekte je Übergang** (= das, was C3/A3 später über die Outbox garantieren muss): `touch_claim_recency`-RPC (`:262`) · Timeline-Insert `typ:'status-change'` (`:307`) · `phase_transitions`-Insert `via:'transitionFallStatus'` (`:317`, non-critical) · **Events** via `emitEvent` (`fall.storniert`/`kanzlei.uebergabe`/`fall.status_changed`, `:334-360`) · LexDrive-Kanzlei-Mail bei `kanzlei-uebergeben` (`:363`) · SLA `completeSla`/`startSla` (`:377-430`) · `processCaseBilling` bei `gutachten-eingegangen`|`abgeschlossen` / `revertCaseBilling` bei `storniert` (`:432-475`) · Auto-Task `mietwagen-klaeren` bei `besichtigung`|`begutachtung-laeuft` (`:478-528`) · `claim_payments`-Upsert bei `zahlung-eingegangen` (`:271`).
- Exportiert zusätzlich **`istGueltigerFallUebergang(from,to)`** (pure Pre-Check, `:91-97`) + **`FALL_STATUS_TRANSITIONS`**.

**`src/lib/faelle/reparatur-cursor.ts`** — Selbstzahler/Kasko-Abschluss-Helper, läuft **durch** `transitionFallStatus` (funnel-konform): `advanceReparaturCursorTo` (forward-only, gated auf `abrechnungsweg ∈ {selbstzahler,kasko}`, `:96-137`), `closeReparaturClaimViaEngine` (→ `reparatur-erledigt`→`abgeschlossen`, `:146-185`). `REPARATUR_LANE = [reparatur-werkstatt-suche, reparatur-angefragt, reparatur-laeuft, reparatur-erledigt]`.

---

## 2 · Ist-Register — `operative_status`-Writer

### A · THROUGH-ENGINE (rufen `transitionFallStatus` → volle Effekt-Menge oben)

| file:line | Auslöser | Wert |
|---|---|---|
| `api/cron/fall-abschluss/route.ts:37` | Cron Fall-Abschluss | `abgeschlossen` |
| `api/cron/no-show-timeout/route.ts:71` | Cron No-Show | `storniert` |
| `faelle/[id]/_actions/filmcheck.ts:123` | KB Filmcheck→Handoff | `kanzlei-uebergeben` |
| `faelle/[id]/_actions/kanzlei-paket.ts:193` | KB Anschlussschreiben | `anschlussschreiben` |
| `faelle/[id]/_actions/kanzlei-paket.ts:239` | KB Zahlungseingang | `zahlung-eingegangen` |
| `faelle/[id]/_actions/prozess.ts:220` | KB/Admin Klage | `klage` |
| `flotte/(shell)/fahrzeug/[id]/actions.ts:136` | FM Storno | `storniert` |
| `gutachter/fall/[id]/actions.ts:94` | SV Gutachten-Upload | `gutachten-eingegangen` |
| `gutachter/kalender/actions.ts:128` | SV Termin bestätigt | `sv-termin` |
| `gutachter/team/actions.ts:90` | Org-Lead Team-Zuweisung (#4579-Funnel) | `sv-zugewiesen` |
| `lib/actions/dispatch-fall-actions.ts:75` | Dispatch Status-Action | `newStatus` (var) |
| `lib/actions/storno-actions.ts:52,60,171,352,375` | SV-24h/spät/no-show/reklamation/admin | `storniert` |
| `lib/actions/sv-lead-ablehn-actions.ts:93` | SV lehnt Lead ab | `sv-gesucht` |
| `lib/autoPhase.ts:104` | Auto-Phase-Advancer | `next` (var) |
| `lib/lexdrive/process-event.ts:762` | LexDrive-Webhook (validierter Pfad) | `newStatus` (var) |
| `lib/task-executor/apply.ts:60` | Task-Executor Status-Task | `neuerStatus` (var) |
| `lib/termine/actions.ts:72,475` | Besichtigung-Start / Gutachten via Termin | `begutachtung-laeuft` / `gutachten-eingegangen` |

**Über `reparatur-cursor` (funnel-konform):** `kunde/faelle/[id]/reparatur-termin-actions.ts:123`→`reparatur-laeuft` · `werkstatt/(shell)/auftraege/actions.ts:201`→`reparatur-laeuft` · `werkstatt/(shell)/auftraege/reparatur-abschluss-actions.ts:128`→`closeReparaturClaimViaEngine` · `lib/werkstatt/vermittlung-server.ts:179`→`reparatur-angefragt`.

### B · DIRECT `.from('claims').update({operative_status})` (Allowlist + WILD) — siehe §7

### C · INSERT (initialer Cursor, legitim ungegatet)

| file:line | Auslöser | Wert |
|---|---|---|
| `lib/leads/convert-lead-to-claim.ts:441` | Lead→Claim-Konversion | `sv-termin`\|`ersterfassung` |
| `lib/smoke/lifecycle-seed.ts:190` | Admin Smoke-Seed | je Phase abgeleitet |

---

## 3 · Ist-Transition-Matrix (`FALL_STATUS_TRANSITIONS`, verbatim)

```
ersterfassung            → sv-gesucht, sv-zugewiesen, sv-termin, reparatur-werkstatt-suche, reparatur-angefragt, storniert
onboarding               → ersterfassung, reparatur-werkstatt-suche, storniert
reparatur-werkstatt-suche→ reparatur-angefragt, storniert
reparatur-angefragt      → reparatur-laeuft, reparatur-erledigt, storniert
reparatur-laeuft         → reparatur-erledigt, storniert
reparatur-erledigt       → abgeschlossen, storniert
sv-gesucht               → sv-zugewiesen, sv-termin, storniert
sv-zugewiesen            → sv-termin, sv-gesucht, storniert            (Rückkante: SV-Lead-Ablehnung)
sv-termin                → besichtigung, begutachtung-laeuft, sv-gesucht, storniert
besichtigung             → begutachtung-laeuft, gutachten-eingegangen, storniert
begutachtung-laeuft      → gutachten-eingegangen, storniert
gutachten-eingegangen    → filmcheck, gutachten-eingegangen, storniert
filmcheck                → kanzlei-uebergeben, gutachten-eingegangen, storniert
qc-pruefung              → kanzlei-uebergeben, gutachten-eingegangen, storniert
kanzlei-uebergeben       → anschlussschreiben, storniert
anschlussschreiben       → regulierung-laeuft, nachbesichtigung-laeuft, vs-abgelehnt, vs-kuerzt, regulierung, klage, storniert
regulierung              → zahlung-eingegangen, nachbesichtigung-laeuft, abgeschlossen, storniert
regulierung-laeuft       → zahlung-eingegangen, nachbesichtigung-laeuft, vs-abgelehnt, vs-kuerzt, klage, storniert
in_kommunikation_vs      → zahlung-eingegangen, nachbesichtigung-laeuft, vs-abgelehnt, vs-kuerzt, klage, abgeschlossen, storniert   [Cursor-Wert, B4-slice-1b]
abgelehnt                → zahlung-eingegangen, nachbesichtigung-laeuft, vs-kuerzt, klage, abgeschlossen, storniert                 [nicht-terminal!]
vs-kuerzt                → nachbesichtigung-laeuft, regulierung-laeuft, vs-abgelehnt, klage, storniert
nachbesichtigung-laeuft  → regulierung-laeuft, vs-abgelehnt, klage, storniert
vs-abgelehnt             → klage, storniert
klage                    → abgeschlossen, storniert
klage_rechtsstreit       → abgeschlossen, storniert                    [Cursor-Wert, Klage-Terminal-Konvergenz]
zahlung-eingegangen      → abgeschlossen
abgeschlossen            → (terminal)
storniert                → (terminal)
```

⚠ **`qc-pruefung`** ist Matrix-Key, hat aber **keine eingehende Kante** (kein Vorgänger listet es als Ziel) → toter Knoten in der Ist-Matrix (Soll-Frage: soll `filmcheck` optional nach `qc-pruefung` statt direkt `kanzlei-uebergeben`?). Ebenso ist **`regulierung`** nur von `anschlussschreiben` erreichbar, während `regulierung-laeuft` die reichere Reaktions-Achse trägt — zwei Regulierungs-Zustände, deren Abgrenzung unscharf ist.

---

## 4 · Soll-Tabelle (Zustand × Event → Folgezustand + Pflicht-Effekte)

Das operative **Soll** je Übergang (Journey-Bibel A1 verfeinert Prosa; hier die Maschinen-Sicht). Effekt-Klassen: **N** = Notification (Kanal/Template → A3), **T** = Task, **S** = Doc-Slot, **E** = Event/Timeline (feuert die Engine schon). „Trigger" = der Writer aus §2.

| Von | Event (Trigger §2) | Nach | Pflicht-Effekte (Soll) |
|---|---|---|---|
| — (Anlage) | Intake `createCase`/convert-lead | `ersterfassung` | E · S(Pflichtdok) · N(Kunde: Erstbestätigung + FlowLink) — heute in C2/Intake, nicht Engine |
| `ersterfassung` | Dispatch/SV-Zuweisung | `sv-gesucht`\|`sv-zugewiesen` | E · N(SV: Auftrag) · T(Dispatch bei kein-SV, →J10) |
| `ersterfassung` | Selbstzahler→Werkstatt | `reparatur-werkstatt-suche` | E · N(Kunde: Werkstattwahl) |
| `sv-zugewiesen` | SV bestätigt Termin | `sv-termin` | E · N(Kunde: Termin) |
| `sv-termin` | Besichtigung-Start | `begutachtung-laeuft` | E · T(mietwagen-klaeren, Engine) |
| `begutachtung-laeuft` | SV lädt Gutachten | `gutachten-eingegangen` | E · N(Kunde+**Werkstatt**: Gutachten-Ready — heute LÜCKE, A3) · Billing(processCaseBilling) |
| `gutachten-eingegangen` | QC/Filmcheck-OK | `filmcheck`→`kanzlei-uebergeben` | E · N(Kanzlei: Paket, Engine-Mail) · SLA(Kanzlei) |
| `kanzlei-uebergeben` | KB Anschlussschreiben | `anschlussschreiben` | E · N(VS) |
| `anschlussschreiben` | VS-Reaktion (Webhook/KB) | `regulierung(-laeuft)`\|`vs-kuerzt`\|`vs-abgelehnt`\|`nachbesichtigung-laeuft`\|`klage` | E · N(Kunde+Kanzlei: VS-Reaktion) |
| `regulierung`/`in_kommunikation_vs` | Zahlungseingang | `zahlung-eingegangen` | E · `claim_payments`(erhalten, Engine) · N(Kunde: Geld) |
| `zahlung-eingegangen` | Abschluss | `abgeschlossen` | E · N(Kunde: Abschluss + Bewerten/Reklamation) |
| `reparatur-erledigt` | Werkstatt Schlussrechnung | `abgeschlossen` | E · S(Schlussrechnung, idempotent — #4799) · N(Kunde: Beleg) |
| beliebig (nicht-terminal) | Storno (SV/KB/FM/Kunde/DSGVO) | `storniert` | E(`fall.storniert`) · `revertCaseBilling` · N(betroffene Rollen) — →J7 |

**Terminal-Endzustände (via Direkt-/Allowlist-Writer, NICHT Matrix-Ziele):** `reguliert_vollstaendig`, `verjaehrt`, `abgelehnt_final`, `an_externe_kanzlei_uebergeben`, `termin_durchgefuehrt` (nur_gutachter/Embed-B-Autoclose). C1-Soll: entweder als Matrix-Ziele aufnehmen oder als dokumentierte Cursor-Endzustände behalten (heute Letzteres, `endzustand-actions.ts`).

*Vollständige Zellen (Kanal/Template) kommen aus **A3** (Notification-Matrix) — dort ist die N-Spalte aufzulösen.*

---

## 5 · Nebenachsen (gaten Phasen-Ableitung, eigene Status-Domäne)

| Achse | Writer (file:line) | Werte |
|---|---|---|
| **`reparatur_termine.status`** | `kunde/…/reparatur-termin-actions.ts:56/101` · `werkstatt/…/auftraege/actions.ts:60/72/164/265` · `…/reparatur-abschluss-actions.ts:149` | `angefragt`→`werkstatt_vorschlag`→`bestaetigt`→`erledigt` / `abgelehnt` |
| **`kanzlei_faelle.status`** (Mandat) | `lib/kanzlei-fall/upsert-kanzlei-fall.ts:55` · `kanzlei-wunsch/actions.ts:152` · `auftrag/qc.ts:90` · `kanzlei-fall/actions.ts:92` (Auszahlung) | `versicherungskontakt` → … → `auszahlung` |
| **`claim_payments.status`** (Zahlung) | Seam `lib/faelle/claim-payments.ts:58/64`; Caller: `state-machine.ts:277`, `endzustand-actions.ts:217`, `kanzlei-paket.ts:380`, `stammdaten.ts:586/601`, `process-event.ts:943/959/966` | `ausstehend\|teilweise\|erhalten\|final\|abgelehnt` |
| *angrenzend* | `gutachter_termine.status` (`termine/actions.ts:456`, `close-nur-gutachter-termin.ts:50`) · `auftraege.status` (`auftrag/qc.ts:72`) | → `abgeschlossen` |

`claims.status` + `faelle.status`: **RETIRED, 0 Live-Writer** (nur Test-Fixtures). ⚠ Stale: `manual-status-override.ts`-Header sagt noch „faelle.status", schreibt aber `operative_status`.

---

## 6 · Prod-Wertabdeckung (MCP READ 28.07.)

`ersterfassung` 13 · `storniert` 4 · `kanzlei-uebergeben` 2 · `termin_durchgefuehrt` 1 · `sv-termin` 1 · `abgelehnt` 1 · **`NULL` 1**. Alle Nicht-NULL sind Matrix-Keys **außer `termin_durchgefuehrt`** (Fine-Terminal via close-nur-gutachter). **`NULL`-Zeile = Anomalie:** die Engine wirft bei NULL-Cursor (`:159`) → dieser Claim ist nicht mehr transitionierbar (Backfill-Kandidat, C1/DECISIONS).

---

## 7 · WILD-Liste (C1-Arbeitsvorrat) + Scanner-Lücke

Direkte `operative_status`-Writes, die die Engine umgehen (kein `fall.status_changed`-Event, keine Timeline außer wo vermerkt):

| # | file:line | Wert | Ratchet-Status |
|---|---|---|---|
| 1 | `lib/kanzlei-wunsch/actions.ts:345` | `an_externe_kanzlei_uebergeben` | Baseline (grandfathered); hat Timeline, kein Event |
| 2 | `lib/kanzlei-wunsch/actions.ts:415` | `an_externe_kanzlei_uebergeben` | Baseline; Timeline, kein Event |
| 3 | `lib/kanzlei-wunsch/actions.ts:591` | `regulierung` | Baseline (cast-Form) |
| 4 | `lib/kanzlei-wunsch/actions.ts:664` | `in_kommunikation_vs` | Baseline (Smoke-Seed) |
| 5 | `lib/termine/close-nur-gutachter-termin.ts:83` | `termin_durchgefuehrt` | Baseline; kein Event/Timeline |
| **6** | **`app/api/sv-zuweisung/route.ts:284`** | **`sv-gesucht`\|`sv-zugewiesen`** | **⚠ NICHT im Baseline, NICHT Allowlist — Scanner-blind** |

**Allowlist** (`check-operative-status-writes.mjs`): `state-machine.ts` (Engine), `claims/endzustand-actions.ts` (Cursor-Ausnahme, 6 Terminals + 2 Nicht-Terminals), `lexdrive/process-event.ts` (`manual_status_override`, bewusst validierungsfrei).

### ⚠ Scanner-Evasion-Befund #6 (der eine wirklich neue Fund)
`sv-zuweisung/route.ts:284` schreibt `;(claimsUpd as Record<string, unknown>).operative_status = …` und dann `.from('claims').update(claimsUpd)`. Der Scanner (`operative-status-write-scan.mjs`, `traced-assign`) matcht nur `IDENT.operative_status =` **unmittelbar angrenzend** — der `as Record<…>`-Cast zwischen `claimsUpd` und `.operative_status` bricht das Match; der `const claimsUpd = {…}`-Initializer hat keinen `operative_status:`-Key → `traced-object` greift auch nicht. **Ergebnis: 0 Scanner-Treffer → unsichtbar für den Ratchet + fehlt im Baseline.** Es schreibt `sv-gesucht`/`sv-zugewiesen` ohne Timeline/`phase_transitions`/Event — exakt die Klasse, die das Gate fangen soll. AGENTS sagt „sv-zugewiesen wurde #4579 gefunnelt" — das fixte aber nur `gutachter/team/actions.ts:90`; diese **Dispatch-API-Route** schreibt weiter direkt.

---

## 8 · Befunde für DECISIONS/C1 (in A2 bewusst NICHT gefixt — §0.2 Scope-Zaun)

- **B-#6:** Scanner-Lücke `sv-zuweisung/route.ts:284` — der Cast-Pfad umgeht `operative-status-write-scan.mjs`. C1: Writer funneln + Scanner um die cast-getrennte Assign-Form härten. (Marker: [[coordination-an-status-achsen-lane-werkstatt-abschluss-bypass]])
- **NULL-Cursor-Claim** (1 auf prod): nicht transitionierbar → Backfill auf `ersterfassung` o.ä.
- **Fine-Terminals außerhalb der Matrix** (`reguliert_vollstaendig`/`verjaehrt`/`abgelehnt_final`/`an_externe_kanzlei_uebergeben`/`termin_durchgefuehrt`): C1 entscheidet, ob Matrix-Ziele oder dokumentierte Cursor-Endzustände.
- **`qc-pruefung`** = eingehende Kante fehlt (toter Matrix-Knoten); **`regulierung` vs `regulierung-laeuft`** unscharf abgegrenzt.
- **Stale Kommentar** `manual-status-override.ts`-Header („faelle.status").

**DoD-Status:** jeder gefundene Writer ist einem Soll-Event zugeordnet ODER als WILD markiert (§2/§7); Soll deckt jeden prod-Wert (§6, inkl. NULL-Anomalie + termin_durchgefuehrt); Effekt-Spalte verweist auf A3 (N-Zellen).
