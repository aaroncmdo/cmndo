# Email-Template-System P2 — KundeWelcome-Flagship · Implementation Plan

> **Status:** Entwurf zur Freigabe (2026-05-29). Baut auf **P1a** (Primitive-Set, PR #1988, gemerged/offen) auf.
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development oder superpowers:executing-plans.

**Goal:** Die Live-Mail `KundeWelcome` (Tier 1, kundengerichtet, whitelabel-fähig) auf das P1a-Primitive-Set heben, sodass sie wie **Mockup v7** aussieht — **ohne** den funktionalen Kern (Magic-Link + Zugangsdaten, Termin-Block, 3 Account-Zustände, i18n, SV-Whitelabel, Idempotenz) zu brechen.

**Branch:** `kitta/email-template-system` (weiter) oder neuer `kitta/email-p2-kundewelcome` off `staging`. PR `--base staging`. ⚠️ **Live-Mail an Kunden** — voller Smoke + Render-Screenshot Pflicht vor PR.

**Spec:** `docs/superpowers/specs/2026-05-29-email-template-system-design.md` (§2 Tiers/datengetrieben, §5 Trust) · **Mockup:** `…-v7-mockup.html`

---

## Ausgangslage (verifiziert 2026-05-29)

- **Template:** `src/lib/email/google/templates/KundeWelcome.tsx` (`KundeWelcomeEmail(props)` + `subject`). Props: `vorname, fallNummer, unfallDatum, adresse, fahrzeug (string), versicherung, svName, accountExists, flowToken, terminInfo, loginInfo, brand, locale`. i18n: `KundeWelcome.i18n.ts` (`getKundeWelcomeStrings(locale)`).
- **Caller:** `src/lib/email/google/flows.ts → sendKundeWelcome(fallId, loginInfo?)`. Lädt aus `faelle`: `fahrzeug_hersteller, fahrzeug_modell, kennzeichen, sv_id, kunde_id, claim_id, claims(claim_nummer, schadentag)`. Versicherung aus `parteien` (rolle=gegner). svName aus `sachverstaendige→profiles`. terminInfo aus `gutachter_termine`. brand via `resolveEmailBranding({svId})`. **Idempotenz** über `email_log` (skip wenn `loginInfo` null + schon gesendet).
- **Fahrzeugbild:** `buildImaginUrl({hersteller, modell, lackfarbe, baujahr})` aus `src/lib/fahrzeug/imagin.ts` → direkte `cdn.imagin.studio`-URL (für **Email** korrekt; der `/api/fahrzeug/imagin`-Proxy ist browser-only). `CUSTOMER = NEXT_PUBLIC_IMAGIN_CUSTOMER ?? 'demo'`. imagin-Freischaltung flippt nur die Env → echte Autos.
- **Berater-Datenquelle (Aaron 2026-05-29):** **bis Termin stattgefunden → zugewiesener Dispatcher; danach → Kundenbetreuer.** Kundenbetreuer-SSoT = `claims.kundenbetreuer_id` (`faelle.kundenbetreuer_id` = DUP, nicht nutzen). Dispatcher-Zuweisung: **Spalte noch zu verifizieren** (siehe Task 0).

---

## Task 0 — Schema-Verifikation (BLOCKER, zuerst, kein Raten an Live-Mail)

`information_schema` live abfragen (READ; Memory: Snapshots stale, parallele Drops):

```sql
-- (a) zugewiesener Dispatcher: welche Spalte?
SELECT table_name, column_name FROM information_schema.columns
WHERE table_name IN ('leads','faelle','claims')
  AND (column_name ILIKE '%dispatch%' OR column_name ILIKE '%bearbeiter%'
       OR column_name ILIKE '%zugewiesen%' OR column_name ILIKE '%owner%');
-- (b) Kundenbetreuer + Profilfelder bestätigen
SELECT column_name FROM information_schema.columns WHERE table_name='claims' AND column_name='kundenbetreuer_id';
SELECT column_name FROM information_schema.columns WHERE table_name='profiles'
  AND column_name IN ('anzeigename','vorname','nachname','avatar_url','telefon','telefonnummer');
-- (c) Fahrzeug-Lackfarbe für imagin (optional)
SELECT column_name FROM information_schema.columns WHERE table_name='faelle'
  AND (column_name ILIKE '%farbe%' OR column_name ILIKE '%lack%');
```

**Entscheidung nach (a):** Gibt es keine per-Lead/Claim-Dispatcher-Zuweisung → **Fallback-Strategie mit Aaron klären** (Optionen: generisches Claimondo-Team wie Mockup v7 · ODER ersten Dispatcher · ODER Berater-Block pre-Termin ganz weglassen). **Nicht** raten.

---

## Task 1 — Berater-Resolver (Caller-seitig, getestet)

**File:** `src/lib/email/google/kunde-berater.ts` (neu) + Test.

`resolveKundeBerater(db, { claimId, fallId, terminVergangen })` → `{ name: string; photoUrl: string|null; contact: string } | null`:
- `terminVergangen` (es gab einen Termin in der Vergangenheit) → Kundenbetreuer aus `claims.kundenbetreuer_id` → `profiles(anzeigename|vorname+nachname, avatar_url, telefon)`.
- sonst (pre-Termin) → zugewiesener Dispatcher (Spalte aus Task 0).
- `contact` = Telefon/WhatsApp-Zeile (Format wie Mockup: „WhatsApp · 0221 …"). Kein Treffer → `null` (BeraterCard wird dann ausgelassen — datengetrieben).
- **TDD:** Test mit gemocktem `db` für beide Phasen + Null-Fall.

> `terminVergangen` bestimmen: `gutachter_termine` für den Claim mit `start_zeit < now()` und `status='bestaetigt'` (o. ä.). In `sendKundeWelcome` ableiten und an den Resolver geben.

---

## Task 2 — Fahrzeugbild + Status im Caller

In `sendKundeWelcome` (flows.ts) zusätzlich bauen und an Props geben:
- `fahrzeugBildUrl = buildImaginUrl({ hersteller: fall.fahrzeug_hersteller, modell: fall.fahrzeug_modell, lackfarbe: <aus Task 0c, sonst null>, baujahr: null })` → `string | null`.
- `fahrzeugLabel` bleibt der bestehende `fahrzeug`-String (für VehicleCard-Fußzeile + StatGrid-Kachel).
- `berater = await resolveKundeBerater(...)`.
- `statusLabel` + `timelineIndex` aus `claims.status` (einfache Map; Welcome i. d. R. Schritt 0 „Gutachten"). Konservativ: Pill „In Bearbeitung", Timeline `['Gutachten','Anwalt','Auszahlung']` index 0 — oder Status-Map wenn vorhanden.
- Alle neuen Felder **optional** in `Props` ergänzen (nullable), damit andere Caller/Tests nicht brechen.

---

## Task 3 — KundeWelcome auf Primitives (Template-Rewrite, Branches erhalten)

`KundeWelcomeEmail` neu mit P1a-Primitives — **funktionaler Kern bleibt 1:1**:
- `EmailShell` (backgroundUrl = gebackenes Hero-Bild aus P1b **falls vorhanden**, sonst Navy-Fallback) statt `EmailLayout`.
- `Hero` (logoUrl aus brand|Claimondo, headline = `s.heading(vorname)`, subline = Kurzversion) + `VehicleCard` (nur wenn `fahrzeugBildUrl`).
- Weiße Content-`Card` (→ **neues Primitive `Card`/SectionCard für Email** ergänzen, P1a hatte keins; das war im Smoke noch ein Inline-`div`) mit:
  - Zeile „Ihr Fall im Überblick" + `StatusPill`
  - `StatGrid` (Fallnummer/Unfalldatum/Fahrzeug/Versicherung/Adresse — leere raus)
  - `BeraterCard` (nur wenn `berater`)
  - **Termin-Block** (bestehende `terminInfo`-Logik, neu mit `InfoRow`/`Callout`)
  - **loginInfo / accountExists / flowToken** — alle 3 Zweige erhalten; CTA = `Button`-Primitive; Zugangsdaten-Block als `Callout`/`InfoRow` (Magic-Link + Email + Passwort + Hints, monospace)
  - `Trustbar` (§249 BGB etc.) + `Timeline` (optional)
- `Footer onDark`.
- **brand-Whitelabel** weiter durchreichen (Hero-Logo + Button-bg = `brand.primary/secondary`).
- **i18n:** alle Texte über `s.*`; neue sichtbare Strings (StatusPill-Label, „Ihr Fall im Überblick", Trustbar-Items) als neue Keys in `KundeWelcome.i18n.ts` für alle 6 Sprachen ergänzen (de + en/tr/ar/ru/pl — analog Track-B-Muster). **de muss visuell ~identisch zum Mockup bleiben.**

> **Neues Primitive nötig:** `Card`/`SectionCard` (weiße gerundete Content-Box mit Shadow) — gehört eigentlich in P1a-Set; hier nachziehen + Test (analog P1a-Tasks).

---

## Task 4 — Render-Smoke (Pflicht, Live-Mail) + Build-Gate

- Throwaway-Render aller relevanten Zustände → HTML → Playwright-Screenshot (wie P1a-Smoke), **je Zustand**: (a) frisch+loginInfo+Termin+Auto+Berater, (b) accountExists ohne Termin, (c) flowToken/noAccount, (d) **gebrandet** (brand gesetzt), (e) ohne Fahrzeugbild (imagin null). Screenshots im selben Turn auswerten (Memory: Smoke=Screenshot-Pflicht).
- `npm run build` (Template wird von Route/Flow konsumiert → voller Build, nicht nur tsc) + `vitest run src/lib/email`.
- Plain-Text-Multipart + Dark-Mode-Feinschliff → **P4** (nicht hier), aber Bild:Text-Ratio im Auge behalten.

## Task 5 — PR + Audit

PR `--base staging`, 7-Punkte-Audit. **Hervorheben:** Zugangsdaten-/Magic-Link-Pfad unverändert funktional, nur Optik; alle 3 Account-Zustände + Termin + Whitelabel + i18n gesmoked.

---

## Offene Entscheidungen (vor/bei Task 0)

1. **Dispatcher-Zuweisung** — Spalte/Strategie (Task 0a). Wenn keine → Fallback mit Aaron.
2. **imagin-Freischaltung** — bis dahin `demo` (Wasserzeichen) ODER Fahrzeugbild ausblenden bis live? (Default-Vorschlag: ausblenden statt Wasserzeichen an Kunden.)
3. **Hero-Hintergrund** — flach Navy (jetzt) ODER auf P1b (gebackenes Foto) warten? P2 kann mit Navy live, P1b liefert nach.
4. **Timeline im Welcome** — zeigen (Trust) oder weglassen (Welcome ist früh, evtl. zu leer)?
5. **Weißes Logo-Asset** für dunkle Hero-Fläche (sonst Logo-Chip wie Mockup).

**Folgepläne:** P1b (Hero-Bild-Pipeline: sharp+imagin+Storage) · P3 (Sweep restliche ~38 Templates nach Tier) · P4 (Plain-Text/Dark-Mode + react-email-dev-Preview-Harness).
