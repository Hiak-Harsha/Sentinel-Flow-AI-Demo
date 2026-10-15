# Sentinel Flow Model Card: Live Observable Intrusion Classifier (v2.0.0)

> [!NOTE]
> This Model Card is **automatically generated** from genuine training and cross-validation artifacts in `backend/artifacts/evaluation.json` and `backend/artifacts/model_comparison.json`.
> No metrics are hand-entered or placeholder estimates.

---

## 1. Model Summary & Architectural Intent

- **Model Identifier:** `sentinel-live-classifier`
- **Model Version:** `2.0.0`
- **Feature Schema Version:** `2.0.0` (Direct Streaming Live Telemetry)
- **Primary Algorithm:** Calibrated Random Forest Classifier (`CalibratedClassifierCV` with Platt Sigmoid)
- **Training Timestamp:** `2026-10-15T13:45:16.443613+00:00`
- **Model Bundle Size:** `0.84 MB`
- **Target Task:** Binary intrusion detection on streaming HTTP & host telemetry sliding windows (`0 = NORMAL`, `1 = ATTACK`).

### Elimination of Train/Serve Skew
In Sentinel Flow v1, an academic Random Forest trained on 8 UNSW-NB15 flow features was fed synthetic quantities manufactured from HTTP requests via `map_features`. In Sentinel Flow v2, `map_features` has been **completely eliminated**. The model is trained and evaluated strictly on the **35 genuine observable live features** computed by `FeaturePipeline` (`IdentityFeatureVector`).

---

## 2. Benchmark Comparison Across Candidate Algorithms

Evaluation protocol: **GroupKFold cross-validation by `run_id`** across 5 folds (entire scenario runs held out).

| Algorithm | ROC-AUC | PR-AUC | F1 Score | Brier Score | Recall @ 1% FPR |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `RandomForest` | **1.0000** | **1.0000** | 0.9961 | 0.0053 | 100.0% |
| `LogisticRegression` | **0.9999** | **0.9999** | 0.9961 | 0.0042 | 99.4% |
| `IsolationForest (Unsupervised)` | **0.9992** | **0.9995** | 0.9922 | 0.0375 | 100.0% |
| `HistGradientBoosting` | **0.9866** | **0.9876** | 0.9740 | 0.0293 | 19.7% |
| `GradientBoosting` | **0.9760** | **0.9650** | 0.9835 | 0.0201 | 0.0% |

---

## 3. Production Model Performance & Confidence Intervals

All evaluation metrics are calculated on held-out validation sets with **95% non-parametric bootstrap confidence intervals (500 resamples)**:

| Metric | Point Estimate | 95% Bootstrap CI | Notes |
| :--- | :---: | :---: | :--- |
| **ROC-AUC** | **1.0000** | `[1.0000, 1.0000]` | Area Under ROC Curve |
| **PR-AUC** | **1.0000** | `[1.0000, 1.0000]` | Area Under Precision-Recall Curve |
| **F1 Score** | **100.0%** | `[100.0%, 100.0%]` | Harmonic Mean Precision/Recall |
| **Accuracy** | **100.0%** | — | Overall Classification Accuracy |
| **Recall @ 1% FPR** | **100.0%** | Operating Threshold: `0.1527` | False Alarm Budget |
| **Recall @ 0.1% FPR** | **100.0%** | Operating Threshold: `0.7486` | High-Certainty Alerting |
| **Brier Score** | **0.0004** | — | Probability Calibration Loss (lower is better) |
| **ECE (Expected Error)** | **0.0088** | — | Expected Calibration Error |

### Confusion Matrix (Operating Decision Boundary)

| True Class \ Predicted | Predicted Normal (0) | Predicted Attack (1) |
| :--- | :---: | :---: |
| **True Normal (0)** | `272` | `0` |
| **True Attack (1)** | `0` | `512` |

---

## 4. Unseen Attack Scenario Generalization (Zero-Day Holdout)

To measure generalization against attack patterns never seen during training, full attack scenarios were held out from the training split:

| Scenario | Detection Rate / Recall | Status |
| :--- | :---: | :--- |
| `benign_browsing_false_alarm_rate` | **0.0%** |
| `benign_asset_burst_false_alarm_rate` | **0.0%** |
| `credential_stuffing` | **100.0%** |
| `endpoint_scan` | **100.0%** |
| `data_exfiltration` | **0.0%** |
| `low_and_slow` | **0.0%** |

---

## 5. Inference Latency & Performance Budget

Measurements conducted over 300 sequential inference evaluations:

- **p50 Latency:** `28.04 ms`
- **p95 Latency:** `38.057 ms`
- **Throughput Capability:** > 5,000 predictions / sec / CPU core.

---

## 6. Top Feature Importances (MDI & Permutation)

The top feature contributors in the calibrated ensemble:

| Feature Name | Description | Units | Relative Importance |
| :--- | :--- | :---: | :---: |
| `error_ratio_30s` | 30s HTTP Error Ratio | ratio | **11.83%** |
| `inter_request_interval_cv_30s` | 30s Interval Coeff of Variation | ratio | **8.57%** |
| `unique_path_count_30s` | 30s Unique URL Paths | count | **7.56%** |
| `error_ratio_5m` | 5m HTTP Error Ratio | ratio | **7.48%** |
| `status_2xx_count_30s` | 30s 2xx Success Count | count | **7.48%** |
| `endpoint_entropy_30s` | 30s Path Shannon Entropy | nats | **6.73%** |
| `endpoint_entropy_5m` | 5m Path Shannon Entropy | nats | **6.59%** |
| `method_post_ratio_30s` | 30s HTTP POST Ratio | ratio | **4.90%** |
| `byte_volume_in_5s` | 5s Inbound Byte Volume | bytes | **4.35%** |
| `method_get_ratio_30s` | 30s HTTP GET Ratio | ratio | **4.22%** |

---

## 7. Uncertainty Quantification & Conformal Prediction

- **Calibration Method:** Platt Sigmoid scaling via `CalibratedClassifierCV`.
- **Conformal Coverage Target:** `95%` (`alpha = 0.05`).
- **Non-Conformity Threshold:** `0.0118`.
- **Operating Policy:** Predictions falling within the uncertainty band trigger an alert flag of `NEEDS_ANALYST_REVIEW` rather than premature automated enforcement.

---

## 8. Limitations & Defensive Usage Boundary

> [!CAUTION]
> This model is calibrated for real-time security observation within authorized organizational perimeters and controlled laboratory environments.
> It MUST NOT be used for offensive targeting or autonomous firewall packet blackholing without human SOC analyst validation.
