import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Regression-Guard fuer den Werkstatt-Updates-Bug:
// Die Updates-Bell (`<UpdatesNav>`) sitzt in einigen Shells im Sidebar-FUSS
// (unten-links). Dort MUSS placement="up-right" gesetzt sein — sonst oeffnet
// das Popover mit dem Default 'down-left' nach UNTEN und laeuft unter den
// unteren Viewport-Rand ("Updates geht nicht auf"). Genau diese Prop fehlte in
// WerkstattShell (Makler/Kunde hatten sie bereits).
//
// Repo hat kein jsdom (node-env vitest) -> Quell-Assertion statt DOM-Render,
// analog zur bewussten Extraktion von popover-placement.ts.

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '..', '..', '..') // -> src/

// Shells, deren Updates-Bell im Sidebar-Fuss (unten-links) montiert ist.
const SIDEBAR_FOOTER_SHELLS = [
  join(SRC, 'components', 'werkstatt', 'WerkstattShell.tsx'),
  join(SRC, 'components', 'makler', 'MaklerShell.tsx'),
  join(SRC, 'app', 'kunde', 'layout.tsx'),
]

// Matcht einen <UpdatesNav ... placement="up-right" .../>-Mount auf einer Zeile.
const UP_RIGHT_MOUNT = /<UpdatesNav[^>]*placement=["']up-right["']/

describe('UpdatesNav — Sidebar-Fuss-Mounts oeffnen nach oben-rechts', () => {
  for (const file of SIDEBAR_FOOTER_SHELLS) {
    const label = file.split(/[\\/]/).slice(-2).join('/')
    it(`${label} setzt placement="up-right" (Popover laeuft sonst unter den Viewport)`, () => {
      const src = readFileSync(file, 'utf8')
      expect(src, `${label}: Sidebar-Fuss-UpdatesNav braucht placement="up-right"`).toMatch(
        UP_RIGHT_MOUNT,
      )
    })
  }
})
