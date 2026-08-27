using UnityEngine;
using UnityEngine.UI;

namespace SignAI
{
    public static class UIFactory
    {
        public static Font GetFont()
        {
            // ponytail: Unity ships LegacyRuntime.ttf as a built-in font on every platform.
            // Arial does not exist on Android, so Font.CreateDynamicFontFromOSFont("Arial", ...) returns null there.
            return Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        }

        static Material _uiMat;
        public static Material UIMat()
        {
            // ponytail: UI/Default is stripped from this Android build. Load the project-local copy from Resources/UIDefault.mat.
            if (_uiMat != null) return _uiMat;
            _uiMat = Resources.Load<Material>("UIDefault");
            if (_uiMat == null || _uiMat.shader == null)
            {
                _uiMat = Canvas.GetDefaultCanvasMaterial();
                var sh = _uiMat != null ? _uiMat.shader : null;
                if (sh == null || sh.name == "Hidden/InternalErrorShader")
                    sh = Shader.Find("SignAI/UIDefault");
                if (sh != null && (_uiMat == null || _uiMat.shader == null || _uiMat.shader.name == "Hidden/InternalErrorShader"))
                    _uiMat = new Material(sh) { name = "SignAI/UI" };
            }
            Debug.Log("[UIFactory] UI mat: " + (_uiMat != null ? _uiMat.name + " (shader=" + (_uiMat.shader != null ? _uiMat.shader.name : "null") + ")" : "<null>"));
            return _uiMat;
        }

        public static Canvas CreateCanvas(string name)
        {
            var go = new GameObject(name);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;

            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.matchWidthOrHeight = 0.5f;

            go.AddComponent<GraphicRaycaster>();
            return canvas;
        }

        public static GameObject CreatePanel(Transform parent, string name, Color bg)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.sizeDelta = Vector2.zero;
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;

            var img = go.AddComponent<Image>();
            img.material = UIMat();
            img.color = bg;
            return go;
        }

        public static GameObject CreateButton(Transform parent, string name, string label, Color bg, Color textColor, int fontSize = 28)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);

            var img = go.GetComponent<Image>();
            img.material = UIMat();
            img.color = bg;

            var textGo = new GameObject("Text", typeof(RectTransform));
            textGo.transform.SetParent(go.transform, false);
            var textRt = textGo.GetComponent<RectTransform>();
            textRt.anchorMin = Vector2.zero;
            textRt.anchorMax = Vector2.one;
            textRt.sizeDelta = Vector2.zero;

            var text = textGo.AddComponent<Text>();
            text.text = label;
            text.font = GetFont();
            text.material = UIMat();
            text.fontSize = fontSize;
            text.color = textColor;
            text.alignment = TextAnchor.MiddleCenter;

            return go;
        }

        public static GameObject CreateImageButton(Transform parent, string name, Color bg, int size = 48)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);

            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(size, size);

            var img = go.AddComponent<Image>();
            img.material = UIMat();
            img.color = bg;

            return go;
        }

        public static GameObject CreateIconButton(Transform parent, string name, Sprite icon, Color bg, int size = 64)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);

            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(size, size);

            var bgImg = go.GetComponent<Image>();
            bgImg.material = UIMat();
            bgImg.color = bg;

            var iconGo = new GameObject("Icon", typeof(RectTransform), typeof(Image));
            iconGo.transform.SetParent(go.transform, false);
            var iconRt = iconGo.GetComponent<RectTransform>();
            iconRt.anchorMin = Vector2.zero;
            iconRt.anchorMax = Vector2.one;
            float pad = size * 0.25f;
            iconRt.offsetMin = new Vector2(pad, pad);
            iconRt.offsetMax = new Vector2(-pad, -pad);

            var iconImg = iconGo.GetComponent<Image>();
            iconImg.material = UIMat();
            iconImg.sprite = icon;
            iconImg.color = Color.white;
            iconImg.type = Image.Type.Simple;
            iconImg.preserveAspect = true;

            return go;
        }

        static Sprite _micSprite;
        public static Sprite GetMicIcon()
        {
            // ponytail: cached load of the mic sprite from Resources; null if not bundled in this build.
            if (_micSprite != null) return _micSprite;
            _micSprite = Resources.Load<Sprite>("Mic");
            if (_micSprite == null) Debug.LogWarning("[UIFactory] Mic sprite not found in Resources");
            return _micSprite;
        }

        public static GameObject CreateTextInput(Transform parent, string name, string placeholder = "")
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);

            var img = go.AddComponent<Image>();
            img.material = UIMat();
            img.color = Theme.InputBg;

            var input = go.AddComponent<InputField>();

            // Placeholder
            var phGo = new GameObject("Placeholder", typeof(RectTransform));
            phGo.transform.SetParent(go.transform, false);
            var phRt = phGo.GetComponent<RectTransform>();
            phRt.anchorMin = Vector2.zero;
            phRt.anchorMax = Vector2.one;
            phRt.offsetMin = new Vector2(12, 0);
            phRt.offsetMax = new Vector2(-12, 0);

            var phText = phGo.AddComponent<Text>();
            phText.text = placeholder;
            phText.font = GetFont();
            phText.material = UIMat();
            phText.fontSize = 26;
            phText.fontStyle = FontStyle.Italic;
            phText.color = Theme.InputPlaceholder;
            phText.alignment = TextAnchor.MiddleLeft;

            // Text
            var textGo = new GameObject("Text", typeof(RectTransform));
            textGo.transform.SetParent(go.transform, false);
            var textRt = textGo.GetComponent<RectTransform>();
            textRt.anchorMin = Vector2.zero;
            textRt.anchorMax = Vector2.one;
            textRt.offsetMin = new Vector2(12, 0);
            textRt.offsetMax = new Vector2(-12, 0);

            var text = textGo.AddComponent<Text>();
            text.font = GetFont();
            text.material = UIMat();
            text.fontSize = 26;
            text.color = Theme.TextPrimary;
            text.alignment = TextAnchor.MiddleLeft;

            input.textComponent = text;
            input.placeholder = phText;

            return go;
        }

        public static RectTransform GetRT(GameObject go) => go.GetComponent<RectTransform>();
    }
}
