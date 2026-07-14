---
name: handoff-makler-finder-flowlink-kasko-haftpflicht
description: "AUDIT Makler->Gutachter-Finder->FlowLink: die Kette EXISTIERT lueckenlos+attribuiert (/m/<code> -> /start/makler/<id> -> Finder -> FlowLink) — nichts wiederherzustellen. EIN echter Prod-Bug: isValidPromoCodeFormat verlangt MK-+4, generatePromoCode macht MK-+8 -> alle 3 Prod-Codes fallen im /schaden-melden-Pfad durch. Kasko/Haftpflicht=schuldfrage ist die Wurzel-Weiche."
metadata:
  node_type: memory
  type: project
  originSessionId: 00fa466c-11dc-4a8f-860e-9063f0d4c1fa
---

# AUDIT — Makler → Gutachter-Finder → FlowLink (Kasko/Haftpflicht)

**Aaron 14.07.:** „Der Makler soll den Gutachter-Finder sauber an den Kunden weitergeben, mit dem FlowLink dahinter. Wir hatten es sauber. Der QR ist ja auch dafür da." + „Der gesamte FlowLink ist davon abhängig, ob der Kunde Kasko oder Haftpflicht ist. Das müssen wir als ERSTES qualifizieren."

Erhoben gegen **frisches `staging` (641936aad, 14.07.)**, Worktree `.claude/worktrees/makler-finder-flowlink`.

> **⚠️ Diese Datei wurde am 14.07. KORRIGIERT.** Die erste Fassung behauptete, die Attributions-Kette sei gebrochen. **Das war falsch** — sie stammte von Explore-Agenten, die gegen `kitta/aar-956-embed-reservierung-rueckruf` liefen (**857 Commits hinter staging**, Merge-Base 18.06.). Die Kette wurde seit Juni gebaut. Lehre: **Befunde gegen einen alten Baum sind wertlos; jede Zeilennummer am frischen Code gegenprüfen.**

---

## ✅ ERGEBNIS: Die Kette existiert lückenlos. Es gibt nichts wiederherzustellen.

Alles Datei-für-Datei am frischen Code verifiziert:

```
/makler/promo
  └─ promo/page.tsx:47   landingUrl = `${landingBase()}/m/${code}`     + buildQrSvg(landingUrl)
     Kommentar :44 — „claimondo.de/m/[Promo-Code] (Finder + Anspruch-Check, beide makler-attribuiert)"
        ↓  QR / WhatsApp / E-Mail-Signatur / Website-Embed
           (src/lib/makler/share-snippets.ts:15 → `${base}/m/${code}`, ShareTools.tsx)
        ↓
claimondo-marketing/app/[locale]/m/[code]/page.tsx
  :66 resolveMaklerByPromoCode(sb, code)      ← reiner DB-Lookup, KEIN Regex-Gate
  :68 unbekannt/inaktiv → redirect('/')        (nie 404)
  :72 promo_clicks.insert({promotion_code_id})
  :82 finderHref  = `${appOrigin}/start/makler/${target.maklerId}`
  :83 anspruchHref = `/check?m=${code}`
  :38 robots index:true  (Aaron-Entscheid 30.06.: indexierbare SEO-Mikroseite je Makler)
        ↓  MaklerHubLanding.tsx — 3× „Gutachter finden" (Z. 66, 143, 206) + 2× Anspruch-Check
        ↓
src/app/start/makler/[maklerId]/page.tsx
  :19-24 makler laden, status!=='aktiv' → redirect('/gutachter-finden')
  :27-34 primaerer aktiver promotion_codes.id des Maklers
  :40-49 <FinderMap wizardSlot={<FinderWizard promotionCodeId={promo.id} />} />
        ↓
FinderWizard.tsx:102 (prop) → :271 promotion_code_id: promotionCodeId ?? null
        ↓
embed/gutachter-finder/actions.ts (reserviereEmbedTermin)
  :360 resolvedPromoId = input.promotion_code_id ?? await resolvePromoCodeToId(input.maklerCode)
  :363 leads.update({ promotion_code_id: resolvedPromoId })
  :359 „convert-lead-to-claim loest promotion_code_id -> makler_id -> claims.makler_id (DB-Trigger -> Provision)"
        ↓
gutachter_finder_anfragen → issueCanonicalFlowLinkForAnfrage() [src/lib/start-link/issue-canonical-flowlink.ts:118]
  → pickRoundRobinDispatcher → createLead → ensureCanonicalFlowLinkForLead (idempotent, 72h, „ein Lead = ein Link")
  → /start/[anfrageId]/route.ts:18 (anon, HMAC) → redirect('/flow/'+token)
```

**Der QR trägt die Attribution durch bis zur Provision.** Genau das, was Aaron beschreibt — gebaut, nicht verloren.
Makler-Marke trägt zusätzlich über den Funnel: `MaklerEmpfehlungBadge` („Empfohlen von <Firma>") auf Tool + Finder (PR #3857, prod-gesmoked 08.07.) — siehe [[coordination-makler-brand-funnel]].

**PROD-SMOKE 14.07. (curl, echte Codes) — die Kette läuft live:**
- `https://claimondo.de/m/MK-MSA64JM4` → **HTTP 200**, gebrandet „Aaron der Makler", „Gutachter finden" 30×, finderHref → `https://app.claimondo.de/start/makler/25d60cbb-269b-42cd-92c0-b2f112738baa`
- `https://app.claimondo.de/start/makler/25d60cbb-…` → **HTTP 200**, 2,96 MB, Mapbox rendert, **kein** Redirect auf `/gutachter-finden` → Attribution intakt
- Alle 4 Prod-Makler `status='aktiv'` → das `status!=='aktiv'`-Redirect-Gate (`start/makler/[maklerId]/page.tsx:24`) feuert bei keinem.
- ⚠ `Test Makler GmbH (Smoke)` (bbbb2222) hat **keinen aktiven promotion_code** → seine `/m/`-Seite/QR ist tot (`MaklerPromoEmpty`) und `/start/makler/bbbb2222…` liefe mit `promotionCodeId=null` = unattribuiert. Nur die Fixture betroffen.

---

## 🔴🎯 DIE ECHTE LÜCKE (Aarons „bau es wieder ein") — Finder wird auf EINEM Zweig übersprungen

Aaron: „Der Makler soll den Gutachter-Finder sauber an den Kunden weitergeben, **mit dem FlowLink dann hinten dran**." → Finder **zuerst**, FlowLink **danach**.

| Weg | Verhalten | Aarons Ziel |
|---|---|---|
| QR / `/m/<code>` → `/start/makler/<id>` | **Finder (Karte, freie SV-Wahl) → dann FlowLink** | ✅ korrekt |
| Makler-Anfrage-Drawer → „📲 Link an Kunden senden" | `erstelle-anfrage.ts:194-196` `sendFlowLinkMultiChannelCore` → Kunde landet **direkt in `/flow/<token>`** | ❌ **Finder übersprungen** |

**`/flow/[token]` enthält KEINEN Gutachter-Finder** (verifiziert, frischer Baum): kein `FinderMap`, kein `FinderWizard`. Nur `FlowSlotStep.tsx:228` → `SvSlotAuswahl` (Slot-Liste eines bereits zugeordneten SV) + `WunschterminPicker`. Der Kunde **bekommt** Termine vorgesetzt, statt seinen Gutachter selbst zu **wählen**.

**Stale Kommentar = die Quelle des Missverständnisses:** `src/lib/makler/erstelle-anfrage.ts:3-4` behauptet „Entweder kanonischer FlowLink (**Kunde macht den Gutachter-Finder im lead-gekeyten /flow/[token] selbst**)". **Das ist falsch** — Gegenbeweis im Code selbst: `src/app/flow/[token]/self-service-actions.ts:218` „Hauptpfad (**FinderWizard, Task 10**) setzt den Ort bereits **vor Lead-Anlage** — dieser [Pfad] …". Der Finder läuft vor der Lead-Anlage, nicht im Flow. Kommentar beim Fix mitkorrigieren.

### Zu lösen (Design, NICHT entschieden)
Baustein liegt bereit: `/start/makler/<maklerId>` existiert, ist attribuiert, prod-verifiziert. **Problem:** die Route ist *anonym* (Finder legt via `reserviereEmbedTermin` einen NEUEN Lead an) — der Makler-Anfrage-Zweig hat aber **schon einen Lead** (mit Name/Telefon/Consent/Dispatcher). Ein naives Verlinken erzeugt einen **Doppel-Lead**.
Optionen: (a) Finder-Variante, die einen bestehenden `leadId`/Token annimmt und `reserviereEmbedTermin` auf UPDATE statt INSERT dreht; (b) FlowLink um einen echten Finder-Step erweitern (FinderMap in `/flow` einhängen, SV-Wahl → bestehender Lead); (c) Reihenfolge drehen: Anfrage erzeugt Lead erst **nach** der Finder-Auswahl. **Mit Aaron klären.**
⚠ Kollision: `erstelle-anfrage.ts` + `NeueAnfrageDrawer.tsx` werden parallel von Session 00fa466c angefasst (schuldfrage/Kennzeichen/Polizei) → abstimmen.

---

## 🔴 DER EINE ECHTE BUG — Promo-Code-Länge: Validator 4 vs. Generator 8

**Prod-verifiziert (execute_sql, 14.07.) — es gibt genau 3 Promo-Codes, ALLE 8-stellig:**

| code | Zeichen nach `MK-` | aktiv | erstellt |
|---|---|---|---|
| `MK-JEDMGPZM` | 8 | true | 2026-07-14 |
| `MK-MSA64JM4` | 8 | true | 2026-07-08 |
| `MK-PZ6XMVGQ` | 8 | true | 2026-07-07 |

(Der 4-stellige Legacy-Testcode `MK-SMKE` ist beim Go-Live-Cleanup 13.07. gelöscht worden → **0 Codes im 4-Zeichen-Format**.)

**Generator:** `src/lib/makler/promo-code.ts:14-20` — `generatePromoCode()` = `'MK-' + 8 Zeichen` aus `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ohne I/O/0/1).

**Validator-Lage:**

| Datei | Regex | passt zu `MK-`+8? |
|---|---|---|
| `src/lib/makler/resolve-promo-code.ts:7` | `/^MK-[A-Z0-9]{4,12}$/i` | ✅ |
| `src/lib/makler/makler-empfehlung.ts:12` | `/^MK-[A-Z0-9]{4,12}$/i` | ✅ |
| `src/app/api/promo/track/route.ts:13` | `/^MK-[A-Z0-9]{4,12}$/i` | ✅ |
| `claimondo-marketing/app/[locale]/page.tsx:16` | `/^MK-[A-Z0-9]{4,12}$/i` | ✅ |
| **`claimondo-marketing/lib/flow/promo-attribution.ts:20`** | **`/^MK-[A-Z0-9]{4}$/`** | ❌ |
| **`claimondo-marketing/lib/flow/schemas/mini-wizard.ts:31`** | **`/^MK-[A-Z0-9]{4}$/`** | ❌ |

`isValidPromoCodeFormat` (promo-attribution.ts:20) ist **dreifach** verbaut — kein Fallback:
1. `claimondo-marketing/app/[locale]/schaden-melden/page.tsx:46` — `initialPromo = p && isValidPromoCodeFormat(p) ? p : null` → **Code wird aus der URL geworfen, bevor das Formular ihn sieht**
2. `mini-wizard.ts:31` — Zod-Schema
3. `create-lead-from-mini-wizard.ts:60` — `if (data.promoCode && isValidPromoCodeFormat(...)) promotionCodeId = await resolvePromoCodeToId(...)` → sonst bleibt null → `:100 promotion_code_id: null`

**Wirkung:** Jeder Lead über `/schaden-melden?p=<echter Code>` ist **unattribuiert** → keine Makler-Provision. Betrifft **alle 3** existierenden Makler. Der Docstring (`:15` „Muster `MK-` + 4 Zeichen") kodiert eine Annahme, die der Generator seit jeher verletzt.

**NICHT betroffen** (kein Regex-Gate, reiner DB-Lookup): `/m/<code>` (`resolveMaklerByPromoCode`) und `/check?m=` (`check-lead-action.ts:138`) — also **genau Aarons Kette läuft**. Der Bug sitzt im *parallelen* `/schaden-melden?p=`-Einstieg.

**Fix:** `promo-attribution.ts:20` + `mini-wizard.ts:31` auf `/^MK-[A-Z0-9]{4,12}$/i` angleichen (deckungsgleich mit den 4 App-Validatoren). ⚠ Zusätzlich case: `resolve-promo.ts:11` matcht `.eq('code', code)` **ohne** `toUpperCase()`, während die Track-Pfade `/i` + normalisieren → kleingeschriebener Code wird getrackt, aber nicht aufgelöst. Beim Fix mitnehmen.
⚠ **Regel 1:** Fix gehört in `claimondo-marketing/` — eigener Top-Level-Build, NICHT vom Haupt-CI/Ratchet erfasst.

---

## 🎯 DIE WURZEL — Kasko/Haftpflicht (Aarons Punkt)

Die Weiche **existiert, ist rein und getestet** — sie wird nur **spät** gefüttert (erst im `/flow`-Quali-Step).

**Kanonisches Vokabular `leads.schuldfrage`: `'gegner' | 'unklar' | 'eigenverantwortung'`**
(`src/components/self-service/QualiOptionen.tsx:13` — „die `value`-Codes sind der Server-/State-Vertrag")

| Datei | Regel |
|---|---|
| `src/lib/werkstatt/abrechnungsweg.ts:20` `resolveAbrechnungsweg({schuldfrage, ueberEigeneVersicherung})` | `gegner` → **haftpflicht** (dominiert, VS-Frage irrelevant) · `eigenverantwortung`+VS=true → **kasko** · +false → **selbstzahler** · +null → **null** |
| `src/lib/self-service/quali-gate.ts:11` `bewerteSchuldfrage()` | `eigenverantwortung` → abbruch · `gegner` → weiter · sonst → weiter_mit_flag |
| `src/lib/self-service/quali-flow-outcome.ts:26` `qualiFlowOutcome(schuldfrage, ueberEigeneVersicherung, freieWerkstattwahl)` | komponiert beide; kasko/selbstzahler → **weiter + reparaturwunsch='reparatur'** (Direct-Reparatur, KEIN SV-Gutachten, Aaron 08.07.); nur kasko + `freieWerkstattwahl===false` → abbruch (`werkstattbindung`) |
| `src/lib/werkstatt/abrechnungsweg.ts:34` `routeForAbrechnungsweg()` | haftpflicht→`kanonisch` · kasko→`kasko_hinweis` · selbstzahler→`selbstzahler_reparatur` |

**Persistenz:** `src/app/flow/[token]/self-service-actions.ts:61-99` → `leads.eigene_versicherung = 'ja'|'nein'`.
**Convert:** `convert-lead-to-claim.ts:536-541` leitet den Abrechnungsweg aus `schuldfrage + eigene_versicherung` ab.

### 🔥 Die scharfe Kante
`qualiFlowOutcome('eigenverantwortung', **null**)` → `resolveAbrechnungsweg`=null → `bewerteSchuldfrage`='abbruch' → **disqualifizieren: true**.
**Wer `schuldfrage='eigenverantwortung'` schreibt, OHNE `eigene_versicherung` mitzuliefern, tötet den Lead still.** Die VS-Folgefrage ist Pflicht, nicht Kür — der eigentliche Grund, warum „Kasko/Haftpflicht zuerst" stimmt.

### Kein Bug (geprüft, nicht nachjagen)
Drei Schuld-Vokabulare, die **nicht** kollidieren:
1. kanonisch `gegner|unklar|eigenverantwortung` → `leads.schuldfrage`
2. Anspruch-Tool `unverschuldet|teilschuld|selbst` (`src/lib/anspruch/types.ts:20` `Schuldform`) — eigenes Konzept/Surface
3. `de.json → schuldfrage_options` mit `'ich'|'teilschuld'` — **tote i18n-Reste**, Writer von `schuldfrage='ich'` = **0 Treffer**

---

## 🔗 NAHT zu Session 00fa466c — NICHT doppelt bauen

- **00fa466c baut:** `schuldfrage` + Kasko-Folgefrage + Kennzeichen + `polizei_vor_ort` im Makler-Anfrage-Drawer `src/app/makler/(shell)/leads/NeueAnfrageDrawer.tsx` → `src/lib/makler/erstelle-anfrage.ts` → `createLead`. **Kein DDL** — alle Spalten existieren. Aaron-Entscheid: 3 Optionen + Kasko-Folgefrage; Besichtigungsort auf `besichtigungsort_*` umstellen (Label „Besichtigungsort"); Paket-Auswahl (`serviceTyp`) raus.
- **Diese Session:** was der Finder/FlowLink mit dem Wert macht (Verzweigung/Route) + ggf. der Promo-Regex-Fix.
- **Geteilte Dateien:** `erstelle-anfrage.ts`, `NeueAnfrageDrawer.tsx`. Rest disjunkt.

---

## 🗺️ Ort-Zwilling (relevant für beide)

`leads` trägt **zwei** Ort-Familien, die **nie zusammengeführt werden**:
- `besichtigungsort_adresse/_lat/_lng/_place_id/_notiz` — **1:1-Kopierliste Lead→Fall** (`src/lib/lead-fall-mapping.ts:117-121`). Leer → Fallback auf **`unfallort`** (`:401-410`, „Auto steht am Unfallort").
- `fahrzeug_standort_adresse/_lat/_lng/_place_id/_plz` — **NICHT in der Kopierliste**; einziger Reader `convert-lead-to-claim.ts:274` (Fallback für `schadenort_adresse` hinter `unfallort`).

**Folge:** Der Makler-Drawer schrieb bis 14.07. `fahrzeug_standort_*` → speiste den Besichtigungsort **nicht**; `unfallort` setzt er auch nie → Besichtigungsort blieb **null**. Gleiches Muster in `issue-canonical-flowlink.ts:158-163` (`gfa.besichtigungsort_adresse` → `lead.fahrzeug_standort_adresse`). Verwandt: `convert-lead-to-claim.ts:277` „F6 (Aaron 14.07.)". **Gehört konsolidiert, nicht punktuell geflickt.**

## Bonus-Funde (Boy-Scout, unabhängig)
- **`gutachter_finder_anfragen.regulierungs_modus` ist tot:** Writer nur `src/lib/actions/gutachter-finder-actions.ts:68 + :268`, **0 Reader**. Gefahrlos löschbar. *(Aus Stale-Baum — vor dem Löschen am frischen Code gegenprüfen.)*
- **`service_typ` NICHT droppen:** 4 RLS-Policies (Kanzlei-Sicht: `fall_dokumente`/`gutachter_termine`/`timeline`/`faelle`), `release-makler-provisionen`, Termin-State-Machine, `getVisibleMainPhases` hängen daran. Spalte ist `DEFAULT 'komplett' NOT NULL` → Formularfeld entfernen ist sicher, Spalte droppen nicht. Präzedenz: `NeuLeadDrawer.tsx` („AAR-695: service_typ raus").
- **`claimondo-marketing/lib/actions/create-lead-from-mini-wizard.ts:202-211`** macht einen **eigenen direkten `flow_links`-Insert** statt `ensureCanonicalFlowLinkForLead` — genau das Muster, das AAR-956 in der App abgeschafft hat. Konsolidierungs-Kandidat.

[[coordination-makler-brand-funnel]] · [[project-gutachter-finder-embed]] · [[coordination-aar956-reservierung-rueckruf]] · [[coordination-prod-golive-cleanup]]
