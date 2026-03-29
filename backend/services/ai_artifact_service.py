"""
VeriPay AI Artifact Detection Service — Merged
================================================
Combines:
  - Rich linguistic analysis from uploaded version:
      perplexity proxy, burstiness, trigram repetition,
      template phrase regex, structural uniformity detection
  - Simpler fallback metrics from pasted version:
      lexical diversity, punctuation density
  - Unified risk_level output (pasted version had this, uploaded didn't)
  - Proper error handling + logging (pasted version)
  - signals list compatible with highlight_service (uploaded version)
"""

import math
import re
import logging
from typing import Any

logger = logging.getLogger("veripay.ai_artifact")


# ─── Tokenizer ───────────────────────────────────────────────────────────────

def _tokenize(text: str) -> list[str]:
    return re.findall(r"\b\w+\b", text.lower())


# ─── Linguistic metrics ───────────────────────────────────────────────────────

def _compute_perplexity_proxy(tokens: list[str]) -> float:
    """
    Unigram entropy as a perplexity proxy.
    Low score = repetitive/predictable = more AI-like.
    Normalized 0–1 against typical invoice entropy range (2.5–5.0 bits).
    """
    if len(tokens) < 5:
        return 0.5

    freq: dict[str, int] = {}
    for t in tokens:
        freq[t] = freq.get(t, 0) + 1

    total = len(tokens)
    entropy = -sum(
        (c / total) * math.log2(c / total)
        for c in freq.values()
    )

    return round(min(entropy / 5.0, 1.0), 4)


def _compute_burstiness(tokens: list[str]) -> float:
    """
    Burstiness: human text clusters repeated words; AI spreads them uniformly.
    High score = bursty = human-like. Low = uniform = AI-like.
    """
    if len(tokens) < 10:
        return 0.5

    freq: dict[str, int] = {}
    for t in tokens:
        freq[t] = freq.get(t, 0) + 1

    repeated = {w: c for w, c in freq.items() if c > 1}
    if not repeated:
        return 0.8  # all unique words — very human-like

    gaps = []
    for word in repeated:
        positions = [i for i, t in enumerate(tokens) if t == word]
        if len(positions) > 1:
            word_gaps = [positions[i + 1] - positions[i] for i in range(len(positions) - 1)]
            gaps.extend(word_gaps)

    if not gaps:
        return 0.5

    mean_gap = sum(gaps) / len(gaps)
    variance = sum((g - mean_gap) ** 2 for g in gaps) / len(gaps)
    std_dev = math.sqrt(variance)

    burstiness = min(std_dev / max(mean_gap, 1.0), 1.0)
    return round(burstiness, 4)


def _compute_trigram_repetition(text: str) -> float:
    """
    AI text reuses 3-word phrases more than humans do in business documents.
    Returns 0–1 where high = repetitive = AI-like.
    """
    if not text or len(text) < 50:
        return 0.0

    words = text.lower().split()
    if len(words) < 6:
        return 0.0

    trigrams = [" ".join(words[i:i + 3]) for i in range(len(words) - 2)]
    total = len(trigrams)
    unique = len(set(trigrams))

    if total == 0:
        return 0.0

    repetition_ratio = 1.0 - (unique / total)
    return round(min(repetition_ratio * 2.0, 1.0), 4)


def _compute_lexical_diversity(tokens: list[str]) -> float:
    """Type-token ratio. Low = AI-like (narrow vocabulary)."""
    if not tokens:
        return 0.0
    return round(len(set(tokens)) / len(tokens), 4)


def _compute_punctuation_density(text: str) -> float:
    """High punctuation density can indicate template/AI formatting."""
    if not text:
        return 0.0
    punct = len(re.findall(r"[.,;:!?]", text))
    return round(min(1.0, punct / max(len(text), 1)), 4)


# ─── Pattern detectors ────────────────────────────────────────────────────────

AI_TEMPLATE_PHRASES = [
    r"please\s+(?:find\s+)?(?:attached|see\s+below)\s+(?:the\s+)?invoice",
    r"thank\s+you\s+for\s+your\s+(?:continued\s+)?business",
    r"payment\s+is\s+due\s+within\s+\d+\s+(?:business\s+)?days",
    r"please\s+do\s+not\s+hesitate\s+to\s+contact",
    r"we\s+(?:look\s+forward|appreciate)\s+to\s+(?:doing\s+business|working)",
    r"all\s+(?:goods|services)\s+remain\s+the\s+property",
    r"this\s+invoice\s+was\s+(?:generated|created)\s+(?:by|using|with)",
    r"net\s+(?:30|60|90)\s+days?\s+from\s+(?:date\s+of\s+)?invoice",
]


def _detect_template_phrases(text: str) -> list[dict]:
    signals = []
    text_lower = text.lower()

    for pattern in AI_TEMPLATE_PHRASES:
        match = re.search(pattern, text_lower)
        if match:
            signals.append({
                "type":       "ai_template_phrase",
                "confidence": 0.62,
                "message":    f"Template-like phrase: '{match.group(0)[:60]}'",
            })

    return signals


def _detect_structural_uniformity(text: str) -> list[dict]:
    signals = []

    # Suspiciously round amounts — real invoices have odd cents
    round_amounts = re.findall(r"\$?\s*(\d{2,6})\.00\b", text)
    if len(round_amounts) >= 3:
        signals.append({
            "type":       "uniform_amounts",
            "confidence": 0.55,
            "message":    f"{len(round_amounts)} perfectly round amounts — unusual for real invoices",
        })

    # Generic sequential invoice numbers
    generic_inv = re.search(r"\b(?:INV|INVOICE)-?0*[1-9]{1,3}\b", text, re.IGNORECASE)
    if generic_inv:
        signals.append({
            "type":       "generic_invoice_number",
            "confidence": 0.50,
            "message":    f"Generic/sequential invoice number: {generic_inv.group(0)}",
        })

    # Placeholder company names
    generic_names = re.findall(
        r"\b(?:ABC\s+(?:Corp|Inc|Ltd|Company)|XYZ\s+(?:Corp|Inc|Ltd)|"
        r"Sample\s+(?:Corp|Inc|Company)|Test\s+(?:Corp|Inc|Company)|"
        r"Example\s+(?:Corp|Inc|Ltd))\b",
        text,
        re.IGNORECASE,
    )
    if generic_names:
        signals.append({
            "type":       "generic_company_name",
            "confidence": 0.85,
            "message":    f"Generic placeholder company name: {generic_names[0]}",
        })

    return signals


# ─── Risk classification ──────────────────────────────────────────────────────

def _score_to_risk(score: float) -> str:
    if score > 0.65:
        return "high"
    if score > 0.40:
        return "medium"
    return "low"


# ─── Main entry point ─────────────────────────────────────────────────────────

def run_ai_artifact_detection(extracted_text: str) -> dict[str, Any]:
    """
    Analyse extracted invoice text for signs of AI generation or
    AI-assisted modification. Works on text your existing extraction
    pipeline already produces — no extra model calls.

    Returns a result dict compatible with build_highlights() and
    compute_fraud_score().
    """
    if not extracted_text or len(extracted_text.strip()) < 30:
        return {
            "status":       "skipped",
            "reason":       "Insufficient text for analysis",
            "ai_text_score": 0.0,
            "risk_level":   "low",
            "signals":      [],
        }

    try:
        text   = extracted_text.strip()
        tokens = _tokenize(text)

        # ── Linguistic scores ─────────────────────────────────────────────
        perplexity_proxy = _compute_perplexity_proxy(tokens)
        burstiness       = _compute_burstiness(tokens)
        repetition       = _compute_trigram_repetition(text)
        diversity        = _compute_lexical_diversity(tokens)
        punctuation      = _compute_punctuation_density(text)

        # Invert so high = more AI-like / suspicious
        perplexity_risk = round(1.0 - perplexity_proxy, 4)
        burstiness_risk = round(1.0 - burstiness, 4)
        diversity_risk  = round(1.0 - diversity, 4)

        # ── Pattern signals ───────────────────────────────────────────────
        template_signals   = _detect_template_phrases(text)
        structural_signals = _detect_structural_uniformity(text)
        all_signals        = template_signals + structural_signals

        signal_boost = min(len(all_signals) * 0.06, 0.30)

        # ── Composite score ───────────────────────────────────────────────
        # Primary: perplexity + burstiness + repetition (from uploaded)
        # Secondary: diversity + punctuation (from pasted, lower weight)
        ai_text_score = round(
            min(
                0.30 * perplexity_risk +
                0.22 * burstiness_risk +
                0.22 * repetition +
                0.10 * diversity_risk +
                0.08 * punctuation +
                0.08 * signal_boost,
                1.0,
            ),
            4,
        )

        risk_level = _score_to_risk(ai_text_score)

        # ── Reasoning ─────────────────────────────────────────────────────
        reasons = []
        if perplexity_risk > 0.6:
            reasons.append("low vocabulary variation")
        if burstiness_risk > 0.6:
            reasons.append("uniform word distribution")
        if repetition > 0.4:
            reasons.append("repetitive phrasing")
        if diversity_risk > 0.6:
            reasons.append("narrow lexical range")
        if punctuation > 0.05:
            reasons.append("high punctuation density")
        if template_signals:
            reasons.append("template-like language")
        if structural_signals:
            reasons.append("generic structural patterns")

        reasoning = (
            "Invoice text shows signs of AI generation: " + ", ".join(reasons)
            if reasons
            else "No strong AI text indicators found"
        )

        return {
            "status":            "ok",
            "ai_text_score":     ai_text_score,
            "risk_level":        risk_level,
            "perplexity_risk":   perplexity_risk,
            "burstiness_risk":   burstiness_risk,
            "repetition_score":  repetition,
            "diversity_risk":    diversity_risk,
            "punctuation_score": punctuation,
            "signals":           all_signals,
            "reasoning":         reasoning,
        }

    except Exception as exc:
        logger.warning("run_ai_artifact_detection failed: %s", exc)
        return {
            "status":        "error",
            "ai_text_score": 0.0,
            "risk_level":    "low",
            "reasoning":     "Analysis failed",
            "signals":       [],
        }