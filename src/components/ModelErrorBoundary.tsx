import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Rendered instead of the children once they throw. */
  fallback: ReactNode
  /** Identifies the model in the console warning. */
  label: string
  children: ReactNode
}

interface State {
  failed: boolean
}

/** Swaps a model that fails to load (missing file, bad glTF) for a fallback. */
export class ModelErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`Model "${this.props.label}" failed to load; using the fallback.`, error, info)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
