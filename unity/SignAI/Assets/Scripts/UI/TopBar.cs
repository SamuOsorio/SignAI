using UnityEngine;
using UnityEngine.UI;

namespace SignAI.UI
{
    public class TopBar
    {
        public GameObject Root { get; private set; }

        Button _settingsBtn;

        public event System.Action OnSettingsClicked;

        const float HEIGHT = 150f;
        Canvas _canvas;

        public TopBar(Transform parent, Canvas canvas)
        {
            _canvas = canvas;
            Build(parent);
        }

        float SafeTopUI()
        {
            // ponytail: Screen.safeArea is in physical px; RectTransform offsets are in Canvas UI units.
            // Divide by the canvas scale factor so we end up in the right unit space.
            // Floor with a minimum (~72 px = status-bar height) for devices that don't report it.
            float physicalTop = Screen.height - Screen.safeArea.yMax;
            physicalTop = Mathf.Max(physicalTop, MIN_TOP_SAFE_PX);
            if (_canvas == null) return physicalTop;
            float scale = _canvas.scaleFactor;
            return scale > 0f ? physicalTop / scale : physicalTop;
        }

        // ponytail: shared minimum top inset so devices that don't report a status bar in safeArea still get one.
        // Matches the Android status-bar height (~24dp = 72 px on xxhdpi). No-op on devices that already report it.
        const float MIN_TOP_SAFE_PX = 72f;

        void Build(Transform parent)
        {
            Debug.Log("[TopBar] build start");
            Root = UIFactory.CreatePanel(parent, "TopBar", Theme.BarBg);
            var rt = UIFactory.GetRT(Root);

            rt.anchorMin = new Vector2(0, 1);
            rt.anchorMax = new Vector2(1, 1);
            rt.pivot = new Vector2(0.5f, 1f);
            rt.sizeDelta = new Vector2(0, HEIGHT);
            rt.anchoredPosition = Vector2.zero;

            // Content container lives below the notch/status-bar area.
            var contentGo = new GameObject("Content", typeof(RectTransform));
            contentGo.transform.SetParent(Root.transform, false);
            var contentRt = contentGo.GetComponent<RectTransform>();
            contentRt.anchorMin = new Vector2(0, 0);
            contentRt.anchorMax = new Vector2(1, 1);
            contentRt.offsetMin = Vector2.zero;
            contentRt.offsetMax = Vector2.zero;

            // Title
            var titleGo = new GameObject("Title", typeof(RectTransform));
            titleGo.transform.SetParent(contentGo.transform, false);
            var titleRt = titleGo.GetComponent<RectTransform>();
            titleRt.anchorMin = new Vector2(0, 0);
            titleRt.anchorMax = new Vector2(1, 1);
            titleRt.offsetMin = new Vector2(36, 0);
            titleRt.offsetMax = new Vector2(-120, 0);

            var titleText = titleGo.AddComponent<Text>();
            titleText.text = "SignAI";
            titleText.font = UIFactory.GetFont();
            titleText.material = UIFactory.UIMat();
            titleText.fontSize = 48;
            titleText.fontStyle = FontStyle.Bold;
            titleText.color = Theme.TextWhite;
            titleText.alignment = TextAnchor.MiddleLeft;

            // Settings button (right side)
            _settingsBtn = UIFactory.CreateButton(
                contentGo.transform, "SettingsBtn", "\u22EE",
                Theme.BtnDefault, Theme.TextPrimary, 45
            ).GetComponent<Button>();
            var btnRt = UIFactory.GetRT(_settingsBtn.gameObject);
            btnRt.anchorMin = new Vector2(1, 0.5f);
            btnRt.anchorMax = new Vector2(1, 0.5f);
            btnRt.pivot = new Vector2(1, 0.5f);
            btnRt.sizeDelta = new Vector2(90, 90);
            btnRt.anchoredPosition = new Vector2(-30, 0);

            var btnImg = _settingsBtn.GetComponent<Image>();
            _settingsBtn.transition = Selectable.Transition.ColorTint;
            var colors = _settingsBtn.colors;
            colors.normalColor = Theme.BtnDefault;
            colors.highlightedColor = Theme.BtnHover;
            colors.pressedColor = Theme.BtnPrimary;
            colors.fadeDuration = 0.1f;
            _settingsBtn.colors = colors;

            _settingsBtn.onClick.AddListener(() => OnSettingsClicked?.Invoke());

            Debug.Log("[TopBar] build done");
        }

        public void ApplySafeArea()
        {
            // ponytail: Screen.safeArea is only accurate after the first frame; call from Start().
            float safeTopUI = SafeTopUI();
            var rt = UIFactory.GetRT(Root);
            rt.sizeDelta = new Vector2(0, HEIGHT + safeTopUI);
            var content = Root.transform.Find("Content") as RectTransform;
            if (content != null) content.offsetMax = new Vector2(0, -safeTopUI);
            Debug.Log("[TopBar] safeArea applied: safeTopUI=" + safeTopUI);
        }

        public void SetHeight(float h)
        {
            var rt = UIFactory.GetRT(Root);
            rt.sizeDelta = new Vector2(0, h + SafeTopUI());
        }
    }
}
