"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Brain, ClipboardCheck, Info, AlertTriangle } from "lucide-react"

import { ScoringCard } from "@/components/analysis/ScoringCard"
import { ForensicsCard } from "@/components/analysis/ForensicsCard"
import { AiArtifactCard } from "@/components/analysis/AiArtifactCard"
import { InvoiceHighlightViewer } from "@/components/analysis/InvoiceHighlightViewer"
import { CryptoVerificationCard } from "@/components/analysis/CryptoVerificationCard"
import { VendorPaymentCard } from "@/components/analysis/VendorPaymentCard"

const normalizeResult = (data: AnalysisResult): AnalysisResult => {
  return {
    ...data,
    highlights: data.highlights ?? [],
    spatial_highlights: data.spatial_highlights ?? [],
    document_highlights: data.document_highlights ?? [],
  }
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

import type { AnalysisResult } from "@/components/analysis/types"
import { normalizeAnalysisResult } from "@/components/analysis/normalize"

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

function RiskPill({ level }: { level?: string }) {
  if (!level) return null

  const normalized = level.toLowerCase()

  if (normalized.includes("low")) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
        Low risk
      </span>
    )
  }

  if (normalized.includes("medium")) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
        Medium risk
      </span>
    )
  }

  if (normalized.includes("high")) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-400">
        High risk
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      {level}
    </span>
  )
}

function AnomalyScoreBar({ score }: { score?: number }) {
  if (typeof score !== "number" || score < 0 || score > 1) return null

  const percentage = score * 100

  const color =
    percentage >= 70
      ? "bg-red-500"
      : percentage >= 40
        ? "bg-amber-500"
        : "bg-emerald-500"

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Anomaly score
        </span>
        <span className="text-sm font-semibold text-foreground">
          {score.toFixed(3)}
        </span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

export default function InvoiceAnalysisPage() {
  const params = useParams()
  const id = params.id as string

  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState("")

  useEffect(() => {
    const loadAnalysis = async () => {
      try {
        setLoading(true)
        setStatus("Loading saved analysis...")

        const response = await fetch(
          `${API_BASE}/dashboard/invoice/${id}`,
          { credentials: "include" }
        )

        const data = await response.json()

        if (!response.ok) {
          setStatus(data?.detail ?? "Unable to load analysis.")
          setResult(null)
          return
        }

        if (data.detail) {
          setStatus(data.detail)
          setResult(null)
          return
        }

        setResult(normalizeAnalysisResult(data))
        setStatus("Analysis loaded.")
      } catch {
        setStatus("Unable to reach the API.")
        setResult(null)
      } finally {
        setLoading(false)
      }
    }

    if (id) loadAnalysis()
  }, [id])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-8">
      <section className="relative flex flex-col gap-3 overflow-hidden rounded-2xl px-6 py-8">
        <Badge
          variant="secondary"
          className="w-fit text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Analysis
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground lg:text-4xl">
          Invoice analysis
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Review the stored verification and anomaly analysis for invoice #{id}.
        </p>
      </section>

      {status && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          {status}
        </p>
      )}

      {!result ? (
        <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No saved analysis found for this invoice.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">

          {/* 🔥 Highlight Viewer */}
          {(result.preview?.image_path ||
            result.forensics ||
            result.highlights?.length ||
            result.spatial_highlights?.length) && (
              <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
                <CardContent className="flex flex-col gap-4 p-6">
                  <h3 className="text-sm font-semibold text-foreground">
                    Invoice review — detected signals
                  </h3>

                  <InvoiceHighlightViewer result={result} />
                </CardContent>
              </Card>
            )}

          {/* 🔥 Scoring / Forensics / AI Artifact */}
          <div className="grid gap-6 lg:grid-cols-3">
            <ScoringCard scoring={result.scoring} />
            <ForensicsCard forensics={result.forensics} />
            <AiArtifactCard artifact={result.ai_artifact} />
          </div>

          {/* 🔥 Crypto / Vendor / AI / Rules */}
          <div className="grid gap-6 lg:grid-cols-3">

            {/* Crypto */}
            <CryptoVerificationCard
              crypto={result.crypto}
              showTrustBar
            />

            {/* Vendor */}
            <VendorPaymentCard
              vendor_bank={result.vendor_bank}
              external_verification={result.external_verification}
            />

            {/* AI */}
            <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
              <CardContent className="flex flex-col gap-4 p-6">
                <h3 className="text-sm font-semibold text-foreground">
                  AI anomaly analysis
                </h3>

                {result.ai?.status !== "ok" ? (
                  <p className="text-xs text-muted-foreground">
                    {result.ai?.message ?? "AI analysis not available."}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Risk: {result.ai?.risk_level ?? "N/A"}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Rules */}
            <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
              <CardContent className="flex flex-col gap-4 p-6">
                <h3 className="text-sm font-semibold text-foreground">
                  Rule-based checks
                </h3>

                <p className="text-xs text-muted-foreground">
                  Total: {result.rules?.total ?? "N/A"}
                </p>
              </CardContent>
            </Card>

          </div>

        </div>
      )}
    </div>
  )
}
