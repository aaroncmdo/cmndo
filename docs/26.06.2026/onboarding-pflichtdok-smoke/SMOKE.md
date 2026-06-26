# Onboarding + Pflichtdokumente — Smoke-Paket (26.06.2026)

Ziel (Aaron): Volle gewollte Funktionalität von FlowLink bis Gutachten-Prüfung +
Kanzlei-Versand über **alle Rollen** prüfen, mit gestellten Daten — und insbesondere:
**werden die Pflichtdokumente richtig abgefragt, je nachdem was angegeben wurde?**

---

## 1. Wie das dynamische Onboarding abläuft (Ist-Stand)

DB-config-getrieben (nicht hardcoded):

- **`onboarding_phasen`** (flow_key + reihenfolge + `conditional_on`) +
  **`onboarding_felder`** (feld_key, typ, `db_target {tabelle, spalte}`, `pflicht`,
  `conditional_on {feld, equals}`, `audience` = kunde/dispatcher/beide).
- **Flows:** `lead-erfassung` (FlowLink + Dispatcher), `kunde-onboarding`
  (post-login, datenabhängig), `sv-onboarding`.
- **Ein Writer-Router** `saveOnboardingFields` → gruppiert Felder nach
  `db_target.tabelle`, dispatcht an Handler (claims / claim_parties / leads / gfa /
  profiles / sachverstaendige). Unbekanntes Ziel = harter Fehler (kein stiller Verlust).
- **Bedingte Folgefragen:** `conditional_on={feld,equals}` (exakter String-Vergleich).
- **Skip:** Phasen mit erfüllten Pflichtfeldern werden übersprungen.
- **Pipeline:** `/flow/[token]` → `ladeFlowPhasen` → `FlowWizardKfz` →
  `speichereFeststellungFlow` → Router → leads-Handler. SA-Sign:
  `signSAandCreateFall` → `convertLeadToClaim` (claims+parties+vehicles+bridge,
  idempotent) → Termin reserviert→bestätigt → Auftrag → Willkommens-WA.

## 2. Lifecycle + Rollen (FlowLink → Kanzlei)

`Kunde` FlowLink/SA → **Ph2 Vorbereitung** (Vollmacht/ZB1/FIN — Kunde+KB) →
**Ph3 Besichtigung** (`SV` unterwegs/vor Ort) → **Ph4 Gutachten** (`SV` Upload →
OCR → **`KB` Filmcheck/QC** `saveFilmcheck` setzt `kanzlei_uebergeben_am`) →
**Ph5 Kanzlei** (`Kanzlei` Mandatsnr./Anschlussschreiben) → **Ph6/7** Regulierung/Rüge
→ **8/9** Auszahlung/Abschluss. Phasen = `subphase-resolver.ts` (pure function).

Portale/Auth: Kunde `/kunde`, SV `/gutachter`, KB `/mitarbeiter`, Dispatch
`/dispatch`, Kanzlei `/kanzlei`, Admin `/admin` (+2FA). Test-Accounts umgehen 2FA.

---

## 3. 🔴 KERN-BEFUND: 4 divergierende Pflichtdokument-Quellen

| Quelle | Was | Konsument |
|---|---|---|
| `data-requirements.ts` DOC_DEFINITIONS (**8 hardcoded Slots**) | `getOffeneDokumentAnforderungen` | **operative Anzeige**: Kunde-Onboarding-Wizard (OnboardingWizard.tsx:249) + SV/KB-Fallakte (pflicht-for-fall.ts:117) + Banner |
| `erwartung.ts` `berechneErwartung` | dokumentierte „SSoT" | Dispatch-DokumenteAnfordernCard |
| `dokument_katalog` (DB, Rule-DSL) | freigeschaltet/pflicht-Regeln | Flow-Anlage + Kunde-Step-4 „freie Slots" (optional) |
| `create-pflicht.ts` Supplementär | **nur 5 Slots** (Katalog-Loop entfernt, Z. 46-54) | self-service Flow (flow/actions.ts:499/979) |

`convertLeadToClaim` erzeugt **gar keine** pflichtdokumente-Zeilen (nur der
Flow-Pfad via `createPflichtdokumenteFromKatalog`).

### Verifizierte Drifts (Layer-1-Smoke, deterministisch)

| # | Trigger | Soll (Katalog/Absicht) | Operative Kunde-Anzeige | Status |
|---|---|---|---|---|
| 1 | Leasing/Finanzierung | `freigabe_bank` **Pflicht** | **fehlt** (nur optionaler Step-4-Slot) | 🔴 |
| 2 | Fahrerflucht ohne Polizei | `polizeibericht` Pflicht (Supplementär legt Row an) | **unsichtbar** (Filter über polizei_vor_ort) | 🔴 |
| 3 | Personenschaden | `diagnosebericht` Pflicht? | operativ=Pflicht, berechneErwartung=optional | 🔴 Konflikt |
| 4 | Zeugen | Katalog-Slot `zeugenbericht` | berechneErwartung nutzt `zeugenaussage` (andere ID) | 🔴 ID-Mismatch |
| 5 | Vorschäden | `altes_gutachten`/`kaufvertrag`/`reparaturrechnung_vorschaden` Pflicht | fehlt in beiden Code-Quellen | ⚠️ nur Katalog |
| 6 | Dispatch/Admin-Anlage | pflichtdokumente | convertLeadToClaim erzeugt keine | ⚠️ |

GRÜN (konsistent, Regressionsschutz): fahrzeugschein, unfallfotos, aerztliches_attest,
sachschaden_foto, ZB1-bestätigt→kein Pflicht, polizei_vor_ort→polizeibericht.

---

## 4. Smoke-Layer

### Layer 1 — Pflichtdokument-Konsistenz (deterministisch, läuft lokal) ✅ GEBAUT+GRÜN
`src/lib/dokumente/pflichtdok-konsistenz.test.ts` — vergleicht die reinen Funktionen
`berechneErwartung` (Quelle 2) vs `getOffeneDokumentAnforderungen` (Quelle 1) über die
Szenario-Matrix. GRÜNE Tests = Konsistenz; `it.fails` = die 4 Drifts (Suite bleibt grün,
dokumentiert Bug, schlägt bei Fix automatisch um).

```
npx vitest run src/lib/dokumente/pflichtdok-konsistenz.test.ts
# erwartet: 6 passed | 4 expected fail (10)
```

### Layer 2 — Voll-Lifecycle × Rollen (Playwright, staging) — siehe spec
`tests/e2e/flows/onboarding-pflichtdok.spec.ts` — public Wizard → Lead → SA →
Kunde-Onboarding-Doc-Checklist → SV-Upload → KB-Filmcheck → Kanzlei-Sicht.

**Run (staging, alle Rollen):**
```
PLAYWRIGHT_BASE_URL=https://app.staging.claimondo.de \
  STAGING_BASIC_USER=aaroncmdo STAGING_BASIC_PASS='<staging-basic-pass>' \
  TEST_SV_EMAIL=test-sv@claimondo.de TEST_SV_PASSWORD=Test1234! \
  npx playwright test onboarding-pflichtdok --workers=1
```
Voraussetzungen: staging erreichbar + Basic-Auth-Pass + Test-Accounts (Test1234!).
Schreibt gestellte Claims auf die geteilte DB (SMOKE-<RUN_ID>-markiert).

---

## 5. Empfehlung
Die Drifts (1-4) sind echte Bugs in der Bedarfsermittlung. Vorschlag: **eine**
Quelle kanonisieren (Katalog als SSoT, `getOffeneDokumentAnforderungen` daraus
ableiten statt 8 Hardcodes) — analog zur View-Kanonisierung. Bis dahin schützt
Layer 1 vor weiterer Drift + dokumentiert den Ist-Stand.
