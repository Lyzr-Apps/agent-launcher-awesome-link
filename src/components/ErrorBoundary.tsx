import React, { Component, ErrorInfo, ReactNode, useState, useEffect } from 'react'

// =============================================================================
// Types
// =============================================================================

interface ErrorDetails {
  type: 'react_error' | 'api_error' | 'parse_error' | 'network_error' | 'unknown'
  message: string
  stack?: string
  componentStack?: string
  raw_response?: string
  endpoint?: string
  timestamp: string
  userAgent: string
  url: string
}

interface ErrorModalProps {
  error: ErrorDetails
  onClose: () => void
  onFix: () => void
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: ErrorDetails | null
}

// =============================================================================
// Utility: Check if running in iframe
// =============================================================================

export const isInIframe = (): boolean => {
  try {
    return window.self !== window.top
  } catch (e) {
    // If we can't access window.top due to cross-origin, we're in an iframe
    return true
  }
}

// =============================================================================
// Utility: Send error to parent iframe
// =============================================================================

export const sendErrorToParent = (error: ErrorDetails): void => {
  if (!isInIframe()) {
    console.log('[ErrorBoundary] Not in iframe, skipping parent notification')
    return
  }

  try {
    window.parent.postMessage(
      {
        type: 'CHILD_APP_ERROR',
        source: 'architect-child-app',
        payload: error,
      },
      '*' // In production, use specific origin
    )
    console.log('[ErrorBoundary] Error sent to parent:', error.type)
  } catch (e) {
    console.error('[ErrorBoundary] Failed to send error to parent:', e)
  }
}

// =============================================================================
// Utility: Request fix from parent
// =============================================================================

export const requestFixFromParent = (error: ErrorDetails): void => {
  if (!isInIframe()) {
    console.log('[ErrorBoundary] Not in iframe, cannot request fix')
    return
  }

  try {
    window.parent.postMessage(
      {
        type: 'FIX_ERROR_REQUEST',
        source: 'architect-child-app',
        payload: {
          ...error,
          action: 'fix',
          fixPrompt: generateFixPrompt(error),
        },
      },
      '*'
    )
    console.log('[ErrorBoundary] Fix request sent to parent')
  } catch (e) {
    console.error('[ErrorBoundary] Failed to send fix request:', e)
  }
}

// =============================================================================
// Utility: Generate fix prompt for AI
// =============================================================================

const generateFixPrompt = (error: ErrorDetails): string => {
  let prompt = `Fix the following error in the child application:\n\n`
  prompt += `**Error Type:** ${error.type}\n`
  prompt += `**Error Message:** ${error.message}\n`

  if (error.endpoint) {
    prompt += `**API Endpoint:** ${error.endpoint}\n`
  }

  if (error.raw_response) {
    prompt += `**Raw Response:** \`\`\`\n${error.raw_response.substring(0, 1000)}\n\`\`\`\n`
  }

  if (error.stack) {
    prompt += `**Stack Trace:** \`\`\`\n${error.stack.substring(0, 500)}\n\`\`\`\n`
  }

  if (error.componentStack) {
    prompt += `**Component Stack:** \`\`\`\n${error.componentStack.substring(0, 500)}\n\`\`\`\n`
  }

  prompt += `\n**Instructions:** Analyze this error and fix the code. The error occurred at ${error.url} on ${error.timestamp}.`

  return prompt
}

// =============================================================================
// Error Modal Component
// =============================================================================

const ErrorModal: React.FC<ErrorModalProps> = ({ error, onClose, onFix }) => {
  const inIframe = isInIframe()

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-red-500 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-lg font-semibold">Application Error</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            {/* Error Type Badge */}
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded">
                {error.type.replace('_', ' ').toUpperCase()}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {error.timestamp}
              </span>
            </div>

            {/* Error Message */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Error Message</h3>
              <p className="text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 p-3 rounded font-mono">
                {error.message}
              </p>
            </div>

            {/* Raw Response (if available) */}
            {error.raw_response && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Raw Response</h3>
                <pre className="text-xs text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto max-h-40">
                  {error.raw_response.substring(0, 1000)}
                  {error.raw_response.length > 1000 && '...'}
                </pre>
              </div>
            )}

            {/* Stack Trace (if available) */}
            {error.stack && (
              <details className="group">
                <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100">
                  Stack Trace
                </summary>
                <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto max-h-40">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {inIframe ? 'Running in iframe - can request fix from parent' : 'Not in iframe'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Dismiss
            </button>
            {inIframe && (
              <button
                onClick={onFix}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Fix with AI
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Error Boundary Class Component
// =============================================================================

class ErrorBoundaryClass extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const errorDetails: ErrorDetails = {
      type: 'react_error',
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    }
    return { hasError: true, error: errorDetails }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorDetails: ErrorDetails = {
      type: 'react_error',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack || undefined,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    }

    this.setState({ error: errorDetails })

    // Auto-send error to parent if in iframe
    if (isInIframe()) {
      sendErrorToParent(errorDetails)
    }

    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  handleClose = () => {
    this.setState({ hasError: false, error: null })
  }

  handleFix = () => {
    if (this.state.error) {
      requestFixFromParent(this.state.error)
    }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <>
          {this.props.children}
          <ErrorModal
            error={this.state.error}
            onClose={this.handleClose}
            onFix={this.handleFix}
          />
        </>
      )
    }

    return this.props.children
  }
}

// =============================================================================
// Global Error Handler Hook
// =============================================================================

export const useGlobalErrorHandler = () => {
  const [error, setError] = useState<ErrorDetails | null>(null)

  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorDetails: ErrorDetails = {
        type: 'unknown',
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      }
      setError(errorDetails)
      if (isInIframe()) {
        sendErrorToParent(errorDetails)
      }
    }

    // Handle global errors (including TypeErrors, ReferenceErrors, etc.)
    const handleError = (event: ErrorEvent) => {
      // Determine error type from the error - detect common React/JS errors
      let errorType: ErrorDetails['type'] = 'unknown'
      const msg = event.message || ''
      if (
        msg.includes('TypeError') ||
        msg.includes('ReferenceError') ||
        msg.includes('Cannot read properties') ||
        msg.includes('is not defined') ||
        msg.includes('is not a function') ||
        msg.includes('Cannot access') ||
        msg.includes('Uncaught')
      ) {
        errorType = 'react_error' // Code errors in render are typically React issues
      }

      const errorDetails: ErrorDetails = {
        type: errorType,
        message: event.message,
        stack: event.error?.stack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      }
      setError(errorDetails)

      // Auto-send error and request fix if in iframe
      if (isInIframe()) {
        sendErrorToParent(errorDetails)
        // Auto-request fix for code errors
        if (errorType === 'react_error') {
          console.log('[ErrorBoundary] Code error detected, auto-requesting fix...')
          requestFixFromParent(errorDetails)
        }
      }
    }

    // Intercept console.error to catch React's error logging
    const originalConsoleError = console.error
    const handleConsoleError = (...args: any[]) => {
      // Call original first
      originalConsoleError.apply(console, args)

      // Check if this is a React error or code error
      const errorString = args.map(arg =>
        typeof arg === 'string' ? arg :
        arg instanceof Error ? `${arg.name}: ${arg.message}` :
        typeof arg === 'object' ? JSON.stringify(arg).substring(0, 500) :
        String(arg)
      ).join(' ')

      // Detect common error patterns in console.error
      const isCodeError =
        errorString.includes('ReferenceError') ||
        errorString.includes('TypeError') ||
        errorString.includes('is not defined') ||
        errorString.includes('Cannot read properties') ||
        errorString.includes('is not a function') ||
        errorString.includes('Uncaught') ||
        errorString.includes('The above error occurred')

      if (isCodeError && isInIframe()) {
        // Extract error details
        const errorObj = args.find(arg => arg instanceof Error)
        const errorDetails: ErrorDetails = {
          type: 'react_error',
          message: errorObj?.message || errorString.substring(0, 500),
          stack: errorObj?.stack || (args.find(arg => typeof arg === 'string' && arg.includes('at ')) as string),
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }

        // Avoid duplicate sends (check if we already sent this error)
        const errorKey = `${errorDetails.message}-${errorDetails.stack?.substring(0, 100)}`
        const lastErrorKey = (window as any).__lastErrorKey
        if (lastErrorKey !== errorKey) {
          (window as any).__lastErrorKey = errorKey
          console.log('[ErrorBoundary] Console error detected, sending to parent...')
          sendErrorToParent(errorDetails)
          requestFixFromParent(errorDetails)
          setError(errorDetails)
        }
      }
    }
    console.error = handleConsoleError

    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
      console.error = originalConsoleError
    }
  }, [])

  const clearError = () => setError(null)

  const handleFix = () => {
    if (error) {
      requestFixFromParent(error)
    }
  }

  return { error, clearError, handleFix }
}

// =============================================================================
// API Error Handler Utility
// =============================================================================

export const handleApiError = (
  response: any,
  endpoint?: string
): ErrorDetails | null => {
  // Check if response indicates a parsing failure
  if (response?.response?.success === false && response?.response?.error) {
    const errorDetails: ErrorDetails = {
      type: 'parse_error',
      message: response.response.error,
      raw_response: response.raw_response || response.response.raw_response,
      endpoint,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    }

    // Only show modal if in iframe
    if (isInIframe()) {
      sendErrorToParent(errorDetails)
    }

    return errorDetails
  }

  // Check for API error
  if (response?.success === false && response?.error) {
    const errorDetails: ErrorDetails = {
      type: 'api_error',
      message: response.error,
      raw_response: response.details,
      endpoint,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    }

    if (isInIframe()) {
      sendErrorToParent(errorDetails)
    }

    return errorDetails
  }

  return null
}

// =============================================================================
// Global Error Modal Provider (integrates with useAgent hook)
// =============================================================================

export const GlobalErrorModal: React.FC = () => {
  const { error: globalError, clearError: clearGlobalError, handleFix: handleGlobalFix } = useGlobalErrorHandler()
  const [agentError, setAgentError] = useState<ErrorDetails | null>(null)

  // Register callback for useAgent hook errors
  useEffect(() => {
    // Dynamic import to avoid circular dependency
    import('@/hooks/useAgent').then(({ setGlobalErrorCallback }) => {
      setGlobalErrorCallback((err) => {
        setAgentError(err)
      })
    }).catch(() => {
      // Hook not available, that's ok
    })
  }, [])

  const error = agentError || globalError
  const clearError = () => {
    setAgentError(null)
    clearGlobalError()
  }
  const handleFix = () => {
    if (agentError) {
      requestFixFromParent(agentError)
    } else {
      handleGlobalFix()
    }
  }

  if (!error || !isInIframe()) return null

  return (
    <ErrorModal
      error={error}
      onClose={clearError}
      onFix={handleFix}
    />
  )
}

// =============================================================================
// Export
// =============================================================================

export default ErrorBoundaryClass
