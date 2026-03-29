import numpy as np
from sklearn.ensemble import IsolationForest

class AnomalyDetector:
    def __init__(self):
        self.model = IsolationForest(
            contamination=0.2,
            random_state=42
        )

    def train(self, feature_list):
        X = np.array([list(f.values()) for f in feature_list])
        self.model.fit(X)

    def score(self, features):
        X = np.array([list(features.values())])
        return float(-self.model.decision_function(X)[0])

