# SignAI — Agent Instructions

Thesis project: Spanish speech → Colombian Sign Language (LSC) via real-time 3D avatar.

## Repo structure

```
SignAI/
├── app/           Flask + Three.js web app (reference, not actively developed)
├── appKotlin/     Kotlin + Filament Android app (ACTIVE development)
├── webview/       WebView-based Android app (wraps app/ in a native shell)
├── unity/         Unity Android app (SignAI/ nested inside)
├── data/          Dataset LSC50 (CSV landmarks, videos)
├── Resources/     All shared resources: docs, scripts, assets
│   ├── docs/      Thesis docs, PDFs, ADR logs, export guides
│   └── scripts/   Python utilities (Blender, MediaPipe, visualization)
└── openspec/      Context engineering (config, specs, changes)
```

## Active work

**`appKotlin/`** is where development happens. Kotlin + Filament native Android app.
`app/` is the original Flask+Three.js web version (reference, not actively developed).

## Build

### appKotlin/

```bash
cd appKotlin
./gradlew build          # build all modules
./gradlew installDebug   # install on device
```

### webview/

Standalone Android Gradle project ("SignAI-WebView"). Wraps the Flask+Three.js `app/` in a WebView shell.

```bash
cd webview
./gradlew build
./gradlew installDebug
```

No CI. No tests yet. Verify builds compile clean before committing.

## Unity (`unity/SignAI/`) — user device workflow

Build + push to device in ONE command (user installs manually from Files app → Downloads).
DO NOT include `adb shell am force-stop` or `adb shell monkey ... LAUNCHER` — user dismisses/launches the app themselves.

```bash
unity build /home/diegocachy/tesisTesteos/SignAI/unity/SignAI \
  --target Android \
  --execute-method SignAI.EditorTools.SignAIBuilder.BuildAndroid \
  --non-interactive \
&& adb push /home/diegocachy/tesisTesteos/SignAI/unity/SignAI/Builds/SignAI.apk /sdcard/Download/SignAI.apk
```

Verify compile clean first with `SignAIBuilder.CompileOnly` (logs to `/tmp/unity_compile.log`).

## Architecture (appKotlin/)

Clean Architecture, 4 Gradle modules:

```
app → domain, data, common
data → domain, common
domain → common
common → (nothing)
```

| Module | Purpose |
|--------|---------|
| `common` | Constants, math (Vec3/Quat/Mat4), coordinate conversion |
| `domain` | Models (Landmark, Sign, Frame), use cases, repository interface |
| `data` | CSV parser, asset data source, repository impl |
| `app` | MainActivity, Filament renderer, PoseApplier, Compose UI |

Entry: `app/src/main/java/com/signai/app/MainActivity.kt`
Core animation: `app/.../render/PoseApplier.kt` (port of `app/static/app.js`)

## Critical constraint

Filament has a **256 bone limit per skin**. Avatar has 918 joints → must split mesh. See `Resources/docs/BLENDER_AVATAR_EXPORT.md`.

## Known bugs

1. **Bug 1** (fixed in Kotlin): Brow bone naming wrong in web `app.js` (`DEF-browTL` ≠ `DEF-brow.T.L`)
2. **Bug 2** (needs Blender fix): Right brow `DEF-brow.T.R` has 4 weighted vertices vs 32 on left
3. **Bug 3** (fixed in Kotlin): Face/body FPS desync (face=50fps, body=24fps) — `CsvLandmarksParser` resamples by ratio

## Key files

- `appKotlin/CONTEXT.md` — full architecture documentation
- `appKotlin/PLAN.md` — 11-phase migration plan
- `openspec/config.yaml` — project context, rules, specs
- `openspec/specs/avatar/spec.md` — avatar rig spec and bugs

## Conventions

- Kotlin 2.1.0, JVM target 17, minSdk 26
- Jetpack Compose + Material3
- Manual Service Locator for DI (Hilt planned later)
- CSVs in `data/LANDMARKS/` — 4 types: body, face, left_hand, right_hand
- Dataset: LSC50 (50 signs, 1000 videos)

## Workflow: Context Engineering (OpenSpec)

OpenSpec lives in `openspec/` and is the single source of truth for project context.

- `openspec/config.yaml` — rules, operations, project state
- `openspec/specs/` — specs for avatar, dataset, pipeline

**When you discover something important** (bug, constraint, architecture decision, naming convention):
1. Update the relevant spec in `openspec/specs/`
2. Update `openspec/config.yaml` if it changes project-level rules or state

**When you make a non-trivial change**: update `CONTEXT.md` and/or `PLAN.md` in `appKotlin/` to reflect the new state.

## Skills

Available: caveman (token reduction), ponytail (minimal code). Use `/caveman` or `/ponytail` to switch modes. Review with `/caveman-review` or `/ponytail-review`.
