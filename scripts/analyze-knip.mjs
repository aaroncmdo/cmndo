import fs from 'node:fs'

const data = JSON.parse(fs.readFileSync('scripts/knip-output.json', 'utf8'))
const unusedFiles = []
const unusedExportsByFile = []
for (const i of data.issues) {
  if (i.files?.length) unusedFiles.push(i.file)
  if (i.exports?.length) unusedExportsByFile.push({ file: i.file, n: i.exports.length, names: i.exports.map((e) => e.name || e) })
}

const NEXT_CONVENTIONS = /[\\\/](page|layout|route|loading|error|not-found|sitemap|opengraph-image|metadata|robots|manifest|template|default|icon|apple-icon)\.(tsx?|js|mjs)$/
const SCRIPTS_OR_INFRA = /^(scripts|public|supabase|tests|__tests__|e2e|playwright)[\\\/]/
const TEST_FILE = /\.(test|spec)\.(tsx?|js|mjs)$/
const STORYBOOK = /\.stories\.(tsx?|js|mjs)$/
const TYPE_DECL = /\.d\.ts$/

function classify(f) {
  const norm = f.replace(/\\/g, '/')
  if (NEXT_CONVENTIONS.test(norm)) return 'next-convention'
  if (SCRIPTS_OR_INFRA.test(norm)) return 'scripts-infra'
  if (TEST_FILE.test(norm)) return 'test'
  if (STORYBOOK.test(norm)) return 'storybook'
  if (TYPE_DECL.test(norm)) return 'type-decl'
  return 'true-positive'
}

const buckets = { 'next-convention': [], 'scripts-infra': [], test: [], storybook: [], 'type-decl': [], 'true-positive': [] }
for (const f of unusedFiles) buckets[classify(f)].push(f)

console.log('=== UNUSED-FILES CLASSIFICATION (' + unusedFiles.length + ') ===')
for (const [k, v] of Object.entries(buckets)) console.log('  ' + k.padEnd(18) + ' ' + v.length)

const truePositives = buckets['true-positive']

const byDir = {}
for (const f of truePositives) {
  const norm = f.replace(/\\/g, '/')
  const dir = norm.split('/').slice(0, 3).join('/')
  byDir[dir] = (byDir[dir] || 0) + 1
}
console.log('\n=== TRUE-POSITIVE BY DIR ===')
Object.entries(byDir)
  .sort((a, b) => b[1] - a[1])
  .forEach(([d, n]) => console.log('  ' + n.toString().padStart(3) + ' ' + d))

console.log('\n=== TRUE-POSITIVE FILES (' + truePositives.length + ') ===')
truePositives.forEach((f) => console.log('  ' + f))

// Top unused exports by file
unusedExportsByFile.sort((a, b) => b.n - a.n)
console.log('\n=== TOP-30 UNUSED-EXPORT FILES ===')
unusedExportsByFile.slice(0, 30).forEach((e) => console.log('  ' + e.n.toString().padStart(3) + ' ' + e.file + ' — ' + e.names.slice(0, 5).join(', ') + (e.names.length > 5 ? ', …' : '')))

// Unused deps
console.log('\n=== UNUSED DEPS ===')
for (const i of data.issues) {
  if (i.dependencies?.length) console.log('  ' + i.file + ' — ' + i.dependencies.map((d) => d.name || d).join(', '))
  if (i.devDependencies?.length) console.log('  [dev] ' + i.file + ' — ' + i.devDependencies.map((d) => d.name || d).join(', '))
}

console.log('\n=== UNLISTED DEPS (potential missing devDeps) ===')
for (const i of data.issues) {
  if (i.unlisted?.length) console.log('  ' + i.file + ' — ' + i.unlisted.map((u) => u.name || u).join(', '))
}

console.log('\n=== DUPLICATES ===')
for (const i of data.issues) {
  if (i.duplicates?.length) console.log('  ' + i.file + ' — ' + i.duplicates.map((d) => (Array.isArray(d) ? d.join('/') : d.name || JSON.stringify(d))).join(' | '))
}

fs.writeFileSync('scripts/knip-classified.json', JSON.stringify({ buckets, byDir, unusedExportsByFile: unusedExportsByFile.slice(0, 50) }, null, 2))
console.log('\nWrote scripts/knip-classified.json')
