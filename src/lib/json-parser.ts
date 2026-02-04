/**
 * Robust JSON Parser with 5-strategy fallback
 * Handles malformed JSON responses from AI agents
 */

export interface ParseResult<T> {
  success: boolean
  data?: T
  raw?: string
  error?: string
  strategy?: string
}

/**
 * Clean JSON string by removing common issues
 */
function cleanJsonString(input: string): string {
  let cleaned = input.trim()

  // Remove trailing commas before closing brackets/braces
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1')

  // Remove control characters except newlines and tabs
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

  // Fix unescaped newlines in strings (common AI issue)
  cleaned = cleaned.replace(/(?<!\\)\\n/g, '\\n')

  // Remove BOM if present
  cleaned = cleaned.replace(/^\uFEFF/, '')

  return cleaned
}

/**
 * Extract JSON from mixed text/markdown response
 */
function extractJsonFromText(input: string): string | null {
  // Try to find JSON in code blocks first
  const codeBlockMatch = input.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // Look for JSON object pattern
  const objectMatch = input.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    // Find the balanced braces
    const str = input
    let depth = 0
    let start = -1
    let end = -1

    for (let i = 0; i < str.length; i++) {
      if (str[i] === '{') {
        if (depth === 0) start = i
        depth++
      } else if (str[i] === '}') {
        depth--
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }

    if (start !== -1 && end !== -1) {
      return str.substring(start, end)
    }
  }

  // Look for JSON array pattern
  const arrayMatch = input.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    const str = input
    let depth = 0
    let start = -1
    let end = -1

    for (let i = 0; i < str.length; i++) {
      if (str[i] === '[') {
        if (depth === 0) start = i
        depth++
      } else if (str[i] === ']') {
        depth--
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }

    if (start !== -1 && end !== -1) {
      return str.substring(start, end)
    }
  }

  return null
}

/**
 * Attempt partial recovery of key-value pairs
 */
function partialRecovery(input: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {}

  // Match "key": value patterns
  const kvPattern = /"([^"]+)"\s*:\s*("(?:[^"\\]|\\.)*"|true|false|null|\d+(?:\.\d+)?|\[[\s\S]*?\]|\{[\s\S]*?\})/g
  let match
  let foundAny = false

  while ((match = kvPattern.exec(input)) !== null) {
    const key = match[1]
    const valueStr = match[2]
    foundAny = true

    try {
      result[key] = JSON.parse(valueStr)
    } catch {
      // If value parsing fails, store as string
      result[key] = valueStr.replace(/^"|"$/g, '')
    }
  }

  return foundAny ? result : null
}

/**
 * Robust JSON parser with 5-strategy fallback
 *
 * Strategies:
 * 1. Direct JSON.parse()
 * 2. Clean string (trailing commas, escapes) then parse
 * 3. Extract JSON from mixed text/markdown
 * 4. Partial recovery (key-value pairs)
 * 5. Return as raw text fallback
 */
export function robustJSONParse<T = unknown>(input: string): ParseResult<T> {
  if (!input || typeof input !== 'string') {
    return {
      success: false,
      raw: String(input),
      error: 'Invalid input: expected string',
      strategy: 'none'
    }
  }

  const trimmed = input.trim()

  // Strategy 1: Direct parse
  try {
    const data = JSON.parse(trimmed) as T
    return { success: true, data, strategy: 'direct' }
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Clean and parse
  try {
    const cleaned = cleanJsonString(trimmed)
    const data = JSON.parse(cleaned) as T
    return { success: true, data, strategy: 'cleaned' }
  } catch {
    // Continue to next strategy
  }

  // Strategy 3: Extract JSON from text
  const extracted = extractJsonFromText(trimmed)
  if (extracted) {
    try {
      const data = JSON.parse(extracted) as T
      return { success: true, data, strategy: 'extracted' }
    } catch {
      // Try cleaning the extracted JSON
      try {
        const cleanedExtracted = cleanJsonString(extracted)
        const data = JSON.parse(cleanedExtracted) as T
        return { success: true, data, strategy: 'extracted_cleaned' }
      } catch {
        // Continue to next strategy
      }
    }
  }

  // Strategy 4: Partial recovery
  const partial = partialRecovery(trimmed)
  if (partial && Object.keys(partial).length > 0) {
    return {
      success: true,
      data: partial as T,
      strategy: 'partial_recovery'
    }
  }

  // Strategy 5: Return as raw text fallback
  return {
    success: false,
    raw: trimmed,
    error: 'All parsing strategies failed',
    strategy: 'raw_fallback'
  }
}

/**
 * Parse SSE event data with robust fallback
 */
export function parseSSEData<T = unknown>(data: string): ParseResult<T> {
  // Handle SSE-specific formats
  if (data.startsWith('data: ')) {
    data = data.substring(6)
  }

  // Handle [DONE] marker
  if (data === '[DONE]') {
    return {
      success: true,
      data: { done: true } as T,
      strategy: 'sse_done'
    }
  }

  return robustJSONParse<T>(data)
}

/**
 * Safely extract a value from parsed result with default
 */
export function safeGet<T>(
  result: ParseResult<Record<string, unknown>>,
  key: string,
  defaultValue: T
): T {
  if (result.success && result.data && key in result.data) {
    return result.data[key] as T
  }
  return defaultValue
}
