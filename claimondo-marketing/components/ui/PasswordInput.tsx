// AAR-349: Shared Passwort-Input mit Sichtbarkeits-Toggle (Auge-Icon).
//
// Drop-in-Ersatz für `<input type="password" ... />`. Alle nativen
// Input-Props werden durchgereicht (name, value, onChange, required,
// autoComplete, minLength, className, ...). tabIndex={-1} am Toggle
// damit die Tab-Reihenfolge beim Ausfüllen nicht gestört wird.
//
// Zusätzlich ein optionaler Wrapper-className (`wrapperClassName`), falls
// die umgebende Page das relative-Container-Div stylen will (z.B. mb-4).

'use client'

import { useState, forwardRef } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  wrapperClassName?: string
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, wrapperClassName, ...props }, ref) {
    const [visible, setVisible] = useState(false)
    return (
      <div className={`relative ${wrapperClassName ?? ''}`}>
        <input
          ref={ref}
          {...props}
          type={visible ? 'text' : 'password'}
          // Rechts-Padding damit Text nicht unter das Icon läuft
          className={`${className ?? ''} pr-9`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-claimondo-ondo/70 hover:text-claimondo-ondo focus:outline-none"
        >
          {visible ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
        </button>
      </div>
    )
  },
)
