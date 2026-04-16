'use client'

// AAR-271: window.location.reload() statt reset()
export default function FallakteError({ error: _error }: { error: Error }) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">!</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Fehler beim Laden des Falls</h1>
        <p className="text-sm text-gray-500 mb-6">
          Bitte versuchen Sie es erneut. Falls das Problem bestehen bleibt, kontaktieren Sie den Support.
        </p>
        <button onClick={() => window.location.reload()}
          className="px-6 py-3 bg-[#4573A2] text-white font-medium text-sm rounded-xl hover:bg-[#1E3A5F] transition-colors">
          Seite neu laden
        </button>
      </div>
    </div>
  )
}
