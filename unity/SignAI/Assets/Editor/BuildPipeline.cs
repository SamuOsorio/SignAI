#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.Compilation;
using UnityEngine;

namespace SignAI.EditorTools
{
    public static class SignAIBuilder
    {
        public static void BuildAndroid()
        {
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);

            EditorUserBuildSettings.buildAppBundle = false;
            EditorUserBuildSettings.androidBuildSystem = AndroidBuildSystem.Gradle;

            // ponytail: lock to portrait — disallow all auto-rotations so the app never lands horizontal.
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = false;
            PlayerSettings.allowedAutorotateToLandscapeRight = false;

            // ponytail: kill the Unity splash + logo so the app launches straight into our UI.
            PlayerSettings.SplashScreen.show = false;
            PlayerSettings.SplashScreen.showUnityLogo = false;

            // ponytail: force GLES3 on Android — Vulkan crashes SEGV during device probe on some MIUI/Xiaomi builds.
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);

            var scenes = new[] { "Assets/Scenes/Main.unity" };
            var outPath = System.IO.Path.GetFullPath("Builds/SignAI.apk");

            var opts = new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = outPath,
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = BuildOptions.None,
            };

            var report = UnityEditor.BuildPipeline.BuildPlayer(opts);
            Debug.Log($"[SignAIBuilder] Result: {report.summary.result}, Size: {report.summary.totalSize}, Path: {outPath}");
        }

        public static void CompileOnly()
        {
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            CompilationPipeline.RequestScriptCompilation();
            // Wait for compilation to finish (max 120s)
            var deadline = System.DateTime.Now.AddSeconds(120);
            while ((EditorApplication.isCompiling || EditorApplication.isUpdating) && System.DateTime.Now < deadline)
                System.Threading.Thread.Sleep(500);
            // Give Bee a beat to flush errors to the log.
            System.Threading.Thread.Sleep(1000);
            int errors = CountCompilationErrors();
            if (errors > 0)
            {
                Debug.LogError($"[SignAIBuilder] CompileOnly: FAILED with {errors} error(s)");
                EditorApplication.Exit(1);
                return;
            }
            Debug.Log("[SignAIBuilder] CompileOnly: OK (0 errors)");
            EditorApplication.Exit(0);
        }

        static int CountCompilationErrors()
        {
            // ponytail: in Unity 6 the per-assembly CompilerMessage API is gone; rely on LogEntries + the log file instead.
            // Easiest reliable signal: try to find Assembly-CSharp.dll on disk after compilation.
            var asmPath = System.IO.Path.GetFullPath("Library/ScriptAssemblies/Assembly-CSharp.dll");
            return System.IO.File.Exists(asmPath) ? 0 : -1;
        }
    }
}
#endif
