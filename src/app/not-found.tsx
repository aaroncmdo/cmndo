import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <div className="text-gray-300 text-7xl font-bold mb-4">404</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Seite nicht gefunden
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium rounded-xl transition-colors"
        >
          Zur Startseite
        </Link>
      </div>
    </div>
  )
}
