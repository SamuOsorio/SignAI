## 1. Fixes rápidos (app.js)

- [x] 1.1 Hardcodear `smoothAlpha = 0.12` y eliminar el slider de suavizado de la UI
- [x] 1.2 Suprimir el ruido Z en `mpToThree`: z=0 para landmarks de dedos (z de MediaPipe Hands es poco confiable en video monocular frontal)
- [x] 1.3 Aplicar slerp al paso de roll en `applyHandOrientation`: reemplazar `bone.quaternion.copy(_tLQ)` por `bone.quaternion.slerp(_tLQ, state.smoothAlpha)`
- [x] 1.4 Corregir FPS en `server.py`: cambiar `"fps": 30` → `"fps": 24` (COLOR_BODY es 24fps; con 30 el avatar iba 1.25× más rápido que el video)

## 2. Proyección en plano de palma (app.js)

- [x] 2.1 Guardar normal de palma en `state.palmNormalL` / `state.palmNormalR` al final de `applyHandOrientation`
- [x] 2.2 Proyectar dirección de cada dedo sobre el plano de la palma antes de `rotateBone`: `dir -= (dir·palmNormal)*palmNormal`
- [ ] 2.3 Verificar visualmente señas de una mano (0010–0019) que los dedos doblan naturalmente sin torsión lateral

## 3. Manos en contacto/solapadas

Limitación conocida: cuando las palmas se juntan o se cruzan, los landmarks de MediaPipe se
contaminan entre sí y la normal de palma deja de ser confiable → dedos aparecen entrelazados.

- [ ] 3.1 Detectar cuándo ambas muñecas están cerca en world space (`_ikWrist_L.distanceTo(_ikWrist_R) < umbral`)
- [ ] 3.2 Cuando las muñecas están cerca, desactivar la proyección sobre plano de palma (usar dirección raw) para evitar restricciones en plano incorrecto
- [ ] 3.3 Calibrar el umbral de proximidad probando con señas de contacto (0004 "frota palmas", buscar otras en 0000–0049)

## 4. Verificación general

- [ ] 4.1 Probar al menos 10 señas variadas (una mano, dos manos separadas, dos manos juntas) y anotar calidad
- [ ] 4.2 Ajustar `smoothAlpha` si 0.12 da demasiado lag en señas rápidas (probar 0.15–0.18)
- [ ] 4.3 Evaluar si z=0 en `mpToThree` aplana demasiado la forma de la mano en señas con profundidad (probar z×0.1 como alternativa)
