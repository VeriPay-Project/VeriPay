"""
VeriPay AI Text Detection Service.

This service does not call a language model. It combines the AI-text judgment
from the existing semantic extraction Ollama call with local heuristic evidence.
If Ollama is unavailable, the local heuristics are used as the fallback.
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

PATTERN_GROUPS = [
    {
        "type": "generic_payment_language",
        "confidence": 0.58,
        "patterns": [
            r"please\s+(?:find|see|review)\s+(?:the\s+)?attached\s+invoice",
            r"(?:kindly|please)\s+(?:process|review|settle)\s+(?:this\s+)?(?:invoice|payment|billing\s+document)",
            r"payment\s+is\s+due\s+within\s+\d+\s+(?:business\s+)?days",
            r"net\s+(?:7|15|30|45|60|90)\s+days?\s+from\s+(?:the\s+)?(?:date\s+of\s+)?invoice",
        ],
    },
    {
        "type": "generic_invoice_phrases",
        "confidence": 0.52,
        "patterns": [
            r"thank\s+you\s+for\s+your\s+(?:continued\s+)?business",
            r"please\s+do\s+not\s+hesitate\s+to\s+contact",
            r"we\s+(?:look\s+forward|appreciate)\s+(?:to\s+)?(?:doing\s+business|working)\s+with\s+you",
            r"all\s+(?:goods|services)\s+remain\s+the\s+property",
        ],
    },
    {
        "type": "ai_disclosure_phrase",
        "confidence": 0.88,
        "patterns": [
            r"this\s+invoice\s+was\s+(?:generated|created|drafted)\s+(?:by|using|with)\s+(?:ai|artificial\s+intelligence|chatgpt|llm)",
            r"(?:ai|artificial\s+intelligence|chatgpt|llm)\s+(?:generated|created|assisted)\s+(?:invoice|text|document)",
        ],
    },
    {
        "type": "placeholder_company_name",
        "confidence": 0.85,
        "patterns": [
            r"\b(?:abc|xyz|acme|sample|test|demo|example)\s+(?:corp|inc|ltd|llc|company|co)\b",
            r"\b(?:company\s+name|your\s+company|client\s+name|vendor\s+name)\b",
        ],
    },
    {
        "type": "generic_invoice_number",
        "confidence": 0.62,
        "patterns": [
            r"\b(?:inv|invoice)[\s#:-]*0{0,3}[1-9]{1,3}\b",
            r"\b(?:invoice|reference|order)\s*(?:number|no|id)?\s*[:#-]\s*(?:12345|0001|001|test|sample)\b",
        ],
    },
]


def _clamp01(value: float) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = 0.0
    return max(0.0, min(1.0, numeric))


def _make_signal(type_: str, confidence: float, message: str) -> dict[str, Any]:
    return {
        "type": type_,
        "confidence": round(_clamp01(confidence), 4),
        "message": message,
    }


def _detect_pattern_groups(text: str) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for group in PATTERN_GROUPS:
        for pattern in group["patterns"]:
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if not match:
                continue
            signals.append(_make_signal(
                str(group["type"]),
                float(group["confidence"]),
                f"Matched text pattern: '{match.group(0)[:80]}'",
            ))
            break
    return signals


def _detect_structural_uniformity(text: str) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []

    round_amounts = re.findall(
        r"(?<!\d)(?:[$€£]\s*)?\d{2,7}\.00(?!\d)",
        text,
        flags=re.IGNORECASE,
    )
    if len(round_amounts) >= 3:
        signals.append(_make_signal(
            "round_amount_patterns",
            0.62,
            f"{len(round_amounts)} perfectly round amounts detected",
        ))

    line_amounts = re.findall(
        r"(?<!\d)(?:[$€£]\s*)?\d{1,7}\.\d{2}(?!\d)",
        text,
        flags=re.IGNORECASE,
    )
    if len(line_amounts) >= 5:
        cents = [amount[-2:] for amount in line_amounts]
        most_common = max(cents.count(c) for c in set(cents))
        if most_common / len(cents) >= 0.70:
            signals.append(_make_signal(
                "overly_uniform_line_items",
                0.57,
                "Line-item amounts have unusually uniform cent patterns",
            ))

    generic_contacts = re.findall(
        r"\b(?:example\.(?:com|net|org)|test\.com|demo\.com|sample\.com)\b",
        text,
        flags=re.IGNORECASE,
    )
    if len(generic_contacts) >= 2:
        signals.append(_make_signal(
            "synthetic_contact_patterns",
            0.70,
            f"{len(generic_contacts)} generic contact domains detected",
        ))

    return signals


def _score_to_risk(score: float) -> str:
    if score >= 0.70:
        return "high"
    if score >= 0.40:
        return "medium"
    return "low"


def _normalize_ollama_assessment(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    probability = _clamp01(value.get("ai_text_probability", 0.0))
    confidence = _clamp01(value.get("confidence", probability))
    risk_level = str(value.get("risk_level") or "").strip().lower()
    artifact_type = str(value.get("artifact_type") or "none").strip().lower()
    if risk_level not in {"low", "medium", "high"}:
        risk_level = _score_to_risk(probability)

    reasons_value = value.get("reasons")
    if isinstance(reasons_value, list):
        reasons = [str(item).strip() for item in reasons_value if str(item).strip()]
    elif isinstance(reasons_value, str) and reasons_value.strip():
        reasons = [reasons_value.strip()]
    else:
        reasons = []

    return {
        "ai_text_probability": round(probability, 4),
        "confidence": round(confidence, 4),
        "risk_level": risk_level,
        "artifact_type": artifact_type or "none",
        "reasons": reasons[:6],
    }


def _infer_artifact_type(signals: list[dict[str, Any]]) -> str:
    signal_types = {str(signal.get("type")) for signal in signals}
    if "ai_disclosure_phrase" in signal_types:
        return "ai_generated_text"
    if "placeholder_company_name" in signal_types or "generic_invoice_number" in signal_types:
        return "placeholder_invoice"
    if "generic_payment_language" in signal_types or "generic_invoice_phrases" in signal_types:
        return "generic_template"
    if signal_types:
        return "synthetic_invoice_language"
    return "none"


def _build_heuristic_score(
    *,
    perplexity_risk: float,
    burstiness_risk: float,
    repetition: float,
    diversity_risk: float,
    punctuation: float,
    signals: list[dict[str, Any]],
) -> tuple[float, float]:
    metric_score = _clamp01(
        0.25 * perplexity_risk
        + 0.18 * burstiness_risk
        + 0.18 * repetition
        + 0.10 * diversity_risk
        + 0.07 * punctuation
    )
    signal_score = _clamp01(sum(_clamp01(s.get("confidence", 0.0)) for s in signals) / 3.0)
    heuristic_score = _clamp01(0.45 * metric_score + 0.55 * signal_score)

    strong_signals = sum(1 for s in signals if _clamp01(s.get("confidence", 0.0)) >= 0.70)
    if len(signals) >= 4:
        heuristic_score = max(heuristic_score, 0.72)
    elif strong_signals >= 2:
        heuristic_score = max(heuristic_score, 0.65)
    elif len(signals) >= 2:
        heuristic_score = max(heuristic_score, 0.42)

    return round(heuristic_score, 4), round(signal_score, 4)


def _build_reasoning(
    *,
    risk_level: str,
    method: str,
    ollama: dict[str, Any] | None,
    signals: list[dict[str, Any]],
) -> str:
    if risk_level == "low" and not signals:
        return "No strong AI-generated or template-text indicators found."

    reasons: list[str] = []
    if ollama:
        reasons.extend(ollama.get("reasons", []))
    reasons.extend(str(signal["type"]).replace("_", " ") for signal in signals[:4])

    unique_reasons = list(dict.fromkeys(reason for reason in reasons if reason))
    if not unique_reasons:
        unique_reasons = ["text pattern score is elevated"]

    prefix = (
        "Single-call Ollama judgment plus local heuristics"
        if method == "ollama_single_call_plus_heuristics"
        else "Local heuristic fallback"
    )
    return f"{prefix}: " + "; ".join(unique_reasons[:6])


def run_ai_artifact_detection(
    extracted_text: str,
    ollama_assessment: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Analyze extracted invoice text for signs of AI-generated, templated, or
    synthetic wording. This function never calls Ollama; it only consumes the
    AI-text judgment produced by the existing semantic extraction call.
    """
    if not extracted_text or len(extracted_text.strip()) < 30:
        return {
            "status": "skipped",
            "card_name": "AI text detection",
            "method": "heuristic_fallback",
            "reason": "Insufficient text for analysis",
            "ai_text_score": 0.0,
            "risk_level": "low",
            "signals": [],
        }

    try:
        text = extracted_text.strip()
        tokens = _tokenize(text)

        perplexity_proxy = _compute_perplexity_proxy(tokens)
        burstiness = _compute_burstiness(tokens)
        repetition = _compute_trigram_repetition(text)
        diversity = _compute_lexical_diversity(tokens)
        punctuation = _compute_punctuation_density(text)

        perplexity_risk = round(1.0 - perplexity_proxy, 4)
        burstiness_risk = round(1.0 - burstiness, 4)
        diversity_risk = round(1.0 - diversity, 4)

        pattern_signals = _detect_pattern_groups(text)
        structural_signals = _detect_structural_uniformity(text)
        signals = pattern_signals + structural_signals

        heuristic_score, signal_boost = _build_heuristic_score(
            perplexity_risk=perplexity_risk,
            burstiness_risk=burstiness_risk,
            repetition=repetition,
            diversity_risk=diversity_risk,
            punctuation=punctuation,
            signals=signals,
        )

        ollama = _normalize_ollama_assessment(ollama_assessment)
        if ollama:
            ollama_probability = float(ollama["ai_text_probability"])
            ai_text_score = round(
                _clamp01(0.70 * ollama_probability + 0.30 * heuristic_score),
                4,
            )
            method = "ollama_single_call_plus_heuristics"
            artifact_type = ollama.get("artifact_type") or _infer_artifact_type(signals)
            model_confidence = ollama.get("confidence")
        else:
            ollama_probability = None
            ai_text_score = heuristic_score
            method = "heuristic_fallback"
            artifact_type = _infer_artifact_type(signals)
            model_confidence = None

        risk_level = _score_to_risk(ai_text_score)
        reasoning = _build_reasoning(
            risk_level=risk_level,
            method=method,
            ollama=ollama,
            signals=signals,
        )

        return {
            "status": "ok",
            "card_name": "AI text detection",
            "method": method,
            "ai_text_score": ai_text_score,
            "risk_level": risk_level,
            "ollama_probability": ollama_probability,
            "model_confidence": model_confidence,
            "heuristic_score": heuristic_score,
            "artifact_type": artifact_type,
            "perplexity_risk": perplexity_risk,
            "burstiness_risk": burstiness_risk,
            "repetition_score": repetition,
            "diversity_risk": diversity_risk,
            "punctuation_score": punctuation,
            "signal_boost": signal_boost,
            "signals": signals,
            "reasoning": reasoning,
        }

    except Exception as exc:
        logger.warning("run_ai_artifact_detection failed: %s", exc)
        return {
            "status": "error",
            "card_name": "AI text detection",
            "method": "heuristic_fallback",
            "ai_text_score": 0.0,
            "risk_level": "low",
            "reasoning": "AI text detection failed",
            "signals": [],
        }
