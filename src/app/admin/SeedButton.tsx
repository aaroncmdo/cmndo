'use client'

import { useState } from 'react'

export default function SeedButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; error?: string; summary?: string[] } | null>(null)

  async function handleSeed() {
    if (!confirm('Testdaten einfuegen? Dies erstellt Benutzer, Leads, Faelle und mehr.')) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/seed-testdata', { method: 'POST' })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ error: 'Netzwerkfehler' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-5">
      <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">
        Testdaten
      </h3>
      <p className="text-gray-500 text-sm mb-3">
        Keine Faelle vorhanden. Testdaten fuer einen kompletten Durchlauf einfuegen?
      </p>
      <button
        onClick={handleSeed}
        disabled={loading}
        className="px-4 py-2 bg-[#4573A2] hover:bg-[#4573A2] disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {loading ? 'Erstelle Testdaten...' : 'Testdaten einfuegen'}
      </button>
      {result && (
        <div className={`mt-3 p-3 rounded-lg text-sm ${result.success ? 'bg-green-50 text-green-300' : 'bg-red-50 text-red-300'}`}>
          {result.success && result.summary?.map((s, i) => <div key={i}>{s}</div>)}
          {result.error && <div>Fehler: {result.error}</div>}
        </div>
      )}
    </div>
  )
}
