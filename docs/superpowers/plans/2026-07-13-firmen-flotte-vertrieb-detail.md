# Firmen-Flotten — volle Detail-View im Vertrieb-Cockpit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Firmen-Flotten als vollwertiger Partner-Typ im Admin/Vertrieb-Cockpit — mit voller Detail-View (Firma-Stammdaten, Fahrzeuge anlegen/registrieren, Schaden-Karten minten + an Fahrzeuge binden, Schäden der Flotte, Flottenmanager-Konto) analog der Werkstatt-Detail-View.

**Architecture:** Reine Code-Erweiterung auf bestehendem Fleet-Modell (KEIN DDL). Neuer `VertriebKind='firmen-flotte'` im Cockpit-Roster; Detail-View als `@drawer`-Intercept (Werkstatt-Muster). Konsumiert 89f501f6's Fleet-Tabellen (`firmen`, `firmen_flotten_konten`, `flotten_fahrzeuge`, `vehicles`, `schadenkarten`) + Loader (`src/lib/flotte/*`) read-only. Karten-Mint/-Bind = neue geteilte Lib.

**Tech Stack:** Next.js 16, React, Supabase (service-role admin-client hinter requireRole), primitives/shared-Komponenten, Playwright E2E.

## Global Constraints

- **KEIN DDL.** Alle Tabellen existieren (Branch off `origin/staging`). Mint = `INSERT schadenkarten`, Bind = `UPDATE schadenkarten.fahrzeug_id/status`, Fahrzeug = `flotten_fahrzeuge`/`vehicles` (via `mutate-flotte`). schadenkarten-RLS erlaubt staff (all).
- **89f501f6-Boundary** ([[coordination-an-89f501f6-firmen-flotte-vertrieb-detail-boundary]]): `src/app/flotte/**`, `src/components/flotte/**`, `src/lib/flotte/{fahrzeug-schaeden,flotten-claim-detail,mutate-flotte,konto-firma}.ts` + Fleet-Migrationen NICHT verändern — nur importieren. Neue Funktionen als NEUE Files/Exports.
- **Server-Actions:** Result-Object `{ ok, error? }`, kein throw, `revalidatePath`. KEIN const/type-Export aus `'use server'` (AAR-664) — Types via `import type`.
- **Auth:** jede Admin-Action + Loader hinter `requireRole(['admin','dispatch'])` (Firmen-Flotte-Verwaltung = staff). schadenkarten-Mint/-Bind = staff-only.
- **Komponenten-Set:** `@/components/primitives` (Button/Drawer/Card), `@/components/shared/*` (SectionCard, DataTable, PageHeader, StatusBadge, forms/TextField/SelectField). Kein handgerolltes Button/Card/Table-Markup.
- **Tokens/Status/Umlaute:** Claimondo-Tokens (kein raw hex/tailwind-scale), Status über `src/lib/status` Registry, UI-Strings mit echten Umlauten (ä/ö/ü/ß).
- **Detail-View-Template:** Werkstatt-Muster — `src/app/admin/werkstaetten/[id]/{page.tsx,detail-data.ts,WerkstattDetailClient.tsx}`, `@drawer`-Intercept `src/app/admin/vertrieb/@drawer/(.)sachverstaendige/[id]/page.tsx` + `DrawerShell`, Edit über `updateVertriebFeld` + `VERTRIEB_EDIT_TARGET` (`src/lib/vertrieb/vertrieb-edit-fields.ts`).
- **Build off** `origin/staging`, Branch `kitta/vertrieb-cockpit-firmen-flotten` (hat schon Phase-C-Einstieg — der simple Drawer wird durch die volle Detail-View ersetzt).

---

## Fleet-Modell (Referenz — existiert alles)

- `firmen`(id, name, ust_id, rechtsform, adresse_strasse/plz/ort/land, telefon, email, webseite, notiz)
- `firmen_flotten_konten`(id, firma_id→firmen, user_id→auth.users UNIQUE, status['aktiv','pausiert','deaktiviert'], aktiviert_am, created_at)
- `vehicles`(id, fin, kennzeichen_aktuell, hersteller, modell_haupttyp/untertyp, status, …~40 attr)
- `flotten_fahrzeuge`(id, firma_id→firmen, vehicle_id→vehicles, added_by_user_id, notiz, UNIQUE(firma_id,vehicle_id))
- `schadenkarten`(id, karten_token UNIQUE, status['bestellt','frei','gebunden','gesperrt','ersetzt'], fahrzeug_id→vehicles, firma_id→firmen, nfc_uid, charge, gebunden_am, gebunden_von, erstellt_am; UNIQUE(fahrzeug_id) WHERE status='gebunden') — RLS: flottenmanager(own firma) + staff(all)
- `claims`(id, vehicle_id→vehicles, status, schadentag, schadens_hoehe_netto, reparatur_werkstatt_id, …) → Flotte-Claims via `vehicle_id IN (flotten_fahrzeuge WHERE firma_id=…)`
- Loader (89f501f6): `src/lib/flotte/fahrzeug-schaeden.ts` (firma-scoped claims), `mutate-flotte.ts` (addFahrzeugToFlotte/remove), `flotten-claim-detail.ts`, `konto-firma.ts`.

---

## Task 1: Karten-Mint/-Bind — KANONISCHE LIB ADOPTIEREN (kein Neubau — erledigt)

**Korrektur 13.07. (89f501f6-Boundary-Antwort):** Die Mint/-Bind-Lib existiert BEREITS (Layer 1, staging) — **NICHT neu bauen** (mein Duplikat `src/lib/flotte/schadenkarten-mint.ts` wurde verworfen/revertet). Kanonisch, 89f501f6-owned, **import-only**:
- `src/lib/schadenkarte/schadenkarte.ts`: `mintSchadenkarten(db, {firmaId, anzahl, charge?})→{ok,tokens}` (status='bestellt') · `bindeSchadenkarteAnFahrzeug(db, {token, fahrzeugId, firmaId, userId})→{ok,error?}` (by TOKEN, firma-checked, race-safe) · `getKartenFuerFirma(db, firmaId)→{id,token,status,fahrzeugId}[]` · `resolveSchadenkarteToFahrzeug(db, token)`.
- `src/lib/schadenkarte/token.ts`: `generateSchadenkarteToken`. QR: `generateQrCodeSvg`/`buildQrGridPdf` (schadenkarte-Bereich).
- **Task 7-Admin-Action** ruft `mintSchadenkarten`/`bindeSchadenkarteAnFahrzeug` hinter `requireRole` auf. **Task 2** nutzt `getKartenFuerFirma`. Kein eigener Lib-Code.

**Files:** keine (Adoption).

<!-- OBSOLET (Duplikat verworfen): -->
### (verworfen) ~~Karten-Mint-Shared-Lib~~

**Interfaces (Produces):**
- `mintSchadenkarten(admin, { firmaId, anzahl, charge? }): Promise<{ ok: true; tokens: string[] } | { ok: false; error: string }>` — erzeugt `anzahl` (1–200) neue `schadenkarten`-Rows mit random `karten_token`, `status='frei'`, `firma_id=firmaId`, `charge`. Token-Generierung: kryptografisch (nanoid/crypto), kollisionssicher, gut druckbar.
- `bindSchadenkarteAnFahrzeug(admin, { kartenId, fahrzeugId }): Promise<{ ok: true } | { ok: false; error: string }>` — setzt `fahrzeug_id`, `status='gebunden'`, `gebunden_am=now()`. Respektiert 1:1 (UNIQUE WHERE gebunden) → bei Konflikt sauberer Fehler.
- `ladeFlottenKarten(admin, firmaId): Promise<SchadenkarteRow[]>` — staff-scoped Liste aller Karten einer Firma (join Fahrzeug-Kennzeichen). `SchadenkarteRow` = `import type` — NICHT aus einem 'use server'-File exportieren; hier ist es eine reine Lib (kein 'use server'), Export erlaubt.

**Steps:** TDD — Test (mint erzeugt N Tokens, bind setzt Status, doppel-bind an belegtes Fahrzeug → Fehler) → Implementierung (admin-client-Parameter, damit die Lib selbst kein 'use server' braucht + testbar bleibt) → grün → commit.

---

## Task 2: Firmen-Flotte Detail-Loader

**Files:**
- Create: `src/app/admin/vertrieb/_actions/firmen-flotte-detail-daten.ts` (`'use server'`)

**Interfaces:**
- Consumes: `ladeFlottenKarten` (Task 1), `getFahrzeugSchaeden`/fahrzeug-schaeden (89f501f6, read-only import).
- Produces: `getFirmenFlotteDetail(firmaId): Promise<{ ok: true; data: FirmenFlotteDetail } | { ok: false; error }>` — `requireRole(['admin','dispatch'])`, admin-client. `FirmenFlotteDetail = { firma, konto, fahrzeuge: {vehicle_id, kennzeichen, hersteller, modell, status, flotten_fahrzeug_id}[], karten: SchadenkarteRow[], schaeden: {claim_id, claim_nummer, kennzeichen, status, schadentag, schadens_hoehe_netto}[] }`. `FirmenFlotteDetail`-Type als Interface in einem NICHT-'use server'-File (`_lib/firmen-flotte-detail.ts`) definieren, hier via `import type`.
- Fleet-Claims: `claims WHERE vehicle_id IN (flotten_fahrzeuge.vehicle_id WHERE firma_id=…)` (admin-client, kein firma-Gate nötig da staff).

**Steps:** Loader schreiben (parallele Queries) → Array.isArray-Normalisierung nested FKs → Result-Object → `npx tsc` grün → commit.

---

## Task 3: VertriebKind 'firmen-flotte' + Roster-Integration

**Files:**
- Modify: `src/lib/vertrieb/vertrieb-kontakt.types.ts` (VertriebKind + 'firmen-flotte')
- Modify: `src/lib/vertrieb/get-vertrieb-kontakte.ts` (firmen_flotten_konten als VertriebKontakt-Rows laden)
- Modify: `src/app/admin/vertrieb/_lib/*` Pill/Rollen-Filter (Firmen-Flotten-Pill)
- Modify: `src/lib/vertrieb/vertrieb-edit-fields.ts` (VERTRIEB_EDIT_TARGET['firmen-flotte'] → firmen-Tabelle, notiz-Spalte)

**Interfaces:** firmen-flotte-Kontakte erscheinen im Roster (name=firma.name, email/telefon aus firma, kind='firmen-flotte'); Klick → Detail-Drawer (Task 4). Pill „Firmen-Flotten" analog Werkstätten.

**Steps:** Typen erweitern → Loader-Query (firmen_flotten_konten join firmen) → Pill → edit-target → tsc grün → commit.

---

## Task 4: Detail-View-Skelett + @drawer-Intercept

**Files:**
- Create: `src/app/admin/vertrieb/firmen-flotte/[id]/page.tsx` (RSC, lädt getFirmenFlotteDetail → FirmenFlotteDetailClient)
- Create: `src/app/admin/vertrieb/firmen-flotte/[id]/FirmenFlotteDetailClient.tsx` (Sektions-Shell mit SectionCards, PageHeader)
- Create: `src/app/admin/vertrieb/@drawer/(.)firmen-flotte/[id]/page.tsx` (DrawerShell-Wrapper, title „Firmen-Flotten-Akte", width 900)

**Interfaces:** Detail-View öffnet als Cockpit-Drawer (Intercept) UND als Full-Page (direkt-URL/hard-nav). Sektions-Platzhalter für Tasks 5–9.

**Steps:** page.tsx + Client-Shell + Intercept (Werkstatt-`@drawer`-Muster spiegeln) → tsc grün → commit.

---

## Task 5: Sektion Firma-Stammdaten (editierbar)

**Files:** Modify `FirmenFlotteDetailClient.tsx` (Stammdaten-SectionCard).

**Interfaces:** Zeigt firma.name, ust_id, rechtsform, adresse_*, telefon, email, webseite. Editierbar über `updateVertriebFeld('firmen-flotte', firmaId, feld, wert)` (Task 3 edit-target) — mind. notiz; weitere Felder über eine firma-spezifische `aktualisiereFirmaStammdaten`-Action falls nötig (NEU, `_actions/`).

**Steps:** Section + Edit-Felder (forms/TextField) + Save (onBlur/Modal) → tsc grün → commit.

---

## Task 6: Sektion Fahrzeuge (Liste + anlegen/registrieren)

**Files:** Modify `FirmenFlotteDetailClient.tsx` (Fahrzeuge-SectionCard) + Create `_actions/firmen-flotte-fahrzeuge.ts` (`'use server'`, staff-Wrapper um mutate-flotte / vehicle-create).

**Interfaces:** DataTable der Fahrzeuge (kennzeichen, hersteller, modell, status, Karten-Status). Button „Fahrzeug hinzufügen" → Modal (kennzeichen + hersteller + modell + fin optional) → legt `vehicles`-Row an (find-or-create per fin/kennzeichen) + `flotten_fahrzeuge`-Link (via `addFahrzeugToFlotte` read-only-import oder staff-Variante). Entfernen-Aktion.

**Steps:** Section + Add-Modal + Action → tsc grün → commit.

---

## Task 7: Sektion Karten (minten + an Fahrzeug binden)

**Files:** Modify `FirmenFlotteDetailClient.tsx` (Karten-SectionCard) + Create `_actions/firmen-flotte-karten.ts` (`'use server'` → mintSchadenkarten/bindSchadenkarteAnFahrzeug aus Task 1, hinter requireRole).

**Interfaces:** „Neue Charge erzeugen" (Anzahl 1–200 + Charge-Label) → mint. Kartenliste (token, status, gebundenes Fahrzeug). Pro freie Karte: „an Fahrzeug binden" (Select der Flotten-Fahrzeuge) → bind. Druck-Link analog QR-Pool (`/schaden/{token}`). Status-Badges via Registry.

**Steps:** Section + Mint-UI + Bind-UI + Actions → tsc grün → commit.

---

## Task 8: Sektion Schäden (Flotten-Claims, read-only)

**Files:** Modify `FirmenFlotteDetailClient.tsx` (Schäden-SectionCard).

**Interfaces:** DataTable der Flotten-Claims (aus detail.schaeden): claim_nummer, kennzeichen, status (FallStatusBadge), schadentag, schadens_hoehe_netto. Zeilen-Klick → bestehende Claim-Detail (Deep-Link `/admin/faelle/[id]` o.ä., kein Neubau).

**Steps:** Section (read-only DataTable) → tsc grün → commit.

---

## Task 9: Sektion Flottenmanager-Konto (Status/deaktivieren)

**Files:** Modify `FirmenFlotteDetailClient.tsx` (Konto-SectionCard) + Create `_actions/firmen-flotte-konto.ts` (`'use server'`, status-Update auf firmen_flotten_konten).

**Interfaces:** Zeigt Flottenmanager (email, vorname, status, aktiviert_am). Button „Status ändern" (aktiv/pausiert/deaktiviert) → Action (requireRole admin). revalidatePath.

**Steps:** Section + status-Action → tsc grün → commit.

---

## Task 10: Cockpit-Einstieg umstellen + E2E

**Files:**
- Modify: `src/app/admin/vertrieb/FirmenFlottenCockpitEntry.tsx` / Roster — der bisherige Phase-C-Einstieg (simpler Drawer) wird ersetzt: Firmen-Flotten-Pill + Roster-Zeilen → Klick öffnet die volle Detail-View (Task 4). Simplen `FirmenFlottenDrawerContent` (Liste+Anlage) als „Neu anlegen"-Aktion behalten oder in die neue View integrieren.
- Create/Modify: `tests/e2e/flows/vertrieb-cockpit-migration.spec.ts` (Test 11: Firmen-Flotten-Detail-View öffnet im Cockpit, Sektionen Stammdaten/Fahrzeuge/Karten/Schäden rendern).

**Interfaces:** Firmen-Flotten ist ein voller Partner-Typ wie Werkstatt; Detail-Akte im Cockpit erreichbar.

**Steps:** Einstieg umverdrahten → E2E Test 11 → Playwright grün (prod-DB via seed-admin) → `next build` grün → commit.

---

## Self-Review-Notes
- Spec-Deckung: 5 Sektionen (Stammdaten/Fahrzeuge/Karten/Schäden/Konto) = Aaron-Anforderung (Fahrzeuge anlegen, QR/Karten zuweisen+registrieren, Schäden sehen, volle Detail-View). ✓
- Reihenfolge: Foundation (1–2) → Roster+Skelett (3–4) → Sektionen Fahrzeuge+Karten zuerst (6–7, Aaron-Prio) → Schäden+Konto (8–9) → Einstieg+E2E (10).
- Boundary: alle mutierenden Fleet-Ops über NEUE Actions/Lib; 89f501f6-Loader nur importiert.
