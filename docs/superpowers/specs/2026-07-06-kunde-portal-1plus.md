# Kunde-Portal 1+ — Design-Spec (06.07.2026)

**Auftrag (Aaron):** Kunde-Portal per E2E auditieren, 1+-Lücken + Redundanzen finden, sauber bauen. Zusatz: Firmen mit mehreren Schäden + Selfservice-Schadenmeldung aus dem Portal.

## Audit-Ergebnis
- 🔴 **Kein In-Portal „Schaden melden".** Einziger Einstieg = Leer-Zustand-Hero → öffentlicher Marketing-Wizard `/schaden-melden` (nicht vorbefüllt, nicht gebrandet). Kunde MIT Fall: gar kein Weg.
- 🟡 **Redundanz Fall-Detail:** Doppel-KB-Card + Doppel-Fortschritt.
- 🟡 **profil + einstellungen** = 2 Settings-Flächen, einstellungen nicht in Nav.
- ✅ Multi-Fall datenseitig vorhanden (`/kunde` ≥2 → FallKarte-Grid).

## Scope-Entscheidung (Aaron)
Schlanker In-Portal-Wizard · echtes Firmen-Konto+Flotte · alle 3 Cleanups.

## Zerlegung (5 Sub-Projekte)
1. **In-Portal Schaden-Melde-Wizard** — reuse `createLead → convertLeadToFall`, `kunde_id: user.id`. Blaupause `admin/faelle/anlegen/actions.ts`. Firmen-bewusst (Fahrzeug-Picker sobald #2), blockiert nicht darauf.
2. **Firmen-Konto + Flotte** — fehlt als Kunden-Entität; braucht DDL (profile↔firma-Link, `vehicles.current_owner_id`-Writer, Flotten-Query). Eigenes Spec.
3. Fall-Detail entdoppeln · 4. Settings konsolidieren · 5. Firmen-Schaden-Übersicht (⟶#2).

## Sub-Projekt 1 — Design
**Route:** `/kunde/schaden-melden` (server page: Kundendaten vorbefüllen) + `SchadenMeldenWizard` (client, Schritte: Fahrzeug → Unfall → Schuldfrage → Bestätigen).
**Server-Action `meldeNeuenSchaden(form)`** (`src/app/kunde/schaden-melden/actions.ts`):
1. `requirePortalAccess(['kunde'])` → user.
2. Pure `buildSchadenLeadInput(form, kunde)` (`src/lib/kunde/schaden-melden.ts`) → `{base, extra}` mit Validierung (PLZ-5-stellig Pflicht, schadens_art-Whitelist).
3. `createLead(admin, base, extra)` mit `extra.kunde_id = user.id`.
4. `convertLeadToFall(admin, leadId, user.id)` — volle Behandlung (KB-Zuweisung, Pflichtdokumente, WhatsApp „fall_eroeffnet", Auto-Tasks) = 1+-Erlebnis.
5. `ensureVehicleForClaim({claimId, snapshot:{kennzeichen}, db})` falls kennzeichen.
6. `revalidatePath('/kunde')` → Result `{ ok, claimId, fallId, claimNummer } | { ok:false, error }`.

**Einstiegspunkte:** KundeNav-Item „Schaden melden" (prominent) + Dashboard-CTA (Multi-Fall + Leer-Zustand) + Fall-Detail „weiteren Schaden melden".

**Felder (minimal, Converter-verifiziert):** kennzeichen(+hersteller/modell opt), unfalldatum, unfallhergang, unfallort(+plz Pflicht/ort), schadens_art (haftpflicht|vollkasko|teilkasko|eigenverschulden|unbekannt), gegner_bekannt, ist_fahrzeughalter. Name/Email/Tel vorbefüllt aus profile.

**Firmen-Hook (jetzt vorbereitet, später #2):** Wizard-Schritt 1 zeigt „Fahrzeug aus Bestand" NUR wenn Flotte existiert — bis #2 immer manuelle Eingabe.

## Error-Handling / Konventionen
Result-Object `{ ok }` (kein throw); non-critical sub-sends in try/catch; Umlaute in allen UI-Strings; reuse statt Duplikat (createLead/convert/ensureVehicle).

## Verifikation
TDD auf `buildSchadenLeadInput` (pure); `npm run build`; 3 Ratchets; Post-Deploy-Smoke NUR test-kunde (erzeugt echten Fall + Dispatch-Effekte → Vorsicht).
