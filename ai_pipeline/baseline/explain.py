def compute_feature_stats(feature_list):
    stats = {}
    keys = feature_list[0].keys()

    for k in keys:
        values = [f[k] for f in feature_list]
        stats[k] = {
            "mean": sum(values) / len(values),
            "min": min(values),
            "max": max(values)
        }

    return stats

def explain_anomaly(features, stats):
    reasons = []

    for k, v in features.items():
        if v > stats[k]["max"] * 1.1:
            reasons.append(f"{k} unusually high")
        elif v < stats[k]["min"] * 0.9:
            reasons.append(f"{k} unusually low")

    return reasons
