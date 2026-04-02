"use client"

export function RiskPill({ level }: { level?: string }) {
  if (!level) return null

  const normalized = level.toLowerCase()

  if (normalized.includes("high")) {
    return <span className="text-red-500">High</span>
  }

  if (normalized.includes("medium")) {
    return <span className="text-yellow-500">Medium</span>
  }

  if (normalized.includes("low")) {
    return <span className="text-green-500">Low</span>
  }

  return <span>{level}</span>
}