"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

type InvoiceStatus = "Approved" | "Review" | "Escalated" | "Pending"

interface Invoice {
  id: string
  issuer: string
  amount: string
  date: string
  anomalyScore: number
  status: InvoiceStatus
}

const statusStyles: Record<InvoiceStatus, string> = {
  Approved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  Review:
    "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
  Escalated:
    "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
  Pending:
    "bg-muted text-muted-foreground border-border hover:bg-muted",
}

const REVIEW_BADGE_STYLES: Record<string, { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30" },
  flagged_for_investigation: { label: "Flagged", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30" },
  escalated: { label: "Escalated", className: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/30" },
  pending_review: { label: "Pending Review", className: "bg-muted text-muted-foreground border-border" },
}

function AnomalyDot({ score }: { score: number }) {
  const color =
    score >= 0.7
      ? "bg-red-400"
      : score >= 0.4
        ? "bg-amber-400"
        : "bg-emerald-400"

  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span className="font-mono text-xs text-muted-foreground">
        {score.toFixed(2)}
      </span>
    </span>
  )
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  })
}

export default function InvoicesTable({
  invoices,
  setInvoices,
  showViewAll = false,
  allowDelete = false,
}: {
  invoices: any[]
  setInvoices?: React.Dispatch<React.SetStateAction<any[]>>
  showViewAll?: boolean
  allowDelete?: boolean
}) {

  const router = useRouter()

  const [deletingIds, setDeletingIds] = useState<number[]>([])
  const [reviewFilter, setReviewFilter] = useState<string>("")

  const filteredInvoices = reviewFilter
    ? invoices.filter((inv: any) => (inv.review_status ?? "") === reviewFilter)
    : invoices

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()

    // start animation
    setDeletingIds((prev) => [...prev, id])

    setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/invoices/${id}`, {
          method: "DELETE",
          credentials: "include",
        })

        if (!res.ok) throw new Error()

        // remove from UI
        if (setInvoices) {
          setInvoices((prev) => prev.filter((i) => i.invoice_id !== id))
        }

      } catch {
        console.error("Delete failed")

        // rollback animation if failed
        setDeletingIds((prev) => prev.filter((i) => i !== id))
      }
    }, 250) // matches animation timing
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground flex justify-between">
          Recent invoices
          {showViewAll && (
            <Link href="/invoices">
              <Button variant="outline">View All Invoices</Button>
            </Link>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <div className="flex flex-wrap gap-1.5 px-6 pb-3">
          {[
            { value: "", label: "All" },
            ...Object.entries(REVIEW_BADGE_STYLES).map(([value, { label }]) => ({ value, label })),
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setReviewFilter(opt.value)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-all ${
                reviewFilter === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Invoice</TableHead>
              <TableHead>Issuer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Anomaly</TableHead>
              <TableHead>Review</TableHead>
              <TableHead className="text-right">Status</TableHead>
              {allowDelete && <TableHead className="text-right"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-60 text-center">
                  <div className="flex flex-col items-center justify-center gap-4">

                    {/* Image */}
                    <Image
                      src="/empty-invoices.png"
                      alt="No invoices"
                      width={550}
                      height={550}
                      priority
                      className="opacity-70 block dark:hidden"
                    />
                    <Image
                      src="/empty-invoices-dark.png"
                      alt="No invoices"
                      width={550}
                      height={550}
                      priority
                      className="opacity-70 hidden dark:block"
                    />

                    {/* Text */}
                    <div className="flex flex-col items-center gap-1">
                      <p className="text-sm font-medium text-foreground">
                        No invoices yet
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Upload and analyze invoices to see them here
                      </p>
                    </div>

                    {/* CTA Button */}
                    <Button onClick={() => router.push("/upload")}>
                      Upload Invoice
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((inv: any) => {
                const anomalyScore = inv.confidence ?? 0
                const status =
                  anomalyScore >= 0.7
                    ? "Escalated"
                    : anomalyScore >= 0.4
                      ? "Review"
                      : "Approved"

                return (
                  <TableRow
                    key={inv.invoice_id}
                    onClick={() => router.push(`/invoices/${inv.invoice_id}`)}
                    className={`cursor-pointer transition-all duration-300 hover:bg-muted/40 hover:shadow-sm ${deletingIds.includes(inv.invoice_id)
                      ? "opacity-0 translate-x-4 scale-95"
                      : "opacity-100"
                      }
  `}
                  >
                    <TableCell className="font-mono text-xs font-medium text-foreground">
                      INV-{inv.invoice_id}
                    </TableCell>

                    <TableCell className="text-foreground">
                      {inv.issuer ?? "Unknown Vendor"}
                    </TableCell>

                    <TableCell className="font-medium text-foreground">
                      --
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {formatDate(inv.created_at)}
                    </TableCell>

                    <TableCell>
                      <AnomalyDot score={anomalyScore} />
                    </TableCell>

                    <TableCell>
                      {inv.review_status && REVIEW_BADGE_STYLES[inv.review_status] ? (
                        <Badge
                          variant="outline"
                          className={REVIEW_BADGE_STYLES[inv.review_status].className}
                        >
                          {REVIEW_BADGE_STYLES[inv.review_status].label}
                        </Badge>
                      ) : null}
                    </TableCell>

                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={statusStyles[status as InvoiceStatus]}
                      >
                        {status}
                      </Badge>
                    </TableCell>
                    {allowDelete && (
                      <TableCell className="text-right">
                        <button
                          onClick={(e) => handleDelete(e, inv.invoice_id)}
                          className="group p-2 rounded-lg transition-all duration-200 hover:bg-red-500/10"
                        >
                          <Trash2
                            className="h-4 w-4 text-muted-foreground transition-all duration-200 group-hover:text-red-500 group-hover:scale-110 group-hover:rotate-6"
                          />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}