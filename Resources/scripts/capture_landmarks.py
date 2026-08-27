#!/usr/bin/env python3
"""
Captura landmarks de mano desde webcam con MediaPipe Tasks API.
Presiona 'r' para iniciar/detener grabacion, 'q' para salir y guardar.
Guarda landmarks.json en la misma carpeta que este script.
"""

import cv2
import json
import time
from pathlib import Path

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

MODEL_PATH  = Path(__file__).parent / "hand_landmarker.task"
OUTPUT_PATH = Path(__file__).parent / "landmarks_webcam.json"

HAND_CONNECTIONS = [
    (0,1),(1,2),(2,3),(3,4),
    (0,5),(5,6),(6,7),(7,8),
    (0,9),(9,10),(10,11),(11,12),
    (0,13),(13,14),(14,15),(15,16),
    (0,17),(17,18),(18,19),(19,20),
    (5,9),(9,13),(13,17),
]


def draw_hand(frame, norm_lms, img_w, img_h):
    pts = [(int(lm.x * img_w), int(lm.y * img_h)) for lm in norm_lms]
    for a, b in HAND_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], (0, 200, 100), 2)
    for x, y in pts:
        cv2.circle(frame, (x, y), 4, (0, 255, 180), -1)


def main():
    base_options = mp_python.BaseOptions(model_asset_path=str(MODEL_PATH))
    options = mp_vision.HandLandmarkerOptions(
        base_options=base_options,
        running_mode=mp_vision.RunningMode.LIVE_STREAM,
        num_hands=1,
        min_hand_detection_confidence=0.7,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        result_callback=lambda result, img, ts: None,  # usamos detect_async abajo
    )

    # Para webcam en tiempo real es mas simple usar IMAGE mode frame a frame
    base_options2 = mp_python.BaseOptions(model_asset_path=str(MODEL_PATH))
    options2 = mp_vision.HandLandmarkerOptions(
        base_options=base_options2,
        running_mode=mp_vision.RunningMode.IMAGE,
        num_hands=1,
        min_hand_detection_confidence=0.7,
    )
    detector = mp_vision.HandLandmarker.create_from_options(options2)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("No se pudo abrir la webcam (dispositivo 0)")

    img_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    img_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    frames = []
    recording = False

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = detector.detect(mp_image)

        detected = bool(result.hand_landmarks)
        if detected:
            norm_lms  = result.hand_landmarks[0]
            world_lms = result.hand_world_landmarks[0]
            draw_hand(frame, norm_lms, img_w, img_h)

            if recording:
                label = result.handedness[0][0].category_name
                frames.append({
                    "hand": label,
                    "landmarks": [
                        {"x": lm.x, "y": lm.y, "z": lm.z}
                        for lm in world_lms
                    ],
                })

        rec_color = (0, 0, 220) if recording else (0, 200, 0)
        det_color = (0, 255, 128) if detected else (80, 80, 80)
        cv2.putText(frame, "REC" if recording else "LISTO",
                    (10, 35), cv2.FONT_HERSHEY_SIMPLEX, 1.1, rec_color, 2)
        cv2.putText(frame, "MANO DETECTADA" if detected else "Sin mano...",
                    (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.65, det_color, 2)
        cv2.putText(frame, f"Frames grabados: {len(frames)}",
                    (10, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (220, 220, 220), 2)
        cv2.putText(frame, "[r] grabar  [q] salir",
                    (10, img_h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)

        cv2.imshow("SignAI — Captura webcam", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('r'):
            recording = not recording
            if not recording:
                print(f"Grabacion pausada — {len(frames)} frames acumulados")

    cap.release()
    cv2.destroyAllWindows()
    detector.close()

    if frames:
        payload = {
            "total_frames": len(frames),
            "frames": [{"hands": [f]} for f in frames],
        }
        OUTPUT_PATH.write_text(json.dumps(payload, indent=2))
        print(f"\nGuardado: {OUTPUT_PATH}  ({len(frames)} frames)")
    else:
        print("No se capturaron frames.")


if __name__ == "__main__":
    main()
