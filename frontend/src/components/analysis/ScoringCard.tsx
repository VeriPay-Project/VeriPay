"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react"
import { ScoreBar } from "./ScoreBar"
import { RiskPill } from "./RiskPill"
import type { ScoringResult } from "@/components/analysis/types"

export function ScoringCard({ scoring }: { scoring?: ScoringResult }) {
  const [expanded, setExpanded] = useState(false)
  if (!scoring) return null

  const breakdown = scoring.score_breakdown ?? {}

  return (
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500">
      <CardContent className="flex h-full flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Ensemble fraud score
            </h3>
          </div>
          <RiskPill level={scoring.risk_level} />
        </div>

        <ScoreBar label="Fraud score" score={scoring.fraud_score} invert={false} />

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? "Hide" : "Show"} score breakdown
        </button>

        {expanded && (
          <div className="divide-y divide-border/40">
            {Object.entries(breakdown).map(([key, val]) => (
              <ScoreBar
                key={key}
                label={key.replace(/_/g, " ")}
                score={val as number}
                invert={false}
              />
            ))}
          </div>
        )}

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground">
          Model:{" "}
          <span className="font-mono text-foreground">{scoring.model_version}</span>
        </div>
      </CardContent>
    </Card>
  )
}