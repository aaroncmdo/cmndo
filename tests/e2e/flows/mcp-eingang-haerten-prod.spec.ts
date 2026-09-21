import { test, expect, type APIRequestContext } from '@playwright/test'

// stumme-waechter-skip: bewusst manueller Prod-Smoke — jeder Lauf legt echte Leads auf prod an.
// Steht in MANUELLE_LIVE_SMOKES (playwright.config.ts); ein Workflow darf RUN_MCP_HAERTEN_SMOKE
// NICHT setzen, sonst produziert der nightly bei jedem Lauf Datenmüll.
//
// Regel-4-Nachweis zu PR #6026 (Soll-Blatt memory/abnahmen/2026-09-21-mcp-eingang-haerten.md).
// Journey J2 Schritt 1 — Meldung über den KI-Assistenten.
//
// Gefahren wird der Weg, den ein KI-Assistent wirklich geht: JSON-RPC gegen
// https://mcp.claimondo.de/mcp (tools/list bzw. tools/call). Das IST die echte Eingabe dieses
// Eingangs — er hat keine Oberfläche.
//
// ⚠ Der Server antwortet STATELESS: `content-type: application/json`, KEIN `mcp-session-id`-Header
//   und kein SSE-Strom. Am 21.09. gemessen, nachdem ein erster Entwurf die Sitzungskennung
//   erwartete und an `undefined` scheiterte — das Protokoll wurde angenommen statt gelesen.
//
// ⚠ Testdaten nach Regel 7 (Aaron 21.09.): keine erfundenen Namen, keine plausiblen Nummern.
//   +4930555555 → istDummyTelefon() = true UND Twilio meldet 'landline' (beides am 21.09.
//   gemessen). Beide Eigenschaften werden gebraucht: erkennbar als Test, und echter Festnetz-
//   Befund, sonst prüft der Test die Weiche nicht.
// ⚠ KEIN Mobil-Fall mit Versand: der WhatsApp-Chokepoint (baileys-client.ts) prüft nur
//   istInternesTelefon(), NICHT istDummyTelefon() — eine Dummy-Mobilnummer bekäme echte
//   Nachrichten. Der Mobil-Zweig ist deshalb per Lookup-Messung belegt, nicht per Lead.

const MCP_URL = process.env.MCP_SMOKE_URL ?? 'https://mcp.claimondo.de/mcp'
const LAUF = process.env.SMOKE_LAUF ?? String(Date.now()).slice(-6)

// Je Lauf eine andere Endziffernfolge: die Route dedupliziert Meldungen derselben Nummer in
// einem Zeitfenster (findRecentMcpLead). Beim zweiten Lauf am 21.09. kam deshalb statt des
// Festnetz-Hinweises "Diese Schadenmeldung wurde bereits angelegt" — der Test prueft sonst
// die Dedup-Antwort statt der Kanal-Weiche.
// Der Stamm '+4930555555' bleibt erhalten: 030 = Berliner Festnetz (Twilio meldet 'landline'),
// und die sechs Fuenfen machen istDummyTelefon() wahr. Beide Eigenschaften am 21.09. fuer die
// Varianten ...51, ...52, ...59 und ...512 gemessen.
const FESTNETZ_DUMMY = '+4930555555' + (String(Date.now()).slice(-2) || '11')

type JsonRpc = { jsonrpc: '2.0'; id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown }

/**
 * Ein JSON-RPC-Aufruf gegen den Endpunkt. Der Server ist stateless — kein initialize, keine
 * Sitzungskennung. Der SSE-Zweig bleibt als Rückfallebene stehen, falls der Transport wechselt.
 */
async function ruf(request: APIRequestContext, method: string, params: unknown) {
  const res = await request.post(MCP_URL, {
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: Math.floor(Math.random() * 100000), method, params },
  })
  const roh = await res.text()
  const nachrichten: JsonRpc[] = roh.trimStart().startsWith('data:')
    ? roh
        .split(/\r?\n/)
        .filter((z) => z.startsWith('data:'))
        .map((z) => JSON.parse(z.slice(5).trim()) as JsonRpc)
    : [JSON.parse(roh) as JsonRpc]
  return { status: res.status(), nachrichten, roh }
}

test.describe('MCP-Eingang gehärtet — E-Mail-Pflicht und Kanal-Weiche (prod)', () => {
  test.skip(
    !process.env.RUN_MCP_HAERTEN_SMOKE,
    'Manueller Prod-Smoke: legt echte Leads an. Mit RUN_MCP_HAERTEN_SMOKE=1 starten.',
  )

  test('A) tools/list — email steht als Pflichtfeld im ausgelieferten Schema', async ({ request }) => {
    const { status, nachrichten } = await ruf(request, 'tools/list', {})
    expect(status, 'tools/list muss 200 liefern').toBe(200)

    const ergebnis = nachrichten.find((n) => n.result)?.result as
      | { tools?: Array<{ name: string; inputSchema?: { required?: string[]; properties?: Record<string, unknown> } }> }
      | undefined
    const melde = ergebnis?.tools?.find((t) => t.name.includes('melde_schaden'))
    expect(melde, 'Das Meldewerkzeug muss ausgeliefert werden').toBeTruthy()

    // Der Kern der Änderung: das Feld steht in der required-Liste, nicht nur in der Beschreibung.
    expect(melde!.inputSchema?.required ?? [], 'email muss Pflichtfeld sein').toContain('email')
    expect(Object.keys(melde!.inputSchema?.properties ?? {}), 'email bleibt im Schema').toContain('email')

    // Positivkontrolle (Regel-4-Messfalle 5): die Liste muss auch ein NEIN zeigen koennen.
    // Waere sie schlicht die Liste aller Felder, bewiese das ToContain oben nichts.
    // Am 21.09. gegen prod gemessen: optional sind sv_id, slot_start, slot_end, wunschtermin.
    expect(melde!.inputSchema?.required ?? [], 'Terminfelder sind bewusst freiwillig').not.toContain('wunschtermin')
    expect(melde!.inputSchema?.required ?? [], 'sv_id ist bewusst freiwillig').not.toContain('sv_id')
  })

  test('B) tools/call ohne email — das Werkzeug lehnt ab', async ({ request }) => {
    const { nachrichten } = await ruf(request, 'tools/call', {
      name: 'claimondo_melde_schaden',
      arguments: {
        schadenart: 'unfall',
        hergang: 'SMOKE Regel-4 Lauf ' + LAUF + ' — Aufruf ohne E-Mail, muss abgelehnt werden.',
        plz: '10115',
        name: 'SMOKE-MCP-OhneEmail-' + LAUF,
        telefon: FESTNETZ_DUMMY,
        einwilligung_erteilt: true,
      },
    })

    const text = JSON.stringify(nachrichten)
    // Entweder JSON-RPC-Fehler oder ein isError-Ergebnis — beides ist eine Ablehnung.
    const abgelehnt =
      nachrichten.some((n) => n.error) ||
      /isError|invalid_type|required|email/i.test(text)
    expect(abgelehnt, 'Pflichtfeld muss greifen. Antwort: ' + text.slice(0, 400)).toBe(true)
  })

  test('C) Festnetz + email "keine" — die Antwort nennt den Festnetz-Befund', async ({ request }) => {
    const { nachrichten } = await ruf(request, 'tools/call', {
      name: 'claimondo_melde_schaden',
      arguments: {
        schadenart: 'unfall',
        hergang:
          'SMOKE Regel-4 Lauf ' +
          LAUF +
          ' — Festnetznummer ohne E-Mail. Erwartet: kein Kanal, Hinweis auf Festnetz.',
        plz: '10115',
        name: 'SMOKE-MCP-Festnetz-' + LAUF,
        telefon: FESTNETZ_DUMMY,
        email: 'keine',
        einwilligung_erteilt: true,
      },
    })

    const ergebnis = nachrichten.find((n) => n.result)?.result as
      | { content?: Array<{ type: string; text?: string }> }
      | undefined
    const antwort = (ergebnis?.content ?? []).map((c) => c.text ?? '').join('\n')
    expect(antwort.length, 'Das Werkzeug muss antworten').toBeGreaterThan(0)

    // Erst den Dedup-Fall ausschliessen, sonst misst der Test die falsche Antwort.
    expect(
      antwort,
      'Dedup-Fenster getroffen — mit einer anderen Endziffernfolge erneut fahren. Antwort: ' + antwort,
    ).not.toMatch(/bereits angelegt/i)

    // Das Soll (1c Schritt 2): der Assistent erfährt, dass hier weder WhatsApp noch SMS trägt.
    expect(antwort).toMatch(/FESTNETZ/i)
    expect(antwort).toMatch(/E-Mail/i)
    // Kein Kanal — genau der Zustand, den die Weiche voraussagt.
    expect(JSON.stringify(ergebnis)).toMatch(/"kanal":\s*"none"/)

    // ⚠ Der Leitungstyp selbst steht NICHT in der Werkzeug-Antwort: die Route liefert ihn
    //   (`telefon_typ`), der MCP-Server baut sein eigenes Antwortobjekt und reicht ihn nicht
    //   durch. Am 21.09. beim ersten Lauf gemessen — die erste Fassung dieses Tests prüfte die
    //   falsche Stelle. Wo der Typ wirklich ankommen muss, ist der Lead (Abnahmekriterium 4);
    //   das wird per DB-Gegenprobe belegt, nicht hier.
  })
})
