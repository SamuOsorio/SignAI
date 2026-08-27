using UnityEngine;
using UnityEngine.EventSystems;

namespace SignAI
{
    public class MainScene : MonoBehaviour
    {
        UIManager _ui;
        Rect _lastSafeArea;
        Rect _lastKbArea;

        void Awake()
        {
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;

            Debug.Log("[MainScene] Awake start");
            EnsureEventSystem();
            try
            {
                _ui = new UIManager();
                Debug.Log("[MainScene] UI built OK");
            }
            catch (System.Exception e)
            {
                Debug.LogError("[MainScene] UI build FAILED: " + e);
            }
        }

        void Start()
        {
            // ponytail: Screen.safeArea is only accurate after the first frame, so defer the notch/nav-bar adjustment to Start().
            if (_ui != null)
            {
                if (_ui.TopBar != null) _ui.TopBar.ApplySafeArea();
                if (_ui.BottomBar != null) _ui.BottomBar.ApplySafeArea();
            }
            _lastSafeArea = Screen.safeArea;
            _lastKbArea = TouchScreenKeyboard.area;
        }

        void Update()
        {
            // ponytail: poll Screen.safeArea AND TouchScreenKeyboard.area every frame — the keyboard
            // moves fast on Android and a 200 ms tick left a visible lag. The two rects rarely change
            // so the branch+work below is cheap when nothing's animating.
            var kb = TouchScreenKeyboard.area;
            if (Screen.safeArea != _lastSafeArea || kb != _lastKbArea)
            {
                _lastSafeArea = Screen.safeArea;
                _lastKbArea = kb;
                if (_ui != null)
                {
                    if (_ui.TopBar != null) _ui.TopBar.ApplySafeArea();
                    if (_ui.BottomBar != null) _ui.BottomBar.ApplySafeArea();
                }
            }
            // ponytail: BottomBar animates its rise/fall every frame; TopBar has no animation so it doesn't need Tick.
            if (_ui != null && _ui.BottomBar != null) _ui.BottomBar.Tick(Time.unscaledDeltaTime);
        }

        static void EnsureEventSystem()
        {
            if (FindObjectOfType<EventSystem>() != null) return;
            var go = new GameObject("EventSystem");
            go.AddComponent<EventSystem>();
            go.AddComponent<StandaloneInputModule>();
            Debug.Log("[MainScene] EventSystem created");
        }
    }
}
