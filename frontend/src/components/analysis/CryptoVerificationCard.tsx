"use client"

import { useEffect, useState } from "react"
import { Fingerprint, ShieldCheck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

type CryptoVerificationCardProps = {
  crypto?: {
    signature_present?: boolean
    signature_integrity?: string
    certificate_trust?: string
    signer_identity?: string
    signer_fingerprint?: string | null
  }
  showTrustBar?: boolean
}

function displayValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "N/A"
  return String(value)
}

function MetricRow({
  label,
  value,
  tooltip,
}: {
  label: string
  value: string
  tooltip?: string
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span
        title={tooltip}
        className={`text-[11px] font-medium uppercase tracking-wider text-muted-foreground ${tooltip ? "cursor-help" : ""}`}
      >
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

function CryptoTrustBar({ trust }: { trust?: string }) {
  const [animatedValue, setAnimatedValue] = useState(0)
  const normalized = trust?.toLowerCase() ?? ""

  let target: number | null = null

  if (normalized.includes("trusted")) target = 95
  else if (normalized.includes("valid")) target = 85
  else if (normalized.includes("warning")) target = 60
  else if (normalized.includes("untrusted")) target = 30
  else if (normalized.includes("invalid")) target = 15

  useEffect(() => {
    if (target === null) return

    const finalTarget = target
    const duration = 800
    const startTime = performance.now()

    function animate(time: number) {
      const progress = Math.min((time - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedValue(finalTarget * eased)
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [target])

  if (target === null) return null

  const color =
    target >= 80
      ? "bg-emerald-500"
      : target >= 50
        ? "bg-amber-500"
        : "bg-red-500"

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Certificate trust level
        </span>
        <span className="text-sm font-semibold text-foreground">{target}%</span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${animatedValue}%` }}
        />
      </div>
    </div>
  )
}

export function CryptoVerificationCard({
  crypto,
  showTrustBar = false,
}: CryptoVerificationCardProps) {
  const hasData = Boolean(crypto)

  return (
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500 delay-75">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            Cryptographic verification
          </h3>
        </div>

        {!hasData ? (
          <p className="text-xs text-muted-foreground">
            No cryptographic verification data available.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border/40">
              <MetricRow
                label="Signature present"
                value={displayValue(crypto?.signature_present)}
              />
              <MetricRow
                label="Signature integrity"
                value={displayValue(crypto?.signature_integrity)}
              />
              {showTrustBar &&
                crypto?.signature_present &&
                crypto.signature_integrity === "valid" &&
                crypto.certificate_trust && (
                  <CryptoTrustBar trust={crypto.certificate_trust} />
                )}
              <MetricRow
                label="Certificate trust"
                value={displayValue(crypto?.certificate_trust)}
              />
              <MetricRow
                label="Signer verification status"
                value={displayValue(crypto?.signer_identity)}
                tooltip="Indicates whether the invoice was cryptographically signed by a known vendor."
              />
            </div>

            {crypto?.signer_fingerprint && (
              <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Fingerprint className="h-3 w-3" />
                  Signer fingerprint
                </span>
                <span className="truncate font-mono text-xs text-foreground">
                  {crypto.signer_fingerprint}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
