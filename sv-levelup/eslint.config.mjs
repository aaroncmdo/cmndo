import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/**
 * Eigene Config, weil sv-levelup ein STANDALONE-Build ist (eigener
 * Release-Zyklus, eigene Marke, eigenes Deployment auf sv-levelup.claimondo.de).
 *
 * Ohne diese Datei greift ESLint auf die Config des uebergeordneten
 * claimondo-v2-Projekts durch — mit dessen Regeln, Token-Ratchets und
 * Plugin-Aufloesung. Umgekehrt ignoriert die Root-Config `sv-levelup/**`,
 * analog zu `autounfall-io/**`.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])
