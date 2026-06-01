const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

interface Props {
  rechtsform: string
  mutterkonzern: string
  hauptsitz: string
  gegruendet?: number
  vertraegeKfzHpMio?: number
  bruttopraemienKfzMrd?: number
  bruttopraemienStand?: string
  vertriebsweg: string[]
  tags: string[]
}

/**
 * Unternehmensprofil-Box einer Versicherer-Hub-Detailseite: Stammdaten-Tabelle
 * + Merkmals-Tags. (CONTRACT F-21)
 */
export function VersichererProfileCard({
  rechtsform,
  mutterkonzern,
  hauptsitz,
  gegruendet,
  vertraegeKfzHpMio,
  bruttopraemienKfzMrd,
  bruttopraemienStand,
  vertriebsweg,
  tags,
}: Props) {
  const rows: Array<[string, string]> = [
    ['Rechtsform', rechtsform],
    ['Mutterkonzern', mutterkonzern],
    ['Hauptsitz', hauptsitz],
  ]
  if (gegruendet) rows.push(['Gegründet', String(gegruendet)])
  if (vertraegeKfzHpMio) {
    rows.push(['Kfz-Haftpflicht-Verträge', `ca. ${vertraegeKfzHpMio.toLocaleString('de-DE')} Mio.`])
  }
  if (bruttopraemienKfzMrd) {
    rows.push([
      'Bruttoprämien Kfz',
      `ca. ${bruttopraemienKfzMrd.toLocaleString('de-DE')} Mrd. €${
        bruttopraemienStand ? ` (${bruttopraemienStand})` : ''
      }`,
    ])
  }
  if (vertriebsweg.length > 0) rows.push(['Vertriebsweg', vertriebsweg.join(', ')])

  return (
    <section className="rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm">
      <h2 style={HEAD_FONT} className="text-lg font-extrabold text-claimondo-navy">
        Unternehmensprofil
      </h2>
      <dl className="mt-4 divide-y divide-claimondo-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5 text-[0.9375rem]">
            <dt className="font-semibold text-claimondo-shield/70">{k}</dt>
            <dd className="text-right font-medium text-claimondo-navy">{v}</dd>
          </div>
        ))}
      </dl>
      {tags.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {tags.map((t) => (
            <li
              key={t}
              className="rounded-full border border-claimondo-ondo/25 bg-claimondo-bg px-3 py-1 text-[0.8125rem] font-semibold text-claimondo-shield"
            >
              {t}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
