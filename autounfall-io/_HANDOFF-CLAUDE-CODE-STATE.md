# Übergabe — autounfall.io SEO/GEO-Handoff · Stand 2026-06-12

**Für:** den nächsten Claude Code, der hier weitermacht. Diese Datei ist selbsttragend — du brauchst keinen Vorkontext.
**Mission:** autounfall.io (Next.js-Ratgeber-Hub) crawlbar/indexierbar/GEO-tauglich machen, additiv, ohne die 243 Bestands-Seiten zu verändern. Cowork (eine separate Instanz) plant/brieft + nimmt über die DevTools-Bridge auf `localhost:3002` ab; **du** setzt im Repo um; **Aaron** entscheidet + deployt.

---

## 0 · TL;DR — wo wir stehen
Branch `feat/au-seo-handoff`, 6 Punkte committet (3 abgenommen, 2 in Abnahme), additiv, `*.generated.ts` unverändert. **Offen: C2 → A2 → BRIEF-04 Teil C (Deploy-Manifest).** Danach Merge + Ein-Pass-Deploy durch den Dev (inkl. aller Commits). BRIEF-06 P2 (Impressum/Schema) wartet auf Legal-Daten; BRIEF-07 (Conversion-Einbau) kommt NACH der Sichtbarkeit.

---

## 1 · WORKFLOW (Pflicht — nicht brechen)
- **EIN Punkt → `npm run build` grün → STOP → melden „Punkt X fertig, Build grün, dev auf 3002 läuft" → Cowork-Bridge-Abnahme → ERST DANN mergen.** Nicht mehrere Punkte in einem Rutsch.
- **Nie auf `main`/`staging` pushen.** Feature-Branch, Merge erst nach Abnahme (AGENTS.md Regel 1).
- **Generierte Dateien (`content/*.generated.ts`) NIE handeditieren.** Additiver Manual-Layer oder Quelle+Port. **Harte Akzeptanz jedes Punkts: `git diff` zeigt 0 Änderungen an `*.generated.ts`.**
- **Nur `autounfall-io/`-Pfade anfassen.** Der Git-Root `cmndo` ist GETEILT; `kfz-gutachter-wuppertal/` hat fremde uncommittete WIP — niemals stagen/anfassen. Beim Commit gezielt `git add autounfall-io/<pfad>`.
- **Jede Commit-Message:** AGENTS.md-7-Punkte-Audit-Block (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression) + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Umlaute** in UI-Strings echt (ä/ö/ü/ß); Commit-Messages/Kommentare dürfen ASCII sein.
- **eslint:** das Repo hat **14 PRE-EXISTING Fehler** (`react-hooks/static-components` in `components/tools/{UnfallberichtTool,KuerzungsChecker,SfRechner}.tsx`) — NICHT von uns, gehört in einen separaten Cleanup-Brief. Akzeptanz pro Punkt: **0 NEUE** Lint-Fehler in deinen Dateien (prüfen mit `npm run lint`).

---

## 2 · Repo & Umgebung
- **Repo:** `/Users/nicolaskitta/Desktop/codex-hero-test/cmndo/autounfall-io`  (Git-Root = `…/cmndo`).
- **Branch:** `feat/au-seo-handoff` (auscheckt lassen). Basis: `ceaf5d81`.
- **node_modules:** installiert (`npm ci` lief). Next 16.2.1, `output: standalone`.
- **Dev-Server:** `npm run dev -- -p 3002` (Cowork nimmt auf `localhost:3002` ab). VOR `npm run build` den Dev stoppen (`lsof -ti:3002 | xargs kill -9`), sonst `.next`-Konflikt.
- **Checks:** `npm run build` · `npm run typecheck` (tsc) · `npm run lint` (eslint).
- **AGENTS.md** (im `cmndo`-Root, via `CLAUDE.md` → `@AGENTS.md`): harte Regeln + „This is NOT the Next.js you know" (Next 16 — bei Routen/Layouts immer voller Build).

## 3 · Wichtige Pfade außerhalb des Repos
- **Quell-Prototypen (274 HTML):** `/Users/nicolaskitta/Documents/Claude/Projects/Claimondo/Marketing SEA:SEO:GEO/LP-Optimierung-kfzgutachter/autounfall-io/_PROTOTYPEN/` — alle je gebauten Seiten. Diff-verifiziert: reproduziert die committete `rest-pages.generated.ts` **byte-identisch** für die 42 Rest-Routen → sichere additive Port-Quelle.
- **Vergleich-Quell-HTMLs (Kopie):** `…/LP-Optimierung-kfzgutachter/_SRC-vergleich-html/`.
- **Briefs + Artefakte:** `…/LP-Optimierung-kfzgutachter/` (BRIEF_01..06, UWG-Check, Link-Audit-Ergebnis, dieses Handoff).
- **Windows-SOURCE-lean** (port-rest.py-SRC) ist NICHT auf diesem Mac → wir arbeiten deshalb **additiv** statt per Voll-Regen.
- **Python-Port-venv:** `/tmp/portenv` (bs4+markdownify) — ggf. neu anlegen: `python3 -m venv /tmp/portenv && /tmp/portenv/bin/pip install beautifulsoup4 markdownify`. `port-articles.py` existiert NICHT (nur `scripts/port-rest.py`, `port-pseo.py`).

---

## 4 · DONE (committet auf `feat/au-seo-handoff`)
| # | Punkt | Commit | Abnahme |
|---|---|---|---|
| BRIEF-03 | GSC/Bing/Ahrefs-Verifizierungs-Meta-Tags in `app/layout.tsx` (`metadata.verification`) | `9d4ffe01` | ✅ |
| C1 | Neue Seite `/kba-schluesselnummer` via `content/articles.manual.ts` + Merge in `content/articles/index.ts` | `4dff1905` | ✅ |
| A1 | Vergleichs-Cluster: 8 `/vergleich/[slug]` + Hub `/vergleich` (additiv) | `7ec8bc82` | ✅ |
| BRIEF-05 | `llms.txt` + `llms-full.txt` datengetrieben (Route-Handler + `lib/llms.ts`) | `c2787a96` | ✅ |
| BRIEF-04 A | Relations-Layer + „Verwandte Themen"-Block (internes Linking) | `8c5ed10e` | ⏳ in Abnahme |
| BRIEF-06 P1 | Logo: oranger Akzent-Punkt im Icon (`components/Logo.tsx`) | `c3390419` | ⏳ in Abnahme |
| A4 | Schema-Audit (nur Analyse, kein Code) | — | ✅ grün, 2 nicht-blockierende 🟡 |

---

## 5 · Etablierte Architektur-Patterns (so wird hier gebaut)
**A · Additiver Merge-Layer (für neue/erweiterte Inhalte, generierte Datei bleibt unangetastet):**
- Artikel: `content/articles.manual.ts` (`export const manualArticles: Article[]`) + `content/articles/index.ts` merged `[...generatedArticles, ...manualArticles]`.
- Rest-Pages: `content/rest-pages.manual.ts` (`export const manualRestPages: RestPage[]`) + `content/rest-pages/index.ts` merged `[...generatedRestPages, ...manualRestPages]`; `lib/rest.ts` importiert `restPages` aus `@/content/rest-pages`.
- Routen-Resolver für Rest unter Prefix: `app/<prefix>/[slug]/page.tsx` mit `getRestSlugsUnder('<prefix>')` + `RestRoute` (Muster: `app/schadenfreiheitsklasse/[slug]`, `app/vergleich/[slug]`).

**B · Port-Clone (Prototyp-HTML → RestPage-Objekte, additiv):** Klon von `scripts/port-rest.py` mit `SRC=_PROTOTYPEN`, eigener Datei-Selektion, Export `manualRestPages`. **WICHTIG:** Der Port strippt Zeilen mit „In Partnerschaft mit" — das entfernt sonst den UWG-Transparenz-Hinweis der Vergleichsseiten. Fix im Klon: diese Filter nur anwenden wenn NICHT „redaktionell verantwortet" enthalten, + den Transparenz-`<p>` explizit aus dem Soup ziehen und als Blockquote dem Body voranstellen (so geschehen für A1). content_root vieler Hub-Seiten = erste `<article>` → kann nur einen Teil erfassen (bei `/nutzungsausfall` nur 124 Zeichen!).

**C · Relations-Layer (internes Linking):** `lib/relations.ts` `getRelatedFor(route)` (Pillar↔Spoke + Cluster/Prefix-Geschwister, zyklisch) + `components/RelatedTopics.tsx`, eingehängt in `RestArticle`, `DecoderArticle`, `app/[article]/page.tsx`. Pillar-Slugs werden normalisiert (`pillar-NN-` gestrippt).

**D · Sitemap + llms** ziehen automatisch aus `getAllArticles/getAllRestPages/getAllDecoders` → neue Manual-Einträge erscheinen ohne Extra-Arbeit.

---

## 6 · NEXT — exakte Schritte (ein Punkt, Build, STOP, Abnahme)

### Punkt 1: C2 — Unkostenpauschale in `/nutzungsausfall` (additiv)
**Mechanik:** KEIN Regen, KEIN Edit der generierten Datei. Patch/Override über den Rest-Merge-Layer. Empfohlen: in `content/rest-pages/index.ts` eine Patch-Map anwenden, die den generierten `/nutzungsausfall`-Eintrag erweitert (Body-Abschnitt anhängen + 2 FAQ), z. B.:
```ts
const PATCHES: Record<string, { appendBody?: string; appendFaq?: { q: string; a: string }[] }> = {
  '/nutzungsausfall': { appendBody: UNKOSTEN_BODY, appendFaq: UNKOSTEN_FAQ },
}
export const restPages = [...generatedRestPages, ...manualRestPages].map((p) => {
  const patch = PATCHES[p.route]; if (!patch) return p
  return { ...p, body: p.body + (patch.appendBody ?? ''), faq: [...(p.faq ?? []), ...(patch.appendFaq ?? [])] }
})
```
**Inhalt (rechtlich freigegeben, KEINE €-Beträge — aus `_CONTENT-INBOX-au-io/A5-MERGE-nutzungsausfall.md`):**
- Body-Abschnitt (Markdown): `## Was ist die Unkostenpauschale (Auslagenpauschale)?` + 2 Absätze: (1) „Die Unkostenpauschale ist ein pauschaler Betrag, den Sie ohne Einzelnachweis für allgemeine Nebenkosten der Schadenabwicklung erhalten — etwa Telefon, Porto und Fahrten. … Die genaue Höhe ist nicht gesetzlich fixiert: Verschiedene Gerichte setzen unterschiedliche Beträge an …" (2) „Die Unkostenpauschale gibt es **zusätzlich** zum Nutzungsausfall — die beiden Positionen schließen sich nicht aus. …"
- 2 FAQ: „Wie hoch ist die Unkostenpauschale nach einem Unfall?" / „Bekomme ich Nutzungsausfall und Unkostenpauschale gleichzeitig?" (Antworten in der A5-Quelle; § 249 BGB, keine konkreten €).
- H1/Slug UNVERÄNDERT, keine neue Route, kein 301.
**Akzeptanz:** `/nutzungsausfall` rendert Abschnitt + 7 FAQ (vorher 5); FAQPage-Schema enthält die 2 neuen; `*.generated.ts`-Diff = 0; Build/tsc grün.

### Punkt 2: A2 — `hub-sf-*` → `/schadenfreiheitsklasse/[slug]` + 301 (additiv)
4 Seiten leben unter Alt-Slug (`/hub-sf-anfaenger|herausfinden|uebertragen-nachteile|uebertragen-zweitwagen`, in `rest-pages.generated.ts` + statische Ordner `app/hub-sf-*`).
**Soll (additiv):**
1. 4 Manual-Rest-Einträge in `content/rest-pages.manual.ts` mit Route `/schadenfreiheitsklasse/<x>` (Inhalt der HUB-sf-*.html aus `_PROTOTYPEN` portieren, canonical `/schadenfreiheitsklasse/<x>`). Der `app/schadenfreiheitsklasse/[slug]`-Resolver serviert sie automatisch.
2. `next.config.ts` → `async redirects()` (neben `headers()`): je `{ source: '/hub-sf-<x>', destination: '/schadenfreiheitsklasse/<x>', permanent: true }`.
3. Statische Ordner `app/hub-sf-*` löschen (App-Code, kein generierter Inhalt — erlaubt). Redirect greift vor Routing.
4. **Gotcha:** die generierten `/hub-sf-*`-Einträge bleiben in `rest-pages.generated.ts` → erscheinen sonst in Sitemap/llms als Redirect-URLs. Additiv filtern: in `app/sitemap.ts` (und ggf. `lib/llms.ts`/`lib/rest`) die `/hub-sf-*`-Routen ausschließen — kein Edit der generierten Datei, nur Filter im Konsumenten.
5. **Kannibalisierung:** es gibt bereits `/schadenfreiheitsklasse/uebertragen` — `uebertragen-nachteile`/`-zweitwagen` klar abgrenzen, gegenseitig verlinken (Relations-Layer tut das automatisch).
**Akzeptanz:** alt `/hub-sf-<x>` → **301** → neu **200**; Sitemap nur neue Slugs; `*.generated.ts`-Diff = 0; Build grün.

### Punkt 3: BRIEF-04 Teil C — Deploy-Manifest
`_DEPLOY-MANIFEST.md` schreiben: geordnete Liste ALLER zu deployenden Commits + Status, damit der Dev in einem Pass deployt. Enthalten: `9d4ffe01` (verification), `4dff1905` (kba — committet, NICHT auf Prod), `7ec8bc82` (Vergleiche), `c2787a96` (llms), `8c5ed10e` (Linking), `c3390419` (Logo), + C2 + A2. Plus Post-Deploy-Schritte (s. §9). Diff-Garantie dokumentieren: 0 Änderungen an Bestands-Routen + fremde WIP unberührt.

### Später / wartend
- **BRIEF-06 Punkt 2 (E-E-A-T/Impressum):** wartet auf finale Legal-Daten (HR-Nummer AG Köln + USt-IdNr., „Entwurf"-Hinweis raus) von Aaron/LexDrive. Du kannst das **Schema-Gerüst** in `lib/jsonld.ts` vorbereiten (Organization/Publisher: name/url/logo/address/foundingDate/sameAs; Autoren als Person mit sameAs/knowsAbout) — Register-/USt-Nummer einsetzen, sobald vorhanden.
- **BRIEF-07 (Conversion-Einbau au.io→Claimondo):** NACH der Sichtbarkeit. Kern: `/gutachter-finden` → Monika-Widget + Gutachter-Finder-Embed; Intent-Routing (Geschädigten-Pfad laut, Verursacher leise; `ref`/`case`-Parameter durchreichen); UWG-§5a-Offenlegung des Übergangs zu Claimondo; Lead-statt-Traffic-Attribution (Plausible-Events, cookieless). 4 offene Business-Fragen an Aaron (Monetarisierung pro Lead/Fall/%? Abdeckung bundesweit vs. NRW? Tracking vorhanden? Monika-Felder/Events?). NICHT raten — Antworten abwarten.
- **Gap-Audit-Befund (BRIEF-04 Teil B):** nur 1 gebaute-aber-nicht-live Seite (`/versicherer-decoder/wir-pruefen-den-sachverhalt`). **Entscheidung Aaron: BLEIBT weg** (nicht bauen/konsolidieren; beide Verzögerungs-Decoder behalten, Relations-Layer verlinkt sie, Kannibalisierung später in GSC). Intentionale Auslassungen NICHT bauen: `/ihre-rechte` (auf `/gutachter-finden` gefaltet), 100 hyperlokale `/kfz-unfall/[stadt]/[typ]` (noindex).

---

## 7 · Verifikations-Rezepte (in /tmp ablegen, /tmp ist flüchtig → bei Bedarf neu)
**Generierte-Datei-Guard (Pflicht je Punkt):** `git -C <cmndo> status --short -- autounfall-io/content/articles.generated.ts autounfall-io/content/rest-pages.generated.ts autounfall-io/content/decoder-data.generated.ts` → muss LEER sein.

**Rendered-Inbound-Audit (für Linking/Teil A; Ziel 0 indexierbare <2):** Node-Script, das alle `.next/server/app/**/*.html` einliest, interne `href="/…"` zählt (distinct-source je Ziel), und Routen mit <2 listet (ausschließen: `/kfz-unfall/*` PSEO, `/`, `/_*`, `/unfall-assistance` noindex). Vorlage lag in `/tmp/rendered-audit.mjs`.

**Diff-Guard für Port (falls je aus _PROTOTYPEN regeneriert wird):** Klon-Port mit `OUT=/tmp/x.ts` laufen lassen, dann `diff` gegen die committete generierte Datei → muss byte-identisch sein für Bestands-Routen, bevor du den Klon vertraust.

**Bridge:** nach jedem Punkt Dev auf 3002 starten, betroffene URLs `curl`en (200 + Schlüsselinhalt grep), dann Cowork melden.

---

## 8 · Entscheidungen & Stolperfallen (hart erarbeitet)
- **Hub-Route ist `/vergleich` (Singular), NICHT `/vergleiche`** — canonical der `VERGLEICHE-HUB.html` = `/vergleich/`. (Frühe Briefs sagten fälschlich `/vergleiche`.)
- **Transparenz-Hinweis der Vergleichsseiten** („von Claimondo redaktionell verantwortet") ist UWG-§6-kritisch und wird vom Port leicht weggefiltert — immer prüfen, dass er im gerenderten HTML steht.
- **UWG-Check (6 namentliche Vergleiche): grün**, 4 kleine 🟡 für die Redaktion (Spitzenstellung „höchste Dichte" abschwächen; BVSK-Stand-Datum; eine 15–40%-Zahl mit Quelle; ControlExpert-Tabelle als „Weg, nicht Anbieter" rahmen) — siehe `UWG-CHECK_VERGLEICHE-6_2026-06-11.md`.
- **A4-Schema 🟡 (nicht blockierend):** Hyperlocal-`LocalBusiness` ohne `address` → zu `Service` umstellen statt Köln-NAP faken; Site-Graph wird pro Seite doppelt gerendert (niedrige Prio).
- **port-articles.py existiert nicht** → `articles.generated.ts` nicht regenerierbar; egal, da additiv (`articles.manual.ts`).
- **Handoff-ZIP** (`autounfall-io_HANDOFF_2026-06-11.zip`) wird von einer Pipeline neu gebaut → manuelle Zip-Patches werden überschrieben; die maßgebliche Quelle ist DIESES Repo + dieser Stand.

## 9 · Deploy-Plan (Aaron/Dev, nach Abnahme)
1. Alle Punkte auf `feat/au-seo-handoff` mergen (nach Cowork-Abnahme), Ein-Pass-Deploy laut `_DEPLOY-MANIFEST.md` — **inkl. kba-Commit `4dff1905`**.
2. Verifizierungs-Tags gehen mit Deploy live → GSC/Bing/Ahrefs „Bestätigen".
3. Sitemap `https://autounfall.io/sitemap.xml` in GSC + Bing einreichen.
4. IndexNow-Ping über alle Sitemap-URLs (`scripts/indexnow-ping.mjs`, Post-Deploy-Hook).
5. Cowork: GSC „Indexierung beantragen" für die wichtigsten der ~100 + neuen URLs; GEO-Monitoring (Perplexity/ChatGPT); Authority (Yandex/Brave WMT, Verzeichnisse) — **kein GBP/Local** (au.io ist Ratgeber-Portal, nicht lokales Geschäft).

---
*Erstellt vom vorherigen Claude Code, 2026-06-12. Dauerhafter Sessionspeicher zusätzlich unter `~/.claude/projects/-Users-nicolaskitta-autounfall-io/memory/` (MEMORY.md + Einträge).*
