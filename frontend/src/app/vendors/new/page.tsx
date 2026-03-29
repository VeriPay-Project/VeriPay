"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

export default function VendorCreatePage() {
  const router = useRouter()

  const [vendorName, setVendorName] = useState("")
  const [certificateFile, setCertificateFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!vendorName.trim()) {
      setError("Vendor name is required.")
      return
    }

    try {
      setLoading(true)
      setError(null)

      const formData = new FormData()
      formData.append("vendor_name", vendorName)
      if (certificateFile) {
        formData.append("certificate", certificateFile)
      }

      const res = await fetch(`${API_BASE}/vendors/`, {
        method: "POST",
        credentials: "include",
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.detail || "Failed to create vendor")
      }

      // Redirect to vendor detail page
      router.push(`/vendors/${data.vendor_id}`)

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 flex justify-center">
      <Card className="w-full max-w-lg space-y-4">
        <CardHeader>
          <CardTitle>Create Vendor</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">

          <Input
            placeholder="Vendor Legal Name"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
          />

          <Input
            type="file"
            accept=".pem,.der,.crt,.cer"
            onChange={(e) => {
              setCertificateFile(e.target.files?.[0] ?? null)
            }}
          />

          <p className="text-xs text-muted-foreground">
            Certificate upload is optional. Supported formats: `.pem`, `.der`, `.crt`, `.cer`.
          </p>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

        </CardContent>

        <CardFooter>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating...
              </>
            ) : (
              "Create Vendor"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
