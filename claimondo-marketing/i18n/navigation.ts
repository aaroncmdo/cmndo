import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

// Locale-aware Navigation-APIs: haengen automatisch den korrekten Locale-Prefix
// an (bzw. lassen ihn fuer 'de' weg) und lesen die aktive Locale aus der URL.
// Vom LanguageSwitcher (router.replace) + locale-internen Links genutzt.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
