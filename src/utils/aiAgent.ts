/**
 * AI Agent Utility
 *
 * Direct wrapper for calling the Lyzr AI Agent API with normalized response handling.
 *
 * ## Response Structure (GUARANTEED)
 *
 * The `callAIAgent` function ALWAYS returns this structure:
 * ```typescript
 * {
 *   success: boolean,          // true if API call succeeded
 *   response: {
 *     status: 'success' | 'error',  // Agent's status
 *     result: { ... },              // Agent's data - access your fields here!
 *     message?: string,             // Optional message
 *     metadata?: { ... }            // Optional metadata
 *   },
 *   raw_response?: string      // Original raw text for debugging
 * }
 * ```
 *
 * ## UI Access Pattern
 * ```tsx
 * const data = await callAIAgent(message, agentId);
 * if (data.success) {
 *   // Access agent data:
 *   data.response.status           // "success" or "error"
 *   data.response.result.field     // Your agent's fields
 *   data.response.message          // Optional message
 * }
 * ```
 */

import parseLLMJson from '@/utils/jsonParser'
import React from 'react'

// =============================================================================
// Configuration
// =============================================================================

const LYZR_API_URL = 'https://agent-prod.studio.lyzr.ai/v3/inference/chat/'
const LYZR_API_KEY = import.meta.env.VITE_LYZR_API_KEY || ''

// =============================================================================
// Types - UI can rely on these!
// =============================================================================

/**
 * Normalized agent response structure.
 * UI components should ALWAYS expect this shape.
 */
export interface NormalizedAgentResponse {
  /** Agent execution status */
  status: 'success' | 'error'
  /** Agent's result data - your custom fields are here */
  result: Record<string, any>
  /** Optional human-readable message */
  message?: string
  /** Optional metadata about the agent */
  metadata?: {
    agent_name?: string
    timestamp?: string
    [key: string]: any
  }
}

/**
 * Full response from callAIAgent
 */
export interface AIAgentResponse {
  /** Whether the API call succeeded */
  success: boolean
  /** Normalized agent response - ALWAYS has status and result */
  response: NormalizedAgentResponse
  /** Agent ID used */
  agent_id?: string
  /** User ID used */
  user_id?: string
  /** Session ID used */
  session_id?: string
  /** Timestamp */
  timestamp?: string
  /** Original raw response text (for debugging) */
  raw_response?: string
  /** Error message if success is false */
  error?: string
  /** Additional error details */
  details?: string
}

// =============================================================================
// Helpers
// =============================================================================

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Normalize any parsed response to the standard structure.
 * Handles various response formats and ensures consistent output.
 */
function normalizeResponse(parsed: any): NormalizedAgentResponse {
  // If null/undefined, return error structure
  if (!parsed) {
    return {
      status: 'error',
      result: {},
      message: 'Empty response from agent'
    }
  }

  // If it's a string, wrap it
  if (typeof parsed === 'string') {
    return {
      status: 'success',
      result: { text: parsed },
      message: parsed
    }
  }

  // If it's not an object, wrap it
  if (typeof parsed !== 'object') {
    return {
      status: 'success',
      result: { value: parsed },
      message: String(parsed)
    }
  }

  // Already has the expected structure: { status, result, ... }
  if ('status' in parsed && 'result' in parsed) {
    return {
      status: parsed.status === 'error' ? 'error' : 'success',
      result: parsed.result || {},
      message: parsed.message,
      metadata: parsed.metadata
    }
  }

  // Has status but no result - use the whole object as result
  if ('status' in parsed) {
    const { status, message, metadata, ...rest } = parsed
    return {
      status: status === 'error' ? 'error' : 'success',
      result: Object.keys(rest).length > 0 ? rest : {},
      message,
      metadata
    }
  }

  // Has result but no status - assume success
  if ('result' in parsed) {
    return {
      status: 'success',
      result: parsed.result,
      message: parsed.message,
      metadata: parsed.metadata
    }
  }

  // Has message/response field - extract it
  if ('message' in parsed && typeof parsed.message === 'string') {
    return {
      status: 'success',
      result: { text: parsed.message },
      message: parsed.message
    }
  }

  if ('response' in parsed) {
    // Recursively normalize the nested response
    return normalizeResponse(parsed.response)
  }

  // Unknown structure - use the whole object as result
  return {
    status: 'success',
    result: parsed,
    message: undefined,
    metadata: undefined
  }
}

// =============================================================================
// Main API Function
// =============================================================================

/**
 * Call the AI Agent with a message and agent_id
 *
 * @param message - Your query or prompt for the AI agent
 * @param agent_id - Agent ID (required)
 * @param options - Optional user_id, session_id, and assets (file attachments)
 * @returns Promise with normalized AI agent response
 *
 * @example
 * ```tsx
 * // Basic usage
 * const result = await callAIAgent('What is TypeScript?', 'your-agent-id')
 *
 * // With file attachments (from uploadFiles)
 * const uploadResult = await uploadFiles(file)
 * const result = await callAIAgent('Analyze this document', 'your-agent-id', {
 *   assets: uploadResult.asset_ids
 * })
 *
 * if (result.success) {
 *   console.log(result.response.status)  // "success"
 *   console.log(result.response.result)  // { ...agent's data }
 * }
 * ```
 */
export async function callAIAgent(
  message: string,
  agent_id: string,
  options?: { user_id?: string; session_id?: string; assets?: string[] }
): Promise<AIAgentResponse> {
  const user_id = options?.user_id || `user-${generateUUID()}`
  const session_id = options?.session_id || `${agent_id}-${generateUUID().substring(0, 12)}`

  // Build request payload
  const payload: Record<string, any> = {
    message,
    agent_id,
    user_id,
    session_id,
  }

  // Add assets if provided (file attachments from uploadFiles)
  if (options?.assets && options.assets.length > 0) {
    payload.assets = options.assets
  }

  try {
    const response = await fetch(LYZR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LYZR_API_KEY,
      },
      body: JSON.stringify(payload),
    })

    const rawText = await response.text()

    if (response.ok) {
      // Parse with bulletproof JSON parser
      const parsed = parseLLMJson(rawText)

      // Check for parser error
      if (parsed?.success === false && parsed?.error) {
        return {
          success: false,
          response: {
            status: 'error',
            result: {},
            message: parsed.error
          },
          error: parsed.error,
          raw_response: rawText,
        }
      }

      // Normalize to guaranteed structure
      const normalized = normalizeResponse(parsed)

      return {
        success: true,
        response: normalized,
        agent_id,
        user_id,
        session_id,
        timestamp: new Date().toISOString(),
        raw_response: rawText,
      }
    } else {
      // API error
      let errorMsg = `API returned status ${response.status}`
      try {
        const errorData = parseLLMJson(rawText) || JSON.parse(rawText)
        errorMsg = errorData?.error || errorData?.message || errorMsg
      } catch {}

      return {
        success: false,
        response: {
          status: 'error',
          result: {},
          message: errorMsg
        },
        error: errorMsg,
        raw_response: rawText,
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Network error'
    return {
      success: false,
      response: {
        status: 'error',
        result: {},
        message: errorMsg
      },
      error: errorMsg,
      details: error instanceof Error ? error.stack : String(error),
    }
  }
}

// =============================================================================
// React Hook
// =============================================================================

/**
 * React hook for using AI Agent in components
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { callAgent, loading, error, response } = useAIAgent()
 *
 *   const handleClick = async () => {
 *     await callAgent('Hello', 'agent-id')
 *   }
 *
 *   return (
 *     <div>
 *       <button onClick={handleClick} disabled={loading}>Ask AI</button>
 *       {loading && <p>Loading...</p>}
 *       {error && <p>Error: {error}</p>}
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
export function useAIAgent() {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [response, setResponse] = React.useState<NormalizedAgentResponse | null>(null)

  const callAgent = async (
    message: string,
    agent_id: string,
    options?: { user_id?: string; session_id?: string; assets?: string[] }
  ) => {
    setLoading(true)
    setError(null)
    setResponse(null)

    const result = await callAIAgent(message, agent_id, options)

    if (result.success) {
      setResponse(result.response)
    } else {
      setError(result.error || 'Unknown error')
      setResponse(result.response) // Still set response for error details
    }

    setLoading(false)
    return result
  }

  return {
    callAgent,
    loading,
    error,
    response,
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract text from agent response (handles various formats)
 */
export function extractText(response: NormalizedAgentResponse): string {
  if (response.message) return response.message
  if (response.result?.text) return response.result.text
  if (response.result?.message) return response.result.message
  if (response.result?.answer) return response.result.answer
  if (response.result?.answer_text) return response.result.answer_text
  if (typeof response.result === 'string') return response.result
  return ''
}

/**
 * Generate a commit message from code changes
 */
export async function generateCommitMessage(changes: string, agent_id: string): Promise<string> {
  const result = await callAIAgent(
    `Generate a concise git commit message for these changes:\n\n${changes}\n\nRequirements:\n- One line summary (max 72 chars)\n- Present tense\n- No quotes`,
    agent_id
  )
  return result.success ? extractText(result.response) || 'Update' : 'Update'
}

/**
 * Ask for code explanation
 */
export async function explainCode(code: string, agent_id: string): Promise<string> {
  const result = await callAIAgent(`Explain this code in simple terms:\n\n${code}`, agent_id)
  return result.success ? extractText(result.response) : ''
}

/**
 * Get code suggestions
 */
export async function getSuggestions(code: string, agent_id: string): Promise<string[]> {
  const result = await callAIAgent(
    `Suggest improvements for this code:\n\n${code}\n\nProvide 3-5 specific suggestions.`,
    agent_id
  )
  const text = result.success ? extractText(result.response) : ''
  return text.split('\n').filter((line: string) => line.trim().length > 0)
}

/**
 * Generate documentation
 */
export async function generateDocs(code: string, agent_id: string): Promise<string> {
  const result = await callAIAgent(`Generate JSDoc documentation for this code:\n\n${code}`, agent_id)
  return result.success ? extractText(result.response) : ''
}

// =============================================================================
// File Upload API
// =============================================================================

const LYZR_UPLOAD_URL = 'https://agent-prod.studio.lyzr.ai/v3/assets/upload'

/**
 * Upload result for a single file
 */
export interface UploadedFile {
  asset_id: string
  file_name: string
  success: boolean
  error?: string
}

/**
 * Full response from uploadFiles
 */
export interface UploadResponse {
  /** Whether the upload succeeded */
  success: boolean
  /** Array of asset IDs for use with callAIAgent */
  asset_ids: string[]
  /** Details for each uploaded file */
  files: UploadedFile[]
  /** Total files attempted */
  total_files: number
  /** Number of successful uploads */
  successful_uploads: number
  /** Number of failed uploads */
  failed_uploads: number
  /** Human-readable message */
  message: string
  /** Timestamp */
  timestamp: string
  /** Error message if success is false */
  error?: string
}

/**
 * Upload files to Lyzr asset storage
 *
 * Returns asset_ids that can be passed to callAIAgent via the assets parameter.
 *
 * @param files - File or array of Files to upload
 * @returns Promise with upload response containing asset_ids
 *
 * @example
 * ```tsx
 * // Single file upload
 * const result = await uploadFiles(file)
 * if (result.success) {
 *   // Use asset_ids with agent
 *   const agentResult = await callAIAgent('Analyze this document', agentId, {
 *     assets: result.asset_ids
 *   })
 * }
 *
 * // Multiple files
 * const result = await uploadFiles([file1, file2])
 * console.log(result.asset_ids) // ['uuid1', 'uuid2']
 * ```
 */
export async function uploadFiles(files: File | File[]): Promise<UploadResponse> {
  const fileArray = Array.isArray(files) ? files : [files]

  if (fileArray.length === 0) {
    return {
      success: false,
      asset_ids: [],
      files: [],
      total_files: 0,
      successful_uploads: 0,
      failed_uploads: 0,
      message: 'No files provided',
      timestamp: new Date().toISOString(),
      error: 'No files provided',
    }
  }

  if (!LYZR_API_KEY) {
    return {
      success: false,
      asset_ids: [],
      files: [],
      total_files: fileArray.length,
      successful_uploads: 0,
      failed_uploads: fileArray.length,
      message: 'VITE_LYZR_API_KEY not configured',
      timestamp: new Date().toISOString(),
      error: 'VITE_LYZR_API_KEY not configured in environment',
    }
  }

  try {
    const formData = new FormData()
    for (const file of fileArray) {
      formData.append('files', file, file.name)
    }

    const response = await fetch(LYZR_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'x-api-key': LYZR_API_KEY,
        // Don't set Content-Type - let fetch set it with boundary for multipart
      },
      body: formData,
    })

    if (response.ok) {
      const data = await response.json()

      // Extract asset IDs from response
      const uploadedFiles: UploadedFile[] = (data.results || []).map((r: any) => ({
        asset_id: r.asset_id || '',
        file_name: r.file_name || '',
        success: r.success ?? true,
        error: r.error,
      }))

      const assetIds = uploadedFiles
        .filter((f) => f.success && f.asset_id)
        .map((f) => f.asset_id)

      return {
        success: true,
        asset_ids: assetIds,
        files: uploadedFiles,
        total_files: data.total_files || fileArray.length,
        successful_uploads: data.successful_uploads || assetIds.length,
        failed_uploads: data.failed_uploads || 0,
        message: `Successfully uploaded ${assetIds.length} file(s)`,
        timestamp: new Date().toISOString(),
      }
    } else {
      const errorText = await response.text()
      console.error('Upload API error:', response.status, errorText)

      return {
        success: false,
        asset_ids: [],
        files: [],
        total_files: fileArray.length,
        successful_uploads: 0,
        failed_uploads: fileArray.length,
        message: `Upload failed with status ${response.status}`,
        timestamp: new Date().toISOString(),
        error: errorText,
      }
    }
  } catch (error) {
    console.error('File upload error:', error)

    return {
      success: false,
      asset_ids: [],
      files: [],
      total_files: fileArray.length,
      successful_uploads: 0,
      failed_uploads: fileArray.length,
      message: 'Network error during upload',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * React hook for file uploads
 *
 * @example
 * ```tsx
 * function UploadComponent() {
 *   const { upload, uploading, error, result } = useFileUpload()
 *
 *   const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const file = e.target.files?.[0]
 *     if (file) {
 *       const result = await upload(file)
 *       if (result.success) {
 *         console.log('Asset IDs:', result.asset_ids)
 *       }
 *     }
 *   }
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={handleFileChange} disabled={uploading} />
 *       {uploading && <p>Uploading...</p>}
 *       {error && <p>Error: {error}</p>}
 *       {result && <p>Uploaded: {result.asset_ids.join(', ')}</p>}
 *     </div>
 *   )
 * }
 * ```
 */
export function useFileUpload() {
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<UploadResponse | null>(null)

  const upload = async (files: File | File[]) => {
    setUploading(true)
    setError(null)
    setResult(null)

    const uploadResult = await uploadFiles(files)

    if (uploadResult.success) {
      setResult(uploadResult)
    } else {
      setError(uploadResult.error || 'Upload failed')
      setResult(uploadResult)
    }

    setUploading(false)
    return uploadResult
  }

  return {
    upload,
    uploading,
    error,
    result,
  }
}
