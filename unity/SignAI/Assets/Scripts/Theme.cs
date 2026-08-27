using UnityEngine;

namespace SignAI
{
    public static class Theme
    {
        // Backgrounds
        public static readonly Color Background = Hex("#0f1117");
        public static readonly Color BarBg = Hex("#1a1d27");
        public static readonly Color PanelHeader = Hex("#13151f");
        public static readonly Color ViewportBg = Hex("#0d0f1a");

        // Text
        public static readonly Color TextPrimary = Hex("#e0e0e0");
        public static readonly Color TextWhite = Color.white;
        public static readonly Color TextMuted = Hex("#888888");
        public static readonly Color TextDim = Hex("#555555");

        // Borders
        public static readonly Color Border = Hex("#2a2d3a");
        public static readonly Color BorderLight = Hex("#333333");

        // Buttons
        public static readonly Color BtnDefault = Hex("#1e2130");
        public static readonly Color BtnHover = Hex("#252840");
        public static readonly Color BtnPrimary = Hex("#1d4ed8");
        public static readonly Color BtnPrimaryBorder = Hex("#2563eb");
        public static readonly Color BtnPrimaryHover = Hex("#1e40af");

        // Status
        public static readonly Color StatusOk = Hex("#34d399");
        public static readonly Color StatusWarn = Hex("#fbbf24");
        public static readonly Color StatusErr = Hex("#f87171");

        // Accent
        public static readonly Color Accent = Hex("#2563eb");

        // Input
        public static readonly Color InputBg = Hex("#1e2130");
        public static readonly Color InputPlaceholder = Hex("#555555");

        static Color Hex(string hex)
        {
            ColorUtility.TryParseHtmlString(hex, out var c);
            return c;
        }
    }
}
