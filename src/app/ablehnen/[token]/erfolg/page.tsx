// AAR-134 Phase 5: Success-Page nach erfolgreicher Token-Ablehnung.
export default function AblehnenErfolgPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">✓</span>
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-2">Vielen Dank für die Info</h1>
        <p className="text-sm text-gray-600">
          Wir haben den Termin abgelehnt und der Dispatcher wurde benachrichtigt.
          Er wird einen anderen Sachverständigen suchen.
        </p>
      </div>
    </div>
  )
}
