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
  ShieldAlert,
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
  Scale,
  CheckCircle2,
  XCircle,
  Send,
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
    model_type?: string
    model_id?: string
    model_version?: string
    model_display_name?: string
    algorithm?: string
    anomaly_score?: number
    risk_level?: string
    review_required?: boolean
    prediction_label?: string
    approval_probability?: number
    rejection_probability?: number
    classifier_confidence?: number
    layout_familiarity?: string
    layout_consistency_score?: number | null
    layout_consistency_level?: string
    layout_consistency_reason?: string
    layout_reason_source?: string
    unfamiliar_layout?: boolean
    reliability_warning?: string | null
    training_sample_count?: number
    approved_count?: number
    rejected_count?: number
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
    card_name?: string
    method?: string
    ai_text_score: number
    risk_level?: string
    reasoning?: string
    ollama_probability?: number | null
    model_confidence?: number | null
    heuristic_score?: number
    artifact_type?: string
    perplexity_risk?: number
    burstiness_risk?: number
    repetition_score?: number
    diversity_risk?: number
    punctuation_score?: number
    signal_boost?: number
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

  ensemble_fraud_score?: {
    fraud_score: number
    risk_level: string
    score_breakdown: Record<
      string,
      {
        score: number
        weight: number
        weighted: number
        reason: string
      }
    >
    amplifiers_applied: string[]
    explanation: string
  }

  fraud_flags?: {
    rule_code: string
    message: string
  }[]
}

type ReviewData = {
  id: number
  invoice_id: number
  user_id: number
  reviewer_name: string | null
  decision: string
  confidence: string | null
  description: string
  reviewed_at: string
  updated_at: string
}

type LayoutLMModel = {
  id: string
  source_model_id?: string
  name: string
  model_type: string
  is_baseline?: boolean
  is_latest?: boolean
  is_best?: boolean
  trained_sample_count?: number | null
  approved_count?: number
  rejected_count?: number
  created_at?: string | null
  metrics?: {
    accuracy?: number
    precision_approved?: number
    recall_approved?: number
    f1_approved?: number
    evaluation_mode?: string
    train_count?: number
    test_count?: number
  } | null
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function displayValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "N/A"
  return String(value)
}

function displayProbability(value: number | null | undefined): string {
  return typeof value === "number" ? value.toFixed(2) : "N/A"
}

function displayPercent(value: number | null | undefined): string {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "N/A"
}

function layoutlmModelKey(model: LayoutLMModel): string {
  return `${model.id}-${model.source_model_id ?? ""}`
}

function LayoutlmModelTags({ model }: { model: LayoutLMModel }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {model.is_best && (
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
          Best
        </span>
      )}
      {model.is_latest && (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          Latest
        </span>
      )}
    </span>
  )
}

function LayoutlmModelOption({ model }: { model: LayoutLMModel }) {
  return (
    <span className="flex min-h-6 items-center gap-2">
      <span>{model.name}</span>
      <LayoutlmModelTags model={model} />
    </span>
  )
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

type ScoreMeaning = "risk" | "positive"

function riskColorClassFromLevel(level?: string) {
  const normalized = level?.toLowerCase() ?? ""

  if (normalized.includes("critical")) return "bg-red-700 dark:bg-red-400"
  if (normalized.includes("high")) return "bg-red-500"
  if (normalized.includes("medium")) return "bg-amber-500"
  if (normalized.includes("low")) return "bg-emerald-500"

  return null
}

function scoreColorClass(pct: number, meaning: ScoreMeaning, riskLevel?: string) {
  if (meaning === "risk") {
    const riskColor = riskColorClassFromLevel(riskLevel)
    if (riskColor) return riskColor

    return pct >= 70
      ? "bg-red-500"
      : pct >= 40
        ? "bg-amber-500"
        : "bg-emerald-500"
  }

  return pct >= 70
    ? "bg-emerald-500"
    : pct >= 40
      ? "bg-amber-500"
      : "bg-red-500"
}

function riskLevelFromScore(score: number) {
  if (score >= 0.75) return "critical"
  if (score >= 0.5) return "high"
  if (score >= 0.25) return "medium"
  return "low"
}

function riskLevelForLayer(score?: number, triggered?: boolean) {
  if (triggered) return "high"
  return typeof score === "number" ? riskLevelFromScore(score) : undefined
}

function ScoreBar({
  label,
  score,
  meaning = "risk",
  riskLevel,
  triggered,
  description,
}: {
  label: string
  score?: number
  meaning?: ScoreMeaning
  riskLevel?: string
  triggered?: boolean
  description?: string
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
  const color = scoreColorClass(pct, meaning, riskLevel)

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {description && (
            <p className="mt-0.5 text-[11px] normal-case leading-snug tracking-normal text-muted-foreground">
              {description}
            </p>
          )}
        </div>
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

function AnomalyScoreBar({
  score,
  riskLevel,
}: {
  score?: number
  riskLevel?: string
}) {
  return <ScoreBar label="Anomaly score" score={score} riskLevel={riskLevel} />
}

function LayoutConsistencyBar({ score }: { score?: number | null }) {
  return (
    <ScoreBar
      label="Layout consistency"
      score={score ?? undefined}
      meaning="positive"
      description="Higher means the document layout is closer to the supervised training examples."
    />
  )
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

        <ScoreBar
          label="Fraud score"
          score={scoring.fraud_score}
          riskLevel={scoring.risk_level}
        />

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
                riskLevel={riskLevelFromScore(val as number)}
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
          riskLevel={forensics.risk_level}
        />

        {/* Per-layer scores with triggered badges */}
        <div className="divide-y divide-border/40">
          <ScoreBar
            label="ELA (recompression)"
            score={forensics.ela_score}
            riskLevel={riskLevelForLayer(forensics.ela_score, ls?.ela?.triggered)}
            triggered={ls?.ela?.triggered}
          />
          <ScoreBar
            label="Font inconsistency"
            score={forensics.font_score}
            riskLevel={riskLevelForLayer(forensics.font_score, ls?.font?.triggered)}
            triggered={ls?.font?.triggered}
          />
          <ScoreBar
            label="Noise inconsistency"
            score={forensics.noise_score}
            riskLevel={riskLevelForLayer(forensics.noise_score, ls?.noise?.triggered)}
            triggered={ls?.noise?.triggered}
          />
          <ScoreBar
            label="Text rendering"
            score={forensics.text_region_score}
            riskLevel={riskLevelForLayer(forensics.text_region_score, ls?.text?.triggered)}
            triggered={ls?.text?.triggered}
          />
          <ScoreBar
            label="Metadata anomaly"
            score={forensics.metadata_score}
            riskLevel={riskLevelForLayer(forensics.metadata_score, ls?.metadata?.triggered)}
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
              riskLevel={riskLevelForLayer(forensics.dct_score, ls?.dct?.triggered)}
              triggered={ls?.dct?.triggered}
            />
            <ScoreBar
              label="Copy-move forgery"
              score={forensics.copy_move_score}
              riskLevel={riskLevelForLayer(forensics.copy_move_score, ls?.copy_move?.triggered)}
              triggered={ls?.copy_move?.triggered}
            />
            {forensics.input_quality !== undefined && (
              <ScoreBar
                label="Input quality"
                score={forensics.input_quality}
                meaning="positive"
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
/*  AI text detection card                                            */
/* ------------------------------------------------------------------ */

function AiTextDetectionCard({
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
            AI text detection
          </h3>
        </div>

        {artifact.status === "skipped" ||
          artifact.status === "insufficient_text" ||
          artifact.status === "error" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            {artifact.reason ?? artifact.reasoning ?? "Insufficient text for analysis"}
          </p>
        ) : (
          <>
            <ScoreBar
              label="AI text score"
              score={artifact.ai_text_score}
              riskLevel={artifact.risk_level}
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Risk level
              </span>
              <RiskPill level={artifact.risk_level} />
            </div>

            <div className="divide-y divide-border/40">
              <MetricRow
                label="Method"
                value={displayValue(artifact.method?.replace(/_/g, " "))}
              />
              <MetricRow
                label="Artifact type"
                value={displayValue(artifact.artifact_type?.replace(/_/g, " "))}
              />
            </div>

            {(artifact.ollama_probability !== undefined ||
              artifact.heuristic_score !== undefined ||
              artifact.model_confidence !== undefined) && (
                <div className="divide-y divide-border/40">
                  <ScoreBar
                    label="Ollama judgment"
                    score={artifact.ollama_probability ?? undefined}
                    description="Ollama's AI or template probability for this text."
                  />
                  <ScoreBar
                    label="Heuristic score"
                    score={artifact.heuristic_score}
                    description="Local pattern score used when model judgment is weak."
                  />
                  <ScoreBar
                    label="Model confidence"
                    score={artifact.model_confidence ?? undefined}
                    meaning="positive"
                    description="Ollama's self-reported confidence, not precision."
                  />
                </div>
              )}

            {(artifact.perplexity_risk !== undefined ||
              artifact.burstiness_risk !== undefined ||
              artifact.repetition_score !== undefined) && (
                <div className="divide-y divide-border/40">
                  <ScoreBar
                    label="Perplexity risk"
                    score={artifact.perplexity_risk}
                  />
                  <ScoreBar
                    label="Burstiness risk"
                    score={artifact.burstiness_risk}
                  />
                  <ScoreBar
                    label="Repetition"
                    score={artifact.repetition_score}
                  />
                  <ScoreBar
                    label="Diversity risk"
                    score={artifact.diversity_risk}
                  />
                  <ScoreBar
                    label="Punctuation"
                    score={artifact.punctuation_score}
                  />
                  <ScoreBar
                    label="Signal boost"
                    score={artifact.signal_boost}
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
/*  Ensemble Fraud Risk Assessment card                               */
/* ------------------------------------------------------------------ */

function FraudScoreGauge({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    const end = Math.min(Math.max(score * 100, 0), 100)
    const startTime = performance.now()
    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / 1200, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimated(end * eased)
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [score])

  const pct = animated
  const circumference = 2 * Math.PI * 54
  const strokeDashoffset = circumference - (pct / 100) * circumference
  const scoreRiskLevel = riskLevelFromScore(score)

  const colorMap: Record<string, string> = {
    low: "stroke-emerald-500",
    medium: "stroke-amber-500",
    high: "stroke-red-500",
    critical: "stroke-red-700 dark:stroke-red-400",
  }
  const bgColorMap: Record<string, string> = {
    low: "text-emerald-500",
    medium: "text-amber-500",
    high: "text-red-500",
    critical: "text-red-700 dark:text-red-400",
  }
  const strokeClass = colorMap[scoreRiskLevel] ?? "stroke-muted-foreground"
  const textClass = bgColorMap[scoreRiskLevel] ?? "text-muted-foreground"

  return (
    <div
      className="relative flex items-center justify-center"
      aria-label={`Overall fraud risk ${Math.round(pct)}%`}
    >
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
        <circle
          cx="64" cy="64" r="54"
          fill="none"
          className="stroke-muted"
          strokeWidth="8"
        />
        <circle
          cx="64" cy="64" r="54"
          fill="none"
          className={strokeClass}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 0.3s" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Fraud risk
        </span>
        <span className={`text-2xl font-bold ${textClass}`}>
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  )
}

function FraudRiskCard({ ensemble }: { ensemble?: AnalysisResult["ensemble_fraud_score"] }) {
  const [expanded, setExpanded] = useState(false)
  if (!ensemble) return null

  const { fraud_score, risk_level, score_breakdown, amplifiers_applied, explanation } = ensemble

  const normalizedRiskLevel = (risk_level || riskLevelFromScore(fraud_score)).toLowerCase()
  const Icon = normalizedRiskLevel === "low" ? ShieldCheck : ShieldAlert
  const iconStyles =
    normalizedRiskLevel === "low"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : normalizedRiskLevel === "medium"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-red-500/10 text-red-600 dark:text-red-400"

  return (
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500 lg:col-span-3">
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconStyles}`}>
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Fraud Risk Assessment
            </h3>
          </div>
          <RiskPill level={risk_level} />
        </div>

        {amplifiers_applied.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-500/10">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span className="text-xs font-medium text-red-700 dark:text-red-300">
              Risk amplified: multiple independent fraud signals detected
            </span>
          </div>
        )}

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-8">
          <div className="flex flex-col items-center gap-2">
            <FraudScoreGauge score={fraud_score} />
            <div className="flex w-44 items-center justify-between text-[10px] text-muted-foreground">
              <span>Lower risk</span>
              <span>Critical risk</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2">
            <p className="text-sm leading-relaxed text-muted-foreground">{explanation}</p>

            {amplifiers_applied.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {amplifiers_applied.map((amp, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300"
                  >
                    {amp}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Hide" : "Show"} score breakdown
        </button>

        {expanded && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(score_breakdown).map(([key, info]) => (
              <div key={key} className="rounded-lg border border-border/40 bg-background p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {(info.weight * 100).toFixed(0)}% weight
                  </span>
                </div>
                <ScoreBar
                  label=""
                  score={info.score}
                  riskLevel={riskLevelFromScore(info.score)}
                />
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {info.reason}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Review & Decision panel                                           */
/* ------------------------------------------------------------------ */

const DECISION_OPTIONS = [
  { value: "approved", label: "Approve", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30", icon: CheckCircle2 },
  { value: "rejected", label: "Reject", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30", icon: XCircle },
] as const


const DECISION_BADGE_STYLES: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
}

const isSupportedDecision = (value: string | null | undefined) =>
  value ? DECISION_OPTIONS.some((opt) => opt.value === value) : false

function ReviewPanel({ invoiceId, existingReview }: { invoiceId: string; existingReview: ReviewData | null }) {
  const [review, setReview] = useState<ReviewData | null>(existingReview)
  const [editing, setEditing] = useState(!existingReview)
  const [decision, setDecision] = useState(isSupportedDecision(existingReview?.decision) ? existingReview?.decision ?? "" : "")
  const [confidence, setConfidence] = useState(existingReview?.confidence ?? "")
  const [description, setDescription] = useState(existingReview?.description ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const canSubmit = !!decision

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError("")
    setSuccess("")

    try {
      const res = await fetch(`${API_BASE}/invoices/${invoiceId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          decision,
          confidence: confidence || null,
          description: description.trim() || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.detail ?? "Failed to submit review")
        return
      }

      const data = await res.json()
      setReview(data)
      setEditing(false)
      setSuccess("Review submitted successfully")
      setTimeout(() => setSuccess(""), 3000)
    } catch {
      setError("Unable to reach the API")
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = () => {
    if (review) {
      setDecision(isSupportedDecision(review.decision) ? review.decision : "")
      setConfidence(review.confidence ?? "")
      setDescription(review.description)
    }
    setEditing(true)
    setSuccess("")
  }

  return (
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500 lg:col-span-3">
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Scale className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            Review &amp; Decision
          </h3>
          {review && !editing && (
            <span className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${DECISION_BADGE_STYLES[review.decision] ?? "bg-muted text-muted-foreground"}`}>
              {review.decision.replace(/_/g, " ")}
            </span>
          )}
        </div>

        {success && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-500/10">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{success}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <span className="text-xs font-medium text-red-700 dark:text-red-300">{error}</span>
          </div>
        )}

        {!editing && review ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Decision</span>
                <p className={`mt-1 text-sm font-semibold capitalize ${DECISION_BADGE_STYLES[review.decision] ? "" : ""}`}>
                  {review.decision.replace(/_/g, " ")}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Reviewed by</span>
                <p className="mt-1 text-sm font-medium text-foreground">{review.reviewer_name ?? "Unknown"}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(review.reviewed_at).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Reasoning</span>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{review.description}</p>
            </div>

            <Button variant="outline" size="sm" onClick={startEdit} className="w-fit">
              Update Review
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Decision</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {DECISION_OPTIONS.map((opt) => {
                  const DIcon = opt.icon
                  const selected = decision === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setDecision(opt.value)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all ${selected ? `${opt.bg} ring-2 ring-current/20` : "border-border bg-background hover:bg-muted/50"
                        }`}
                    >
                      <DIcon className={`h-4 w-4 ${selected ? opt.color : "text-muted-foreground"}`} />
                      <span className={`text-sm font-medium ${selected ? opt.color : "text-foreground"}`}>
                        {opt.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Description <span className="normal-case text-muted-foreground/60">(optional)</span>
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain your reasoning for this decision..."
                rows={3}
                className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Review
                  </>
                )}
              </Button>
              {review && (
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
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
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  const [layoutlmModels, setLayoutlmModels] = useState<LayoutLMModel[]>([])
  const [selectedLayoutlmModel, setSelectedLayoutlmModel] = useState("baseline_unsupervised")
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [autoRunTriggered, setAutoRunTriggered] = useState(false)

  const canAnalyze = useMemo(() => selectedId.trim().length > 0, [selectedId])
  const availableLayoutlmModels = useMemo(
    () => {
      const trainedModels = layoutlmModels.filter((model) => !model.is_baseline)
      if (trainedModels.length) return trainedModels
      return layoutlmModels.length
        ? layoutlmModels
        : [
          {
            id: "baseline_unsupervised",
            name: "Baseline anomaly model",
            model_type: "layoutlmv3_isolation_forest",
            is_baseline: true,
          },
        ]
    },
    [layoutlmModels]
  )
  const selectedLayoutlmModelDetails = useMemo(
    () =>
      availableLayoutlmModels.find((model) => model.id === selectedLayoutlmModel) ??
      availableLayoutlmModels[0],
    [availableLayoutlmModels, selectedLayoutlmModel]
  )

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
    const loadLayoutlmModels = async () => {
      try {
        const response = await fetch(`${API_BASE}/layoutlm/models`, {
          credentials: "include",
        })
        if (!response.ok) return
        const data = (await response.json()) as {
          default_model_id?: string
          models?: LayoutLMModel[]
        }
        const nextModels = data.models ?? []
        const trainedModels = nextModels.filter((model) => !model.is_baseline)
        const visibleNextModels = trainedModels.length ? trainedModels : nextModels
        const defaultModelId =
          data.default_model_id && visibleNextModels.some((model) => model.id === data.default_model_id)
            ? data.default_model_id
            : visibleNextModels[0]?.id
        setLayoutlmModels(nextModels)
        setSelectedLayoutlmModel(defaultModelId ?? "baseline_unsupervised")
      } catch {
        setLayoutlmModels([])
      } finally {
        setModelsLoaded(true)
      }
    }

    loadLayoutlmModels()
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
      setStatus("Checking analysis status...")
      setResult(null)

      // 0. Check DB for existing result with this specific model
      try {
        const statusRes = await fetch(
          `${API_BASE}/invoices/${selectedId}/analysis-status?model_id=${encodeURIComponent(selectedLayoutlmModel)}`,
          { credentials: "include" }
        )
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          if (statusData.status === "analyzed") {
            setResult(statusData.result as AnalysisResult)
            setStatus("Analysis complete.")
            setIsRunning(false)
            try {
              const reviewRes = await fetch(
                `${API_BASE}/invoices/${selectedId}/review`,
                { credentials: "include" }
              )
              setReviewData(reviewRes.ok ? await reviewRes.json() : null)
            } catch {
              setReviewData(null)
            }
            return
          }
        }
      } catch { /* fall through to run fresh analysis */ }

      setStatus("Submitting analysis...")

      // 1. Trigger async analysis
      const query = new URLSearchParams({
        layoutlm_model_id: selectedLayoutlmModel,
      })
      const response = await fetch(
        `${API_BASE}/invoices/${selectedId}/analyze?${query.toString()}`,
        {
          method: "POST",
          credentials: "include",
        }
      )

      if (response.status === 401) {
        setStatus("Session expired. Please log in again.")
        setIsRunning(false)
        return
      }

      if (!response.ok) {
        let errMsg = "Analysis failed."
        try {
          const errData = await response.json()
          errMsg = errData?.detail ?? errData?.message ?? errMsg
        } catch { /* ignore */ }
        setStatus(errMsg)
        setIsRunning(false)
        return
      }

      // 2. Poll GET /analysis-status every 3s, timeout after 3 minutes
      setStatus("Analyzing... this may take a moment.")
      const POLL_INTERVAL = 3_000
      const TIMEOUT = 180_000
      const startTime = Date.now()

      const poll = async (): Promise<void> => {
        if (Date.now() - startTime > TIMEOUT) {
          setStatus("Analysis timed out after 3 minutes. Please try again later.")
          setIsRunning(false)
          return
        }

        try {
          const statusRes = await fetch(
            `${API_BASE}/invoices/${selectedId}/analysis-status?model_id=${encodeURIComponent(selectedLayoutlmModel)}`,
            { credentials: "include" }
          )

          if (statusRes.status === 401) {
            setStatus("Session expired. Please log in again.")
            setIsRunning(false)
            return
          }

          const statusData = await statusRes.json()

          if (statusData.status === "analyzed") {
            const freshResult = statusData.result as AnalysisResult
            setResult(freshResult)
            console.log("VeriPay Analysis Response:", statusData.result)
            setStatus("Analysis complete.")
            setIsRunning(false)

            // Fetch existing review if any
            try {
              const reviewRes = await fetch(
                `${API_BASE}/invoices/${selectedId}/review`,
                { credentials: "include" }
              )
              if (reviewRes.ok) {
                setReviewData(await reviewRes.json())
              } else {
                setReviewData(null)
              }
            } catch {
              setReviewData(null)
            }
            return
          }

          if (statusData.status === "analysis_failed") {
            setStatus(statusData.error ?? "Analysis failed.")
            setIsRunning(false)
            return
          }

          // Still analyzing — wait and poll again
          await new Promise((r) => setTimeout(r, POLL_INTERVAL))
          return poll()
        } catch {
          setStatus("Unable to reach the API.")
          setIsRunning(false)
        }
      }

      await poll()
    } catch {
      setStatus("Unable to reach the API.")
      setIsRunning(false)
    }
  }, [canAnalyze, selectedId, selectedLayoutlmModel])

  useEffect(() => {
    if (!autoRun || autoRunTriggered || !selectedId || !modelsLoaded) return
    setAutoRunTriggered(true)
    void handleAnalyze()
  }, [autoRun, autoRunTriggered, selectedId, modelsLoaded, handleAnalyze])

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
          Analyze Uploaded Invoices
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
            <div className="min-w-[260px]">
              <Label htmlFor="layoutlmModel" className="mb-2 block text-xs">
                LayoutLMv3 model
              </Label>
              <Select
                value={selectedLayoutlmModel}
                onValueChange={setSelectedLayoutlmModel}
              >
                <SelectTrigger id="layoutlmModel" className="h-10 bg-background/50">
                  <SelectValue placeholder="Select LayoutLMv3 model" />
                </SelectTrigger>
                <SelectContent>
                  {availableLayoutlmModels.map((model) => (
                    <SelectItem
                      key={layoutlmModelKey(model)}
                      value={model.id}
                      textValue={model.name}
                    >
                      <LayoutlmModelOption model={model} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedLayoutlmModelDetails && (
                <p className="mt-2 max-w-[420px] text-xs leading-relaxed text-muted-foreground">
                  {selectedLayoutlmModelDetails.name}
                  {selectedLayoutlmModelDetails.metrics?.accuracy !== undefined
                    ? ` · ${displayPercent(selectedLayoutlmModelDetails.metrics.accuracy)} accuracy`
                    : ""}
                  {selectedLayoutlmModelDetails.trained_sample_count
                    ? ` · ${selectedLayoutlmModelDetails.trained_sample_count} training labels`
                    : ""}
                </p>
              )}
            </div>

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
              LayoutLMv3 scoring supports uploaded PDFs and image invoices.
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
                <FraudRiskCard ensemble={result.ensemble_fraud_score} />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <ScoringCard scoring={result.scoring} />
                <ForensicsCard forensics={result.forensics} />
                <AiTextDetectionCard artifact={result.ai_artifact} />

                <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500 delay-150">
                  <CardContent className="flex flex-col gap-4 p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                        <Brain className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          AI Layout analysis
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
                        {result.ai.reliability_warning && (
                          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <p className="text-xs leading-relaxed">
                              {result.ai.reliability_warning}
                            </p>
                          </div>
                        )}
                        {result.ai.layout_consistency_reason && (
                          <div className="rounded-lg bg-muted/60 px-3 py-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                Layout reason
                              </span>
                              {result.ai.layout_reason_source && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                  {result.ai.layout_reason_source === "ollama"
                                    ? "Ollama"
                                    : "Local"}
                                </span>
                              )}
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {result.ai.layout_consistency_reason}
                            </p>
                          </div>
                        )}
                        {typeof result.ai.anomaly_score === "number" &&
                          result.ai.anomaly_score >= 0 &&
                          result.ai.anomaly_score <= 1 && (
                            <AnomalyScoreBar
                              score={result.ai.anomaly_score}
                              riskLevel={result.ai.risk_level}
                            />
                          )}
                        {typeof result.ai.layout_consistency_score === "number" &&
                          result.ai.layout_consistency_score >= 0 &&
                          result.ai.layout_consistency_score <= 1 && (
                            <LayoutConsistencyBar score={result.ai.layout_consistency_score} />
                          )}

                        <MetricRow
                          label="Model"
                          value={
                            result.ai.model_display_name ||
                            (result.ai.model_type === "layoutlmv3_supervised_sklearn"
                              ? "LayoutLMv3 supervised classifier"
                              : "LayoutLMv3 baseline anomaly model")
                          }
                        />
                        {result.ai.prediction_label && (
                          <MetricRow
                            label="Prediction"
                            value={result.ai.prediction_label.replace(/_/g, " ")}
                          />
                        )}
                        {typeof result.ai.approval_probability === "number" && (
                          <MetricRow
                            label="Approval probability"
                            value={displayProbability(result.ai.approval_probability)}
                          />
                        )}
                        {typeof result.ai.rejection_probability === "number" && (
                          <MetricRow
                            label="Rejection probability"
                            value={displayProbability(result.ai.rejection_probability)}
                          />
                        )}
                        {typeof result.ai.classifier_confidence === "number" && (
                          <MetricRow
                            label="Classifier confidence"
                            value={displayProbability(result.ai.classifier_confidence)}
                          />
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
                        {result.ai.layout_familiarity && (
                          <MetricRow
                            label="Layout familiarity"
                            value={result.ai.layout_familiarity}
                          />
                        )}
                        {result.ai.layout_consistency_level && (
                          <MetricRow
                            label="Consistency level"
                            value={result.ai.layout_consistency_level}
                          />
                        )}
                        <MetricRow
                          label="Embedding distance"
                          value={displayValue(result.ai.embedding_distance)}
                        />
                        <MetricRow
                          label="Distance z-score"
                          value={displayValue(result.ai.distance_z_score)}
                        />
                        {typeof result.ai.training_sample_count === "number" && (
                          <MetricRow
                            label="Training labels"
                            value={displayValue(result.ai.training_sample_count)}
                          />
                        )}
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
              </div>

              <div className="grid gap-6 lg:grid-cols-1">
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

              <div className="grid gap-6 lg:grid-cols-3">
                <ReviewPanel invoiceId={selectedId} existingReview={reviewData} />
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <EmptyCard
                icon={Microscope}
                title="Forensic analysis results will appear here."
              />
              <EmptyCard
                icon={Sparkles}
                title="AI text detection results will appear here."
              />
              <EmptyCard
                icon={Brain}
                title="AI Layout analysis results will appear here."
              />
            </div>
          )}
        </div>
      </div>


    </div>
  )
}
