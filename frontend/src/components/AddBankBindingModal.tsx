"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

type PlaidHandler = {
  open: () => void
}

type PlaidExitError = {
  error_message?: string | null
  display_message?: string | null
}

type PlaidMetadata = {
  institution?: {
    name?: string
    institution_id?: string
  } | null
}

type PlaidCreateConfig = {
  token: string
  onSuccess: (publicToken: string, metadata: PlaidMetadata) => void
  onExit: (error: PlaidExitError | null, metadata: PlaidMetadata) => void
}

declare global {
  interface Window {
    Plaid?: {
      create: (config: PlaidCreateConfig) => PlaidHandler
    }
  }
}

interface Props {
  vendorId: number
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddBankBindingModal({
  vendorId,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [country, setCountry] = useState("CA")

  // Common fields
  const [bankName, setBankName] = useState("")
  const [accountHolderName, setAccountHolderName] = useState("")
  const [currency, setCurrency] = useState("CAD")

  // Canada
  const [institutionNumber, setInstitutionNumber] = useState("")
  const [transitNumber, setTransitNumber] = useState("")
  const [accountNumber, setAccountNumber] = useState("")

  // US
  const [routingNumber, setRoutingNumber] = useState("")

  // IBAN
  const [iban, setIban] = useState("")

  const [loading, setLoading] = useState(false)
  const [plaidLoading, setPlaidLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 🔥 Auto-set currency based on country
  useEffect(() => {
    if (country === "CA") {
      setCurrency("CAD")
    } else if (country === "US") {
      setCurrency("USD")
    } else {
      setCurrency("")
    }
  }, [country])

  const exchangePlaidPublicToken = async (publicToken: string) => {
    try {
      setPlaidLoading(true)
      setError(null)

      const exchangeRes = await fetch(
        `${API_BASE}/vendors/${vendorId}/plaid/exchange`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ public_token: publicToken }),
        }
      )

      const exchangeData = await exchangeRes.json()
      if (!exchangeRes.ok) {
        throw new Error(exchangeData.detail || "Failed to connect bank with Plaid")
      }

      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected Plaid error")
    } finally {
      setPlaidLoading(false)
    }
  }

  const handlePlaidConnect = async () => {
    try {
      setPlaidLoading(true)
      setError(null)

      const res = await fetch(
        `${API_BASE}/vendors/${vendorId}/plaid/link-token`,
        {
          method: "POST",
          credentials: "include",
        }
      )

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || "Failed to initialize Plaid Link")
      }

      if (!window.Plaid?.create) {
        throw new Error("Plaid Link is not available yet. Please try again.")
      }

      const handler = window.Plaid.create({
        token: data.link_token,
        onSuccess: (publicToken: string) => {
          void exchangePlaidPublicToken(publicToken)
        },
        onExit: (plaidError) => {
          if (plaidError) {
            const message =
              plaidError.display_message ||
              plaidError.error_message ||
              "Plaid connection was cancelled."
            setError(message)
          }
          setPlaidLoading(false)
        },
      })

      handler.open()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected Plaid error")
      setPlaidLoading(false)
    }
  }

  const buildAccountIdentifier = () => {
    if (country === "CA") {
      if (!institutionNumber || !transitNumber || !accountNumber) {
        throw new Error("All Canadian banking fields are required")
      }
      return `${institutionNumber}-${transitNumber}-${accountNumber}`
    }

    if (country === "US") {
      if (!routingNumber || !accountNumber) {
        throw new Error("Routing and account number are required")
      }
      return `${routingNumber}-${accountNumber}`
    }

    if (!iban) {
      throw new Error("IBAN is required")
    }

    return iban
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)
      setError(null)

      const accountIdentifier = buildAccountIdentifier()

      const res = await fetch(
        `${API_BASE}/vendors/${vendorId}/bank-binding`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_identifier: accountIdentifier,
            bank_name: bankName,
            account_type: country === "OTHER" ? "iban" : "local",
            currency,
            country,
            account_holder_name: accountHolderName,
          }),
        }
      )

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.detail || "Failed to register binding")
      }

      if (data.status === "already_registered") {
        setError("This bank account is already registered.")
        setLoading(false)
        return
      }

      onSuccess()
      onClose()

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error")
    } finally {
      setLoading(false)
    }
  }

  const renderFields = () => {
    if (country === "CA") {
      return (
        <>
          <Input
            placeholder="Institution Number (3 digits)"
            value={institutionNumber}
            onChange={(e) => setInstitutionNumber(e.target.value)}
          />
          <Input
            placeholder="Transit Number (5 digits)"
            value={transitNumber}
            onChange={(e) => setTransitNumber(e.target.value)}
          />
          <Input
            placeholder="Account Number"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
        </>
      )
    }

    if (country === "US") {
      return (
        <>
          <Input
            placeholder="Routing Number (9 digits)"
            value={routingNumber}
            onChange={(e) => setRoutingNumber(e.target.value)}
          />
          <Input
            placeholder="Account Number"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
        </>
      )
    }

    return (
      <Input
        placeholder="IBAN"
        value={iban}
        onChange={(e) => setIban(e.target.value)}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="space-y-6">
        <DialogHeader>
          <DialogTitle>Add Bank Binding</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          <Button
            onClick={handlePlaidConnect}
            disabled={loading || plaidLoading}
            className="w-full bg-blue-600 text-white hover:bg-blue-700"
          >
            {plaidLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting with Plaid...
              </>
            ) : (
              "Connect Bank with Plaid"
            )}
          </Button>

          <p className="text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Or enter bank details manually
          </p>

          {/* Country Selector */}
          <select
            className="w-full border rounded-md p-2 text-sm"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="CA">Canada</option>
            <option value="US">United States</option>
            <option value="OTHER">Other (IBAN)</option>
          </select>

          {/* Dynamic Fields */}
          {renderFields()}

          <Input
            placeholder="Bank Name"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          />

          <Input
            placeholder="Account Holder Name"
            value={accountHolderName}
            onChange={(e) => setAccountHolderName(e.target.value)}
          />

          <Input
            placeholder="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={country === "CA" || country === "US"}
          />

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <Button onClick={handleSubmit} disabled={loading || plaidLoading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Save Binding"
            )}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  )
}
