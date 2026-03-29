"use client"

import { useEffect, useState } from "react"
import InvoicesTable from "../ui/InvoicesTable"
import { useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const searchParams = useSearchParams()
    const query = searchParams.get("q") || ""

    useEffect(() => {
        const fetchInvoices = async () => {
            try {
                const res = await fetch(`${API_BASE}/dashboard/invoices?page=1&limit=50&search=${query}`, {
                    credentials: "include",
                })

                if (!res.ok) throw new Error()

                const data = await res.json()
                setInvoices(data)
            } catch (err) {
                console.error("Failed to fetch invoices:", err)
            } finally {
                setLoading(false)
            }
        }

        fetchInvoices()
    }, [query])

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
                <Badge
                    variant="secondary"
                    className="w-fit text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                    Invoices
                </Badge>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                    All invoices
                </h1>
            </section>

            <InvoicesTable invoices={invoices}
                setInvoices={setInvoices}
                allowDelete />
        </div>
    )
}