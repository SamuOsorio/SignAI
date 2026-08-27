using UnityEngine;
using SignAI.UI;

namespace SignAI
{
    public class UIManager
    {
        public TopBar TopBar { get; private set; }
        public BottomBar BottomBar { get; private set; }
        public GameObject Viewport { get; private set; }

        Canvas _canvas;

        public UIManager()
        {
            Build();
            WireEvents();
        }

        void Build()
        {
            _canvas = UIFactory.CreateCanvas("UICanvas");

            // ponytail: Viewport is full-stretch, transparent, and disabled as a raycast target
            // so touches pass through to the camera/CameraOrbit. Sits behind TopBar/BottomBar in the hierarchy
            // so those panels occlude it and only the central area between them is visually empty.
            Viewport = UIFactory.CreatePanel(_canvas.transform, "Viewport", new Color(0f, 0f, 0f, 0f));
            Viewport.GetComponent<UnityEngine.UI.Image>().raycastTarget = false;

            TopBar = new TopBar(_canvas.transform, _canvas);
            BottomBar = new BottomBar(_canvas.transform, _canvas);
        }

        void WireEvents()
        {
            TopBar.OnSettingsClicked += () =>
            {
                Debug.Log("[UI] Settings tapped (no-op)");
            };

            BottomBar.OnMicClicked += () =>
            {
                Debug.Log("[UI] Mic tapped (no-op)");
            };

            BottomBar.OnSendWideClicked += () =>
            {
                var msg = BottomBar.TextInput.text;
                if (!string.IsNullOrWhiteSpace(msg))
                {
                    Debug.Log("[UI] SendWide: " + msg);
                    BottomBar.TextInput.text = "";
                }
            };
        }
    }
}
