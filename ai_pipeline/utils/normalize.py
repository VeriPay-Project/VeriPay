def normalize_scores(results):
    scores = [r["score"] for r in results]
    min_s, max_s = min(scores), max(scores)

    for r in results:
        r["normalized_score"] = (
            (r["score"] - min_s) / (max_s - min_s)
            if max_s != min_s else 0.0
        )
