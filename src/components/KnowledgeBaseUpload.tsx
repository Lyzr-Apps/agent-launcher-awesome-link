'use client'

import * as React from 'react'
import { useRAGKnowledgeBase, SUPPORTED_FILE_TYPES, type RAGDocument } from '@/utils/ragKnowledgeBase'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface KnowledgeBaseUploadProps {
  ragId: string
  className?: string
  onUploadSuccess?: (document: { documentId?: string; documentCount?: number }) => void
  onDeleteSuccess?: (fileName: string) => void
}

export function KnowledgeBaseUpload({
  ragId,
  className,
  onUploadSuccess,
  onDeleteSuccess,
}: KnowledgeBaseUploadProps) {
  const {
    documents,
    loading,
    error,
    fetchDocuments,
    uploadDocument,
    removeDocuments,
  } = useRAGKnowledgeBase()

  const [isDragging, setIsDragging] = React.useState(false)
  const [uploadProgress, setUploadProgress] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    fetchDocuments(ragId)
  }, [ragId])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await handleFileUpload(files[0])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await handleFileUpload(files[0])
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileUpload = async (file: File) => {
    if (!SUPPORTED_FILE_TYPES.includes(file.type as typeof SUPPORTED_FILE_TYPES[number])) {
      alert('Unsupported file type. Please upload PDF, DOCX, or TXT files.')
      return
    }

    setUploadProgress(`Uploading ${file.name}...`)

    const result = await uploadDocument(ragId, file)

    if (result.success) {
      setUploadProgress(null)
      await fetchDocuments(ragId)
      onUploadSuccess?.({ documentId: result.documentId, documentCount: result.documentCount })
    } else {
      setUploadProgress(null)
      alert(result.error || 'Upload failed')
    }
  }

  const handleDelete = async (fileName: string) => {
    if (!confirm(`Delete "${fileName}"?`)) return

    const result = await removeDocuments(ragId, [fileName])

    if (result.success) {
      onDeleteSuccess?.(fileName)
    } else {
      alert(result.error || 'Delete failed')
    }
  }

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf':
        return (
          <svg className="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 18h12V6h-4V2H4v16zm8-15.5L14.5 5H12V2.5zM2 0h10l4 4v16H2V0z" />
          </svg>
        )
      case 'docx':
        return (
          <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 18h12V6h-4V2H4v16zm8-15.5L14.5 5H12V2.5zM2 0h10l4 4v16H2V0z" />
          </svg>
        )
      default:
        return (
          <svg className="h-5 w-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 18h12V6h-4V2H4v16zm8-15.5L14.5 5H12V2.5zM2 0h10l4 4v16H2V0z" />
          </svg>
        )
    }
  }

  return (
    <div className={cn('w-full space-y-4', className)}>
      {/* Upload Area */}
      <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
          <svg
            className="mx-auto h-12 w-12 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="mt-2 text-sm text-muted-foreground">
            {uploadProgress || 'Drag & drop or click to upload'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, DOCX, TXT supported
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Document List */}
        {loading && !documents ? (
          <div className="text-center text-sm text-muted-foreground py-4">
            Loading documents...
          </div>
        ) : documents && documents.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Uploaded Documents</h4>
            <div className="divide-y rounded-md border">
              {documents.map((doc: RAGDocument) => (
                <div
                  key={doc.fileName}
                  className="flex items-center justify-between p-3"
                >
                  <div className="flex items-center gap-3">
                    {getFileIcon(doc.fileType)}
                    <div>
                      <p className="text-sm font-medium">{doc.fileName}</p>
                      {doc.documentCount && (
                        <p className="text-xs text-muted-foreground">
                          {doc.documentCount} chunks
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.fileName)}
                    disabled={loading}
                    className="text-destructive hover:text-destructive"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-4">
            No documents uploaded yet
          </div>
        )}
    </div>
  )
}
