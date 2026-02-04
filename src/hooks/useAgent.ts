/**
 * useAgent Hook
 *
 * React hook for calling AI agents with error handling and iframe communication.
 * Uses the same normalized response structure as callAIAgent.
 *
 * @example
 * ```tsx
 * const { callAgent, loading, error, response } = useAgent({ agentId: 'xxx' })
 *
 * // response is NormalizedAgentResponse:
 * // { status: 'success', result: {...}, message?: string }
 * ```
 */

import { useState, useCallback } from 'react'
import { isInIframe, sendErrorToParent, requestFixFromParent } from '@/components/ErrorBoundary'
import { callAIAgent, NormalizedAgentResponse, AIAgentResponse } from '@/utils/aiAgent'

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

interface UseAgentOptions {
  agentId?: string
  onError?: (error: ErrorDetails) => void
  showErrorModal?: boolean
}

interface AgentCallOptions {
  message: string
  agentId?: string
  userId?: string
  sessionId?: string
}

interface UseAgentResult {
  success: boolean
  response: NormalizedAgentResponse
  raw_response?: string
  error?: ErrorDetails
}

// =============================================================================
// Global Error State for Modal
// =============================================================================

let globalErrorCallback: ((error: ErrorDetails | null) => void) | null = null

export const setGlobalErrorCallback = (callback: (error: ErrorDetails | null) => void) => {
  globalErrorCallback = callback
}

export const clearGlobalError = () => {
  if (globalErrorCallback) {
    globalErrorCallback(null)
  }
}

// =============================================================================
// Helper: Convert API error to ErrorDetails
// =============================================================================

const createErrorDetails = (
  type: ErrorDetails['type'],
  message: string,
  raw_response?: string
): ErrorDetails => ({
  type,
  message,
  raw_response,
  endpoint: 'https://agent-prod.studio.lyzr.ai/v3/inference/chat',
  timestamp: new Date().toISOString(),
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  url: typeof window !== 'undefined' ? window.location.href : 'unknown',
})

// =============================================================================
// useAgent Hook
// =============================================================================

/**
 * React hook for using AI Agents with error handling
 *
 * @param options - Configuration options
 * @returns Hook state and callAgent function
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { callAgent, loading, error, response } = useAgent({ agentId: 'xxx' })
 *
 *   return (
 *     <div>
 *       <button onClick={() => callAgent({ message: 'Hello' })}>Ask</button>
 *       {loading && <p>Loading...</p>}
 *       {response && (
 *         <div>
 *           <p>Status: {response.status}</p>
 *           <pre>{JSON.stringify(response.result, null, 2)}</pre>
 *         </div>
 *       )}
 *     </div>
 *   )
 * }
 * ```
 */
export const useAgent = (options: UseAgentOptions = {}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ErrorDetails | null>(null)
  const [response, setResponse] = useState<NormalizedAgentResponse | null>(null)
  const [lastResult, setLastResult] = useState<AIAgentResponse | null>(null)

  const callAgent = useCallback(async (callOptions: AgentCallOptions): Promise<UseAgentResult> => {
    const { message, agentId, userId, sessionId } = callOptions
    const finalAgentId = agentId || options.agentId || import.meta.env.VITE_AGENT_ID

    if (!finalAgentId) {
      const err = createErrorDetails('api_error', 'No agent_id provided')
      setError(err)
      return {
        success: false,
        response: { status: 'error', result: {}, message: 'No agent_id provided' },
        error: err,
      }
    }

    setLoading(true)
    setError(null)

    try {
      // Use the centralized callAIAgent which handles normalization
      const result = await callAIAgent(message, finalAgentId, {
        user_id: userId,
        session_id: sessionId,
      })

      setLastResult(result)
      setResponse(result.response)

      if (!result.success) {
        const errorDetails = createErrorDetails(
          'api_error',
          result.error || 'Agent call failed',
          result.raw_response
        )
        setError(errorDetails)

        // Notify parent if in iframe
        if (isInIframe()) {
          sendErrorToParent(errorDetails)
          if (globalErrorCallback && options.showErrorModal !== false) {
            globalErrorCallback(errorDetails)
          }
        }

        if (options.onError) {
          options.onError(errorDetails)
        }

        return {
          success: false,
          response: result.response,
          raw_response: result.raw_response,
          error: errorDetails,
        }
      }

      // Check for agent-level error (status: 'error')
      if (result.response.status === 'error') {
        const errorDetails = createErrorDetails(
          'api_error',
          result.response.message || 'Agent returned error status',
          result.raw_response
        )

        if (isInIframe() && options.showErrorModal !== false) {
          sendErrorToParent(errorDetails)
          if (globalErrorCallback) {
            globalErrorCallback(errorDetails)
          }
        }

        if (options.onError) {
          options.onError(errorDetails)
        }
      }

      return {
        success: true,
        response: result.response,
        raw_response: result.raw_response,
      }

    } catch (networkError) {
      const err = createErrorDetails(
        'network_error',
        networkError instanceof Error ? networkError.message : 'Network request failed'
      )

      setError(err)
      setResponse({ status: 'error', result: {}, message: err.message })

      if (isInIframe()) {
        sendErrorToParent(err)
        if (globalErrorCallback && options.showErrorModal !== false) {
          globalErrorCallback(err)
        }
      }

      if (options.onError) {
        options.onError(err)
      }

      return {
        success: false,
        response: { status: 'error', result: {}, message: err.message },
        error: err,
      }

    } finally {
      setLoading(false)
    }
  }, [options])

  const requestFix = useCallback(() => {
    if (error) {
      requestFixFromParent(error)
    }
  }, [error])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    callAgent,
    loading,
    error,
    response,
    lastResult,
    requestFix,
    clearError,
  }
}

// =============================================================================
// Simple API function (for non-hook usage)
// =============================================================================

/**
 * Simple wrapper that calls callAIAgent with error handling
 */
export const callAgentAPI = async (
  message: string,
  agentId: string,
  options?: { userId?: string; sessionId?: string }
): Promise<UseAgentResult> => {
  try {
    const result = await callAIAgent(message, agentId, {
      user_id: options?.userId,
      session_id: options?.sessionId,
    })

    if (!result.success || result.response.status === 'error') {
      const errorDetails = createErrorDetails(
        'api_error',
        result.error || result.response.message || 'Agent call failed',
        result.raw_response
      )

      if (isInIframe()) {
        sendErrorToParent(errorDetails)
        if (globalErrorCallback) {
          globalErrorCallback(errorDetails)
        }
      }

      return {
        success: false,
        response: result.response,
        raw_response: result.raw_response,
        error: errorDetails,
      }
    }

    return {
      success: true,
      response: result.response,
      raw_response: result.raw_response,
    }

  } catch (networkError) {
    const err = createErrorDetails(
      'network_error',
      networkError instanceof Error ? networkError.message : 'Network request failed'
    )

    if (isInIframe()) {
      sendErrorToParent(err)
      if (globalErrorCallback) {
        globalErrorCallback(err)
      }
    }

    return {
      success: false,
      response: { status: 'error', result: {}, message: err.message },
      error: err,
    }
  }
}

// Re-export types for convenience
export type { NormalizedAgentResponse, AIAgentResponse }

export default useAgent
