#!/usr/bin/env node
//
// Skill-Radar — UserPromptSubmit-Hook.
//
// Prueft bei jedem Prompt, ob ein verfuegbarer Skill zum Thema passt, und blendet die
// Treffer ein. Hintergrund: es gibt inzwischen ~70 Skills aus drei Quellen (user,
// Plugins, Repo). Bei der Menge weiss keine Session mehr, was existiert — und ein Skill,
// den niemand kennt, wirkt wie keiner.
//
// ⭐ AN ECHTEN PROMPTS KALIBRIERT, nicht geraten. Grundlage: 2585 User-Prompts aus 41
// Session-Transkripten. Gemessene Trefferquote der ausgelieferten Fassung: 1,9 %.
// Das ist Absicht — die Mehrheit der Prompts ist Fortsetzung ("weiter", "ja mach das"),
// und ein Hinweis, der bei jedem zweiten Prompt erscheint, wird weggeklickt wie ein
// Alarm ins tote Postfach.
//
// Kalibrierungs-Befunde, die hier eingebaut sind:
//   1. Die Skill-Trigger sind ENGLISCH, die Prompts DEUTSCH -> ohne die DE-Bruecke
//      unten lag die Trefferquote bei 0,2 %.
//   2. Plugin-Skills liegen 5 Ebenen tief (cache/<plugin>/<version>/skills/<name>/) —
//      eine zu flache Suche verliert brainstorming, supabase & Co. lautlos.
//   3. Descriptions nutzen BEIDE Quote-Sorten; wer nur "..." liest, findet pro Skill
//      genau einen Trigger (den Namen) und matcht praktisch nie.
//   4. `claim` heisst hier SCHADENFALL, nicht Werbe-Claim. Ohne die Sperre unten waren
//      3 von 16 Treffern allein deswegen falsch.
//
// Der Hook ist rein informativ: er blockt nichts, und bei jedem Fehler endet er still
// mit Exit 0. Ein kaputtes Radar darf keinen Prompt kosten.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = process.env.USERPROFILE || homedir()
const QUELLEN = [
  join(HOME, '.claude', 'skills'),
  join(process.cwd(), '.claude', 'skills'),
  join(HOME, '.claude', 'plugins', 'cache'),
]

function findeSkillDateien(wurzel, tiefe = 0) {
  // 6 Ebenen: Plugin-Skills liegen als cache/<plugin>/<version>/skills/<name>/SKILL.md
  if (tiefe > 6 || !existsSync(wurzel)) return []
  const out = []
  let eintraege
  try {
    eintraege = readdirSync(wurzel, { withFileTypes: true })
  } catch {
    return []
  }
  for (const e of eintraege) {
    if (e.name === 'node_modules' || e.name.startsWith('.git')) continue
    const p = join(wurzel, e.name)
    if (e.isDirectory()) out.push(...findeSkillDateien(p, tiefe + 1))
    else if (e.name === 'SKILL.md') out.push(p)
  }
  return out
}

function leseFrontmatter(pfad) {
  let roh
  try {
    roh = readFileSync(pfad, 'utf8').slice(0, 4000)
  } catch {
    return null
  }
  if (!roh.startsWith('---')) return null
  const ende = roh.indexOf('\n---', 3)
  if (ende < 0) return null
  const fm = roh.slice(3, ende)
  const name = (fm.match(/^name:\s*(.+)$/m) || [])[1]?.trim()
  const dm = fm.match(/^description:\s*([\s\S]*?)(?=\n[a-zA-Z_-]+:\s|\s*$)/m)
  const description = (dm ? dm[1] : '').replace(/\s+/g, ' ').trim()
  return name ? { name, description } : null
}

/** Trigger-Phrasen: in den Descriptions kuratiert in Anfuehrungszeichen hinterlegt. */
function triggerAus({ name, description }) {
  const roh = [
    ...[...description.matchAll(/"([^"]{3,60})"/g)].map((m) => m[1]),
    ...[...description.matchAll(/'([^']{3,60})'/g)].map((m) => m[1]),
  ]
  const phrasen = new Set()
  for (const r of roh) {
    const s = r.replace(/[,.;:]+$/, '').trim().toLowerCase()
    if (s.length >= 5) phrasen.add(s)
  }
  phrasen.add(name.toLowerCase().replace(/-/g, ' '))
  return [...phrasen]
}

function ladeSkills() {
  const skills = []
  const gesehen = new Set()
  for (const q of QUELLEN) {
    for (const p of findeSkillDateien(q)) {
      const fm = leseFrontmatter(p)
      if (!fm || gesehen.has(fm.name)) continue
      gesehen.add(fm.name)
      skills.push({ ...fm, trigger: triggerAus(fm) })
    }
  }
  return skills
}

/**
 * Deutsche Bruecke. Schluessel = ECHTER Skill-Name (nicht `plugin:skill`) — sonst
 * greift der Eintrag ins Leere, ohne dass es auffaellt.
 */
const DE = {
  'seo-audit': ['seo', 'ranking', 'sichtbarkeit', 'indexier', 'meta-title', 'meta description', 'sitemap'],
  'ai-seo': ['llm', 'chatgpt', 'perplexity', 'ki-suche', 'ai overview', 'zitiert werden'],
  'seo-geo': ['hyperlokal', 'stadtseite'],
  'schema-markup': ['schema', 'json-ld', 'strukturierte daten', 'rich snippet'],
  'page-cro': ['conversion', 'konversion', 'landingpage', 'landing page', 'konvertiert', 'absprung'],
  copywriting: ['headline', 'ueberschrift', 'slogan', 'werbetext'],
  'copy-editing': ['formulierung', 'umformulieren', 'text ueberarbeiten', 'lektorat'],
  'email-sequence': ['mailsequenz', 'mail-sequenz', 'mailstrecke', 'drip', 'nurture', 'willkommens'],
  'cold-email': ['cold mail', 'cold-mail', 'kaltakquise', 'outreach', 'erstkontakt'],
  'paid-ads': ['google ads', 'meta ads', 'werbekampagne', 'ad spend'],
  'pricing-strategy': ['preismodell', 'pricing', 'tarif', 'abo-modell', 'abopreis'],
  'paywall-upgrade-cro': ['upgrade', 'paywall', 'abo kauf', 'abo-kauf', 'freemium'],
  'churn-prevention': ['kuendig', 'churn', 'abwanderung', 'dunning'],
  'onboarding-cro': ['onboarding', 'aktivierung', 'erstnutzung', 'self service', 'self-service'],
  'signup-flow-cro': ['registrierung', 'anmeldeflow', 'signup'],
  'launch-strategy': ['go-live', 'golive', 'markteinfuehrung'],
  'programmatic-seo': ['stadtseiten', 'programmatic', 'cluster-seiten', 'seiten generieren'],
  'analytics-tracking': ['tracking', 'analytics', 'gtm', 'ga4', 'conversion tracking', 'attribution'],
  'ab-test-setup': ['a/b-test', 'ab-test', 'variante testen', 'experiment'],
  supabase: ['supabase', 'rls', 'migration', 'policy', 'postgres'],
  'owasp-security': ['sicherheitsluecke', 'schwachstelle', 'angreifer', 'security-review'],
  impeccable: ['design', 'oberflaeche', 'layout', 'aufdringlich'],
  'frontend-design': ['frontend', 'komponente', 'styling'],
  brainstorming: ['lass uns bauen', 'neues feature', 'konzept fuer'],
  'systematic-debugging': ['fehler suchen', 'warum geht', 'funktioniert nicht'],
  'webapp-testing': ['smoke', 'smokes', 'durchklick', 'browser-test'],
  'playwright-skill': ['playwright', 'selektor', 'spec schreiben'],
  'verification-before-completion': ['nachweis', 'beweis dass', 'wirklich gruen'],
  'code-review': ['code-review', 'drueberschauen'],
  'dsgvo-auth-and-logging': ['dsgvo', 'datenschutz', 'personenbezogen'],
  'regel4-smoke': ['regel 4', 'regel-4', 'prod-smoke'],
  'journey-verifikation': ['journey', 'ganzer lauf', 'regression'],
  'release-drain': ['drain', 'nach main', 'release'],
}

/**
 * Fachbegriffe DIESER Domaene, die in Marketing-Skills etwas anderes bedeuten.
 * `claim` = Schadenfall, `lead` = Interessent, `flow` = FlowLink.
 */
const DOMAENE_EIGEN = new Set(['claim', 'claims', 'lead', 'leads', 'flow', 'flowlink'])

/** Reine Fortsetzungen — hier schweigt das Radar. */
const STOPP = /^(weiter|ja|nein|ok|okay|danke|passt|go|mach das|dann weiter|next|stop)\b/i

function finde(prompt, skills, minScore = 2) {
  const kern = prompt.replace(/^(ultrathink|ultrtahink|ultratink)\s*/i, '').trim()
  if (kern.length < 15 || STOPP.test(kern)) return []

  const p = ' ' + prompt.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ') + ' '
  const treffer = []
  for (const s of skills) {
    let score = 0
    const belege = []
    for (const t of s.trigger) {
      if (t.length < 5 || DOMAENE_EIGEN.has(t)) continue
      if (p.includes(' ' + t)) {
        score += t.includes(' ') ? 3 : 1 // mehrwortige Phrasen wiegen schwerer
        belege.push(t)
      }
    }
    for (const d of DE[s.name] || []) {
      if (p.includes(' ' + d)) {
        score += d.includes(' ') ? 3 : 2
        belege.push(d)
      }
    }
    if (score >= minScore) treffer.push({ name: s.name, score, beleg: belege[0] })
  }
  return treffer.sort((a, b) => b.score - a.score).slice(0, 3)
}

async function main() {
  let eingabe = ''
  for await (const chunk of process.stdin) eingabe += chunk
  let prompt = ''
  try {
    prompt = JSON.parse(eingabe).prompt || ''
  } catch {
    return // kein verwertbares Payload -> still raus
  }
  if (!prompt) return

  const skills = ladeSkills()
  const treffer = finde(prompt, skills)
  if (!treffer.length) return

  const zeilen = treffer.map((t) => `  • ${t.name}  (erkannt: „${t.beleg}")`)
  process.stdout.write(
    `# 🧭 Skill-Radar\n\nZum Thema dieses Prompts gibt es passende Skills:\n\n${zeilen.join('\n')}\n\n` +
      `Prüfe kurz, ob einer davon zutrifft — wenn ja, per Skill-Tool laden, bevor du loslegst. ` +
      `Wenn keiner passt, ignoriere diesen Hinweis (er matcht auf Stichworte, nicht auf Absicht).\n`,
  )
}

main().catch(() => {}) // ein kaputtes Radar darf niemals einen Prompt kosten
