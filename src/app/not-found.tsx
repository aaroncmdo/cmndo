import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <div className="text-zinc-700 text-7xl font-bold mb-4">404</div>
        <h1 className="text-xl font-semibold text-white mb-2">
          Seite nicht gefunden
        </h1>
        <p className="text-zinc-400 text-sm mb-6">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-xl transition-colors"
        >
          Zur Startseite
        </Link>
      </div>
    </div>
  )
}
