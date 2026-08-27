using UnityEngine;

namespace SignAI
{
    public class CameraOrbit : MonoBehaviour
    {
        public Transform target;
        public float distance = 3f;
        public float minDistance = 1f;
        public float maxDistance = 10f;
        public float orbitSpeed = 0.3f;
        public float zoomSpeed = 0.01f;
        public float minElevation = -89f;
        public float maxElevation = 89f;

        float _azimuth;
        float _elevation = 20f;
        bool _pinching;
        float _prevPinchDist;

        void Start()
        {
            if (target == null) target = GameObject.Find("Cube")?.transform ?? transform;
            UpdateCamera();
        }

        void Update()
        {
            var touches = Input.touchCount;
            if (touches == 0) { _pinching = false; return; }

            if (touches == 1)
            {
                _pinching = false;
                var t = Input.GetTouch(0);
                if (t.phase == TouchPhase.Moved)
                {
                    _azimuth += t.deltaPosition.x * orbitSpeed;
                    _elevation -= t.deltaPosition.y * orbitSpeed;
                    _elevation = Mathf.Clamp(_elevation, minElevation, maxElevation);
                }
            }
            else if (touches >= 2)
            {
                var a = Input.GetTouch(0).position;
                var b = Input.GetTouch(1).position;
                var d = Vector2.Distance(a, b);
                if (!_pinching)
                {
                    _pinching = true;
                    _prevPinchDist = d;
                }
                else
                {
                    var delta = d - _prevPinchDist;
                    distance = Mathf.Clamp(distance - delta * zoomSpeed * distance, minDistance, maxDistance);
                    _prevPinchDist = d;
                }
            }

            UpdateCamera();
        }

        void UpdateCamera()
        {
            var az = _azimuth * Mathf.Deg2Rad;
            var el = _elevation * Mathf.Deg2Rad;
            var cosEl = Mathf.Cos(el);
            var offset = new Vector3(
                distance * cosEl * Mathf.Sin(az),
                distance * Mathf.Sin(el),
                distance * cosEl * Mathf.Cos(az)
            );
            transform.position = target.position + offset;
            transform.LookAt(target.position);
        }
    }
}
