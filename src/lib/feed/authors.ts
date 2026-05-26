import { SITE_URL } from '@/lib/seo/jsonld'

/**
 * Author-Konfiguration für die Feeds (Pfad 1: Aaron als Default-Author über alle
 * Items — Personal-Authority-Aufbau, siehe geo-feeds-spec §5).
 *
 * Bewusst KEIN E-Mail-Feld in der RSS-Ausgabe (Spam-Harvesting-Schutz) — RSS nutzt
 * nur <dc:creator> mit dem Namen. `url` zeigt vorerst auf die Hauptseite; eine
 * dedizierte Author-Hub-Page /autor/aaron-sprafke ist Folge-Backlog.
 */
export const AUTHORS = {
  'aaron-sprafke': {
    name: 'Aaron Sprafke',
    url: SITE_URL,
    sameAs: 'https://www.linkedin.com/in/aaron-sprafke-355085237/',
  },
} as const

export type AuthorKey = keyof typeof AUTHORS

export const DEFAULT_AUTHOR: AuthorKey = 'aaron-sprafke'
