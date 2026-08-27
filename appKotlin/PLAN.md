# Plan — Migración SignAI Web → Android Kotlin (Fase 1: base mínima)

**Fecha:** 2026-08-18
**Decisiones clave:**
- Datos: empaquetar CSVs en `assets/` (sin backend todavía)
- Filament real con `gltfio-android`
- Solo pose estática del primer frame (validar cadena)
- Multi-módulo Clean Architecture desde el inicio

---

## 1. Estado actual (lo que migramos)

App Web de referencia:
- Flask (`app/server.py`) → JSON con landmarks LSC50
- Three.js (`app/static/app.js`) → GLB + IK + retargeting
- 1 pantalla: video | avatar 3D | selector | controles

Funcionalidades clave a portar (no todas en esta fase):
1. Cargar GLB y exponer 918 joints
2. Parsear CSVs LSC50 (body, face, hands L/R)
3. Calcular rest pose (quat world + dirección Y)
4. IK analítico de 2 huesos (brazos)
5. Retargeting (muñeca + dedos)
6. Orientación de muñeca con roll
7. Animación facial (mandíbula, cejas)
8. Filtro de signos disponibles
9. Reproducción sincronizada con video

**Esta fase incluye:** 1, 2, 3, 4, 5, 6 (sin cara, sin video, sin animación — solo el primer frame).

---

## 2. Estructura objetivo de módulos

```
appKotlin/
├── app/                    # Aplicación (UI + Filament)
├── domain/                 # Pure Kotlin (modelos, interfaces, use cases)
├── data/                   # Android library (CSV parser, repo impl)
└── common/                 # Pure Kotlin (constantes, math)
```

**Dependencias:**
```
app → domain, data, common
data → domain, common
domain → common
common → (nada)
```

---

## 3. Fases de implementación

### Fase 1 — Estructura multi-módulo
- Crear `domain/`, `data/`, `common/` con `build.gradle.kts` propio
- `domain` y `common` = `kotlin-jvm` (puros, sin Android)
- `data` = `android-library` (necesita `Context` para assets)
- Actualizar `settings.gradle.kts` para `include()`
- Configurar repos `mavenCentral()` y `google()` en cada módulo

### Fase 2 — `:common` (utilidades)
- `LandmarkConstants.kt`: FACE_KEY_LMS, BONE_MAP, etc. (portado de `server.py`)
- `Vec3.kt`: struct inmutable con operaciones básicas
- `Quat.kt`: struct inmutable con operaciones básicas
- `LandmarkCoords.kt`: extensión para conversión landmark → Three.js (ejes image→world)

### Fase 3 — `:domain` (modelos + interfaces + use cases)
- `model/Sign.kt`: id, name, rep, angle
- `model/Landmark.kt`: x, y, z
- `model/HandFrame.kt`: hand (Left/Right), landmarks
- `model/BodyFrame.kt`: List<Landmark> (33 puntos)
- `model/FaceFrame.kt`: Map<Int, Landmark> (índices FACE_KEY_LMS)
- `model/Frame.kt`: hands, body, face
- `model/SignLandmarks.kt`: stem, fps, totalFrames, frames
- `repository/SignRepository.kt`: interface (listSigns, getSignLandmarks)
- `usecase/GetSignsUseCase.kt`
- `usecase/GetSignLandmarksUseCase.kt`

### Fase 4 — `:data` (parser + repo impl)
- `parser/CsvLandmarksParser.kt`: lee 4 CSVs (body, face, L, R) y produce `SignLandmarks`
- `source/LandmarksAssetDataSource.kt`: lee desde `assets/landmarks/`
- `repository/SignRepositoryImpl.kt`: implementa interface

### Fase 5 — Empaquetar assets
- Copiar `avatar.glb` a `app/src/main/assets/avatar.glb`
- Copiar CSVs de `0000_0000_0000` a `app/src/main/assets/landmarks/0000_0000_0000/`:
  ```
  assets/landmarks/
  ├── 0000_0000_0000/
  │   ├── body.csv
  │   ├── face.csv
  │   ├── left_hand.csv
  │   └── right_hand.csv
  ```
- (Solución al bug 3 del spec avatar: multiplicar índice de face para sincronizar)

### Fase 6 — App: dependencias Filament
En `app/build.gradle.kts`:
```kotlin
implementation("com.google.android.filament:filament-android:1.51.5")
implementation("com.google.android.filament:filament-utils-android:1.51.5")
implementation("com.google.android.filament:gltfio-android:1.51.5")
```
(Verificar la última versión estable en https://github.com/google/filament/releases)

### Fase 7 — App: FilamentRenderer
- `render/FilamentRenderer.kt`: orquesta Engine, Renderer, View, Scene, Camera, SwapChain
- Encapsula el ciclo de vida (init, resume, pause, destroy)
- Usa `Choreographer` para llamar `renderer.render()` cada frame

### Fase 8 — App: AvatarLoader
- `render/AvatarLoader.kt`: usa `gltfio.AssetLoader` y `ResourceLoader`
- Carga `avatar.glb` desde assets
- Itera la jerarquía de `Entity` → identifica `Bone` (los que tienen `RenderableManager` + `TransformManager`)
- Devuelve mapa `name → Entity` + `name → TRS` (rest pose: world quat + dirección Y)

### Fase 9 — App: PoseApplier (port JS → Kotlin)
- `render/PoseApplier.kt`: replica la lógica de `app.js`:
  - `measureArmRest()`: longitudes upper_arm/forearm en rest
  - `applyArmIK(body)`: IK 2-huesos para ambos brazos
  - `applyHandOrientation(bone, rawLms, normalSign)`: mano con roll
  - `applyHandBones(rawLms)`: 30 huesos de dedos
- Algoritmos:
  - `solveIKElbow(shoulder, target, pole, L1, L2)` — ley de cosenos
  - `rotateBone(bone, targetDir, alpha)` — retargeting world → local

### Fase 10 — App: UI Compose
- `MainActivity.kt`: setContent { SignAIApp() }
- `presentation/ui/SignAIScreen.kt`: layout vertical
  - Top: título + selector de seña (Spinner)
  - Centro: `AndroidView` envolviendo `SurfaceView` de Filament
  - Bottom: status + botón "Aplicar frame 0"
- `MainViewModel.kt`: expone `StateFlow<UiState>` (ListaSings, SignSeleccionada, Status)
- Anima solo el primer frame al cargar seña

### Fase 11 — Validar
- `./gradlew assembleDebug` → debe compilar
- `./gradlew installDebug` → debe instalar
- Abrir app → elegir seña → debe verse avatar 3D con primer frame aplicado

---

## 4. Cosas que NO entran en esta fase

- ❌ Reproducción animada (solo estática)
- ❌ Video player
- ❌ Cara completa (mandíbula + cejas + párpados + labios)
- ❌ Captura desde cámara
- ❌ Backend HTTP
- ❌ Cache de assets
- ❌ Tests unitarios
- ❌ Hilt (DI manual por ahora)

---

## 5. Riesgos identificados

| Riesgo | Mitigación |
|--------|------------|
| Filament no carga GLB con 918 joints | Verificar versión gltfio compatible. Probar con GLB simplificado si falla. |
| GLB sin texturas se ve mal | Aceptar en esta fase. Fase 2: añadir material PBR con color piel. |
| APK muy grande (avatar.glb + CSVs) | glb=1.4MB + CSVs muestra=~1MB. Aceptable. |
| Rotación de bones en Filament | Usar `TransformManager` + `setTransform(tm, instance, ...)` con `floatArrayOf(...)` quat. |
| Bug 1 (cejas) y Bug 3 (face sync) | Aplicar fix en `app.js` aka nuevo poseApplier. No aplica esta fase (no animamos cara). |

---

## 6. Orden de ejecución

1. Estructura módulos (sin lógica)
2. `:common` + `:domain` (compilan vacíos)
3. `:data` (parser + repo)
4. Empaquetar assets
5. Test: lectura de CSVs en un log (sin UI)
6. Integrar Filament + gltfio
7. Cargar avatar sin animación
8. Portar pose applier
9. UI Compose
10. Compilar + instalar + validar

---

## Estado actualizado (2026-08-19)

**Bloqueado en:** render loop no se ejecuta → solo se ve clear color.

**Causa raíz identificada:** `ModelViewer` NO auto-renderiza. Requiere:
1. `ChoreographerHelper` con `setRenderer(renderer)` + `post()` para loop por vsync.
2. `Manipulator()` (no `null`) pasado al constructor para interacción touch.
3. Aplicar `manipulator.getLookAt(...)` a la cámara cada frame.

**Próximo paso:** añadir ChoreographerHelper + Manipulator a `FilamentRenderer.kt`, integrar `onTouchEvent` en el SurfaceView, recargar test_avatar.glb y verificar que el cubo aparece.
