import { useEffect, useState } from 'react'
import {
  installAgentInterceptor,
  onInterceptorError,
  clearPendingError,
  sendFixRequestToParent,
} from '@/lib/agent-fetch-interceptor'
import { isInIframe } from '@/components/ErrorBoundary'

interface PendingError {
  error: {
    type: string
    message: string
    raw_response?: string
  }
  fullResponse: any
}

interface GlobalError {
  type: string
  message: string
  stack?: string
  timestamp: string
  userAgent: string
  url: string
}

/**
 * Send fix request for global JS errors (TypeErrors, etc.)
 */
function sendGlobalErrorFixRequest(error: GlobalError): void {
  if (!isInIframe()) return

  const fixPrompt = `Fix this JavaScript error in the child application:

**Error Type:** ${error.type}
**Error Message:** ${error.message}
${error.stack ? `**Stack Trace:**\n\`\`\`\n${error.stack.substring(0, 800)}\n\`\`\`` : ''}

**Instructions:** This is likely a code bug where a variable is undefined or null when it shouldn't be. Check the component rendering logic and add proper null checks or fix the data access pattern.`

  try {
    window.parent.postMessage(
      {
        type: 'FIX_ERROR_REQUEST',
        source: 'architect-child-app',
        payload: {
          ...error,
          action: 'fix',
          fixPrompt,
        },
      },
      '*'
    )
    console.log('[AgentInterceptor] Global error fix request sent to parent')
  } catch (e) {
    console.error('[AgentInterceptor] Failed to send fix request:', e)
  }
}

/**
 * Error Modal Component - Shows when API/parse errors are detected
 */
function ErrorModal({
  error,
  onDismiss,
  onFix,
}: {
  error: PendingError
  onDismiss: () => void
  onFix: () => void
}) {
  const inIframe = isInIframe()

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            ⚠️
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1F2937' }}>
              Response Error Detected
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#6B7280' }}>
              {error.error.type === 'parse_error' ? 'JSON parsing issue' : error.error.type}
            </p>
          </div>
        </div>

        {/* Error Message */}
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
          }}
        >
          <p style={{ margin: 0, fontSize: '14px', color: '#991B1B', fontFamily: 'monospace' }}>
            {error.error.message}
          </p>
        </div>

        {/* Raw Response Preview */}
        {error.error.raw_response && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#6B7280', fontWeight: 500 }}>
              Raw response (data exists):
            </p>
            <div
              style={{
                backgroundColor: '#F3F4F6',
                borderRadius: '8px',
                padding: '12px',
                maxHeight: '120px',
                overflow: 'auto',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontSize: '11px',
                  color: '#374151',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {error.error.raw_response.substring(0, 500)}
                {error.error.raw_response.length > 500 ? '...' : ''}
              </pre>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onDismiss}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid #D1D5DB',
              backgroundColor: 'white',
              color: '#374151',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
          {inIframe && (
            <button
              onClick={onFix}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#3B82F6',
                color: 'white',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              🔧 Fix with AI
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Global Error Modal Component - Shows when JS errors (TypeError, etc.) are detected
 */
function GlobalErrorModal({
  error,
  onDismiss,
  onFix,
}: {
  error: GlobalError
  onDismiss: () => void
  onFix: () => void
}) {
  const inIframe = isInIframe()

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: '12px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: '1px solid #e74c3c',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: '#e74c3c',
          }}
        >
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <div>
            <h3 style={{ margin: 0, color: 'white', fontSize: '16px', fontWeight: 600 }}>
              JavaScript Error Detected
            </h3>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>
              {error.type} at {new Date(error.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
              Error Message
            </label>
            <div
              style={{
                backgroundColor: '#2d2d44',
                padding: '12px',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '13px',
                color: '#ff6b6b',
                wordBreak: 'break-word',
              }}
            >
              {error.message}
            </div>
          </div>

          {error.stack && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                Stack Trace
              </label>
              <div
                style={{
                  backgroundColor: '#2d2d44',
                  padding: '12px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: '#aaa',
                  maxHeight: '150px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {error.stack}
              </div>
            </div>
          )}

          {inIframe && (
            <div
              style={{
                backgroundColor: '#1e3a5f',
                padding: '12px',
                borderRadius: '6px',
                marginBottom: '16px',
              }}
            >
              <p style={{ margin: 0, color: '#4fc3f7', fontSize: '13px' }}>
                💡 Click "Fix with AI" to automatically fix this error
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid #333',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <button
            onClick={onDismiss}
            style={{
              padding: '10px 20px',
              borderRadius: '6px',
              border: '1px solid #555',
              backgroundColor: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Dismiss
          </button>
          {inIframe && (
            <button
              onClick={onFix}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#3498db',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              🔧 Fix with AI
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Provider that installs the global fetch interceptor for Lyzr Agent API calls.
 * Shows error modal when issues are detected, lets user click "Fix with AI".
 *
 * Add this to your layout.tsx to enable error detection for ALL agent calls.
 */
export function AgentInterceptorProvider({ children }: { children: React.ReactNode }) {
  const [pendingError, setPendingError] = useState<PendingError | null>(null)
  const [globalError, setGlobalError] = useState<GlobalError | null>(null)

  useEffect(() => {
    // Install interceptor on mount
    installAgentInterceptor()

    // Register callback to receive error notifications
    onInterceptorError((error) => {
      setPendingError(error)
    })

    // Also listen for global JS errors (TypeErrors, etc.)
    const handleGlobalError = (event: ErrorEvent) => {
      const isTypeError = event.message.includes('TypeError') ||
                          event.message.includes('Cannot read properties') ||
                          event.message.includes('is not defined') ||
                          event.message.includes('is not a function')

      if (isTypeError) {
        const errorDetails: GlobalError = {
          type: 'react_error',
          message: event.message,
          stack: event.error?.stack,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }
        setGlobalError(errorDetails)

        // Auto-request fix if in iframe
        if (isInIframe()) {
          console.log('[AgentInterceptor] TypeError detected, auto-requesting fix...')
          sendGlobalErrorFixRequest(errorDetails)
        }
      }
    }

    window.addEventListener('error', handleGlobalError)
    return () => window.removeEventListener('error', handleGlobalError)
  }, [])

  const handleDismiss = () => {
    clearPendingError()
    setPendingError(null)
  }

  const handleFix = () => {
    sendFixRequestToParent()
    setPendingError(null)
  }

  const handleGlobalDismiss = () => {
    setGlobalError(null)
  }

  const handleGlobalFix = () => {
    if (globalError) {
      sendGlobalErrorFixRequest(globalError)
    }
    setGlobalError(null)
  }

  return (
    <>
      {children}
      {pendingError && (
        <ErrorModal error={pendingError} onDismiss={handleDismiss} onFix={handleFix} />
      )}
      {globalError && !pendingError && (
        <GlobalErrorModal error={globalError} onDismiss={handleGlobalDismiss} onFix={handleGlobalFix} />
      )}
    </>
  )
}

export default AgentInterceptorProvider
