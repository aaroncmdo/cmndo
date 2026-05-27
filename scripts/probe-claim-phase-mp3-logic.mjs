// CMM-44 MP-3 Logik-Probe (read-only, kein DB-Zugriff): runtime-verifiziert die
// NEUEN getClaimLifecycle-Branches (Kanzlei-Uebergabe-Interim / lexdrive-regulierung
// / claims.status-terminal-abschluss) auf synthetischen Inputs — also genau die
// Pfade, die die Live-Parity-Probe NICHT abdeckt (0 lexdrive / 0 terminal in Prod).
//
// Warum nicht vitest? Im symlink-node_modules-Worktree ist vitest/config nicht
// aufloesbar (devDeps liegen nur im npx-Cache). Wie die parity-probe importieren
// wir die ECHTE getClaimLifecycle via node-24 type-strip (lifecycle.ts hat nur
// import-type-Deps). Die kanonischen Unit-Tests (lifecycle.test.ts) bleiben fuer CI.
//
// Usage: node scripts/probe-claim-phase-mp3-logic.mjs   (Exit 0 = ok)

import { getClaimLifecycle } from '../src/lib/claims/lifecycle.ts'

let fails = 0
function check(name, got, want) {
  if (got !== want) {
    fails++
    console.log(`FAIL ${name}: got=${got} want=${want}`)
  } else {
    console.log(`ok   ${name} = ${got}`)
  }
}

const auftrag = (o = {}) => ({ typ: 'erstgutachten', status: 'abgeschlossen', ...o })
const kf = (o = {}) => ({ status: 'versicherungskontakt', ausgezahlt_am: null, lexdrive_case_id: null, ...o })
const leadDone = { sa_unterschrieben: true, vollmacht_signiert_am: 't', onboarding_complete: true }

// Interim: Kanzleifall da, lexdrive null -> begutachtung/kanzlei_uebergabe (B-10)
let r = getClaimLifecycle({ lead: null, auftraege: [auftrag()], kanzleiFall: kf() })
check('interim.main', r.mainPhase, 'begutachtung')
check('interim.sub', r.subPhase, 'kanzlei_uebergabe')

// Regulierung: lexdrive gesetzt
r = getClaimLifecycle({ lead: null, auftraege: [auftrag()], kanzleiFall: kf({ lexdrive_case_id: 'LX-1' }) })
check('reg.main', r.mainPhase, 'regulierung')
check('reg.sub', r.subPhase, 'versicherungskontakt')

// Regulierung/auszahlung + lexdrive
r = getClaimLifecycle({ lead: null, auftraege: [], kanzleiFall: kf({ status: 'auszahlung', lexdrive_case_id: 'LX-1' }) })
check('reg.auszahlung', r.subPhase, 'auszahlung')

// B-12: Auszahlung (ausgezahlt_am) kippt NICHT in abschluss
r = getClaimLifecycle({ lead: null, auftraege: [auftrag()], kanzleiFall: kf({ status: 'auszahlung', ausgezahlt_am: 't', lexdrive_case_id: 'LX-1' }) })
check('B12.main', r.mainPhase, 'regulierung')
check('B12.sub', r.subPhase, 'auszahlung')

// Abschluss terminal (B-11), ueberschreibt Auszahlung
r = getClaimLifecycle({ lead: null, auftraege: [], kanzleiFall: kf({ status: 'auszahlung', ausgezahlt_am: 't', lexdrive_case_id: 'LX-1' }), claimStatus: 'reguliert_vollstaendig' })
check('abschluss.main', r.mainPhase, 'abschluss')
check('abschluss.sub', r.subPhase, 'erfolgreich_reguliert')

// Storno terminal ueberschreibt alles (B-7)
r = getClaimLifecycle({ lead: { sa_unterschrieben: false, vollmacht_signiert_am: null, onboarding_complete: null }, auftraege: [auftrag({ status: 'termin' })], kanzleiFall: null, claimStatus: 'storniert' })
check('storno.sub', r.subPhase, 'storniert')

// klage + verjaehrt
check('klage', getClaimLifecycle({ lead: null, auftraege: [], kanzleiFall: null, claimStatus: 'klage_rechtsstreit' }).subPhase, 'klage_rechtsstreit')
check('verjaehrt', getClaimLifecycle({ lead: null, auftraege: [], kanzleiFall: null, claimStatus: 'verjaehrt' }).subPhase, 'verjaehrt')

// Nicht-terminaler claimStatus (dispatch_done) loest KEIN abschluss aus
r = getClaimLifecycle({ lead: leadDone, auftraege: [auftrag({ status: 'termin' })], kanzleiFall: null, claimStatus: 'dispatch_done' })
check('nonterm.main', r.mainPhase, 'begutachtung')
check('nonterm.sub', r.subPhase, 'termin')

// Regress: erfassung/begutachtung unveraendert
check('erfassung', getClaimLifecycle({ lead: { sa_unterschrieben: false, vollmacht_signiert_am: null, onboarding_complete: null }, auftraege: [], kanzleiFall: null }).subPhase, 'sa_offen')
check('begutachtung', getClaimLifecycle({ lead: leadDone, auftraege: [auftrag({ status: 'besichtigung' })], kanzleiFall: null }).subPhase, 'besichtigung')

console.log(fails ? `\nMP-3 LOGIK FAIL (${fails})` : '\nMP-3 LOGIK OK — alle Branches gruen')
process.exit(fails ? 1 : 0)
