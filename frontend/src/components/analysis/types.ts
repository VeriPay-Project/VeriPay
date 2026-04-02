// VeriPay — shared analysis types
// Merged from types.ts (uploaded) + inline types (pasted)
// Source of truth for all analysis result shapes.

export type Highlight = {
    bbox: [number, number, number, number] | null
    type: string
    confidence: number
    source: string
    message: string
    color: "red" | "amber" | "blue" | "coral" | string
}

export type ForensicSignal = {
    type: string
    message: string
    confidence: number
}

export type ForensicLayerScore = {
    score: number
    confidence: number
    triggered: boolean
}

export type ForensicsResult = {
    status: string
    forensic_score?: number
    risk_level?: string
    risk_reasons?: string[]
    input_quality?: number
    quality_warnings?: string[]
    advanced_used?: boolean

    // Flat per-layer scores (for score bars in UI)
    metadata_score?: number
    ela_score?: number
    noise_score?: number
    dct_score?: number
    copy_move_score?: number
    font_score?: number
    text_region_score?: number

    // Full layer breakdown (for debug / expanded UI)
    layer_scores?: Record<string, ForensicLayerScore>

    image_analyzed?: boolean
    image_reason?: string

    signals: ForensicSignal[]
    // might need to undo
    highlights?: Highlight[]
    spatial_highlights?: Highlight[]
    document_highlights?: Highlight[]   // backward compat = spatial + document
}

export type AIArtifactResult = {
    status: string
    ai_text_score: number
    risk_level?: string
    perplexity_risk?: number
    burstiness_risk?: number
    repetition_score?: number
    diversity_risk?: number
    punctuation_score?: number
    reasoning?: string
    reason?: string   // backward compat alias
    signals?: { type: string; message: string; confidence?: number }[]
}

export type AIResult = {
    status: string
    anomaly_score?: number
    risk_level?: string
    review_required?: boolean
    embedding_distance?: number
    distance_z_score?: number
    explanations?: string[]
    message?: string
}

export type RulesChecks = {
    subtotal_matches_items?: boolean | null
    total_matches_subtotal_tax?: boolean | null
    subtotal_delta?: number | null
    total_delta?: number | null
}

export type RulesResult = {
    status: string
    message?: string
    word_count?: number
    font_count?: number
    fonts?: string[]
    line_item_count?: number
    line_item_sum?: number | null
    subtotal?: number | null
    tax?: number | null
    total?: number | null
    checks?: RulesChecks
}

export type CryptoResult = {
    signature_present: boolean
    signature_integrity: string
    certificate_trust: string
    signer_fingerprint?: string | null
    signer_identity?: string
    vendor_status?: string
}

export type VendorBankResult = {
    vendor_identity_status?: string | null
    verification_status?: string | null
    status?: string | null
    masked_account?: string | null
    bank_name?: string | null
    country?: string | null
    account_type?: string | null
}

export type IssuerPayeeBinding = {
    status?: string
    flags?: string[]
    vendor_name?: string
}

export type ExternalVerification = {
    success?: boolean
    bank_name?: string
    bic?: string
    country?: string
    confidence?: string
}

export type ScoringResult = {
    fraud_score: number
    risk_level: string
    prediction: number
    model_version: string
    score_breakdown?: Record<string, number>
    weights_used?: Record<string, number>
}

export type PreviewResult = {
    image_path: string
    width: number
    height: number
    page?: number
    total_pages?: number
    dpi?: number | null
    source_type?: string
    loader?: string
}

export type HighlightSummary = {
    total: number
    spatial_count: number
    document_count: number
    top_confidence: number
    sources?: string[]
}

export type SemanticData = {
    vendor_name?: string | null
    customer_name?: string | null
    invoice_date?: string | null
    invoice_number?: string | null
    subtotal?: string | number | null
    tax?: string | number | null
    total_amount?: string | number | null
    currency?: string | null
    bank_name?: string | null
    bank_account?: string | null
}

export type FraudFlag = {
    rule_code: string
    message: string
}

export type AnalysisResult = {
    invoice_id: number
    file_type: string

    crypto: CryptoResult
    ai: AIResult
    rules: RulesResult

    vendor_identity?: { status: string; vendor_name?: string }
    vendor_bank?: VendorBankResult
    issuer_payee_binding?: IssuerPayeeBinding
    external_verification?: ExternalVerification

    // Semantic extraction — both flat (legacy) and nested forms
    semantic?: SemanticData
    semantic_vendor_name?: string | null
    semantic_customer_name?: string | null
    semantic_invoice_date?: string | null
    semantic_invoice_number?: string | null
    semantic_subtotal?: string | null
    semantic_tax?: string | null
    semantic_total_amount?: string | null
    semantic_currency?: string | null
    semantic_bank_name?: string | null
    semantic_bank_account?: string | null

    preview?: PreviewResult

    forensics?: ForensicsResult
    ai_artifact?: AIArtifactResult
    scoring?: ScoringResult

    // Highlights — structured (preferred) + flat backward compat
    highlights?: Highlight[]
    spatial_highlights?: Highlight[]
    document_highlights?: Highlight[]
    highlight_summary?: HighlightSummary

    fraud_flags?: FraudFlag[] | string[]
}