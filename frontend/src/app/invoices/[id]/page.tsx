"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Brain, ClipboardCheck, Info, AlertTriangle } from "lucide-react"
import { CryptoVerificationCard } from "@/components/analysis/CryptoVerificationCard"
import { VendorPaymentCard } from "@/components/analysis/VendorPaymentCard"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

type AnalysisResult = {
  invoice_id: number
  file_type: string
  crypto: {
    signature_present: boolean
    signature_integrity: string
    certificate_trust: string
    signer_fingerprint: string | null
    vendor_status?: string
    signer_identity?: string
  }
  ai: {
    status: string
    message?: string
    anomaly_score?: number
    risk_level?: string
    review_required?: boolean
    embedding_distance?: number
    distance_z_score?: number
    explanations?: string[]
  }
  rules: {
    status: string
    message?: string
    word_count?: number
    font_count?: number
    fonts?: string[]
    line_item_count?: number
    line_item_sum?: number | null
    subtotal?: number | null
    tax?: number | null
    total?: number | null
    checks?: {
      subtotal_matches_items?: boolean | null
      subtotal_delta?: number | null
      total_matches_subtotal_tax?: boolean | null
      total_delta?: number | null
    }
  }
  vendor_identity?: {
    status: string
    vendor_name?: string
  }
  vendor_bank?: {
    bank_account_detected: boolean
    status: string
    masked_account?: string
    bank_name?: string
    verification_status?: string
    vendor_identity_status?: string
    country?: string | null
    account_type?: string | null
  }
  external_verification?: {
    success?: boolean
    bank_name?: string
    bic?: string
    country?: string
    confidence?: string
  }
  semantic_vendor_name?: string | null
  semantic_bank_account?: string | null
  semantic_bank_name?: string | null
  semantic_invoice_number?: string | null
  semantic_total_amount?: string | null
  fraud_flags?: {
    rule_code: string
    message: string
  }[]
  confidence?: number
  prediction?: number
  created_at?: string
}

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

        setResult(data)
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
        <div className="grid gap-6 lg:grid-cols-3">
          <CryptoVerificationCard crypto={result.crypto} />

          <VendorPaymentCard
            vendor_bank={result.vendor_bank}
            external_verification={result.external_verification}
          />

          <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
            <CardContent className="flex flex-col gap-4 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <Brain className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  AI anomaly analysis
                </h3>
              </div>

              {result.ai?.status !== "ok" ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {result.ai?.message ?? "AI analysis not available."}
                </p>
              ) : (
                <div className="divide-y divide-border/40">
                  <AnomalyScoreBar score={result.ai?.anomaly_score} />
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Risk level
                    </span>
                    <RiskPill level={result.ai?.risk_level} />
                  </div>
                  <MetricRow
                    label="Review required"
                    value={String(result.ai?.review_required)}
                  />
                  <MetricRow
                    label="Embedding distance"
                    value={String(result.ai?.embedding_distance ?? "N/A")}
                  />
                  <MetricRow
                    label="Distance z-score"
                    value={String(result.ai?.distance_z_score ?? "N/A")}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
            <CardContent className="flex flex-col gap-4 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <ClipboardCheck className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Rule-based checks
                </h3>
              </div>

              <div className="divide-y divide-border/40">
                <MetricRow
                  label="Word count"
                  value={String(result.rules?.word_count ?? "N/A")}
                />
                <MetricRow
                  label="Font count"
                  value={String(result.rules?.font_count ?? "N/A")}
                />
                <MetricRow
                  label="Line items"
                  value={String(result.rules?.line_item_count ?? "N/A")}
                />
                <MetricRow
                  label="Subtotal"
                  value={String(result.rules?.subtotal ?? "N/A")}
                />
                <MetricRow
                  label="Tax"
                  value={String(result.rules?.tax ?? "N/A")}
                />
                <MetricRow
                  label="Total"
                  value={String(result.rules?.total ?? "N/A")}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
