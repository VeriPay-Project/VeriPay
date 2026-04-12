"""
Ensemble fraud scorer.

Combines all individual analysis signals into a single composite fraud score
with weighted components, cross-signal amplifiers, and risk level classification.
"""

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _crypto_score(crypto_result: Optional[dict]) -> tuple[float, str]:
    if not crypto_result:
        return 0.1, "No crypto data available"

    integrity = str(crypto_result.get("signature_integrity", "")).lower()
    trust = str(crypto_result.get("certificate_trust", "")).lower()
    present = crypto_result.get("signature_present", False)

    if not present:
        return 0.1, "Document is not signed"

    if integrity == "valid" and "trusted" in trust and "untrusted" not in trust:
        return 0.0, "Valid signature with trusted certificate"

    if integrity == "valid" and ("untrusted" in trust or "self" in trust):
        return 0.2, "Valid signature but untrusted/self-signed certificate"

    if integrity == "invalid":
        return 0.9, "Invalid signature detected"

    return 0.1, f"Signature present, integrity={integrity}, trust={trust}"


def _bank_score(bank_result: Optional[dict]) -> tuple[float, str]:
    if not bank_result:
        return 0.2, "Bank verification not available"

    status = str(bank_result.get("verification_status", "")).lower()

    if status in ("verified_match", "match"):
        return 0.0, "Bank account verified and matches vendor records"

    if "mismatch" in status:
        return 0.95, "Bank account does not match vendor records"

    if "unknown" in status or "not_found" in status:
        return 0.3, "Vendor not found in bank registry"

    if "not_checked" in status or not bank_result.get("bank_account_detected"):
        return 0.2, "Bank account not checked or not detected"

    return 0.2, f"Bank verification status: {status}"


def _forensics_score(forensics_result: Optional[dict]) -> tuple[float, str]:
    if not forensics_result or forensics_result.get("status") != "ok":
        return 0.0, "Forensics analysis not available"

    score = float(forensics_result.get("forensic_score", 0.0))
    risk = str(forensics_result.get("risk_level", "low")).lower()
    return score, f"Forensic composite score ({risk} risk)"


def _ai_anomaly_score(ai_result: Optional[dict]) -> tuple[float, str]:
    if not ai_result or ai_result.get("status") != "ok":
        return 0.0, "AI anomaly analysis not available"

    score = float(ai_result.get("anomaly_score", 0.0))
    risk = str(ai_result.get("risk_level", "low")).lower()
    return score, f"AI anomaly score ({risk} risk)"


def _rules_score(rules_result: Optional[dict]) -> tuple[float, str]:
    if not rules_result or rules_result.get("status") != "ok":
        return 0.0, "Rules analysis not available"

    checks = rules_result.get("checks", {})
    errors = 0

    if checks.get("subtotal_matches_items") is False:
        errors += 1
    if checks.get("total_matches_subtotal_tax") is False:
        errors += 1

    font_count = rules_result.get("font_count", 0)
    if isinstance(font_count, (int, float)) and font_count > 8:
        errors += 1

    if errors == 0:
        return 0.0, "All rule checks passed"
    elif errors == 1:
        return 0.3, "1 math/rule error detected"
    elif errors == 2:
        return 0.6, "2 math/rule errors detected"
    else:
        return 0.9, f"{errors} math/rule errors detected"


def _ai_artifact_score(ai_artifact_result: Optional[dict]) -> tuple[float, str]:
    if not ai_artifact_result or ai_artifact_result.get("status") in (
        "skipped",
        "insufficient_text",
        None,
    ):
        return 0.0, "AI artifact detection not available"

    score = float(ai_artifact_result.get("ai_text_score", 0.0))
    risk = str(ai_artifact_result.get("risk_level", "low")).lower()
    return score, f"AI-generated text score ({risk} risk)"


def _extraction_penalty(extraction_status: Optional[str]) -> tuple[float, str]:
    if extraction_status == "failed":
        return 0.3, "LLM field extraction failed"
    return 0.0, "LLM extraction successful"


def _classify_risk(score: float) -> str:
    if score >= 0.75:
        return "critical"
    if score >= 0.50:
        return "high"
    if score >= 0.25:
        return "medium"
    return "low"


def _build_explanation(risk_level: str, breakdown: dict, amplifiers: list[str]) -> str:
    top_signals = sorted(
        breakdown.values(), key=lambda x: x["weighted"], reverse=True
    )
    top = top_signals[0] if top_signals else None

    if risk_level == "low":
        return "All fraud signals are within normal ranges. This invoice appears legitimate."

    if risk_level == "medium":
        if top:
            return (
                f"Moderate fraud risk detected. Primary concern: {top['reason']}. "
                "Manual review recommended."
            )
        return "Moderate fraud risk detected. Manual review recommended."

    if risk_level == "high":
        parts = [s["reason"] for s in top_signals[:2] if s["weighted"] > 0.05]
        detail = "; ".join(parts) if parts else "multiple elevated signals"
        suffix = " Risk amplified by corroborating signals." if amplifiers else ""
        return f"High fraud risk. Key concerns: {detail}.{suffix}"

    # critical
    parts = [s["reason"] for s in top_signals[:3] if s["weighted"] > 0.03]
    detail = "; ".join(parts) if parts else "multiple critical signals"
    suffix = " Multiple independent signals confirm fraud indicators." if amplifiers else ""
    return f"Critical fraud risk. {detail}.{suffix}"


def compute_fraud_score(
    crypto_result: Optional[dict] = None,
    bank_verification_result: Optional[dict] = None,
    forensics_result: Optional[dict] = None,
    ai_anomaly_result: Optional[dict] = None,
    rules_result: Optional[dict] = None,
    ai_artifact_result: Optional[dict] = None,
    extraction_status: Optional[str] = None,
) -> dict[str, Any]:
    """
    Compute a single composite fraud score from all analysis pipeline signals.

    Returns a dict with fraud_score, risk_level, score_breakdown,
    amplifiers_applied, and a human-readable explanation.
    """

    # --- Individual scores ---
    crypto_s, crypto_r = _crypto_score(crypto_result)
    bank_s, bank_r = _bank_score(bank_verification_result)
    forensics_s, forensics_r = _forensics_score(forensics_result)
    ai_s, ai_r = _ai_anomaly_score(ai_anomaly_result)
    rules_s, rules_r = _rules_score(rules_result)
    artifact_s, artifact_r = _ai_artifact_score(ai_artifact_result)
    extract_s, extract_r = _extraction_penalty(extraction_status)

    # --- Weights ---
    weights = {
        "crypto":             (crypto_s,     0.15, crypto_r),
        "bank_verification":  (bank_s,       0.20, bank_r),
        "forensics":          (forensics_s,  0.25, forensics_r),
        "ai_anomaly":         (ai_s,         0.15, ai_r),
        "rules":              (rules_s,      0.10, rules_r),
        "ai_artifact":        (artifact_s,   0.10, artifact_r),
        "extraction_penalty": (extract_s,    0.05, extract_r),
    }

    breakdown = {}
    base_score = 0.0
    for key, (score, weight, reason) in weights.items():
        weighted = round(score * weight, 4)
        base_score += weighted
        breakdown[key] = {
            "score": round(score, 4),
            "weight": weight,
            "weighted": weighted,
            "reason": reason,
        }

    # --- Cross-signal amplifiers ---
    amplifiers: list[str] = []
    amplifier_bonus = 0.0

    HIGH_THRESHOLD = 0.6

    forensics_high = forensics_s >= HIGH_THRESHOLD
    bank_mismatch = bank_s >= 0.9
    crypto_invalid = crypto_s >= 0.8
    ai_anomaly_high = ai_s >= HIGH_THRESHOLD
    ai_artifact_high = artifact_s >= HIGH_THRESHOLD

    if forensics_high and bank_mismatch:
        amplifiers.append("Forensics HIGH + Bank mismatch")
        amplifier_bonus += 0.15

    if forensics_high and crypto_invalid:
        amplifiers.append("Forensics HIGH + Crypto invalid")
        amplifier_bonus += 0.10

    if ai_anomaly_high and ai_artifact_high:
        amplifiers.append("AI anomaly HIGH + AI artifact HIGH")
        amplifier_bonus += 0.10

    high_count = sum([forensics_high, bank_mismatch, crypto_invalid, ai_anomaly_high, ai_artifact_high])
    if high_count >= 3:
        amplifiers.append(f"{high_count} independent signals HIGH")
        amplifier_bonus += 0.20

    final_score = min(round(base_score + amplifier_bonus, 4), 1.0)
    risk_level = _classify_risk(final_score)
    explanation = _build_explanation(risk_level, breakdown, amplifiers)

    return {
        "fraud_score": final_score,
        "risk_level": risk_level,
        "score_breakdown": breakdown,
        "amplifiers_applied": amplifiers,
        "explanation": explanation,
    }
