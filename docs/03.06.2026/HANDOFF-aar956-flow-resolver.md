# HANDOFF — Dynamischer FlowLink / AAR-956 Resolver-Strecke

**Branch/Worktree:** `kitta/aar-956-flow-resolver` (off frischem staging) · `.claude/worktrees/aar-956-flow-resolver`
**PR:** #2374 (`--base staging`, OFFEN, alle Gates grün) — Teil 1 / Task-2-Backbone.
**Plan:** `docs/superpowers/plans/2026-06-03-dynamic-flowlink-anfrage-implementation.md`
**Spec:** `docs/03.06.2026/anfrage-wizard-flowlink-kanonik-spec.md`
**Stand:** 2026-06-03

---

## 0. WICHTIGSTE ERKENNTNIS — der Flag-Gate (vor allem anderen lesen)

`/flow/[token]/page.tsx:182`:
```ts
const needsBooking = !terminMitSv && process.env.CANONICAL_FLOWLINK_ENABLED === 'true'
```
Der **Resolver-/Buchungs-Pfad** (`istIncomplete` in `FlowWizardKfz`) ist hinter dem
**Go-Live-Flag `CANONICAL_FLOWLINK_ENABLED`** gegatet — laut Memory `aar956-canonical-golive`
**HELD** (Flip in BEIDEN Prod-ENVs nur auf Aarons explizites „go", nach TZ + grünem Re-Walk).

→ **Entscheidung dieser Session (bestätigt sinnvoll):** Tasks 1–6 **härten den flag-gegateten
kanonischen Pfad** — der Flag wird **NICHT** entkoppelt (das würde den gehaltenen Go-Live
vorzeitig aktivieren). Spec/Plan erwähnen den Flag nirgends als zu ändern. Wenn Aaron den
Resolver flag-unabhängig will, ist das eine separate Go-Live-Entscheidung.

**Konsequenz für Verify:** UI-Tasks (1/3/4) brauchen Staging-Smoke mit `CANONICAL_FLOWLINK_ENABLED=true`
(Re-Walk-Mechanik s. Memory `aar956-canonical-golive` — `/etc/claimondo-staging/.env.local` +
Symlink-Repoint + `pm2 reload`, VPS). Das ist koordiniert (shared Staging) — nicht solo mitten
in der Session flippen.

---

## 1. ERLEDIGT (PR #2374, commit 258bfd76c)

**Task-2-Backbone — eine Resolver-Quelle, verhaltensneutral:**
- **`src/lib/self-service/flow-resolver.ts` (neu):** reine `resolveFlowTerminState(input)` →
  `zeige_termin | buchen_fixer | buchen_global | ort_abfragen | disqualifiziert`. **Kein neues
  Matching** — delegiert konzeptionell an `matchAndSlots`/`findBestSV` (eine Quelle, Spec §1).
  Entscheidungs-Reihenfolge: `disqualifiziert → zeige_termin (hatTerminMitSv) → ort_abfragen
  (lat/lng null) → buchen_fixer (fixerSvId) → buchen_global`.
- **`__tests__/flow-resolver.test.ts` (neu):** 8 vitest, inkl. **Task-1-Zusicherung** „termin-loser
  Lead nie passiv".
- **`self-service-actions.ts:ladeMatchingFlow`:** Verzweigung jetzt aus dem Resolver; liefert
  typsicheres **`ortFehlt`**.
- **`FlowSlotStep.tsx`:** branched auf `r.ortFehlt` statt `error.includes('besichtigungsort')`.

Contract für Consumer:
```ts
import { resolveFlowTerminState, type FlowTerminState } from '@/lib/self-service/flow-resolver'
```

---

## 2. RESTSTRECKE — File+Line-Map (auf diesem Branch weiterbauen)

### Task 1 — Passiv-Texte killen → aktiver Resolver
- `FlowWizardKfz.tsx:563-567` — der `else`-Zweig (`gutachterAnzeige == null`) rendert die amber-Box
  `t('step_gutachter.kein_gutachter')` („Wir suchen gerade einen passenden Sachverständigen…").
  Im kanonischen Pfad (Flag on) bucht der User vorher im `termin`-Step → `gutachterAnzeige` gesetzt;
  der Passiv-Zweig ist v.a. Dispatcher-/Flag-off-Fall. **Fix:** statt Passiv-Box den Resolver/
  Buchungs-Step anbieten (bzw. Step-Routing), wenn kein SV/Termin.
- i18n `kein_gutachter`: `de.json:386` + `…pending`-Keys `de.json:4489` (+ en/tr/ru/pl/ar:386/4423).
- `TerminField.tsx:105` — „Wir suchen den passenden Gutachter für Sie …" (Lade-Text; der
  /anfrage-Pfad, Task-6-Territorium). `FlowSlotStep.tsx:76` ist nur transienter `laden`-Text = ok.
- `actions.ts:1258` — nur Kommentar (AAR-908 Auto-SV-Match in `signSAandCreateFall` weist Top-SV zu,
  damit Kunde keinen „wir suchen"-Zustand sieht — relevant für Task 5).

### Task 3 — Besichtigungsort fehlt → im Flow abfragen (baut auf `ort_abfragen`)
- Heute: `self-service-actions.ts` → `ortFehlt:true` → `FlowSlotStep` zeigt `kein_match`
  („wir melden uns telefonisch"). **Fix:** Adress-Step.
- **Infra da:** `src/components/GooglePlaceAutocomplete.tsx`, `src/lib/google-geocoding/geocode-address.ts`,
  Writer-Vorbild `src/app/dispatch/leads/[id]/_v2/DispatchPlaceField.tsx`.
- **Zu bauen:** Server-Action `speichereBesichtigungsortFlow(token, adresse)` (geocode →
  `leads.besichtigungsort_adresse/lat/lng`) + Adress-UI (wenn `ortFehlt` → Eingabe statt `kein_match`),
  danach `ladeMatchingFlow` erneut.

### Task 4 — `service_typ`-Auswahl (komplett vs nur-Gutachter)
- `FlowWizardKfz` STEPS (`:212-228`) + ein Auswahl-Step. `service_typ == null` → Auswahl zeigen,
  sonst nutzen (Monika='gutachter' überspringt). Lead-Feld `service_typ` (steuert LexDrive-Karte
  `FlowWizardKfz:716`).

### Task 5 — Termin reserviert → Auto-Confirm bei SA (nicht SV-manuell)
- `FlowWizardKfz.handleSignSA:255` → `signSAandCreateFall` (actions.ts). Beim Slot-Buchen ist
  `gutachter_termine.status='reserviert'` (`self-service-actions.ts:187`). **Fix:** bei SA → Termin
  `bestaetigt` (Engine `bestaetigeTermin` — **mit termin-engine-Sessions koordinieren**), ohne SV-Aktion.
- ⚠️ `gutachter_termine`-Status-Writes überlappen mit der TZ-/Termin-Arbeit (96e64dd5/cdd8f4f3) —
  vor dem Bauen kurz abstimmen.

### Task 6 — Resolver in gutachter-finder + Monika-Wizards (eine Quelle)
- Heute zwei Matching-Entrys: `self-service-actions.ts:ladeMatchingFlow` (/flow) vs
  `lib/self-service/anfrage-actions.ts:ladeMatching` (TerminField/anfrage). **Ziel:** beide auf
  `resolveFlowTerminState` + dieselbe Slot-Quelle; Anfrage-Felder je Wizard verschieden (gewollt),
  Konversion+Resolver geteilt.

### Task-2-Rest
- `page.tsx`/`FlowWizardKfz` „show-vs-book" (zeige_termin) läuft noch über `terminMitSv`-Prop, nicht
  über `resolveFlowTerminState`. Optionales Aufräumen Richtung „eine Quelle".

---

## 3. KOORDINATION

- **TZ-core #2366 ist GEMERGT** (staging) → FlowWizardKfz-TZ-Display schon drin, **kein Konflikt**.
- `5bc51fda7` (cdd8f4f3 Booking-Skip Mount-Cap) ist **inhaltlich schon in staging** (Squash; SHA
  kein Ancestor, Content present in `FlowWizardKfz:205`). Base ist vollständig.
- **cdd8f4f3** bleibt auf TZ/P4; **96e64dd5** auf TZ. FlowWizardKfz/self-service-actions auf diesem
  Branch parallel anfassen = vorher abstimmen (Aaron koordiniert).
- Matching bleibt `matchAndSlots`/`findBestSV` — **keine dritte Quelle**; termin-engine-Repoint
  (`lib/termine/engine/matching-score.ts`) mit termin-engine-Sessions abstimmen.

## 4. GATES / TEST-REALITÄT

- vitest läuft **node-env, kein RTL/jsdom** → pure-Logik testen (Pattern: `lib/self-service/__tests__/*`),
  UI via Smoke. Voller `next build` im Worktree OOMt → `tsc --noEmit` als Gate (echtes `npm ci`, kein Junction).
- Gates: `tsc --noEmit`, `npx vitest run`, `npm run check:token-audit`,
  `check:component-set -- --ratchet`, `check:knip -- --ratchet`.
