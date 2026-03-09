import { Fingerprint } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

type VendorVerificationProps = {
  vendor_identity?: {
    status: string
    vendor_name?: string
  }
  vendor_bank?: {
    bank_account_detected: boolean
    status: string
    masked_account?: string
    bank_name?: string
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

export function VendorVerificationCard({
  vendor_identity,
  vendor_bank,
}: VendorVerificationProps) {
  const hasData = Boolean(vendor_identity || vendor_bank)

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
            No vendor verification data available.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {vendor_identity && (
              <MetricRow
                label="Vendor identity status"
                value={vendor_identity.status}
              />
            )}
            {vendor_identity?.vendor_name && (
              <MetricRow label="Vendor name" value={vendor_identity.vendor_name} />
            )}
            {vendor_bank && (
              <MetricRow
                label="Bank account detected"
                value={String(vendor_bank.bank_account_detected)}
              />
            )}
            {vendor_bank && (
              <MetricRow label="Verification status" value={vendor_bank.status} />
            )}
            {vendor_bank?.masked_account && (
              <MetricRow
                label="Masked account"
                value={vendor_bank.masked_account}
              />
            )}
            {vendor_bank?.bank_name && (
              <MetricRow label="Bank name" value={vendor_bank.bank_name} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
