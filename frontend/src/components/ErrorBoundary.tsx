import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface State {
  error: Error | null
}

/** Evita la pantalla en blanco si una vista falla: muestra el error y permite recargar. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
          <AlertTriangle className="size-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-fg">Algo salió mal</h1>
        <p className="mt-1 max-w-md text-sm text-fg-muted">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        >
          <RotateCcw className="size-4" />
          Recargar
        </button>
      </div>
    )
  }
}
