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
  {
    rules: {
      // Ein fuehrender Unterstrich heisst "absichtlich ungenutzt" — etwa bei
      // Signaturen, die einen Vertrag erfuellen muessen (siehe lib/places/neu.ts,
      // das Skelett der New-API). Ohne diese Regel erzeugt jede solche Stelle
      // eine Warnung, und Rauschen verdeckt die Warnungen, auf die es ankommt.
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
])
