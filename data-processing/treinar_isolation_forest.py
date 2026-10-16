"""Train and export the Ampara phone-motion one-class model from UCI-HAR."""

from __future__ import annotations

import argparse
import io
import json
import math
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


DATASET_URL = "https://archive.ics.uci.edu/static/public/240/human+activity+recognition+using+smartphones.zip"
FEATURE_NAMES = [
    "mean_magnitude_g",
    "stddev_magnitude_g",
    "peak_magnitude_g",
    "max_jerk_g_per_second",
]
SAMPLE_DECIMATION = 5  # UCI-HAR: 50 Hz; app: Accelerometer Expo a 10 Hz.
ACTIVITY_NAMES = {
    1: "walking",
    2: "walking_upstairs",
    3: "walking_downstairs",
    4: "sitting",
    5: "standing",
    6: "laying",
}


def ensure_dataset(dataset_dir: Path, download: bool) -> Path:
    if (dataset_dir / "train" / "y_train.txt").is_file():
        return dataset_dir
    if not download:
        raise FileNotFoundError(
            f"Dataset not found at {dataset_dir}. Pass --download or --dataset-dir."
        )

    dataset_dir.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(DATASET_URL, headers={"User-Agent": "Ampara-TCC/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        outer_archive = zipfile.ZipFile(io.BytesIO(response.read()))
    inner_name = next(
        name for name in outer_archive.namelist()
        if name.endswith("UCI HAR Dataset.zip")
    )
    inner_archive = zipfile.ZipFile(io.BytesIO(outer_archive.read(inner_name)))
    inner_archive.extractall(dataset_dir)
    extracted = dataset_dir / "UCI HAR Dataset"
    if not (extracted / "train" / "y_train.txt").is_file():
        raise RuntimeError("UCI-HAR archive did not contain the expected training files")
    return extracted


def load_motion_features(dataset_dir: Path, split: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    suffix = "train" if split == "train" else "test"
    signal_dir = dataset_dir / split / "Inertial Signals"
    axes = [
        np.loadtxt(signal_dir / f"total_acc_{axis}_{suffix}.txt", dtype=np.float64)
        for axis in ("x", "y", "z")
    ]
    magnitude = np.sqrt(sum(axis**2 for axis in axes))
    magnitude = magnitude[:, ::SAMPLE_DECIMATION]
    features = np.column_stack(
        (
            magnitude.mean(axis=1),
            magnitude.std(axis=1),
            magnitude.max(axis=1),
            np.abs(np.diff(magnitude, axis=1)).max(axis=1) * 50.0,
        )
    )
    labels = np.loadtxt(dataset_dir / split / f"y_{suffix}.txt", dtype=np.int64)
    subjects = np.loadtxt(dataset_dir / split / f"subject_{suffix}.txt", dtype=np.int64)
    normal = np.isin(labels, tuple(ACTIVITY_NAMES)) & np.isfinite(features).all(axis=1)
    return features[normal], labels[normal], subjects[normal]


def average_path_length(sample_count: int) -> float:
    if sample_count <= 1:
        return 0.0
    if sample_count == 2:
        return 1.0
    harmonic_approximation = math.log(sample_count - 1) + 0.5772156649015329
    return 2.0 * harmonic_approximation - 2.0 * (sample_count - 1) / sample_count


def export_tree(estimator) -> dict:
    tree = estimator.tree_
    return {
        "left": tree.children_left.tolist(),
        "right": tree.children_right.tolist(),
        "feature": tree.feature.tolist(),
        "threshold": tree.threshold.tolist(),
        "samples": tree.n_node_samples.tolist(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=Path("data/raw/uci_har"),
        help="Directory containing the extracted UCI HAR Dataset folder.",
    )
    parser.add_argument("--download", action="store_true", help="Download the official UCI archive if absent.")
    parser.add_argument(
        "--model-out",
        type=Path,
        default=Path("mobile/models/isolationForestMotionModel.json"),
    )
    parser.add_argument(
        "--report-out",
        type=Path,
        default=Path("docs/score_ml_evaluation.json"),
    )
    args = parser.parse_args()

    dataset_dir = ensure_dataset(args.dataset_dir, args.download)
    train_x, train_y, train_subjects = load_motion_features(dataset_dir, "train")
    test_x, test_y, test_subjects = load_motion_features(dataset_dir, "test")

    test_subject_ids = np.unique(test_subjects)
    calibration_subjects = set(test_subject_ids[: max(1, len(test_subject_ids) // 2)].tolist())
    calibration_mask = np.isin(test_subjects, tuple(calibration_subjects))
    evaluation_mask = ~calibration_mask

    scaler = StandardScaler().fit(train_x)
    train_scaled = scaler.transform(train_x)
    test_scaled = scaler.transform(test_x)
    forest = IsolationForest(
        n_estimators=100,
        max_samples=min(256, len(train_scaled)),
        contamination="auto",
        random_state=42,
        n_jobs=-1,
    ).fit(train_scaled)

    calibration_anomaly = -forest.score_samples(test_scaled[calibration_mask])
    evaluation_anomaly = -forest.score_samples(test_scaled[evaluation_mask])
    moderate_threshold = float(np.quantile(calibration_anomaly, 0.95))
    high_threshold = float(np.quantile(calibration_anomaly, 0.995))
    if high_threshold <= moderate_threshold:
        high_threshold = moderate_threshold + 1e-9

    activity_metrics = {}
    evaluation_labels = test_y[evaluation_mask]
    for activity_id, activity_name in ACTIVITY_NAMES.items():
        activity_mask = evaluation_labels == activity_id
        if not activity_mask.any():
            continue
        scores = evaluation_anomaly[activity_mask]
        activity_metrics[activity_name] = {
            "samples": int(activity_mask.sum()),
            "above_moderate_threshold_rate": round(float(np.mean(scores > moderate_threshold)), 4),
            "above_high_threshold_rate": round(float(np.mean(scores > high_threshold)), 4),
        }

    model = {
        "schemaVersion": 1,
        "algorithm": "IsolationForest",
        "modelVersion": "uci-har-motion-if-v1",
        "dataset": "UCI Human Activity Recognition Using Smartphones",
        "datasetDoi": "10.24432/C54S4K",
        "datasetLicense": "CC BY 4.0",
        "normalActivityLabels": list(ACTIVITY_NAMES.values()),
        "featureNames": FEATURE_NAMES,
        "trainingSamplingHz": 10,
        "windowDurationSeconds": 2.56,
        "scalerMean": scaler.mean_.tolist(),
        "scalerScale": scaler.scale_.tolist(),
        "maxSamples": int(forest.max_samples_),
        "moderateThreshold": moderate_threshold,
        "highThreshold": high_threshold,
        "trees": [export_tree(estimator) for estimator in forest.estimators_],
    }
    report = {
        "modelVersion": model["modelVersion"],
        "algorithm": "IsolationForest",
        "dataset": model["dataset"],
        "datasetDoi": model["datasetDoi"],
        "datasetLicense": model["datasetLicense"],
        "features": FEATURE_NAMES,
        "trainingSamplingHz": 10,
        "windowDurationSeconds": 2.56,
        "activityFilter": list(ACTIVITY_NAMES.values()),
        "trainSubjects": sorted(np.unique(train_subjects).astype(int).tolist()),
        "calibrationSubjects": sorted(int(subject) for subject in calibration_subjects),
        "evaluationSubjects": sorted(int(subject) for subject in np.unique(test_subjects[evaluation_mask])),
        "trainWindows": int(len(train_x)),
        "calibrationWindows": int(calibration_mask.sum()),
        "evaluationWindows": int(evaluation_mask.sum()),
        "thresholds": {
            "moderate": moderate_threshold,
            "high": high_threshold,
            "calibrationPercentiles": {"moderate": 95, "high": 99.5},
        },
        "evaluationOnNormalActivities": {
            "aboveModerateThresholdRate": round(float(np.mean(evaluation_anomaly > moderate_threshold)), 4),
            "aboveHighThresholdRate": round(float(np.mean(evaluation_anomaly > high_threshold)), 4),
            "meanAnomalyScore": round(float(np.mean(evaluation_anomaly)), 6),
            "byActivity": activity_metrics,
            "interpretation": "Normal-only holdout estimates outlier rates, not sensitivity to violence or emergency events.",
        },
        "limitations": [
            "UCI-HAR contains smartphone inertial signals, but no heart-rate or GPS labels/features.",
            "The source phone was carried at the waist; Ampara phone placement may differ.",
            "This model detects movement unlike the training distribution; an anomaly is not evidence of violence.",
            "Validation with representative Ampara field data is still required before alerts use this score.",
        ],
    }

    args.model_out.parent.mkdir(parents=True, exist_ok=True)
    args.report_out.parent.mkdir(parents=True, exist_ok=True)
    args.model_out.write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")
    args.report_out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"model": str(args.model_out), "report": str(args.report_out), **report["evaluationOnNormalActivities"]}, indent=2))


if __name__ == "__main__":
    main()
