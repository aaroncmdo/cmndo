import { test } from 'vitest'
import { render } from '@react-email/render'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PREVIEWS, type Preview } from './fixtures'

// Email-Preview-Generator. Rendert jedes Tier-1-Template mit Sample-Props (fixtures.tsx)
// zu email-preview/out/<name>.html + einer Galerie index.html. Lauf: `npm run email:preview`.
// Laeuft NUR ueber die eigene Config (email-preview/vitest.preview.ts), nie in CI.
// Defensiv: ein Render-Fehler in einem Template kippt nicht die ganze Galerie.

const OUT = join(process.cwd(), 'email-preview', 'out')

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildIndex(cards: Array<Preview & { file: string; error: string | null }>): string {
  const ok = cards.filter(c => !c.error).length
  const cardsHtml = cards.map(c => `
    <section class="card${c.error ? ' err' : ''}">
      <header>
        <div><span class="tier">Tier ${c.tier}</span> <b>${esc(c.name)}</b></div>
        <div class="subj">Betreff: ${esc(c.subject)}</div>
        ${c.error ? `<div class="errmsg">Render-Fehler: ${esc(c.error)}</div>` : `<a href="./${c.file}" target="_blank">in neuem Tab öffnen ↗</a>`}
      </header>
      ${c.error ? '' : `<iframe src="./${c.file}" loading="lazy" title="${esc(c.name)}"></iframe>`}
    </section>`).join('\n')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claimondo · Email-Preview (${ok}/${cards.length})</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0D1B3E; color: #e7eefb; }
  .top { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,.12); position: sticky; top: 0; background: #0D1B3E; z-index: 1; }
  .top h1 { margin: 0 0 4px; font-size: 18px; }
  .top p { margin: 0; font-size: 13px; color: #9fb3cf; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; padding: 24px; }
  .card { background: #11244e; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; overflow: hidden; }
  .card.err { border-color: #b4471f; }
  .card header { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.10); font-size: 13px; }
  .card header b { font-size: 14px; }
  .tier { font-size: 10px; font-weight: 700; color: #C9A84C; letter-spacing: .5px; }
  .subj { color: #9fb3cf; margin: 4px 0; }
  .card a { color: #7BA3CC; text-decoration: none; font-size: 12px; }
  .errmsg { color: #ff9b7a; font-size: 12px; margin-top: 4px; white-space: pre-wrap; }
  iframe { width: 100%; height: 760px; border: 0; background: #fff; display: block; }
</style></head><body>
<div class="top">
  <h1>Claimondo · Email-Preview — ${ok}/${cards.length} Tier-1-Templates</h1>
  <p>Generiert via <code>npm run email:preview</code>. Dark-Mode-Vorschau: System-Darkmode umschalten (die Mails reagieren per <code>@media (prefers-color-scheme)</code>). Verlässliche Light/Dark-Gegenüberstellung = Playwright-Smoke (siehe docs/).</p>
</div>
<div class="grid">${cardsHtml}</div>
</body></html>`
}

test('generate email preview gallery', async () => {
  mkdirSync(OUT, { recursive: true })
  const cards: Array<Preview & { file: string; error: string | null }> = []
  for (const p of PREVIEWS) {
    const file = `${p.name}.html`
    let error: string | null = null
    try {
      const html = await render(p.element)
      writeFileSync(join(OUT, file), html, 'utf-8')
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    cards.push({ ...p, file, error })
  }
  writeFileSync(join(OUT, 'index.html'), buildIndex(cards), 'utf-8')
  const failed = cards.filter(c => c.error)
  console.log(`\n✓ Email-Preview: ${cards.length - failed.length}/${cards.length} → email-preview/out/index.html`)
  for (const c of failed) console.error(`  ✗ ${c.name}: ${c.error}`)
})
