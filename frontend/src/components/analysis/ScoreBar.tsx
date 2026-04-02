"use client"

import { useEffect, useState } from "react"

export function ScoreBar({
  label,
  score,
  invert = false,
  triggered,
}: {
  label: string
  score?: number
  invert?: boolean
  triggered?: boolean
}) {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    if (score === undefined || score === null) return

    const end = Math.min(Math.max(score * 100, 0), 100)
    const startTime = performance.now()

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / 900, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimated(end * eased)
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [score])

  if (score === undefined || score === null) return null

  const pct = animated

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{(pct / 100).toFixed(2)}</span>
      </div>

      <div className="h-2 w-full bg-muted rounded-full">
        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}