import Link from 'next/link'

// 404-Seite (app/not-found.tsx). Greift fuer unbekannte Routen + notFound().
export default function NotFound() {
  return (
    <div className="container-prose px-4 py-24 text-center">
      <p className="font-mono text-sm font-medium text-au-amber">404</p>
      <h1 className="mt-3 font-display text-3xl font-bold text-au-ink">Seite nicht gefunden</h1>
      <p className="mt-4 text-au-ink-soft">Die angeforderte Seite existiert nicht (mehr).</p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-ios-md bg-au-ink px-5 py-2.5 text-sm font-medium text-au-surface transition-opacity hover:opacity-90"
      >
        Zur Startseite
      </Link>
    </div>
  )
}
