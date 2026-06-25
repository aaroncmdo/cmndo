# Makler-Vermittlung auf Werkstatt-Parität — Design

**Datum:** 2026-06-25
**Branch:** `kitta/makler-vermittlung-paritaet` (off staging)
**Status:** Design (freigegeben durch Aaron, „ja das passt")

## Problem (Audit-Befund 2026-06-25)

Die Makler-Vermittlung ist ein **dormantes Skelett** — strukturell als Werkstatt-Zwilling angelegt,
aber der Motor fehlt. Prod-Daten beweisen es: `leads_with_promo=0`, `claims_with_makler=0`,
`makler_provisionen=0` (vs `werkstatt_provisionen=4` live). Konkret fehlen 4 Drähte + die Admin-Anlage:

1. **Keine Admin-Anlage:** es gibt `/admin/werkstaetten`, aber **kein** `/admin/makler`. Maklers können
   sich nur self-onboarden (`/makler/onboarding` → `/makler/pending`).
2. **Kaputter Entry:** der Makler teilt `claimondo.de/?p={code}` (Marketing-Homepage-Query-Param);
   `/api/promo/track` loggt nur einen Klick in `promo_clicks` — der Code erreicht **nie den Lead**.
3. **Keine Propagation:** `convert-lead-to-claim.ts` setzt `claims.makler_id` nicht (anders als `werkstatt_id`).
4. **Kein Provisions-Trigger:** `makler_provisionen` wird von nichts befüllt (kein Trigger, kein Code-INSERT).

Das gesamte Makler-**Backend** (Portal `/makler/*`, Abrechnungen, Release-Cron, RLS, Rolle, Email,
dual-rate, consent) ist dagegen **schon fertig + reicher als Werkstatt**.

## Ziel

Makler-Vermittlung auf **funktionale Werkstatt-Parität** bringen, indem der Werkstatt-4-Teiler gespiegelt
wird (Entry-QR → Attribution am Lead → Claim-Propagation → Provisions-Trigger) **+ Admin-Anlage**.

## Architektur-Entscheidung (freigegeben): promo-native Attribution

Statt einer neuen `leads.makler_id`-Spalte (literaler werkstatt_id-Spiegel) wird die **bestehende
`leads.promotion_code_id`** als Attributions-Schlüssel genutzt: der Promo-Code IST die Makler-Identität.
Das hält das gesamte Portal (alles `promotion_code_id`-basiert) unverändert, vermeidet ein redundantes
Attribut, und `makler_provisionen` hat ohnehin eine `promotion_code_id`-FK. Funktional identisch zu
Werkstatt, aber reuse statt Duplikat. **`claims.makler_id` existiert bereits** (Spalte da, nur nie geschrieben).

## Komponenten (Spiegel-Mapping Werkstatt → Makler)

### 1. Admin-Anlage — `src/app/admin/makler/*` (spiegelt `admin/werkstaetten`)

`createMakler(formData)` spiegelt `createWerkstatt` (`admin/werkstaetten/actions.ts`):
`requireAdmin` → `generatePassword` → `admin.auth.admin.createUser({email, password, email_confirm,
user_metadata:{force_password_change}})` → `profiles.insert({id, email, rolle:'makler', vorname:firma,
force_password_change})` → `makler.insert({firma, ansprechpartner_*, email, telefon, adresse_*,
provision_betrag_komplett_netto [default 100], provision_betrag_nur_gutachter_netto [default 50],
provision_aktiv:true, status:'aktiv', aktiviert_am, aktiviert_von, user_id})` → **`promotion_codes.insert({makler_id,
code:'MK-'+random, aktiv:true})`** → return `{ok, email, password}`. Rollback-Kette bei jedem Schritt
(deleteUser / delete profile). **Kein** Isochrone (werkstatt-spezifisch).
- `page.tsx` (Makler-Liste) + `MaklerAdminClient.tsx` (Anlage-Formular + Liste), spiegelt `WerkstaettenClient`.
  **`handleCreate` MIT `catch`** (der WerkstaettenClient hat hier einen Silent-Swallow-Bug — nicht spiegeln).

### 2. Entry — `src/app/start/makler/[maklerId]/page.tsx` (spiegelt `start/werkstatt/[werkstattId]`)

Makler-aktiv-Check (service-role) → primären Promo-Code auflösen (`getMaklerPrimaryPromoCode`) →
`FinderWizard` mit `maklerId` + `promotionCodeId`. **Kein Geo** (Makler hat keinen kundenrelevanten
Standort → der location-first Wizard fragt den Kunden nach seinem Ort; einfacher als Werkstatt).
- **`reserviereEmbedTermin`** (`embed/gutachter-finder/actions.ts`): additiver `promotion_code_id?`-Input
  (genau neben dem bestehenden `werkstatt_id?`), gesetzt auf die gfa/lead-Row (Zeile analog `werkstatt_id`).
- **`FinderWizard`**: additiver `promotionCodeId?`-Prop (neben `werkstattId`), durchgereicht an
  `reserviereEmbedTermin`. **Maximal additiv** (Kollisions-Schutz vs. embed-rueckruf-Session).
- **`/makler/(shell)/promo/page.tsx`**: `landingUrl` von `${base}/?p=${code}` → `${base}/start/makler/${makler.id}`
  (der Makler teilt künftig den zuverlässigen first-party QR; Attribution = sein Promo-Code, server-seitig gesetzt).

### 3. Propagation — `src/lib/leads/convert-lead-to-claim.ts`

Direkt nach der `werkstatt_id`-Zeile: wenn `lead.promotion_code_id` gesetzt → `promotion_codes.makler_id`
auflösen → `claims.makler_id` setzen. Additiv (eine Auflösung + eine Zuweisung), spiegelt die werkstatt_id-Zeile.

### 4. Provisions-Trigger — `create_makler_provision()` (spiegelt `create_werkstatt_provision`)

`AFTER INSERT ON claims WHEN (NEW.makler_id IS NOT NULL)`: liest `makler.provision_betrag_komplett_netto /
_nur_gutachter_netto / provision_aktiv` via `NEW.makler_id`; wählt den Satz per `NEW.service_typ`
(`komplett` → komplett-Satz, sonst nur-Gutachter-Satz; SQL-Spiegel von `provisionFuerServiceTyp`); wenn aktiv
→ `INSERT makler_provisionen (makler_id, claim_id=NEW.id, fall_id=NEW.id, lead_id=NEW.lead_id,
promotion_code_id [via NEW.lead_id→leads.promotion_code_id], betrag_netto_eur, service_typ=NEW.service_typ,
trigger_event='claim_created', trigger_at=now(), hold_until=now()+interval '7 days', status='pending')`
`ON CONFLICT (claim_id) DO NOTHING`. SECURITY DEFINER.
- **Vorbedingung verifizieren (Plan):** `makler_provisionen` braucht ein `UNIQUE(claim_id)` für ON CONFLICT
  (sonst per Migration ergänzen); `claims.service_typ` muss existieren.

### 5. Schon da, wiederverwendet (kein Neubau)

`/makler/(shell)/{abrechnungen,akten,leads,promo,einstellungen,konto}`, Release-Cron
`release-makler-provisionen`, RLS (`mp_admin_all`/`mp_makler_read`), Email, dual-rate-Config, consent.

## DB

**1 Migration** (Regel 2 via apply_migration): `create_makler_provision()` + Trigger
(+ `UNIQUE(claim_id)` auf `makler_provisionen` falls fehlend). Kein neuer Spalten-Bedarf (promo-native)
→ kein Konflikt mit Types-Regen-Lanes.

## Scope-Grenzen (YAGNI)

- Das kaputte Marketing-`?p=`-Carry-through (Homepage→Funnel) bleibt liegen — der first-party
  `/start/makler`-QR ist der zuverlässige Weg.
- `provisionen_maik` (separates Lead-Vendor-CPL-Modell, „Maik" ≠ „Makler") unberührt.
- Kein neuer `leads.makler_id` (promo-native).
- Self-Onboarding (`/makler/onboarding`) bleibt wie es ist — die Admin-Anlage ist additiv daneben.

## Testing

- **Unit (vitest):** `createMakler` (Anlage + Promo-Code + Rollback-Pfade, gemockter admin-Client) ·
  convert-lead-to-claim makler_id-Propagation (promotion_code_id→makler_id) · `provisionFuerServiceTyp`
  bleibt grün.
- **Build:** voller `npm run build` (Routen + Server-Actions) + tsc.
- **Ratchets:** token-audit / component-set / knip / termin-engine-contract (kein gt-Touch → trivially safe).
- **Live-Smoke (DB, auto-rollback):** Trigger-Probe — Test-Claim mit `makler_id` INSERT → erzeugt genau
  eine `makler_provisionen`-Row mit korrektem dual-rate-Betrag → RAISE-Rollback. + Gate (makler_id NULL →
  keine Row).

## Koordination (parallele Sessions)

- **`embed/gutachter-finder/actions.ts` (`reserviereEmbedTermin`) + `FinderWizard.tsx`** — mögliche
  Überschneidung mit `kitta/aar-956-embed-reservierung-rueckruf` (embed reservierung/rückruf). Meine
  Änderung = rein additiver `promotion_code_id`-Param neben `werkstatt_id` → kleiner, leicht
  reconcilebarer Diff. Branch nicht auf origin → vor Merge prüfen, Marker setzen.
- **`convert-lead-to-claim.ts`** — HOT (CMM-49-Lane). Meine Änderung = additive Zeile neben werkstatt_id.
- Kein DB-Spalten-Change → kein Types-Regen-Konflikt.
