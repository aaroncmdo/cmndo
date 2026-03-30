'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangleIcon, RefreshCwIcon } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <AlertTriangleIcon className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-gray-900 font-semibold text-lg mb-2">Etwas ist schiefgelaufen</h2>
            <p className="text-gray-500 text-sm mb-4">
              {this.state.error?.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-900 transition-colors"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
            >
              <RefreshCwIcon className="w-4 h-4" />
              Seite neu laden
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
