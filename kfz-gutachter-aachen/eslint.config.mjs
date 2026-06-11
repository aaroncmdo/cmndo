// ESLint 9 Flat-Config — native Exports aus eslint-config-next 16. Der frühere
// FlatCompat-Umweg crasht mit ESLint 9.39 ("Converting circular structure to JSON"
// im Legacy-Config-Validator); die nativen Arrays brauchen ihn nicht mehr.
import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    // no-img-element ist global off → Inline-Disables im Template wären "unused".
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    // Standalone-Marketing-LP: bewusst <img> statt next/image (Pattern wie
    // autounfall-io). Umlaute/Quotes in JSX sind gewollt.
    rules: {
      '@next/next/no-img-element': 'off',
      'react/no-unescaped-entities': 'off',
      // Neue Strict-Rule (react-hooks v6 via eslint-config-next 16) trifft
      // Bestands-Pattern (CasesCarousel reduced-motion, CookieConsent-Init) —
      // bewusst warn statt error, Refactor ggf. als eigener Brief.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'scripts/**'],
  },
]

export default eslintConfig
