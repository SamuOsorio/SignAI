using UnityEngine;

namespace SignAI
{
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public class Cube : MonoBehaviour
    {
        static readonly Color[] FaceColors = {
            new(1f, 0.2f, 0.2f),
            new(0.2f, 1f, 0.2f),
            new(0.2f, 0.4f, 1f),
            new(1f, 0.95f, 0.2f),
            new(1f, 0.2f, 1f),
            new(0.2f, 1f, 1f),
        };

        // 8 esquinas únicas del cubo (±0.5)
        static readonly Vector3[] Corner = {
            new(-0.5f,-0.5f,-0.5f), // 0
            new( 0.5f,-0.5f,-0.5f), // 1
            new( 0.5f, 0.5f,-0.5f), // 2
            new(-0.5f, 0.5f,-0.5f), // 3
            new(-0.5f,-0.5f, 0.5f), // 4
            new( 0.5f,-0.5f, 0.5f), // 5
            new( 0.5f, 0.5f, 0.5f), // 6
            new(-0.5f, 0.5f, 0.5f), // 7
        };

        // 6 caras × 4 índices de esquina (CCW visto desde fuera)
        static readonly int[,] FaceCorners = {
            {1,2,6,5}, // +X
            {0,4,7,3}, // -X
            {3,7,6,2}, // +Y
            {0,1,5,4}, // -Y
            {4,5,6,7}, // +Z
            {0,3,2,1}, // -Z
        };

        static readonly Vector3[] FaceNormals = {
            new(1,0,0), new(-1,0,0), new(0,1,0),
            new(0,-1,0), new(0,0,1), new(0,0,-1),
        };

        // 12 aristas (pares de índices de Corner)
        static readonly int[] EdgePairs = {
            0,1, 1,2, 2,3, 3,0, // -Z
            4,5, 5,6, 6,7, 7,4, // +Z
            0,4, 1,5, 2,6, 3,7, // conectores Z
        };

        void Awake()
        {
            BuildSolid();
            BuildWireframe();
        }

        void BuildSolid()
        {
            var mesh = new Mesh { name = "CubeSolid" };
            mesh.subMeshCount = 6;

            var verts = new Vector3[24];
            var normals = new Vector3[24];
            var tris = new int[6 * 6];
            for (int f = 0; f < 6; f++)
            {
                for (int v = 0; v < 4; v++)
                {
                    verts[f * 4 + v] = Corner[FaceCorners[f, v]];
                    normals[f * 4 + v] = FaceNormals[f];
                }
                tris[f * 6 + 0] = f * 4 + 0;
                tris[f * 6 + 1] = f * 4 + 1;
                tris[f * 6 + 2] = f * 4 + 2;
                tris[f * 6 + 3] = f * 4 + 0;
                tris[f * 6 + 4] = f * 4 + 2;
                tris[f * 6 + 5] = f * 4 + 3;
            }
            mesh.vertices = verts;
            mesh.normals = normals;
            for (int f = 0; f < 6; f++) mesh.SetTriangles(Slice(tris, f * 6, 6), f);
            mesh.RecalculateBounds();

            GetComponent<MeshFilter>().sharedMesh = mesh;

            var shader = FindShader();
            if (shader == null) { Debug.LogError("[Cube] no shader found"); return; }
            var mats = new Material[6];
            for (int f = 0; f < 6; f++) mats[f] = new Material(shader) { color = FaceColors[f] };
            GetComponent<MeshRenderer>().sharedMaterials = mats;
        }

        void BuildWireframe()
        {
            var go = new GameObject("Wireframe");
            go.transform.SetParent(transform, false);

            var mesh = new Mesh { name = "CubeWireframe" };
            mesh.vertices = Corner;
            mesh.SetIndices(EdgePairs, MeshTopology.Lines, 0);
            mesh.RecalculateBounds();

            var mf = go.AddComponent<MeshFilter>();
            mf.sharedMesh = mesh;

            var shader = FindShader();
            if (shader == null) { Debug.LogError("[Cube] no shader for wireframe"); return; }
            var mat = new Material(shader) { color = Color.black };
            if (mat.HasProperty("_ZTest")) mat.SetFloat("_ZTest", (float)UnityEngine.Rendering.CompareFunction.Always);
            mat.renderQueue = 3000;

            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
        }

        static Shader FindShader()
        {
            string[] candidates = { "SignAI/UnlitColor", "Unlit/Color", "Hidden/InternalErrorShader", "Sprites/Default" };
            foreach (var name in candidates)
            {
                var s = Shader.Find(name);
                if (s != null) { Debug.Log("[Cube] using shader: " + name); return s; }
            }
            return null;
        }

        static int[] Slice(int[] src, int offset, int count)
        {
            var dst = new int[count];
            System.Array.Copy(src, offset, dst, 0, count);
            return dst;
        }
    }
}
