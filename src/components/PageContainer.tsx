// BUG-98: Shared responsive content wrapper.
//
// Aaron-Anforderung: Desktop 15-20 % Marge / Tablet quer großflächig /
// Mobile hochkant untereinander. SVs nutzen oft Tablet.
//
// Tailwind-Breakpoints + horizontale Padding-Skala:
//   default (<640): px-4    → Mobile hochkant, fast volle Breite
//   sm  (>=640):    px-6
//   md  (>=768):    px-8
//   lg  (>=1024):   px-16   → Tablet quer / kleines Laptop, ~10 % pro Seite
//   xl  (>=1280):   px-24   → Desktop, ~10 % pro Seite (auf 1920px ≈ 80 % Content)
//
// max-w-[1600px] verhindert dass auf 4K-Screens alles ueberproportional
// gestreckt wird.
//
// `h-full` als Default damit Pages, die innen ein `h-full flex flex-col`
// Pattern nutzen (Sticky-Header von BUG-91 etc.), weiterhin die volle
// vertikale Höhe des Eltern-`<main>` bekommen. Kein `py-*`, weil das die
// Sticky-Header-Logik der Pages stören würde.
//
// Wenn eine Page in der Folge-Welle den Wrapper umgehen muss (z.B. eine
// Vollbild-Karte), kann sie das via `<div className="-mx-... w-screen">`
// machen — solche Edge-Cases werden in einer separaten Welle adressiert.

import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className = '' }: Props) {
  return (
    <div
      className={`mx-auto w-full max-w-[1600px] px-4 sm:px-6 md:px-8 lg:px-16 xl:px-24 ${className}`}
    >
      {children}
    </div>
  )
}
