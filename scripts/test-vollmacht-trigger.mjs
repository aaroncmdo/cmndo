// Test: nach SA-Unterschrift + service_typ='komplett' → Subphase 2.1
// 'Vollmacht ausstehend'. Negativ-Tests: nur_gutachter + Vollmacht-signiert
// sollten NICHT auf 2.1 landen.

// dynamic-import damit das 'use server'-Setup nicht greift (Node-Script)
const { resolveSubphase } = await import('../src/lib/fall/subphase-resolver.ts')
  .catch(async () => {
    // tsx-Pfad falls .ts nicht direkt geht
    const tsx = await import('tsx/esm/api')
    tsx.register()
    return await import('../src/lib/fall/subphase-resolver.ts')
  })

const baseFall = {
  id: 'test-fall-001',
  status: 'erfassung',
  service_typ: 'komplett',
  sa_unterschrieben_am: '2026-05-13T10:00:00Z',
  vollmacht_status: null,
  vollmacht_signiert_am: null,
  vollmacht_geprueft_am: null,
  szenario: null,
  abgeschlossen_am: null,
  kanzlei_provision_status: null,
  gutachten_eingegangen_am: null,
  regulierung_am: null,
}

function laufeTest(label, fallOverrides, erwarteSubphase, erwarteLabel) {
  const fall = { ...baseFall, ...fallOverrides }
  const result = resolveSubphase({ fall, lead: null, gutachter_termine: [], webhook_events: [] })
  const ok = result.subphase === erwarteSubphase
  const sym = ok ? '✅' : '❌'
  console.log(`${sym} ${label}`)
  console.log(`   erwartet: ${erwarteSubphase} (${erwarteLabel})`)
  console.log(`   bekommen: ${result.subphase} (${result.label})`)
  if (result.trigger_fields.length) {
    console.log(`   trigger:`, result.trigger_fields.map(t => `${t.name}=${t.value}`).join(', '))
  }
  return ok
}

console.log('▶ Subphase-Resolver-Tests: SA + Komplettpaket → Vollmacht ausstehend\n')

const results = []
results.push(laufeTest(
  '1) Komplettpaket + SA signiert + Vollmacht offen → 2.1',
  {},
  '2.1',
  'Vollmacht ausstehend',
))

results.push(laufeTest(
  '2) Komplettpaket + SA signiert + Vollmacht signiert → 2.2',
  { vollmacht_signiert_am: '2026-05-13T11:00:00Z', vollmacht_status: 'bestaetigt', vollmacht_geprueft_am: '2026-05-13T11:00:00Z' },
  '2.2',
  'Vollmacht bestätigt',
))

results.push(laufeTest(
  '3) NUR-Gutachter + SA signiert + Vollmacht offen → NICHT 2.1 (Phase 1)',
  { service_typ: 'nur_gutachter' },
  '1',
  'Phase unbekannt — status: erfassung',
))

results.push(laufeTest(
  '4) Komplettpaket + SA NICHT signiert → NICHT 2.1 (Phase 1)',
  { sa_unterschrieben_am: null },
  '1',
  'Phase unbekannt',
))

const passed = results.filter(Boolean).length
const total = results.length
console.log(`\n${passed === total ? '✅' : '❌'} ${passed}/${total} Tests bestanden`)
process.exit(passed === total ? 0 : 1)
