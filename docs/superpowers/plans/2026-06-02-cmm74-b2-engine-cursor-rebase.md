# CMM-74 b″ — Engine-Cursor-Re-Base + `faelle.status`-Write-Stopp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (oder subagent-driven-development) task-by-task. Steps nutzen Checkbox-Syntax.
>
> ⚠️ **PROD-BREAKER-KLASSE (`state-machine.ts` = Single-Toucher ⚠️SM).** Vor dem `state-machine.ts`-Commit: 939-Lane-Re-Check (Skript in §0) **+ SendMessage an die 939-Lane über Aaron** (PFLICHT, CMM-74). Geteilte prod+staging-DB.
>
> **GATE 0 (Design-Fork, §2):** Der Engine-Cursor-Re-Base hat eine echte Architektur-Entscheidung (A vs B). **Track-1 (`kitta/track1-2-operative-rehoming`, ownt die Engine + baute b′) + Aaron müssen die Variante freigeben, bevor Task 3+ startet.**

**Goal:** `transitionFallStatus` hört auf, `faelle.status` zu schreiben (der letzte `faelle.status`-Writer), ohne die Transition-Validierung oder einen Side-Effect zu brechen — entkoppelt die Engine von der zu droppenden `faelle`-Spalte.

**Architecture:** Der `faelle.status`-Wert ist ein **privater Engine-Cursor mit 0 externen Readern** (§6.5 abgeschlossen). b″ verlegt diesen Cursor weg von `faelle.status`. Der Transition-Graph (`FALL_STATUS_TRANSITIONS`) + alle `newStatus`-getriggerten Side-Effects (SLA/Billing/Notifications/Webhooks) bleiben unverändert; nur **Cursor-Quelle (Z.69)** und **Cursor-Senke (Z.173 `status`-Feld)** ändern sich.

**Tech Stack:** Next.js 16 Server-Actions, Supabase (admin-client), TS. Prereq erledigt: `v_claim_phase` exponiert die 5 operativen sub_phase (PR #2233, Migration `20260602083708`).

**Vorgelesen (engine-grounded, Stand staging 02.06.):** `src/lib/faelle/state-machine.ts` (Z.18-47 Graph, 49-455 Engine), `src/lib/claims/lifecycle.ts` (Parity-Resolver, `ClaimSubPhase` closed union), `docs/01.06.2026/T1.2-b-cutover-decision.md`, CMM-74 (Contract + b″-Prep-Kommentar).

---

## §0 — Pre-Flight (vor jedem Task)

- [ ] **939-Single-Toucher-Re-Check** (muss 0 sein für die 939-Lanes):
```bash
for b in kitta/aar-939-monika-embed kitta/aar-939-embed-b-cascade-6b; do \
  echo "$b: $(git rev-list --count origin/staging..origin/$b -- src/lib/faelle/state-machine.ts) commits"; done
# Erwartet: beide 0. (Track-1 = 1 = gemergtes b′, erwartet.) Bei >0 auf 939: STOP, Aaron.
```
- [ ] **Aaron brokert SendMessage an 939-Lane** „b″ fasst state-machine.ts an" — Bestätigung abwarten.
- [ ] **GATE 0 (§2) freigegeben** (Track-1 + Aaron: Variante A oder B).

---

## §1 — TS-Parity: `ClaimSubPhase` +5 (spiegelt PR #2233)

> Schließt das Parity-Gate (`getClaimLifecycle` ↔ `v_claim_phase`). Kein Engine-Touch → **keine 939-Koordination nötig**, kann sofort starten. Pre-launch 0-Daten → kein Live-Risiko.

### Task 1: `ClaimSubPhase`-Union + Labels + `mainPhaseOf` erweitern

**Files:**
- Modify: `src/lib/claims/lifecycle.ts:29-54` (Type), `:99-117` (`SUBPHASE_LABEL`), `:141-146` (`mainPhaseOf`)

- [ ] **Step 1: Union erweitern** (`lifecycle.ts`, nach `:39 kanzlei_uebergabe`-Block und im Regulierungs-Block):
```typescript
  // CMM-74 b″: operative Begutachtungs-Sub-States (aus auftraege.erstgutachten)
  | 'filmcheck'
  | 'qc-pruefung'
  // CMM-74 b″: operative Regulierungs-Sub-States (aus kanzlei_faelle / nachbesichtigung)
  | 'vs-kuerzt'
  | 'anschlussschreiben'
  | 'nachbesichtigung-laeuft'
```
(`filmcheck`/`qc-pruefung` in den Auftrag-Block bei `gutachten`; die 3 anderen in den Regulierungs-Block bei `nachforderung`.)

- [ ] **Step 2: `SUBPHASE_LABEL` +5** (`:99-117`, deutsche Labels mit Umlauten — UI-sichtbar):
```typescript
  filmcheck: 'Filmcheck',
  'qc-pruefung': 'QC-Prüfung',
  'vs-kuerzt': 'VS-Kürzung',
  anschlussschreiben: 'Anschlussschreiben',
  'nachbesichtigung-laeuft': 'Nachbesichtigung läuft',
```

- [ ] **Step 3: `mainPhaseOf` +5** (`:141-146`):
```typescript
  if (sub === 'filmcheck' || sub === 'qc-pruefung') return 'begutachtung'
  if (sub === 'vs-kuerzt' || sub === 'anschlussschreiben' || sub === 'nachbesichtigung-laeuft') return 'regulierung'
```
(vor dem finalen `return 'abschluss'` einfügen, nach den bestehenden begutachtung/regulierung-Zeilen.)

- [ ] **Step 4: tsc** — `npx tsc --noEmit` → erwartet: Fehler in den Consumern mit **exhaustivem** `Record<ClaimSubPhase, …>` / `switch` (= Task 2-Liste). Das ist gewollt (Typsystem treibt die Vollständigkeit).

### Task 2: `getClaimLifecycle`-Ableitung +5 (mirror der View-Precedence)

**Files:**
- Modify: `src/lib/claims/lifecycle.ts:148-235` (`getClaimLifecycle`)
- Test: `src/lib/claims/lifecycle.test.ts`

> **Precedence MUSS bitgleich zur View sein** (Migration `20260602083708`): abschluss > nachbesichtigung-laeuft > vs-kuerzt > anschlussschreiben(pre-lexdrive) > lexdrive-regulierung > status-regulierung > kanzlei_uebergabe > filmcheck/qc/gutachten > lead.

- [ ] **Step 1: Failing-Test** (`lifecycle.test.ts`) — 5 Szenarien, exakt die der View-Synthetik:
```typescript
it('b″: nachbesichtigung-laeuft bei aktivem nachbesichtigung-Auftrag', () => {
  const r = getClaimLifecycle({ lead: null, kanzleiFall: { status: 'versicherungskontakt', lexdrive_case_id: null } as any,
    auftraege: [{ typ: 'nachbesichtigung', status: 'termin' } as any], claimStatus: null })
  expect(r.mainPhase).toBe('regulierung'); expect(r.subPhase).toBe('nachbesichtigung-laeuft')
})
it('b″: vs-kuerzt bei kanzlei_faelle.vs_reaktion_typ=gekuerzt', () => {
  const r = getClaimLifecycle({ lead: null, kanzleiFall: { status: 'versicherungskontakt', vs_reaktion_typ: 'gekuerzt', lexdrive_case_id: null } as any, auftraege: [], claimStatus: null })
  expect(r.subPhase).toBe('vs-kuerzt')
})
it('b″: anschlussschreiben bei anschlussschreiben_am (pre-lexdrive)', () => {
  const r = getClaimLifecycle({ lead: null, kanzleiFall: { status: 'versicherungskontakt', anschlussschreiben_am: '2026-06-01', lexdrive_case_id: null } as any, auftraege: [], claimStatus: null })
  expect(r.subPhase).toBe('anschlussschreiben')
})
it('b″: filmcheck bei gutachten_url ohne filmcheck_ok', () => {
  const r = getClaimLifecycle({ lead: null, kanzleiFall: null, auftraege: [{ typ: 'erstgutachten', status: 'gutachten', gutachten_url: 'x', filmcheck_ok: null } as any], claimStatus: null })
  expect(r.subPhase).toBe('filmcheck')
})
it('b″: qc-pruefung bei filmcheck_ok=true', () => {
  const r = getClaimLifecycle({ lead: null, kanzleiFall: null, auftraege: [{ typ: 'erstgutachten', status: 'gutachten', gutachten_url: 'x', filmcheck_ok: true } as any], claimStatus: null })
  expect(r.subPhase).toBe('qc-pruefung')
})
```

- [ ] **Step 2: `npx vitest run lifecycle.test.ts`** → FAIL (subPhase noch `gutachten`/`versicherungskontakt`/`kanzlei_uebergabe`).

- [ ] **Step 3: Ableitung implementieren.** Voraussetzung: `AuftragRow` muss `gutachten_url`/`filmcheck_ok` führen, `KanzleiFallRow` muss `vs_reaktion_typ`/`anschlussschreiben_am` führen — falls nicht, in `src/lib/auftrag/queries.ts` + `src/lib/kanzlei-fall/queries.ts` zum SELECT/Type hinzufügen (additiv). In `getClaimLifecycle` VOR dem lexdrive-Block (`:166`) einfügen:
```typescript
  const aktiveNb = auftraege.find((a) => a.typ === 'nachbesichtigung' && a.status !== 'abgeschlossen')
  if (aktiveNb) return { mainPhase: 'regulierung', subPhase: 'nachbesichtigung-laeuft', aktiveSideQuests: sideQuests, aktiverAuftrag: aktiveNb }
  if (kanzleiFall?.vs_reaktion_typ === 'gekuerzt') return { mainPhase: 'regulierung', subPhase: 'vs-kuerzt', aktiveSideQuests: sideQuests, aktiverAuftrag: null }
  if (kanzleiFall?.anschlussschreiben_am && !kanzleiFall?.lexdrive_case_id) return { mainPhase: 'regulierung', subPhase: 'anschlussschreiben', aktiveSideQuests: sideQuests, aktiverAuftrag: null }
```
Und im begutachtung-Block (`:200-213`) den `subMap`-Zweig verfeinern:
```typescript
  if (erstgutachten && erstgutachten.status !== 'abgeschlossen') {
    let sub: ClaimSubPhase = erstgutachten.status === 'termin' ? 'termin' : erstgutachten.status === 'besichtigung' ? 'besichtigung' : 'gutachten'
    if (erstgutachten.status === 'gutachten') {
      if (erstgutachten.filmcheck_ok === true) sub = 'qc-pruefung'
      else if (erstgutachten.gutachten_url) sub = 'filmcheck'
    }
    return { mainPhase: 'begutachtung', subPhase: sub, aktiveSideQuests: [], aktiverAuftrag: erstgutachten }
  }
```

- [ ] **Step 4: `npx vitest run lifecycle.test.ts`** → PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(CMM-74): getClaimLifecycle +5 operative sub_phase (View-Parity)"`

### Task 3: Consumer-Sweep (tsc-getrieben)

**Files:** alle aus Task 1 Step-4-tsc-Fehlern. Bekannte exhaustive Consumer: `src/lib/fall/section-visibility.ts`, `src/lib/fall/phase-config.ts`, `src/lib/gutachter/subphase.ts`, `src/lib/fall/subphase-visibility.ts`.

- [ ] **Step 1:** Pro tsc-Fehler: dem `Record`/`switch` einen Eintrag für die 5 neuen sub_phase geben. **Default-Regel:** `filmcheck`/`qc-pruefung` erben die `gutachten`-Konfig (gleiche Sichtbarkeit/Sections); `vs-kuerzt`/`anschlussschreiben`/`nachbesichtigung-laeuft` erben die `versicherungskontakt`-Konfig. (Begründung im Commit: operativ identische Section-Sichtbarkeit, nur feinerer Phasen-Marker.)
- [ ] **Step 2: `npx tsc --noEmit`** → 0 Fehler.
- [ ] **Step 3: `npm run build`** (Routen/Server-Actions betroffen → voller Build, nicht nur tsc).
- [ ] **Step 4: Commit** `git commit -m "feat(CMM-74): sub_phase-Consumer +5 (gutachten/versicherungskontakt-Erbe)"`

---

## §2 — GATE 0: Engine-Cursor-Re-Base — Design-Fork (Track-1 + Aaron)

Der `faelle.status`-Cursor (Z.69 read, Z.173 write) hat **feinere Granularität als das Derivat** (`sv-gesucht`/`sv-zugewiesen`/`sv-termin` existieren VOR jedem Auftrag → `v_claim_phase` zeigt dort `erfassung/*`; aus dem Derivat NICHT rekonstruierbar — die „lossy"-Klasse aus dem Decision-Doc). Daher gibt es zwei Wege:

**Variante A — Cursor auf explizite `claims`-Spalte verlegen (MINIMAL-RISK, Interim).**
Neue additive Spalte `claims.operative_status text` (gleiches 19-Wert-Vokabular). Engine liest/schreibt dort statt `faelle.status`. **`FALL_STATUS_TRANSITIONS`-Graph + ALLE Side-Effects bleiben 1:1.** Blast-Radius minimal, `faelle.status`-Write stoppt sofort, kein Lossy-Problem.
- ✅ Sicherste b″, entkoppelt von `faelle` (Drop-ready).
- ➖ „Verschiebt" die Redundanz statt sie zu derivieren — North-Star (`v_claim_phase`-derived) erst mit einem späteren Schritt erreicht.

**Variante B — Cursor aus `v_claim_phase` + `claims.status` derivieren + Validierung verschlanken (NORTH-STAR-PUR, größer).**
Engine liest `currentStatus` aus dem Derivat; Transition-Validierung = claims-Terminal-Achse + Sub-Entity-State-Machines statt 19-Enum. Erfordert: die Dispatch-Feinstati (`sv-gesucht/-zugewiesen/-termin`) als Sub-Entity-/`work_state`-Concern zu re-homen (nicht mehr Engine-Cursor) → berührt Dispatch-Flows.
- ✅ Erreicht den North-Star (kein gespeicherter Operativ-Status).
- ➖ Großer Rewrite, berührt Dispatch, höheres Prod-Breaker-Risiko.

**Empfehlung:** **Variante A jetzt** (entsperrt den `faelle`-Drop sofort + minimal-risk), Variante B als separater Track-1-North-Star-Schritt nach dem Drop. — **Track-1 + Aaron bestätigen.**

> Tasks 4-6 unten = **Variante A**. Bei Wahl B: Tasks neu schreiben (Engine-Validierungs-Rewrite + Dispatch-Re-Home) — separater Plan.

---

## §3 — Engine-Cursor-Re-Base (Variante A)

### Task 4: `claims.operative_status` Spalte + Backfill (Plugin-Migration)

**Files:** Migration via `apply_migration` (Regel 2), File unter `supabase/migrations/<recorded>_cmm74_claims_operative_status.sql`.

- [ ] **Step 1: DDL schreiben + apply_migration** `name: cmm74_claims_operative_status`:
```sql
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS operative_status text;
COMMENT ON COLUMN public.claims.operative_status IS
  'CMM-74 b″: privater Engine-Transition-Cursor (19-Wert faelle.status-Vokabular). Ersetzt faelle.status als Cursor. 0 externe Reader.';
-- Backfill aus dem (noch existierenden) faelle.status:
UPDATE public.claims c SET operative_status = f.status
  FROM public.faelle f WHERE f.claim_id = c.id AND c.operative_status IS NULL;
```
- [ ] **Step 2: `list_migrations`** → recorded Version ablesen; File exakt so benennen (Twin-Drift §3+4).
- [ ] **Step 3: Verify (execute_sql READ):** `SELECT count(*) FILTER (WHERE operative_status IS NOT NULL) AS befuellt, count(*) AS total FROM claims;` → erwartet befuellt ≈ Anzahl claims mit faelle.
- [ ] **Step 4: Commit** Migration-File.

### Task 5: Engine liest/schreibt `claims.operative_status` statt `faelle.status`

**Files:** Modify `src/lib/faelle/state-machine.ts:61-69` (read), `:84-88`+`:171-173` (write).

- [ ] **Step 1:** Read-Quelle (Z.61-69): das `faelle`-Select um den Cursor aus claims erweitern + Fallback:
```typescript
  const { data: fall } = await db.from('faelle')
    .select('id, status, claim_id, claims:claim_id(status, operative_status)').eq('id', fallId).single()
  // ... claimRel-Normalisierung wie gehabt ...
  const claimRow = (Array.isArray(claimRel) ? claimRel[0] : claimRel) ?? null
  // CMM-74 b″: Cursor aus claims.operative_status; Fallback faelle.status (Legacy-Rows ohne Backfill)
  const currentStatus = (claimRow?.operative_status as string | null) ?? (fall.status as string)
```
- [ ] **Step 2:** Cursor-Senke. Den `status`-Write von `faelle` auf `claims.operative_status` umhängen. In `claimsUpdate` (vor Z.171) ergänzen:
```typescript
  if (claimId) claimsUpdate.operative_status = newStatus   // CMM-74 b″: Cursor-Senke
```
Und `status` aus `faelleUpdate` entfernen (Z.84: `status: newStatus` NICHT mehr ins faelle-update — der `splitOrKeepFaelleUpdate`/Peel-Pfad lässt sonst `status` auf faelle). Konkret: `update.status` (Z.85) streichen; `status_changed_at`/Timestamps bleiben (claims-duplicate-routed). **`claims.status` (b′ Dual-Write, Z.164-169) bleibt unverändert** — das ist der Lifecycle/Terminal, NICHT der Operativ-Cursor.
- [ ] **Step 3: `npx tsc --noEmit`** → 0 Fehler.
- [ ] **Step 4:** Synthetic Engine-Smoke (rollback-tx, wie PC-4): seed claim+fall (operative_status='gutachten-eingegangen'), `transitionFallStatus(fall, 'filmcheck')` aufrufen ist nicht rein-SQL → **Step 4 = Node-Script** `scripts/probe-b2-transition.mjs`: ruft `transitionFallStatus` gegen einen Seed-Fall, prüft danach `claims.operative_status='filmcheck'` UND `faelle.status` UNVERÄNDERT, dann cleanup (delete_fall_komplett). Gegen **staging**.
- [ ] **Step 5: Commit** (NACH §0-Gate + 939-SendMessage).

### Task 6: Side-Effect- + Caller-Erhalt verifizieren (kein Code, Audit)

> Alle Side-Effects keyen auf `newStatus` (nicht auf dem Cursor) → bleiben intakt. Verifizieren, nicht ändern:

- [ ] **SLA** (`:309-322` AAR-85, `:324-348` AAR-431 inkl. `vs-kuerzt`-Kürzungs-SLA) — keyen auf `newStatus`. ✓ unverändert.
- [ ] **Billing** (`:350-368` AAR-924, `:382-394` AAR-926) — `newStatus`. ✓
- [ ] **Notifications** (`:265-307`), **LexDrive-Email** (`:298-307`), **Auto-Task** (`:396-454`) — `newStatus`. ✓
- [ ] **Timeline/phase_transitions** (`:242-263`) — nutzen `currentStatus`+`newStatus`; `currentStatus` jetzt aus operative_status → identischer Wert. ✓
- [ ] **Direkte Webhook-Writer** (LexDrive/VS schreiben `vs-kuerzt`/`vs-abgelehnt` z.T. DIREKT auf faelle.status, NICHT über die Engine) — `grep -rn "status:.*'vs-kuerzt'\|status:.*'vs-abgelehnt'" src/` → jeder Direkt-Writer muss AUCH `claims.operative_status` setzen (sonst Cursor-Drift). Liste in §4 ergänzen + mit-fixen.
- [ ] **`checkFallAutoPhase`** (2 fire-and-forget Caller, grep) — falls es faelle.status liest → auf operative_status/claims umstellen.

---

## §4 — Caller-Sweep (Interface bleibt, intern absorbiert)

- [ ] `grep -rn "transitionFallStatus" src/` — alle Caller übergeben `fall_status`-Strings als `newStatus`; Interface unverändert (kleiner Blast-Radius). Verifizieren dass keiner DANACH `faelle.status` liest (alle §6.5-repointed).
- [ ] Direkte `faelle.status`-Writer außerhalb der Engine (Webhooks aus §3 Task 6) — auf `claims.operative_status` mit-schreiben.

---

## §5 — Smoke-Matrix (PFLICHT vor PR-Merge, gegen staging mit Screenshot)

- [ ] **Status-Übergänge** je Hauptpfad: ersterfassung→sv-termin→besichtigung→gutachten-eingegangen→filmcheck→kanzlei-uebergeben→anschlussschreiben→regulierung→zahlung→abgeschlossen. Nach jedem: `claims.operative_status` korrekt, `faelle.status` eingefroren, UI-Phase (v_claim_phase) korrekt.
- [ ] **Kürzungs-SLA:** Übergang →`vs-kuerzt` startet `kanzlei_kuerzung_antwort`-SLA (AAR-431).
- [ ] **Notification:** jeder Übergang emittet `fall.status_changed`; `kanzlei-uebergeben` triggert LexDrive-Email.
- [ ] **Billing:** →`gutachten-eingegangen` triggert `processCaseBilling`; →`storniert` triggert `revertCaseBilling`.
- [ ] **Portale** (Screenshot-Pflicht): Admin-Fallakte, SV-Fall, Kunde-Fall, Kanzlei-Kanban zeigen korrekte Phase nach Übergang.

---

## §6 — PR + Abschluss

- [ ] PR `--base staging`, Titel `feat(CMM-74): b″ Engine-Cursor-Re-Base (Variante A) — faelle.status-Write-Stopp`.
- [ ] 7-Punkte-Audit im Commit-Body. Smoke-Doc `docs/<DD.MM>/cmm74-b2-smoke.md` mit Screenshots.
- [ ] **Faelle.status-Write ist gestoppt** → in CMM-49-Master vermerken: Reader-Tail-status-Items (`case-billing-batch`, `release-makler-provisionen`, `api/email/send`, `api/gutachter/search`, `completion-signals`) sind jetzt entsperrt (lesen nichts Lebendiges mehr aus faelle.status; auf claims.operative_status / v_claim_phase repointen — separate Reader-Sweep-Tasks).

---

## Self-Review

- **Spec-Coverage:** CMM-74 „Was" (Z.173-Write-Stopp) = Task 5. „Warum nicht trivial" (Cursor-Stale) = Variante-A-Cursor-Verlegung löst es. „Prereq" = PR #2233 (done). „Cursor-Re-Base-Design 1-4" = §2 Variante B (deferred) / Variante A (gewählt). „Side-Effects" = Task 6. „Caller-Sweep" = §4. „Koordination" = §0. „Risiko/Smoke" = §5. ✅
- **Placeholder-Scan:** Webhook-Direkt-Writer-Liste (§3 Task 6 / §4) ist grep-zu-erzeugen — bewusst, da datenabhängig; der grep-Befehl ist konkret. Kein „TODO ohne Befehl".
- **Type-Konsistenz:** `operative_status` durchgängig; `ClaimSubPhase`-Werte = exakt die 5 der View (`vs-kuerzt`/`qc-pruefung` mit Bindestrich wie in der View, NICHT `vs_kuerzt`).
- **Offene Design-Entscheidung:** GATE 0 (A vs B) — explizit Track-1+Aaron, vor Task 4.
