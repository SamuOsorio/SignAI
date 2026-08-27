using UnityEngine;
using UnityEngine.UI;

namespace SignAI.UI
{
    public class BottomBar
    {
        public GameObject Root { get; private set; }
        public InputField TextInput { get; private set; }

        Button _sendWideBtn;
        Button _micBtn;

        public event System.Action OnSendWideClicked;
        public event System.Action OnMicClicked;

        const float BAR_HEIGHT = 300f;
        const float ROW_HEIGHT = 105f;
        const float BTN_H = 75f;
        const float MIN_BOTTOM_SAFE_PX = 48f;
        const float ANIM_SMOOTH_TIME = 0.15f;

        Canvas _canvas;
        float _targetOffset;
        float _currentOffset;
        float _offsetVelocity;

        public BottomBar(Transform parent, Canvas canvas)
        {
            _canvas = canvas;
            Build(parent);
            // ponytail: pre-position the bar so the first frame doesn't flash at screen-bottom before ApplySafeArea runs.
            _targetOffset = ComputeBottomInsetUI();
            _currentOffset = _targetOffset;
            ApplyOffset();
        }

        void Build(Transform parent)
        {
            Debug.Log("[BottomBar] build start");
            Root = UIFactory.CreatePanel(parent, "BottomBar", Theme.BarBg);
            var rt = UIFactory.GetRT(Root);
            rt.anchorMin = new Vector2(0, 0);
            rt.anchorMax = new Vector2(1, 0);
            rt.pivot = new Vector2(0.5f, 0f);
            rt.sizeDelta = new Vector2(0, BAR_HEIGHT);

            BuildInputRow(Root.transform);
            BuildActionRow(Root.transform);
            Debug.Log("[BottomBar] build done");
        }

        void BuildInputRow(Transform parent)
        {
            var row = new GameObject("InputRow", typeof(RectTransform));
            row.transform.SetParent(parent, false);
            var rowRt = row.GetComponent<RectTransform>();
            rowRt.anchorMin = new Vector2(0, 1);
            rowRt.anchorMax = new Vector2(1, 1);
            rowRt.pivot = new Vector2(0.5f, 1f);
            rowRt.sizeDelta = new Vector2(0, ROW_HEIGHT);
            rowRt.anchoredPosition = new Vector2(0, -15);

            var inputGo = UIFactory.CreateTextInput(row.transform, "TextInput", "Escribe un mensaje...");
            TextInput = inputGo.GetComponent<InputField>();
            var inputRt = UIFactory.GetRT(inputGo);
            inputRt.anchorMin = new Vector2(0, 0);
            inputRt.anchorMax = new Vector2(1, 1);
            inputRt.offsetMin = new Vector2(24, 12);
            inputRt.offsetMax = new Vector2(-24, -12);

            var placeholder = inputGo.transform.Find("Placeholder")?.GetComponent<Text>();
            if (placeholder != null) placeholder.fontSize = 38;
            var inputText = inputGo.transform.Find("Text")?.GetComponent<Text>();
            if (inputText != null) inputText.fontSize = 38;
        }

        void BuildActionRow(Transform parent)
        {
            var row = new GameObject("ActionRow", typeof(RectTransform));
            row.transform.SetParent(parent, false);
            var rowRt = row.GetComponent<RectTransform>();
            rowRt.anchorMin = new Vector2(0, 1);
            rowRt.anchorMax = new Vector2(1, 1);
            rowRt.pivot = new Vector2(0.5f, 1f);
            rowRt.sizeDelta = new Vector2(0, ROW_HEIGHT);
            rowRt.anchoredPosition = new Vector2(0, -127);

            var micIcon = UIFactory.GetMicIcon();
            _micBtn = (micIcon != null
                ? UIFactory.CreateIconButton(row.transform, "MicBtn", micIcon, Theme.BtnDefault, (int)BTN_H)
                : UIFactory.CreateButton(row.transform, "MicBtn", "Mic", Theme.BtnDefault, Theme.TextPrimary, 36)
            ).GetComponent<Button>();
            var micRt = UIFactory.GetRT(_micBtn.gameObject);
            micRt.anchorMin = new Vector2(0, 0.5f);
            micRt.anchorMax = new Vector2(0, 0.5f);
            micRt.pivot = new Vector2(0, 0.5f);
            micRt.sizeDelta = new Vector2(BTN_H, BTN_H);
            micRt.anchoredPosition = new Vector2(24, 0);

            ApplyButtonStyle(_micBtn);
            _micBtn.onClick.AddListener(() => OnMicClicked?.Invoke());

            _sendWideBtn = UIFactory.CreateButton(
                row.transform, "SendWideBtn", "Enviar",
                Theme.BtnPrimary, Theme.TextWhite, 40
            ).GetComponent<Button>();
            var wideRt = UIFactory.GetRT(_sendWideBtn.gameObject);
            wideRt.anchorMin = new Vector2(0, 0.5f);
            wideRt.anchorMax = new Vector2(1, 0.5f);
            wideRt.pivot = new Vector2(0, 0.5f);
            wideRt.sizeDelta = new Vector2(-144, BTN_H);
            wideRt.anchoredPosition = new Vector2(132, 0);

            ApplyButtonStyle(_sendWideBtn);
            _sendWideBtn.onClick.AddListener(() => OnSendWideClicked?.Invoke());
        }

        static void ApplyButtonStyle(Button btn)
        {
            btn.transition = Selectable.Transition.ColorTint;
            var colors = btn.colors;
            colors.normalColor = btn.GetComponent<Image>().color;
            colors.highlightedColor = Theme.BtnHover;
            colors.pressedColor = Theme.BtnPrimaryHover;
            colors.fadeDuration = 0.1f;
            btn.colors = colors;
        }

        float ComputeBottomInsetUI()
        {
            // ponytail: Screen.safeArea is in physical px; RectTransform offsets are in Canvas UI units.
            // Combine: safeArea, hardcoded floor (gesture nav), and TouchScreenKeyboard.area (keyboard).
            // The bar translates up so its bottom lands on whichever pushes it the highest.
            float safeAreaBottom = Mathf.Max(Screen.safeArea.yMin, MIN_BOTTOM_SAFE_PX);
            var kb = TouchScreenKeyboard.area;
            float kbBottom = (kb.height > 0f) ? Mathf.Max(0f, Screen.height - kb.y) : 0f;
            float physicalBottom = Mathf.Max(safeAreaBottom, kbBottom);
            if (_canvas == null) return physicalBottom;
            float scale = _canvas.scaleFactor;
            return scale > 0f ? physicalBottom / scale : physicalBottom;
        }

        public void ApplySafeArea()
        {
            _targetOffset = ComputeBottomInsetUI();
        }

        public void Tick(float dt)
        {
            // ponytail: SmoothDamp the offset so the bar slides up/down with the keyboard instead of snapping.
            _currentOffset = Mathf.SmoothDamp(_currentOffset, _targetOffset, ref _offsetVelocity, ANIM_SMOOTH_TIME, Mathf.Infinity, dt);
            ApplyOffset();
        }

        void ApplyOffset()
        {
            var rt = UIFactory.GetRT(Root);
            rt.anchoredPosition = new Vector2(0, _currentOffset);
        }
    }
}