/**
 * Global Fetch Interceptor for Lyzr Agent API calls
 *
 * Detects parse failures and shows modal for user to click "Fix with AI"
 * Works even when AI-generated code uses raw fetch() instead of useAgent hook
 */

// Lyzr Agent API endpoint to intercept
const LYZR_API_URL = 'https://agent-prod.studio.lyzr.ai/v3/inference/chat'

import { isInIframe } from '@/components/ErrorBoundary'

interface ErrorDetails {
  type: 'react_error' | 'api_error' | 'parse_error' | 'network_error' | 'unknown'
  message: string
  stack?: string
  raw_response?: string
  endpoint?: string
  timestamp: string
  userAgent: string
  url: string
}

interface PendingError {
  error: ErrorDetails
  fullResponse: any
}

// Store original fetch
const originalFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : null

// Track if interceptor is installed
let interceptorInstalled = false

// Global state for pending error (to show in modal)
let pendingError: PendingError | null = null
let modalCallback: ((error: PendingError | null) => void) | null = null

/**
 * Register a callback to be notified when an error is detected
 * The callback receives the error details, or null when cleared
 */
export function onInterceptorError(callback: (error: PendingError | null) => void): void {
  modalCallback = callback
}

/**
 * Get the current pending error (if any)
 */
export function getPendingError(): PendingError | null {
  return pendingError
}

/**
 * Clear the pending error (call after user dismisses modal)
 */
export function clearPendingError(): void {
  pendingError = null
  if (modalCallback) {
    modalCallback(null)
  }
}

/**
 * Send fix request to parent (call when user clicks "Fix with AI")
 */
export function sendFixRequestToParent(): void {
  if (!pendingError) return
  if (!isInIframe()) return

  const { error, fullResponse } = pendingError

  try {
    window.parent.postMessage(
      {
        type: 'FIX_ERROR_REQUEST',
        source: 'architect-child-app',
        payload: {
          ...error,
          action: 'user_requested_fix',
          fixPrompt: generateFixPrompt(error, fullResponse),
          fullResponse: JSON.stringify(fullResponse).substring(0, 2000),
        },
      },
      '*'
    )
    console.log('[AgentInterceptor] Fix request sent to parent (user clicked)')
    clearPendingError()
  } catch (e) {
    console.error('[AgentInterceptor] Failed to send fix request:', e)
  }
}

/**
 * Detect if a response has issues that need fixing
 */
function detectResponseIssue(data: any): { hasIssue: boolean; error: ErrorDetails | null } {
  // Case 1: API-level failure
  if (data.success === false && data.error) {
    return {
      hasIssue: true,
      error: {
        type: 'api_error',
        message: data.error,
        raw_response: data.details || data.raw_response,
        endpoint: LYZR_API_URL,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      }
    }
  }

  // Case 2: Parse failure indicated by _parse_succeeded flag
  if (data._parse_succeeded === false && data._has_valid_data === true) {
    return {
      hasIssue: true,
      error: {
        type: 'parse_error',
        message: 'JSON parsing failed but valid data exists in raw_response',
        raw_response: data.raw_response,
        endpoint: LYZR_API_URL,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      }
    }
  }

  // Case 3: Response has error field indicating parse failure
  if (data.response && typeof data.response === 'object') {
    if (data.response.success === false && data.response.error) {
      // Check if raw_response has valid data
      const hasValidRaw = data.raw_response && data.raw_response.length > 20
      if (hasValidRaw) {
        return {
          hasIssue: true,
          error: {
            type: 'parse_error',
            message: data.response.error,
            raw_response: data.raw_response,
            endpoint: LYZR_API_URL,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
          }
        }
      }
    }
  }

  return { hasIssue: false, error: null }
}

/**
 * Generate fix prompt for parent app
 */
function generateFixPrompt(error: ErrorDetails, fullResponse: any): string {
  let prompt = `The child app received a valid agent response but failed to display it properly.\n\n`
  prompt += `**Error Type:** ${error.type}\n`
  prompt += `**Error Message:** ${error.message}\n\n`
  prompt += `**The raw_response contains valid data:**\n\`\`\`json\n${error.raw_response?.substring(0, 800)}\n\`\`\`\n\n`
  prompt += `**Fix needed:** Update the UI code (src/pages/Home.tsx) to properly extract and display the agent's response.\n`
  prompt += `Use the extractAgentMessage pattern or access response.result.answer / response.result.message directly.\n`
  prompt += `The data IS there - the UI just isn't reading it correctly.`
  return prompt
}

/**
 * Set pending error and notify callback (shows modal)
 */
function setPendingError(error: ErrorDetails, fullResponse: any): void {
  pendingError = { error, fullResponse }
  if (modalCallback) {
    modalCallback(pendingError)
  }
}

/**
 * Intercepted fetch function
 */
async function interceptedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (!originalFetch) {
    throw new Error('Fetch not available')
  }

  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

  // Only intercept Lyzr Agent API calls
  if (!url.includes('agent-prod.studio.lyzr.ai')) {
    return originalFetch(input, init)
  }

  console.log('[AgentInterceptor] Intercepting Lyzr Agent API call')

  try {
    const response = await originalFetch(input, init)

    // Clone response so we can read it without consuming
    const clonedResponse = response.clone()

    // Try to detect issues in the response
    try {
      const data = await clonedResponse.json()

      const { hasIssue, error } = detectResponseIssue(data)

      if (hasIssue && error) {
        console.warn('[AgentInterceptor] Detected response issue:', error.type)

        // Store error and notify modal (don't auto-send to parent)
        setPendingError(error, data)

        // Still return the original response so UI can try to use it
      }
    } catch (jsonError) {
      // Response isn't JSON - that's fine, just continue
    }

    return response

  } catch (networkError) {
    console.error('[AgentInterceptor] Network error:', networkError)

    // Store network error for modal
    const error: ErrorDetails = {
      type: 'network_error',
      message: networkError instanceof Error ? networkError.message : 'Network request failed',
      endpoint: '/api/agent',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    }

    if (isInIframe()) {
      setPendingError(error, null)
    }

    throw networkError
  }
}

/**
 * Install the global fetch interceptor
 * Call this once in your app (e.g., in layout.tsx or _app.tsx)
 */
export function installAgentInterceptor(): void {
  if (typeof window === 'undefined') return
  if (interceptorInstalled) return
  if (!originalFetch) return

  window.fetch = interceptedFetch as typeof fetch
  interceptorInstalled = true
  console.log('[AgentInterceptor] Installed global fetch interceptor for Lyzr Agent API')
}

/**
 * Uninstall the interceptor (restore original fetch)
 */
export function uninstallAgentInterceptor(): void {
  if (typeof window === 'undefined') return
  if (!interceptorInstalled) return
  if (!originalFetch) return

  window.fetch = originalFetch
  interceptorInstalled = false
  console.log('[AgentInterceptor] Uninstalled fetch interceptor')
}

/**
 * Check if interceptor is installed
 */
export function isInterceptorInstalled(): boolean {
  return interceptorInstalled
}
