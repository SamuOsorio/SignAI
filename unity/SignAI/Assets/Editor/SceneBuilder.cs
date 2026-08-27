#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using SignAI;

namespace SignAI.EditorTools
{
    public static class SceneBuilder
    {
        [MenuItem("SignAI/Build Main Scene")]
        public static void BuildMainScene()
        {
            BuildScene();
            Debug.Log("[SceneBuilder] Main.unity created (built-in pipeline)");
        }

        static void BuildScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // Camera
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Theme.ViewportBg;
            cam.fieldOfView = 60f;
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 100f;
            camGo.AddComponent<AudioListener>();
            camGo.AddComponent<CameraOrbit>();

            // Light
            var lightGo = new GameObject("Directional Light");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1f;
            lightGo.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            // Cube
            var cubeGo = new GameObject("Cube");
            cubeGo.AddComponent<MeshFilter>();
            cubeGo.AddComponent<MeshRenderer>();
            cubeGo.AddComponent<Cube>();
            cubeGo.transform.position = Vector3.zero;

            var orbit = camGo.GetComponent<CameraOrbit>();
            orbit.target = cubeGo.transform;

            // MainScene bootstrap
            var go = new GameObject("MainScene");
            go.AddComponent<MainScene>();

            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, "Assets/Scenes/Main.unity");
            AssetDatabase.SaveAssets();
        }
    }
}
#endif
