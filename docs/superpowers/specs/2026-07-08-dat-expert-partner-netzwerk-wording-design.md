# Marketing-Claim-Fix: "DAT-zertifiziert" -> "Zugang zum DAT Expert Partner-Netzwerk"

**Datum:** 2026-07-08
**Branch:** `kitta/dat-partner-netzwerk-wording` (off `staging`, PR gegen `staging`)
**Trigger:** Aaron — den Compliance-Pivot vom 22.05.2026 auf die Surfaces ausrollen, die NACH
jenem Fix gebaut wurden bzw. übersehen wurden (Cluster-LPs, autounfall.io, claimondo-marketing).
Ziel-Framing: "wir haben Zugriff auf das DAT Expert Partner Netzwerk" (Zugang/Mitgliedschaft,
KEINE Zertifizierung des einzelnen Partners durch die DAT).

## Hintergrund / Policy (22.05.2026, BRAND-IDENTITY-SOT)

"DAT-zertifiziert" ist als Marketing-Claim VERBOTEN — wir können eine DAT-Zertifizierung nicht
für jeden Partner-Sachverständigen garantieren. Korrekt:
- Partner sind "zertifiziert" / "geprüft" (OHNE DAT-Qualifizierer).
- Die DAT-Beziehung wird als NETZWERK-ZUGANG formuliert: "Zugang zum DAT Expert Partner-Netzwerk".

Der 22.05-Fix lief nur über die damalige `src/`-App. Die Cluster-LPs (`kfz-gutachter-*`) und
autounfall.io wurden später gebaut und führten den Claim wieder ein; `claimondo-marketing/` ist
ein separater Build mit eigener i18n-Kopie.

## Transformations-Regeln (konsistent über alle Surfaces)

1. **Partner-Qualifizierer entfernen:** `DAT-zertifiziert(e/er/es/en)` / `DAT-geprüft(e)` ->
   `zertifiziert` bzw. `geprüft` (DAT streichen; Satzanfang groß).
2. **DAT-Bezug = Netzwerk-Zugang:** wo der DAT-Bezug erhalten bleiben soll, als
   "Zugang zum DAT Expert Partner-Netzwerk" / "aus dem DAT Expert Partner-Netzwerk".
3. **KPI-Kachel** (Wert "DAT" + Label): Wert **"DAT" bleibt**, Label ->
   "Expert Partner-Netzwerk". Lokalisiert (Programmname "Expert Partner" bleibt, nur
   "Netzwerk" wird übersetzt):
   - de `Expert Partner-Netzwerk`
   - en `Expert Partner network`
   - tr `Expert Partner ağı`
   - pl `sieć Expert Partner`
   - ru `сеть Expert Partner`
   - ar `شبكة Expert Partner`

## Scope (Aaron 08.07.: **nur sichtbare UI-Texte**)

### DRIN
- **Cluster-LPs ×5** (`aachen/bonn/duesseldorf/koeln/wuppertal`), je 3 sichtbare Stellen:
  - `components/Footer.tsx`: "DAT-zertifizierte Partner-Sachverständige vor Ort" -> "Zertifizierte Partner-Sachverständige vor Ort"
  - `components/UeberUnsSection.tsx` (Mobile-Trust-Pill): Pill-Sub "zertifiziert" -> "Expert Partner" (Mikro-Pill, Geschwister sind Ein-Wort; rendert "DAT / Expert Partner")
  - `components/UeberUnsSection.tsx` (Desktop-Body): "DAT-zertifiziert, ingenieurbasiert, gerichtsfest. Als Claimondo-Partner ..." -> "Zertifiziert, ingenieurbasiert, gerichtsfest — mit Zugang zum DAT Expert Partner-Netzwerk. Als Claimondo-Partner ..."
- **claimondo.de** (`claimondo-marketing/`):
  - i18n-KPI-Labels: je Locale 4 Kacheln (`ueber_uns.kpis`, `gutachter_finden.kpis`, `trust_stats`, `trust_stat_3`) × 6 Locales -> Label auf lokalisiertes "Expert Partner-Netzwerk" (Wert "DAT" bleibt).
  - `app/kfzgutachter-lp/page.tsx` + `app/[locale]/kfzgutachter-lp/page.tsx` TrustBar: "100+ DAT-geprüfte Gutachter" -> "100+ geprüfte Gutachter".
- **autounfall.io** — `content/rest-pages.manual.ts` (manuell, editierbar): alle explPartner-Claims "DAT-zertifiziert(e/es) Sachverständige(n) / Sachverständigen-Netzwerk" -> reframe nach Regel 1/2.

### RAUS (bewusst nicht angefasst — kein Silent-Cap)
- **src/** komplett: die KPI-Keys (`gutachter_finden`/`trust_stats`/`trust_stat_3`) sind in `src/`
  NICHT gerendert (verifiziert: 0 Consumer ausser unrelated `admin/page.tsx`) = totes Residuum,
  nicht "sichtbar". (Falls je reaktiviert -> gleicher Fix als Dead-Code-Cleanup.)
- **Maschinen-Texte:** JSON-LD (`hasCredential`/`memberOf`), `llms.txt`/`llms-full.txt`, OG-Images,
  `<meta description>` (inkl. Cluster `layout.tsx:13`), `service-pitch.ts`, alt-Texte
  (`UeberUnsSection`-Team-Foto), Screen-Reader-H1 (`gutachter_finden.sr_h1` "DAT-certified").
- **Grenzfälle** "DAT-Gutachter" / "DAT-Sachverständiger" / "DAT-Expert" / "DAT-Standard" /
  "DAT/BVSK-Standard" (Job-Titel bzw. Methoden-/Programm-Referenzen — Policy-erlaubt).

### DEFERRED — 🚩 Aaron-Entscheidung
- `autounfall-io/content/rest-pages.generated.ts` + `articles.generated.ts`: Header
  "AUTO-GENERIERT ... NICHT handeditieren" (Generatoren: `scripts/port-rest.py` /
  `scripts/port-articles.py`, Quelle Prototyp-HTML). Enthalten DAT-Expert-Zertifizierungs-Claims
  UND einen ganzen Bildungs-Artikel über "DAT-Expert-Zertifizierung" (kein direkter Partner-Claim,
  sondern Markt-Erklärung — Reframe wäre inhaltliche Neufassung, nicht Phrase-Swap).
  Optionen: (a) Source-HTML fixen + regenerieren, (b) generierte Files hand-editieren (falls
  Generatoren dormant), (c) eigenes Ticket. **Nicht** still "nicht-handeditieren"-Files überschrieben.

## Verifikation
- grep-Sweep über die In-Scope-Dirs: kein sichtbarer `DAT-zertifizier`/`DAT-geprüf`/`DAT-certified`-Claim mehr.
- `JSON.parse` aller berührten i18n-Files (valide).
- `npx tsc --noEmit` wo im Worktree lauffähig; sonst CI-Build auf dem PR (separate Build-Targets pro Codebase).
- Umlaute (echte `ä/ö/ü/ß`) in allen deutschen UI-Strings.

## Nicht in diesem Fix
- autounfall generierte Files (s. DEFERRED).
- Dead-Key-Cleanup in `src/i18n` (KPI-Residuen).
- BVSK-Mitgliedschafts-Formulierungen (kein DAT-Thema).
