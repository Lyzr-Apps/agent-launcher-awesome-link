/**
 * SSE Event Parser with Robust JSON Fallback
 * Handles malformed SSE events from Lyra backend
 */

import { robustJSONParse, type ParseResult } from './json-parser'
import type { SSEEvent, SSEEventType, SSEEventBase } from '@/types'

export interface ParsedSSEEvent {
  success: boolean
  event?: SSEEvent
  eventType?: SSEEventType
  raw?: string
  error?: string
  parseStrategy?: string
}

/**
 * Parse a single SSE line into event type and data
 */
function parseSSELine(line: string): { type: 'event' | 'data' | 'other'; value: string } {
  if (line.startsWith('event: ')) {
    return { type: 'event', value: line.substring(7).trim() }
  }
  if (line.startsWith('data: ')) {
    return { type: 'data', value: line.substring(6) }
  }
  return { type: 'other', value: line }
}

/**
 * Parse SSE event data using robust JSON parser
 */
export function parseSSEEvent(
  eventType: string,
  data: string,
  requestId?: string
): ParsedSSEEvent {
  // Handle [DONE] marker
  if (data === '[DONE]') {
    return {
      success: true,
      eventType: 'chat_completed' as SSEEventType,
      event: {
        type: 'chat_completed',
        request_id: requestId || '',
        timestamp: new Date().toISOString(),
      } as SSEEvent,
    }
  }

  // Use robust JSON parser
  const parseResult = robustJSONParse<Record<string, unknown>>(data)

  if (parseResult.success && parseResult.data) {
    const eventData = parseResult.data

    // Ensure type field is set
    if (!eventData.type) {
      eventData.type = eventType
    }

    // Ensure required fields
    if (!eventData.request_id && requestId) {
      eventData.request_id = requestId
    }
    if (!eventData.timestamp) {
      eventData.timestamp = new Date().toISOString()
    }

    return {
      success: true,
      event: eventData as unknown as SSEEvent,
      eventType: (eventData.type || eventType) as SSEEventType,
      parseStrategy: parseResult.strategy,
    }
  }

  // Parse failed - return error event
  return {
    success: false,
    eventType: 'parse_error' as SSEEventType,
    raw: parseResult.raw || data,
    error: parseResult.error || 'Failed to parse SSE data',
    parseStrategy: parseResult.strategy,
  }
}

/**
 * Parse raw SSE text into events
 * Handles multi-line SSE format:
 * event: event_name
 * data: {...}
 */
export function parseSSEStream(rawSSE: string, requestId?: string): ParsedSSEEvent[] {
  const events: ParsedSSEEvent[] = []
  const lines = rawSSE.split('\n')

  let currentEventType: string | null = null
  let currentData: string[] = []

  for (const line of lines) {
    if (line.trim() === '') {
      // Empty line = end of event
      if (currentData.length > 0) {
        const data = currentData.join('\n')
        const eventType = currentEventType || 'message'
        events.push(parseSSEEvent(eventType, data, requestId))
      }
      currentEventType = null
      currentData = []
      continue
    }

    const parsed = parseSSELine(line)

    if (parsed.type === 'event') {
      currentEventType = parsed.value
    } else if (parsed.type === 'data') {
      currentData.push(parsed.value)
    }
  }

  // Handle remaining data
  if (currentData.length > 0) {
    const data = currentData.join('\n')
    const eventType = currentEventType || 'message'
    events.push(parseSSEEvent(eventType, data, requestId))
  }

  return events
}

/**
 * Create an error event from a parse failure
 */
export function createParseErrorEvent(
  error: string,
  raw: string,
  requestId?: string
): SSEEventBase & { type: 'parse_error'; error: string; raw_content_preview?: string } {
  return {
    type: 'parse_error',
    request_id: requestId || '',
    timestamp: new Date().toISOString(),
    error,
    raw_content_preview: raw.substring(0, 500),
  }
}

/**
 * Handle SSE event by type with proper fallback
 */
export function handleSSEEvent(
  parsed: ParsedSSEEvent,
  handlers: {
    onSuccess?: (event: SSEEvent) => void
    onParseError?: (raw: string, error: string) => void
    onToolBlocked?: (event: SSEEvent) => void
    onToolError?: (event: SSEEvent) => void
    onValidationError?: (event: SSEEvent) => void
  }
): void {
  if (!parsed.success) {
    handlers.onParseError?.(parsed.raw || '', parsed.error || 'Unknown error')
    return
  }

  const event = parsed.event
  if (!event) return

  // Handle error event types
  switch (parsed.eventType) {
    case 'tool_blocked':
      handlers.onToolBlocked?.(event)
      break
    case 'tool_error':
      handlers.onToolError?.(event)
      break
    case 'parse_error':
      handlers.onParseError?.(
        (event as any).raw_content_preview || '',
        (event as any).error || 'Parse error'
      )
      break
    case 'validation_error':
      handlers.onValidationError?.(event)
      break
    default:
      handlers.onSuccess?.(event)
  }
}

/**
 * Extract a human-readable message from any event type
 */
export function getEventMessage(event: SSEEvent): string {
  const type = (event as any).type as SSEEventType

  switch (type) {
    case 'tool_blocked':
      return `Tool blocked: ${(event as any).reason || 'Unknown reason'}`
    case 'tool_error':
      return `Tool error: ${(event as any).error || 'Unknown error'}`
    case 'parse_error':
      return `Parse error: ${(event as any).error || 'Failed to parse response'}`
    case 'validation_error':
      return `Validation error: ${(event as any).error || 'Invalid data'}`
    case 'agent_created':
      return `Agent created: ${(event as any).agent_name || (event as any).name || 'Unknown'}`
    case 'workflow_update':
      return 'Workflow updated'
    case 'chat_completed':
      return 'Task completed'
    case 'chat_failed':
      return `Task failed: ${(event as any).error || 'Unknown error'}`
    default:
      return (event as any).message || `Event: ${type}`
  }
}
