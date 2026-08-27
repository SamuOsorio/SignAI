#!/usr/bin/env python3
"""
Visualiza landmarks de mano en 3D con matplotlib.

Uso:
  python visualize_landmarks.py                       # lista los JSONs disponibles
  python visualize_landmarks.py 0049_0000_0000        # frame 0 de esa seña
  python visualize_landmarks.py 0049_0000_0000 15     # frame 15
  python visualize_landmarks.py 0049_0000_0000 --all  # animacion completa
"""

import json
import sys
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
from pathlib import Path

LANDMARKS_DIR = Path(__file__).parent / "landmarks"

CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (0, 9), (9, 10), (10, 11), (11, 12),
    (0, 13), (13, 14), (14, 15), (15, 16),
    (0, 17), (17, 18), (18, 19), (19, 20),
    (5, 9), (9, 13), (13, 17),
]

CONN_COLORS = (
    ["#FF6B6B"] * 4 +   # pulgar
    ["#FFE66D"] * 4 +   # indice
    ["#4ECDC4"] * 4 +   # medio
    ["#A8E6CF"] * 4 +   # anular
    ["#C3A0E8"] * 4 +   # menique
    ["#888888"] * 3     # palma
)

TIPS = {4: "Pulgar", 8: "Indice", 12: "Medio", 16: "Anular", 20: "Menique"}


def resolve_path(stem: str) -> Path:
    """Acepta stem (0049_0000_0000), path relativo o absoluto."""
    p = Path(stem)
    if p.suffix == ".json" and p.exists():
        return p
    candidate = LANDMARKS_DIR / f"{stem}.json"
    if candidate.exists():
        return candidate
    # busqueda parcial: si solo dan el numero de seña (ej "49" o "0049")
    padded = stem.zfill(4)
    matches = sorted(LANDMARKS_DIR.glob(f"{padded}_*.json"))
    if matches:
        return matches[0]
    raise FileNotFoundError(f"No se encontro JSON para '{stem}' en {LANDMARKS_DIR}")


def load_frames(path: Path):
    data = json.loads(path.read_text())
    # extrae solo frames que tengan al menos una mano detectada
    raw = data.get("frames", data)  # soporta estructura nueva y vieja
    frames_out = []
    for f in raw:
        hands = f.get("hands", [])
        if hands:
            frames_out.append(hands[0])   # primera mano del frame
    meta = {
        "stem": data.get("stem", path.stem),
        "total": data.get("total_frames", len(raw)),
        "detected": data.get("frames_with_hand", len(frames_out)),
        "fps": data.get("fps", 30),
    }
    return frames_out, meta


def pts(hand_entry):
    """Convierte landmarks a array numpy en ejes de Blender (x, profundidad, altura)."""
    lms = hand_entry["landmarks"]
    return np.array([[lm["x"], lm["z"], lm["y"]] for lm in lms])


def draw(ax, pts_arr, title=""):
    ax.cla()
    ax.set_facecolor("#111111")
    ax.scatter(pts_arr[:, 0], pts_arr[:, 1], pts_arr[:, 2], c="#00FFCC", s=25, zorder=5)
    for (a, b), color in zip(CONNECTIONS, CONN_COLORS):
        ax.plot([pts_arr[a, 0], pts_arr[b, 0]],
                [pts_arr[a, 1], pts_arr[b, 1]],
                [pts_arr[a, 2], pts_arr[b, 2]],
                color=color, linewidth=2, alpha=0.85)
    for idx, name in TIPS.items():
        ax.text(pts_arr[idx, 0], pts_arr[idx, 1], pts_arr[idx, 2] + 0.012,
                name, fontsize=6, color="white", alpha=0.7)
    lim = 0.13
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_zlim(-lim, lim)
    ax.set_xlabel("X"); ax.set_ylabel("Z (prof)"); ax.set_zlabel("Y (altura)")
    ax.tick_params(colors="gray", labelsize=7)
    if title:
        ax.set_title(title, color="white", pad=8, fontsize=9)


def show_single(frames, meta, frame_idx):
    frame_idx = min(frame_idx, len(frames) - 1)
    hand = frames[frame_idx]
    fig = plt.figure(figsize=(7, 7), facecolor="#111111")
    ax = fig.add_subplot(111, projection="3d")
    draw(ax, pts(hand),
         f"{meta['stem']}  frame {frame_idx}/{len(frames)-1}  "
         f"mano: {hand['hand']}  "
         f"({meta['detected']}/{meta['total']} frames detectados)")
    plt.tight_layout()
    plt.show()


def show_animation(frames, meta):
    fig = plt.figure(figsize=(7, 7), facecolor="#111111")
    ax = fig.add_subplot(111, projection="3d")
    counter = [0]

    def update(_):
        i = counter[0] % len(frames)
        draw(ax, pts(frames[i]),
             f"{meta['stem']}  frame {i}/{len(frames)-1}  mano: {frames[i]['hand']}")
        counter[0] += 1

    interval_ms = int(1000 / meta["fps"])
    ani = animation.FuncAnimation(fig, update, interval=interval_ms, cache_frame_data=False)
    plt.tight_layout()
    plt.show()
    return ani


def list_available():
    files = sorted(LANDMARKS_DIR.glob("*.json"))
    if not files:
        print(f"No hay JSONs en {LANDMARKS_DIR}")
        return
    print(f"{'Seña':<20} {'Frames':>6}  {'Deteccion':>10}  {'FPS':>5}")
    print("-" * 50)
    for f in files:
        try:
            data = json.loads(f.read_text())
            total    = data.get("total_frames", "?")
            detected = data.get("frames_with_hand", "?")
            fps      = data.get("fps", "?")
            rate     = data.get("detection_rate", 0) * 100
            print(f"{f.stem:<20} {total:>6}  {detected:>4}/{total:<4} ({rate:4.0f}%)  {fps:>5.0f}")
        except Exception:
            print(f"{f.stem:<20}  (error al leer)")
    print(f"\nTotal: {len(files)} archivos")
    print(f"\nUso: python visualize_landmarks.py <seña> [frame|--all]")
    print(f"     python visualize_landmarks.py 0049_0000_0000 --all")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--all"]
    animate = "--all" in sys.argv

    if not args:
        list_available()
        sys.exit(0)

    stem = args[0]
    frame_idx = int(args[1]) if len(args) > 1 and args[1].isdigit() else 0

    try:
        path = resolve_path(stem)
    except FileNotFoundError as e:
        print(e)
        sys.exit(1)

    frames, meta = load_frames(path)
    if not frames:
        print(f"No se detectaron manos en ningun frame de {path.name}")
        sys.exit(1)

    print(f"Cargado: {path.name}  ({meta['detected']}/{meta['total']} frames con mano)")

    if animate:
        ani = show_animation(frames, meta)
    else:
        show_single(frames, meta, frame_idx)
