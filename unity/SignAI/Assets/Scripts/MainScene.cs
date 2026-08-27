using UnityEngine;
using UnityEngine.EventSystems;

namespace SignAI
{
    public class MainScene : MonoBehaviour
    {
        UIManager _ui;
        Rect _lastSafeArea;
        Rect _lastKbArea;
        float _nextSafeAreaCheck;

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
            // ponytail: poll Screen.safeArea AND TouchScreenKeyboard.area every 200 ms — covers soft-keyboard
            // open/close on devices where Screen.safeArea doesn't auto-update, plus gesture-nav reveal/hide.
            if (Time.unscaledTime < _nextSafeAreaCheck) return;
            _nextSafeAreaCheck = Time.unscaledTime + 0.2f;
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
