'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NUTZ, SCHMERZ, bsOf, rueckOf } from '@/lib/tools/rechner-data'
import { trackToolComplete } from '@/lib/track'

// Unfall-Assistance-Wizard · 1:1 portiert aus UNFALL-ASSISTANCE.html.
// Route-bewusst (?context= / ?ref=), in-memory State (die Vorlage nutzt KEIN
// localStorage). Dev-Kontext-Switcher (Prototyp-only) entfernt.
//
// STANDALONE-Override (gilt über allem): die Footprint-Telefon-/WhatsApp-Nummer
// 0221 25906530 (kfzgutachter-Nummer) wird NICHT portiert — sie würde au.io
// öffentlich mit Claimondo verknüpfen (siehe site.ts: SITE.phone=null, und
// ArticleCta ohne tel/WA). Entfernte CTAs: alle „Anrufen“-tel + die wa.me/4922…-
// WhatsApp. Die nummernlose Teilen-WhatsApp (wa.me/?text=…autounfall.io) bleibt.
//
// hrefs auf Next-Routen umgeschrieben (transienter 404 für /gutachter-finden WP-6
// und Hub-Routen WP-7 — bewusst, wie WP-2/3-Cross-Links).

type Variant = 'prim' | 'ghost'
type Cta = [label: string, href: string, variant: Variant]
type CalcType = 'sf' | 'nutzungsausfall' | 'schmerzensgeld'
type StepName = 'safety' | 'safety_injury' | 'schuld' | 'schaden' | 'plz' | 'result'

type Ctx = {
  kicker: string
  h1: string
  sub: string
  flow: StepName[]
  schuldDefault?: string
}

const SCHADEN = [
  'Auffahrunfall',
  'Parkschaden',
  'Totalschaden',
  'Hagel / Sturm / Naturgewalt',
  'Wildschaden',
  'Vandalismus',
  'Steinschlag / Glasbruch',
  'E-Auto / Tesla / Batterie',
  'Sonstiges',
]

const CTX: Record<string, Ctx> = {
  home: {
    kicker: 'Unfall-Assistance · 60 Sekunden',
    h1: 'Unfall? Atme. Gleich wissen Sie, was zu tun ist.',
    sub: 'Wenige Fragen — danach Ihr persönlicher Plan. Kostenlos, anonym.',
    flow: ['safety', 'schuld', 'schaden', 'plz', 'result'],
  },
  schaden_typ: {
    kicker: 'Unfall-Assistance',
    h1: 'Sie wissen, was passiert ist — wir zeigen Ihnen Ihre Rechte.',
    sub: 'Drei kurze Fragen, dann Ihr Plan für genau diesen Schaden.',
    flow: ['safety', 'schuld', 'plz', 'result'],
  },
  akut: {
    kicker: 'Soforthilfe · jetzt',
    h1: 'Gerade passiert? Erst durchatmen — dann der Reihe nach.',
    sub: 'Sicherheit zuerst. Danach sichern wir Ihre Ansprüche.',
    flow: ['safety', 'schuld', 'schaden', 'plz', 'result'],
  },
  anspruch: {
    kicker: 'Was steht Ihnen zu?',
    h1: 'Lass uns schätzen, was Ihnen zusteht.',
    sub: 'Eine ehrliche Orientierung — den exakten Wert liefert das Gutachten.',
    flow: ['schuld', 'schaden', 'plz', 'result'],
  },
  personenschaden: {
    kicker: 'Verletzt? · Personenschaden',
    h1: 'Bei Verletzung zählt zuerst Ihre Gesundheit.',
    sub: 'Wir ordnen Ihr Schmerzensgeld grob ein und bringen Sie zum Anwalt.',
    flow: ['safety_injury', 'result'],
  },
  verursacher: {
    kicker: 'Selbst verursacht?',
    h1: 'Selbst schuld? Wir zeigen Ihnen den klügsten nächsten Schritt.',
    sub: 'Kein „Ihnen steht zu“ — sondern: was IST jetzt für Sie am günstigsten.',
    flow: ['result'],
  },
  frustration: {
    kicker: 'Versicherung kürzt?',
    h1: 'Gekürzt? Das müssen Sie nicht hinnehmen.',
    sub: 'Wir zeigen Ihnen das passende BGH-Argument und den Weg zum Anwalt.',
    flow: ['result'],
  },
  kein_unfall: {
    kicker: 'Kein Unfall',
    h1: 'Kein Schadenfall? Dann ist das hier Ihr Werkzeug.',
    sub: 'Für Rabattschutz, SF-Klasse und Versicherungswechsel.',
    flow: ['result'],
  },
  buszgeld: {
    kicker: 'Bußgeld / Anhörung',
    h1: 'Bußgeldbescheid bekommen?',
    sub: 'Wir bringen Sie zur Prüfung — kein Gutachten nötig.',
    flow: ['result'],
  },
  vergleich: {
    kicker: 'Direkt regeln',
    h1: 'Sie vergleichen schon? Dann hier entlang.',
    sub: 'Wenn Sie es abgeben wollen, übernehmen wir die Abwicklung.',
    flow: ['result'],
  },
  bridge: {
    kicker: 'Ihr Unfallgegner hat Sie geschickt',
    h1: 'Damit Sie schnell wissen, was Ihnen zusteht.',
    sub: 'Wir haben den Fall schon im Blick — beantworte nur kurz das Wichtigste.',
    flow: ['schuld', 'schaden', 'plz', 'result'],
    schuldDefault: 'andere',
  },
}

const WA_SHARE =
  'https://wa.me/?text=Hallo%2C%20ich%20war%20heute%20in%20den%20Unfall%20mit%20Ihnen%20verwickelt.%20Damit%20Sie%20schnell%20wissen%2C%20was%20Ihnen%20zusteht%3A%20https%3A%2F%2Fautounfall.io'

type Plan = {
  title: string
  lead: string
  steps: string[]
  ctas: Cta[]
  /** HTML-String mit (umgeschriebenen) <a>-Links. */
  weiter: string
  calc?: CalcType
}

type Answers = { ctx: string; injury: boolean; schuld: string | null; schaden: string; plz: string }

function planFor(state: Answers): Plan {
  const c = state.ctx
  const s = state.schuld
  const art = state.schaden
  const artHint = art && art !== 'Sonstiges' ? ` (${art})` : ''

  if (c === 'verursacher') {
    return {
      title: 'Ihr klügster nächster Schritt als Verursacher',
      lead: 'Hier geht es nicht um Schadensersatz für Sie, sondern um Schadensbegrenzung — und darum, dem Geschädigten eine saubere Regulierung zu ermöglichen (das senkt Ihr Regress-Risiko).',
      steps: [
        'Prüfe, ob sich Selbstzahlung lohnt — der SF-Rechner unten zeigt die Größenordnung.',
        'Bei Fahrerflucht zählt das 24h-Fenster: hol Ihnen früh eine anwaltliche Einschätzung (LexDrive).',
        'Informiere den Geschädigten — per WhatsApp-Brücke weiß er sofort, was ihm zusteht.',
      ],
      ctas: [
        ['SF-Rückstufung prüfen', '#calc', 'prim'],
        ['LexDrive-Erstberatung', 'https://lex-drive.com', 'ghost'],
        ['Geschädigten per WhatsApp informieren', WA_SHARE, 'ghost'],
      ],
      weiter: 'Weiterlesen: <a href="/schadenfreiheitsklasse">SF-Klasse & Rückstufung</a>',
      calc: 'sf',
    }
  }
  if (c === 'frustration') {
    return {
      title: 'Die Kürzung müssen Sie nicht hinnehmen',
      lead: 'Versicherer kürzen oft Positionen, die Ihnen nach BGH zustehen. Mit dem richtigen Argument — oder einem Anwalt — holen Sie das Geld zurück.',
      steps: [
        'Prüfe, welche Position gekürzt wurde (Verbringungskosten, UPE-Aufschläge, Stundensatz, Nutzungsausfall).',
        'Hol Ihnen das passende BGH-Argument als Beleg.',
        'Bei hartnäckiger Kürzung: LexDrive schreibt das für Sie — bei Fremdverschulden ohne Kostenrisiko.',
      ],
      ctas: [
        ['Anwalt einschalten (LexDrive)', 'https://lex-drive.com', 'prim'],
        ['Kürzungs-Checker öffnen', '/kuerzungs-checker', 'ghost'],
      ],
      weiter: 'Weiterlesen: <a href="/werkstattrisiko-bgh-2024">Werkstattrisiko (BGH 2024)</a>',
    }
  }
  if (c === 'personenschaden') {
    return {
      title: 'Personenschaden: Gesundheit + Anspruch sichern',
      lead: 'Bei Verletzungen steht Ihnen zusätzlich zum Sachschaden Schmerzensgeld nach §253 BGB zu. Die Höhe hängt vom Einzelfall ab — die Schätzung unten gibt die Größenordnung.',
      steps: [
        'Ärztliche Dokumentation sichern (auch verzögerte Beschwerden).',
        'Schmerzensgeld grob einordnen (Schätzer unten).',
        'Anwalt einschalten — Personenschaden gehört in fachkundige Hände (LexDrive).',
      ],
      ctas: [
        ['Schmerzensgeld schätzen', '#calc', 'prim'],
        ['Anwalt (LexDrive)', 'https://lex-drive.com', 'ghost'],
      ],
      weiter: 'Weiterlesen: <a href="/schmerzensgeld-hws-schleudertrauma">HWS / Schleudertrauma</a>',
      calc: 'schmerzensgeld',
    }
  }
  if (c === 'kein_unfall') {
    return {
      title: 'Kein Schadenfall — das hilft Ihnen trotzdem',
      lead: 'Sie hatten keinen Unfall, wollen aber Ihre Versicherung optimieren. Dafür ist die Unfall-Assistance nicht da — diese Werkzeuge schon.',
      steps: [
        'SF-Klasse & Rabattschutz verstehen.',
        'Selbst zahlen vs. Versicherung durchrechnen (SF-Rechner).',
        'Versicherungswechsel/Vergleich prüfen.',
      ],
      ctas: [
        ['SF-Rechner öffnen', '#calc', 'prim'],
        ['SF-Klasse-Ratgeber', '/schadenfreiheitsklasse', 'ghost'],
      ],
      weiter: '',
      calc: 'sf',
    }
  }
  if (c === 'buszgeld') {
    return {
      title: 'Bußgeldbescheid: erst prüfen, dann zahlen',
      lead: 'Ein Bußgeldbescheid ist kein Schadenfall — hier geht es um Verteidigung. Viele Bescheide sind angreifbar (Messfehler, Fristen, Formfehler).',
      steps: [
        'Frist beachten: Einspruch meist binnen 2 Wochen.',
        'Bescheid prüfen lassen — ob sich ein Einspruch lohnt.',
        'LexDrive übernimmt die Prüfung und den Einspruch.',
      ],
      ctas: [['Bußgeld prüfen lassen (LexDrive)', 'https://lex-drive.com', 'prim']],
      weiter: '',
    }
  }
  if (c === 'vergleich') {
    return {
      title: 'Sie vergleichen — wir nehmen Ihnen alles ab',
      lead: 'Wenn Sie den Fall nicht selbst stemmen wollen: autounfall.io übernimmt Gutachter, Anwalt und Abwicklung. Bei unverschuldetem Unfall für Sie kostenfrei.',
      steps: [
        'Ein Ansprechpartner für Gutachter, Anwalt und Versicherung.',
        'Schneller, weniger Papierkram.',
        'Bei Fremdverschulden 0 € Eigenanteil (§249 BGB, vorbehaltlich Anerkenntnis).',
      ],
      ctas: [['Jetzt regeln lassen', '/gutachter-finden#anfrage', 'prim']],
      weiter: '',
    }
  }
  // Opfer-Standard (home/schaden_typ/akut/anspruch/bridge) — nach Schuld
  if (s === 'ich') {
    return {
      title: 'Selbst verursacht: so läuft es über die Kasko',
      lead: 'Bei eigenem Verschulden greift in der Regel Ihre Kaskoversicherung. Prüfe vorher, ob sich Selbstzahlung lohnt (SF-Rückstufung).',
      steps: [
        'Schaden zeitnah der Kasko melden.',
        'SF-Rückstufung gegen Schadenshöhe abwägen (Rechner unten).',
        'Wir erklären den Ablauf und ordnen die Schadenshöhe ein.',
      ],
      ctas: [['SF-Rückstufung prüfen', '#calc', 'prim']],
      weiter: 'Weiterlesen: <a href="/schadenfreiheitsklasse">SF-Klasse</a>',
      calc: 'sf',
    }
  }
  if (s === 'teils_teils') {
    return {
      title: 'Teilschuld: anteiliger Ersatz — Quote entscheidet',
      lead: 'Bei Mitverschulden bekommen Sie anteilig ersetzt (z. B. 50 %). Die genaue Quote ist oft strittig — ein Gutachten und ggf. ein Anwalt stärken Ihre Position. Achtung: Teilschuld kann auch Ihre SF-Klasse berühren.',
      steps: [
        'Beweise sichern (Fotos, Zeugen, Endstellung) — die Quote hängt davon ab.',
        'Eigenes Gutachten stärkt Ihre Seite der Schuldquote.',
        'Bei strittiger Quote: Anwalt prüfen lassen.',
      ],
      ctas: [['Gutachter anfragen', '/gutachter-finden#anfrage', 'prim']],
      weiter: 'Weiterlesen: <a href="/anscheinsbeweis-erklaert">Anscheinsbeweis & Schuldquote</a>',
    }
  }
  if (s === 'unklar') {
    return {
      title: 'Schuld unklar? Sichere zuerst die Beweise',
      lead: 'Solange die Schuldfrage offen ist, zählt jede Dokumentation. Ein eigenes Gutachten schafft eine neutrale Grundlage.',
      steps: [
        'Fotos von Fahrzeugen, Endstellung, Kennzeichen, Umgebung.',
        'Zeugen + Hergang notieren, solange frisch.',
        'Unabhängig begutachten lassen — neutrale Basis.',
      ],
      ctas: [['Gutachter anfragen', '/gutachter-finden#anfrage', 'prim']],
      weiter: 'Weiterlesen: <a href="/beweissicherung">Beweissicherung</a>',
    }
  }
  // schuld === 'andere' (Fremdverschulden)
  const leadExtra =
    art === 'Auffahrunfall'
      ? ' Beim Auffahrunfall spricht der Anscheinsbeweis zunächst gegen den Auffahrenden (§4 StVO) — als Aufgefahrener stehen Ihre Chancen gut.'
      : ''
  return {
    title: 'Gute Nachricht: Ihnen steht ein eigenes Gutachten zu' + (art ? ' ' + '· ' + art : ''),
    lead:
      'Bei unverschuldetem Unfall trägt die gegnerische Haftpflicht die Kosten für Ihren eigenen, unabhängigen Sachverständigen (§249 BGB, vorbehaltlich Anerkenntnis).' +
      leadExtra,
    steps: [
      'Beauftrage einen eigenen Gutachter — nicht den der Gegnerversicherung.',
      'Lass den Schaden vor Reparatur vollständig dokumentieren' + artHint + '.',
      'Gib der Versicherung nichts Schriftliches, das wie ein Schuldeingeständnis wirkt.',
      'Wir vermitteln einen Sachverständigen in Ihrer Nähe und übernehmen den Schriftverkehr.',
    ],
    ctas: [['Gutachter anfragen', '/gutachter-finden#anfrage', 'prim']],
    weiter:
      'Auch interessant: <a href="/nutzungsausfall">Nutzungsausfall berechnen</a> · <a href="/merkantile-wertminderung">Wertminderung</a>',
    calc: 'nutzungsausfall',
  }
}

// ── Eingebettete Wizard-Rechner (eigene Output-Texte, NICHT der 6-in-1-Rechner) ──
const calcBox =
  'mt-4 rounded-ios-sm border border-au-sand-dark bg-au-paper-warm p-4'
const calcField =
  'w-full box-border rounded-ios-sm border-[1.5px] border-au-sand-dark bg-au-surface px-3.5 py-3 text-base text-au-ink focus-visible:border-au-amber focus-visible:outline-2 focus-visible:outline-au-amber'
const calcLabel = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-wide text-au-ink-soft'
const outCls =
  'mt-3 rounded-ios-sm border border-au-sand-dark bg-au-surface px-3.5 py-3 text-[15px] text-au-ink [&_b]:font-semibold [&_b]:text-au-amber [&_span]:mt-1 [&_span]:block [&_span]:text-[13px] [&_span]:text-au-muted'

const num = (v: string) => Number(v)

function WizardCalc({ type }: { type: CalcType }) {
  const [v, setV] = useState<Record<string, string>>({})
  let html: string | null = null

  if (type === 'sf') {
    const sf = num(v.cSf ?? '')
    const be = num(v.cBe ?? '')
    const sch = num(v.cScha ?? '')
    if (sf && be && sch) {
      const sfNeu = rueckOf(sf)
      const beNeu = be * (bsOf(sfNeu) / bsOf(sf))
      const jahre = Math.max(1, sf - sfNeu)
      const diff = beNeu - be
      const lo = Math.round((diff * jahre * 0.5) / 10) * 10
      const hi = Math.round((diff * jahre) / 10) * 10
      const rec =
        sch < lo
          ? 'Tendenz: <b>selbst zahlen</b> — der Schaden liegt unter dem geschätzten Mehrbeitrag.'
          : sch > hi * 1.2
            ? 'Tendenz: <b>Versicherung nutzen</b> — der Schaden übersteigt den Mehrbeitrag deutlich.'
            : '<b>Grenzfall</b> — beim Versicherer den genauen Wiederaufstiegs-Effekt anfragen. Faustregel: Schaden unter ~800 € bei hoher SF → eher selbst zahlen.'
      html = `Rückstufung ca. SF ${sf} → SF ${sfNeu}. Geschätzter Mehrbeitrag über ~${jahre} Jahre: <b>${lo}–${hi} €</b>.<br>${rec}<br><span>Richtwert, kein Rechtsanspruch — exakt nur über Ihren Versicherer.</span>`
    }
    return (
      <div className={calcBox}>
        <h3 className="mb-1 font-display text-lg text-au-ink">
          SF-Rückstufung: selbst zahlen oder Versicherung?
        </h3>
        <p className="mb-3 mt-0.5 text-sm text-au-ink-soft">
          Grobe Orientierung — Rückstufung ist versichererabhängig.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={calcLabel}>Aktuelle SF-Klasse</label>
            <input type="number" min={0} max={35} placeholder="20" className={calcField} value={v.cSf ?? ''} onChange={(e) => setV({ ...v, cSf: e.target.value })} />
          </div>
          <div>
            <label className={calcLabel}>Jahresbeitrag €</label>
            <input type="number" min={0} placeholder="320" className={calcField} value={v.cBe ?? ''} onChange={(e) => setV({ ...v, cBe: e.target.value })} />
          </div>
        </div>
        <div className="mt-3">
          <label className={calcLabel}>Schadenshöhe €</label>
          <input type="number" min={0} placeholder="700" className={calcField} value={v.cScha ?? ''} onChange={(e) => setV({ ...v, cScha: e.target.value })} />
        </div>
        {html ? <div className={outCls} dangerouslySetInnerHTML={{ __html: html }} /> : null}
      </div>
    )
  }

  if (type === 'nutzungsausfall') {
    const k = v.nK ?? ''
    const t = num(v.nT ?? '')
    if (k && t) {
      const r = NUTZ[k]
      html = `Geschätzter Nutzungsausfall: <b>${r[0] * t}–${r[1] * t} €</b> (${r[0]}–${r[1]} €/Tag × ${t} Tage).<br><span>§249 BGB / §287 ZPO · Richtwert — exakte Klasse + Tage aus dem Gutachten.</span>`
    }
    return (
      <div className={calcBox}>
        <h3 className="mb-1 font-display text-lg text-au-ink">Nutzungsausfall schätzen</h3>
        <p className="mb-3 mt-0.5 text-sm text-au-ink-soft">
          Pauschale nach Fahrzeugklasse (Sanden-Danner-Größenordnung).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={calcLabel}>Fahrzeugklasse</label>
            <select className={calcField} value={v.nK ?? ''} onChange={(e) => setV({ ...v, nK: e.target.value })}>
              <option value="">wählen…</option>
              {Object.keys(NUTZ).map((key) => (
                <option key={key} value={key}>
                  Klasse {key}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={calcLabel}>Ausfalltage</label>
            <input type="number" min={1} placeholder="14" className={calcField} value={v.nT ?? ''} onChange={(e) => setV({ ...v, nT: e.target.value })} />
          </div>
        </div>
        {html ? <div className={outCls} dangerouslySetInnerHTML={{ __html: html }} /> : null}
      </div>
    )
  }

  // schmerzensgeld
  const sv = v.sV ?? ''
  if (sv) {
    const r = SCHMERZ[sv]
    html = `Größenordnung: <b>${r[0].toLocaleString('de')}–${r[1].toLocaleString('de')} €</b>.<br><span>§253 BGB · grobe Orientierung (Hacks/Wellner-Größenordnung), kein Anspruch — Einzelfall durch Anwalt.</span>`
  }
  return (
    <div className={calcBox}>
      <h3 className="mb-1 font-display text-lg text-au-ink">Schmerzensgeld einordnen</h3>
      <p className="mb-3 mt-0.5 text-sm text-au-ink-soft">
        Größenordnung nach Verletzungsart — Einzelfall weicht stark ab.
      </p>
      <div>
        <label className={calcLabel}>Verletzung</label>
        <select className={calcField} value={v.sV ?? ''} onChange={(e) => setV({ ...v, sV: e.target.value })}>
          <option value="">wählen…</option>
          {Object.keys(SCHMERZ).map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </div>
      {html ? <div className={outCls} dangerouslySetInnerHTML={{ __html: html }} /> : null}
    </div>
  )
}

// ── Hilfs-UI ────────────────────────────────────────────────────────────────
const optBtn =
  'flex w-full items-center gap-3 rounded-ios-sm border-[1.5px] border-au-sand-dark bg-au-paper-warm px-4 py-3.5 text-left text-base font-semibold text-au-ink transition-colors hover:border-au-amber hover:bg-au-surface'
const nextBtn =
  'inline-flex min-h-[44px] items-center gap-2 rounded-ios-sm bg-au-amber px-[22px] py-3 text-base font-bold text-au-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45'
const backBtn = 'cursor-pointer px-1 py-2 text-[15px] font-semibold text-au-ink-soft underline'
const fieldCls =
  'w-full box-border rounded-ios-sm border-[1.5px] border-au-sand-dark bg-au-surface px-3.5 py-3 text-base text-au-ink focus-visible:border-au-amber focus-visible:outline-2 focus-visible:outline-au-amber'

function makeAnswers(ctx: string): Answers {
  return { ctx, injury: false, schuld: CTX[ctx].schuldDefault ?? null, schaden: '', plz: '' }
}

export function UnfallAssistanceWizard() {
  const sp = useSearchParams()
  const initCtx = (() => {
    let c = sp.get('context')
    if (sp.get('ref') === 'verursacher') c = 'bridge'
    return c && c in CTX ? c : 'home'
  })()

  const [answers, setAnswers] = useState<Answers>(() => makeAnswers(initCtx))
  const [idx, setIdx] = useState(0)
  const [injuryPrompt, setInjuryPrompt] = useState(false)

  const ctx = CTX[answers.ctx]
  const flow = ctx.flow
  const step = flow[idx]

  useEffect(() => {
    if (step === 'result') trackToolComplete('unfall-assistance')
  }, [step])

  function reset() {
    setAnswers(makeAnswers(answers.ctx))
    setIdx(0)
    setInjuryPrompt(false)
  }
  function next() {
    setInjuryPrompt(false)
    setIdx((i) => i + 1)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function prev() {
    setInjuryPrompt(false)
    setIdx((i) => Math.max(0, i - 1))
  }

  const progressSteps = flow.filter((s) => s !== 'result').length

  return (
    <div>
      {/* Hero (kontext-abhängig) */}
      <section className="pb-1 pt-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-au-amber-dark">
          {ctx.kicker}
        </p>
        <h1 className="mt-2 text-balance font-display text-3xl font-extrabold leading-[1.05] tracking-tight text-au-ink sm:text-4xl">
          {ctx.h1}
        </h1>
        <p className="mt-2 text-[17px] leading-relaxed text-au-ink-soft">{ctx.sub}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-[13px] text-au-muted">
          <span>✓ Keine Werbung, keine Tracking-Wall</span>
          <span>✓ Bei unverschuldetem Unfall kostenfrei (§249 BGB)</span>
        </div>
      </section>

      <section className="mt-5 rounded-ios-md border border-au-sand-dark bg-au-surface p-6 shadow-au-md sm:p-7">
        {progressSteps > 1 ? (
          <div className="mb-4 flex gap-1.5" aria-hidden>
            {Array.from({ length: progressSteps }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i <= idx ? 'bg-au-amber' : 'bg-au-sand-dark'}`}
              />
            ))}
          </div>
        ) : null}

        <div aria-live="polite">
          {/* ── Sicherheit (Verletzung?) ── */}
          {step === 'safety' ? (
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-muted">
                Sicherheit zuerst
              </p>
              <h2 className="my-3 font-display text-[23px] font-bold leading-tight text-au-ink">
                Sind Sie oder ist jemand verletzt?
              </h2>
              <div className="flex flex-col gap-2.5">
                <button type="button" className={optBtn} onClick={() => { setAnswers({ ...answers, injury: false }); next() }}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-au-sand font-bold text-au-ink">🙂</span>{' '}
                  Nein, alle wohlauf
                </button>
                <button type="button" className={optBtn} onClick={() => { setAnswers({ ...answers, injury: true }); setInjuryPrompt(true) }}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-au-sand font-bold text-au-ink">!</span>{' '}
                  Ja, jemand ist verletzt
                </button>
              </div>
              {injuryPrompt ? (
                <div className="mt-3 rounded-ios-sm border border-au-amber-light bg-au-amber-light/30 p-3.5 text-[15px] leading-relaxed text-au-amber-dark">
                  <strong>Ruf zuerst die 112.</strong> Gesundheit geht vor. Wir sind danach noch da.
                  <div className="mt-2.5">
                    <button type="button" className={nextBtn} onClick={next}>
                      Trotzdem weiter →
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── Sicherheit (Personenschaden-Einstieg) ── */}
          {step === 'safety_injury' ? (
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-muted">
                Sicherheit zuerst
              </p>
              <h2 className="my-3 font-display text-[23px] font-bold leading-tight text-au-ink">
                Bei Verletzung gilt: zuerst die Gesundheit.
              </h2>
              <div className="rounded-ios-sm border border-au-amber-light bg-au-amber-light/30 p-3.5 text-[15px] leading-relaxed text-au-amber-dark">
                <strong>Akut: ruf 112.</strong> Lassen Sie sich ärztlich untersuchen — auch wenn
                Beschwerden erst nach Stunden kommen (Beschwerden dokumentieren ist für Ihr
                Schmerzensgeld wichtig).
              </div>
              <div className="mt-4 flex items-center justify-end">
                <button type="button" className={nextBtn} onClick={next}>
                  Weiter zur Einordnung →
                </button>
              </div>
            </div>
          ) : null}

          {/* ── Schuld ── */}
          {step === 'schuld' ? (
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-muted">
                Hergang
              </p>
              <h2 className="my-3 font-display text-[23px] font-bold leading-tight text-au-ink">
                Wer hat den Unfall verursacht?
              </h2>
              <div className="flex flex-col gap-2.5">
                {[
                  ['andere', '→', 'Der/die andere'],
                  ['ich', '←', 'Ich selbst'],
                  ['teils_teils', '±', 'Teils ich, teils der/die andere'],
                  ['unklar', '?', 'Noch unklar'],
                ].map(([val, ic, label]) => (
                  <button key={val} type="button" className={optBtn} onClick={() => { setAnswers({ ...answers, schuld: val }); next() }}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-au-sand font-bold text-au-ink">{ic}</span>{' '}
                    {label}
                  </button>
                ))}
              </div>
              {idx > 0 ? (
                <div className="mt-4">
                  <button type="button" className={backBtn} onClick={prev}>
                    ← Zurück
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── Schaden ── */}
          {step === 'schaden' ? (
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-muted">
                Schaden
              </p>
              <h2 className="my-3 font-display text-[23px] font-bold leading-tight text-au-ink">
                Was ist passiert?
              </h2>
              <div>
                <label htmlFor="wzS" className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-wide text-au-ink-soft">
                  Schadensart
                </label>
                <select
                  id="wzS"
                  className={fieldCls}
                  value={answers.schaden}
                  onChange={(e) => setAnswers({ ...answers, schaden: e.target.value })}
                >
                  <option value="">Bitte auswählen…</option>
                  {SCHADEN.map((sd) => (
                    <option key={sd} value={sd}>
                      {sd}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <button type="button" className={backBtn} onClick={prev}>
                  ← Zurück
                </button>
                <button type="button" className={nextBtn} disabled={!answers.schaden} onClick={next}>
                  Weiter →
                </button>
              </div>
            </div>
          ) : null}

          {/* ── PLZ ── */}
          {step === 'plz' ? (
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-muted">
                Ort
              </p>
              <h2 className="my-3 font-display text-[23px] font-bold leading-tight text-au-ink">
                Wo steht Ihr Auto gerade?
              </h2>
              <div>
                <label htmlFor="wzP" className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-wide text-au-ink-soft">
                  Postleitzahl
                </label>
                <input
                  id="wzP"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="z. B. 50670"
                  className={fieldCls}
                  value={answers.plz}
                  onChange={(e) => setAnswers({ ...answers, plz: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <button type="button" className={backBtn} onClick={prev}>
                  ← Zurück
                </button>
                <button type="button" className={nextBtn} disabled={answers.plz.length !== 5} onClick={next}>
                  Plan anzeigen →
                </button>
              </div>
            </div>
          ) : null}

          {/* ── Ergebnis ── */}
          {step === 'result' ? <Result answers={answers} onReset={reset} /> : null}
        </div>
      </section>

      <p className="mt-4 text-[13px] leading-relaxed text-au-muted">
        Keine Rechtsberatung; Schätzwerte sind Richtwerte (§249/§253 BGB, „vorbehaltlich
        Anerkenntnis“). Rechtlich begleitet durch{' '}
        <a href="https://lex-drive.com" rel="noopener" target="_blank" className="font-semibold text-au-amber-dark underline">
          LexDrive UG
        </a>
        .
      </p>
    </div>
  )
}

function CtaButton({ cta }: { cta: Cta }) {
  const [label, href, variant] = cta
  const cls =
    variant === 'prim'
      ? 'inline-flex min-h-[44px] items-center gap-2 rounded-ios-sm bg-au-amber px-[18px] py-3 text-[15px] font-bold text-au-surface transition-opacity hover:opacity-90'
      : 'inline-flex min-h-[44px] items-center gap-2 rounded-ios-sm border-[1.5px] border-au-sand-dark bg-au-surface px-[18px] py-3 text-[15px] font-bold text-au-ink transition-colors hover:border-au-amber hover:text-au-amber'
  if (href === '#calc') {
    return (
      <a
        href="#wz-calc"
        className={cls}
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('wz-calc')?.scrollIntoView({ behavior: 'smooth' })
        }}
      >
        {label}
      </a>
    )
  }
  if (/^https?:/.test(href)) {
    return (
      <a href={href} rel="noopener" target="_blank" className={cls}>
        {label}
      </a>
    )
  }
  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  )
}

function Result({ answers, onReset }: { answers: Answers; onReset: () => void }) {
  const p = planFor(answers)
  return (
    <div>
      <p className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-au-amber-dark">
        ✓ Ihr persönlicher Plan
      </p>
      <h2 className="my-3 font-display text-[23px] font-bold leading-tight text-au-ink">{p.title}</h2>
      <p className="text-base leading-relaxed text-au-ink-soft">{p.lead}</p>
      <ol className="mt-3.5 list-none p-0">
        {p.steps.map((s, i) => (
          <li key={i} className="flex gap-3 border-t border-au-sand-dark py-2.5">
            <span className="grid h-[25px] w-[25px] shrink-0 place-items-center rounded-full bg-au-ink text-[13px] font-bold text-au-surface">
              {i + 1}
            </span>
            <p className="text-[15px] leading-relaxed text-au-ink-soft">{s}</p>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap gap-2.5">
        {p.ctas.map((c, i) => (
          <CtaButton key={i} cta={c} />
        ))}
      </div>
      {p.calc ? (
        <div id="wz-calc">
          <WizardCalc type={p.calc} />
        </div>
      ) : null}
      {p.weiter ? (
        <div
          className="mt-4 rounded-ios-sm border border-au-sand-dark bg-au-paper-warm p-3.5 text-sm text-au-ink-soft [&_a]:font-semibold [&_a]:text-au-amber-dark [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: '→ ' + p.weiter }}
        />
      ) : null}
      <div className="mt-4 border-t border-au-sand-dark pt-3 text-[13px] leading-relaxed text-au-muted">
        Erste Orientierung, keine Rechtsberatung. Kostenübernahme „bei unverschuldetem Unfall“
        vorbehaltlich Anerkenntnis durch die gegnerische Versicherung. Geprüft durch{' '}
        <a href="https://lex-drive.com" rel="noopener" target="_blank" className="font-semibold text-au-amber-dark underline">
          LexDrive UG
        </a>
        .
        <div className="mt-2">
          <button type="button" className={backBtn} onClick={onReset}>
            ↺ Von vorn
          </button>
        </div>
      </div>
    </div>
  )
}
