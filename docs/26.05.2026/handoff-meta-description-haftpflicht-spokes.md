# Handoff: meta_description für die 57 Haftpflicht-Glossar-Spokes

**Datum:** 2026-05-26 · **Vorgänger-Session:** GA4 + Bing-Meta-Description-Sweep
**Memory:** `project_seo_meta_description.md` (zuerst lesen)

---

## Ziel
Hand-getextete `meta_description`-Frontmatter (≤155 Zeichen) für die **57 Haftpflicht-Glossar-Spokes** unter `src/content/claimondo/haftpflicht/*.md` schreiben — der letzte offene Batch des Bing-Meta-Description-Sweeps (Aaron-Wahl: Weg **B** = hand-getextet, nicht Truncation).

## Kontext / was schon erledigt ist
Bing Webmaster flaggte zu lange Meta-Descriptions (>160). Gefixt (eigene PRs gg staging):
- **#1793** Homepage, **#1795** 22 statische Seiten, **#1799** `kfz-gutachter/[stadt]`-Template (84 Städte + Köln).
- **#1802** Content-Pages: **Infra + Fallback + 20 hand-getextete** (10 decoder + 2 cornerstones + 8 sachverständige).

**Die Infra (in #1802) ist die Basis hier** — `src/lib/content/claimondo-mdx.ts`:
- `ClaimondoAsset.metaDescription` wird aus Frontmatter `meta_description` gelesen.
- Helper `metaDescriptionFromSnippet(snippet, max=155)` ist der **Fallback** (kürzt den 40-60-Wort-Snippet sicher ≤155). D.h. **kein URL ist kaputt** — die 57 Spokes laufen aktuell auf dem Fallback (≤155, aber generisch). Dieser Batch ersetzt den Fallback durch echte, hand-getextete Descriptions.
- Die 5 Content-Pages nutzen: `description = a.metaDescription || metaDescriptionFromSnippet(a.snippet) || a.title`.

**WICHTIG:** Erst weitermachen, wenn **#1802 auf staging gemergt** ist (sonst fehlt die Infra auf staging und der Branch braucht #1802 als Basis). Check: `git -C <repo> show origin/staging:src/lib/content/claimondo-mdx.ts | grep -c metaDescriptionFromSnippet` → muss `>0` sein.

---

## Rezept (Schritt für Schritt)

### 1. Branch
```
git fetch origin staging
git checkout -b kitta/seo-meta-desc-haftpflicht origin/staging   # NACH #1802-Merge
```

### 2. Inhalte lesen (für passende Texte)
Pro Spoke H1 + primary_keyword + Snippet-Anfang ziehen, um eine inhaltlich korrekte Description zu schreiben:
```bash
node -e '
const fs=require("fs"); const dir="src/content/claimondo/haftpflicht";
for(const n of fs.readdirSync(dir).filter(f=>f.endsWith(".md")).sort()){
  const c=fs.readFileSync(dir+"/"+n,"utf8").replace(/\r\n?/g,"\n");
  const h1=(c.match(/^#\s+(.+)$/m)||[])[1]||"";
  const kw=(c.match(/^primary_keyword:\s*(.+)$/m)||[])[1]||"";
  const bq=(c.match(/^>\s+(.+(?:\n>\s+.+)*)/m)||[])[1]||"";
  const snip=bq.replace(/^>\s+/gm,"").replace(/\*\*Kurz erklärt:\*\*\s*/i,"").replace(/\s+/g," ").trim();
  console.log("\n["+n.replace(".md","")+"]\n  H1:"+h1+"\n  kw:"+kw.replace(/^["\x27]|["\x27]$/g,"")+"\n  snip:"+snip.slice(0,150));
}'
```

### 3. Descriptions schreiben — Regeln (NICHT brechen)
- **≤155 Zeichen** (Skript-Guard ≤158, ziele 135-150).
- **Deutsche Typo-Quotes `„…“`** (U+201E / U+201C) — **NIEMALS ASCII `"`**, das bricht den YAML-Wrapper `"…"`.
- Keine ASCII-`'`. Umlaute/§/€ echt (UTF-8).
- SEO-Kern je Spoke: das Lemma/Keyword + Anspruch/§-Bezug + ggf. „0 € bei unverschuldetem Unfall (§249 BGB)“ wo es passt. Kein Floskel-Füller.
- Stil wie die 20 in #1802 (z.B. decoder: Frage-Hook; glossar: „{Begriff} erklärt: … nach §… BGB.“).

### 4. Einfügen (zeilenbasiert, Line-Endings erhalten, Guards)
Map `{ datei: description }` füllen, dann:
```js
import fs from 'fs'
const D = 'src/content/claimondo/haftpflicht/'
const MAP = { [`${D}reparaturkosten.md`]: '…', /* … alle 57 … */ }
let ok=0, warn=0
for (const [file, desc] of Object.entries(MAP)) {
  const len=[...desc].length
  if (desc.includes('"')) { console.log('ASCII-QUOTE (bricht YAML)', file); warn++; continue }   // <- häufigster Fehler
  if (len>158) { console.log(`ZU LANG (${len})`, file); warn++; continue }
  const raw=fs.readFileSync(file,'utf8'); const nl=raw.includes('\r\n')?'\r\n':'\n'
  const lines=raw.split(nl)
  if (lines[0]!=='---'){ console.log('kein frontmatter',file); warn++; continue }
  if (lines.some(l=>l.startsWith('meta_description:'))){ console.log('schon da',file); warn++; continue }
  let close=-1; for(let i=1;i<lines.length;i++){ if(lines[i]==='---'){close=i;break} }
  if (close===-1){ console.log('kein close',file); warn++; continue }
  lines.splice(close,0,`meta_description: "${desc}"`)
  fs.writeFileSync(file, lines.join(nl)); console.log(`OK ${len}  ${file.replace(D,'')}`); ok++
}
console.log(`\nGeschrieben: ${ok} | offen: ${warn}`)
```

### 5. Verifizieren
```bash
# alle gesetzten meta_description mit ECHTER Parser-Logik gegenmessen
node -e '
const fs=require("fs"); const dir="src/content/claimondo/haftpflicht";
let n=0,bad=0;
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith(".md"))){
  const raw=fs.readFileSync(dir+"/"+f,"utf8").replace(/\r\n?/g,"\n");
  const end=raw.indexOf("\n---",3); const yaml=raw.slice(3,end);
  const line=yaml.split("\n").find(l=>l.startsWith("meta_description:")); if(!line)continue;
  n++; const val=line.replace(/^meta_description:\s*/,"").replace(/^["\x27]|["\x27]$/g,"");
  if([...val].length>155||val.includes("\"")){bad++; console.log("BAD",[...val].length,f)}
}
console.log("gesetzt:",n,"| Probleme:",bad);'
```
- `git diff --stat` → genau 57 MDX, je +1 Insertion.
- tsc nicht nötig (reine MDX-Frontmatter), aber `npx tsc --noEmit` darf in den geänderten Files 0 Fehler zeigen (die ~11 `sharp`/`@react-pdf`-TS2307 sind transiente shared-node_modules-Junction-Fehler, **nicht** deine).

### 6. Commit + PR
`feat(seo): meta_description für 57 Haftpflicht-Glossar-Spokes` — `gh pr create --base staging`. 7-Punkt-Audit im Body (AGENTS.md).

---

## Gotchas / Lessons (aus der Vorgänger-Session)
1. **ASCII-`"` killt YAML** → nur `„…“`. Der häufigste Fehler beim ersten Durchlauf (alle 10 decoder mussten neu).
2. **Worktree-Pfad-Disziplin:** Read/Edit/Write IMMER mit vollem Worktree-Pfad (`…/.claude/worktrees/<name>/…`). Ein Nicht-Worktree-Absolutpfad editiert den MAIN-Checkout (anderer Session!) — ist 2× passiert. `git status` fängt's (zeigt clean, wo Änderung erwartet). Skript mit **relativen** Pfaden aus dem Worktree-CWD ist sicher.
3. **Diese 57 Files sind GEO/Content-Territorium** — additive Frontmatter-Zeile = niedriges Kollisionsrisiko, aber bei parallelen doc38/GEO-Sessions ggf. Merge-Konflikt (trivial, 1 Zeile). Separater Worktree → kein Clobbern.
4. Parser strippt äußere ASCII-Quotes (`val.replace(/^["']|["']$/g,'')`), interne `„…“` bleiben → `meta_description: "…„X“…"` ist korrekt.
5. `snippet` (Featured-Snippet-Block) bleibt unverändert — `meta_description` ist NUR die SERP-Description, nicht der Body/JSON-LD-Snippet.

## Die 57 Spokes
4-wochen-frist, abschlepp-bergung, anerkenntnis-bgb212, anhaenger, anscheinsbeweis, anwaltskosten-erstattung, auffahrunfall, auslandsunfall, beerdigungskosten, beifahrer-anspruch, betriebsgefahr-stvg7, beweislast, dritte-beteiligte, eigene-kosten, erben-rechtsnachfolger, erwerbsminderungsschaden, fahrerflucht, fahrerhaftung-stvg18, geschaedigte-primaer, glatteis-aquaplaning, haushaltsfuehrungsschaden, heilbehandlungskosten, hinterbliebenengeld, kasko-versicherung, linksabbieger, mehrere-schaediger, mietwagen, mitverschulden-bgb254, mitverschulden-stvg17, nutzungsausfall, parkplatz, pflege-mehrbedarf, produkthaftung, reparaturkosten, rotlicht, schmerzensgeld-bgb253, schockschaden-rechtlich, schwarzfahrt-diebstahl, sozialtraeger-regress, spurwechsel, sv-kosten, tueroeffnen, ueberholen, unterhaltsschaden, unversicherte-voh, verdienstausfall, verjaehrung-bgb195, vermehrte-beduerfnisse, verschulden-bgb823, verzug-bgb286, verzugszinsen-bgb288, vorfahrt-rechts-vor-links, vorfahrt-schilder, wenden, wertminderung, wiederbeschaffungswert, wildunfall

## Referenzen
- Infra: `src/lib/content/claimondo-mdx.ts` (`metaDescription` Feld + `meta_description`-Parse + `metaDescriptionFromSnippet`) — PR #1802
- 20 Beispiel-Descriptions: `git show <#1802-merge>:src/content/claimondo/{decoder,cornerstones,sachverstaendige}/*.md | grep meta_description`
- Helper-Test: `src/lib/content/__tests__/claimondo-mdx-meta.test.ts`
- Memory: `project_seo_meta_description.md`, `feedback_worktree_write_misroute.md`
