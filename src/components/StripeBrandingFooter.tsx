'use client'

import { LockIcon } from 'lucide-react'

// KFZ-156: Trust-Footer der unter dem Embedded Stripe Checkout angezeigt wird.
// Zeigt das Stripe-Logo + die unterstuetzten Zahlungsanbieter (Visa, Mastercard,
// Amex, SEPA, Apple Pay, Google Pay) — laut den offiziellen Stripe Brand
// Assets sind die Logos als simple inline SVGs erlaubt solange sie in dieser
// "powered by Stripe" Trust-Form auftauchen.

export default function StripeBrandingFooter() {
  return (
    <div className="mt-4 px-4 py-3 bg-claimondo-bg border border-claimondo-border rounded-xl">
      <div className="flex items-center justify-center gap-2 text-[11px] text-claimondo-ondo mb-2">
        <LockIcon className="w-3 h-3" />
        <span>Sichere Zahlung abgewickelt durch</span>
        <StripeLogo className="h-4 w-auto" />
      </div>
      <div className="flex items-center justify-center gap-3 flex-wrap pt-2 border-t border-claimondo-border">
        <VisaLogo className="h-5 w-auto" />
        <MastercardLogo className="h-5 w-auto" />
        <AmexLogo className="h-5 w-auto" />
        <SepaLogo className="h-4 w-auto" />
        <ApplePayLogo className="h-5 w-auto" />
        <GooglePayLogo className="h-5 w-auto" />
      </div>
    </div>
  )
}

function StripeLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Stripe">
      <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.63l.21 1.03a4.7 4.7 0 0 1 3.23-1.2c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 7.5-5.65 7.5zM40 9.13c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.55-1.65 2.55-3.87 0-2.16-1.04-3.84-2.55-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.88zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.13 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 0 1-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.14v5.85zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 0 1-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.58-.24 1.58-1C6.31 13.4 0 14.59 0 9.92 0 7 2.16 5.27 5.5 5.27c1.31 0 2.62.2 3.93.72v3.88a8.85 8.85 0 0 0-3.93-1.04c-.86 0-1.4.25-1.4.97 0 1.74 6.36.9 6.36 5.84z" fill="#635bff"/>
    </svg>
  )
}

function VisaLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 16" xmlns="http://www.w3.org/2000/svg" aria-label="Visa">
      <rect width="48" height="16" rx="2" fill="#1a1f71"/>
      <text x="24" y="11" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="9" fill="#ffffff" textAnchor="middle" fontStyle="italic">VISA</text>
    </svg>
  )
}

function MastercardLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard">
      <rect width="48" height="32" rx="3" fill="#ffffff" stroke="#e5e7eb"/>
      <circle cx="20" cy="16" r="9" fill="#eb001b"/>
      <circle cx="28" cy="16" r="9" fill="#f79e1b" fillOpacity="0.9"/>
      <path d="M24 9.5a9 9 0 0 0 0 13 9 9 0 0 0 0-13z" fill="#ff5f00"/>
    </svg>
  )
}

function AmexLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 16" xmlns="http://www.w3.org/2000/svg" aria-label="American Express">
      <rect width="48" height="16" rx="2" fill="#2e77bb"/>
      <text x="24" y="11" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="6" fill="#ffffff" textAnchor="middle">AMEX</text>
    </svg>
  )
}

function SepaLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 16" xmlns="http://www.w3.org/2000/svg" aria-label="SEPA">
      <rect width="48" height="16" rx="2" fill="#10298e"/>
      <text x="24" y="11" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="7" fill="#ffcc00" textAnchor="middle">SEPA</text>
    </svg>
  )
}

function ApplePayLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 20" xmlns="http://www.w3.org/2000/svg" aria-label="Apple Pay">
      <rect width="48" height="20" rx="3" fill="#000000"/>
      <text x="24" y="13" fontFamily="-apple-system, sans-serif" fontWeight="600" fontSize="8" fill="#ffffff" textAnchor="middle">Pay</text>
      <text x="14" y="13" fontFamily="-apple-system, sans-serif" fontSize="9" fill="#ffffff" textAnchor="middle"></text>
    </svg>
  )
}

function GooglePayLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 20" xmlns="http://www.w3.org/2000/svg" aria-label="Google Pay">
      <rect width="48" height="20" rx="3" fill="#ffffff" stroke="#e5e7eb"/>
      <text x="14" y="14" fontFamily="Arial, sans-serif" fontWeight="500" fontSize="9" textAnchor="middle">
        <tspan fill="#4285F4">G</tspan>
        <tspan fill="#EA4335">o</tspan>
        <tspan fill="#FBBC04">o</tspan>
        <tspan fill="#4285F4">g</tspan>
        <tspan fill="#34A853">l</tspan>
        <tspan fill="#EA4335">e</tspan>
      </text>
      <text x="32" y="14" fontFamily="Arial, sans-serif" fontWeight="500" fontSize="8" fill="#5f6368" textAnchor="middle">Pay</text>
    </svg>
  )
}
