# Termine-Hub (Kunde + Flotte) — Design

**Datum:** 2026-07-17
**Branch:** `kitta/termine-hub-kunde-flotte` (off origin/main)
**Status:** Design abgestimmt (Brainstorming mit Aaron), bereit fuer Implementierungs-Plan

---

## 1 · Kontext & Ziel

Kunden und Flottenmanager brauchen **einen Nav-Eintrag "Termine"**, der **alle relevanten Termine** als **eine chronologische Liste mit Typ-Badges** zeigt (Besichtigung, Nachbesichtigung, Reparatur, Beratung, Konfrontation), jeweils **verlinkt zur passenden Detail-View** und mit den **Funktionen** (Verschieben, Absagen, Route, ICS, Anrufen).

Der Clou: die Sache ist **kein Neubau**, sondern ein **Compose-Job**. Der Kunde-Termin-Loader (`getKundeTermine`) vereint bereits `gutachter_termine` (SV) + `reparatur_termine`. Beide Portale reduzieren sich auf *claim-ids -> termine*; nur der **Ownership-Resolver** unterscheidet sich. Wir bauen **einen geteilten `<TermineHub>`**, gefuettert von **zwei Resolvern**, plus die fehlenden **Typ-Badges**.

### Was HEUTE auf main existiert (verifiziert)

| | Kunde (`/kunde/termine`) | Flotte (`/flotte`-Portal) |
|---|---|---|
| Nav-Eintrag | ✅ `KundeNav.tsx:17` (`/kunde/termine`) | ❌ `FlotteManagerShell.tsx:20` `FLOTTE_NAV_ITEMS = [Flotte, Karten]` |
| Termin-Liste | ✅ `getKundeTermine()` (SV + Reparatur), Liste/Kalender-Toggle | ❌ keine |
| Typ-Badges | ❌ nur "Gutachter-Termin"/"Kundenberatung" + separate Reparatur-Sektion — **kein Besichtigung/Nachbesichtigung-Split** | ❌ |
| Detail + Funktionen | ✅ `/kunde/termine/[id]` (Verschieben/Absagen/Route/ICS/Anruf) | ❌ |

Relevante Bestandsdateien:
- `src/app/kunde/termine/page.tsx` + `KundeTermineClient.tsx` — heutige Kunde-View (wird refactored).
- `src/lib/claims/kunde-termine.ts` — `getKundeTermine(admin, {fallIds, claimIds})` -> `KundeTermin[]` (`art: 'sv' | 'reparatur'`).
- `src/lib/claims/owned-claims.ts` — `getOwnedClaimIds(admin, userId, email)` (Kunde-Ownership).
- `src/app/flotte/(shell)/layout.tsx` + `src/components/flotte/FlotteManagerShell.tsx` — Flotten-Portal-Shell (nutzt shared `PortalNav`, config-driven).
- `src/lib/flotte/konto-firma.ts` — `getFlottenmanagerFirma`, `resolveKontoFirma(db, userId, rolle)` (bereits rollen-aware: kunde -> `personen.firma_id`, flottenmanager -> `firmen_flotten_konten`).
- `src/lib/kunde/firma-flotte.ts` — `getKundeFlotte(db, firmaId)` -> Fleet-Fahrzeuge (`flotten_fahrzeuge` N:M -> `vehicles`).
- `src/lib/flotte/fahrzeug-schaeden.ts` — `getFahrzeugSchaeden(db, firmaId, vehicleId)`: Claims via `claims.vehicle_id` (firma-scoped, `operative_status`).

---

## 2 · Nicht-Ziele / Scope-Grenzen

- **Kein** `admin_termine` (Rueckruf/intern) in der Kunde-/Flotten-Sicht — das sind interne Termine. `getKundeTermine` liest sie schon heute nicht; bleibt so.
- **Keine** neue Termin-Lifecycle-Logik. Verschieben/Absagen laufen ueber die bestehenden APIs / die Termin-Engine (`src/lib/termine/engine`). Wir bauen nur Read-Views + verdrahten bestehende Aktionen.
- **Keine** neuen DB-Spalten fuer die Typ-Ableitung — Besichtigung/Nachbesichtigung werden aus vorhandenen Signalen abgeleitet.
- **Kein** Realtime auf der *Liste* im MVP. Die Detail-View (`/kunde/termine/[id]`) behaelt ihr Live-SV-Tracking; die Liste ist `force-dynamic` + revalidate.
- **Kein** Umbau von `/kunde/flotte` (Kunde-mit-Firma-Fleet-Verwaltung) im MVP — aber der Fleet-Termin-Loader ist so gebaut, dass `/kunde/flotte` ihn spaeter gratis nutzen kann (der Resolver `resolveKontoFirma` ist bereits rollen-aware).

---

## 3 · Architektur — ein Engine, zwei Resolver, eine Komponente

```
Kunde:   user ── getOwnedClaimIds(userId,email) ─────────────────┐
                                                                  ├─► v_claim_full ─► { fallIds, claimIds }
Flotte:  firma ── getKundeFlotte(firmaId) ── vehicle_ids ─────────┤              (+ claim_id→vehicle_id-Map)
                  └─ claims WHERE vehicle_id IN (…) ──────────────┘                          │
                                                                                             ▼
                                          getKundeTermine({ fallIds, claimIds })   ← erweitern: bezug-safe + nachbesichtigung_status
                                                                                             │
                                                                                             ▼
                            <TermineHub context="kunde"|"flotte" termine linkResolver fallMap />
                                                                                             │
                                     Zeile ── klick ──► Detail-View     +     Inline-Quick-Actions (Verschieben/Absagen)
```

### 3.1 · Zwei Ownership-Resolver (Bestand)

- **Kunde:** `getOwnedClaimIds(admin, user.id, user.email)` -> claim-ids -> `v_claim_full` -> `{ fallIds, claimIds }`. (Exakt wie heute in `kunde/termine/page.tsx`.)
- **Flotte:** `getFlottenmanagerFirma(db, user.id)` -> `firma.id` -> `getKundeFlotte(db, firma.id)` -> `vehicle_ids` -> `claims WHERE vehicle_id IN (vehicle_ids)` -> claim-ids -> `v_claim_full` -> `{ fallIds, claimIds }` + eine `claim_id -> vehicle_id`-Map (fuer den Detail-Link).

Neuer Loader **`src/lib/flotte/flotte-termine.ts`** kapselt den Flotten-Fan-out und ruft am Ende **denselben** `getKundeTermine`.

### 3.2 · Eine geteilte Komponente

**`src/components/termine/TermineHub.tsx`** (neu) — extrahiert aus dem heutigen `KundeTermineClient`, plus:
- Vereinte, chronologische Timeline (SV + Reparatur in **einer** Kommend/Verlauf-Liste; heute getrennte Sektionen).
- Pro Zeile ein **Typ-Badge** + der bestehende Status-Badge (`TerminStatusBadge`).
- Kalender-Toggle bleibt.
- Props steuern portal-spezifisches Verhalten:
  - `linkFor(termin) => string | null` — Kunde vs. Flotte Detail-Ziel.
  - `actions` — welche Inline-Quick-Actions gerendert werden (identisch, nur andere Ownership hinter der API).

`KundeTermineClient` wird ein **Thin-Wrapper** um `<TermineHub context="kunde" …>` (kein zweites Listen-Rendering — Redundanz-Check der 7-Punkte-Audit).

---

## 4 · Typ-Badges — Taxonomie & Ableitung

Eine reine Funktion **`deriveTerminTyp(t: KundeTermin): TerminTyp`** mappt jeden Eintrag auf genau einen Badge:

| Badge (UI, DE) | Quelle / Regel | Icon (lucide) |
|---|---|---|
| **Besichtigung** | `gutachter_termine` `typ='sv_begutachtung'`, **kein** Nachbesichtigung-Signal | `HardHatIcon` |
| **Nachbesichtigung** | Re-Begutachtung — Signal aus `nachbesichtigung_*` (s. §4.1) | `SearchIcon` |
| **Reparatur** | `reparatur_termine`-Zeile (`art='reparatur'`) | `WrenchIcon` |
| **Beratung** | `gutachter_termine` `typ='kb_beratung'` | `VideoIcon` |
| **Konfrontation** | `gutachter_termine` `typ='konfrontation'` | `UsersIcon` |

- **Status-Badge** (Bestaetigt/Reserviert/…) bleibt unveraendert: `TerminStatusBadge` (Status-Registry).
- **Typ-Badge** = neue kleine Komponente **`src/components/termine/TerminTypBadge.tsx`**, gebaut auf dem sanktionierten `Badge`-Primitive. **Nur Label + neutraler/Marken-Ton** — Farbe traegt der Status-Badge. Damit kein Konflikt mit dem **Status-Registry-Gate** (das inline Status-Farb-Maps blockt): der Typ-Badge ist ein **Label-Badge ohne Status-Farb-Semantik** (ein `Record<TerminTyp,string>` Label-Map ist erlaubt; Farbe kommt nicht aus einer Status-Ternary). Falls ein farbiger Typ-Badge gewuenscht ist -> Kanal-/Kategorie-Farbe mit `// status-registry-skip: Termin-TYP (kein Status)`-Header.

### 4.1 · Nachbesichtigung-Ableitung (Planungs-Entscheidung, kein Blocker)

Signale sind reichlich vorhanden (verifiziert):
- `gutachter_termine.nachbesichtigung_status` + `nachbesichtigung_termin_datum` + `nachbesichtigung_angefordert_am` + `nachbesichtigung_ergebnis` + `nachbesichtigung_konfrontation` + `nachbesichtigung_sv_termin_vereinbart_am` (Row-Cluster, `database.types.ts` ~9053-9061).
- `faelle.nachbesichtigung_status` (Fall-Ebene; genutzt in `StatusZone.tsx:151`, `FallKarte.tsx`).
- Der Re-Termin-Flow (`/kunde/re-termin`, `/kunde/nachbesichtigung`) **inserted** eine neue `gutachter_termine`-Zeile (`typ='sv_begutachtung'`).

**Zu klaeren im Plan:** Traegt die Nachbesichtigung eine **eigene** `gutachter_termine`-Zeile (dann emittiert der Loader natuerlich einen 2. Eintrag) — ODER lebt sie als `nachbesichtigung_termin_datum` **auf der Besichtigungs-Zeile** (dann muss der Loader daraus einen synthetischen 2. Timeline-Eintrag `typ='nachbesichtigung'` erzeugen)? Das entscheidet, ob **1 oder 2** Timeline-Eintraege pro SV-Zeile entstehen. Vorgehen: den Insert im Re-Termin-/Nachbesichtigung-Flow lesen + eine Live-DB-Stichprobe (READ) — dann `deriveTerminTyp`/den Loader entsprechend bauen. Die Ableitung wird in **einer** getesteten Funktion isoliert, damit die Regel an einer Stelle korrekt ist.

---

## 5 · Loader-Aenderungen

### 5.1 · `getKundeTermine` erweitern (`src/lib/claims/kunde-termine.ts`)

1. **SV-Select ergaenzen** um die Nachbesichtigung-Ableitungs-Felder (mind. `nachbesichtigung_status`, `nachbesichtigung_termin_datum`) und — falls die Ableitung sie braucht — den `auftrag`-Bezug. `typ`/`kanal` sind bereits im Select.
2. **⚠ Bezug-Achsen-Korrektheit (Termin-Bezug-Gate):** der heutige SV-Read filtert `.in('fall_id', fallIds)`. Neue Termine werden von der Engine **bezug-nativ** geschrieben (`bezug_typ`+`bezug_id`, `fall_id` NULL) — ein reines `.in('fall_id')` **uebersieht** diese Zeilen (dieselbe Bug-Klasse wie #2580). **Korrektheits-Anforderung:** die Bezug-Achse ueber `effektiveBezugIds()` / `bezugOrExpr` aus `@/lib/termine/bezug-filter` aufloesen, damit bezug-native Termine sichtbar sind. Im Plan verifizieren, ob `kunde-termine.ts` im `termin-bezug-baseline.json` grandfathered ist; beim Anfassen Boy-Scout-migrieren (Ratchet + echte Sichtbarkeit).
3. Rueckgabe-Typ `KundeTermin` um `typ: TerminTyp` (abgeleitet) + optionale `nachbesichtigung_*`-Rohfelder erweitern — oder die Ableitung im Loader machen und `terminTyp` direkt liefern (bevorzugt: eine Quelle der Wahrheit).

### 5.2 · Neuer Fleet-Loader (`src/lib/flotte/flotte-termine.ts`)

```
getFlotteTermine(admin, firmaId) -> { termine: KundeTermin[], fallMap, vehicleByClaim }
  1. vehicles   = getKundeFlotte(admin, firmaId)                 // vehicle_ids
  2. claims     = admin.from('claims').select('id, vehicle_id').in('vehicle_id', vehicleIds)   // claim_ids + vehicle-Map
  3. fallInfo   = admin.from('v_claim_full').select('id, fall_id, kennzeichen, fahrzeug_*, claim_nummer').in('id', claimIds)   // fall_ids + Anzeige (fall_id NUR aus der View, nicht aus claims)
  4. termine    = getKundeTermine(admin, { fallIds, claimIds })  // SELBER Loader
  5. vehicleByClaim: claim_id -> vehicle_id  (aus Schritt 2, fuer den Flotten-Detail-Link)
```

Security: reiner Admin/Service-Role-Read; Ownership-Gate ist die Firma-Zugehoerigkeit (via `getKundeFlotte`/`flotten_fahrzeuge`) — kein Leak fremder Firmen. (Gleiches Muster wie `getFahrzeugSchaeden`.)

---

## 6 · Zeilen-Design (unified Timeline)

```
┌───────────────────────────────────────────────────────┐
│ 🔧 Besichtigung   • Bestaetigt                         │
│ Mo, 21. Juli 2026 · 14:00                              │
│ CLM-2026-00123 · VW Golf 8                             │
│ [ Verschieben ]  [ Absagen ]        Details ansehen → │
└───────────────────────────────────────────────────────┘
```

- Ganze Zeile ist der Detail-Link (bestehendes `<Link>`-Card-Muster).
- **Inline-Quick-Actions** (Verschieben/Absagen) nur auf **kommenden SV-Terminen** (Besichtigung/Nachbesichtigung/Konfrontation), deren Status noch aenderbar ist (nicht abgeschlossen/abgelehnt/abgesagt — analog zur bestehenden `kommend`-Filterlogik in `KundeTermineClient`). Kein Doppel-Link-Nesting: die Buttons sind `stopPropagation` in der Card.
- **Reparatur ohne Datum** (`start=null`, Status angefragt/anruf_erbeten): eigener Mini-Block "Terminvereinbarung laeuft" oben in Kommend (kein Sortier-Nulls-Chaos).
- Kommend/Verlauf-Split + Kalender-Toggle bleiben.
- Komponenten aus dem Set: `Card` (primitive), `TerminStatusBadge` (shared), neuer `TerminTypBadge`, `PageHeader` (shared). Kein handgerolltes Button/Card-Markup (Component-Set-Gate).

---

## 7 · Pro-Portal-Spezifika

| | Kunde | Flotte |
|---|---|---|
| Route | `/kunde/termine` (refactor) | `/flotte/termine` (neu) |
| Nav | schon da (`KundeNav.tsx:17`) | **+** `{ href:'/flotte/termine', label:'Termine', icon: CalendarIcon }` in `FLOTTE_NAV_ITEMS` (`FlotteManagerShell.tsx:20`) + in `FLOTTE_MOBILE_ITEMS` |
| Layout-Gate | `kunde` (`kunde/layout.tsx`) | `flottenmanager` (`flotte/(shell)/layout.tsx` via `requirePortalAccess`) |
| Ownership | `getOwnedClaimIds` | `getFlotteTermine`(firma) |
| Zeile -> Detail | SV: `/kunde/termine/[id]` · Reparatur/Beratung: `/kunde/faelle/[claimId]` | `/flotte/fahrzeug/[vehicleId]/schaden/[claimId]` (via `vehicleByClaim`-Map) |
| Rechte | voll (eigener Claim) | **voll** (Aaron: "volle Rechte") — Aktions-Authz generalisieren, s. §8 |
| Fahrzeug-Zeile | `v_claim_full.fahrzeug_*`/`kennzeichen` | dito, aus Fleet-Fan-out |

**Redirect-Stub-Gate:** `/flotte/termine/page.tsx` rendert Content (Liste) -> kein Redirect-Stub. `/kunde/termine` unveraendert Content.

---

## 8 · Aktions-Authz-Generalisierung (die sicherheitskritische Stelle)

Heutige Inline-Aktionen treffen `/api/kunde/termin/{verschieben,absagen}`, die den Caller als **Kunde-Owner** autorisieren. Fuer Flotte "volle Rechte" muss ein Flottenmanager denselben Termin bewegen duerfen.

**Loesung:** ein geteilter Ownership-Guard **`callerOwnsTerminClaim(admin, userId, terminOrClaimId)`**:
- `true`, wenn `getOwnedClaimIds(admin, userId, email)` den Claim enthaelt (Kunde), **ODER**
- der Claim ueber die Firma des Users erreichbar ist: `resolveKontoFirma(admin, userId, rolle)` -> `firma.id` -> `getKundeFlotte` -> `vehicle_ids` -> `claims.vehicle_id` enthaelt den Claim.

Beide bestehenden Routes (verschieben/absagen) rufen diesen Guard statt der kunde-only-Pruefung. Kein paralleles `/api/flotte/...`. Weil dies auth-kritisch ist und das Repo ratchet-schwer (RLS/Grant/Reachability): **Regel-4-Prod-Smoke** fuer beide Rollen (Kunde verschiebt eigenen Termin; Flottenmanager verschiebt Firmen-Fahrzeug-Termin; Fremd-Claim wird abgewiesen).

**Im Plan verifizieren:** exakter heutiger Auth-Code der beiden Routes (Rolle/Owner-Check) + ob `rolle` im Route-Handler verfuegbar ist (sonst aus `profiles`/Session ziehen).

---

## 9 · i18n

- Neue Keys unter `kunde.termine.*` fuer die Typ-Labels (`besichtigung`, `nachbesichtigung`, `reparatur`, `beratung`, `konfrontation`) in allen 6 Locales (de/en/tr/ru/pl/ar).
- Flotten-Portal: `FLOTTE_NAV_ITEMS` ist heute hardcoded DE (`'Flotte'`, `'Karten'`) — "Termine" konsistent hardcoded DE fuer den MVP-Ship, i18n-Follow-up analog zum bestehenden TODO in `KundeNav.tsx:20`. Frontend-Umlaute Pflicht (AGENTS.md).

---

## 10 · Konventions-/Ratchet-Compliance-Checkliste

- **Component-Set:** `Card`/`Badge`-Primitive, `PageHeader`/`StatusBadge` shared — kein handgerolltes Markup.
- **Status-Registry-Gate:** Typ-Badge = Label-Map ohne Status-Farb-Ternary; Status-Farbe bleibt `TerminStatusBadge`.
- **Termin-Bezug-Gate:** Loader-Filter bezug-safe (§5.1.2).
- **Redirect-Stub-Gate:** neue Pages rendern Content.
- **Token-Audit:** keine Inline-Hex; Marken-Toene via `claimondo-*`/`var(--brand-*)`; Radien `rounded-ios-*`.
- **Server-Actions:** falls neue Actions -> `{ ok, error? }`-Shape, `revalidatePath`.
- **Umlaute:** alle UI-Strings echte `ä/ö/ü/ß`.

---

## 11 · Bau-Reihenfolge (Phasen)

**Ein Spec, zwei Phasen** (teilen sich Engine + Komponente):

- **Phase 1 — Kunde:** `deriveTerminTyp` + `TerminTypBadge` + `getKundeTermine`-Erweiterung (bezug-safe + nachbesichtigung) + `<TermineHub>` extrahieren + `KundeTermineClient` als Thin-Wrapper + Inline-Quick-Actions + i18n. **Nutzersichtbares Ergebnis:** eine Timeline mit Typ-Badges im Kunde-Portal.
- **Phase 2 — Flotte:** `getFlotteTermine` + `/flotte/termine` page (nutzt `<TermineHub context="flotte">`) + Nav-Eintrag + Detail-Link (`vehicleByClaim`) + Aktions-Authz-Generalisierung (§8).

Jede Phase endet mit Build + Regel-4-Prod-Smoke.

---

## 12 · Offene Punkte fuer den Plan (keine Blocker)

1. **Nachbesichtigung-Ableitung** (§4.1): eigene Zeile vs. `nachbesichtigung_termin_datum` auf der Besichtigungs-Zeile -> 1 oder 2 Timeline-Eintraege. (Insert-Code lesen + Live-DB-READ-Stichprobe.)
2. **Bezug-Achsen-Migration** (§5.1.2): Baseline-Status von `kunde-termine.ts` pruefen; `bezugOrExpr`/`effektiveBezugIds` einziehen.
3. **Aktions-Route-Auth** (§8): heutigen Auth-Code von `/api/kunde/termin/{verschieben,absagen}` lesen; Guard generalisieren; `rolle` im Handler beschaffen.
4. **Reparatur-null-Datum**-Platzierung in der Timeline (§6).
5. **Konfrontation**: Detail-Ziel fuer Kunde bestaetigen (heute evtl. nur Fall-Link).

---

## 13 · Test- / Regel-4-Smoke-Plan

- **Unit:** `deriveTerminTyp` (alle 5 Typen + NULL-Edge-Cases); Fleet-Fan-out-Mapping (`vehicleByClaim`); `callerOwnsTerminClaim` (Kunde-owns / Firma-owns / Fremd-abgewiesen).
- **Prod-Smoke (Playwright, `app.claimondo.de`, Test-Konten `telefon=NULL`):**
  - Kunde: `/kunde/termine` — Timeline zeigt Typ-Badges korrekt; Detail-Link oeffnet; Verschieben/Absagen wirken (DB-verifiziert).
  - Flotte: Flottenmanager-Login -> `/flotte/termine` — Fleet-Termine ueber mehrere Fahrzeuge; Detail-Link -> `/flotte/fahrzeug/[id]/schaden/[claimId]`; Aktion im Namen der Firma wirkt.
  - Negativ: Flottenmanager kann **keinen** fremden (nicht-Firmen-)Termin bewegen.
- Test-Konten/Fixtures: Fleet-Firma mit ≥2 Fahrzeugen + Claims + Terminen (ggf. Seed-Skript analog `scripts/smoke/*`).

---

## 14 · Risiken

- **Nachbesichtigung-Doppelzaehlung:** falsch abgeleitet -> Termine doppelt/fehlend. Mitigation: isolierte, getestete `deriveTerminTyp` + Live-Stichprobe (§4.1).
- **Bezug-Achse:** ohne bezug-safe Filter fehlen die neuesten Termine (bezug-nativ). Mitigation: §5.1.2.
- **Auth-Generalisierung:** zu weit -> Cross-Firma-Leak. Mitigation: exakter Firma-Scope + Negativ-Smoke (§8/§13).
- **Fleet-Skalierung:** grosse Flotte = viele claim-ids in `.in(...)`. Fuer den MVP unkritisch (Firmen klein); bei Bedarf paginieren/Server-Filter.
