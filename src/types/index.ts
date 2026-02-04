// Common TypeScript types for your application

export interface User {
  id: string
  name: string
  email: string
}

export interface ApiResponse<T> {
  data: T
  message: string
  success: boolean
}

export type Theme = 'light' | 'dark'

export interface AppConfig {
  apiUrl: string
  theme: Theme
}

// =============================================================================
// SSE Event Types for Lyra Chat
// =============================================================================

/**
 * All possible SSE event types emitted by the Lyra backend.
 * These map to EventType enum in lyra/models/schemas.py
 */
export type SSEEventType =
  | 'chat_started'
  | 'chat_progress'
  | 'chat_completed'
  | 'chat_failed'
  | 'tool_use'
  | 'tool_result'
  | 'message_received'
  | 'status_update'
  | 'error'
  | 'commit_created'
  | 'commit_failed'
  | 'workflow_update'
  | 'workflow_completed'
  | 'subagent_switch'
  | 'agent_created'
  | 'knowledge_base_created'
  // New error event types for robust handling
  | 'tool_error'
  | 'tool_blocked'
  | 'parse_error'
  | 'validation_error'

/**
 * Base SSE event structure
 */
export interface SSEEventBase {
  request_id: string
  session_id?: string
  timestamp: string
  // Sequence metadata for deterministic ordering
  _seq?: number           // Sequence number for ordering
  _priority?: number      // Priority level (1=critical, 7=info)
  _ts?: string            // Server timestamp
  _parent_seq?: number    // Parent event sequence (for causality)
  _tool_use_id?: string   // Related tool_use_id (for tool_result linking)
}

/**
 * Tool use event - when Claude calls a tool
 */
export interface ToolUseEvent extends SSEEventBase {
  type: 'tool_use'
  tool_name: string
  tool_input: Record<string, any>
  tool_use_id: string
  active_subagent?: string
}

/**
 * Tool result event - result from tool execution
 */
export interface ToolResultEvent extends SSEEventBase {
  type: 'tool_result'
  tool_use_id: string
  tool_name: string
  content: any
  is_error: boolean
  active_subagent?: string
}

/**
 * Tool blocked event - when enforcement blocks a tool call
 */
export interface ToolBlockedEvent extends SSEEventBase {
  type: 'tool_blocked'
  tool_name: string
  tool_input: Record<string, any>
  tool_use_id: string
  reason: string
  suggestion?: string
}

/**
 * Tool error event - when a tool execution fails
 */
export interface ToolErrorEvent extends SSEEventBase {
  type: 'tool_error'
  tool_name: string
  tool_use_id?: string
  error: string
  error_type: 'tool_execution_error' | 'api_failure'
  status_code?: string
}

/**
 * Parse error event - when JSON parsing fails
 */
export interface ParseErrorEvent extends SSEEventBase {
  type: 'parse_error'
  tool_name: string
  error: string
  raw_content_preview?: string
}

/**
 * Validation error event - when schema validation fails
 */
export interface ValidationErrorEvent extends SSEEventBase {
  type: 'validation_error'
  context: string
  error: string
  data?: any
}

/**
 * Agent created event
 */
export interface AgentCreatedEvent extends SSEEventBase {
  type: 'agent_created'
  agent_id: string
  agent_name: string
  name: string
  description: string
  agent_role: string
  agent_goal: string
  agent_instructions: string
  provider_id: string
  model: string
  temperature: number
  top_p: number
  features: any[]
  has_memory: boolean
  has_knowledge_base: boolean
  tool_configs: any[]
}

/**
 * Workflow update event
 */
export interface WorkflowUpdateEvent extends SSEEventBase {
  type: 'workflow_update'
  workflow_state: {
    agents: any[]
    knowledge_bases: any[]
    workflow: {
      nodes: any[]
      edges: any[]
    } | null
    last_updated: string | null
  }
}

/**
 * Subagent switch event
 */
export interface SubagentSwitchEvent extends SSEEventBase {
  type: 'subagent_switch'
  active_subagent: string
  previous_subagent: string | null
}

/**
 * Union type of all SSE events
 */
export type SSEEvent =
  | ToolUseEvent
  | ToolResultEvent
  | ToolBlockedEvent
  | ToolErrorEvent
  | ParseErrorEvent
  | ValidationErrorEvent
  | AgentCreatedEvent
  | WorkflowUpdateEvent
  | SubagentSwitchEvent
  | (SSEEventBase & { type: SSEEventType })

// =============================================================================
// Event Sequencing Utilities
// =============================================================================

/**
 * Event priority levels (lower = higher priority)
 */
export enum EventPriority {
  CRITICAL = 1,      // Errors, blocks
  STATE_CHANGE = 2,  // State machine transitions
  WORKFLOW = 3,      // Workflow structure updates
  AGENT = 4,         // Agent creation/updates
  TOOL = 5,          // Tool use/results
  PROGRESS = 6,      // Progress updates
  INFO = 7,          // Informational messages
}

/**
 * Sort events by sequence number for deterministic ordering
 */
export function sortEventsBySequence<T extends SSEEventBase>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const seqA = a._seq ?? Number.MAX_SAFE_INTEGER
    const seqB = b._seq ?? Number.MAX_SAFE_INTEGER
    return seqA - seqB
  })
}

/**
 * Get the sequence number from an event, or 0 if not present
 */
export function getEventSequence(event: SSEEventBase): number {
  return event._seq ?? 0
}

/**
 * Check if an event is newer than another based on sequence
 */
export function isNewerEvent(event: SSEEventBase, than: SSEEventBase): boolean {
  return getEventSequence(event) > getEventSequence(than)
}

/**
 * Filter events to only include those after a given sequence number
 */
export function eventsAfterSequence<T extends SSEEventBase>(
  events: T[],
  afterSeq: number
): T[] {
  return events.filter(e => getEventSequence(e) > afterSeq)
}

/**
 * Check if event is a critical error type
 */
export function isCriticalEvent(event: SSEEventBase & { type?: SSEEventType }): boolean {
  const criticalTypes: SSEEventType[] = [
    'error',
    'chat_failed',
    'tool_blocked',
    'parse_error',
    'validation_error',
  ]
  return criticalTypes.includes(event.type as SSEEventType)
}