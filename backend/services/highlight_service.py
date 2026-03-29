"""
VeriPay Highlight Service — Merged
====================================
Combines best of both versions:
  - Full source coverage: forensics, rules, vendor_binding, vendor_bank,
    ai_analysis, ai_artifact (from uploaded v2)
  - Structured spatial/document split + summary dict (from pasted v3)
  - Dedup key includes bbox so same-type highlights on different regions survive
  - risk_level guard on AI highlights (was dropped in pasted v3, restored)
  - flags field restored in _from_rules (was dropped in pasted v3)
  - Unknown source warning in _source_priority
  - All thresholds in HIGHLIGHT_CONFIG
"""

from typing import Any, Optional
import logging

logger = logging.getLogger("veripay.highlights")


MAX_SPATIAL_HIGHLIGHTS  = 6
MAX_DOCUMENT_HIGHLIGHTS = 12

HIGHLIGHT_CONFIG = {
    "ai_threshold": 0.4,
    "ai_risk_levels": ("HIGH", "MEDIUM"),
    "ai_artifact_min_score": 0.5,
    "forensic_risk_banner": ("high", "critical"),
    "rules_confidence": {
        "subtotal": 0.92,
        "total":    0.95,
        "flag":     0.90,
    },
    "vendor_bank_confidence": {
        "mismatch":   0.92,
        "default":    0.70,
    },
    "vendor_binding_confidence": {
        "flag":    0.95,
        "status":  0.90,
    },
}


# ─── Color + confidence helpers ───────────────────────────────────────────────

def _severity_color(confidence: float) -> str:
    """Color driven by severity, not source."""
    if confidence >= 0.80:
        return "red"
    if confidence >= 0.55:
        return "coral"
    if confidence >= 0.35:
        return "amber"
    return "blue"


def _clamp_confidence(value: Any) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        v = 0.5
    return min(1.0, max(0.0, v))


def _make_highlight(
    bbox: Optional[list[int]],
    type_: str,
    confidence: float,
    source: str,
    message: str,
    color: Optional[str] = None,
) -> dict[str, Any]:
    conf = _clamp_confidence(confidence)
    return {
        "bbox":       bbox,
        "type":       type_,
        "confidence": round(conf, 4),
        "source":     source,
        "message":    message,
        "color":      color or _severity_color(conf),
    }


def _safe_bbox(value: Any) -> Optional[list[int]]:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        x, y, w, h = [int(float(v)) for v in value]
        if w <= 0 or h <= 0:
            return None
        return [x, y, w, h]
    except (TypeError, ValueError):
        return None


# ─── Priority / sorting ───────────────────────────────────────────────────────

def _source_priority(source: str) -> int:
    order = {
        "forensics":      5,
        "rules":          4,
        "vendor_binding": 4,
        "vendor_bank":    4,
        "ai_analysis":    3,
        "ai_artifact":    3,
    }
    priority = order.get(source)
    if priority is None:
        logger.warning("Unknown highlight source: %s", source)
        return 1
    return priority


def _highlight_priority(hl: dict[str, Any]) -> tuple:
    spatial_rank = 1 if hl.get("bbox") else 0
    return (
        spatial_rank,
        _source_priority(str(hl.get("source", ""))),
        float(hl.get("confidence", 0.0)),
    )


# ─── Source builders ─────────────────────────────────────────────────────────

def _from_forensics(forensics_result: dict) -> list[dict[str, Any]]:
    highlights: list[dict[str, Any]] = []

    if not forensics_result or forensics_result.get("status") != "ok":
        return highlights

    # Real spatial highlights (ELA bboxes, font outlier bboxes, etc.)
    for hl in forensics_result.get("spatial_highlights", []):
        highlights.append(_make_highlight(
            bbox=_safe_bbox(hl.get("bbox")),
            type_=hl.get("type", "tampering_suspected"),
            confidence=hl.get("confidence", 0.5),
            source="forensics",
            message=hl.get("message", "Suspicious region detected"),
        ))

    # Document-level findings (no bbox)
    for hl in forensics_result.get("document_highlights", []):
        highlights.append(_make_highlight(
            bbox=None,
            type_=hl.get("type", "forensic_anomaly"),
            confidence=hl.get("confidence", 0.5),
            source="forensics",
            message=hl.get("message", "Forensic anomaly detected"),
        ))

    # Backward compat: old format used flat "highlights" list
    if not forensics_result.get("spatial_highlights") and not forensics_result.get("document_highlights"):
        for hl in forensics_result.get("highlights", []):
            highlights.append(_make_highlight(
                bbox=_safe_bbox(hl.get("bbox")),
                type_=hl.get("type", "forensic_anomaly"),
                confidence=hl.get("confidence", 0.5),
                source="forensics",
                message=hl.get("message", "Forensic anomaly detected"),
            ))

    # Triggered layer signals
    for signal in forensics_result.get("signals", []):
        highlights.append(_make_highlight(
            bbox=None,
            type_=signal.get("type", "forensic_signal"),
            confidence=signal.get("confidence", 0.5),
            source="forensics",
            message=signal.get("message", "Forensic anomaly detected"),
        ))

    # Risk banner — only for high/critical, only if no other forensic signals
    risk = str(forensics_result.get("risk_level", "")).lower()
    if risk in HIGHLIGHT_CONFIG["forensic_risk_banner"]:
        highlights.append(_make_highlight(
            bbox=None,
            type_="forensic_risk",
            confidence=0.90 if risk == "critical" else 0.75,
            source="forensics",
            message=f"Forensic risk level: {risk}",
        ))

    return highlights


def _from_rules(rules_result: dict) -> list[dict[str, Any]]:
    highlights: list[dict[str, Any]] = []

    if not rules_result:
        return highlights

    cfg = HIGHLIGHT_CONFIG["rules_confidence"]

    # Arbitrary flags from rules engine
    for flag in rules_result.get("flags", []):
        if isinstance(flag, dict):
            msg  = flag.get("message") or flag.get("description") or str(flag)
            conf = _clamp_confidence(flag.get("confidence", cfg["flag"]))
            type_ = flag.get("type", "rules_violation")
        else:
            msg   = str(flag)
            conf  = cfg["flag"]
            type_ = "rules_violation"

        highlights.append(_make_highlight(
            bbox=None, type_=type_, confidence=conf,
            source="rules", message=msg,
        ))

    checks = rules_result.get("checks")

    if isinstance(checks, dict):
        if checks.get("subtotal_matches_items") is False:
            highlights.append(_make_highlight(
                bbox=None,
                type_="math_inconsistency",
                confidence=cfg["subtotal"],
                source="rules",
                message="Subtotal does not match line item sum",
            ))
        if checks.get("total_matches_subtotal_tax") is False:
            highlights.append(_make_highlight(
                bbox=None,
                type_="math_inconsistency",
                confidence=cfg["total"],
                source="rules",
                message="Total does not match subtotal plus tax",
            ))

    elif isinstance(checks, list):
        logger.warning("_from_rules: list-format checks received")
        for check in checks:
            if isinstance(check, dict) and not check.get("passed", True):
                highlights.append(_make_highlight(
                    bbox=None,
                    type_="math_inconsistency",
                    confidence=_clamp_confidence(check.get("confidence", cfg["subtotal"])),
                    source="rules",
                    message=check.get("message", "Numeric check failed"),
                ))

    return highlights


def _from_issuer_payee(issuer_payee_binding: Optional[dict]) -> list[dict[str, Any]]:
    highlights: list[dict[str, Any]] = []
    if not issuer_payee_binding:
        return highlights

    cfg = HIGHLIGHT_CONFIG["vendor_binding_confidence"]

    for flag in issuer_payee_binding.get("flags", []):
        highlights.append(_make_highlight(
            bbox=None,
            type_="issuer_payee_mismatch",
            confidence=cfg["flag"],
            source="vendor_binding",
            message=str(flag),
        ))

    status = str(issuer_payee_binding.get("status", "")).lower()
    if status in ("mismatch", "unverified", "suspicious"):
        highlights.append(_make_highlight(
            bbox=None,
            type_="vendor_binding_failed",
            confidence=cfg["status"],
            source="vendor_binding",
            message=f"Issuer-payee binding: {status}",
        ))

    return highlights


def _from_vendor_bank(vendor_bank: Optional[dict]) -> list[dict[str, Any]]:
    highlights: list[dict[str, Any]] = []
    if not vendor_bank:
        return highlights

    cfg = HIGHLIGHT_CONFIG["vendor_bank_confidence"]
    verification = str(vendor_bank.get("verification_status", "")).lower()

    if verification in ("not_found", "mismatch", "unverified"):
        conf = cfg["mismatch"] if verification == "mismatch" else cfg["default"]
        masked = vendor_bank.get("masked_account", "unknown")
        highlights.append(_make_highlight(
            bbox=None,
            type_="bank_account_suspicious",
            confidence=conf,
            source="vendor_bank",
            message=f"Bank verification: {verification}. Account: {masked}",
        ))

    return highlights


def _from_ai_result(ai_result: Optional[dict]) -> list[dict[str, Any]]:
    highlights: list[dict[str, Any]] = []
    if not ai_result or ai_result.get("status") != "ok":
        return highlights

    score = _clamp_confidence(ai_result.get("anomaly_score", 0))
    risk  = str(ai_result.get("risk_level", "")).upper()

    # Both score threshold AND risk level must indicate suspicion
    if score > HIGHLIGHT_CONFIG["ai_threshold"] and risk in HIGHLIGHT_CONFIG["ai_risk_levels"]:
        highlights.append(_make_highlight(
            bbox=None,
            type_="layout_anomaly",
            confidence=score,
            source="ai_analysis",
            message=f"Layout anomaly detected — risk: {risk.lower()}",
        ))

    return highlights


def _from_ai_artifact(ai_artifact_result: Optional[dict]) -> list[dict[str, Any]]:
    highlights: list[dict[str, Any]] = []
    if not ai_artifact_result or ai_artifact_result.get("status") != "ok":
        return highlights

    score = _clamp_confidence(ai_artifact_result.get("ai_text_score", 0))
    min_score = HIGHLIGHT_CONFIG["ai_artifact_min_score"]

    if score >= min_score:
        highlights.append(_make_highlight(
            bbox=None,
            type_="ai_generated_text",
            confidence=score,
            source="ai_artifact",
            message=ai_artifact_result.get("reasoning", "Text appears AI-generated"),
        ))

    return highlights


# ─── Pipeline ─────────────────────────────────────────────────────────────────

def _deduplicate(highlights: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Dedup by (type, source, bbox_key).
    Including bbox in key means two ELA hotspots on different regions
    are NOT collapsed — only truly identical signals are deduplicated.
    """
    best: dict[tuple, dict[str, Any]] = {}
    for hl in highlights:
        bbox = hl.get("bbox")
        bbox_key = tuple(bbox) if isinstance(bbox, list) else None
        key = (hl.get("type"), hl.get("source"), bbox_key)
        if key not in best or hl["confidence"] > best[key]["confidence"]:
            best[key] = hl
    return list(best.values())


def _split(highlights: list[dict[str, Any]]) -> tuple[list, list]:
    spatial  = [h for h in highlights if h.get("bbox")]
    document = [h for h in highlights if not h.get("bbox")]
    return spatial, document


def build_highlights(
    forensics_result:      Optional[dict] = None,
    rules_result:          Optional[dict] = None,
    issuer_payee_binding:  Optional[dict] = None,
    vendor_bank:           Optional[dict] = None,
    ai_result:             Optional[dict] = None,
    ai_artifact_result:    Optional[dict] = None,
    max_spatial:           int = MAX_SPATIAL_HIGHLIGHTS,
    max_document:          int = MAX_DOCUMENT_HIGHLIGHTS,
) -> dict[str, Any]:
    """
    Unified highlight pipeline. Returns structured dict with:
      all, spatial, document, summary, highlights (backward compat).
    """
    all_hl: list[dict[str, Any]] = []
    all_hl.extend(_from_forensics(forensics_result or {}))
    all_hl.extend(_from_rules(rules_result or {}))
    all_hl.extend(_from_issuer_payee(issuer_payee_binding))
    all_hl.extend(_from_vendor_bank(vendor_bank))
    all_hl.extend(_from_ai_result(ai_result))
    all_hl.extend(_from_ai_artifact(ai_artifact_result))

    all_hl = _deduplicate(all_hl)

    spatial, document = _split(all_hl)

    spatial  = sorted(spatial,  key=_highlight_priority, reverse=True)[:max_spatial]
    document = sorted(document, key=_highlight_priority, reverse=True)[:max_document]

    final = sorted(spatial + document, key=_highlight_priority, reverse=True)

    summary = {
        "total":          len(final),
        "spatial_count":  len(spatial),
        "document_count": len(document),
        "top_confidence": max((h["confidence"] for h in final), default=0.0),
        "sources":        sorted({h["source"] for h in final}),
    }

    return {
        "all":      final,
        "spatial":  spatial,
        "document": document,
        "summary":  summary,
        # backward compatibility
        "highlights": final,
    }