import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  FileCheck,
  AlertTriangle,
  ShieldCheck,
  Clock,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Flag,
} from "lucide-react"

type Stats = {
  total_invoices: number
  this_week: number
  week_trend: number
  high_risk: number
  trusted_percent: number
  avg_confidence: number
  total_reviewed?: number
  total_pending_review?: number
  total_approved?: number
  total_rejected?: number
  total_flagged?: number
  total_escalated?: number
}

export default function StatCards({ stats }: { stats: Stats }) {
  const hasReviewStats = stats?.total_reviewed !== undefined

  const cards = [
    {
      label: "Invoices processed",
      value: stats?.total_invoices ?? 0,
      trend: `${stats?.week_trend >= 0 ? "+" : ""}${stats?.week_trend ?? 0} this week`,
      trendUp: stats?.week_trend >= 0,
      icon: FileCheck,
    },
    {
      label: "High-risk flags",
      value: stats?.high_risk ?? 0,
      trend:
        stats?.high_risk > 0
          ? `${stats?.high_risk ?? 0} require review`
          : "All clear",
      trendUp: false,
      icon: AlertTriangle,
    },
    {
      label: "Trusted issuers",
      value: `${stats?.trusted_percent ?? 0}%`,
      trend: `${stats?.trusted_percent ?? 0}% verified`,
      trendUp: stats?.trusted_percent >= 70,
      icon: ShieldCheck,
    },
    {
      label: "Avg. turnaround",
      value: `${(stats?.avg_confidence * 100).toFixed(1)}%`,
      trend: "AI confidence score",
      trendUp: true,
      icon: Clock,
    },
    ...(hasReviewStats
      ? [
          {
            label: "Reviewed",
            value: stats.total_reviewed ?? 0,
            trend: `${stats.total_pending_review ?? 0} pending review`,
            trendUp: (stats.total_pending_review ?? 0) === 0,
            icon: ClipboardCheck,
          },
          {
            label: "Approved",
            value: stats.total_approved ?? 0,
            trend: `${stats.total_rejected ?? 0} rejected`,
            trendUp: (stats.total_approved ?? 0) > 0,
            icon: CheckCircle2,
          },
          {
            label: "Rejected",
            value: stats.total_rejected ?? 0,
            trend: `${stats.total_flagged ?? 0} flagged`,
            trendUp: false,
            icon: XCircle,
          },
          {
            label: "Flagged / Escalated",
            value: (stats.total_flagged ?? 0) + (stats.total_escalated ?? 0),
            trend: `${stats.total_flagged ?? 0} flagged, ${stats.total_escalated ?? 0} escalated`,
            trendUp: false,
            icon: Flag,
          },
        ]
      : []),
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((stat) => {
        const Icon = stat.icon
        return (
          <Card
            key={stat.label}
            className="
    border-0
    bg-card/70
    backdrop-blur-sm
    shadow-sm
    transition-all
    duration-200
    hover:-translate-y-0.5
    hover:shadow-md
    motion-safe:animate-in
    motion-safe:fade-in
    motion-safe:slide-in-from-bottom-2
  "
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground/60" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight text-foreground">
                {stat.value}
              </p>
              <p
                className={`mt-1 text-xs ${
                  stat.trendUp
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {stat.trend}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}