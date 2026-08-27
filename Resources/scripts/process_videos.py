#!/usr/bin/env python3
"""
Procesa videos del ZIP con MediaPipe Tasks API y guarda landmarks en JSON.
Lee directo del ZIP sin extraer todo a disco.

Uso:
  python process_videos.py                    # 1 video por seña (50 videos, prueba rapida)
  python process_videos.py --all              # los 1000 videos COLOR_BODY
  python process_videos.py --sign 0           # una seña especifica, todas sus repeticiones
  python process_videos.py --sign 0 --rep 0 --angle 0   # un video exacto
  python process_videos.py --sign 0 --annotate           # con overlay de landmarks

Salida: scripts/landmarks/XXXX_XXXX_XXXX.json
        scripts/annotated/XXXX_XXXX_XXXX.mp4  (solo con --annotate)
"""

import argparse
import cv2
import json
import tempfile
import zipfile
from pathlib import Path

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

ZIP_PATH    = Path(__file__).parent.parent / "data" / "VIDEOS.zip"
MODEL_PATH  = Path(__file__).parent / "hand_landmarker.task"
LANDMARKS_DIR = Path(__file__).parent / "landmarks"
ANNOTATED_DIR = Path(__file__).parent / "annotated"

# Conexiones entre los 21 landmarks para dibujar el esqueleto de la mano
HAND_CONNECTIONS = [
    (0,1),(1,2),(2,3),(3,4),
    (0,5),(5,6),(6,7),(7,8),
    (0,9),(9,10),(10,11),(11,12),
    (0,13),(13,14),(14,15),(15,16),
    (0,17),(17,18),(18,19),(19,20),
    (5,9),(9,13),(13,17),
]


def build_detector():
    base_options = mp_python.BaseOptions(model_asset_path=str(MODEL_PATH))
    options = mp_vision.HandLandmarkerOptions(
        base_options=base_options,
        running_mode=mp_vision.RunningMode.IMAGE,  # sin timestamps globales → seguro entre videos
        num_hands=2,
        min_hand_detection_confidence=0.6,
    )
    return mp_vision.HandLandmarker.create_from_options(options)


def draw_hand(frame, norm_landmarks, img_w, img_h):
    pts = [(int(lm.x * img_w), int(lm.y * img_h)) for lm in norm_landmarks]
    for a, b in HAND_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], (0, 200, 100), 2)
    for x, y in pts:
        cv2.circle(frame, (x, y), 4, (0, 255, 180), -1)


def list_body_videos(zf, sign=None, rep=None, angle=None):
    result = []
    for path in sorted(n for n in zf.namelist() if "COLOR_BODY" in n and n.endswith(".avi")):
        stem = Path(path).stem
        parts = stem.split("_")
        if len(parts) != 3:
            continue
        s, r, a = parts
        if sign  is not None and s != str(sign).zfill(4):  continue
        if rep   is not None and r != str(rep).zfill(4):   continue
        if angle is not None and a != str(angle).zfill(4): continue
        result.append((path, s, r, a))
    return result


def process_video(detector, zf, zip_path, stem, annotate):
    out_path = LANDMARKS_DIR / f"{stem}.json"
    if out_path.exists():
        return {"stem": stem, "status": "skip", "frames": 0, "detected": 0}

    with tempfile.NamedTemporaryFile(suffix=".avi", delete=False) as tmp:
        tmp.write(zf.read(zip_path))
        tmp_path = tmp.name

    cap = cv2.VideoCapture(tmp_path)
    fps     = cap.get(cv2.CAP_PROP_FPS) or 30
    img_w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    img_h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames_data = []

    writer = None
    if annotate:
        ANNOTATED_DIR.mkdir(parents=True, exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(ANNOTATED_DIR / f"{stem}.mp4"), fourcc, fps, (img_w, img_h))

    frame_idx = 0
    while True:
        ret, bgr = cap.read()
        if not ret:
            break

        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = detector.detect(mp_image)

        frame_entry = {"hands": []}
        if result.hand_landmarks:
            for norm_lms, world_lms, handedness in zip(
                result.hand_landmarks,
                result.hand_world_landmarks,
                result.handedness,
            ):
                label = handedness[0].category_name  # "Left" o "Right"
                frame_entry["hands"].append({
                    "hand": label,
                    "landmarks": [
                        {"x": lm.x, "y": lm.y, "z": lm.z}
                        for lm in world_lms
                    ],
                })
                if annotate:
                    draw_hand(bgr, norm_lms, img_w, img_h)

        frames_data.append(frame_entry)
        if annotate and writer:
            writer.write(bgr)
        frame_idx += 1

    cap.release()
    if writer:
        writer.release()
    Path(tmp_path).unlink(missing_ok=True)

    detected = sum(1 for f in frames_data if f["hands"])
    payload = {
        "stem": stem,
        "fps": fps,
        "total_frames": len(frames_data),
        "frames_with_hand": detected,
        "detection_rate": round(detected / len(frames_data), 3) if frames_data else 0,
        "frames": frames_data,
    }
    out_path.write_text(json.dumps(payload, indent=2))

    return {"stem": stem, "status": "ok", "frames": len(frames_data), "detected": detected}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all",      action="store_true", help="Procesar los 1000 videos")
    parser.add_argument("--sign",     help="Filtrar seña (ej: 0 o 0000)")
    parser.add_argument("--rep",      type=int, help="Filtrar repeticion 0-4")
    parser.add_argument("--angle",    type=int, help="Filtrar angulo 0-3")
    parser.add_argument("--annotate", action="store_true", help="Guardar MP4 con overlay")
    args = parser.parse_args()

    LANDMARKS_DIR.mkdir(parents=True, exist_ok=True)

    # Sin flags: 1 video por seña (rep 0, angulo 0) = 50 videos como muestra
    use_rep   = args.rep   if args.rep   is not None else (None if (args.all or args.sign) else 0)
    use_angle = args.angle if args.angle is not None else (None if (args.all or args.sign) else 0)

    print(f"Iniciando detector MediaPipe (modelo: {MODEL_PATH.name})")
    detector = build_detector()

    with zipfile.ZipFile(ZIP_PATH) as zf:
        videos = list_body_videos(zf, sign=args.sign, rep=use_rep, angle=use_angle)
        if not videos:
            print("No se encontraron videos con esos filtros.")
            return

        print(f"Videos a procesar: {len(videos)}")
        print(f"Salida: {LANDMARKS_DIR}")
        print()

        ok = skip = err = 0
        total_frames = total_detected = 0

        for i, (zip_path, s, r, a) in enumerate(videos):
            stem = f"{s}_{r}_{a}"
            try:
                res = process_video(detector, zf, zip_path, stem, args.annotate)
                if res["status"] == "skip":
                    skip += 1
                    print(f"[{i+1:4d}/{len(videos)}] {stem}  · (ya existe)")
                else:
                    ok += 1
                    total_frames   += res["frames"]
                    total_detected += res["detected"]
                    rate = res["detected"] / res["frames"] * 100 if res["frames"] else 0
                    print(f"[{i+1:4d}/{len(videos)}] {stem}  {res['frames']} frames  deteccion: {rate:4.0f}%")
            except Exception as e:
                err += 1
                print(f"[{i+1:4d}/{len(videos)}] {stem}  ERROR: {e}")

    detector.close()
    print()
    print(f"Completado: {ok} OK, {skip} omitidos, {err} errores")
    if total_frames:
        global_rate = total_detected / total_frames * 100
        print(f"Deteccion global: {total_detected}/{total_frames} frames ({global_rate:.1f}%)")


if __name__ == "__main__":
    main()
