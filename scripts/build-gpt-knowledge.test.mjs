// Tests fuer build-gpt-knowledge.mjs — laufen via `node --test` (node:test Builtin),
// damit sie im isolierten Worktree ohne node_modules/vitest funktionieren.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  stripFrontmatter, isDuplicateCopy, naturalCompare, listMarkdown, sourceBlock,
  bundles, buildBundle, parseArgs, main,
  DEFAULT_INPUT, DEFAULT_OUT, DEFAULT_AUTHOR,
} from './build-gpt-knowledge.mjs'

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'gptk-'))
  const research = join(root, 'research')
  const pb = join(research, 'Pillar-B-Haftpflicht')
  const pc = join(research, 'Pillar-C-Technik')
  mkdirSync(pb, { recursive: true })
  mkdirSync(pc, { recursive: true })
  writeFileSync(join(research, 'versicherer-briefe.md'), '---\ntitle: x\n---\nBRIEF-BODY')
  writeFileSync(join(research, 'bgh-urteile.md'), 'BGH-BODY')
  writeFileSync(join(research, 'bgb-paragraphen.md'), 'BGB-BODY')
  writeFileSync(join(research, 'kevin-praxis-notes.md'), 'KEVIN-BODY')
  writeFileSync(join(research, 'bvsk-honorartabelle.md'), 'BVSK-BODY')
  writeFileSync(join(research, 'gdv-statistik.md'), 'GDV-BODY')
  writeFileSync(join(research, 'nutzungsausfall-mietwagen.md'), 'NUTZ-BODY')
  writeFileSync(join(research, 'schmerzensgeld.md'), 'SCHMERZ-BODY')
  writeFileSync(join(research, 'sf-klassen-rueckstufung.md'), 'SF-BODY')
  writeFileSync(join(research, 'rvg-anwaltskosten.md'), 'RVG-BODY')
  writeFileSync(join(pb, 'H8.10-decoder-nut.md'), 'D10')
  writeFileSync(join(pb, 'H8.2-decoder-mitv.md'), 'D2')
  writeFileSync(join(pb, 'H8.2-decoder-mitv (1).md'), 'DUP')
  writeFileSync(join(pb, 'H1.1-betriebsgefahr.md'), 'H11')
  writeFileSync(join(pb, 'H7.9-kasko.md'), 'H79')
  writeFileSync(join(pc, 'C-GE.1-bvsk.md'), 'C1')
  writeFileSync(join(pc, 'C-GE.2-dekra.md'), 'C2')
  return { root, research, pb, pc }
}

test('stripFrontmatter entfernt fuehrenden ---Block', () => {
  assert.equal(stripFrontmatter('---\na: 1\n---\nBODY'), 'BODY')
  assert.equal(stripFrontmatter('---\r\na: 1\r\n---\r\nBODY'), 'BODY')
  assert.equal(stripFrontmatter('kein frontmatter'), 'kein frontmatter')
})

test('isDuplicateCopy erkennt " (1).md"-Kopien', () => {
  assert.equal(isDuplicateCopy('H6.10-wenden (1).md'), true)
  assert.equal(isDuplicateCopy('H6.10-wenden.md'), false)
})

test('naturalCompare sortiert H8.2 vor H8.10', () => {
  assert.deepEqual(['H8.10.md', 'H8.2.md'].sort(naturalCompare), ['H8.2.md', 'H8.10.md'])
})

test('listMarkdown filtert, dedupt, natural-sortiert', () => {
  const { pb } = makeFixture()
  const h8 = listMarkdown(pb, (f) => /^H8\.\d+-decoder-/i.test(f)).map((p) => p.split(/[\\/]/).pop())
  assert.deepEqual(h8, ['H8.2-decoder-mitv.md', 'H8.10-decoder-nut.md'])
})

test('listMarkdown gibt [] fuer fehlendes Verzeichnis', () => {
  assert.deepEqual(listMarkdown(join(tmpdir(), 'nope-xyz-dir-123')), [])
})

test('sourceBlock: Provenance-Marker + Frontmatter gestrippt', () => {
  const { research } = makeFixture()
  const { block, missing } = sourceBlock(join(research, 'versicherer-briefe.md'))
  assert.equal(missing, false)
  assert.match(block, /<!-- source: .*versicherer-briefe\.md -->/)
  assert.match(block, /## versicherer-briefe/)
  assert.match(block, /BRIEF-BODY/)
  assert.equal(block.includes('title: x'), false)
})

test('sourceBlock meldet fehlende Datei', () => {
  const r = sourceBlock(join(tmpdir(), 'does-not-exist-xyz.md'))
  assert.equal(r.missing, true)
  assert.equal(r.block, '')
})

test('bundles definiert genau 6 Files mit erwarteten Quellen', () => {
  const { research } = makeFixture()
  const b = bundles(research)
  assert.equal(Object.keys(b).length, 6)
  assert.equal(b['claimondo-decoder-versicherer-kuerzungen.md'].sources.length, 3)
  assert.equal(b['claimondo-zahlen-tabellen-spannen.md'].sources.length, 6)
  const recht = b['claimondo-haftpflicht-recht.md'].sources.map((p) => p.split(/[\\/]/).pop())
  assert.deepEqual(recht, ['H1.1-betriebsgefahr.md', 'H7.9-kasko.md'])
})

test('buildBundle baut Header + Bloecke, trackt missing', () => {
  const { research } = makeFixture()
  const def = bundles(research)['claimondo-bgh-bgb-juris-referenz.md']
  const { content, missing } = buildBundle(def, '2026-05-26', 'Aaron Sprafke')
  assert.match(content, /# Claimondo Knowledge —/)
  assert.match(content, /\*\*Stand:\*\* 2026-05-26/)
  assert.match(content, /\*\*Verantwortlich:\*\* Aaron Sprafke/)
  assert.match(content, /BGH-BODY/)
  assert.match(content, /BGB-BODY/)
  assert.equal(missing.length, 0)
})

test('buildBundle sammelt fehlende Quellen', () => {
  const { research } = makeFixture()
  unlinkSync(join(research, 'bgh-urteile.md'))
  const def = bundles(research)['claimondo-bgh-bgb-juris-referenz.md']
  const { missing } = buildBundle(def, '2026-05-26', 'Aaron Sprafke')
  assert.equal(missing.length, 1)
  assert.match(missing[0], /bgh-urteile\.md/)
})

test('parseArgs liest Flags mit Defaults', () => {
  assert.deepEqual(parseArgs([]), { input: DEFAULT_INPUT, out: DEFAULT_OUT, author: DEFAULT_AUTHOR, strict: false })
  assert.deepEqual(parseArgs(['--input', 'a', '--out', 'b', '--author', 'X Y', '--strict']),
    { input: 'a', out: 'b', author: 'X Y', strict: true })
})

test('main schreibt 6 Bundles ins out-Verzeichnis', () => {
  const { root, research } = makeFixture()
  const out = join(root, 'gpt-knowledge')
  const summary = main(['--input', research, '--out', out])
  assert.equal(summary.results.length, 6)
  for (const name of Object.keys(bundles(research))) {
    assert.equal(existsSync(join(out, name)), true, `${name} geschrieben`)
  }
  assert.equal(summary.missing.length, 0)
})

test('main wirft bei fehlendem input-Verzeichnis', () => {
  assert.throws(() => main(['--input', join(tmpdir(), 'nope-xyz-456'), '--out', join(tmpdir(), 'o')]),
    /Input-Verzeichnis fehlt/)
})

test('main --strict wirft wenn Quelle fehlt', () => {
  const { root, research } = makeFixture()
  unlinkSync(join(research, 'kevin-praxis-notes.md'))
  const out = join(root, 'gpt-knowledge')
  assert.throws(() => main(['--input', research, '--out', out, '--strict']), /fehlen/)
})
