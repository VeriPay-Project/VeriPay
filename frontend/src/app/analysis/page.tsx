"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
} from "lucide-react"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type InvoiceSummary = {
  invoice_id: number
  status: string
  file_hash: string
  is_signed: boolean
  crypto_valid: boolean | null
  signer_fingerprint: string | null
  created_at: string
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
}

/* ------------------------------------------------------------------ */
/*  Reusable pieces                                                    */
/* ------------------------------------------------------------------ */

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
    <Card className="
  border-0
  bg-card/65
  shadow-sm
  backdrop-blur-xl
  transition-all
  duration-200
  hover:shadow-lg
  hover:-translate-y-0.5
">
      <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{title}</p>
      </CardContent>
    </Card>
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
  const [animatedValue, setAnimatedValue] = useState(0)

  useEffect(() => {
    if (score === undefined || score === null) return

    let start = 0
    const end = Math.min(Math.max(score * 100, 0), 100)
    const duration = 900
    const startTime = performance.now()

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic

      setAnimatedValue(start + (end - start) * eased)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [score])

  if (score === undefined || score === null) return null

  const percentage = animatedValue

  let color =
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
          {(percentage / 100).toFixed(2)}
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

function CryptoTrustBar({
  trust,
}: {
  trust?: string
}) {
  const [animatedValue, setAnimatedValue] = useState(0)

  if (!trust) return null

  // Map backend trust value → percentage
  const trustMap: Record<string, number> = {
    trusted: 95,
    valid: 85,
    warning: 60,
    untrusted: 30,
    invalid: 15,
  }

  const target = trustMap[trust.toLowerCase()] ?? 50

  useEffect(() => {
    let start = 0
    const duration = 800
    const startTime = performance.now()

    function animate(time: number) {
      const elapsed = time - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)

      setAnimatedValue(start + (target - start) * eased)

      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [target])

  const percentage = animatedValue

  let color =
    percentage >= 80
      ? "bg-emerald-500"
      : percentage >= 50
        ? "bg-amber-500"
        : "bg-red-500"

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Certificate trust level
        </span>
        <span className="text-sm font-semibold text-foreground">
          {Math.round(percentage)}%
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

function SkeletonCard() {
  return (
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
      <CardContent className="flex flex-col gap-4 p-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-muted animate-pulse" />
          <div className="h-4 w-40 rounded bg-muted animate-pulse" />
        </div>

        {/* Content skeleton lines */}
        <div className="space-y-3">
          <div className="h-3 w-full rounded bg-muted animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
          <div className="h-3 w-4/6 rounded bg-muted animate-pulse" />
          <div className="h-3 w-3/6 rounded bg-muted animate-pulse" />
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
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

  /* ---- Fetch invoice list ---- */
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

  useEffect(() => {
    if (!autoRun || autoRunTriggered || !selectedId) return
    setAutoRunTriggered(true)
    handleAnalyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, autoRunTriggered, selectedId])

  /* ---- Run analysis ---- */
  const handleAnalyze = async () => {
    if (!canAnalyze) {
      setStatus("Select or enter an invoice ID to analyze.")
      return
    }
    try {
      setIsRunning(true)
      setStatus("Running analysis...")
      setResult(null)

      const response = await fetch(
        `${API_BASE}/invoices/${selectedId}/analyze`,
        { method: "POST", credentials: "include" }
      )

      let data: AnalysisResult | null = null
      try {
        data = (await response.json()) as AnalysisResult
      } catch {
        data = null
      }

      if (response.status === 401) {
        setStatus("Session expired. Please log in again.")
        return
      }
      if (!response.ok) {
        setStatus(data?.ai?.message ?? "Analysis failed.")
        setIsRunning(false)
        return
      }

      setResult(data)
      setStatus("Analysis complete.")
      setIsRunning(false)
    } catch {
      setStatus("Unable to reach the API.")
      setIsRunning(false)
    }
  }

  /* ---- AI status helper ---- */
  const aiStatusPill = () => {
    if (!result) return null
    if (result.ai.status === "ok")
      return <StatusPill status="success" label="Complete" />
    if (result.ai.status === "skipped")
      return <StatusPill status="warning" label="Not applicable" />
    return <StatusPill status="danger" label="Failed" />
  }

  return (
    <div className="relative flex flex-col gap-8">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-3xl" />

      {/* Hero */}
      <section className="relative flex flex-col gap-3 overflow-hidden rounded-2xl px-6 py-8">

        {/* Gradient background */}
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
          Select an invoice, run crypto verification, and review AI anomaly
          signals in one place.
        </p>
      </section>

      {/* Control panel */}
      <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
        <CardContent className="flex flex-col gap-5 p-6">
          <div className="grid gap-5 md:grid-cols-2">
            {/* Invoice ID input */}
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

            {/* Invoice dropdown */}
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
                    <SelectItem
                      key={inv.invoice_id}
                      value={String(inv.invoice_id)}
                    >
                      {"#"}{inv.invoice_id} &middot; {inv.status} &middot;{" "}
                      {inv.created_at?.slice(0, 10)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions row */}
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
              PDF invoices include signature verification and AI scoring.
            </span>
          </div>

          {/* Status feedback */}
          {selectedId && (
            <p className="text-xs text-muted-foreground">
              Selected invoice:{" "}
              <span className="font-mono font-medium text-foreground">
                {"#"}{selectedId}
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

      {/* Results grid */}
      <div className="relative min-h-[420px]">
        {/* Skeleton Layer */}
        <div
          className={`
      absolute inset-0
      transition-opacity duration-300
      ${isRunning ? "opacity-100" : "opacity-0 pointer-events-none"}
    `}
        >
          <div className="grid gap-6 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>

        {/* Results / Empty Layer */}
        <div
          className={`
      transition-opacity duration-500
      ${!isRunning ? "opacity-100" : "opacity-0"}
    `}
        >
          {result ? (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* --- Cryptographic Verification --- */}
              <Card
                className="
    border-0 bg-card/65 shadow-sm backdrop-blur-xl
    motion-safe:animate-in
    motion-safe:fade-in
    motion-safe:zoom-in-95
    duration-500
    delay-75
  "
              >
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
                      value={String(result.crypto.signature_present)}
                    />
                    <MetricRow
                      label="Signature integrity"
                      value={result.crypto.signature_integrity}
                    />
                    <CryptoTrustBar trust={result.crypto.certificate_trust} />
                    <MetricRow
                      label="Certificate trust"
                      value={result.crypto.certificate_trust}
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

              {/* --- AI Anomaly Analysis --- */}
              <Card
                className="
    border-0 bg-card/65 shadow-sm backdrop-blur-xl
    motion-safe:animate-in
    motion-safe:fade-in
    motion-safe:zoom-in-95
    duration-500
    delay-150
  "
              >

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
                      <AnomalyScoreBar score={result.ai.anomaly_score} />
                      <div className="flex items-center justify-between py-2">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          Risk level
                        </span>
                        <RiskPill level={result.ai.risk_level} />
                      </div>
                      <MetricRow
                        label="Review required"
                        value={String(result.ai.review_required)}
                      />
                      <MetricRow
                        label="Embedding distance"
                        value={String(result.ai.embedding_distance)}
                      />
                      <MetricRow
                        label="Distance z-score"
                        value={String(result.ai.distance_z_score)}
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

              {/* --- Rule-based checks --- */}
              <Card
                className="
    border-0 bg-card/65 shadow-sm backdrop-blur-xl
    motion-safe:animate-in
    motion-safe:fade-in
    motion-safe:zoom-in-95
    duration-500
    delay-300
  "
              >

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
                      value={String(result.rules.word_count ?? "N/A")}
                    />
                    <MetricRow
                      label="Font count"
                      value={String(result.rules.font_count ?? "N/A")}
                    />
                    <MetricRow
                      label="Line items"
                      value={String(result.rules.line_item_count ?? "N/A")}
                    />
                    <MetricRow
                      label="Line item sum"
                      value={String(result.rules.line_item_sum ?? "N/A")}
                    />
                    <MetricRow
                      label="Subtotal"
                      value={String(result.rules.subtotal ?? "N/A")}
                    />
                    <MetricRow
                      label="Tax"
                      value={String(result.rules.tax ?? "N/A")}
                    />
                    <MetricRow
                      label="Total"
                      value={String(result.rules.total ?? "N/A")}
                    />
                  </div>

                  {result.rules.checks && (
                    <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2">
                      <li className="text-xs text-muted-foreground">
                        Subtotal vs items:{" "}
                        <span className="font-medium text-foreground">
                          {String(result.rules.checks.subtotal_matches_items)}
                        </span>
                      </li>
                      <li className="text-xs text-muted-foreground">
                        {"Total vs subtotal+tax: "}
                        <span className="font-medium text-foreground">
                          {String(
                            result.rules.checks.total_matches_subtotal_tax
                          )}
                        </span>
                      </li>
                      <li className="text-xs text-muted-foreground">
                        Subtotal delta:{" "}
                        <span className="font-medium text-foreground">
                          {result.rules.checks.subtotal_delta ?? "N/A"}
                        </span>
                      </li>
                      <li className="text-xs text-muted-foreground">
                        Total delta:{" "}
                        <span className="font-medium text-foreground">
                          {result.rules.checks.total_delta ?? "N/A"}
                        </span>
                      </li>
                    </ul>
                  )}
                </CardContent>
              </Card>
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

      {/* Footer hint */}
      <p className="text-xs text-muted-foreground">
        API endpoint:{" "}
        <span className="font-mono font-medium text-foreground">
          {API_BASE}
        </span>
      </p>
    </div>
  )
}