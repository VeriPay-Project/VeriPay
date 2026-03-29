"""
VeriPay Forensic Analysis Service — Merged
============================================
Combines:
  - Calibrated scoring engine from v2 (1,323 invoice dataset, 95.7% accuracy)
  - Clean architecture + context managers from v3
  - Real bounding box generation for ELA hotspots, font outliers, text anomalies
  - Shared image injection (pass rendered image in from image_service)
  - PIL fallback loader
  - Input quality assessment feeding confidence into every layer
  - Cross-signal boosts, 4-level risk, Tier 1 override logic
"""

import io
import os
import logging
from typing import Any, Optional, Tuple

import numpy as np

try:
    import fitz
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

try:
    import cv2
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


logger = logging.getLogger("veripay.forensics")


# ─── Calibration Config (from 1,323 invoice dataset) ────────────────────────

CALIBRATION_CONFIG = {
    # Per-signal thresholds (from calibration data)
    "thresholds": {
        "font":      0.006,
        "copy_move": 1.000,   # effectively disabled — useless on dataset
        "metadata":  0.40,
        "text":      0.25,
        "dct":       0.35,
        "ela":       0.006,
        "noise":     0.92,
    },

    # Confidence-weighted blend weights
    "weights": {
        "ela":       0.35,
        "noise":     0.25,
        "font":      0.20,
        "text":      0.15,
        "metadata":  0.05,
        "copy_move": 0.00,   # demoted — maxes at 1.0 on both classes
        "dct":       0.00,   # demoted — scored 0.0 on both classes
    },

    # Co-occurrence boosts when multiple signals fire together
    "cross_signal_boosts": [
        {"signals": ["font", "text"],     "boost": 0.10, "reason": "Font inconsistency + text region anomaly"},
        {"signals": ["font", "ela"],      "boost": 0.08, "reason": "Font inconsistency + ELA anomaly"},
        {"signals": ["ela", "noise"],     "boost": 0.05, "reason": "ELA + noise both anomalous"},
        {"signals": ["metadata", "font"], "boost": 0.10, "reason": "Metadata anomaly + font inconsistency"},
    ],

    # Risk level boundaries (tightened from calibration)
    "risk_boundaries": {
        "low_max":    0.235,
        "medium_max": 0.27,
        "high_max":   0.40,
    },

    "font": {
        "max_normal_fonts":  3,
        "outlier_threshold": 0.10,
    },

    "copy_move": {
        "min_matches":  80,
        "orb_features": 1000,
    },

    "ela": {
        "jpeg_quality":  90,
        "normalize_max": 25.0,
        # How many std deviations above mean to flag as hotspot
        "hotspot_sigma": 2.0,
        # Min pixels in a hotspot cluster to emit a bbox
        "min_hotspot_pixels": 50,
        # Max number of spatial bbox highlights to emit
        "max_spatial_highlights": 4,
    },

    "noise": {
        "expected_variance": 150,
        "variance_range":    300,
    },

    "dct": {
        "normalize_max": 25.0,
    },
}

# Signal tiers — Tier 1 can override risk level upward
TIER_1 = {"font", "ela"}
TIER_2 = {"noise", "text", "metadata"}
TIER_3 = {"dct", "copy_move"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _normalize(value: float, max_val: float) -> float:
    if max_val <= 0:
        return 0.0
    return min(1.0, max(0.0, float(value) / float(max_val)))


def _safe_gray(image: Optional[np.ndarray]) -> Optional[np.ndarray]:
    if image is None or not HAS_OPENCV:
        return None
    try:
        if len(image.shape) == 2:
            return image
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    except Exception as exc:
        logger.warning("_safe_gray failed: %s", exc)
        return None


def _pil_to_bgr(pil_image: "Image.Image") -> Optional[np.ndarray]:
    if not (HAS_PIL and HAS_OPENCV):
        return None
    try:
        rgb = np.array(pil_image.convert("RGB"))
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception as exc:
        logger.warning("_pil_to_bgr failed: %s", exc)
        return None


def _cluster_points_to_bbox(
    points: np.ndarray,
    image_shape: Tuple[int, int],
    padding: int = 10,
) -> Optional[list]:
    """
    Given an array of (y, x) points, return [x, y, w, h] bounding box
    with optional padding, clamped to image bounds.
    """
    if len(points) == 0:
        return None
    h_img, w_img = image_shape
    ys, xs = points[:, 0], points[:, 1]
    x1 = max(0, int(xs.min()) - padding)
    y1 = max(0, int(ys.min()) - padding)
    x2 = min(w_img, int(xs.max()) + padding)
    y2 = min(h_img, int(ys.max()) + padding)
    w = x2 - x1
    h = y2 - y1
    if w <= 0 or h <= 0:
        return None
    return [x1, y1, w, h]


# ─── Image Loading ────────────────────────────────────────────────────────────

def _load_image(
    file_path: str,
    file_type: str,
) -> Tuple[Optional[np.ndarray], Optional[str]]:
    """
    Load image from file. Returns (image_bgr, reason_string).
    reason_string describes the loader used, or error if None returned.
    """
    if not HAS_OPENCV:
        return None, "OpenCV is not installed"

    try:
        if file_type == "pdf":
            if not HAS_PYMUPDF:
                return None, "PyMuPDF is not installed"

            with fitz.open(file_path) as doc:
                if len(doc) == 0:
                    return None, "PDF has no pages"
                pix = doc[0].get_pixmap(dpi=200, alpha=False)
                img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                    pix.height, pix.width, pix.n
                )

            if pix.n == 4:
                return cv2.cvtColor(img, cv2.COLOR_RGBA2BGR), "pdf_rasterized"
            if pix.n == 3:
                return cv2.cvtColor(img, cv2.COLOR_RGB2BGR), "pdf_rasterized"
            if pix.n == 1:
                return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), "pdf_rasterized"
            return img, "pdf_rasterized"

        # Image file — try OpenCV first, PIL as fallback
        image = cv2.imread(file_path, cv2.IMREAD_COLOR)
        if image is not None:
            return image, "opencv"

        if HAS_PIL:
            with Image.open(file_path) as src:
                fallback = _pil_to_bgr(src)
            if fallback is not None:
                return fallback, "pil_fallback"

        return None, "Image could not be decoded"

    except Exception as exc:
        logger.warning("_load_image failed: %s", exc)
        return None, f"Image load failed: {exc}"


# ─── Input Quality Assessment ────────────────────────────────────────────────

def _assess_input_quality(
    file_path: str,
    image: Optional[np.ndarray],
) -> Tuple[float, list]:
    """
    Score 0–1 representing how reliable the visual analysis will be.
    Low resolution or missing OpenCV degrades confidence of image-based layers.
    """
    quality = 1.0
    warnings = []
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        quality *= 0.85
        warnings.append("PDF: visual analysis on rendered image")

    if image is not None and HAS_OPENCV:
        h, w = image.shape[:2]
        if h < 500 or w < 400:
            quality *= 0.6
            warnings.append(f"Low resolution ({w}×{h})")
        elif h < 800 or w < 600:
            quality *= 0.8
            warnings.append(f"Moderate resolution ({w}×{h})")

    if not HAS_OPENCV:
        quality *= 0.5
        warnings.append("OpenCV not available — visual layers degraded")

    return round(quality, 3), warnings


# ─── Layer: Fonts ─────────────────────────────────────────────────────────────

def _analyze_fonts(file_path: str) -> dict:
    result = {
        "name": "font", "score": 0.0, "confidence": 0.0,
        "triggered": False, "details": {}, "highlights": [],
    }

    if not HAS_PYMUPDF:
        result["details"]["error"] = "PyMuPDF not installed"
        return result

    if not file_path.lower().endswith(".pdf"):
        result["confidence"] = 0.2
        result["details"]["note"] = "Font analysis requires PDF"
        return result

    try:
        font_usage: dict[str, int] = {}
        font_bboxes: dict[str, list] = {}  # font_name → list of span bboxes
        total_chars = 0

        with fitz.open(file_path) as doc:
            for page in doc:
                blocks = page.get_text("dict").get("blocks", [])
                for block in blocks:
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            font_name = span.get("font") or "unknown"
                            char_count = len(span.get("text", ""))
                            font_usage[font_name] = font_usage.get(font_name, 0) + char_count
                            total_chars += char_count
                            # Collect bbox per font for spatial highlights
                            bbox_raw = span.get("bbox")
                            if bbox_raw and len(bbox_raw) == 4:
                                font_bboxes.setdefault(font_name, []).append(bbox_raw)

        if total_chars == 0:
            result["confidence"] = 0.3
            result["details"]["note"] = "No text found"
            return result

        cfg = CALIBRATION_CONFIG["font"]
        unique_fonts = list(font_usage.keys())
        num_fonts = len(unique_fonts)
        font_proportions = {n: c / total_chars for n, c in font_usage.items()}

        outlier_fonts = [
            n for n, p in font_proportions.items()
            if p < cfg["outlier_threshold"]
        ]

        score = 0.0
        issues = []
        highlights = []

        if num_fonts > cfg["max_normal_fonts"]:
            excess = num_fonts - cfg["max_normal_fonts"]
            score += min(0.4, excess * 0.1)
            issues.append(f"High font diversity: {num_fonts} unique fonts")

        if outlier_fonts:
            score += min(0.4, len(outlier_fonts) * 0.15)
            issues.append(f"Outlier fonts: {', '.join(outlier_fonts[:3])}")

            # Emit real bboxes for the first 3 outlier font regions
            for font_name in outlier_fonts[:3]:
                bboxes = font_bboxes.get(font_name, [])
                if not bboxes:
                    continue
                # Use the first span bbox of this outlier font
                b = bboxes[0]
                x, y, x2, y2 = b
                w = int(x2 - x)
                h = int(y2 - y)
                if w > 0 and h > 0:
                    highlights.append({
                        "type": "font_outlier",
                        "bbox": [int(x), int(y), w, h],
                        "confidence": round(min(1.0, score), 3),
                        "message": f"Outlier font '{font_name}' used in <{cfg['outlier_threshold']*100:.0f}% of text",
                    })

        score = min(1.0, score)
        threshold = CALIBRATION_CONFIG["thresholds"]["font"]

        result.update({
            "score": score,
            "confidence": 0.95,
            "triggered": score >= threshold,
            "highlights": highlights,
            "details": {
                "font_count": num_fonts,
                "unique_fonts": unique_fonts,
                "font_proportions": {k: round(v, 4) for k, v in font_proportions.items()},
                "outlier_fonts": outlier_fonts,
                "issues": issues,
            },
        })

    except Exception as exc:
        logger.warning("_analyze_fonts failed: %s", exc)
        result["details"]["error"] = str(exc)

    return result


# ─── Layer: Metadata ──────────────────────────────────────────────────────────

def _analyze_metadata(file_path: str) -> dict:
    result = {
        "name": "metadata", "score": 0.0, "confidence": 0.0,
        "triggered": False, "details": {}, "highlights": [],
    }

    if not HAS_PYMUPDF:
        result["details"]["error"] = "PyMuPDF not installed"
        return result

    if not file_path.lower().endswith(".pdf"):
        result["confidence"] = 0.3
        return result

    try:
        with fitz.open(file_path) as doc:
            meta = doc.metadata or {}

        producer = meta.get("producer", "")
        creator = meta.get("creator", "")
        creation = meta.get("creationDate", "")
        mod = meta.get("modDate", "")

        score = 0.0
        issues = []

        suspicious_tools = ["photoshop", "canva", "gimp", "inkscape", "illustrator"]
        for tool in suspicious_tools:
            if tool in producer.lower() or tool in creator.lower():
                score += 0.3
                issues.append(f"Editing software detected: {producer or creator}")
                break

        if not producer and not creator:
            score += 0.2
            issues.append("Missing producer/creator metadata")

        if creation and mod and creation != mod:
            score += 0.15
            issues.append("Creation and modification dates differ")

        score = min(1.0, score)
        threshold = CALIBRATION_CONFIG["thresholds"]["metadata"]

        result.update({
            "score": score,
            "confidence": 0.8,
            "triggered": score >= threshold,
            "details": {
                "producer": producer,
                "creator": creator,
                "creation_date": creation,
                "mod_date": mod,
                "issues": issues,
            },
        })

    except Exception as exc:
        logger.warning("_analyze_metadata failed: %s", exc)
        result["details"]["error"] = str(exc)

    return result


# ─── Layer: Text Consistency ──────────────────────────────────────────────────

def _analyze_text_consistency(file_path: str) -> dict:
    result = {
        "name": "text", "score": 0.0, "confidence": 0.0,
        "triggered": False, "details": {}, "highlights": [],
    }

    if not HAS_PYMUPDF:
        result["details"]["error"] = "PyMuPDF not installed"
        return result

    if not file_path.lower().endswith(".pdf"):
        result["confidence"] = 0.2
        return result

    try:
        all_sizes = []
        all_x = []
        # Track spans with their sizes and bboxes for spatial highlighting
        span_data = []  # (size, bbox)

        with fitz.open(file_path) as doc:
            for page in doc:
                blocks = page.get_text("dict").get("blocks", [])
                for block in blocks:
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            sz = span.get("size", 12)
                            all_sizes.append(sz)
                            origin = span.get("origin", [0, 0])
                            all_x.append(round(origin[0], 1))
                            bbox_raw = span.get("bbox")
                            if bbox_raw and len(bbox_raw) == 4:
                                span_data.append((sz, bbox_raw))

        if len(all_sizes) < 5:
            result["confidence"] = 0.3
            result["details"]["note"] = "Insufficient text"
            return result

        size_std = float(np.std(all_sizes))
        mean_size = float(np.mean(all_sizes))
        unique_sizes = len(set(round(s, 1) for s in all_sizes))
        x_clusters = len(set(round(x, 0) for x in all_x))

        score = 0.0
        issues = []
        highlights = []

        if unique_sizes > 6:
            score += 0.3
            issues.append(f"Unusual size variety: {unique_sizes} unique sizes")

        if size_std > 5.0:
            score += 0.2
            issues.append(f"High font size variance: std={size_std:.1f}")

        if x_clusters > 10:
            score += 0.2
            issues.append(f"Inconsistent alignment: {x_clusters} x-positions")

        # Emit bboxes for spans with strongly outlier font sizes
        if size_std > 5.0 and span_data:
            outlier_threshold = mean_size + 2.0 * size_std
            for sz, bbox_raw in span_data[:]:
                if sz > outlier_threshold:
                    x, y, x2, y2 = bbox_raw
                    w = int(x2 - x)
                    h = int(y2 - y)
                    if w > 0 and h > 0:
                        highlights.append({
                            "type": "text_size_outlier",
                            "bbox": [int(x), int(y), w, h],
                            "confidence": round(min(1.0, score), 3),
                            "message": f"Font size {sz:.1f}pt is an outlier (mean {mean_size:.1f}pt)",
                        })
                    if len(highlights) >= 3:
                        break

        score = min(1.0, score)
        threshold = CALIBRATION_CONFIG["thresholds"]["text"]

        result.update({
            "score": score,
            "confidence": 0.65,
            "triggered": score >= threshold,
            "highlights": highlights,
            "details": {
                "unique_sizes": unique_sizes,
                "size_std": round(size_std, 3),
                "alignment_clusters": x_clusters,
                "issues": issues,
            },
        })

    except Exception as exc:
        logger.warning("_analyze_text_consistency failed: %s", exc)
        result["details"]["error"] = str(exc)

    return result


# ─── Layer: ELA ───────────────────────────────────────────────────────────────

def _analyze_ela(image: np.ndarray, quality: float) -> dict:
    result = {
        "name": "ela", "score": 0.0, "confidence": 0.0,
        "triggered": False, "details": {}, "highlights": [],
    }

    if not HAS_OPENCV or not HAS_PIL:
        result["details"]["error"] = "OpenCV or PIL not available"
        return result

    cfg_ela = CALIBRATION_CONFIG["ela"]

    try:
        img_pil = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        buf = io.BytesIO()
        img_pil.save(buf, format="JPEG", quality=cfg_ela["jpeg_quality"])
        buf.seek(0)
        recomp = np.array(Image.open(buf))

        original_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        if original_rgb.shape != recomp.shape:
            recomp = cv2.resize(recomp, (original_rgb.shape[1], original_rgb.shape[0]))

        diff = cv2.absdiff(original_rgb, recomp).astype(np.float32)
        ela_map = np.mean(diff, axis=2)
        ela_mean = float(np.mean(ela_map))
        ela_std = float(np.std(ela_map))

        score = _normalize(ela_mean, cfg_ela["normalize_max"])
        confidence = 0.85 * quality

        # Find real hotspot clusters using contour detection
        highlights = []
        high_thresh = ela_mean + cfg_ela["hotspot_sigma"] * ela_std

        if high_thresh > 0:
            hot_mask = (ela_map > high_thresh).astype(np.uint8) * 255

            # Morphological closing to merge nearby pixels
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
            hot_mask = cv2.morphologyEx(hot_mask, cv2.MORPH_CLOSE, kernel)

            contours, _ = cv2.findContours(
                hot_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )

            # Sort by area descending, take top N
            contours = sorted(contours, key=cv2.contourArea, reverse=True)
            max_hl = cfg_ela["max_spatial_highlights"]

            for cnt in contours[:max_hl]:
                if cv2.contourArea(cnt) < cfg_ela["min_hotspot_pixels"]:
                    continue
                x, y, w, h = cv2.boundingRect(cnt)
                highlights.append({
                    "type": "ela_hotspot",
                    "bbox": [x, y, w, h],
                    "confidence": round(score, 3),
                    "message": f"ELA recompression anomaly detected in region",
                })

        threshold = CALIBRATION_CONFIG["thresholds"]["ela"]
        result.update({
            "score": score,
            "confidence": confidence,
            "triggered": score >= threshold,
            "highlights": highlights,
            "details": {
                "ela_mean": round(ela_mean, 4),
                "ela_std": round(ela_std, 4),
                "hotspot_count": len(highlights),
            },
        })

    except Exception as exc:
        logger.warning("_analyze_ela failed: %s", exc)
        result["details"]["error"] = str(exc)

    return result


# ─── Layer: Noise ─────────────────────────────────────────────────────────────

def _analyze_noise(image: np.ndarray, quality: float) -> dict:
    result = {
        "name": "noise", "score": 0.0, "confidence": 0.0,
        "triggered": False, "details": {}, "highlights": [],
    }

    if not HAS_OPENCV:
        result["details"]["error"] = "OpenCV not available"
        return result

    cfg = CALIBRATION_CONFIG["noise"]

    try:
        gray = _safe_gray(image)
        if gray is None:
            result["details"]["error"] = "Could not convert to grayscale"
            return result

        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        deviation = abs(lap_var - cfg["expected_variance"])
        score = _normalize(deviation, cfg["variance_range"])
        confidence = 0.6 * quality

        threshold = CALIBRATION_CONFIG["thresholds"]["noise"]
        result.update({
            "score": score,
            "confidence": confidence,
            "triggered": score >= threshold,
            "details": {
                "laplacian_variance": round(lap_var, 4),
                "deviation": round(deviation, 4),
            },
        })

    except Exception as exc:
        logger.warning("_analyze_noise failed: %s", exc)
        result["details"]["error"] = str(exc)

    return result


# ─── Layer: DCT/Frequency ─────────────────────────────────────────────────────

def _analyze_dct(image: np.ndarray, quality: float) -> dict:
    result = {
        "name": "dct", "score": 0.0, "confidence": 0.0,
        "triggered": False, "details": {}, "highlights": [],
    }

    if not HAS_OPENCV:
        result["details"]["error"] = "OpenCV not available"
        return result

    try:
        gray = _safe_gray(image)
        if gray is None:
            result["details"]["error"] = "Could not convert to grayscale"
            return result

        gray_f = np.float32(gray)
        h, w = gray_f.shape
        h2 = cv2.getOptimalDFTSize(h)
        w2 = cv2.getOptimalDFTSize(w)
        padded = np.zeros((h2, w2), dtype=np.float32)
        padded[:h, :w] = gray_f

        dft = cv2.dft(padded, flags=cv2.DFT_COMPLEX_OUTPUT)
        dft_shift = np.fft.fftshift(dft, axes=[0, 1])
        magnitude = cv2.magnitude(dft_shift[:, :, 0], dft_shift[:, :, 1])
        mag_log = np.log1p(magnitude)

        cy, cx = h2 // 2, w2 // 2
        radius = min(cy, cx) // 3
        y_c, x_c = np.ogrid[:h2, :w2]
        dist = np.sqrt((y_c - cy) ** 2 + (x_c - cx) ** 2)

        low_freq = mag_log[dist <= radius]
        high_freq = mag_log[dist > radius * 2]
        low_e = float(np.mean(low_freq)) if len(low_freq) > 0 else 0.0
        high_e = float(np.mean(high_freq)) if len(high_freq) > 0 else 0.0
        ratio = high_e / low_e if low_e > 0 else 0.0

        # Low high/low ratio = suppressed high freq = possible smoothing/forgery
        score = 0.0
        if ratio < 0.1:
            score = 0.8
        elif ratio < 0.2:
            score = 0.5
        elif ratio < 0.3:
            score = 0.3

        confidence = 0.7 * quality
        threshold = CALIBRATION_CONFIG["thresholds"]["dct"]

        result.update({
            "score": score,
            "confidence": confidence,
            "triggered": score >= threshold,
            "details": {
                "low_freq_energy": round(low_e, 4),
                "high_freq_energy": round(high_e, 4),
                "ratio": round(ratio, 4),
            },
        })

    except Exception as exc:
        logger.warning("_analyze_dct failed: %s", exc)
        result["details"]["error"] = str(exc)

    return result


# ─── Layer: Copy-Move ─────────────────────────────────────────────────────────

def _analyze_copy_move(image: np.ndarray, quality: float) -> dict:
    result = {
        "name": "copy_move", "score": 0.0, "confidence": 0.0,
        "triggered": False, "details": {}, "highlights": [],
    }

    if not HAS_OPENCV:
        result["details"]["error"] = "OpenCV not available"
        return result

    cfg = CALIBRATION_CONFIG["copy_move"]

    try:
        gray = _safe_gray(image)
        if gray is None:
            result["details"]["error"] = "Could not convert to grayscale"
            return result

        orb = cv2.ORB_create(nfeatures=cfg["orb_features"])
        keypoints, descriptors = orb.detectAndCompute(gray, None)

        if descriptors is None or len(descriptors) < 10:
            result.update({"confidence": 0.5, "details": {"note": "Insufficient features"}})
            return result

        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        matches = matcher.knnMatch(descriptors, descriptors, k=5)

        seen: set = set()
        suspicious_pairs = []

        for group in matches:
            for m in group:
                if m.queryIdx == m.trainIdx:
                    continue
                pt1 = keypoints[m.queryIdx].pt
                pt2 = keypoints[m.trainIdx].pt
                # Must be spatially distant AND visually similar
                spatial_dist = np.sqrt((pt1[0] - pt2[0]) ** 2 + (pt1[1] - pt2[1]) ** 2)
                if spatial_dist > 30 and m.distance < 30:
                    key = tuple(sorted([
                        (round(pt1[0]), round(pt1[1])),
                        (round(pt2[0]), round(pt2[1])),
                    ]))
                    if key not in seen:
                        seen.add(key)
                        suspicious_pairs.append((pt1, pt2))

        match_count = len(suspicious_pairs)
        score = _normalize(match_count, cfg["min_matches"] * 2)
        confidence = 0.8 * quality

        highlights = []
        if match_count > cfg["min_matches"]:
            # Cluster the suspicious points into a bbox
            all_pts = np.array(
                [(int(p[1]), int(p[0])) for pair in suspicious_pairs for p in pair]
            )
            bbox = _cluster_points_to_bbox(all_pts, gray.shape)
            highlights.append({
                "type": "copy_move_region",
                "bbox": bbox,
                "confidence": round(score, 3),
                "message": f"Copy-move forgery: {match_count} suspicious matches",
            })

        threshold = CALIBRATION_CONFIG["thresholds"]["copy_move"]
        result.update({
            "score": score,
            "confidence": confidence,
            "triggered": score >= threshold,
            "highlights": highlights,
            "details": {
                "keypoints": len(keypoints),
                "suspicious_matches": match_count,
            },
        })

    except Exception as exc:
        logger.warning("_analyze_copy_move failed: %s", exc)
        result["details"]["error"] = str(exc)

    return result


# ─── Scoring Engine ───────────────────────────────────────────────────────────

def _compute_score(layers: dict) -> float:
    """Confidence-weighted score — uncertain layers contribute less."""
    weights = CALIBRATION_CONFIG["weights"]
    total_w = 0.0
    weighted_sum = 0.0

    for name, layer in layers.items():
        w = weights.get(name, 0.0)
        if w == 0.0:
            continue
        # Weight adjusted by layer confidence
        adj_w = w * layer["confidence"]
        weighted_sum += adj_w * layer["score"]
        total_w += adj_w

    return round(weighted_sum / total_w, 4) if total_w > 0 else 0.0


def _apply_boosts(base: float, layers: dict) -> Tuple[float, list]:
    """Add score boosts when correlated signals co-occur."""
    reasons = []
    boost = 0.0

    for rule in CALIBRATION_CONFIG["cross_signal_boosts"]:
        if all(layers.get(s, {}).get("triggered", False) for s in rule["signals"]):
            boost += rule["boost"]
            reasons.append(rule["reason"])

    return min(1.0, base + boost), reasons


def _determine_risk(score: float, layers: dict) -> Tuple[str, list]:
    """
    4-level risk classification with Tier 1 override.
    If any Tier 1 signal fires, risk cannot be 'low'.
    """
    bounds = CALIBRATION_CONFIG["risk_boundaries"]

    if score <= bounds["low_max"]:
        risk = "low"
    elif score <= bounds["medium_max"]:
        risk = "medium"
    elif score <= bounds["high_max"]:
        risk = "high"
    else:
        risk = "critical"

    reasons = []

    tier1_fired = [n for n in TIER_1 if layers.get(n, {}).get("triggered", False)]
    if tier1_fired and risk == "low":
        risk = "medium"
        reasons.extend([f"High-trust signal fired: {n}" for n in tier1_fired])

    for name, layer in layers.items():
        if layer.get("triggered"):
            for issue in layer.get("details", {}).get("issues", []):
                reasons.append(issue)

    if not reasons:
        reasons.append("No significant anomalies detected")

    return risk, reasons


# ─── Main Entry Point ────────────────────────────────────────────────────────

def run_forensics_analysis(
    file_path: str,
    file_type: str = "pdf",
    *,
    image: Optional[np.ndarray] = None,
    advanced: bool = False,
) -> dict[str, Any]:
    """
    Run full forensic analysis pipeline.

    Args:
        file_path:  Path to the invoice file.
        file_type:  "pdf" or "image".
        image:      Optional pre-rendered numpy image (BGR). If provided,
                    skips internal image loading — use this when image_service
                    has already rendered the preview to avoid double-rendering.
        advanced:   Force advanced analysis (DCT + copy-move) even if core
                    score is below the trigger threshold.
    """
    logger.info("Forensics: analyzing %s (%s)", file_path, file_type)

    image_reason: Optional[str] = None

    if image is None:
        image, image_reason = _load_image(file_path, file_type)
    else:
        image_reason = "shared_preview_pipeline"

    image_analyzed = image is not None
    input_quality, quality_warnings = _assess_input_quality(file_path, image)

    # ── Tier 1 (always run) ──────────────────────────────────────────────────
    no_image_layer: dict = {
        "score": 0.0, "confidence": 0.0,
        "triggered": False, "details": {"note": "No image available"}, "highlights": [],
    }

    layers: dict[str, dict] = {}
    layers["font"] = _analyze_fonts(file_path)
    layers["ela"] = _analyze_ela(image, input_quality) if image_analyzed else {**no_image_layer, "name": "ela"}

    # ── Tier 2 ───────────────────────────────────────────────────────────────
    layers["noise"]    = _analyze_noise(image, input_quality) if image_analyzed else {**no_image_layer, "name": "noise"}
    layers["metadata"] = _analyze_metadata(file_path)
    layers["text"]     = _analyze_text_consistency(file_path)

    # ── Tier 3 (advanced — run if forced or core score exceeds threshold) ────
    base_score_preview = _compute_score({k: v for k, v in layers.items()})
    run_advanced = advanced or base_score_preview > 0.25

    if run_advanced and image_analyzed:
        layers["dct"]       = _analyze_dct(image, input_quality)
        layers["copy_move"] = _analyze_copy_move(image, input_quality)
    else:
        layers["dct"]       = {**no_image_layer, "name": "dct"}
        layers["copy_move"] = {**no_image_layer, "name": "copy_move"}

    # ── Scoring ───────────────────────────────────────────────────────────────
    base_score = _compute_score(layers)
    boosted_score, boost_reasons = _apply_boosts(base_score, layers)
    risk_level, risk_reasons = _determine_risk(boosted_score, layers)
    risk_reasons = list(dict.fromkeys(risk_reasons + boost_reasons))  # dedup

    # ── Collect highlights from all layers ────────────────────────────────────
    all_highlights = []
    for layer in layers.values():
        all_highlights.extend(layer.get("highlights", []))

    spatial_highlights  = [h for h in all_highlights if h.get("bbox")]
    document_highlights = [h for h in all_highlights if not h.get("bbox")]

    # ── Signals ───────────────────────────────────────────────────────────────
    signals = []
    for name, layer in layers.items():
        if layer.get("triggered"):
            for issue in layer.get("details", {}).get("issues", []):
                signals.append({
                    "type": f"{name}_anomaly",
                    "confidence": round(float(layer["score"]), 4),
                    "message": issue,
                })

    if not image_analyzed:
        signals.append({
            "type": "visual_analysis_unavailable",
            "confidence": 0.0,
            "message": image_reason or "Visual analysis unavailable",
        })

    # ── Layer score summary for UI ────────────────────────────────────────────
    layer_scores = {
        name: {
            "score":     round(float(layer["score"]), 4),
            "confidence": round(float(layer["confidence"]), 3),
            "triggered": bool(layer["triggered"]),
        }
        for name, layer in layers.items()
    }

    logger.info("Forensics complete: score=%.4f risk=%s", boosted_score, risk_level)

    return {
        "status": "ok",
        "forensic_score":   round(boosted_score, 4),
        "risk_level":       risk_level,
        "risk_reasons":     risk_reasons,
        "input_quality":    input_quality,
        "quality_warnings": quality_warnings,
        "advanced_used":    run_advanced,
        "image_analyzed":   image_analyzed,
        "image_reason":     image_reason,

        # Per-layer flat scores (backward compat for UI cards)
        "metadata_score":    round(float(layers["metadata"]["score"]), 4),
        "ela_score":         round(float(layers["ela"]["score"]), 4),
        "noise_score":       round(float(layers["noise"]["score"]), 4),
        "dct_score":         round(float(layers["dct"]["score"]), 4),
        "copy_move_score":   round(float(layers["copy_move"]["score"]), 4),
        "font_score":        round(float(layers["font"]["score"]), 4),
        "text_region_score": round(float(layers["text"]["score"]), 4),

        # Full layer breakdown for debug / expanded UI
        "layer_scores": layer_scores,

        "signals":            signals,
        "spatial_highlights":  spatial_highlights,
        "document_highlights": document_highlights,

        # Backward compat
        "highlights": spatial_highlights + document_highlights,
    }