"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Building2, Plus, Loader2 } from "lucide-react"

const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

type Vendor = {
    vendor_id: number
    vendor_name: string
    status: string
}

type VendorBindingSummary = {
    vendor_id: number
    has_active_binding: boolean
    verification_status?: string
}

export default function VendorsPage() {
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchVendors = async () => {
            try {
                const res = await fetch(`${API_BASE}/vendors`, {
                    credentials: "include",
                })

                if (!res.ok) throw new Error("Failed to load vendors")

                const data = await res.json()
                setVendors(data)
            } catch (err: any) {
                setError(err.message || "Unexpected error")
            } finally {
                setLoading(false)
            }
        }

        fetchVendors()
    }, [])

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-8 text-destructive text-sm">
                {error}
            </div>
        )
    }

    return (
        <div className="p-8 space-y-8">

            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-semibold">Vendors</h1>
                    <p className="text-sm text-muted-foreground">
                        Manage vendor identities and payment bindings
                    </p>
                </div>

                <Link href="/vendors/new">
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        New Vendor
                    </Button>
                </Link>
            </div>

            <Separator />

            {/* Vendor Grid */}
            {vendors.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <Building2 className="h-8 w-8 text-muted-foreground mb-3" />
                        <p className="text-sm font-medium text-foreground">
                            No vendors registered yet
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Create your first vendor to begin invoice verification.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {vendors.map((vendor) => (
                        <Link
                            key={vendor.vendor_id}
                            href={`/vendors/${vendor.vendor_id}`}
                        >
                            <Card className="cursor-pointer transition hover:shadow-md hover:-translate-y-[2px]">
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-base">
                                            {vendor.vendor_name}
                                        </CardTitle>

                                        <Badge
                                            variant={
                                                vendor.status === "active"
                                                    ? "default"
                                                    : "secondary"
                                            }
                                        >
                                            {vendor.status?.toUpperCase() ?? "UNKNOWN"}
                                        </Badge>
                                    </div>
                                </CardHeader>

                                <CardContent className="space-y-2 text-sm text-muted-foreground">
                                    <p>Vendor ID: #{vendor.vendor_id}</p>

                                    {/* Placeholder stats */}
                                    <div className="flex justify-between">
                                        <span>Invoices</span>
                                        <span className="font-medium text-foreground">—</span>
                                    </div>

                                    <div className="flex justify-between">
                                        <span>Active Binding</span>
                                        <span className="font-medium text-foreground">—</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}