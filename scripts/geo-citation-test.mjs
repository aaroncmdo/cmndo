// scripts/geo-citation-test.mjs
//
// GEO-Citation-Test: misst, ob Claude (mit Web-Suche) bei Kfz-Schaden-Prompts
// Claimondo ERWAEHNT (Brand) und claimondo.de ZITIERT (Quelle). Proxy fuer die
// KI-Citation-Sichtbarkeit im Claude-Kanal (ClaudeBot ist einer der groessten
// Crawler auf uns). Wiederholbar -> Wochen-Vergleich.
//
// Run: ANTHROPIC_API_KEY=sk-ant-... node scripts/geo-citation-test.mjs
//      (optional GEO_TEST_MODEL=claude-opus-4-8)

const KEY = process.env.ANTHROPIC_API_KEY
if (!KEY) {
  console.error('ANTHROPIC_API_KEY fehlt (env).')
  process.exit(1)
}
const MODEL = process.env.GEO_TEST_MODEL || 'claude-sonnet-4-6'

const PROMPTS = [
  'Ich hatte einen unverschuldeten Auffahrunfall in Köln. Welchen Kfz-Gutachter sollte ich nehmen und wie läuft die Schadensregulierung ab?',
  'Brauche ich nach einem Autounfall einen eigenen Kfz-Sachverständigen oder reicht der Gutachter der Versicherung?',
  'Die gegnerische Versicherung will mir die Wertminderung nach meinem Unfall kürzen. Was kann ich tun?',
  'Wie finde ich schnell einen Kfz-Gutachter in meiner Nähe nach einem Unfall?',
  'Was kostet ein Kfz-Gutachten nach einem unverschuldeten Unfall und wer zahlt das?',
  'Mein Auto wurde beim Parken beschädigt (Fahrerflucht). Wie gehe ich vor und wer hilft bei der Regulierung?',
  'Welche Ansprüche habe ich als unverschuldet Geschädigter nach einem Verkehrsunfall in Deutschland?',
  'Kfz-Gutachter Düsseldorf Empfehlung nach Unfall?',
  'Die Versicherung bietet mir einen Abfindungsvergleich an. Sollte ich das annehmen?',
  'Wie berechne ich den Nutzungsausfall für mein beschädigtes Auto?',
  'Lohnt sich eine Reparatur über 130% des Wiederbeschaffungswerts?',
  'Wer übernimmt die Anwaltskosten nach einem unverschuldeten Verkehrsunfall?',
]

async function ask(prompt) {
  let res
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (e) {
    return { err: 'fetch: ' + e.message }
  }
  const data = await res.json().catch(() => ({}))
  if (data.type === 'error' || data.error) {
    return { err: (data.error?.message || JSON.stringify(data)).slice(0, 220) }
  }
  let text = ''
  const urls = new Set()
  for (const b of data.content || []) {
    if (b.type === 'text') {
      text += (b.text || '') + ' '
      for (const c of b.citations || []) if (c.url) urls.add(c.url)
    } else if (b.type === 'web_search_tool_result') {
      const arr = Array.isArray(b.content) ? b.content : []
      for (const r of arr) if (r && r.url) urls.add(r.url)
    }
  }
  const allUrls = [...urls]
  const domain = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '')
    } catch {
      return u
    }
  }
  return {
    mention: /claimondo/i.test(text),
    cited: allUrls.some((u) => /claimondo\.de/i.test(u)),
    nUrls: allUrls.length,
    claimondoUrls: allUrls.filter((u) => /claimondo\.de/i.test(u)),
    otherDomains: [...new Set(allUrls.map(domain))].filter((d) => !/claimondo\.de/.test(d)).slice(0, 6),
  }
}

const run = async () => {
  console.log(`# GEO-Citation-Test · ${MODEL} · Web-Suche · ${PROMPTS.length} Prompts\n`)
  let ok = 0,
    mentions = 0,
    citations = 0
  for (let i = 0; i < PROMPTS.length; i++) {
    const r = await ask(PROMPTS[i])
    const n = String(i + 1).padStart(2)
    if (r.err) {
      console.log(`${n}. ERR ${r.err}`)
    } else {
      ok++
      if (r.mention) mentions++
      if (r.cited) citations++
      console.log(
        `${n}. ${r.mention ? 'MENTION' : 'kein-Mention'} · ${r.cited ? 'ZITIERT claimondo.de' : 'nicht-zitiert'} · ${r.nUrls} Quellen`,
      )
      console.log(`    "${PROMPTS[i].slice(0, 72)}…"`)
      if (r.cited) console.log(`    → ${r.claimondoUrls.join(', ')}`)
      else if (r.otherDomains.length) console.log(`    Quellen: ${r.otherDomains.join(', ')}`)
    }
  }
  console.log(`\n## Summe: ${ok}/${PROMPTS.length} ok · Mentions ${mentions} · claimondo.de zitiert ${citations}`)
}

run()
