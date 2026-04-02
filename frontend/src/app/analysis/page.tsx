"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { VendorPaymentCard } from "@/components/analysis/VendorPaymentCard"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ShieldCheck,
  Brain,
  ClipboardCheck,
  Play,
  Loader2,
  Info,
  Fingerprint,
  AlertTriangle,
  ScanSearch,
  Microscope,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react"

import { ScoringCard } from "@/components/analysis/ScoringCard"
import { ForensicsCard } from "@/components/analysis/ForensicsCard"
import { AiArtifactCard } from "@/components/analysis/AiArtifactCard"
import { InvoiceHighlightViewer } from "@/components/analysis/InvoiceHighlightViewer"

import type { AnalysisResult } from "@/components/analysis/types"


const API_BASE =
process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

import { normalizeAnalysisResult } from "@/components/analysis/normalize"

type InvoiceSummary = {
  invoice_id: number
  file_name: string
  status: string
  file_hash: string
  is_signed: boolean
  crypto_valid: boolean | null
  signer_fingerprint: string | null
  created_at: string
}

type Highlight = {
  bbox: [number, number, number, number] | null
  type: string
  confidence: number
  source: string
  message: string
  color?: "red" | "amber" | "blue" | "coral" | string
}

// Per-layer score breakdown from the calibrated forensics engine
type ForensicLayerScore = {
  score: number
  confidence: number
  triggered: boolean
}

// type AnalysisResult = {
//   invoice_id: number
//   file_type: string

//   crypto: {
//     signature_present: boolean
//     signature_integrity: string
//     certificate_trust: string
//     signer_fingerprint: string | null
//     vendor_status?: string
//     signer_identity?: string
//   }

//   ai: {
//     status: string
//     message?: string
//     anomaly_score?: number
//     risk_level?: string
//     review_required?: boolean
//     embedding_distance?: number
//     distance_z_score?: number
//     explanations?: string[]
//   }

//   rules: {
//     status: string
//     message?: string
//     word_count?: number
//     font_count?: number
//     fonts?: string[]
//     line_item_count?: number
//     line_item_sum?: number | null
//     subtotal?: number | null
//     tax?: number | null
//     total?: number | null
//     checks?: {
//       subtotal_matches_items?: boolean | null
//       subtotal_delta?: number | null
//       total_matches_subtotal_tax?: boolean | null
//       total_delta?: number | null
//     }
//   }

//   vendor_identity?: {
//     status: string
//     vendor_name?: string
//   }

//   vendor_bank?: {
//     bank_account_detected?: boolean
//     status?: string
//     masked_account?: string
//     bank_name?: string
//     verification_status?: string
//     vendor_identity_status?: string
//     country?: string | null
//     account_type?: string | null
//   }

//   issuer_payee_binding?: {
//     status?: string
//     flags?: string[]
//     vendor_name?: string
//   }

//   external_verification?: {
//     success?: boolean
//     bank_name?: string
//     bic?: string
//     country?: string
//     confidence?: string
//   }

//   semantic?: {
//     vendor_name?: string | null
//     customer_name?: string | null
//     invoice_date?: string | null
//     invoice_number?: string | null
//     subtotal?: string | number | null
//     tax?: string | number | null
//     total_amount?: string | number | null
//     currency?: string | null
//     bank_name?: string | null
//     bank_account?: string | null
//   }

//   semantic_vendor_name?: string | null
//   semantic_customer_name?: string | null
//   semantic_invoice_date?: string | null
//   semantic_invoice_number?: string | null
//   semantic_subtotal?: string | null
//   semantic_tax?: string | null
//   semantic_total_amount?: string | null
//   semantic_currency?: string | null
//   semantic_bank_name?: string | null
//   semantic_bank_account?: string | null

//   preview?: {
//     image_path: string
//     width: number
//     height: number
//     page?: number
//     total_pages?: number
//     dpi?: number | null
//     source_type?: string
//     loader?: string
//   }

//   highlights?: Highlight[]
//   spatial_highlights?: Highlight[]
//   document_highlights?: Highlight[]

//   highlight_summary?: {
//     total: number
//     spatial_count: number
//     document_count: number
//     top_confidence: number
//     sources?: string[]
//   }

//   forensics?: {
//     status: string
//     risk_level?: string
//     forensic_score?: number
//     // Cross-signal boost reasons from the calibrated engine
//     risk_reasons?: string[]
//     // Input quality from _assess_input_quality
//     input_quality?: number
//     quality_warnings?: string[]
//     advanced_used?: boolean
//     // Flat per-layer scores (for score bars)
//     metadata_score?: number
//     ela_score?: number
//     noise_score?: number
//     dct_score?: number
//     copy_move_score?: number
//     font_score?: number
//     text_region_score?: number
//     // Full layer breakdown with confidence + triggered flag
//     layer_scores?: Record<string, ForensicLayerScore>
//     image_analyzed?: boolean
//     image_reason?: string
//     signals?: {
//       type: string
//       message: string
//       confidence: number
//     }[]
//   }

//   ai_artifact?: {
//     status: string
//     ai_text_score: number
//     risk_level?: string
//     reasoning?: string
//     perplexity_risk?: number
//     burstiness_risk?: number
//     repetition_score?: number
//     signals?: {
//       type: string
//       message: string
//       confidence?: number
//     }[]
//     reason?: string
//   }

//   scoring?: {
//     fraud_score: number
//     risk_level: string
//     prediction: number
//     model_version: string
//     score_breakdown?: Record<string, number>
//     weights_used?: Record<string, number>
//   }

//   fraud_flags?: {
//     rule_code: string
//     message: string
//   }[]
// }

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function displayValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "N/A"
  return String(value)
}

function resolvePreviewUrl(path?: string | null): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path

  const base = API_BASE.replace(/\/$/, "")
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`
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

function StatusPill({
  status,
  label,
}: {
  status: "success" | "warning" | "danger"
  label: string
}) {
  const styles = {
    success: "bg-primary/10 text-primary",
    warning: "bg-accent/20 text-accent-foreground",
    danger: "bg-destructive/10 text-destructive",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styles[status]}`}
    >
      {label}
    </span>
  )
}

function EmptyCard({
  icon: Icon,
  title,
}: {
  icon: React.ElementType
  title: string
}) {
  return (
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{title}</p>
      </CardContent>
    </Card>
  )
}

// Added "critical" level support to match the 4-level risk from calibrated engine
function RiskPill({ level }: { level?: string }) {
  if (!level) return null

  const normalized = level.toLowerCase()

  if (normalized.includes("critical")) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-200 px-2.5 py-0.5 text-xs font-semibold text-red-900 dark:bg-red-500/30 dark:text-red-300">
        Critical
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

  if (normalized.includes("medium")) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
        Medium risk
      </span>
    )
  }

  if (normalized.includes("low")) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
        Low risk
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      {level}
    </span>
  )
}

function ScoreBar({
  label,
  score,
  invert = false,
  triggered,
}: {
  label: string
  score?: number
  invert?: boolean
  triggered?: boolean
}) {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    if (score === undefined || score === null) return

    const end = Math.min(Math.max(score * 100, 0), 100)
    const startTime = performance.now()

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / 900, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimated(end * eased)
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [score])

  if (score === undefined || score === null) return null

  const pct = animated
  const color = invert
    ? pct >= 70
      ? "bg-red-500"
      : pct >= 40
        ? "bg-amber-500"
        : "bg-emerald-500"
    : pct >= 70
      ? "bg-emerald-500"
      : pct >= 40
        ? "bg-amber-500"
        : "bg-red-500"

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {triggered && (
            <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              triggered
            </span>
          )}
          <span className="text-sm font-semibold text-foreground">
            {(pct / 100).toFixed(2)}
          </span>
        </div>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function AnomalyScoreBar({ score }: { score?: number }) {
  return <ScoreBar label="Anomaly score" score={score} invert={false} />
}

function CryptoTrustBar({ trust }: { trust?: string }) {
  const [animatedValue, setAnimatedValue] = useState(0)
  const normalized = trust?.toLowerCase() ?? ""

  let target: number | null = null

  if (normalized.includes("trusted")) target = 95
  else if (normalized.includes("valid")) target = 85
  else if (normalized.includes("warning")) target = 60
  else if (normalized.includes("untrusted")) target = 30
  else if (normalized.includes("invalid")) target = 15

  useEffect(() => {
    if (target === null) return

    const duration = 800
    const startTime = performance.now()

    function animate(time: number) {
      const progress = Math.min((time - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedValue(target! * eased)
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [target])

  if (target === null) return null

  const color =
    target >= 80
      ? "bg-emerald-500"
      : target >= 50
        ? "bg-amber-500"
        : "bg-red-500"

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Certificate trust level
        </span>
        <span className="text-sm font-semibold text-foreground">
          {target}%
        </span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${animatedValue}%` }}
        />
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <Card className="h-full border-0 bg-card/65 shadow-sm backdrop-blur-xl">
      <CardContent className="flex h-full flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>

        <div className="space-y-3">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-4/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/6 animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Highlight styles                                                  */
/* ------------------------------------------------------------------ */

const HIGHLIGHT_STYLES: Record<
  string,
  { border: string; bg: string; dot: string; label: string }
> = {
  red: {
    border: "border-red-500/70",
    bg: "bg-red-500/10",
    dot: "bg-red-500",
    label: "bg-red-500 text-white",
  },
  amber: {
    border: "border-amber-500/70",
    bg: "bg-amber-500/10",
    dot: "bg-amber-500",
    label: "bg-amber-600 text-white",
  },
  blue: {
    border: "border-blue-500/65",
    bg: "bg-blue-500/10",
    dot: "bg-blue-500",
    label: "bg-blue-700 text-white",
  },
  coral: {
    border: "border-orange-600/65",
    bg: "bg-orange-500/10",
    dot: "bg-orange-600",
    label: "bg-orange-700 text-white",
  },
}

function getHighlightStyle(color?: string) {
  return HIGHLIGHT_STYLES[color || "blue"] ?? HIGHLIGHT_STYLES.blue
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

export default function AnalysisPage() {
  const searchParams = useSearchParams()
  const presetId = searchParams.get("invoiceId")
  const autoRun = searchParams.get("run") === "1"

  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [selectedId, setSelectedId] = useState<string>(presetId ?? "")
  const [status, setStatus] = useState("")
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [autoRunTriggered, setAutoRunTriggered] = useState(false)

  const canAnalyze = useMemo(() => selectedId.trim().length > 0, [selectedId])

  useEffect(() => {
    const loadInvoices = async () => {
      try {
        const response = await fetch(`${API_BASE}/invoices/`, {
          credentials: "include",
        })
        if (!response.ok) throw new Error("Unable to load invoices")
        const data = (await response.json()) as InvoiceSummary[]
        setInvoices(data)
      } catch {
        setStatus("Unable to fetch invoices from the API.")
      }
    }

    loadInvoices()
  }, [])

  useEffect(() => {
    if (presetId) setSelectedId(presetId)
  }, [presetId])

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze) {
      setStatus("Select or enter an invoice ID to analyze.")
      return
    }

    try {
      setIsRunning(true)
      setStatus("Running analysis...")
      setResult(null)

      const response = await fetch(`${API_BASE}/invoices/${selectedId}/analyze`, {
        method: "POST",
        credentials: "include",
      })

      let data: AnalysisResult | null = null
      try {
        data = (await response.json()) as AnalysisResult
      } catch {
        data = null
      }

      if (response.status === 401) {
        setStatus("Session expired. Please log in again.")
        setIsRunning(false)
        return
      }

      if (!response.ok) {
        setStatus(data?.ai?.message ?? "Analysis failed.")
        setIsRunning(false)
        return
      }

      setResult(data)
      console.log("VeriPay Analysis Response:", data)
      setStatus("Analysis complete.")
      setIsRunning(false)
    } catch {
      setStatus("Unable to reach the API.")
      setIsRunning(false)
    }
  }, [canAnalyze, selectedId])

  useEffect(() => {
    if (!autoRun || autoRunTriggered || !selectedId) return
    setAutoRunTriggered(true)
    void handleAnalyze()
  }, [autoRun, autoRunTriggered, selectedId, handleAnalyze])

  const aiStatusPill = () => {
    if (!result) return null
    if (result.ai.status === "ok") {
      return <StatusPill status="success" label="Complete" />
    }
    if (result.ai.status === "skipped") {
      return <StatusPill status="warning" label="Not applicable" />
    }
    return <StatusPill status="danger" label="Failed" />
  }

  return (
    <div className="relative flex flex-col gap-8">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-3xl" />

      <section className="relative flex flex-col gap-3 overflow-hidden rounded-2xl px-6 py-8">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent dark:from-primary/10" />
          <div className="absolute -top-24 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl opacity-40 dark:opacity-60" />
        </div>

        <Badge
          variant="secondary"
          className="w-fit text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Analysis
        </Badge>

        <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground lg:text-4xl">
          Analyze uploaded invoices.
        </h1>

        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Select an invoice, run crypto verification, forensic analysis, and AI fraud
          scoring in one place.
        </p>
      </section>

      <Card className="h-full border-0 bg-card/65 shadow-sm backdrop-blur-xl">
        <CardContent className="flex flex-col gap-5 p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="invoiceId"
                className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Invoice ID
              </Label>
              <Input
                id="invoiceId"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                placeholder="Enter invoice ID"
                className="bg-background/50"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label
                htmlFor="invoiceList"
                className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Choose from uploads
              </Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger id="invoiceList" className="bg-background/50">
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((inv) => (
                    <SelectItem key={inv.invoice_id} value={String(inv.invoice_id)}>
                      {inv.file_name ?? `Invoice #${inv.invoice_id}`} ·{" "}
                      {inv.created_at?.slice(0, 10)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={handleAnalyze}
              disabled={!canAnalyze || isRunning}
              className="gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run analysis
                </>
              )}
            </Button>

            <span className="text-xs text-muted-foreground">
              PDF invoices include full AI scoring. Image invoices still render
              preview, forensics, and highlights.
            </span>
          </div>

          {selectedId && (
            <p className="text-xs text-muted-foreground">
              Selected invoice:{" "}
              <span className="font-mono font-medium text-foreground">
                #{selectedId}
              </span>
            </p>
          )}

          {status && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              {status}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="relative min-h-[420px]">
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${isRunning ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
        >
          <div className="grid gap-6 lg:grid-cols-3 items-stretch">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>

        <div
          className={`transition-opacity duration-500 ${!isRunning ? "opacity-100" : "opacity-0"
            }`}
        >
          {result ? (
            <div className="flex flex-col gap-6">
              {(result.preview?.image_path ||
                result.forensics ||
                (result.highlights && result.highlights.length > 0) ||
                (result.spatial_highlights && result.spatial_highlights.length > 0)) && (
                  <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in duration-500">
                    <CardContent className="flex h-full flex-col gap-4 p-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                          <ScanSearch className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="text-sm font-semibold text-foreground">
                          Invoice review — detected signals
                        </h3>
                        <RiskPill level={result.scoring?.risk_level} />
                      </div>

                      <InvoiceHighlightViewer
                        key={`${result.invoice_id}:${result.preview?.image_path ?? "no-preview"}:${result.highlight_summary?.total ?? 0}`}
                        result={result}
                      />
                    </CardContent>
                  </Card>
                )}

              <div className="grid gap-6 lg:grid-cols-3 items-stretch">
                <ScoringCard scoring={result.scoring} />
                <ForensicsCard forensics={result.forensics} />
                <AiArtifactCard artifact={result.ai_artifact} />
              </div>

              <div className="grid gap-6 lg:grid-cols-3 items-stretch">
                <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500 delay-75">
                  <CardContent className="flex h-full flex-col gap-4 p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Cryptographic verification
                      </h3>
                    </div>

                    <div className="divide-y divide-border/40">
                      <MetricRow
                        label="Signature present"
                        value={displayValue(result.crypto.signature_present)}
                      />
                      <MetricRow
                        label="Signature integrity"
                        value={displayValue(result.crypto.signature_integrity)}
                      />
                      {result.crypto.signature_present &&
                        result.crypto.signature_integrity === "valid" &&
                        result.crypto.certificate_trust && (
                          <CryptoTrustBar trust={result.crypto.certificate_trust} />
                        )}
                      <MetricRow
                        label="Certificate trust"
                        value={displayValue(result.crypto.certificate_trust)}
                      />
                    </div>

                    {result.crypto.signer_fingerprint && (
                      <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2">
                        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          <Fingerprint className="h-3 w-3" />
                          Signer fingerprint
                        </span>
                        <span className="truncate font-mono text-xs text-foreground">
                          {result.crypto.signer_fingerprint}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <VendorPaymentCard
                  vendor_bank={result.vendor_bank}
                  external_verification={result.external_verification}
                />

                <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500 delay-200">
                  <CardContent className="flex h-full flex-col gap-4 p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                        <Info className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Semantic extraction (AI)
                      </h3>
                    </div>

                    <div className="divide-y divide-border/40">
                      <MetricRow
                        label="Vendor name"
                        value={displayValue(
                          result.semantic_vendor_name ?? result.semantic?.vendor_name
                        )}
                      />
                      <MetricRow
                        label="Customer name"
                        value={displayValue(
                          result.semantic_customer_name ??
                          result.semantic?.customer_name
                        )}
                      />
                      <MetricRow
                        label="Invoice number"
                        value={displayValue(
                          result.semantic_invoice_number ??
                          result.semantic?.invoice_number
                        )}
                      />
                      <MetricRow
                        label="Invoice date"
                        value={displayValue(
                          result.semantic_invoice_date ?? result.semantic?.invoice_date
                        )}
                      />
                      <MetricRow
                        label="Bank name"
                        value={displayValue(
                          result.semantic_bank_name ?? result.semantic?.bank_name
                        )}
                      />
                      <MetricRow
                        label="Bank account"
                        value={displayValue(
                          result.semantic_bank_account ?? result.semantic?.bank_account
                        )}
                      />
                      <MetricRow
                        label="Subtotal"
                        value={displayValue(
                          result.semantic_subtotal ?? result.semantic?.subtotal
                        )}
                      />
                      <MetricRow
                        label="Tax"
                        value={displayValue(
                          result.semantic_tax ?? result.semantic?.tax
                        )}
                      />
                      <MetricRow
                        label="Total amount"
                        value={displayValue(
                          result.semantic_total_amount ??
                          result.semantic?.total_amount
                        )}
                      />
                      <MetricRow
                        label="Currency"
                        value={displayValue(
                          result.semantic_currency ?? result.semantic?.currency
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500 delay-150">
                  <CardContent className="flex h-full flex-col gap-4 p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                        <Brain className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          AI anomaly analysis
                        </h3>
                        {aiStatusPill()}
                      </div>
                    </div>

                    {result.ai.status !== "ok" ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {result.ai.message ??
                          "AI analysis did not return a usable result."}
                      </p>
                    ) : (
                      <div className="divide-y divide-border/40">
                        {typeof result.ai.anomaly_score === "number" &&
                          result.ai.anomaly_score >= 0 &&
                          result.ai.anomaly_score <= 1 && (
                            <AnomalyScoreBar score={result.ai.anomaly_score} />
                          )}

                        <div className="flex items-center justify-between py-2">
                          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Risk level
                          </span>
                          <RiskPill level={result.ai.risk_level} />
                        </div>

                        <MetricRow
                          label="Review required"
                          value={displayValue(result.ai.review_required)}
                        />
                        <MetricRow
                          label="Embedding distance"
                          value={displayValue(result.ai.embedding_distance)}
                        />
                        <MetricRow
                          label="Distance z-score"
                          value={displayValue(result.ai.distance_z_score)}
                        />
                      </div>
                    )}

                    {result.ai.explanations?.length ? (
                      <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2">
                        {result.ai.explanations.map((note, idx) => (
                          <li
                            key={`${idx}-${note}`}
                            className="text-xs leading-relaxed text-muted-foreground"
                          >
                            &bull; {note}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500 delay-300">
                  <CardContent className="flex h-full flex-col gap-4 p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Rule-based checks
                      </h3>
                    </div>

                    {result.rules.status !== "ok" && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {result.rules.message ??
                          `Rules status: ${result.rules.status}`}
                      </p>
                    )}

                    <div className="divide-y divide-border/40">
                      <MetricRow
                        label="Word count"
                        value={displayValue(result.rules.word_count)}
                      />
                      <MetricRow
                        label="Font count"
                        value={displayValue(result.rules.font_count)}
                      />
                      <MetricRow
                        label="Line items"
                        value={displayValue(result.rules.line_item_count)}
                      />
                      <MetricRow
                        label="Line item sum"
                        value={displayValue(result.rules.line_item_sum)}
                      />
                      <MetricRow
                        label="Subtotal"
                        value={displayValue(result.rules.subtotal)}
                      />
                      <MetricRow
                        label="Tax"
                        value={displayValue(result.rules.tax)}
                      />
                      <MetricRow
                        label="Total"
                        value={displayValue(result.rules.total)}
                      />
                    </div>

                    {result.rules.checks && (
                      <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2">
                        <li className="text-xs text-muted-foreground">
                          Subtotal vs items:{" "}
                          <span className="font-medium text-foreground">
                            {displayValue(result.rules.checks.subtotal_matches_items)}
                          </span>
                        </li>
                        <li className="text-xs text-muted-foreground">
                          Total vs subtotal+tax:{" "}
                          <span className="font-medium text-foreground">
                            {displayValue(
                              result.rules.checks.total_matches_subtotal_tax
                            )}
                          </span>
                        </li>
                        <li className="text-xs text-muted-foreground">
                          Subtotal delta:{" "}
                          <span className="font-medium text-foreground">
                            {displayValue(result.rules.checks.subtotal_delta)}
                          </span>
                        </li>
                        <li className="text-xs text-muted-foreground">
                          Total delta:{" "}
                          <span className="font-medium text-foreground">
                            {displayValue(result.rules.checks.total_delta)}
                          </span>
                        </li>
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3 items-stretch">
              <EmptyCard
                icon={ShieldCheck}
                title="Cryptographic verification results will appear here."
              />
              <EmptyCard
                icon={Brain}
                title="AI anomaly analysis results will appear here."
              />
              <EmptyCard
                icon={ClipboardCheck}
                title="Rule-based check results will appear here."
              />
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        API endpoint:{" "}
        <span className="font-mono font-medium text-foreground">
          {API_BASE}
        </span>
      </p>
    </div>
  )
}