import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

type ReviewStatus = "Approved" | "Pending Review" | "Rejected"

type Invoice = {
  invoice_id: number
  file_name?: string | null
  original_filename?: string | null
  issuer?: string | null
  confidence?: number | null
  created_at: string
  review_status?: string | null
  fraud_score?: number | null
  risk_level?: string | null
}

type QueueItem = {
  issuer: string
  id: string
  time: string
  status: ReviewStatus
}

const reviewStatusStyles: Record<ReviewStatus, string> = {
  Approved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  "Pending Review":
    "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
  Rejected:
    "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
}

function getInvoiceLabel(inv: Invoice) {
  return inv.file_name || inv.original_filename || inv.issuer || `INV-${inv.invoice_id}`
}

function getReviewStatus(status?: string | null): ReviewStatus {
  if (status === "approved") {
    return "Approved"
  }

  if (status === "rejected") {
    return "Rejected"
  }

  return "Pending Review"
}

function isHighRisk(inv: Invoice) {
  const riskLevel = inv.risk_level?.toLowerCase()
  return riskLevel === "high" || (inv.fraud_score ?? inv.confidence ?? 0) >= 0.7
}

export default function VerificationQueue({
  invoices,
}: {
  invoices: Invoice[]
}) {
  // 🔥 Determine queue items (high anomaly invoices)
  const queueItems: QueueItem[] =
  invoices
    ?.filter(isHighRisk)
    .slice(0, 3)
    .map((inv) => ({
      issuer: getInvoiceLabel(inv),
      id: `INV-${inv.invoice_id}`,
      time: new Date(inv.created_at).toLocaleTimeString(),
      status: getReviewStatus(inv.review_status),
    })) ?? []

  // 🔥 Trust distribution calculation
  const total = invoices?.length || 0
  const highRisk =
    invoices?.filter(isHighRisk).length || 0
  const pending =
    invoices?.filter(
      (inv) => {
        const score = inv.fraud_score ?? inv.confidence ?? 0
        return !isHighRisk(inv) && score >= 0.4
      }
    ).length || 0
  const approved =
    invoices?.filter((inv) => {
      const score = inv.fraud_score ?? inv.confidence ?? 0
      return !isHighRisk(inv) && score < 0.4
    }).length || 0

  const trustData = [
    {
      label: "Verified issuers",
      value: total ? Math.round((approved / total) * 100) : 0,
    },
    {
      label: "Pending checks",
      value: total ? Math.round((pending / total) * 100) : 0,
    },
    {
      label: "High-risk issuers",
      value: total ? Math.round((highRisk / total) * 100) : 0,
    },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Live verification queue */}
      <Card
        className="
    border-border/60
    shadow-sm
    backdrop-blur-sm
    transition-all
    hover:shadow-md
    motion-safe:animate-in
    motion-safe:fade-in
    motion-safe:slide-in-from-bottom-2
  "
      >
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            Live verification queue
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {queueItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No high-risk invoices at the moment.
            </p>
          ) : (
            queueItems.map((item) => (
              <div
                key={item.id}
                className="
    flex items-center justify-between
    rounded-xl
    border border-border/60
    bg-muted/30
    px-4 py-3
    transition-all
    hover:bg-muted/50
    hover:shadow-sm
    motion-safe:animate-in
    motion-safe:fade-in
    motion-safe:slide-in-from-left-2
  "
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {item.issuer}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.id} &middot; {item.time}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={reviewStatusStyles[item.status]}
                >
                  {item.status}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Issuer trust distribution */}
      <Card
        className="
    border-border/60
    shadow-sm
    backdrop-blur-sm
    transition-all
    hover:shadow-md
    motion-safe:animate-in
    motion-safe:fade-in
    motion-safe:slide-in-from-bottom-2
  "
      >
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            Issuer trust distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {trustData.map((item) => (
            <div key={item.label} className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {item.label}
                </span>
                <span className="font-medium text-foreground">
                  {item.value}%
                </span>
              </div>
              <Progress value={item.value} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
