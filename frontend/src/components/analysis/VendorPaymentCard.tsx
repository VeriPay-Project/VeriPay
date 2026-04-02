import { Fingerprint } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

type VendorPaymentCardProps = {
  vendor_bank?: {
    bank_account_detected?: boolean | null
    status?: string | null
    verification_status?: string | null
    vendor_identity_status?: string | null
    masked_account?: string | null
    bank_name?: string | null
    country?: string | null
    account_type?: string | null
  }
  external_verification?: {
    success?: boolean
    bank_name?: string
    bic?: string
    country?: string
    confidence?: string
  }
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

function displayValue(value: string | null | undefined): string {
  if (!value) return "N/A"
  return value
}

function displayBoolean(value: boolean | null | undefined): string {
  if (typeof value !== "boolean") return "N/A"
  return value ? "Yes" : "No"
}

function formatStatus(value: string | null | undefined): string {
  if (!value) return "N/A"

  const formattedStatuses: Record<string, string> = {
    vendor_unknown: "Vendor unknown",
    vendor_verified: "Vendor verified",
    not_applicable: "Not applicable",
    no_bank_registered: "No bank registered",
    verified_high_trust: "Verified (high trust)",
    bank_mismatch: "Bank mismatch",
    verified: "Verified",
    local: "Local account",
    iban: "IBAN",
    high: "High",
    medium: "Medium",
    low: "Low",
  }

  if (formattedStatuses[value]) {
    return formattedStatuses[value]
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatCountry(value: string | null | undefined): string {
  if (!value) return "N/A"

  const formattedCountries: Record<string, string> = {
    US: "United States",
    CA: "Canada",
    OTHER: "International",
  }

  return formattedCountries[value] ?? value
}

export function VendorPaymentCard({
  vendor_bank,
  external_verification,
}: VendorPaymentCardProps) {
  const hasData = Boolean(vendor_bank || external_verification)
  const verificationStatus =
    vendor_bank?.verification_status ?? vendor_bank?.status

  return (
    <Card
      className="
        border-0 bg-card/65 shadow-sm backdrop-blur-xl
        motion-safe:animate-in
        motion-safe:fade-in
        motion-safe:zoom-in-95
        duration-500
        delay-200
      "
    >
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Fingerprint className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            Vendor payment verification
          </h3>
        </div>

        {!hasData ? (
          <p className="text-xs text-muted-foreground">
            No vendor payment verification data available.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {vendor_bank?.vendor_identity_status && (
              <MetricRow
                label="Vendor status"
                value={formatStatus(vendor_bank.vendor_identity_status)}
              />
            )}

            {vendor_bank && (
              <>
                <MetricRow
                  label="Bank account detected"
                  value={displayBoolean(vendor_bank.bank_account_detected)}
                />
                <MetricRow
                  label="Verification status"
                  value={formatStatus(verificationStatus)}
                />
              </>
            )}

            {vendor_bank?.masked_account && (
              <MetricRow
                label="Masked account"
                value={vendor_bank.masked_account}
              />
            )}

            {vendor_bank?.bank_name && (
              <MetricRow
                label="Matched bank"
                value={displayValue(vendor_bank.bank_name)}
              />
            )}

            {vendor_bank?.country && (
              <MetricRow
                label="Country"
                value={formatCountry(vendor_bank.country)}
              />
            )}

            {vendor_bank?.account_type && (
              <MetricRow
                label="Account type"
                value={formatStatus(vendor_bank.account_type)}
              />
            )}

            {external_verification && (
              <>
                <MetricRow
                  label="Registry lookup"
                  value={displayBoolean(external_verification.success)}
                />
                {external_verification.bank_name && (
                  <MetricRow
                    label="Registry bank"
                    value={displayValue(external_verification.bank_name)}
                  />
                )}
                {external_verification.bic && (
                  <MetricRow
                    label="BIC / SWIFT"
                    value={displayValue(external_verification.bic)}
                  />
                )}
                {external_verification.country && (
                  <MetricRow
                    label="Registry country"
                    value={displayValue(external_verification.country)}
                  />
                )}
                {external_verification.confidence && (
                  <MetricRow
                    label="Registry confidence"
                    value={formatStatus(external_verification.confidence)}
                  />
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
