# Risk thresholds (policy decisions, not AI decisions)

LOW_RISK = 0.4
HIGH_RISK = 0.7


def interpret_risk(normalized_score):
    """
    Converts anomaly score into a risk category and review decision.
    """
    if normalized_score >= HIGH_RISK:
        return "HIGH", True
    elif normalized_score >= LOW_RISK:
        return "MEDIUM", True
    else:
        return "LOW", False
