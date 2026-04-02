"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Microscope, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"

import { ScoreBar } from "./ScoreBar"
import { RiskPill } from "./RiskPill"
import type { ForensicsResult } from "@/components/analysis/types"

export function ForensicsCard({ forensics }: { forensics?: ForensicsResult }) {
  const [layersExpanded, setLayersExpanded] = useState(false)
  if (!forensics) return null

  // Use layer_scores for triggered badges if available, fall back to flat scores
  const ls = forensics.layer_scores ?? {}

  return (
    <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500">
      <CardContent className="flex h-full flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Microscope className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Forensic analysis
            </h3>
          </div>
          <RiskPill level={forensics.risk_level} />
        </div>

        <ScoreBar
          label="Forensic risk score"
          score={forensics.forensic_score}
          invert={false}
        />

        {/* Per-layer scores with triggered badges */}
        <div className="divide-y divide-border/40">
          <ScoreBar
            label="ELA (recompression)"
            score={forensics.ela_score}
            invert={false}
            triggered={ls?.ela?.triggered}
          />
          <ScoreBar
            label="Font inconsistency"
            score={forensics.font_score}
            invert={false}
            triggered={ls?.font?.triggered}
          />
          <ScoreBar
            label="Noise inconsistency"
            score={forensics.noise_score}
            invert={false}
            triggered={ls?.noise?.triggered}
          />
          <ScoreBar
            label="Text rendering"
            score={forensics.text_region_score}
            invert={false}
            triggered={ls?.text?.triggered}
          />
          <ScoreBar
            label="Metadata anomaly"
            score={forensics.metadata_score}
            invert={false}
            triggered={ls?.metadata?.triggered}
          />
        </div>

        {/* Advanced layers — collapsible since they're often 0 */}
        <button
          onClick={() => setLayersExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {layersExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {layersExpanded ? "Hide" : "Show"} advanced layers
          {forensics.advanced_used && (
            <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
              ran
            </span>
          )}
        </button>

        {layersExpanded && (
          <div className="divide-y divide-border/40">
            <ScoreBar
              label="DCT artifacts"
              score={forensics.dct_score}
              invert={false}
              triggered={ls?.dct?.triggered}
            />
            <ScoreBar
              label="Copy-move forgery"
              score={forensics.copy_move_score}
              invert={false}
              triggered={ls?.copy_move?.triggered}
            />
            {forensics.input_quality !== undefined && (
              <ScoreBar
                label="Input quality"
                score={forensics.input_quality}
                invert={true}
              />
            )}
          </div>
        )}

        {/* Risk reasons from cross-signal boosts + tier overrides */}
        {forensics.risk_reasons && forensics.risk_reasons.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2">
            <li className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Risk reasons
            </li>
            {forensics.risk_reasons.map((reason, idx) => (
              <li key={idx} className="text-xs leading-relaxed text-muted-foreground">
                &bull; {reason}
              </li>
            ))}
          </ul>
        )}

        {/* Triggered signal list */}
        {forensics.signals && forensics.signals.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2">
            {forensics.signals.map((signal, idx) => (
              <li key={idx} className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">
                  {signal.type.replace(/_/g, " ")}
                </span>
                {" — "}
                {signal.message}
              </li>
            ))}
          </ul>
        )}

        {/* Quality warnings */}
        {forensics.quality_warnings && forensics.quality_warnings.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
            {forensics.quality_warnings.map((w, idx) => (
              <li key={idx} className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}

        {forensics.image_analyzed === false && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            {forensics.image_reason ??
              "Visual analysis unavailable — image could not be extracted"}
          </p>
        )}
      </CardContent>
    </Card>
  )
}