'use client'

// AAR-271: window.location.reload() statt reset()
export default function FlowError({ error: _error }: { error: Error }) {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl shadow-black/10">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">!</span>
        </div>
        <h1 className="text-lg font-semibold text-[#0D1B3E] mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          Etwas ist schiefgelaufen
        </h1>
        <p className="text-sm text-claimondo-ondo mb-6">
          Bitte versuchen Sie es erneut. Falls das Problem weiterhin besteht, kontaktieren Sie uns.
        </p>
        <button onClick={() => window.location.reload()}
          className="px-6 py-3 bg-[#4573A2] text-white font-medium text-sm rounded-2xl hover:bg-[#1E3A5F] transition-colors">
          Seite neu laden
        </button>
      </div>
    </div>
  )
}
