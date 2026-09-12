> **Archivado 2026-09-12** — pendientes vigentes consolidados en `openspec/changes/avatar-pendientes-criticos`. Este doc queda como registro histórico.

# Avatar — Material, IBL y tone mapping (fix "sin textura" / tren inferior sin forma)

> Sesión: 2026-09-09
> Rama: `feature/avatar-material-shading` (sale de `feature/nuevo-avatar-copiamodelo`)
> Commit base: `3ac3e10`
> Solo código (`app/static/app.js`). **NO requiere re-exportar el GLB.**

---

## 0. Problema reportado

Dos síntomas visibles en el avatar (screenshots de la sesión):

1. **Tren inferior "pierde la textura" y no tiene forma humana** vs. el torso/brazos que
   se ven bien. Además, **costura vertical dura en la línea central** del cuerpo (pecho y
   abdomen), con la mitad izquierda y derecha sombreadas distinto.
2. Dedos y muñeca se deforman en movimiento (círculo rojo). — **Fuera de alcance de este
   change**, se ataca aparte (ver `mejoras-animacion-manos` §3 y
   `copiamodelo-rig-ik-contacto` §10.3).

Se acordó atacar primero el punto 1 (el fácil).

---

## 1. Diagnóstico (inspección del binario `app/static/avatar.glb`)

Análisis del GLB parseando los chunks JSON/BIN:

| Aspecto | Resultado |
|---------|-----------|
| Mallas | **1 sola** (`female_v006lowresUV`, nodo `GEO-body_male_realistic`), 1 primitivo |
| Materiales | **0** — el primitivo tiene `material: null` |
| Texturas / imágenes | **0 / 0** — no hay nada embebido |
| `COLOR_0` (vertex colors) | Presente pero **blanco plano `(1,1,1,1)`** en todo el cuerpo |
| `WEIGHTS_0` | Normalizados a `1.000` en todo el cuerpo — **skinning sano** |
| Huesos de pierna | `thigh_stretch`, `leg_stretch`, `leg_twist`, `foot`, `toes_01` bien asignados |
| Densidad de malla | cabeza ~3870 verts · torso ~1200 · **pelvis/muslo 380–1920** |

### Conclusiones

- **No existe ninguna textura en el modelo**, ni arriba ni abajo. Lo que se percibía como
  "textura" en el torso era geometría densa (costillas/abdominales/clavículas modeladas)
  atrapando la luz. Las piernas son low-poly y lisas → leen como bloque gris.
- El **skinning de las piernas NO está roto** (pesos normalizados, huesos correctos). El
  "sin forma humana" era falta de material + baja resolución de malla, no deformación.
- Con `material: null`, `GLTFLoader` asigna un material por defecto con **`metalness: 1`**.
  Un metálico sin *environment map* se ve plano y lavado (clásico gotcha de Three.js).
- La **costura vertical central** venía de `computeVertexNormals()` (introducido en
  `copiamodelo-rig-ik-contacto` §4.1) corriendo sobre una malla cuyas dos mitades del
  *mirror* no están soldadas en el plano de simetría → normales de un solo lado en el borde.

---

## 2. Fix aplicado en `app/static/app.js`

- [x] **2.1 Environment map (IBL sintético)** — `import { RoomEnvironment }` y
  ```js
  const _pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = _pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  ```
  Da volumen a todo el cuerpo sin descargar un HDR. `environmentIntensity = 0.45` porque
  el IBL pasó a ser la fuente de luz dominante y a `1.0` dejaba el cuerpo lavado.

- [x] **2.2 Override de material** — el GLB no trae material; se reemplaza el default
  metálico por una piel mate:
  ```js
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xa9785d, roughness: 0.85, metalness: 0.0,
  });
  gltf.scene.traverse(obj => { if (obj.isMesh) obj.material = skinMat; });
  ```

- [x] **2.3 Tone mapping** — comprime altas luces, quita el look "lavado/plástico" del IBL:
  ```js
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  ```

- [x] **2.4 Luces bajadas** — con `scene.environment` activo, el ambient/key altos aplanan:
  - `AmbientLight` `0.7 → 0.2`
  - key `DirectionalLight` `1.2 → 0.9`
  - `fill` sin cambios (`0x8090ff`, `0.4`)

- [x] **2.5 A/B test de la costura central** — `computeVertexNormals()` quedó detrás de un
  flag:
  ```js
  const RECOMPUTE_NORMALS = false;
  if (RECOMPUTE_NORMALS) { /* traverse + computeVertexNormals */ }
  ```
  **Resultado (verificado en runtime): con `false` la costura vertical central desaparece
  y NO regresan las líneas negras** de cuello/hombros/antebrazos que motivaron el recálculo
  en `copiamodelo-rig-ik-contacto` §4.1. → Se deja en `false`; **no hace falta soldar en
  Blender**.

---

## 3. Verificación

- [x] 3.1 Screenshot post-fix: cuerpo con tono y sombreado consistentes arriba y abajo;
  ya no hay corte torso/piernas.
- [x] 3.2 Piernas leen como humanas (rodillas, pantorrillas, muslos, pies con volumen).
- [x] 3.3 Costura vertical central eliminada con `RECOMPUTE_NORMALS = false`.
- [x] 3.4 Sin regresión de líneas negras en cuello/hombros/antebrazos.
- [x] 3.5 Calibración de luminosidad: `environmentIntensity 0.45` + `toneMappingExposure 0.85`
  + `AmbientLight 0.2` + key `0.9` → nivel aceptado por el usuario.
- [ ] 3.6 Verificar que la animación (dedos, brazos, mandíbula, CONTACT_BLEND) no cambió
  de comportamiento con el material/IBL nuevos — pendiente de revisión con varias señas.
- [ ] 3.7 Commit de los cambios en `feature/avatar-material-shading`.

---

## 4. Registro de errores investigados

| Síntoma | Diagnóstico | Fix |
|---------|-------------|-----|
| Tren inferior "sin textura" / sin forma | GLB sin material + piernas low-poly; default `metalness:1` sin IBL | Material mate + `scene.environment` (RoomEnvironment) |
| Torso "con textura" vs piernas planas | Percepción por densidad de malla, no hay textura en ninguna parte | (mismo fix — el IBL revela volumen en ambas zonas) |
| Costura vertical dura en el centro del cuerpo | `computeVertexNormals()` sobre mirror sin soldar → normales de un lado en el borde | `RECOMPUTE_NORMALS = false` (usa normales del GLB) |
| Avatar lavado / plástico tras agregar IBL | El IBL a intensidad 1.0 era la fuente dominante | `environmentIntensity 0.45` + `ACESFilmicToneMapping` exp `0.85` + luces bajadas |

---

## 5. Fuera de alcance / pendiente para más adelante

- **Detalle fino de geometría en las piernas** (siguen siendo low-poly): solo se arregla
  re-exportando el GLB desde Blender con subdivisión / mejor topología. Es la ruta de
  `avatar-fixes-y-mejoras` §2 (Blender), no de este change.
- Textura de piel real (mapa UV) en vez de color plano: también requiere trabajo en Blender
  + re-export con texturas embebidas.
- Deformación de dedos/muñeca (síntoma 2 del reporte): change aparte.
