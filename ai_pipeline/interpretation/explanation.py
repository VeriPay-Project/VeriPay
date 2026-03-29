import math

def compute_z_score(distance, mean, std):
    """
    Computes how far an invoice deviates from reference invoices
    in terms of standard deviations.
    """
    if std == 0:
        return 0.0
    return (distance - mean) / std


def generate_explanations(distance_z, normalized_score):
    """
    Converts numeric anomaly signals into human-readable explanations.
    """

    explanations = []

    # --- Structural deviation explanations ---
    if distance_z < 0.5:
        explanations.append(
            "The invoice closely matches the structure and layout of previously verified invoices."
        )

    elif distance_z < 1.0:
        explanations.append(
            "The invoice is largely consistent with known invoices, with only minor structural differences."
        )

    elif distance_z < 1.5:
        explanations.append(
            "The invoice shows noticeable structural differences compared to typical submissions."
        )

    elif distance_z < 2.0:
        explanations.append(
            "The invoice structure deviates significantly from most known invoice formats."
        )

    else:
        explanations.append(
            "The invoice is structurally very different from previously verified invoices, which may indicate manipulation or synthetic generation."
        )

    # --- Confidence-based explanation ---
    if normalized_score >= 0.7:
        explanations.append(
            "Multiple document characteristics contributed to the elevated anomaly score."
        )
    elif normalized_score >= 0.4:
        explanations.append(
            "Some document characteristics contributed to the anomaly score."
        )
    else:
        explanations.append(
            "Only minor deviations were detected in this invoice."
        )

    return explanations
