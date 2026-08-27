# Contexto del Proyecto - SignAI Kotlin Native

## Fecha de creación
2026-08-18

## Descripción general
Versión nativa Kotlin de SignAI utilizando Clean Architecture y Filament para la renderización 3D del avatar.

## Arquitectura seleccionada
**Clean Architecture** con separación en 4 módulos principales:

### Estructura de carpetas creada

```
appKotlin/
├── app/                          # Módulo principal de la aplicación
│   └── src/main/java/com/signai/app/
│       ├── di/                   # Inyección de dependencias
│       ├── domain/               # Domain layer (app-specific)
│       │   ├── model/
│       │   ├── repository/
│       │   └── usecase/
│       ├── data/                 # Data layer (app-specific)
│       │   ├── remote/
│       │   ├── local/
│       │   └── repository/
│       └── presentation/         # UI Layer
│           ├── viewmodel/
│           └── ui/
│               ├── screens/
│               ├── components/
│               └── theme/
│
├── domain/                       # Domain module (core business logic)
│   └── src/main/java/com/signai/domain/
│       ├── model/                # Entidades del dominio
│       ├── repository/           # Interfaces de repositorio
│       └── usecase/              # Casos de uso
│
├── data/                         # Data module (implementación)
│   └── src/main/java/com/signai/data/
│       ├── remote/               # Fuentes remotas (API Flask)
│       ├── local/                # Fuentes locales (CSV/cache)
│       └── repository/           # Implementación de repositorios
│
├── presentation/                 # Presentation module (UI)
│   └── src/main/java/com/signai/presentation/
│       ├── viewmodel/            # ViewModels
│       └── ui/
│           ├── screens/          # Pantallas
│           ├── components/       # Componentes reutilizables
│           └── theme/            # Tema de la app
│
└── common/                       # Common module (utilities)
    └── src/main/java/com/signai/common/
        ├── utils/                # Utilidades generales
        ├── extensions/           # Extensiones de Kotlin
        └── constants/            # Constantes
```

## Dependencias clave (pendientes de configurar)

| Componente | Tecnología | Propósito |
|------------|------------|-----------|
| UI Framework | Jetpack Compose | Interfaces declarativas |
| 3D Rendering | Filament / Sceneform | Avatar 3D con glTF/GLB |
| DI | Hilt / Dagger | Inyección de dependencias |
| Networking | Retrofit + Moshi | Consumo de API Flask |
| Async | Coroutines + Flow | Manejo de operaciones asíncronas |
| Local Storage | Room + CSV Parser | Cache de landmarks |
| Image Processing | CameraX | Captura en tiempo real |

## Mapeo de capas - Clean Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   PRESENTATION                          │
│  Screens (Compose) ← ViewModels ← UseCases             │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     DOMAIN                              │
│  UseCases ← Repository Interfaces ← Models (Entities)  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┤
│                      DATA                               │
│  Repository Impl ← RemoteDataSource + LocalDataSource   │
└─────────────────────────────────────────────────────────┘
```

## Flujo de datos - SignAI Kotlin

1. **Captura**: CameraX captura frames → MediaPipe extrae landmarks
2. **Procesamiento**: Landmarks se transforman a formato Avatar
3. **Animación**: Filament renderiza avatar con landmarks procesados
4. **API Sync**: Opcionalmente sincroniza con servidor Flask existente

## Componentes del dominio (a implementar)

### Models (entidades)
- `Sign` - Seña del dataset LSC50
- `Landmark` - Punto de referencia 3D
- `Frame` - Frame con todos los landmarks
- `Avatar` - Configuración del avatar 3D
- `Bone` - Hueso del esqueleto

### Repositories (interfaces)
- `SignRepository` - Operaciones con señas
- `LandmarkRepository` - Acceso a landmarks
- `AvatarRepository` - Control del avatar

### Use Cases
- `GetSignsUseCase` - Obtener lista de señas
- `LoadLandmarksUseCase` - Cargar landmarks de una seña
- `AnimateAvatarUseCase` - Animar avatar con landmarks
- `CaptureRealTimeUseCase` - Captura en tiempo real

## Requisitos del sistema

### Herramientas necesarias

| Herramienta | Versión requerida | Propósito |
|-------------|-------------------|-----------|
| JDK | 17+ | Compilación de Kotlin |
| Android Studio | Hedgehog (2023.1)+ | IDE de desarrollo |
| Android SDK | API 34 (Android 14) | Target de compilación |
| Kotlin | 1.9.0+ | Lenguaje de programación |
| Gradle | 8.2+ | Sistema de build |
| Git | 2.40+ | Control de versiones |

### Verificar instalación

```bash
# Verificar Java
java -version
# Debe mostrar: openjdk version "17.x" o superior

# Verificar Kotlin (opcional, viene con Android Studio)
kotlin -version

# Verificar Gradle
gradle --version

# Verificar Git
git --version
```

## Estado actual del entorno (verificado)

### ✅ Herramientas instaladas

| Herramienta | Versión | Estado |
|-------------|---------|--------|
| JDK | OpenJDK 17.0.20 | ✅ Instalado |
| Git | 2.55.0 | ✅ Instalado |
| Android SDK | API 34, 35, 36 | ✅ Instalado en ~/Android/Sdk |
| Build Tools | 35.0.0, 36.0.0 | ✅ Instalado |
| Kotlin | - | ⚠️ No global (viene con Android Studio) |
| Gradle | - | ⚠️ No global (usa wrapper del proyecto) |

### ✅ Estado verificado (2026-08-18)

- Java 17.0.20 ✓
- Git 2.55.0 ✓
- Android SDK ✓ (API 34, 35, 36)
- Build Tools ✓ (35.0.0, 36.0.0)
- ADB ✓
- ANDROID_HOME ✓ (configurado en ~/.zshrc)

## Configuración del entorno

### 1. Configurar Variables de Entorno (REQUERIDO)

Ejecutar estos comandos para configurar Android SDK:

```bash
# Agregar al ~/.zshrc (o ~/.bashrc)
cat >> ~/.zshrc << 'EOF'

# Android SDK
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/build-tools/35.0.0
EOF

# Recargar configuración
source ~/.zshrc
```

### 2. Verificar configuración

```bash
# Verificar variable
echo $ANDROID_HOME
# Debe mostrar: /home/diegocachy/Android/Sdk

# Verificar adb
adb --version
```

### 3. Instalar Android Studio (OPCIONAL pero recomendado)

Si deseas usar Android Studio como IDE:

1. Descargar desde https://developer.android.com/studio
2. Durante instalación, seleccionar opción "Standard"
3. Android Studio detectará automáticamente el SDK existente

### 4. Compilar el Proyecto

```bash
cd SignAI/appKotlin

# Primera compilación (descarga dependencias)
./gradlew build

# Si hay errores de SDK, crear local.properties
echo "sdk.dir=$HOME/Android/Sdk" > local.properties

# Compilar nuevamente
./gradlew build
```

### 5. Ejecutar en Emulador o Dispositivo

```bash
# Listar dispositivos conectados
adb devices

# Instalar APK
./gradlew installDebug

# O ejecutar directamente
./gradlew run
```

## Solución de problemas comunes

### Error: "SDK not found"
```bash
# Crear archivo local.properties con tu ruta
echo "sdk.dir=/home/$USER/Android/Sdk" > local.properties
```

### Error: "License not accepted"
```bash
# Aceptar todas las licencias
yes | sdkmanager --licenses
```

### Error: "Gradle sync failed"
```bash
# Limpiar caché
./gradlew clean
./gradlew build --refresh-dependencies
```

### Error: "Java version mismatch"
```bash
# Verificar JAVA_HOME
echo $JAVA_HOME
# Debe apuntar a JDK 17+

# En Ubuntu/Debian:
sudo update-alternatives --config java
# Seleccionar JDK 17
```

## Tareas pendientes

- [x] Crear estructura de carpetas Clean Architecture
- [x] Documentar requisitos del sistema
- [ ] Configurar build.gradle con dependencias
- [ ] Implementar models del dominio
- [ ] Configurar Hilt para DI
- [ ] Implementar capa de datos (Retrofit + Room)
- [ ] Integrar Filament para renderizado 3D
- [ ] Conectar con API Flask existente
- [ ] Implementar captura con CameraX + MediaPipe

## Notas técnicas

- **Formato de landmarks**: CSV con columnas landmark_0_x, landmark_0_y, landmark_0_z, etc.
- **API Flask**: Endpoint principal `/api/landmarks/<id>` retorna JSON con frames
- **Avatar GLB**: Archivo `avatar.glb` exportado de Blender con 918 joints
- **Coordenadas**: x,y normalizadas (0-1), z es profundidad relativa

## Referencia al proyecto original

Este proyecto Kotlin es una migración del proyecto web/signAI que usa:
- Frontend: Three.js + JavaScript
- Backend: Flask + Python
- Dataset: LSC50 (50 señas, 1000 videos)

El objetivo es replicar la funcionalidad en una app nativa Android con mejor rendimiento y experiencia de usuario nativa.
