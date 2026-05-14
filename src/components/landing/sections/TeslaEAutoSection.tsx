// Tesla / E-Auto-Spezialfall-Callout aus prototype.html §9b.
// 1/3-2/3 Grid auf claimondo-shield (etwas heller als navy), Wissensdatenbank §16.

export function TeslaEAutoSection() {
  return (
    <section className="bg-claimondo-shield py-14 text-white" aria-labelledby="tesla-heading">
      <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 md:grid-cols-[1fr_2fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
            Spezialfall E-Auto
          </p>
          <h2 id="tesla-heading" className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
            Tesla, Polestar, Lucid?<br />
            Wir kennen die Fallstricke.
          </h2>
        </div>
        <div className="space-y-3 text-sm leading-relaxed text-white/85">
          <p>
            DAT und Audatex haben für US-Fahrzeuge oft{' '}
            <strong>keine korrekten Verbundzeiten</strong> hinterlegt. Reales Beispiel:
            Standard-Gutachten 22.000 € → mit Tesla-Originaldaten <strong>48.000 €</strong>.
          </p>
          <p>
            Schwellerblenden-Reparaturen können bei E-Autos die <em>Steuergeräte
            darunter</em> erst Monate später zerstören. Bei einem Schaden im
            Batterie-Bereich ist Spezialgutachter-Pflicht — sonst droht ein versteckter
            Totalschaden.
          </p>
          <p className="text-xs text-claimondo-light-blue">
            Quelle: Bernd Hertfelder (öffentlich bestellter Kfz-Sachverständiger, HWK Stuttgart)
          </p>
        </div>
      </div>
    </section>
  )
}
