/**
 * RAG Knowledge Base Utility
 *
 * Direct wrapper for managing Lyzr RAG Knowledge Base (Vite-compatible)
 *
 * SUPPORTED FILE TYPES:
 * - PDF (.pdf) - application/pdf
 * - DOCX (.docx) - application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * - TXT (.txt) - text/plain
 *
 * @example
 * ```tsx
 * import { getDocuments, uploadAndTrainDocument, deleteDocuments } from '@/utils/ragKnowledgeBase'
 *
 * // Get all documents in a knowledge base
 * const docs = await getDocuments('your-rag-id')
 *
 * // Upload and train a document
 * const result = await uploadAndTrainDocument('your-rag-id', file)
 *
 * // Delete documents from knowledge base
 * await deleteDocuments('your-rag-id', ['document1.pdf', 'document2.txt'])
 * ```
 */

import { useState } from 'react'

// =============================================================================
// Configuration
// =============================================================================

const LYZR_RAG_BASE_URL = 'https://rag-prod.studio.lyzr.ai/v3'
const LYZR_API_KEY = import.meta.env.VITE_LYZR_API_KEY || ''

// Supported file types with their parsers
const FILE_TYPE_CONFIG: Record<string, { type: 'pdf' | 'docx' | 'txt'; parser: string }> = {
  'application/pdf': { type: 'pdf', parser: 'pypdf' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { type: 'docx', parser: 'docx2txt' },
  'text/plain': { type: 'txt', parser: 'txt_parser' },
}

// =============================================================================
// Types
// =============================================================================

/**
 * Supported file MIME types for RAG knowledge base
 */
export const SUPPORTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const

export type SupportedFileType = typeof SUPPORTED_FILE_TYPES[number]

/**
 * File extension to MIME type mapping
 */
export const FILE_EXTENSION_MAP: Record<string, SupportedFileType> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
}

export interface RAGDocument {
  id?: string
  fileName: string
  fileType: 'pdf' | 'docx' | 'txt'
  fileSize?: number
  status?: 'processing' | 'active' | 'failed' | 'deleted'
  uploadedAt?: string
  documentCount?: number
}

export interface GetDocumentsResponse {
  success: boolean
  documents?: RAGDocument[]
  ragId?: string
  error?: string
  details?: string
  timestamp?: string
}

export interface UploadResponse {
  success: boolean
  message?: string
  fileName?: string
  fileType?: string
  documentId?: string
  documentCount?: number
  ragId?: string
  error?: string
  details?: string
  timestamp?: string
}

export interface DeleteResponse {
  success: boolean
  message?: string
  deletedCount?: number
  ragId?: string
  error?: string
  details?: string
  timestamp?: string
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a file type is supported for RAG upload
 */
export function isFileTypeSupported(fileType: string): fileType is SupportedFileType {
  return SUPPORTED_FILE_TYPES.includes(fileType as SupportedFileType)
}

/**
 * Get file type enum from MIME type
 */
export function getFileTypeFromMime(mimeType: string): 'pdf' | 'docx' | 'txt' | null {
  switch (mimeType) {
    case 'application/pdf':
      return 'pdf'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx'
    case 'text/plain':
      return 'txt'
    default:
      return null
  }
}

/**
 * Validate a file before upload
 */
export function validateFile(file: File): { isValid: boolean; error?: string } {
  if (!isFileTypeSupported(file.type)) {
    return {
      isValid: false,
      error: `Unsupported file type: ${file.type}. Only PDF, DOCX, and TXT files are supported.`,
    }
  }
  return { isValid: true }
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get all documents in a RAG knowledge base
 *
 * @param ragId - RAG Knowledge Base ID (required)
 * @returns Promise with list of documents
 *
 * @example
 * ```tsx
 * const result = await getDocuments('68eba8c8bc2960ccbdf1b1a0')
 * if (result.success) {
 *   result.documents?.forEach(doc => console.log(doc.fileName))
 * }
 * ```
 */
export async function getDocuments(ragId: string): Promise<GetDocumentsResponse> {
  try {
    if (!ragId) {
      return { success: false, error: 'ragId is required' }
    }

    if (!LYZR_API_KEY) {
      return { success: false, error: 'VITE_LYZR_API_KEY not configured' }
    }

    const response = await fetch(`${LYZR_RAG_BASE_URL}/rag/documents/${ragId}/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-api-key': LYZR_API_KEY,
      },
    })

    // Return empty array for 404 (no documents yet)
    if (response.status === 404) {
      return { success: true, documents: [], ragId }
    }

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `Failed to fetch documents: ${response.statusText}`,
        details: errorText,
      }
    }

    const rawDocuments = await response.json()

    // Transform string array to RAGDocument objects
    // API returns: ["storage/filename.pdf", "storage/other.txt"]
    const documents: RAGDocument[] = Array.isArray(rawDocuments)
      ? rawDocuments.map((docPath: string) => {
        const fileName = docPath.startsWith('storage/')
          ? docPath.slice(8)
          : docPath

        const ext = fileName.split('.').pop()?.toLowerCase() || ''
        let fileType: 'pdf' | 'docx' | 'txt' = 'txt'
        if (ext === 'pdf') fileType = 'pdf'
        else if (ext === 'docx') fileType = 'docx'

        return {
          fileName,
          fileType,
          status: 'active' as const,
        }
      })
      : []

    return {
      success: true,
      documents,
      ragId,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Get documents failed:', error)
    return {
      success: false,
      error: 'Failed to get documents',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Upload and train a document to RAG knowledge base
 *
 * Process:
 * 1. Validate file type
 * 2. Parse document using Lyzr Parse API (extracts text chunks)
 * 3. Train knowledge base with parsed document chunks
 *
 * @param ragId - RAG Knowledge Base ID (required)
 * @param file - File to upload (PDF, DOCX, or TXT)
 * @returns Promise with upload result
 *
 * @example
 * ```tsx
 * const result = await uploadAndTrainDocument('68eba8c8bc2960ccbdf1b1a0', file)
 * if (result.success) {
 *   console.log('Chunks created:', result.documentCount)
 * }
 * ```
 */
export async function uploadAndTrainDocument(
  ragId: string,
  file: File
): Promise<UploadResponse> {
  try {
    if (!ragId) {
      return { success: false, error: 'ragId is required' }
    }

    if (!LYZR_API_KEY) {
      return { success: false, error: 'VITE_LYZR_API_KEY not configured' }
    }

    // Validate file
    const validation = validateFile(file)
    if (!validation.isValid) {
      return { success: false, error: validation.error }
    }

    const fileConfig = FILE_TYPE_CONFIG[file.type]
    if (!fileConfig) {
      return { success: false, error: `Unsupported file type: ${file.type}` }
    }

    // STEP 1: Parse document using Lyzr Parse API
    const parseFormData = new FormData()
    parseFormData.append('file', file)
    parseFormData.append('data_parser', fileConfig.parser)
    parseFormData.append('extra_info', '{}')

    // Add chunking parameters for PDF (better RAG performance)
    if (fileConfig.type === 'pdf') {
      parseFormData.append('chunk_size', '1000')
      parseFormData.append('chunk_overlap', '100')
    }

    const parseUrl = `${LYZR_RAG_BASE_URL}/parse/${fileConfig.type}/`

    const parseResponse = await fetch(parseUrl, {
      method: 'POST',
      headers: {
        'x-api-key': LYZR_API_KEY,
      },
      body: parseFormData,
    })

    if (!parseResponse.ok) {
      const errorText = await parseResponse.text()
      return {
        success: false,
        error: `Document parsing failed: ${parseResponse.statusText}`,
        details: errorText,
      }
    }

    const parseResult = await parseResponse.json()

    if (!parseResult.documents || !Array.isArray(parseResult.documents)) {
      return {
        success: false,
        error: 'Invalid response format from document parsing',
      }
    }

    // STEP 2: Train knowledge base with parsed documents
    const trainUrl = `${LYZR_RAG_BASE_URL}/rag/train/${ragId}/`

    const trainResponse = await fetch(trainUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': LYZR_API_KEY,
      },
      body: JSON.stringify(parseResult.documents),
    })

    if (!trainResponse.ok) {
      const errorText = await trainResponse.text()
      return {
        success: false,
        error: `Knowledge base training failed: ${trainResponse.statusText}`,
        details: errorText,
      }
    }

    return {
      success: true,
      message: 'Document uploaded and trained successfully',
      fileName: file.name,
      fileType: fileConfig.type,
      documentCount: parseResult.documents.length,
      ragId,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Upload document failed:', error)
    return {
      success: false,
      error: 'Failed to upload document',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Delete documents from RAG knowledge base
 *
 * @param ragId - RAG Knowledge Base ID (required)
 * @param documents - Array of document file names to delete
 * @returns Promise with delete result
 *
 * @example
 * ```tsx
 * const result = await deleteDocuments('68eba8c8bc2960ccbdf1b1a0', ['report.pdf'])
 * if (result.success) {
 *   console.log('Documents deleted successfully')
 * }
 * ```
 */
export async function deleteDocuments(
  ragId: string,
  documents: string[]
): Promise<DeleteResponse> {
  try {
    if (!ragId) {
      return { success: false, error: 'ragId is required' }
    }

    if (!LYZR_API_KEY) {
      return { success: false, error: 'VITE_LYZR_API_KEY not configured' }
    }

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return { success: false, error: 'documents array is required and must not be empty' }
    }

    // Format documents to include storage/ prefix if not present
    const formattedDocuments = documents.map((doc: string) => {
      if (doc.startsWith('storage/')) {
        return doc
      }
      return `storage/${doc}`
    })

    const deleteUrl = `${LYZR_RAG_BASE_URL}/rag/${ragId}/docs/`

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': LYZR_API_KEY,
      },
      body: JSON.stringify(formattedDocuments),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      return {
        success: false,
        error: `Failed to delete documents: ${response.statusText}`,
        details: errorText,
      }
    }

    return {
      success: true,
      message: 'Documents deleted successfully',
      deletedCount: documents.length,
      ragId,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Delete documents failed:', error)
    return {
      success: false,
      error: 'Failed to delete documents',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}

// =============================================================================
// React Hook
// =============================================================================

/**
 * Hook for using RAG Knowledge Base in React components
 *
 * @example
 * ```tsx
 * function KnowledgeBaseManager() {
 *   const {
 *     documents,
 *     loading,
 *     error,
 *     fetchDocuments,
 *     uploadDocument,
 *     removeDocuments
 *   } = useRAGKnowledgeBase()
 *
 *   useEffect(() => {
 *     fetchDocuments('your-rag-id')
 *   }, [])
 *
 *   return (
 *     <div>
 *       {loading && <p>Loading...</p>}
 *       {documents?.map(doc => <p key={doc.fileName}>{doc.fileName}</p>)}
 *     </div>
 *   )
 * }
 * ```
 */
export function useRAGKnowledgeBase() {
  const [documents, setDocuments] = useState<RAGDocument[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDocuments = async (ragId: string) => {
    setLoading(true)
    setError(null)

    const result = await getDocuments(ragId)

    if (result.success) {
      setDocuments(result.documents || [])
    } else {
      setError(result.error || 'Failed to fetch documents')
    }

    setLoading(false)
    return result
  }

  const uploadDocument = async (ragId: string, file: File) => {
    setLoading(true)
    setError(null)

    const result = await uploadAndTrainDocument(ragId, file)

    if (!result.success) {
      setError(result.error || 'Failed to upload document')
    }

    setLoading(false)
    return result
  }

  const removeDocuments = async (ragId: string, documentNames: string[]) => {
    setLoading(true)
    setError(null)

    const result = await deleteDocuments(ragId, documentNames)

    if (result.success) {
      setDocuments((prev: RAGDocument[] | null) =>
        prev ? prev.filter((doc: RAGDocument) => !documentNames.includes(doc.fileName)) : null
      )
    } else {
      setError(result.error || 'Failed to delete documents')
    }

    setLoading(false)
    return result
  }

  return {
    documents,
    loading,
    error,
    fetchDocuments,
    uploadDocument,
    removeDocuments,
  }
}
