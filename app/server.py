#!/usr/bin/env python3
"""
Servidor Flask para la demo SignAI.
Fuente de landmarks: LSC50 (LANDMARKS/HANDS_LANDMARKS/) — 1000 videos.
Fuente de video: VIDEOS.zip (COLOR_BODY).

Uso: ./scripts/run.sh app
"""

import csv
import functools
import json
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path

from flask import Flask, jsonify, send_file, abort, send_from_directory

BASE         = Path(__file__).parent.parent
LSC50_LEFT   = BASE / "data" / "LANDMARKS" / "HANDS_LANDMARKS" / "LEFT_HAND_LANDMARKS"
LSC50_RIGHT  = BASE / "data" / "LANDMARKS" / "HANDS_LANDMARKS" / "RIGHT_HAND_LANDMARKS"
LSC50_BODY   = BASE / "data" / "LANDMARKS" / "BODY_LANDMARKS"
ZIP_PATH     = BASE / "data" / "VIDEOS.zip"
STATIC       = Path(__file__).parent / "static"
VIDEO_CACHE  = Path(__file__).parent / "video_cache"
VIDEO_CACHE.mkdir(exist_ok=True)

app = Flask(__name__, static_folder=str(STATIC), static_url_path="")


# ── Parsing de CSVs LSC50 ─────────────────────────────────────────────────────

def parse_body_csv(path: Path) -> list[list[dict]]:
    """Lee un CSV de 33 landmarks de cuerpo (MediaPipe Pose) por frame."""
    if not path.exists():
        return []
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    result = []
    for row in rows:
        result.append([
            {
                "x": float(row.get(f"landmark_{i}_x", 0)),
                "y": float(row.get(f"landmark_{i}_y", 0)),
                "z": float(row.get(f"landmark_{i}_z", 0)),
            }
            for i in range(33)
        ])
    return result


def parse_hand_csv(path: Path, label: str) -> list[dict]:
    """Lee un CSV de landmarks de mano y devuelve lista de dicts por frame."""
    if not path.exists():
        return []
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    result = []
    for row in rows:
        landmarks = []
        for i in range(21):
            landmarks.append({
                "x": float(row[f"landmark_{i}_x"]),
                "y": float(row[f"landmark_{i}_y"]),
                "z": float(row[f"landmark_{i}_z"]),
            })
        result.append({"hand": label, "landmarks": landmarks})
    return result


@functools.lru_cache(maxsize=256)
def load_sign_landmarks(sign_id: str) -> dict:
    """Combina left/right hand + body CSVs en el formato JSON que usa el frontend."""
    left_frames  = parse_hand_csv(LSC50_LEFT  / f"{sign_id}.csv", "Left")
    right_frames = parse_hand_csv(LSC50_RIGHT / f"{sign_id}.csv", "Right")
    body_frames  = parse_body_csv(LSC50_BODY  / f"{sign_id}.csv")

    n = max(len(left_frames), len(right_frames))
    if n == 0:
        return None

    frames = []
    for i in range(n):
        hands = []
        if i < len(left_frames):
            hands.append(left_frames[i])
        if i < len(right_frames):
            hands.append(right_frames[i])
        frame = {"hands": hands}
        if i < len(body_frames):
            frame["body"] = body_frames[i]
        frames.append(frame)

    return {
        "stem":            sign_id,
        "fps":             30,
        "total_frames":    n,
        "frames_with_hand": n,
        "detection_rate":  1.0,
        "source":          "lsc50",
        "frames":          frames,
    }


# ── Rutas ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(STATIC, "index.html")


@app.route("/api/signs")
def list_signs():
    """Lista todos los videos LSC50 disponibles (hasta 1000)."""
    seen = set()
    signs = []
    for csv_path in sorted(LSC50_LEFT.glob("*.csv")):
        stem  = csv_path.stem
        parts = stem.split("_")
        if len(parts) != 3 or stem in seen:
            continue
        seen.add(stem)
        s, r, a = parts
        signs.append({
            "id":    stem,
            "sign":  s,
            "rep":   r,
            "angle": a,
        })
    return jsonify(signs)


@app.route("/api/landmarks/<sign_id>")
def get_landmarks(sign_id):
    """Devuelve landmarks combinados (izq + der) en JSON."""
    data = load_sign_landmarks(sign_id)
    if data is None:
        abort(404, f"Sin landmarks para {sign_id}")
    return jsonify(data)


@app.route("/api/video/<sign_id>")
def get_video(sign_id):
    """Extrae el video del ZIP, lo convierte a MP4 y lo sirve (cachea en disco)."""
    if len(sign_id.split("_")) != 3:
        abort(400, "Formato de ID invalido: SEÑA_REP_ANGULO")

    mp4_path = VIDEO_CACHE / f"{sign_id}.mp4"

    if not mp4_path.exists():
        zip_entry = f"VIDEOS/COLOR_BODY/{sign_id}.avi"
        if not ZIP_PATH.exists():
            abort(404, "VIDEOS.zip no encontrado")

        with zipfile.ZipFile(ZIP_PATH) as zf:
            if zip_entry not in zf.namelist():
                abort(404, f"Video {sign_id} no encontrado en el ZIP")
            tmp = tempfile.NamedTemporaryFile(suffix=".avi", delete=False)
            tmp.write(zf.read(zip_entry))
            tmp.flush()
            avi_path = tmp.name
            tmp.close()

        subprocess.run(
            ["ffmpeg", "-i", avi_path,
             "-c:v", "libx264", "-preset", "fast", "-crf", "22",
             "-an", "-y", str(mp4_path)],
            check=True, capture_output=True,
        )
        os.unlink(avi_path)

    return send_file(mp4_path, mimetype="video/mp4")


if __name__ == "__main__":
    glb = STATIC / "avatar.glb"
    if not glb.exists():
        print("AVISO: app/static/avatar.glb no encontrado.")
        print("       Corre scripts/export_avatar.py en Blender primero.")
    n = len(list(LSC50_LEFT.glob("*.csv")))
    print(f"Señas LSC50 disponibles: {n}")
    print("Servidor en http://localhost:5000")
    app.run(debug=True, port=5000)
