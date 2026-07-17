'use client'
// B4 (CRM-Drawer-Programm, Aaron-Gate "b→Drawer"): Mail-Vorlagen als Cockpit-Drawer.
// Laedt die DB-Vorlagen client-seitig ueber die bestehende Server-Action und rendert
// den bestehenden MailVorlagenClient (kein Rewrite). Die Route /admin/vertrieb/vorlagen
// bleibt als Deep-Link-/Full-Page-Fallback bestehen.
import { useEffect, useState } from 'react'
import MailVorlagenClient from '../vorlagen/MailVorlagenClient'
import { getVertriebMailVorlagen } from '../_actions/mail-vorlagen'
import type { MailVorlage } from '../_lib/mail-vorlagen'

export default function VorlagenDrawerContent() {
  const [vorlagen, setVorlagen] = useState<MailVorlage[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    getVertriebMailVorlagen().then((res) => {
      if (!aktiv) return
      if (res.ok) setVorlagen(res.data)
      else setFehler(res.error)
    })
    return () => {
      aktiv = false
    }
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-heading-md text-claimondo-navy">Mail-Vorlagen</h2>
        <p className="text-caption text-claimondo-ondo/70">
          Vorstellungs-Mail &amp; Terminbestätigung — Betreff und Text hier editierbar, ohne Deploy.
          Platzhalter: <code>{'{{Ansprechpartner}}'}</code>, <code>{'{{Firma}}'}</code>,{' '}
          <code>{'{{Termin}}'}</code>.
        </p>
      </div>
      {fehler && <p className="text-sm text-danger">{fehler}</p>}
      {!fehler && vorlagen === null && (
        <p className="text-sm text-claimondo-ondo/70">Lade Vorlagen…</p>
      )}
      {vorlagen !== null && <MailVorlagenClient vorlagen={vorlagen} />}
    </div>
  )
}
