#!/usr/bin/env node
// End-to-end smoke for claimondo-mcp-server — tests BOTH transports (stdio + http)
// against a local mock of the Claimondo endpoints. Deterministic, no external network
// (the live claimondo.de fetch is verified separately via curl).
//
// Run: npm run build && node smoke.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const SERVER = fileURLToPath(new URL('./dist/index.js', import.meta.url))

let failures = 0
function check(label, cond, detail = '') {
  const line = `  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`
  if (cond) console.log(line)
  else {
    console.error(line)
    failures++
  }
}

// Local mock of the live endpoints (deterministic).
const mock = http.createServer((req, res) => {
  if (req.url.startsWith('/api/v1/sv-in-naehe')) {
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        plz: '50670',
        radius_km: 30,
        anzahl_treffer: 2,
        sv_liste: [
          { tier: 1, stadt: 'Köln', spezialisierungen: ['Unfallschaden', 'Oldtimer'], bewertung_schnitt: 4.8, bewertung_anzahl: 12, entfernung_km: 2.3 },
          { tier: 3, entfernung_km: 5.1 },
        ],
        karte_url: 'http://mock/api/v1/karte/50670.png',
        interaktive_karte_url: 'http://mock/gutachter-finden?plz=50670',
        buchungs_telefon: '+49 221 1234567',
      }),
    )
  } else if (req.url === '/llms-full.txt') {
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('# Claimondo Wissensbasis\n\n## § 249 BGB\nNaturalrestitution ...\n')
  } else {
    res.statusCode = 404
    res.end('{"error":"not found"}')
  }
})
await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${mock.address().port}`

// Gemeinsame Assertions — fuer jeden Transport identisch.
async function runChecks(client, label) {
  console.log(`\n--- Transport: ${label} ---`)
  const { tools } = await client.listTools()
  check(`[${label}] Tool gelistet`, tools.some((t) => t.name === 'claimondo_finde_sachverstaendige'))

  const { resources } = await client.listResources()
  check(`[${label}] Resource gelistet`, resources.some((r) => r.uri === 'claimondo://wissensbasis'))

  const call = await client.callTool({ name: 'claimondo_finde_sachverstaendige', arguments: { plz: '50670', radius: 30 } })
  check(`[${label}] Tool-Call ohne Fehler`, !call.isError)
  check(`[${label}] anzahl_treffer == 2`, call.structuredContent?.anzahl_treffer === 2, String(call.structuredContent?.anzahl_treffer))
  const md = call.content?.[0]?.text ?? ''
  check(`[${label}] Markdown "Köln" + "§ 249"`, md.includes('Köln') && md.includes('§ 249'))

  let badRejected = false
  try {
    const bad = await client.callTool({ name: 'claimondo_finde_sachverstaendige', arguments: { plz: 'abc' } })
    badRejected = !!bad.isError
  } catch {
    badRejected = true
  }
  check(`[${label}] invalide PLZ abgelehnt`, badRejected)

  const read = await client.readResource({ uri: 'claimondo://wissensbasis' })
  check(`[${label}] Resource-Text`, (read.contents?.[0]?.text ?? '').includes('Claimondo Wissensbasis'))
}

// Phase 1 — stdio
try {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env, CLAIMONDO_API_BASE: base } })
  const client = new Client({ name: 'smoke-stdio', version: '1.0.0' })
  await client.connect(transport)
  await runChecks(client, 'stdio')
  await client.close()
} catch (err) {
  check('stdio Phase', false, err?.message ?? String(err))
}

// Phase 2 — http (Streamable HTTP, stateless)
let httpChild
try {
  const port = 4100 + Math.floor(Math.random() * 800)
  httpChild = spawn(process.execPath, [SERVER], {
    env: { ...process.env, TRANSPORT: 'http', PORT: String(port), CLAIMONDO_API_BASE: base },
  })
  // Warten bis der Server lauscht (stderr-Marker), mit Timeout.
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('http-Server-Start-Timeout (10s)')), 10_000)
    httpChild.stderr.on('data', (d) => {
      if (String(d).includes('läuft (http)')) {
        clearTimeout(to)
        resolve()
      }
    })
    httpChild.on('exit', (code) => {
      clearTimeout(to)
      reject(new Error(`http-Server beendet (exit ${code})`))
    })
  })

  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
  const client = new Client({ name: 'smoke-http', version: '1.0.0' })
  await client.connect(transport)
  await runChecks(client, 'http')
  await client.close()
} catch (err) {
  check('http Phase', false, err?.message ?? String(err))
} finally {
  if (httpChild) httpChild.kill()
}

mock.close()
console.log(failures === 0 ? '\n✅ ALLE SMOKE-CHECKS BESTANDEN (stdio + http)' : `\n❌ ${failures} CHECK(S) FEHLGESCHLAGEN`)
process.exit(failures === 0 ? 0 : 1)
