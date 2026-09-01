# AAR-956 P4 — Self-Service-Erfassung: Feststellung (pre-SA) + dynamische Pflicht-Nachforderung (post-SA)

**Datum:** 2026-06-03 · **Lane:** AAR-956 (`cdd8f4f3`) · **Strecke:** dispatch-config-unify **P4-A**
**Branch:** `kitta/aar-956-p4-self-service-erfassung` (off frischem `staging`)
**Memory:** `project_dispatch_config_unify`, `project_aar940_self_service`, `project_mandantenfragebogen`
**Reconciliation:** PR #2352 (Handoff §2 Gate ist durch §3a beantwortet — `/flow` ist kanonisch, nicht „deprecated")

---

## 1. Problem & Ziel

Der anonyme Self-Service-Flow (`/start` → `/flow/[token]`) führt heute (§3a) nur durch **Quali → Slot → Gutachter → SA → Account**. Es gibt **keinen Schritt, in dem der Kunde die Schadens-/Fahrzeug-/Gegner-Fakten erfasst** — der Dispatcher müsste sie nachtragen. Ziel von P4-A: der Self-Service erfasst die Daten **selbst**, „1:1 zum Dispatch im Scope, aber so einfach wie möglich" (Aaron 03.06.):

- **alles OCR-bare wird ge-OCR-t** (ein ZB1-Foto füllt die Fahrzeugdaten),
- **jedes Detail ist „vorerst überspringen"-bar**,
- **die SA ist das oberste Conversion-Ziel** — Datenerfassung darf sie nie blockieren,
- **welche Dokumente/Daten noch fehlen, wird dynamisch aus dem DB-Stand abgeleitet** (nicht statisch).

## 2. Entscheidung (Aaron, 2026-06-03)

Zwei Phasen, getrennt durch die SA:

```
① FlowLink = "allgemeine Feststellung"  (pre-SA, anon, wenige Karten-Schritte, nah am Dispatch)
     Zusammenfassung → [NEU: Feststellung] → Quali → Termin → Gutachter → ★SA★ → Account
        │ Der Kunde erklärt die FAKTEN: Konstellation, Parteien (Fahrer/Halter/Gegner),
        │ Schaden-Flags, Kennzeichen, Unfall-Eckdaten. KEINE Foto-Uploads (würden die SA verzögern).
        │ Die hier gesetzten Flags DEFINIEREN, was ② anfordert.
        ▼
   ★ SA ★ → signSAandCreateFall → convertLeadToClaim legt Fall+Claim an → ab hier fallId
        ▼
② Onboarding (post-Login) = dynamische Pflicht-Nachforderung
        │ Der bestehende adaptive Wizard (AAR-903) rendert seinen dokumente-Step
        │ NUR für die laut Konstellation offenen Pflicht-Slots (Soll−Ist aus DB).
        │ ZB1-Foto → OCR füllt FIN/HSN/TSN/Hersteller/Modell/Farbe/Baujahr.
        │ Alles skippbar; Lücken kann der Dispatcher zusätzlich anfordern (DokumenteAnfordernCard).
```

**Kernprinzip (Aaron, „extrem wichtig"):** ② ist **keine statische Liste**, sondern eine **DB-getriebene Gap-Engine** — `Soll(Konstellation/Config) − Ist(gefüllt/hochgeladen) = Pflicht-Nachforderung`. Diese Engine **existiert bereits** (s. §5).

## 3. Architektur

```
/start/[anfrageId]/route.ts        HMAC → issueCanonicalFlowLinkForAnfrage (gfa→Lead) → 307 /flow/[token]
         │  (Lead trägt schon Monika-Anfrage-Daten: Kontakt + Schaden-Basis)
         ▼
/flow/[token]/FlowWizardKfz.tsx    §3a-Steps + NEU ① Feststellungs-Step(s)
         │  rendert lead-erfassung(audience kunde/beide) NICHT-Upload-Felder via FieldRenderer
         ▼
signSAandCreateFall  →  convertLeadToClaim  (claim_parties + vehicle + claims, alles aus lead-Spalten)
         ▼
/kunde/onboarding   (adaptiver Wizard, AAR-903)  →  dokumente-Step (dynamische Pflicht-Engine)
```

**Eine Config bleibt:** ① und ② rendern Felder DESSELBEN `lead-erfassung`-Topfs — ① das deklarative Subset, ② die Upload-/Dokument-Felder + OCR-Folgedaten. Kunde + Dispatcher teilen damit dieselbe `onboarding_felder`-Definition (der Sinn der ganzen Strecke).

## 4. ① Feststellung (NEU — der eigentliche Build)

**Wo:** Neue Step(s) in `src/app/flow/[token]/FlowWizardKfz.tsx`, **vor** der SA. §3a-`StepId` wird erweitert (heute `zusammenfassung|quali|termin|gutachter|sa|account`). Die dynamische-STEPS-Architektur + die Stale-Index-Lehre (§3a-Fixes #2328/#2333) gelten — alle Step-Inputs beim Mount cappen.

**Was (Feld-Schnitt nach `typ`):** ① rendert die `lead-erfassung`-Felder mit `audience ∈ {kunde, beide}` und **Nicht-Upload-`typ`** (`text|tel|email|textarea|number|segmented|toggle-cards`). Upload-`typ` (`file|zb1-upload`) → ② (§5). Konkret (aus dem Config-Seed):

| Sektion | ①-Felder (deklarativ, pre-SA) | Zweck |
|---|---|---|
| **kontakt** | vorname, nachname, telefon, email, bevorzugter_kanal, kunde_strasse/plz/stadt | Ansprechpartner + Account (großteils aus `/start` vorbefüllt → bestätigen) |
| **schaden** | schadentyp, schaden_sichtbar, unfallhergang, fahrzeugschaden_beschreibung, **personenschaden_flag, sachschaden_flag, mietwagen_flag, nutzungsausfall, hat_vorschaeden** | Konstellation + **die Flags, die ② definieren** |
| **schuld** | schuldfrage | = §3a-Quali (bestehender quali-Step, NICHT doppeln — s. §8) |
| **fahrzeug** | kennzeichen, ist_fahrzeughalter, halter_vorname/nachname/geburtsdatum/strasse/plz/stadt | Fahrzeug-ID + Halter/Fahrer-Zuordnung (FIN/HSN/TSN/Farbe/Baujahr kommen via ZB1-OCR in ②) |
| **unfall** | unfallort, unfalldatum, unfall_uhrzeit, **polizei_vor_ort**, polizei_aktenzeichen, gegner_kennzeichen, gegner_versicherung, gegner_schadennummer, gegner_telefon, gegner_email, zeugen | Unfall-Eckdaten + Gegner-Fakten + `polizei_vor_ort` (treibt Polizeibericht-Pflicht in ②) |
| **service_kanzlei** | service_typ, kanzlei_wunsch | Service-Wahl (optional/skippbar) |

`termin_sv` + `vollmacht` sind **nicht** ①-Felder: Termin macht der §3a-Slot-Step, die Unterschrift der §3a-SA-Step.

**Wie:** `ladeFlowPhasen('lead-erfassung', 'kunde')` (existiert, P2a) liefert die Phasen/Felder; `FieldRenderer` (existiert, P2a) rendert sie. Die Step(s) speichern via einer schlanken `speichereFeststellungFlow`-Server-Action (Allowlist + `db_target` aus `onboarding_felder`, Muster: `saveDispatchLeadFelder`/`speichereQualiFlow`). **`pflicht=false` für alle Felder → in ① ist nichts erzwungen**, jedes Feld „vorerst überspringen"-bar. Die Konstellation/Schuldfrage muss der Kunde aber sehen/bestätigen, bevor er die SA unterschreibt (Quali-Gate bleibt §3a).

**Gruppierung „in wenige Schritte":** Vorschlag — 3 Karten: **(a) Schaden & Konstellation** (schaden-Sektion + schuld), **(b) Fahrzeug & Beteiligte** (fahrzeug-Facts + Gegner aus unfall), **(c) Unfall-Eckdaten** (Ort/Datum/Polizei/Zeugen). Kontakt ist meist aus `/start` da → als kompakter Bestätigungs-Block, nicht eigener Step. (Genaue Gruppierung = Plan-Detail.)

## 5. ② Dynamische Pflicht-Nachforderung (REUSE — die Engine existiert)

**Die Engine ist gebaut und kunde-facing.** P4-A verdrahtet den Self-Service-Fall hinein, baut sie nicht neu:

| Baustein | Datei | Rolle |
|---|---|---|
| Smart-Soll/Ist pro Slot | `lib/claims/data-requirements.ts` → `getOffeneDokumentAnforderungen(claim, pflichtDocs, leadZb1Status)` | ZB1 wenn `zb1_status!='bestaetigt'`, Polizeibericht wenn `polizei_vor_ort`, Atteste wenn `hat_personenschaden`, Sachschaden-Docs wenn `hat_sachschaden`, Schaden-/Unfallfotos immer → Status `offen/erfuellt/spaeter` aus DB |
| Voll DB-getriebene Regel-Engine | `lib/dokumente/pflicht-evaluator.ts` → `evaluatePflichtdocs({katalog, fall, lead, pflichtdokumente})` | `dokument_katalog`-Slots mit `freigeschaltet_wenn`/`pflicht_wenn`-Regeln gegen fall+lead — „dynamisch anhand DB-Stand" |
| Adaptiver Onboarding-Wizard | `app/kunde/onboarding/get-onboarding-steps.ts` | `dokumente`-Step erscheint nur bei `offenePflichtdokumente > 0` |
| Kunde-Surfaces | `components/kunde/{PflichtdokumenteBanner,OffeneDatenBanner}.tsx`, `lib/kunde/jetzt-zu-tun.ts` | zeigen die offenen Pflicht-Items dem eingeloggten Kunden |
| ZB1-Upload + OCR | `components/onboarding/fields/Zb1UploadField.tsx`, `app/kunde/onboarding-details/zb1-actions.ts` (`confirmZb1Korrekturen(fallId)`/`clearZb1Felder(fallId)`) | post-fall → **fallId vorhanden → funktioniert nativ** |

**P4-A-②-Arbeit (Verdrahtung, klein):**
1. **Verifizieren**, dass der Self-Service-Fall (nach `convertLeadToClaim`) im post-Login-`/kunde/onboarding` mit dem dynamischen `dokumente`-Step landet und die Pflicht-Slots korrekt aus den ①-Flags berechnet werden (Smoke).
2. **Lücke schließen, falls vorhanden:** die ①-Flags (`personenschaden_flag`/`sachschaden_flag`/`polizei_vor_ort`) müssen auf den Claim durchschlagen, damit `getOffeneDokumentAnforderungen` sie sieht — `convertLeadToClaim` mappt sie bereits (`hat_personenschaden`/`hat_sachschaden`/`polizei_vor_ort`), also nur verifizieren.
3. **Optional (eigener Sub-PR):** ein „Daten-Nachtrag"-Step für die wenigen Nicht-Dokument-Felder, die in ① übersprungen wurden (oder schlicht der Fallakte-`PflichtdokumenteSection` + Dispatch-Anforderung überlassen).

## 6. §8b / P4-B (token-basierte OCR-confirm/clear) entfällt

Der Handoff sah P4-B vor: `confirmZb1Korrekturen`/`clearZb1Felder` **token-basiert** statt `fallId`-gated, weil ein „Pre-Fall-Kunden-ZB1-Pfad" Korrekturen ohne `fallId` verlieren würde. **Unter diesem Design gibt es keinen Pre-Fall-ZB1:** die Dokumente/OCR laufen in ② (post-SA, post-`convertLeadToClaim`) → `fallId` existiert → die **bestehenden** `fallId`-Funktionen (`zb1-actions.ts`) wirken nativ. → **P4-B ersatzlos gestrichen.** Kein toter Code, kein Token-Refactor. (Bestätigt die P2e-Empirie: ohne Pre-Fall-ZB1 wäre Token-OCR „toter + un-smoke-barer Code".)

## 7. Daten-Fluss (warum die lead-Spalten reichen)

① schreibt **lead-Spalten** (via `db_target`). `convertLeadToClaim` (`lib/leads/convert-lead-to-claim.ts`) mappt sie bei der SA auf Claim-Entitäten — verifiziert, **extrem tolerant** (alles `?? null`/`?? false`/Default, `schadentag ?? heute`, KB per Round-Robin):

| ①-Fakt | lead-Spalte(n) | → Claim-Entität |
|---|---|---|
| Ansprechpartner | vorname/nachname/email/telefon/anrede/kunde_strasse/plz/stadt | `claim_parties[geschaedigter]` (immer angelegt) |
| Fahrer | halter_ungleich_fahrer_flag | `party.ist_fahrer` |
| Halter | ist_fahrzeughalter, halter_* | `party.ist_halter` + Halter-Felder |
| Fahrzeug | kennzeichen, fin(→OCR) | `vehicle` (via `ensureVehicleFromFin`) + `party.kennzeichen` + `claims.vehicle_id` |
| Gegner | gegner_kennzeichen/versicherung/name/schadennummer | `claim_parties[verursacher]` (angelegt wenn `gegner_bekannt≠false` UND ein Identifier da) |
| Konstellation | schadentyp/schadens_art/schuldfrage/unfall_konstellation | `claims.kunden_konstellation/schadenart` + Quali |
| Schaden-Flags | personenschaden_flag/sachschaden_flag/mietwagen_flag/polizei_vor_ort | `claims.hat_personenschaden/...` → **treiben ②** |
| SA | (Signatur-URL) | `claims.sa_unterschrieben/abtretung_pdf` |

**Konsequenz:** „notwendig" heißt **nicht** „sonst crasht der Insert" (der Claim ist tolerant), sondern **„sonst ist der Claim unbrauchbar / ② weiß nicht, was fehlt"**. Darum ist ① auf die Fakten + Flags fokussiert, nicht auf Vollständigkeit um jeden Preis.

## 8. Risiken / offene Punkte

- **Quali-Doppelung:** §3a hat einen `quali`-Step (`schuldfrage`). Die ①-`schuld`-Sektion **nicht** zusätzlich rendern — `schuldfrage` bleibt beim §3a-quali-Step, ① überspringt sie. (Plan: ①-Feldfilter schließt `schuldfrage` aus.)
- **②-Erfassung von Nicht-Dokument-Feldern:** die Engine (`data-requirements`) ist heute **Dokument**-zentriert (Slots = Uploads). Reine Datenfelder (z.B. Halter-Adresse), die in ① übersprungen wurden, deckt sie nicht automatisch ab → entweder (a) Fallakte-`PflichtdokumenteSection` + Dispatch-Anforderung genügen, oder (b) ein kleiner „offene Daten"-Reuse von `OffeneDatenBanner`. **Entscheidung in den Plan ziehen; YAGNI-Default = (a).**
- **`/start`-Vorbefüllung:** wie viel die Monika-`gfa` schon liefert, bestimmt, wie „leer" ① startet. Plan-Schritt: `issueCanonicalFlowLinkForAnfrage` lesen → die aus der gfa gemappten lead-Spalten dokumentieren, damit ① sie als „bestätigen" statt „neu" zeigt.
- **Flag-Gate:** der ganze Pfad bleibt hinter `CANONICAL_FLOWLINK_ENABLED` (prod off). Kein Live-Kunde betroffen bis Aarons Go.
- **Kollision:** `FlowWizardKfz.tsx` ist AAR-956-Territorium; die `aar-939-monika-embed`-Sessions sind /flow-nah → vor Edit Branch-Stand koordinieren.

## 9. Scope / Non-Goals

- **In Scope (P4-A):** ① Feststellungs-Step(s) in `/flow` + ②-Verdrahtung + Verifikation der Pflicht-Engine fürs Self-Service. §8b **gestrichen**.
- **Out (eigene Cycles):** **C** i18n (`_specs/portal-i18n/`), **D** die 4 Minor-Gaps (grüne-Karte/email-sv-check NEU, lackfarbe+imagin, kunde-Geocoding) — separate Specs/PRs. **B** (§8b) entfällt ganz.
- **Kein** Rewrite des §3a-`/flow` (lean path to SA bleibt), **kein** Antasten von `/anfrage` (stirbt via Phase C), **kein** neuer Pre-Fall-ZB1-Pfad.

## 10. Betroffene Files

- **Geändert:** `src/app/flow/[token]/FlowWizardKfz.tsx` (① Step[s] + StepId), `src/app/flow/[token]/page.tsx` (Feststellungs-Phasen laden), **NEU** `src/app/flow/[token]/self-service-feststellung-actions.ts` (`speichereFeststellungFlow`, Allowlist aus `onboarding_felder`).
- **Reuse (unverändert):** `components/onboarding/FieldRenderer.tsx`, `lib/onboarding/lade-flow-phasen.ts`, `lib/claims/data-requirements.ts`, `lib/dokumente/pflicht-evaluator.ts`, `app/kunde/onboarding/*`, `components/kunde/{PflichtdokumenteBanner,OffeneDatenBanner}.tsx`, `app/kunde/onboarding-details/zb1-actions.ts`, `lib/leads/convert-lead-to-claim.ts`.
- **Config:** evtl. Migration, falls der ①↔② `typ`-Schnitt eine Markierung braucht (Default: code-seitig über `typ`, **keine** Migration nötig).

## 11. Smoke / Validierung

- **E2E (Flag an, staging-isoliert):** Marketing-Wizard → `/start` → `/flow` → **① Feststellung** (Fakten/Flags setzen) → Quali → Slot → Gutachter → **SA** → Account → Login → **`/kunde/onboarding` dokumente-Step zeigt genau die laut Flags offenen Pflicht-Slots** (z.B. `personenschaden_flag=true` → Attest erscheint; `polizei_vor_ort=true` → Polizeibericht). ZB1-Foto hochladen → OCR füllt Fahrzeugdaten → `confirmZb1Korrekturen(fallId)` persistiert.
- **DB-Verify:** Lead-Spalten aus ① gesetzt → `convertLeadToClaim` → `claim_parties` (geschädigter + ggf. verursacher), `claims.hat_personenschaden/...`, `pflichtdokumente`-Slots korrekt.
- **Test-User:** `test-kunde@claimondo.de` / `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` (2FA aus). Test-SV `1da11741-...`. Fixture + Cleanup wie §3a-Walk.
- **Negativ:** ohne Flag (`CANONICAL_FLOWLINK_ENABLED` unset) bleibt `/flow` der §3a-Pfad — keine Feststellungs-Steps, kein Regress.

---

**Nächster Schritt:** Spec-Review durch Aaron (dieses File), dann `writing-plans` → TDD-Plan in Sub-PRs (①-Step · ②-Verdrahtung · Smoke). Nicht selbst mergen; PR gegen `staging`.
