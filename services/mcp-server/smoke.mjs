#!/usr/bin/env node
// End-to-end smoke for claimondo-mcp-server.
//
// Spins a local mock of the Claimondo endpoints, then drives the BUILT server
// (dist/index.js) over stdio via the real MCP client — exercising the full
// protocol wiring (initialize, tools, resources), the tool's fetch->normalise->
// format path, input validation, and the resource read. Deterministic, no
// external network (the live claimondo.de fetch is verified separately via curl).
//
// Run: npm run build && node smoke.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const SERVER = fileURLToPath(new URL('./dist/index.js', import.meta.url))

let failures = 0
function check(label, cond, detail = '') {
  const tag = cond ? 'PASS' : 'FAIL'
  const line = `  ${tag}  ${label}${detail ? ` — ${detail}` : ''}`
  if (cond) console.log(line)
  else {
    console.error(line)
    failures++
  }
}

// 1) Local mock of the live endpoints (deterministic).
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
    res.end('# Claimondo Wissensbasis\n\n## § 249 BGB\nNaturalrestitution — der Geschädigte ...\n')
  } else {
    res.statusCode = 404
    res.end('{"error":"not found"}')
  }
})
await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${mock.address().port}`
console.log(`Mock auf ${base} · Server: ${SERVER}\n`)

// 2) Drive the built server over stdio, pointed at the mock.
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [SERVER],
  env: { ...process.env, CLAIMONDO_API_BASE: base },
})
const client = new Client({ name: 'claimondo-mcp-smoke', version: '1.0.0' })

try {
  await client.connect(transport)
  check('connect + initialize', true)

  const { tools } = await client.listTools()
  const tool = tools.find((t) => t.name === 'claimondo_finde_sachverstaendige')
  check('Tool gelistet', !!tool, tool?.name ?? 'fehlt')

  const { resources } = await client.listResources()
  const resrc = resources.find((r) => r.uri === 'claimondo://wissensbasis')
  check('Resource gelistet', !!resrc, resrc?.uri ?? 'fehlt')

  const call = await client.callTool({ name: 'claimondo_finde_sachverstaendige', arguments: { plz: '50670', radius: 30 } })
  check('Tool-Call ohne Fehler', !call.isError)
  check('structuredContent.anzahl_treffer == 2', call.structuredContent?.anzahl_treffer === 2, String(call.structuredContent?.anzahl_treffer))
  const md = call.content?.[0]?.text ?? ''
  check('Markdown enthält "Köln" + "2.3 km"', md.includes('Köln') && md.includes('2.3 km'))
  check('Markdown enthält "§ 249"', md.includes('§ 249'))

  const callJson = await client.callTool({ name: 'claimondo_finde_sachverstaendige', arguments: { plz: '50670', response_format: 'json' } })
  check('response_format=json liefert JSON-Text', (callJson.content?.[0]?.text ?? '').trim().startsWith('{'))

  let badRejected = false
  try {
    const bad = await client.callTool({ name: 'claimondo_finde_sachverstaendige', arguments: { plz: 'abc' } })
    badRejected = !!bad.isError
  } catch {
    badRejected = true
  }
  check('Invalide PLZ abgelehnt', badRejected)

  const read = await client.readResource({ uri: 'claimondo://wissensbasis' })
  const text = read.contents?.[0]?.text ?? ''
  check('Resource liefert Wissensbasis-Text', text.includes('Claimondo Wissensbasis') && text.includes('§ 249'))
} catch (err) {
  check('keine Exception', false, err?.message ?? String(err))
} finally {
  await client.close().catch(() => {})
  mock.close()
}

console.log(failures === 0 ? '\n✅ ALLE SMOKE-CHECKS BESTANDEN' : `\n❌ ${failures} CHECK(S) FEHLGESCHLAGEN`)
process.exit(failures === 0 ? 0 : 1)
