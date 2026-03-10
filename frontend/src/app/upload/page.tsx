"use client"

import React, { useState, useRef, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

import {
  UploadCloud,
  FileText,
  CheckCircle2,
  ArrowRight,
  BarChart3,
} from "lucide-react"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

type UploadResult = {
  invoiceId: string
  fileType: string
  status: string
  fileHash: string
  fileName: string
}

export default function UploadPage() {
  const router = useRouter()

  const [isDragging, setIsDragging] = useState(false)
  const [analyzeImmediately, setAnalyzeImmediately] = useState(true)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)

  const acceptedTypes = ["application/pdf", "image/png", "image/jpeg"]

  const handleFile = useCallback((file: File) => {
    if (!acceptedTypes.includes(file.type)) {
      setError("Only PDF, PNG, and JPG files are allowed.")
      return
    }

    setSelectedFile(file)
    setUploadResult(null)
    setError(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleUpload = useCallback(() => {
    if (!selectedFile) return

    const formData = new FormData()
    formData.append("file", selectedFile)

    setIsUploading(true)
    setProgress(0)

    const xhr = new XMLHttpRequest()

    xhr.open("POST", `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}/invoices/upload`, true)
    xhr.withCredentials = true

    // 🔥 Track progress
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100)
        setProgress(percent)
      }
    }

    xhr.onload = () => {
      setIsUploading(false)

      if (xhr.status === 401) {
        window.location.href = "/login"
        return
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText)

        setUploadResult({
          invoiceId: String(data.invoice_id),
          fileType: String(data.file_type),
          status: String(data.status),
          fileHash: String(data.file_hash),
          fileName: selectedFile.name,
        })
      } else {
        alert("Upload failed.")
      }
    }

    xhr.onerror = () => {
      setIsUploading(false)
      alert("Network error.")
    }

    xhr.send(formData)
  }, [selectedFile])

  return (
    <div className="relative flex flex-col gap-8">

      {/* Glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-3xl" />

      {/* Hero */}
      <section className="relative flex flex-col gap-3">
        <Badge
          variant="secondary"
          className="w-fit text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Upload
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
          Submit an invoice for verification.
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Upload a PDF or image. VeriPay will extract metadata, compute a hash,
          and queue it for anomaly analysis.
        </p>
      </section>

      {/* Upload Zone */}
      {!uploadResult && (
        <div className="flex flex-col gap-6">

          <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
            <CardContent className="p-0">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                }}
                className={`flex w-full min-h-[340px] px-12 py-16 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed transition-colors ${isDragging
                  ? "border-primary/60 bg-primary/[0.04]"
                  : "border-border/50 hover:border-primary/40 hover:bg-primary/[0.02]"
                  }`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <UploadCloud className="h-7 w-7 text-primary" />
                </div>

                {selectedFile ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">
                        {selectedFile.name}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm font-medium text-foreground">
                      Drag & drop invoice here or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Accepted: PDF, PNG, JPG
                    </p>
                  </div>
                )}
              </button>

              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                }}
              />
            </CardContent>
          </Card>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch
                checked={analyzeImmediately}
                onCheckedChange={setAnalyzeImmediately}
              />
              <span className="text-sm font-medium text-foreground">
                Analyze immediately after upload
              </span>
            </label>

            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className="gap-2"
            >
              {isUploading ? (
                <div className="flex w-full flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span>Uploading…</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : (

                <>
                  <UploadCloud className="h-4 w-4" />
                  Upload invoice
                </>
              )}
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      )}
      {uploadResult && (
        <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
          <CardContent className="flex flex-col gap-6 p-6">

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Invoice uploaded successfully
                </p>
                <p className="text-xs text-muted-foreground">
                  {uploadResult.fileName}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <SummaryField label="Invoice ID" value={uploadResult.invoiceId} />
              <SummaryField label="File Type" value={uploadResult.fileType} />
              <SummaryField label="Status" value={uploadResult.status} />
              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase text-muted-foreground">
                  File Hash
                </span>
                <span className="truncate font-mono text-sm text-foreground">
                  {uploadResult.fileHash}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={() =>
                  router.push(
                    `/analysis?invoiceId=${uploadResult.invoiceId}`
                  )
                }
                className="gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Analyze invoice
              </Button>

              <Link href="/analysis">
                <Button variant="outline" className="gap-2 bg-transparent">
                  Go to analysis
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>

              <Button
                variant="ghost"
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={() => setUploadResult(null)}
              >
                Upload another
              </Button>
            </div>

          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  )
}
