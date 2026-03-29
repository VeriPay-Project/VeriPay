import re
import math

def extract_features(text):
    words = text.split()
    numbers = re.findall(r'\d+\.?\d*', text)

    text_length = len(text)
    unique_words = set(words)

    entropy = 0.0
    if words:
        freqs = {w: words.count(w) / len(words) for w in unique_words}
        entropy = -sum(p * math.log2(p) for p in freqs.values())

    return {
        "num_words": len(words),
        "num_numbers": len(numbers),
        "text_length": text_length,
        "avg_word_length": sum(len(w) for w in words) / max(len(words), 1),
        "digit_ratio": len("".join(numbers)) / max(text_length, 1),
        "entropy": entropy
    }
