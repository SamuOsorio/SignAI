using UnityEngine;
using SignAI.UI;

namespace SignAI
{
    public class UIManager
    {
        public TopBar TopBar { get; private set; }
        public BottomBar BottomBar { get; private set; }

        Canvas _canvas;

        public UIManager()
        {
            Build();
            WireEvents();
        }

        void Build()
        {
            _canvas = UIFactory.CreateCanvas("UICanvas");

            TopBar = new TopBar(_canvas.transform, _canvas);
            BottomBar = new BottomBar(_canvas.transform, _canvas);
            // No viewport panel — camera background fills the middle area.
            // Touch passes through empty canvas to CameraOrbit.
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
