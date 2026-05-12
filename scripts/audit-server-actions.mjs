import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'dist', 'build'].includes(e.name)) walk(p, files)
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      files.push(p)
    }
  }
  return files
}

const all = walk(path.join(ROOT, 'src'))
const useServerFiles = []
for (const f of all) {
  const c = fs.readFileSync(f, 'utf8')
  if (/^['"]use server['"]/m.test(c)) {
    const lines = c.split('\n').length
    const exportedFns = (c.match(/^export\s+(async\s+)?function\s+\w+/gm) || []).length
    const exportedConsts = (c.match(/^export\s+const\s+\w+/gm) || []).length
    const exportedTypes = (c.match(/^export\s+(type|interface)\s+\w+/gm) || []).length
    const revalidate = (c.match(/revalidatePath\(/g) || []).length
    const requireAuth = /requireAuth\s*\(/.test(c)
    const requireRole = /requireRole\s*\(/.test(c)
    const throwError = (c.match(/\bthrow\s+new\s+Error/g) || []).length
    const returnOk = (c.match(/return\s*\{\s*ok\s*:/g) || []).length
    const returnSuccess = (c.match(/return\s*\{\s*success\s*:/g) || []).length
    useServerFiles.push({
      file: f.replace(ROOT + path.sep, '').split(path.sep).join('/'),
      lines,
      fns: exportedFns,
      consts: exportedConsts,
      types: exportedTypes,
      revalidate,
      requireAuth,
      requireRole,
      throwError,
      returnOk,
      returnSuccess,
    })
  }
}

useServerFiles.sort((a, b) => b.fns - a.fns)

const summary = {
  totalFiles: useServerFiles.length,
  totalFns: useServerFiles.reduce((s, f) => s + f.fns, 0),
  filesWithConsts: useServerFiles.filter((f) => f.consts > 0).length,
  filesWithTypes: useServerFiles.filter((f) => f.types > 0).length,
  filesWithoutRevalidate: useServerFiles.filter((f) => f.revalidate === 0).length,
  filesWithoutAuthGuard: useServerFiles.filter((f) => !f.requireAuth && !f.requireRole).length,
  filesWithThrow: useServerFiles.filter((f) => f.throwError > 0).length,
  filesWithOk: useServerFiles.filter((f) => f.returnOk > 0).length,
  filesWithSuccess: useServerFiles.filter((f) => f.returnSuccess > 0).length,
  filesMixedReturn: useServerFiles.filter((f) => f.returnOk > 0 && f.returnSuccess > 0).length,
}

console.log('=== SUMMARY ===')
for (const [k, v] of Object.entries(summary)) console.log(' ', k.padEnd(30), v)

console.log('\n=== BY-DIR ===')
const byDir = {}
for (const f of useServerFiles) {
  const dir = f.file.replace(/^src\//, '').split('/').slice(0, 3).join('/')
  byDir[dir] = (byDir[dir] || 0) + 1
}
Object.entries(byDir)
  .sort((a, b) => b[1] - a[1])
  .forEach(([d, n]) => console.log(' ', n.toString().padStart(3), d))

console.log('\n=== FILES EXPORTING CONSTS or TYPES (use-server-Konstanten-Falle AAR-664) ===')
useServerFiles
  .filter((f) => f.consts > 0 || f.types > 0)
  .forEach((f) =>
    console.log(`  consts=${f.consts} types=${f.types}  ${f.file}`)
  )

console.log('\n=== FILES WITHOUT revalidatePath (potentielle Stale-UI) ===')
useServerFiles
  .filter((f) => f.revalidate === 0 && f.fns > 0)
  .slice(0, 30)
  .forEach((f) => console.log(`  ${f.fns} fns, ${f.lines} lines  ${f.file}`))

console.log('\n=== FILES WITHOUT AUTH-GUARD (kein requireAuth/requireRole) ===')
useServerFiles
  .filter((f) => !f.requireAuth && !f.requireRole && f.fns > 0)
  .slice(0, 30)
  .forEach((f) => console.log(`  ${f.fns} fns, ${f.lines} lines  ${f.file}`))

console.log('\n=== FILES WITH MIXED RETURN (ok + success in same file = Drift) ===')
useServerFiles
  .filter((f) => f.returnOk > 0 && f.returnSuccess > 0)
  .forEach((f) => console.log(`  ok=${f.returnOk} success=${f.returnSuccess}  ${f.file}`))

console.log('\n=== TOP-15 by fns ===')
useServerFiles.slice(0, 15).forEach((f) =>
  console.log(`  ${f.fns.toString().padStart(3)} fns, ${f.lines.toString().padStart(4)} L  ${f.file}`)
)

// Write JSON for downstream agents
fs.writeFileSync(
  path.join(ROOT, 'scripts', 'audit-server-actions-output.json'),
  JSON.stringify({ summary, files: useServerFiles }, null, 2)
)
console.log('\nWrote scripts/audit-server-actions-output.json')
