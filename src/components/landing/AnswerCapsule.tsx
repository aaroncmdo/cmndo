// Answer-Capsule: 40–75 Wörter direkt-deklarative Antwort unter H2/H3.
// Princeton-GEO-Best-Practice: Antwort-zuerst-Format wird von ChatGPT,
// Perplexity und Google AI Overview deutlich häufiger zitiert als Fließtext.

type Props = {
  /** Die direkte Antwort — 40–75 Wörter, mit Statistik/§/Urteil wenn möglich */
  children: React.ReactNode
  /** Optional: kurzes Source-Tag rechts oben (z.B. "§249 BGB") */
  quelle?: string
}

export function AnswerCapsule({ children, quelle }: Props) {
  return (
    <div className="my-6 rounded-ios-md border-l-4 border-claimondo-ondo bg-claimondo-bg p-5 shadow-sm">
      {quelle && (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-claimondo-ondo">
          Direkt-Antwort · {quelle}
        </p>
      )}
      <div className="text-[15px] leading-relaxed text-claimondo-shield [&_strong]:text-claimondo-navy">
        {children}
      </div>
    </div>
  )
}
