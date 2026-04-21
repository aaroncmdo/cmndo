'use client'

// AAR-691: Drawer-Wrapper für Intercepting-Routes unter
// /admin/sachverstaendige. Rendert ein Fixed-Positioned Overlay-Drawer
// rechts, schließt via ESC / Backdrop / Close-Button über router.back().

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { XIcon } from 'lucide-react'

type Props = {
  children: ReactNode
  title?: string
  /** px or tailwind class default is w-[720px]; Anlegen-Wizard nutzt breiter */
  widthClass?: string
}

export default function DrawerShell({ children, title, widthClass = 'sm:w-[720px]' }: Props) {
  const router = useRouter()

  const close = () => router.back()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler)
    // Scroll-Lock auf Body während Drawer offen
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[1px]"
        onClick={close}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Details'}
        className={`fixed right-0 top-0 h-screen w-full ${widthClass} bg-white shadow-2xl z-50 flex flex-col overflow-hidden`}
        style={{ animation: 'drawerSlideIn 200ms ease-out' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            {title ?? 'Details'}
          </h2>
          <button
            type="button"
            onClick={close}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="Schließen"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </aside>

      <style jsx global>{`
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
