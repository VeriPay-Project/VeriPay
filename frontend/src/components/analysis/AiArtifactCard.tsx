"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Sparkles, AlertTriangle } from "lucide-react"

import { ScoreBar } from "./ScoreBar"
import { RiskPill } from "./RiskPill"
import type { AIArtifactResult } from "@/components/analysis/types"

export function AiArtifactCard({
  artifact,
}: {
  artifact?: AIArtifactResult
}) {
  if (!artifact) return null

  return (
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500">
      <CardContent className="flex h-full flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            AI artifact detection
          </h3>
        </div>

        {artifact.status === "skipped" || artifact.status === "insufficient_text" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            {artifact.reason ?? artifact.reasoning ?? "Insufficient text for analysis"}
          </p>
        ) : (
          <>
            <ScoreBar
              label="AI text score"
              score={artifact.ai_text_score}
              invert={false}
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Risk level
              </span>
              <RiskPill level={artifact.risk_level} />
            </div>

            {(artifact.perplexity_risk !== undefined ||
              artifact.burstiness_risk !== undefined ||
              artifact.repetition_score !== undefined) && (
                <div className="divide-y divide-border/40">
                  <ScoreBar
                    label="Perplexity risk"
                    score={artifact.perplexity_risk}
                    invert={false}
                  />
                  <ScoreBar
                    label="Burstiness risk"
                    score={artifact.burstiness_risk}
                    invert={false}
                  />
                  <ScoreBar
                    label="Repetition"
                    score={artifact.repetition_score}
                    invert={false}
                  />
                </div>
              )}

            {artifact.reasoning && (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                {artifact.reasoning}
              </p>
            )}

            {artifact.signals?.length ? (
              <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2">
                {artifact.signals.map((signal, idx) => (
                  <li
                    key={idx}
                    className="text-xs leading-relaxed text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">
                      {signal.type.replace(/_/g, " ")}
                    </span>
                    {" — "}
                    {signal.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}