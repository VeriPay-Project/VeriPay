from typing import Optional, List


def run_rules_checks(
    line_items: List[float],
    subtotal: Optional[float],
    tax: Optional[float],
    total: Optional[float]
) -> dict:
    """
    Pure validation logic.
    No extraction. No guessing.
    """

    line_item_sum = round(sum(line_items), 2) if line_items else None

    checks = {}

    if subtotal is not None and line_item_sum is not None:
        checks["subtotal_matches_items"] = abs(subtotal - line_item_sum) < 0.01
        checks["subtotal_delta"] = round(subtotal - line_item_sum, 2)
    else:
        checks["subtotal_matches_items"] = None
        checks["subtotal_delta"] = None

    if total is not None and subtotal is not None:
        expected_total = subtotal + (tax or 0.0)
        checks["total_matches_subtotal_tax"] = abs(total - expected_total) < 0.01
        checks["total_delta"] = round(total - expected_total, 2)
    else:
        checks["total_matches_subtotal_tax"] = None
        checks["total_delta"] = None

    status = "ok"
    if (
        subtotal is None and
        total is None and
        not line_items
    ):
        status = "insufficient_amounts"

    return {
        "status": status,
        "line_item_count": len(line_items),
        "line_item_sum": line_item_sum,
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "checks": checks
    }
