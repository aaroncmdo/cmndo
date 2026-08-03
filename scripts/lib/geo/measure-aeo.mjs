import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runQuery } from './aeo-run.mjs'
import { judge } from './aeo-judge.mjs'
import { extractQueryResult } from './aeo-extract.mjs'
import { scoreRun } from './aeo-score.mjs'
import { renderReport } from './aeo-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url)) // scripts/lib/geo
const ROOT = resolve(HERE, '..', '..', '..') // Repo-Wurzel (geo -> lib -> scripts -> root)

function argN(flag, def) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('FEHLER: ANTHROPIC_API_KEY fehlt. Start mit: node --env-file=<pfad>/.env.local scripts/lib/geo/measure-aeo.mjs')
    process.exit(1)
  }
  const cfg = JSON.parse(readFileSync(new URL('./aeo-queries.json', import.meta.url)))
  const limit = argN('--limit', cfg.queries.length)
  const queries = cfg.queries.slice(0, limit)
  const results = []
  for (const q of queries) {
    let content = null
    let err = null
    for (let a = 0; a < 3 && !content; a++) {
      try {
        content = await runQuery(q.text)
      } catch (e) {
        err = e
        console.error(`  retry ${a + 1} für "${q.text}": ${e?.message ?? e}`)
      }
    }
    if (!content) {
      results.push({ query: q, error: String(err?.message ?? err) })
      continue
    }
    const extract = extractQueryResult(content, cfg.competitors)
    const scores = extract.no_web_result
      ? { accuracy: null, sentiment: null, completeness: null }
      : await judge(q.text, extract.answer_text)
    results.push({ query: q, extract, scores })
    console.log(`✓ ${q.id} "${q.text}" — present=${extract.claimondo_present} cited=${extract.claimondo_cited} comps=[${extract.competitors_present.join(',')}]`)
  }
  const aggregate = scoreRun(results)
  const runDate = new Date().toISOString().slice(0, 10)
  const md = renderReport({ runDate, results, aggregate })
  const outDir = resolve(ROOT, 'docs', 'geo', 'measurements')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, `${runDate}-aeo-run.md`)
  writeFileSync(outPath, md, 'utf8')
  console.log(`\nGeschrieben: ${outPath}`)
  console.log(`Präsenz ${aggregate.present_count}/${aggregate.total}, zitiert ${aggregate.cited_count}/${aggregate.total}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
