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
        // ponytail: extra 10% above the 48px gesture-nav floor so the nav-bar never feels cramped.
        // Only applies when the keyboard is closed — when kb is up, TouchScreenKeyboard.area wins via Mathf.Max
        // and the floor is irrelevant, so no dead space appears between keyboard and buttons.
        const float MIN_BOTTOM_SAFE_PX = 53f;
        // ponytail: snappy follow — ~60ms catch-up so the bar tracks the keyboard without visible lag.
        // Spec calls for correct basic behavior first; tighten if it still feels slow.
        const float ANIM_SMOOTH_TIME = 0.06f;

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

            var inputGo = UIFactory.CreateTextInput(row.transform, "TextInput", "v" + Application.version);
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

            // Mic: 25% del ancho (margen simétrico 24 izq / 12 der)
            var micIcon = UIFactory.GetMicIcon();
            _micBtn = (micIcon != null
                ? UIFactory.CreateIconButton(row.transform, "MicBtn", micIcon, Theme.BtnDefault, (int)BTN_H)
                : UIFactory.CreateButton(row.transform, "MicBtn", "Mic", Theme.BtnDefault, Theme.TextPrimary, 36)
            ).GetComponent<Button>();
            var micRt = UIFactory.GetRT(_micBtn.gameObject);
            micRt.anchorMin = new Vector2(0f, 0.5f);
            micRt.anchorMax = new Vector2(0.25f, 0.5f);
            micRt.pivot = new Vector2(0.5f, 0.5f);
            micRt.sizeDelta = new Vector2(0f, BTN_H);
            micRt.offsetMin = new Vector2(24f, -BTN_H / 2f);
            micRt.offsetMax = new Vector2(-12f, BTN_H / 2f);

            ApplyButtonStyle(_micBtn);
            _micBtn.onClick.AddListener(() => OnMicClicked?.Invoke());

            // Enviar: 75% del ancho (margen simétrico 12 izq / 24 der)
            _sendWideBtn = UIFactory.CreateButton(
                row.transform, "SendWideBtn", "Enviar",
                Theme.BtnPrimary, Theme.TextWhite, 40
            ).GetComponent<Button>();
            var wideRt = UIFactory.GetRT(_sendWideBtn.gameObject);
            wideRt.anchorMin = new Vector2(0.25f, 0.5f);
            wideRt.anchorMax = new Vector2(1f, 0.5f);
            wideRt.pivot = new Vector2(0.5f, 0.5f);
            wideRt.sizeDelta = new Vector2(0f, BTN_H);
            wideRt.offsetMin = new Vector2(12f, -BTN_H / 2f);
            wideRt.offsetMax = new Vector2(-24f, BTN_H / 2f);

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
            float scale = _canvas != null && _canvas.scaleFactor > 0f ? _canvas.scaleFactor : 1f;
            float safeAreaBottom = Mathf.Max(Screen.safeArea.yMin, MIN_BOTTOM_SAFE_PX);
            var kb = TouchScreenKeyboard.area;
            float kbHeightPx = kb.height; // physical px, top-origin
            if (kbHeightPx > 0f)
            {
                // ponytail: when the keyboard is up, align the bottom of the BUTTONS (not the bottom of the
                // bar) with the keyboard top. The bar is BAR_HEIGHT tall and the buttons end
                // (BAR_HEIGHT - 127 - 105) canvas units above its bottom edge — if we just translated the
                // bar by the keyboard height, that internal dead space showed as a gap above the keyboard.
                float deadSpacePx = (BAR_HEIGHT - 232f) * scale; // 232 = ROW anchored offset (127) + row height (105)
                float kbOffsetPx = Mathf.Max(0f, kbHeightPx - deadSpacePx);
                return kbOffsetPx / scale;
            }
            return safeAreaBottom / scale;
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