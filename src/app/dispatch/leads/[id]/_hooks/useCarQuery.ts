// AAR-194: CarQuery-Hook für dynamische Marke/Modell-Dropdowns in Phase 4.
// Nutzt die lokalen Proxy-Routes /api/carquery/makes + /models
// (CarQuery hat kein CORS-Whitelisting für direkte Browser-Calls).

'use client'

import { useEffect, useState, useCallback } from 'react'

export function useCarQuery(baujahr: number | null) {
  const [marken, setMarken] = useState<string[]>([])
  const [modelle, setModelle] = useState<string[]>([])
  const [loadingMarken, setLoadingMarken] = useState(false)
  const [loadingModelle, setLoadingModelle] = useState(false)

  // Marken-Liste laden — re-fetch wenn Baujahr sich ändert
  useEffect(() => {
    let cancelled = false
    setLoadingMarken(true)
    const url = baujahr ? `/api/carquery/makes?year=${baujahr}` : '/api/carquery/makes'
    fetch(url)
      .then((r) => r.json())
      .then((data: { makes?: string[] }) => {
        if (!cancelled) setMarken(data.makes ?? [])
      })
      .catch(() => {
        if (!cancelled) setMarken([])
      })
      .finally(() => {
        if (!cancelled) setLoadingMarken(false)
      })
    return () => { cancelled = true }
  }, [baujahr])

  // Modelle nachladen wenn Marke ausgewählt
  const ladeModelle = useCallback((marke: string) => {
    if (!marke) {
      setModelle([])
      return
    }
    setLoadingModelle(true)
    const qs = new URLSearchParams({ make: marke })
    if (baujahr) qs.set('year', String(baujahr))
    fetch(`/api/carquery/models?${qs.toString()}`)
      .then((r) => r.json())
      .then((data: { models?: string[] }) => setModelle(data.models ?? []))
      .catch(() => setModelle([]))
      .finally(() => setLoadingModelle(false))
  }, [baujahr])

  return { marken, modelle, ladeModelle, loadingMarken, loadingModelle }
}
