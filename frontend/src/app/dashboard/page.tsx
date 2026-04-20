"use client"

import { useEffect, useState } from "react"
import StatCards from "../ui/StatCards"
import InvoicesTable from "../ui/InvoicesTable"
import VerificationQueue from "../ui/VerificationQueue"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const [statsRes, invoicesRes] = await Promise.all([
          fetch(`${API_BASE}/dashboard/stats`, { credentials: "include" }),
          fetch(`${API_BASE}/dashboard/recent`, { credentials: "include" }),
        ])

        if (!statsRes.ok || !invoicesRes.ok) {
          console.error("API error", statsRes.status, invoicesRes.status)
          return
        }

        setStats(await statsRes.json())
        setInvoices(await invoicesRes.json())
      } catch (err) {
        console.error("Dashboard fetch failed:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-col gap-3">
        <Badge
          variant="secondary"
          className="w-fit text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Operations
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground lg:text-4xl">
          Invoice Integrity Dashboard
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Track verifications, anomaly scores, and issuer trust signals across
          your finance workflow.
        </p>
      </section>

      <StatCards stats={stats} />
      <InvoicesTable invoices={invoices} showViewAll />
      <VerificationQueue invoices={invoices} />
    </div>
  )
}