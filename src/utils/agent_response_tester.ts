/**
 * Agent Response Tester Utility
 *
 * Tests agent responses via server-side SSE streaming for real-time progress updates.
 * Used by UI Generator to verify actual response structure and create accurate TypeScript interfaces.
 *
 * @example
 * ```typescript
 * import { testAgentResponse, testAgentWithProgress } from '@/utils/agent_response_tester';
 *
 * // Quick test (no streaming)
 * const result = await testAgentResponse({
 *   agentId: '694045743cc5fbe223af862e',
 *   testMessage: 'Calculate credits for 1000 API calls'
 * });
 *
 * // With SSE progress updates
 * await testAgentWithProgress({
 *   agentId: '694045743cc5fbe223af862e',
 *   testMessage: 'Calculate credits',
 *   onProgress: (status, message) => console.log(`[${status}] ${message}`),
 *   onComplete: (result) => console.log('Done:', result)
 * });
 * ```
 */

// =============================================================================
// Configuration
// =============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8889'

// =============================================================================
// Types
// =============================================================================

export interface TestAgentOptions {
  /** The agent ID to test (24-char hex string) */
  agentId: string
  /** Test message to send to the agent */
  testMessage: string
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
}

export interface TestAgentWithProgressOptions extends TestAgentOptions {
  /** Called for each progress update */
  onProgress?: (status: string, message: string) => void
  /** Called when test completes */
  onComplete?: (result: TestResult) => void
  /** Called on error */
  onError?: (error: string) => void
}

export interface NormalizedResponse {
  status: 'success' | 'error'
  result: Record<string, any>
  message?: string
  metadata?: {
    agent_name?: string
    timestamp?: string
    [key: string]: any
  }
}

export interface TestResult {
  /** Whether the test was successful */
  success: boolean
  /** Normalized agent response */
  response: NormalizedResponse
  /** Agent ID tested */
  agentId: string
  /** Test message used */
  testMessage: string
  /** Raw response text for debugging */
  rawResponse?: string
  /** Error message if failed */
  error?: string
  /** Response time in milliseconds */
  responseTimeMs?: number
  /** Detected response fields for UI mapping */
  detectedFields?: ResponseFieldInfo[]
  /** Auto-generated TypeScript interface */
  typeScriptInterface?: string
}

export interface ResponseFieldInfo {
  /** Field name */
  name: string
  /** Detected type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'unknown'
  /** Sample value (truncated for display) */
  sampleValue: string
  /** Path in response (e.g., "result.breakdown[0].amount") */
  path: string
  /** Is this field an array? */
  isArray: boolean
  /** Nested fields if object/array */
  children?: ResponseFieldInfo[]
}

interface SSEEvent {
  event_type: string
  data: any
}

// =============================================================================
// SSE Streaming Test
// =============================================================================

/**
 * Test an agent with SSE streaming progress updates
 *
 * @param options - Test configuration with progress callbacks
 *
 * @example
 * ```typescript
 * await testAgentWithProgress({
 *   agentId: '694045743cc5fbe223af862e',
 *   testMessage: 'Hello, agent!',
 *   onProgress: (status, msg) => {
 *     // Update UI with progress
 *     setProgressStatus(status)
 *     setProgressMessage(msg)
 *   },
 *   onComplete: (result) => {
 *     if (result.success) {
 *       // Use result.detectedFields to build UI
 *       // Use result.typeScriptInterface for typing
 *     }
 *   },
 *   onError: (error) => {
 *     console.error('Test failed:', error)
 *   }
 * })
 * ```
 */
export async function testAgentWithProgress(
  options: TestAgentWithProgressOptions
): Promise<TestResult> {
  const { agentId, testMessage, timeout = 30000, onProgress, onComplete, onError } = options

  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
      const error = 'Test timed out'
      onError?.(error)
      reject(new Error(error))
    }, timeout + 5000) // Add buffer for SSE connection

    fetch(`${API_BASE_URL}/api/test-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        test_message: testMessage,
        timeout,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let finalResult: TestResult | null = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event: SSEEvent = JSON.parse(line.slice(6))

                switch (event.event_type) {
                  case 'test_started':
                    onProgress?.('started', 'Test initiated...')
                    break

                  case 'test_progress':
                    onProgress?.(event.data.status, event.data.message)
                    break

                  case 'test_completed':
                    finalResult = {
                      success: event.data.success,
                      response: event.data.response || { status: 'error', result: {} },
                      agentId: event.data.agent_id,
                      testMessage,
                      rawResponse: event.data.rawResponse,
                      error: event.data.error,
                      responseTimeMs: event.data.responseTimeMs,
                      detectedFields: event.data.detectedFields,
                      typeScriptInterface: event.data.typeScriptInterface,
                    }
                    onComplete?.(finalResult)
                    break

                  case 'test_error':
                    finalResult = {
                      success: false,
                      response: { status: 'error', result: {}, message: event.data.error },
                      agentId: event.data.agent_id,
                      testMessage,
                      error: event.data.error,
                    }
                    onError?.(event.data.error)
                    break
                }
              } catch (e) {
                console.warn('[AgentTester] Failed to parse SSE event:', line)
              }
            }
          }
        }

        clearTimeout(timeoutId)

        if (finalResult) {
          resolve(finalResult)
        } else {
          const error = 'No result received from server'
          onError?.(error)
          reject(new Error(error))
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId)
        const error = err.message || 'Network error'
        onError?.(error)
        reject(err)
      })
  })
}

// =============================================================================
// Quick Test (No Streaming)
// =============================================================================

/**
 * Test an agent and get the actual response structure (no streaming)
 *
 * @param options - Test configuration
 * @returns Test result with response structure and detected fields
 *
 * @example
 * ```typescript
 * const result = await testAgentResponse({
 *   agentId: '694045743cc5fbe223af862e',
 *   testMessage: 'Hello, how can you help?'
 * });
 *
 * if (result.success) {
 *   console.log('Fields:', result.detectedFields);
 *   console.log('TypeScript:', result.typeScriptInterface);
 * }
 * ```
 */
export async function testAgentResponse(options: TestAgentOptions): Promise<TestResult> {
  const { agentId, testMessage, timeout = 30000 } = options

  try {
    const response = await fetch(`${API_BASE_URL}/api/test-agent/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        test_message: testMessage,
        timeout,
      }),
    })

    const data = await response.json()

    return {
      success: data.success,
      response: data.response || { status: 'error', result: {}, message: data.error },
      agentId: data.agent_id || agentId,
      testMessage,
      rawResponse: data.rawResponse,
      error: data.error,
      responseTimeMs: data.responseTimeMs,
      detectedFields: data.detectedFields,
      typeScriptInterface: data.typeScriptInterface,
    }
  } catch (err) {
    return {
      success: false,
      response: { status: 'error', result: {}, message: String(err) },
      agentId,
      testMessage,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Quick test to verify agent is responding
 */
export async function pingAgent(agentId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/test-agent/ping/${agentId}`)
    const data = await response.json()
    return data.success && data.reachable
  } catch {
    return false
  }
}

/**
 * Get response schema summary for an agent
 */
export async function getResponseSchema(
  agentId: string,
  testMessage: string = 'Provide a sample response'
): Promise<{
  success: boolean
  fields: ResponseFieldInfo[]
  typeScriptInterface: string
  rawResponse?: string
  error?: string
}> {
  const result = await testAgentResponse({ agentId, testMessage })

  if (!result.success) {
    return {
      success: false,
      fields: [],
      typeScriptInterface: '',
      error: result.error,
    }
  }

  return {
    success: true,
    fields: result.detectedFields || [],
    typeScriptInterface: result.typeScriptInterface || '',
    rawResponse: result.rawResponse,
  }
}

/**
 * Generate TypeScript interface from detected fields (client-side fallback)
 */
export function generateTypeScriptInterface(
  fields: ResponseFieldInfo[],
  interfaceName: string = 'AgentResult'
): string {
  const lines: string[] = []

  function generateType(field: ResponseFieldInfo): string {
    switch (field.type) {
      case 'string':
        return 'string'
      case 'number':
        return 'number'
      case 'boolean':
        return 'boolean'
      case 'null':
        return 'null'
      case 'array':
        if (field.children && field.children.length > 0) {
          const childInterface = `{\n${field.children.map((c) => `    ${c.name}: ${generateType(c)}`).join(';\n')};\n  }`
          return `Array<${childInterface}>`
        }
        return 'any[]'
      case 'object':
        if (field.children && field.children.length > 0) {
          return `{\n${field.children.map((c) => `    ${c.name}: ${generateType(c)}`).join(';\n')};\n  }`
        }
        return 'Record<string, any>'
      default:
        return 'any'
    }
  }

  lines.push(`interface ${interfaceName} {`)
  for (const field of fields) {
    lines.push(`  ${field.name}: ${generateType(field)};`)
  }
  lines.push('}')

  return lines.join('\n')
}

// =============================================================================
// Export default
// =============================================================================

export default testAgentResponse
