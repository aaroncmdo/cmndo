# WS6 — Reduced-Repair Loop-Closure + Kunde-Beleg-Download — Design & Spec

**Datum:** 2026-07-11
**Branch:** `kitta/repair-loop-closure` (off `kitta/kunde-claim-detail-rebuild` @ `1ed1ac48d` — s. §11 Basis-Entscheidung)
**Herkunft:** Übernahme der inaktiven 3724ced2-Lane (Aaron 11.07.: „327 ist nicht mehr aktiv, übernimm du … unbedingt mit auf, sauber").
**Vorgänger-Spec:** `docs/superpowers/specs/2026-07-08-reduced-repair-onboarding-selbstzahler-kasko-design.md` (WS1–WS6-Gesamtbild; WS1–WS5 sind inzwischen gebaut — s. §2).

---

## 1 · Ziel (eine Zeile)

Den unbetreuten Selbstzahler-/Kasko-frei-Reparatur-Claim **operativ zu Ende bringen**: Werkstatt schließt die Reparatur ab + lädt die Schlussrechnung → Claim schließt automatisch + Werkstatt-Provision wird abgerechnet → **der Kunde lädt sein Beleg-Paket herunter** (KVA + Rechnung + Fotos) für seinen Versicherer — plus Ops-Sichtbarkeit + Nudge-Antrieb, damit nichts still verrottet.

## 2 · Ist-Stand (verifiziert gegen Live-Code, nicht die 2-Tage-alte Spec)

Ein 3-Agenten-Audit (11.07.) gegen den `werkstatt-auftrag-view`-Worktree (= staging + Kunde-Detail-Rebuild) ergab: **WS1–WS5 sind im Wesentlichen fertig** (die alte „GAP"-Tabelle ist stale). Die echte Baustelle ist **WS6**.

| WS | Ist-Stand | Beleg |
|---|---|---|
| WS1 Aktivierung (`abrechnungsweg` ableiten) | ✅ DONE | PR #3985, `convert-lead-to-claim.ts:506` |
| WS2 Kasko-frei | ✅ DONE | Mig `20260708185733_add_freie_werkstattwahl_to_leads.sql`; `FlowQualiStep.tsx:136-169` Folgefrage; `quali-flow-outcome.ts:36-50` Routing; `istWerkstattReparaturWeg` an allen Gates, `istReparaturOnly` retired; unit-getestet |
| WS3 Schadenfotos | 🟡 PARTIAL | `leads.schadensfoto_urls`→`fall_dokumente`-Plumbing (`flow/[token]/actions.ts:1036-1097`) + Kunde-Portal-`SchadensfotoUploadCard` fertig; nur die Erfassung *während* des Early-Cut-Onboardings fehlt (Kunde lädt post-onboarding im Portal) — **akzeptiert, nicht Teil von WS6** |
| WS4 Kunde-KVA | ✅ DONE | `KostenvoranschlagCard` + Werkstatt-KVA-Modal |
| WS5 Feststellung-Trim + Pflichtdok | ✅ DONE | Pflichtdok-Szenario `selbstzahler`/`kasko` (`pflicht-dokumente.ts:11,36-37`, ZB1-only); Feststellung via Early-Cut übersprungen (`FlowQualiStep.tsx:52-64` → `erzeugeSelbstzahlerClaim` → `FlowWizardKfz.tsx:534-538` Sprung auf `account`) |
| **WS6 Loop-Closure** | ❌ **offen** | s. §3 |

## 3 · WS6 — die 4 offenen Enden (verifiziert)

- **6a Repair-Status → Ops:** `reparatur_termine.status` wird nie in `claims.operative_status`/`v_claim_workstate` gespiegelt. `state-machine.ts:20-49` (`FALL_STATUS_TRANSITIONS`) hat keine Reparatur-Phase → ein Selbstzahler-Claim hängt für Ops unsichtbar in `ersterfassung`. `derive-claim-workflow-state.ts:16-55` liest nur `main_phase/sub_phase` — 0 Reparatur-Awareness.
- **6c Nudge-Cron:** `api/cron/repair-reminders/route.ts` ist **fertig gebaut** (3 Kohorten: keine-Werkstatt ≥24h, Termin-angefragt >48h, Termin-vorbei-nicht-erledigt; idempotent via `mitteilungen`-Marker; filtert `kundenbetreuer_id IS NULL`), aber **dormant** — nicht im VPS-crontab registriert (Header :24-27), feuert nie (404).
- **6d Abschluss + Provision (LINCHPIN):** **niemand setzt je `reparatur_termine.status='erledigt'`** (Werkstatt-Actions schreiben nur bestaetigt/anruf_erbeten/abgelehnt; Kunde nur angefragt). `fall-abschluss/route.ts:26-31` verlangt `status='zahlung-eingegangen'` + `schlussabrechnung_am` → eine Reparatur erreicht das nie → Claim hängt offen. `release-werkstatt-provisionen/route.ts:99-108` gibt Provision auf blindem `hold_until`-Timer frei — **nicht an die tatsächliche Reparatur gekoppelt** (Umsatz-/Integritäts-Risiko).
- **6e Beleg/Rechnung:** keine `reparaturrechnung`-Spalte/Dokument-Typ; `WerkstattAuftragDetail.tsx` bietet nur KVA-Upload, **kein** „Reparatur abgeschlossen" + **kein** Schlussrechnungs-Upload; im Kunde-Bereich **kein** Beleg-/Rechnungs-Download.

## 4 · Der geschlossene Loop (Ziel-Datenfluss)

```
Vermittlung (Provision entsteht)
  → KVA (Werkstatt lädt hoch)                     [DONE]
  → Reparaturtermin angefragt → bestätigt          [DONE]
  → ▸ Werkstatt: „Reparatur abgeschlossen" + Schlussrechnung   ◀ NEU (6d/6e)
  → ▸ Claim auto-close (operative_status=abgeschlossen)         ◀ NEU (6d)
  → ▸ Werkstatt-Provision freigegeben (an Completion gekoppelt) ◀ NEU (6d)
  → ▸ Kunde lädt Beleg-Paket (KVA + Rechnung + Fotos)          ◀ NEU (6e)
  ( ▸ Ops sieht die Reparatur-Phase durchweg                    ◀ NEU (6a) )
  ( ▸ Nudge-Cron treibt bei Steckenbleibern                     ◀ NEU (6c) )
```

**Abschluss-Trigger (Aaron 11.07., entschieden):** **Werkstatt-getrieben** — die Werkstatt drückt „Reparatur abgeschlossen" + lädt die Schlussrechnung; das löst Auto-Close + Provisions-Freigabe aus. Wenig Friktion (die Werkstatt ist der Partner, der die Provision verdient). Kunde-Bestätigung ist bewusst **kein** Gate (unbetreut → würde hängen bleiben); der Nudge-Cron ist der Backstop. Eine spätere Kunde-„Reparatur erhalten?"-Bestätigung ist ein optionales Add-on, nicht Teil dieses Vorhabens.

## 5 · Datenmodell (Regel 2 — `apply_migration`, nie raw `execute_sql`)

| Feld | Aktion | Begründung |
|---|---|---|
| `fall_dokumente.dokument_typ = 'reparaturrechnung'` (neuer String-Wert) | Schlussrechnung als `fall_dokumente`-Zeile, `sichtbar_fuer` inkl. `kunde` | Konsistent mit KVA (`kostenvoranschlag`) + Gutachten; reuse Storage + signed-URL-Maschinerie; **kein** neuer Datei-Column nötig |
| `reparatur_termine.erledigt_am timestamptz` (nullable) + `erledigt_von uuid` (nullable) | markiert die Fertigstellung = Trigger-Zeitpunkt für Close + Provision | `status='erledigt'` existiert schon im Enum (`reparatur-termin-phase.ts:1`); der Zeitstempel + Actor sind für Audit + Provisions-Kopplung nötig |

`dokument_typ` ist ein freier String (keine DB-Enum-Constraint — belegt durch bestehende Werte `kostenvoranschlag`/`gutachten`/`schadensfoto`), daher ist `reparaturrechnung` additiv ohne DDL an einer Enum. **Nur** die zwei `reparatur_termine`-Spalten brauchen `apply_migration`.

## 6 · Slice 1 — Close-Loop + Beleg (das geldkritische Herz)

Jede Unit hat einen klaren Zweck, eine schmale Schnittstelle, ist isoliert testbar.

### 6.1 Werkstatt-Abschluss-Action *(Werkstatt-Portal — meine Fläche, ex-3724ced2)*
- **Neu:** `src/app/werkstatt/(shell)/auftraege/reparatur-abschluss-actions.ts` — `reparaturAbschliessen(claimId, formData)`:
  1. Schlussrechnung → Storage-Upload → `fall_dokumente` (`dokument_typ='reparaturrechnung'`, `sichtbar_fuer` inkl. `kunde`) via bestehende `lib/dokumente/upload.ts`-Maschinerie.
  2. `reparatur_termine`: `status='erledigt'`, `erledigt_am=now()`, `erledigt_von=<werkstatt-user>`.
  3. ruft `schliesseReparaturClaim()` (6.2) + Provisions-Freigabe (6.3).
  - Result-Object `{ ok, error? }`, `revalidatePath` werkstatt + kunde. Non-kritische Sends (Notify Kunde) in try/catch.
- **UI:** `WerkstattAuftragDetail.tsx` — Sektion „Reparatur abschließen" (Schlussrechnung-Upload wie KVA + Bestätigungs-Button), sichtbar wenn `reparatur_termine.status='bestaetigt'` (Termin bestätigt, Reparatur läuft).

### 6.2 Repair-Closure *(pure + Action — geteilte Kern-Logik)*
- **Neu (pure, TDD):** `src/lib/werkstatt/repair-closure.ts` — `istReparaturClaimAbschliessbar(claim, termin): boolean` (Guard: Reparatur-Weg + Termin erledigt + noch nicht abgeschlossen) + der Ziel-Zustand.
- **Close-Pfad:** `operative_status → 'abgeschlossen'` + `abgeschlossen_am` + `geschlossen_grund='reparatur_erledigt'` — ein **eigener** Repair-Closure-Pfad, NICHT über `zahlung-eingegangen`/`fall-abschluss` (das ist der VS-regulierte Pfad).
- ⚠ **470d55c9-Naht:** die Transition nach `abgeschlossen` läuft über `state-machine.ts` (`transitionFallStatus`). Wir prüfen, ob eine direkte `ersterfassung`→`abgeschlossen`-Transition erlaubt ist; falls die state-machine das nicht hergibt, koordinieren wir die neue Repair-Closure-Transition mit 470d55c9 (deren `deriveClaimWorkstate`-Muster spiegeln, nicht forken).

### 6.3 Provision-Release an Completion koppeln *(457ab612-Naht)*
- Heute: `release-werkstatt-provisionen/route.ts` gibt auf blindem `hold_until`-Timer frei (unabhängig davon, ob repariert wurde).
- **Ziel:** die Werkstatt-Provision wird **bei `reparatur_termine.status='erledigt'`** freigegeben (pending→freigegeben), nicht auf Timer.
- **Umsetzung:** `reparaturAbschliessen` ruft die bestehende Release-Logik gezielt für diese Provision auf (oder setzt den Completion-Marker, den der Release-Cron respektiert). ⚠ `partner_provisionen`/`release-werkstatt-provisionen` = **457ab612-Lane** → Marker + Interface-Abstimmung, bevor wir deren Release-Gate ändern. Der Timer bleibt als Fallback für Nicht-Reparatur-Provisionen.

### 6.4 Kunde-Beleg-Download *(mein Kunde-Claim-View — Rebuild-Zonen)*
- **Neu:** `src/components/kunde/claim-view/BelegePaketCard.tsx` — **claim-type-aware** Download-Card, gerendert in `DoksTermineZone` (bzw. `GeldZone` für Reparatur-Claims):
  - **Reparatur-Claim** (`vm.flags.istReparaturRoute`): KVA (`kostenvoranschlag`) + **Schlussrechnung** (`reparaturrechnung`) + Schadenfotos (`schadensfoto`) — je als signierter Einzel-Download.
  - **Normal-/SV-Claim** (Aaron-Zusatz 11.07., *konsistent dieselbe Card*): **Gutachten** (schon downloadbar via `GutachtenPdfButton`) + **SV-Rechnung** — s. §10 offener Punkt zur SV-Rechnung-Form.
- **Loader:** `vm.werkstatt`/`vm.doks.dokumente` (Rebuild-ViewModel) liefert die Dokumente schon; die Card leitet die Download-Liste aus `dokumente` nach `dokument_typ` ab (reine Ableitung). Kein neuer DB-Call, wenn die Doks bereits im vm sind; sonst additiver Read.
- **YAGNI:** MVP = Einzel-Downloads (signierte URLs). Ein ZIP-Bundle („alles herunterladen") ist ein optionales späteres Add-on, **nicht** MVP.

## 7 · Slice 2 — Ops-Sichtbarkeit + Cron-Aktivierung

### 7.1 Repair-Phase → Ops *(6a — 470d55c9-Naht)*
- **Neu (pure, TDD):** `src/lib/werkstatt/repair-workstate.ts` — `deriveRepairPhase(claim, termin): RepairPhase` aus `reparatur_werkstatt_id` + `reparatur_termine.status`: `werkstatt-wahl-offen` → `termin-angefragt` → `reparatur-laeuft` (bestätigt) → `abgeschlossen` (erledigt).
- **Spiegeln:** diese Phase in die Ops-Sicht (`derive-claim-workflow-state.ts` / `v_claim_workstate`) einhängen, damit Reparatur-Claims nicht mehr unsichtbar in `ersterfassung` hängen. ⚠ **470d55c9-Naht** — deren Ableitungs-Muster spiegeln; Interface-Review vor dem Merge.

### 7.2 Nudge-Cron aktivieren *(6c — VPS-Ops)*
- Der Cron `api/cron/repair-reminders/route.ts` ist fertig. **Aktivierung = VPS-crontab-Registration** (kein Code) — Runbook analog zur `compute-partner-rang`-Cron-Aktivierung. ⚠ **VPS-Ops-Lane** (35660476/8882732e). Als Runbook-Schritt dokumentiert + an die Deploy-Lane übergeben; nach Aktivierung Smoke (Cron feuert, `cron_jobs_audit`-Eintrag, Nudge-`mitteilungen`).

## 8 · Cross-Lane-Karte

| Was | Wer | Modus |
|---|---|---|
| Werkstatt-Abschluss-Action + Schlussrechnung-Upload (6.1) | **ich** (ex-3724ced2-Werkstatt-Fläche) | selbst |
| Repair-Closure-Logik + DDL `reparatur_termine.erledigt_*` (6.2) | **ich** | selbst |
| Kunde-Beleg-Download-Card (6.4) | **ich** (Rebuild-Zonen) | selbst |
| `dokument_typ='reparaturrechnung'` (§5) | **ich** | selbst (additiv) |
| state-machine Repair-Closure-Transition (6.2) | 470d55c9 | **koordinieren** (Marker + Interface-Review) |
| Repair-Phase in `v_claim_workstate` (7.1) | 470d55c9 | **koordinieren** (Muster spiegeln) |
| Provision-Release-Kopplung (6.3) | 457ab612 | **koordinieren** (Marker, Release-Gate) |
| Nudge-Cron VPS-crontab (7.2) | 35660476/8882732e (VPS/Deploy) | **Runbook übergeben** |

**Isolation:** eigener Branch `kitta/repair-loop-closure`. Neue, fokussierte Files (`reparatur-abschluss-actions.ts`, `repair-closure.ts`, `repair-workstate.ts`, `BelegePaketCard.tsx`) minimieren Berührung fremder Dateien; die 3 Nähte oben werden per Marker/Review abgestimmt, nicht einseitig getrampelt.

## 9 · Testing

- **Pure/TDD:** `repair-closure.ts` (`istReparaturClaimAbschliessbar` — Guard-Matrix) + `repair-workstate.ts` (`deriveRepairPhase` — alle 4 Phasen + Kanten) mit vitest RED→GREEN.
- **Action:** `reparaturAbschliessen` — Result-Object, Upload+Status+Close+Provision-Verkettung, Fehlerpfade (Upload-Fail, nicht-abschließbar) — gemockt.
- **Ratchets:** token-audit/component-set/status-registry/knip 0-neu; UI-Strings mit Umlauten.
- **Prod-Smoke:** am bestehenden Reparatur-Demo-Claim `29dd7ad5` (Selbstzahler + Werkstatt SMOKE Köln + bestätigter Termin, aus dem Gegentest): Werkstatt schließt ab → Claim `abgeschlossen` + Provision freigegeben + Kunde-Beleg-Download sichtbar/ladbar. Nur Test-Accounts.

## 10 · Sequenzierung

1. **DDL** (`reparatur_termine.erledigt_am/_von`) via `apply_migration` + Migration-File committen (Version ablesen, §Regel 2).
2. **Pure-Logik** (repair-closure + repair-workstate, TDD) — keine Abhängigkeiten.
3. **Werkstatt-Abschluss-Action + UI** (6.1) — nutzt 6.2.
4. **Provision-Kopplung** (6.3) — nach 457ab612-Abstimmung.
5. **Kunde-Beleg-Download** (6.4) — in den Rebuild-Zonen.
6. **Ops-Repair-Phase** (7.1) — nach 470d55c9-Abstimmung.
7. **Cron-Runbook** (7.2) — an VPS-Lane.
8. **Prod-Smoke** über den ganzen Loop.

Slice 1 (1–5 + 8) ist der geldkritische, weitgehend self-contained Kern; Slice 2 (6–7) ist die cross-lane Sichtbarkeit/Antrieb.

## 11 · Offene Grounding-Punkte (im Plan zu klären, KEINE Blocker)

- **SV-Rechnung-Form:** existiert die SV-Honorar-Rechnung schon als downloadbares `fall_dokument` (dann in 6.4 nur surfacen) oder ist sie ein Parallel-Gap (dann analog zur Werkstatt-Schlussrechnung ein SV-Upload)? Grounding: `gutachter/abrechnung/page.tsx` + `finance/fall-finanzen.ts` existieren (SV-Abrechnung), aber der Kunde-Download-Pfad ist zu prüfen. Entscheidungskriterium: existiert `fall_dokumente`-Zeile mit SV-Rechnung + `sichtbar_fuer` inkl. kunde → surfacen; sonst als Slice-1.5-Sub-Task (SV lädt Rechnung, analog Werkstatt).
- **state-machine-Transition:** erlaubt `state-machine.ts` eine direkte Transition nach `abgeschlossen` aus dem Reparatur-Zustand, oder braucht es eine neue Transition (→ 470d55c9)?

## 12 · Basis-Entscheidung (Branch)

WS6 basiert auf `kitta/kunde-claim-detail-rebuild` (nicht direkt `staging`), weil die **Kunde-Beleg-Download-Card** in die **rebuilt Zonen** gehört (die nur auf diesem Branch existieren; PR #4084 pending). Der Rebuild merged vor WS6-Fertigstellung → beim Rebuild-Merge rebased WS6 auf `staging` (die dann die Zonen trägt). Der Werkstatt-/Ops-/Cron-/Provision-Teil ist staging-kompatibel; nur die Kunde-Card hängt am Rebuild.

## 13 · Koordination (Marker)

Marker an **470d55c9** (state-machine + v_claim_workstate repair-phase), **457ab612** (Provision-Release-Kopplung), **VPS-Lane** (Cron-crontab) werden vor Berührung der jeweiligen geteilten Fläche geschrieben. Ursprung + Kontext: [[coordination-an-3724ced2-kunde-detail-reparatur-zonen]] · [[coordination-reduced-repair-onboarding-selbstzahler-kasko]] · [[handoff-kunde-detail-golive]].

**⚠️ 6c630247-Naht (werkstatt-flowlink-haftpflicht, PR #4099) — nachgetragen 11.07. (Aaron-Hinweis):** Diese WS6-Lane ist die **Fortsetzung** der 6c630247-Reparatur-Termin-Lifecycle (T1–T10: angefragt→werkstatt_vorschlag→bestaetigt + Rückruf). WS6 fügt `bestaetigt→erledigt→Close→Provision→Beleg` hinzu. **4 additive Berührungen ihrer aktiven Files:** `notify-kunde-reparaturtermin.ts` (+`erledigt` neben ihrem +`werkstatt_vorschlag`), `WerkstattAuftragDetail.tsx` („Reparatur abschließen"@`status='bestaetigt'` — distinkt von ihrem `aktionOffen`), `reparatur_termine` (+`erledigt_am`, eigene Mig), `kunde-claim-view.ts` (`schlussrechnungUrl` adjazent zu ihrer offenen Task 11). WS6 baut grounded gegen ihre Files (via `git show`), löst die additiven Konflikte als Downstream beim staging-Merge. **ACK ihrer Task 11** (an 62dd5486=diese Session adressiert) — bleibt ihre (braucht ihren `reparaturPhaseErreicht`-Helper). Marker: [[coordination-an-6c630247-ws6-repair-loop-closure-overlap]] · [[coordination-werkstatt-hp-tasks-11-13-remaining]].
