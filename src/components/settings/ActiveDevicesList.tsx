'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SmartphoneIcon, MonitorIcon, TrashIcon, LogOutIcon } from 'lucide-react'
import { revokeRememberToken, revokeAllTokens } from '@/lib/auth/twofa/remember-me'

// KFZ-184: Liste der aktiven Geräte (Remember-Me Tokens).

type Device = {
  id: string
  device_name: string | null
  ip_address: string | null
  last_used_at: string
  created_at: string
}

export default function ActiveDevicesList({ devices, userId }: { devices: Device[]; userId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleRevoke(id: string) {
    startTransition(async () => {
      await revokeRememberToken(id)
      router.refresh()
    })
  }

  function handleRevokeAll() {
    startTransition(async () => {
      await revokeAllTokens(userId)
      router.refresh()
    })
  }

  if (devices.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Angemeldete Geräte</h3>
        <p className="text-xs text-gray-400">Keine aktiven Geräte mit "Angemeldet bleiben".</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-500">Angemeldete Geräte ({devices.length})</h3>
        <button onClick={handleRevokeAll} disabled={pending}
          className="text-[10px] text-red-500 hover:text-red-700 flex items-center gap-1 font-medium disabled:opacity-50">
          <LogOutIcon className="w-3 h-3" /> Alle abmelden
        </button>
      </div>
      <div className="space-y-2">
        {devices.map(d => (
          <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
            {d.device_name === 'Mobil' ? (
              <SmartphoneIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            ) : (
              <MonitorIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-800 font-medium">{d.device_name ?? 'Unbekannt'}</p>
              <p className="text-[10px] text-gray-400">
                {d.ip_address ?? '—'} · Zuletzt {new Date(d.last_used_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <button onClick={() => handleRevoke(d.id)} disabled={pending}
              className="text-gray-300 hover:text-red-500 transition-colors p-1 disabled:opacity-50">
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
