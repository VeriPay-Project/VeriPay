import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"

type InvoiceStatus = "Approved" | "Review" | "Escalated"

type Invoice = {
  invoice_id: number
  file_path: string
  confidence: number
  created_at: string
}

type QueueItem = {
  issuer: string
  id: string
  time: string
  status: "Approved" | "Review" | "Escalated"
}

const statusStyles: Record<InvoiceStatus, string> = {
  Approved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  Review:
    "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
  Escalated:
    "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
}

export default function VerificationQueue({
  invoices,
}: {
  invoices: Invoice[]
}) {
  // 🔥 Determine queue items (high anomaly invoices)
  const queueItems: QueueItem[] =
  invoices
    ?.filter((inv) => inv.confidence >= 0.7)
    .slice(0, 3)
    .map((inv) => ({
      issuer: inv.file_path,
      id: `INV-${inv.invoice_id}`,
      time: new Date(inv.created_at).toLocaleTimeString(),
      status: "Escalated",
    })) ?? []

  // 🔥 Trust distribution calculation
  const total = invoices?.length || 0
  const highRisk =
    invoices?.filter((inv: any) => inv.confidence >= 0.7).length || 0
  const pending =
    invoices?.filter(
      (inv: any) => inv.confidence >= 0.4 && inv.confidence < 0.7
    ).length || 0
  const approved =
    invoices?.filter((inv: any) => inv.confidence < 0.4).length || 0

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
                  className={statusStyles[item.status]}
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

      {/* Next actions */}
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
   lg:col-span-2"
      >
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            Next actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Keep your verification loop tight by triaging flagged invoices and
            generating compliance-ready summaries.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button>Start verification</Button>
            <Button variant="outline">
              Export compliance report
            </Button>
          </div>

          {highRisk > 0 && (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-4 py-3 text-sm text-amber-800">
              {highRisk} invoice
              {highRisk > 1 ? "s are" : " is"} awaiting manual review
              with anomaly scores above 0.7.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}