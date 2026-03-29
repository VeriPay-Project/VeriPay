import matplotlib.pyplot as plt

def visualize_results(results):
    names = [r["invoice"] for r in results]
    scores = [r["normalized_score"] for r in results]

    plt.figure(figsize=(10, 4))
    plt.bar(names, scores)
    plt.xticks(rotation=45, ha="right")
    plt.ylabel("Normalized Anomaly Score")
    plt.title("Invoice Anomaly Detection")
    plt.tight_layout()
    plt.show()
