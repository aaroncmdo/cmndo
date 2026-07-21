#!/usr/bin/env node
// Wegwerf-Account-Helper — session-isolierte Smoke-Accounts statt des geteilten test-*-Pools.
//
// WARUM: 15+ parallele Sessions resetten dieselben 5 test-*@claimondo.de-Accounts (PW/Faktoren)
// je fuer ihre eigenen Regel-4-Smokes -> wiederkehrende ~2-3-taegige Drift ("Invalid login
// credentials", ueberraschende 2FA-Gates). Jede Session, die stattdessen ihren EIGENEN
// eindeutigen Wegwerf-Account anlegt + am Ende loescht, hat null Contention mit anderen.
// Root-Cause + Aaron-Entscheid dokumentiert in memory/reference-internal-test-account-logins.md.
//
// SICHERHEIT (Regel 4): telefon bleibt IMMER NULL -> keine SMS/WhatsApp an reale Kunden.
// Email = throwaway-<rolle>-<ts>-<rand>@claimondo.test (istInterneEmail erkennt .test).
// email_confirm=true -> keine Bestaetigungs-Mail. Nur Test-Domain, nie echte Kundendaten.
//
// NUTZUNG:
//   node scripts/smoke/throwaway-account.mjs create <rolle> [--json]
//   node scripts/smoke/throwaway-account.mjs cleanup <uid|email>
//   node scripts/smoke/throwaway-account.mjs cleanup-all         # alle throwaway-*@claimondo.test
//
// ENV (Reihenfolge): process.env (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY),
//   sonst --env-file=<pfad> / $CLAIMONDO_ENV_FILE, sonst ./.env.local,
//   sonst /var/www/claimondo-v2/.env.local (prod-VPS). Der service_role-Key wird NUR gelesen,
//   NIE ausgegeben.
//
// Rollen mit vollem Portal-Satelliten: sachverstaendiger (sachverstaendige-Zeile).
// admin/dispatch/kundenbetreuer/kanzlei brauchen keinen Satelliten (Portal gatet nur profiles.rolle).
// kunde/makler/werkstatt/flottenmanager: v1 login-faehig (profiles), Portal-Daten leer
//   -> fuer Route-/Auth-Gate-Smokes ausreichend; Fixture-Satellit ist erweiterbar (siehe RECIPES).
import fs from 'node:fs'

const ROLE_PORTAL = {
  admin: '/admin',
  dispatch: '/dispatch/dashboard',
  kundenbetreuer: '/mitarbeiter',
  kanzlei: '/kanzlei/mandate',
  sachverstaendiger: '/gutachter/heute',
  kunde: '/kunde',
  makler: '/makler',
  werkstatt: '/werkstatt',
  flottenmanager: '/flotte',
}
const VALID_ROLES = Object.keys(ROLE_PORTAL)

// --- Env-Aufloesung -------------------------------------------------------
function loadEnv() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) return { url, key }
  const fileArg = process.argv.find((a) => a.startsWith('--env-file='))
  const candidates = [
    fileArg && fileArg.slice('--env-file='.length),
    process.env.CLAIMONDO_ENV_FILE,
    '.env.local',
    '/var/www/claimondo-v2/.env.local',
  ].filter(Boolean)
  for (const p of candidates) {
    try {
      const env = fs.readFileSync(p, 'utf8')
      const get = (k) => {
        const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'))
        return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
      }
      url = url || get('NEXT_PUBLIC_SUPABASE_URL')
      key = key || get('SUPABASE_SERVICE_ROLE_KEY')
      if (url && key) return { url, key }
    } catch {
      /* naechster Kandidat */
    }
  }
  return { url, key }
}

const { url, key } = loadEnv()
if (!url || !key) {
  console.error('FEHLER: SUPABASE_URL/SERVICE_ROLE_KEY nicht gefunden. --env-file=<pfad> setzen oder CLAIMONDO_ENV_FILE.')
  process.exit(1)
}
const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }

async function api(path, opts = {}) {
  const res = await fetch(url + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { ok: res.ok, status: res.status, body }
}

// --- Rollen-Satelliten (erweiterbar) --------------------------------------
// Jede Funktion legt die minimal noetige Portal-Zeile an bzw. raeumt sie weg.
const RECIPES = {
  sachverstaendiger: {
    async create(uid) {
      // Rezept aus memory/reference-internal-test-account-logins.md: Portal-Zugang + aktiv.
      const r = await api('/rest/v1/sachverstaendige', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ profile_id: uid, portal_zugang_freigeschaltet: true, ist_aktiv: true }),
      })
      if (!r.ok) throw new Error(`sachverstaendige-Insert fehlgeschlagen (${r.status}): ${JSON.stringify(r.body).slice(0, 200)}`)
    },
    async cleanup(uid) {
      await api(`/rest/v1/sachverstaendige?profile_id=eq.${uid}`, { method: 'DELETE' })
    },
  },
}

function randId() {
  // Kein Math.random-Verbot hier (normales Node, kein Workflow-Sandbox) — trotzdem ts-basiert eindeutig.
  return Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36)
}

// --- Kommandos ------------------------------------------------------------
async function create(rolle, asJson) {
  if (!VALID_ROLES.includes(rolle)) {
    console.error(`FEHLER: unbekannte Rolle '${rolle}'. Gueltig: ${VALID_ROLES.join(', ')}`)
    process.exit(1)
  }
  const stamp = randId()
  const email = `throwaway-${rolle}-${stamp}@claimondo.test`
  const password = `Thrw-${stamp}-Xy9!`

  // 1) auth.users (handle_new_user-Trigger legt profiles mit rolle='kunde' an)
  const c = await api('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (!c.ok) {
    console.error(`FEHLER createUser (${c.status}): ${JSON.stringify(c.body).slice(0, 220)}`)
    process.exit(1)
  }
  const uid = c.body.id

  // 2) profiles auf Zielrolle setzen (telefon bleibt NULL!). UPSERT statt PATCH: der
  // handle_new_user-Trigger legt profiles NICHT zuverlaessig an (die App macht das im
  // Signup-Code) -> ein PATCH auf eine fehlende Zeile traefe still 0 Rows und der
  // spaetere Satellit-FK-Insert (profile_id->profiles.id) schluege fehl. merge-duplicates
  // deckt beide Faelle ab.
  const p = await api('/rest/v1/profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: uid, email, rolle, force_password_change: false }),
  })
  if (!p.ok) {
    await cleanup(uid, true) // best effort rollback
    console.error(`FEHLER profiles-Upsert (${p.status}): ${JSON.stringify(p.body).slice(0, 220)}`)
    process.exit(1)
  }

  // 3) Rollen-Satellit (falls Rezept vorhanden)
  let portalReady = true
  if (RECIPES[rolle]) {
    try {
      await RECIPES[rolle].create(uid)
    } catch (err) {
      await cleanup(uid, true)
      console.error(`FEHLER Satellit: ${err.message}`)
      process.exit(1)
    }
  } else if (!['admin', 'dispatch', 'kundenbetreuer', 'kanzlei'].includes(rolle)) {
    portalReady = false // login-faehig, aber Portal-Daten leer
  }

  const out = { uid, email, password, rolle, portal: ROLE_PORTAL[rolle], portalReady }
  if (asJson) {
    console.log(JSON.stringify(out))
  } else {
    console.log(`OK ${rolle} angelegt:`)
    console.log(`  email:    ${email}`)
    console.log(`  password: ${password}`)
    console.log(`  uid:      ${uid}`)
    console.log(`  portal:   ${ROLE_PORTAL[rolle]}${portalReady ? '' : '  (login-faehig, Portal-Daten leer — v1)'}`)
    console.log(`  cleanup:  node scripts/smoke/throwaway-account.mjs cleanup ${uid}`)
  }
}

async function cleanup(idOrEmail, quiet) {
  // uid oder email aufloesen
  let uid = idOrEmail
  if (idOrEmail.includes('@')) {
    const r = await api(`/rest/v1/profiles?email=eq.${encodeURIComponent(idOrEmail)}&select=id`)
    uid = Array.isArray(r.body) && r.body[0] ? r.body[0].id : null
    if (!uid) {
      if (!quiet) console.log(`Kein Account fuer ${idOrEmail} gefunden (evtl. schon weg).`)
      return
    }
  }
  // Satelliten aller Rezepte best-effort raeumen
  for (const rec of Object.values(RECIPES)) {
    try {
      await rec.cleanup(uid)
    } catch {
      /* egal */
    }
  }
  await api(`/rest/v1/profiles?id=eq.${uid}`, { method: 'DELETE' }) // defensiv (falls kein CASCADE)
  const d = await api(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' })
  if (!quiet) console.log(`Cleanup ${uid}: auth=${d.status === 200 ? 'ok' : d.status}`)
}

async function cleanupAll() {
  const r = await api(`/rest/v1/profiles?email=like.throwaway-*@claimondo.test&select=id,email`)
  const rows = Array.isArray(r.body) ? r.body : []
  if (!rows.length) {
    console.log('Keine verwaisten throwaway-*@claimondo.test gefunden.')
    return
  }
  console.log(`Raeume ${rows.length} verwaiste Wegwerf-Accounts...`)
  for (const row of rows) {
    await cleanup(row.id, true)
    console.log(`  weg: ${row.email}`)
  }
}

// --- Dispatch -------------------------------------------------------------
const [cmd, arg] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const asJson = process.argv.includes('--json')
if (cmd === 'create') await create(arg, asJson)
else if (cmd === 'cleanup') await cleanup(arg)
else if (cmd === 'cleanup-all') await cleanupAll()
else {
  console.error('Nutzung: throwaway-account.mjs create <rolle> [--json] | cleanup <uid|email> | cleanup-all')
  console.error(`Rollen: ${VALID_ROLES.join(', ')}`)
  process.exit(1)
}
