import type { AnalysisResult } from "./types"

export function normalizeAnalysisResult(data: any): AnalysisResult {
  return {
    ...data,

    crypto: data.crypto ?? {},
    ai: data.ai ?? {},
    rules: data.rules ?? {},

    vendor_bank: data.vendor_bank ?? null,
    external_verification: data.external_verification ?? null,

    forensics: data.forensics
      ? {
          ...data.forensics,
          forensic_score: data.forensics?.forensic_score ?? 0,
          metadata_score: data.forensics?.metadata_score ?? 0,
          ela_score: data.forensics?.ela_score ?? 0,
          noise_score: data.forensics?.noise_score ?? 0,
          dct_score: data.forensics?.dct_score ?? 0,
          copy_move_score: data.forensics?.copy_move_score ?? 0,
          font_score: data.forensics?.font_score ?? 0,
          text_region_score: data.forensics?.text_region_score ?? 0,
        }
      : undefined,

    highlights: data.highlights ?? [],
    spatial_highlights: data.spatial_highlights ?? [],
    document_highlights: data.document_highlights ?? [],

    scoring: data.scoring ?? undefined,
    ai_artifact: data.ai_artifact ?? undefined,
    preview: data.preview ?? undefined,
  }
}