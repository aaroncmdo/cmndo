# Werkstatt-Finder-Anfrage SP-C — Werkstatt-Finder im Kunde-Portal — Design

> Sub-Projekt C des Werkstatt-Finder-Anfrage-Features. Ein Reparatur-Claim (Selbstzahler oder jeder `reparatur`-Fall) **ohne** hinterlegte Werkstatt bekommt im Kunde-Portal einen Werkstatt-Finder → Kunde wählt → `assignReparaturWerkstatt(quelle='kunde')` → danach die bestehende `WerkstattCard`. Aaron-Entscheidung: **Karte** (analog Gutachter-Finder). Dekomponiert in **SP-C1 (funktionaler Picker, Liste)** + **SP-C2 (Mapbox-Karte)**.

**Datum:** 2026-07-05 · **Branch:** `kitta/werkstatt-finder-portal` (off staging) · **Feature:** [[coordination-werkstatt-finder-anfrage]]

---

## 1. Bestandsaufnahme (staging, verifiziert)

- **`WerkstattFinder`** (`src/components/werkstatt/finder/WerkstattFinder.tsx`): rangierte **Liste** (Name/Adresse/Distanz/Telefon + „Passt"-Badge + „Auswählen"). Props `{ werkstaetten: WerkstattFinderRow[]; onSelect(id); selectedId?; loading? }`. Eigene Loading-/Empty-States. **Reuse pur.**
- **`WerkstattCard`** (`src/components/kunde/WerkstattCard.tsx`): zeigt die **hinterlegte** Werkstatt + Reparaturtermin + Wunschtermin-Vorschlag. Rendert in `page.tsx:935` nur `{werkstattData && …}` (= Werkstatt hinterlegt).
- **`findReparaturWerkstaettenForTarget({target:'claim',id})`** + **`assignReparaturWerkstatt({target,id,werkstattId,quelle,actorUserId})`** (`vermittlung-server.ts`, Admin-Client) — beide gebaut/in staging.
- **Kunde-Ownership-Pattern** (`reparatur-termin-actions.ts`): `createClient()` (RLS-Session) → `getUser()` → Claim via Owner-RLS lesen (lesbar ⇒ Eigentum) → Admin/Service nur für cross-RLS-Notify. `WerkstattFinderRow` ist bereits eine sichere Projektion (kein bank/user_id).
- **Karte-Pattern:** `src/app/kunde/termin/[token]/_kunde-live-map/KundeLiveMap.tsx` = schlanke Portal-Mapbox-Karte (mirror für SP-C2) — **nicht** die hot 1039-Zeilen-`FinderMap` (aar-956-Kollision).

## 2. SP-C1 — Funktionaler Portal-Picker (JETZT)

**Files:**
- Create `src/app/kunde/faelle/[id]/werkstatt-finder-actions.ts`:
  - `ladeWerkstaettenFuerClaim(claimId): Promise<{ ok:true; werkstaetten: WerkstattFinderRow[] } | { ok:false; error }>` — Kunde-Session-Ownership (Claim via RLS lesbar + noch keine Werkstatt) → `findReparaturWerkstaettenForTarget({target:'claim',id})`.
  - `waehleWerkstattPortal(claimId, werkstattId): Promise<{ ok; error? }>` — Kunde-Session-Ownership + Werkstatt via Service-Client als `status='aktiv'` verifizieren (Anti-IDOR) → `assignReparaturWerkstatt({target:'claim',id,werkstattId,quelle:'kunde',actorUserId:user.id})` → `revalidatePath`.
- Create `src/components/kunde/WerkstattFinderCard.tsx` (client): lädt via `ladeWerkstaettenFuerClaim` beim Mount, rendert `WerkstattFinder` (Liste) in einer `Card` mit Header, `onSelect` → `waehleWerkstattPortal` → `router.refresh()`.
- Modify `src/app/kunde/faelle/[id]/page.tsx` (additiv, nach dem `WerkstattCard`-Block ~Z.941): `{!reparaturWerkstattId && claimExtra?.reparaturwunsch === 'reparatur' && (<WerkstattFinderCard claimId={fall.claim_id} />)}` + Import.

**Gate:** `reparaturwunsch === 'reparatur' && !reparatur_werkstatt_id` — deckt Selbstzahler (SP-B1 setzt `reparaturwunsch='reparatur'`) **und** jeden Reparatur-Claim ohne Werkstatt. Sobald gewählt → `reparatur_werkstatt_id` gesetzt → Finder verschwindet, `WerkstattCard` erscheint (Wunschtermin-Vorschlag = SP4, schon da).

**Sicherheit:** Ownership via Kunde-RLS (Claim lesbar ⇒ Eigentum); Werkstatt-Auswahl gegen `status='aktiv'` gegatet; `assignReparaturWerkstatt` setzt nur die 4 `reparatur_werkstatt_*` (additiv). Doppelwahl geblockt (Guard „bereits Werkstatt hinterlegt").

**Testing:** Die Actions sind Kunde-Session-Wrapper (Admin/Service) ohne sinnvolle reine Unit-Logik (die Finder-/Rank-Logik ist in `finder.test.ts` bereits getestet). Verifikation = **voller Build** + **Prod-Smoke** (Reparatur-Claim ohne Werkstatt → Finder erscheint → Auswahl → `reparatur_werkstatt_id` gesetzt → `WerkstattCard` erscheint; Fremd-Claim → 0 via RLS).

## 3. SP-C2 — Mapbox-Karte (turnkey, danach)

Neue `WerkstattFinderMap` (mirror `KundeLiveMap` + `@/lib/mapbox/client`): Karte auf `claims.schadenort_lat/lng`, Werkstatt-Pins (aus `ladeWerkstaettenFuerClaim`), die `WerkstattFinder`-Liste als Sidebar/Bottom-Sheet, Pin-/Listen-Klick → `waehleWerkstattPortal`. Ersetzt in `WerkstattFinderCard` die reine Liste durch Karte+Liste. **Self-contained** (kein FinderMap-Touch). Token-Audit-Skip-Header (Mapbox-Hex).

## 4. Koordination & Abgrenzung

- **Neue Files** (Actions + `WerkstattFinderCard`) + **1 additiver page.tsx-Block** — kein Touch an `WerkstattCard`/`WerkstattFinder`/`vermittlung-server`. Kein aar-956-FinderMap-Touch.
- Off staging (nicht auf #3646 gestapelt — Stranding-Lehre).
- **Abgrenzung:** SP-D (reduzierter Reparatur-Stepper), KB-Skip-Follow-up.

## 5. Definition of Done (SP-C1)

- [ ] `ladeWerkstaettenFuerClaim` + `waehleWerkstattPortal` (Kunde-Ownership, Anti-IDOR, additiv).
- [ ] `WerkstattFinderCard` reused `WerkstattFinder`.
- [ ] `page.tsx` rendert den Finder bei Reparatur-Claim ohne Werkstatt (additiv).
- [ ] **Voller Build grün**, tsc 0, 3 Ratchets 0-neu, `check:i18n(-render)` grün, 7-Punkt-Audit.
- [ ] Regression: `WerkstattCard` (mit Werkstatt) + fiktiv-Block unverändert.
- [ ] Post-Deploy-Smoke (s. §2).
