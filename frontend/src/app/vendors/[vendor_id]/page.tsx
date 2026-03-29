"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import AddBankBindingModal from "@/components/AddBankBindingModal"
import { Loader2 } from "lucide-react"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

type Vendor = {
  vendor_id: number
  vendor_name: string
  public_key_fingerprint: string | null
  status: string
  created_at?: string
  updated_at?: string
}

type BankBinding = {
  id: number
  bank_name: string | null
  account_holder_name: string | null
  account_masked: string
  account_type: string | null
  currency: string | null
  country: string | null
  verification_status: string
  verified_at?: string | null
  is_active: boolean
  created_at: string
}

export default function VendorPage() {
  const params = useParams()
  const vendorIdParam = params?.vendor_id
  const vendorId = Array.isArray(vendorIdParam) ? vendorIdParam[0] : vendorIdParam

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [bindings, setBindings] = useState<BankBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchVendor = useCallback(async () => {
    if (!vendorId) {
      return
    }

    const res = await fetch(
      `${API_BASE}/vendors/${vendorId}`,
      { credentials: "include" }
    )

    if (!res.ok) throw new Error("Vendor not found")

    const data = await res.json()
    setVendor(data)
  }, [vendorId])

  const fetchBindings = useCallback(async () => {
    if (!vendorId) {
      return
    }

    const res = await fetch(
      `${API_BASE}/vendors/${vendorId}/bank-bindings`,
      { credentials: "include" }
    )

    if (!res.ok) throw new Error("Failed to load bank bindings")

    const data = await res.json()
    setBindings(data)
  }, [vendorId])

  useEffect(() => {
    const load = async () => {
      if (!vendorId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        await fetchVendor()
        await fetchBindings()

      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unexpected error")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [fetchBindings, fetchVendor, vendorId])

  if (!vendorId) {
    return <div className="p-8 text-sm">Invalid vendor ID</div>
  }

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

  if (!vendor) return null

  const activeBindings = bindings
    .filter(b => b.is_active)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    )

  const activeBinding = activeBindings[0] ?? null

  const inactiveBindings = bindings
    .filter(b => !b.is_active)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    )

  return (
    <div className="p-8 space-y-8">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">
            {vendor.vendor_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Vendor ID #{vendor.vendor_id}
          </p>
        </div>
        <Badge variant={vendor.status === "active" ? "default" : "secondary"}>
          {vendor.status.toUpperCase()}
        </Badge>
      </div>

      <Separator />

      {/* Vendor Info */}
      <Card>
        <CardHeader>
          <CardTitle>Vendor Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-6 text-sm">
          <Info label="Legal Name" value={vendor.vendor_name} />
          <Info
            label="Certificate"
            value={vendor.public_key_fingerprint ? "Uploaded" : "Not uploaded"}
          />
        </CardContent>
      </Card>

      {/* Bank Binding */}
      <Card>
        <CardHeader className="flex justify-between items-center">
          <CardTitle>Bank Binding</CardTitle>
          <Button size="lg" onClick={() => setModalOpen(true)} disabled={modalOpen}>
            Add Binding
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">

          {activeBinding ? (
            <div className="border rounded-md p-4 space-y-3">
              <div className="flex justify-between">
                <h3 className="font-medium">Active Binding</h3>
                <Badge
                  variant={
                    activeBinding.verification_status === "verified"
                      ? "default"
                      : activeBinding.verification_status === "pending"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {activeBinding.verification_status.toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <Info label="Bank" value={activeBinding.bank_name || "—"} />
                <Info
                  label="Account Holder"
                  value={activeBinding.account_holder_name || "—"}
                />
                <Info
                  label="Masked Account"
                  value={activeBinding.account_masked}
                />
                <Info
                  label="Account Type"
                  value={activeBinding.account_type || "—"}
                />
                <Info
                  label="Currency"
                  value={activeBinding.currency || "—"}
                />
                <Info
                  label="Country"
                  value={activeBinding.country || "—"}
                />
                <Info
                  label="Verified At"
                  value={activeBinding.verified_at || "—"}
                />
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No active bank binding registered.
            </div>
          )}

          {inactiveBindings.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">
                Previous Bindings
              </h4>

              <div className="border rounded-md divide-y">
                {inactiveBindings.map(binding => (
                  <div
                    key={binding.id}
                    className="p-3 flex justify-between text-sm"
                  >
                    <div>
                      {binding.bank_name || "Unknown Bank"} — {binding.account_masked}
                    </div>
                    <Badge variant="secondary">
                      INACTIVE
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle>Security & Certificate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Info
            label="Fingerprint"
            value={vendor.public_key_fingerprint}
          />
        </CardContent>
      </Card>

      <AddBankBindingModal
        vendorId={vendor.vendor_id}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={async () => {
          await fetchBindings()
        }}
      />

    </div>
  )
}

function Info({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium break-all">{value || "Not provided"}</p>
    </div>
  )
}
