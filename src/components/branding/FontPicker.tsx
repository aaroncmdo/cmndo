'use client'

import {
  FONT_PAIRS,
  FONT_CATEGORY_LABELS,
  DEFAULT_FONT_PER_CATEGORY,
  type FontCategory,
  type FontPair,
} from '@/lib/branding/fonts'
import { SparklesIcon } from 'lucide-react'

// AAR-422: Kategorie-basierter Font-Picker. 3 Tabs (Racing/Elegance/Kanoo) —
// der Default-Pair pro Kategorie wird als Auswahl genommen. Ein optionaler
// "Empfohlen"-Badge zeigt die von Claude-Vision vorgeschlagene Kategorie.

type Props = {
  selectedPairId: string
  recommendedCategory?: FontCategory | null
  onChange: (pair: FontPair) => void
}

const CATEGORIES: FontCategory[] = ['racing', 'elegance', 'kanoo']

export default function FontPicker({ selectedPairId, recommendedCategory, onChange }: Props) {
  const selectedPair = FONT_PAIRS[selectedPairId] ?? FONT_PAIRS.kanoo_1
  const selectedCategory = selectedPair.category

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {CATEGORIES.map(cat => {
          const isActive = cat === selectedCategory
          const isRecommended = recommendedCategory === cat
          const defaultPair = FONT_PAIRS[DEFAULT_FONT_PER_CATEGORY[cat]]
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onChange(defaultPair)}
              className={`text-left p-3 rounded-xl border transition-colors ${
                isActive
                  ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary)]/5'
                  : 'border-claimondo-border bg-white hover:border-claimondo-border'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-sm font-semibold"
                  style={{ color: isActive ? 'var(--brand-primary)' : 'var(--brand-primary)' }}
                >
                  {FONT_CATEGORY_LABELS[cat]}
                </span>
                {isRecommended && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--brand-secondary)]">
                    <SparklesIcon className="w-3 h-3" />
                    Empfohlen
                  </span>
                )}
              </div>
              <p
                className="text-xs"
                style={{
                  fontFamily: defaultPair.cssStack.heading,
                  fontWeight: 700,
                  color: 'var(--brand-primary)',
                }}
              >
                {defaultPair.label}
              </p>
              <p
                className="text-[11px] text-claimondo-ondo mt-0.5"
                style={{ fontFamily: defaultPair.cssStack.body }}
              >
                {defaultPair.preview}
              </p>
            </button>
          )
        })}
      </div>

      {/* Sub-Picker: konkretes Pair innerhalb der Kategorie */}
      <div className="flex flex-wrap gap-2">
        {Object.values(FONT_PAIRS)
          .filter(p => p.category === selectedCategory)
          .map(pair => {
            const isSelected = pair.id === selectedPair.id
            return (
              <button
                key={pair.id}
                type="button"
                onClick={() => onChange(pair)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  isSelected
                    ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary)] text-white'
                    : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-border'
                }`}
                style={{ fontFamily: pair.cssStack.heading, fontWeight: 600 }}
              >
                {pair.label}
              </button>
            )
          })}
      </div>
    </div>
  )
}
