// AAR-463 F5: Staging-/Proto-Banner. Sichtbar nur wenn
// NEXT_PUBLIC_IS_STAGING === '1'. In Prod wird nichts gerendert
// damit der Bundle-Footprint null ist.
export function ProtoBanner() {
  if (process.env.NEXT_PUBLIC_IS_STAGING !== '1') return null
  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900"
    >
      <span aria-hidden="true">⚠️ </span>
      Staging-Umgebung — keine echten Kunden-Daten
    </div>
  )
}
