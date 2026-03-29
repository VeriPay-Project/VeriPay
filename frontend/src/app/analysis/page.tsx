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

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

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
    bank_account_detected?: boolean
    status?: string
    masked_account?: string
    bank_name?: string
    verification_status?: string
    vendor_identity_status?: string
    country?: string | null
    account_type?: string | null
  }

  issuer_payee_binding?: {
    status?: string
    flags?: string[]
    vendor_name?: string
  }

  external_verification?: {
    success?: boolean
    bank_name?: string
    bic?: string
    country?: string
    confidence?: string
  }

  semantic?: {
    vendor_name?: string | null
    customer_name?: string | null
    invoice_date?: string | null
    invoice_number?: string | null
    subtotal?: string | number | null
    tax?: string | number | null
    total_amount?: string | number | null
    currency?: string | null
    bank_name?: string | null
    bank_account?: string | null
  }

  semantic_vendor_name?: string | null
  semantic_customer_name?: string | null
  semantic_invoice_date?: string | null
  semantic_invoice_number?: string | null
  semantic_subtotal?: string | null
  semantic_tax?: string | null
  semantic_total_amount?: string | null
  semantic_currency?: string | null
  semantic_bank_name?: string | null
  semantic_bank_account?: string | null

  preview?: {
    image_path: string
    width: number
    height: number
    page?: number
    total_pages?: number
    dpi?: number | null
    source_type?: string
    loader?: string
  }

  highlights?: Highlight[]
  spatial_highlights?: Highlight[]
  document_highlights?: Highlight[]

  highlight_summary?: {
    total: number
    spatial_count: number
    document_count: number
    top_confidence: number
    sources?: string[]
  }

  forensics?: {
    status: string
    risk_level?: string
    forensic_score?: number
    // Cross-signal boost reasons from the calibrated engine
    risk_reasons?: string[]
    // Input quality from _assess_input_quality
    input_quality?: number
    quality_warnings?: string[]
    advanced_used?: boolean
    // Flat per-layer scores (for score bars)
    metadata_score?: number
    ela_score?: number
    noise_score?: number
    dct_score?: number
    copy_move_score?: number
    font_score?: number
    text_region_score?: number
    // Full layer breakdown with confidence + triggered flag
    layer_scores?: Record<string, ForensicLayerScore>
    image_analyzed?: boolean
    image_reason?: string
    signals?: {
      type: string
      message: string
      confidence: number
    }[]
  }

  ai_artifact?: {
    status: string
    ai_text_score: number
    risk_level?: string
    reasoning?: string
    perplexity_risk?: number
    burstiness_risk?: number
    repetition_score?: number
    signals?: {
      type: string
      message: string
      confidence?: number
    }[]
    reason?: string
  }

  scoring?: {
    fraud_score: number
    risk_level: string
    prediction: number
    model_version: string
    score_breakdown?: Record<string, number>
    weights_used?: Record<string, number>
  }

  fraud_flags?: {
    rule_code: string
    message: string
  }[]
}

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
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
      <CardContent className="flex flex-col gap-4 p-6">
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
/*  Invoice highlight viewer                                          */
/* ------------------------------------------------------------------ */

function InvoiceHighlightViewer({
  result,
}: {
  result: AnalysisResult
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number } | null>(
    null
  )
  const [imageLoadFailed, setImageLoadFailed] = useState(false)

  const allHighlights: Highlight[] =
    result.highlights && result.highlights.length > 0
      ? result.highlights
      : [
        ...(result.spatial_highlights ?? []),
        ...(result.document_highlights ?? []),
      ]

  const bboxHighlights = allHighlights.filter((h) => h.bbox !== null)
  const docHighlights = allHighlights.filter((h) => h.bbox === null)

  const previewUrl = resolvePreviewUrl(result.preview?.image_path)
  const hasPreview = Boolean(previewUrl && !imageLoadFailed)

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImgDims({ w: img.clientWidth, h: img.clientHeight })
    setNaturalDims({
      w: result.preview?.width || img.naturalWidth,
      h: result.preview?.height || img.naturalHeight,
    })
  }

  const handleImageError = () => {
    setImageLoadFailed(true)
    setImgDims(null)
    setNaturalDims(null)
  }

  const scaleBox = (bbox: [number, number, number, number]) => {
    if (!imgDims || !naturalDims) return null

    const scaleX = imgDims.w / naturalDims.w
    const scaleY = imgDims.h / naturalDims.h

    return {
      left: bbox[0] * scaleX,
      top: bbox[1] * scaleY,
      width: bbox[2] * scaleX,
      height: bbox[3] * scaleY,
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {(result.preview?.source_type ?? result.file_type).toUpperCase()}
          </span>
          {result.preview?.total_pages ? (
            <>
              {" · "}
              Page {result.preview.page ?? 1} of {result.preview.total_pages}
            </>
          ) : null}
          {result.preview?.width && result.preview?.height ? (
            <>
              {" · "}
              {result.preview.width}×{result.preview.height}
            </>
          ) : null}
          {result.preview?.loader ? (
            <>
              {" · "}
              {result.preview.loader}
            </>
          ) : null}
        </div>

        <div className="relative overflow-hidden rounded-lg border border-border/40 bg-black/5">
          {hasPreview ? (
            <div className="relative max-h-[720px] overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl ?? undefined}
                alt="Invoice preview"
                className="h-auto w-full object-contain"
                onLoad={handleImageLoad}
                onError={handleImageError}
              />

              {imgDims &&
                naturalDims &&
                bboxHighlights.map((hl, idx) => {
                  if (!hl.bbox) return null

                  const scaled = scaleBox(hl.bbox)
                  if (!scaled) return null

                  const style = getHighlightStyle(hl.color)
                  const isActive = activeIdx === idx

                  return (
                    <div
                      key={idx}
                      className={`absolute cursor-pointer rounded-sm border-2 transition-all duration-150 hover:scale-[1.01]
                        ${style.border} ${style.bg}
                        ${isActive
                          ? "opacity-100 ring-2 ring-current ring-offset-1"
                          : "opacity-70 hover:opacity-100"
                        }
                      `}
                      style={{
                        left: scaled.left,
                        top: scaled.top,
                        width: scaled.width,
                        height: scaled.height,
                        zIndex: isActive ? 20 : 10,
                      }}
                      onClick={() => setActiveIdx(isActive ? -1 : idx)}
                      title={hl.message}
                    >
                      {isActive && (
                        <span
                          className={`absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${style.label}`}
                        >
                          {hl.type.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center px-6 py-10 text-center">
              <div className="flex max-w-sm flex-col items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {previewUrl ? "Preview unavailable" : "Preview not generated"}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {previewUrl
                    ? "The analysis completed, but the returned preview image could not be loaded."
                    : "The invoice preview could not be generated for this analysis run."}
                </p>
                {result.forensics?.image_reason && (
                  <p className="rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    {result.forensics.image_reason}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full flex-col gap-3 overflow-y-auto pr-1 lg:max-h-[720px]">
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{allHighlights.length}</span>{" "}
          signal{allHighlights.length !== 1 ? "s" : ""} detected
          {" · "}
          <span className="font-medium text-foreground">
            {bboxHighlights.length}
          </span>{" "}
          with region
        </div>

        <div className="flex flex-wrap gap-2 text-[10px]">
          {(["red", "amber", "blue", "coral"] as const).map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-sm ${HIGHLIGHT_STYLES[c].dot}`} />
              <span className="text-muted-foreground capitalize">
                {c === "red"
                  ? "Manipulation"
                  : c === "amber"
                    ? "AI artifact"
                    : c === "blue"
                      ? "Forensic"
                      : "Rules"}
              </span>
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          {bboxHighlights.length > 0 && !hasPreview && (
            <div className="rounded-lg border border-border/40 bg-background px-3 py-3 text-[10px] leading-relaxed text-muted-foreground">
              Spatial findings were generated, but the preview image is unavailable so
              overlays cannot be shown.
            </div>
          )}

          {bboxHighlights.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Region findings
              </p>
              <div className="flex flex-col gap-1.5">
                {bboxHighlights.map((hl, idx) => {
                  const style = getHighlightStyle(hl.color)
                  const isActive = activeIdx === idx

                  return (
                    <button
                      key={`${hl.type}-${idx}`}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition-all duration-150
                        ${isActive
                          ? `${style.border} ${style.bg}`
                          : "border-border/40 bg-background hover:bg-muted/60"
                        }`}
                      onClick={() => setActiveIdx(isActive ? -1 : idx)}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                        />
                        <span className="text-[11px] font-semibold text-foreground truncate">
                          {hl.type.replace(/_/g, " ")}
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          {(hl.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        {hl.message}
                      </p>
                      <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground/60">
                        {hl.source} · region
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {docHighlights.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Document findings
              </p>
              <div className="flex flex-col gap-1.5">
                {docHighlights.map((hl, idx) => {
                  const style = getHighlightStyle(hl.color)

                  return (
                    <div
                      key={`${hl.type}-doc-${idx}`}
                      className="w-full rounded-lg border border-border/40 bg-background px-3 py-3 text-left"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                        />
                        <span className="text-[11px] font-semibold text-foreground truncate">
                          {hl.type.replace(/_/g, " ")}
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          {(hl.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        {hl.message}
                      </p>
                      <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground/60">
                        {hl.source} · document
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {result.highlight_summary && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground">
              Total:{" "}
              <span className="font-medium text-foreground">
                {result.highlight_summary.total}
              </span>
              {" · "}Spatial:{" "}
              <span className="font-medium text-foreground">
                {result.highlight_summary.spatial_count}
              </span>
              {" · "}Document:{" "}
              <span className="font-medium text-foreground">
                {result.highlight_summary.document_count}
              </span>
            </div>
          )}

          {allHighlights.length === 0 && (
            <div className="rounded-lg border border-border/40 bg-background px-3 py-4 text-xs text-muted-foreground">
              No detected signals were generated for this invoice.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Scoring card                                                      */
/* ------------------------------------------------------------------ */

function ScoringCard({ scoring }: { scoring?: AnalysisResult["scoring"] }) {
  const [expanded, setExpanded] = useState(false)
  if (!scoring) return null

  const breakdown = scoring.score_breakdown ?? {}

  return (
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Ensemble fraud score
            </h3>
          </div>
          <RiskPill level={scoring.risk_level} />
        </div>

        <ScoreBar label="Fraud score" score={scoring.fraud_score} invert={false} />

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? "Hide" : "Show"} score breakdown
        </button>

        {expanded && (
          <div className="divide-y divide-border/40">
            {Object.entries(breakdown).map(([key, val]) => (
              <ScoreBar
                key={key}
                label={key.replace(/_/g, " ")}
                score={val as number}
                invert={false}
              />
            ))}
          </div>
        )}

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground">
          Model:{" "}
          <span className="font-mono text-foreground">{scoring.model_version}</span>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Forensics card                                                    */
/* ------------------------------------------------------------------ */

function ForensicsCard({ forensics }: { forensics?: AnalysisResult["forensics"] }) {
  const [layersExpanded, setLayersExpanded] = useState(false)
  if (!forensics) return null

  // Use layer_scores for triggered badges if available, fall back to flat scores
  const ls = forensics.layer_scores

  return (
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Microscope className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Forensic analysis
            </h3>
          </div>
          <RiskPill level={forensics.risk_level} />
        </div>

        <ScoreBar
          label="Forensic risk score"
          score={forensics.forensic_score}
          invert={false}
        />

        {/* Per-layer scores with triggered badges */}
        <div className="divide-y divide-border/40">
          <ScoreBar
            label="ELA (recompression)"
            score={forensics.ela_score}
            invert={false}
            triggered={ls?.ela?.triggered}
          />
          <ScoreBar
            label="Font inconsistency"
            score={forensics.font_score}
            invert={false}
            triggered={ls?.font?.triggered}
          />
          <ScoreBar
            label="Noise inconsistency"
            score={forensics.noise_score}
            invert={false}
            triggered={ls?.noise?.triggered}
          />
          <ScoreBar
            label="Text rendering"
            score={forensics.text_region_score}
            invert={false}
            triggered={ls?.text?.triggered}
          />
          <ScoreBar
            label="Metadata anomaly"
            score={forensics.metadata_score}
            invert={false}
            triggered={ls?.metadata?.triggered}
          />
        </div>

        {/* Advanced layers — collapsible since they're often 0 */}
        <button
          onClick={() => setLayersExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {layersExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {layersExpanded ? "Hide" : "Show"} advanced layers
          {forensics.advanced_used && (
            <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
              ran
            </span>
          )}
        </button>

        {layersExpanded && (
          <div className="divide-y divide-border/40">
            <ScoreBar
              label="DCT artifacts"
              score={forensics.dct_score}
              invert={false}
              triggered={ls?.dct?.triggered}
            />
            <ScoreBar
              label="Copy-move forgery"
              score={forensics.copy_move_score}
              invert={false}
              triggered={ls?.copy_move?.triggered}
            />
            {forensics.input_quality !== undefined && (
              <ScoreBar
                label="Input quality"
                score={forensics.input_quality}
                invert={true}
              />
            )}
          </div>
        )}

        {/* Risk reasons from cross-signal boosts + tier overrides */}
        {forensics.risk_reasons && forensics.risk_reasons.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2">
            <li className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Risk reasons
            </li>
            {forensics.risk_reasons.map((reason, idx) => (
              <li key={idx} className="text-xs leading-relaxed text-muted-foreground">
                &bull; {reason}
              </li>
            ))}
          </ul>
        )}

        {/* Triggered signal list */}
        {forensics.signals && forensics.signals.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2">
            {forensics.signals.map((signal, idx) => (
              <li key={idx} className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">
                  {signal.type.replace(/_/g, " ")}
                </span>
                {" — "}
                {signal.message}
              </li>
            ))}
          </ul>
        )}

        {/* Quality warnings */}
        {forensics.quality_warnings && forensics.quality_warnings.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
            {forensics.quality_warnings.map((w, idx) => (
              <li key={idx} className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}

        {forensics.image_analyzed === false && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            {forensics.image_reason ??
              "Visual analysis unavailable — image could not be extracted"}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  AI artifact card                                                  */
/* ------------------------------------------------------------------ */

function AiArtifactCard({
  artifact,
}: {
  artifact?: AnalysisResult["ai_artifact"]
}) {
  if (!artifact) return null

  return (
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            AI artifact detection
          </h3>
        </div>

        {artifact.status === "skipped" || artifact.status === "insufficient_text" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            {artifact.reason ?? artifact.reasoning ?? "Insufficient text for analysis"}
          </p>
        ) : (
          <>
            <ScoreBar
              label="AI text score"
              score={artifact.ai_text_score}
              invert={false}
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Risk level
              </span>
              <RiskPill level={artifact.risk_level} />
            </div>

            {(artifact.perplexity_risk !== undefined ||
              artifact.burstiness_risk !== undefined ||
              artifact.repetition_score !== undefined) && (
                <div className="divide-y divide-border/40">
                  <ScoreBar
                    label="Perplexity risk"
                    score={artifact.perplexity_risk}
                    invert={false}
                  />
                  <ScoreBar
                    label="Burstiness risk"
                    score={artifact.burstiness_risk}
                    invert={false}
                  />
                  <ScoreBar
                    label="Repetition"
                    score={artifact.repetition_score}
                    invert={false}
                  />
                </div>
              )}

            {artifact.reasoning && (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                {artifact.reasoning}
              </p>
            )}

            {artifact.signals?.length ? (
              <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2">
                {artifact.signals.map((signal, idx) => (
                  <li
                    key={idx}
                    className="text-xs leading-relaxed text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">
                      {signal.type.replace(/_/g, " ")}
                    </span>
                    {" — "}
                    {signal.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
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

      <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
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
          <div className="grid gap-6 lg:grid-cols-3">
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
                    <CardContent className="flex flex-col gap-4 p-6">
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

              <div className="grid gap-6 lg:grid-cols-3">
                <ScoringCard scoring={result.scoring} />
                <ForensicsCard forensics={result.forensics} />
                <AiArtifactCard artifact={result.ai_artifact} />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500 delay-75">
                  <CardContent className="flex flex-col gap-4 p-6">
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
                  <CardContent className="flex flex-col gap-4 p-6">
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
                  <CardContent className="flex flex-col gap-4 p-6">
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
                  <CardContent className="flex flex-col gap-4 p-6">
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
            <div className="grid gap-6 lg:grid-cols-3">
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