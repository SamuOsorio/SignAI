#!/bin/bash
# Activa el virtualenv y corre el script indicado.
# Uso: ./run.sh capture       -> captura desde webcam
#      ./run.sh visualize      -> visualiza frame 0
#      ./run.sh visualize 15   -> frame 15
#      ./run.sh visualize --all -> anima todos los frames

VENV="$(dirname "$0")/../signai_env"
SCRIPTS="$(dirname "$0")"

if [ ! -d "$VENV" ]; then
    echo "ERROR: virtualenv no encontrado en $VENV"
    echo "Corre desde la raiz del proyecto: python3 -m venv signai_env && signai_env/bin/pip install mediapipe opencv-python-headless numpy matplotlib"
    exit 1
fi

source "$VENV/bin/activate"

case "$1" in
    capture)
        python "$SCRIPTS/capture_landmarks.py"
        ;;
    process)
        shift
        python "$SCRIPTS/process_videos.py" "$@"
        ;;
    visualize)
        shift
        python "$SCRIPTS/visualize_landmarks.py" "$@"
        ;;
    app)
        python "$SCRIPTS/../app/server.py"
        ;;
    *)
        echo "Uso: $0 {capture|process [opciones]|visualize [frame|--all]|app}"
        echo ""
        echo "  process                    -> 1 video por seña (50 videos, prueba rapida)"
        echo "  process --all              -> todos los 1000 videos"
        echo "  process --sign 0           -> una seña especifica"
        echo "  process --sign 0 --annotate -> con overlay de landmarks"
        exit 1
        ;;
esac
