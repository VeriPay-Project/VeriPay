"use client"

import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import type { AnalysisResult, Highlight } from "@/components/analysis/types"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

function resolvePreviewUrl(path?: string | null): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path

  const base = API_BASE.replace(/\/$/, "")
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`
}

const HIGHLIGHT_STYLES: Record<
  string,
  { border: string; bg: string; dot: string; label: string }
> = {
  red: {
    border: "border-red-500/70",
    bg: "bg-red-500/10",
    dot: "bg-red-500",
    label: "bg-red-500 text-white",
  },
  amber: {
    border: "border-amber-500/70",
    bg: "bg-amber-500/10",
    dot: "bg-amber-500",
    label: "bg-amber-600 text-white",
  },
  blue: {
    border: "border-blue-500/65",
    bg: "bg-blue-500/10",
    dot: "bg-blue-500",
    label: "bg-blue-700 text-white",
  },
  coral: {
    border: "border-orange-600/65",
    bg: "bg-orange-500/10",
    dot: "bg-orange-600",
    label: "bg-orange-700 text-white",
  },
}

function getHighlightStyle(color?: string) {
  return HIGHLIGHT_STYLES[color || "blue"] ?? HIGHLIGHT_STYLES.blue
}

export function InvoiceHighlightViewer({
  result,
}: {
  result: AnalysisResult
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number } | null>(
    null
  )
  const [imageLoadFailed, setImageLoadFailed] = useState(false)

  const allHighlights: Highlight[] =
    result.highlights && result.highlights.length > 0
      ? result.highlights
      : [
        ...(result.spatial_highlights ?? []),
        ...(result.document_highlights ?? []),
      ]

  const bboxHighlights = allHighlights.filter((h) => h.bbox !== null)
  const docHighlights = allHighlights.filter((h) => h.bbox === null)

  const previewUrl = resolvePreviewUrl(result.preview?.image_path)
  const hasPreview = Boolean(previewUrl && !imageLoadFailed)

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImgDims({ w: img.clientWidth, h: img.clientHeight })
    setNaturalDims({
      w: result.preview?.width || img.naturalWidth,
      h: result.preview?.height || img.naturalHeight,
    })
  }

  const handleImageError = () => {
    setImageLoadFailed(true)
    setImgDims(null)
    setNaturalDims(null)
  }

  const scaleBox = (bbox: [number, number, number, number]) => {
    if (!imgDims || !naturalDims) return null

    const scaleX = imgDims.w / naturalDims.w
    const scaleY = imgDims.h / naturalDims.h

    return {
      left: bbox[0] * scaleX,
      top: bbox[1] * scaleY,
      width: bbox[2] * scaleX,
      height: bbox[3] * scaleY,
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {(result.preview?.source_type ?? result.file_type).toUpperCase()}
          </span>
          {result.preview?.total_pages ? (
            <>
              {" · "}
              Page {result.preview.page ?? 1} of {result.preview.total_pages}
            </>
          ) : null}
          {result.preview?.width && result.preview?.height ? (
            <>
              {" · "}
              {result.preview.width}×{result.preview.height}
            </>
          ) : null}
          {result.preview?.loader ? (
            <>
              {" · "}
              {result.preview.loader}
            </>
          ) : null}
        </div>

        <div className="relative overflow-hidden rounded-lg border border-border/40 bg-black/5">
          {hasPreview ? (
            <div className="relative max-h-[720px] overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl ?? undefined}
                alt="Invoice preview"
                className="h-auto w-full object-contain"
                onLoad={handleImageLoad}
                onError={handleImageError}
              />

              {imgDims &&
                naturalDims &&
                bboxHighlights.map((hl, idx) => {
                  if (!hl.bbox) return null

                  const scaled = scaleBox(hl.bbox)
                  if (!scaled) return null

                  const style = getHighlightStyle(hl.color)
                  const isActive = activeIdx === idx

                  return (
                    <div
                      key={idx}
                      className={`absolute cursor-pointer rounded-sm border-2 transition-all duration-150 hover:scale-[1.01]
                        ${style.border} ${style.bg}
                        ${isActive
                          ? "opacity-100 ring-2 ring-current ring-offset-1"
                          : "opacity-70 hover:opacity-100"
                        }
                      `}
                      style={{
                        left: scaled.left,
                        top: scaled.top,
                        width: scaled.width,
                        height: scaled.height,
                        zIndex: isActive ? 20 : 10,
                      }}
                      onClick={() => setActiveIdx(isActive ? -1 : idx)}
                      title={hl.message}
                    >
                      {isActive && (
                        <span
                          className={`absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${style.label}`}
                        >
                          {hl.type.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center px-6 py-10 text-center">
              <div className="flex max-w-sm flex-col items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {previewUrl ? "Preview unavailable" : "Preview not generated"}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {previewUrl
                    ? "The analysis completed, but the returned preview image could not be loaded."
                    : "The invoice preview could not be generated for this analysis run."}
                </p>
                {result.forensics?.image_reason && (
                  <p className="rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    {result.forensics.image_reason}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full flex-col gap-3 overflow-y-auto pr-1 lg:max-h-[720px]">
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{allHighlights.length}</span>{" "}
          signal{allHighlights.length !== 1 ? "s" : ""} detected
          {" · "}
          <span className="font-medium text-foreground">
            {bboxHighlights.length}
          </span>{" "}
          with region
        </div>

        <div className="flex flex-wrap gap-2 text-[10px]">
          {(["red", "amber", "blue", "coral"] as const).map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-sm ${HIGHLIGHT_STYLES[c].dot}`} />
              <span className="text-muted-foreground capitalize">
                {c === "red"
                  ? "Manipulation"
                  : c === "amber"
                    ? "AI artifact"
                    : c === "blue"
                      ? "Forensic"
                      : "Rules"}
              </span>
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          {bboxHighlights.length > 0 && !hasPreview && (
            <div className="rounded-lg border border-border/40 bg-background px-3 py-3 text-[10px] leading-relaxed text-muted-foreground">
              Spatial findings were generated, but the preview image is unavailable so
              overlays cannot be shown.
            </div>
          )}

          {bboxHighlights.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Region findings
              </p>
              <div className="flex flex-col gap-1.5">
                {bboxHighlights.map((hl, idx) => {
                  const style = getHighlightStyle(hl.color)
                  const isActive = activeIdx === idx

                  return (
                    <button
                      key={`${hl.type}-${idx}`}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition-all duration-150
                        ${isActive
                          ? `${style.border} ${style.bg}`
                          : "border-border/40 bg-background hover:bg-muted/60"
                        }`}
                      onClick={() => setActiveIdx(isActive ? -1 : idx)}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                        />
                        <span className="text-[11px] font-semibold text-foreground truncate">
                          {hl.type.replace(/_/g, " ")}
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          {(hl.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        {hl.message}
                      </p>
                      <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground/60">
                        {hl.source} · region
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {docHighlights.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Document findings
              </p>
              <div className="flex flex-col gap-1.5">
                {docHighlights.map((hl, idx) => {
                  const style = getHighlightStyle(hl.color)

                  return (
                    <div
                      key={`${hl.type}-doc-${idx}`}
                      className="w-full rounded-lg border border-border/40 bg-background px-3 py-3 text-left"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                        />
                        <span className="text-[11px] font-semibold text-foreground truncate">
                          {hl.type.replace(/_/g, " ")}
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          {(hl.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        {hl.message}
                      </p>
                      <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground/60">
                        {hl.source} · document
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {result.highlight_summary && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground">
              Total:{" "}
              <span className="font-medium text-foreground">
                {result.highlight_summary.total}
              </span>
              {" · "}Spatial:{" "}
              <span className="font-medium text-foreground">
                {result.highlight_summary.spatial_count}
              </span>
              {" · "}Document:{" "}
              <span className="font-medium text-foreground">
                {result.highlight_summary.document_count}
              </span>
            </div>
          )}

          {allHighlights.length === 0 && (
            <div className="rounded-lg border border-border/40 bg-background px-3 py-4 text-xs text-muted-foreground">
              No detected signals were generated for this invoice.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}