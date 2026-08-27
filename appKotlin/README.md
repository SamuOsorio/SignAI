# SignAI - Android App (Kotlin)

Aplicación nativa Android para el proyecto SignAI, desarrollada con Kotlin, Clean Architecture y Filament para renderizado 3D.

## Requisitos

- **JDK 17+** (OpenJDK recomendado)
- **Android SDK** (API 34+)
- **Git**

## Instalación Rápida

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/SignAI.git
cd SignAI/appKotlin
```

### 2. Verificar entorno

```bash
bash check_environment.sh
```

### 3. Configurar Android SDK (si no está configurado)

```bash
# Agregar a ~/.zshrc o ~/.bashrc
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin

# Recargar configuración
source ~/.zshrc
```

### 4. Compilar el proyecto

```bash
./gradlew build
```

### 5. Ejecutar en emulador o dispositivo

```bash
# Listar dispositivos
adb devices

# Instalar APK
./gradlew installDebug
```

## Estructura del Proyecto

```
appKotlin/
├── app/           # Módulo principal (DI, punto de entrada)
├── domain/        # Modelos, repositorios abstractos, casos de uso
├── data/          # Implementaciones (API, base de datos)
├── presentation/  # ViewModels + Jetpack Compose
├── common/        # Utilidades compartidas
└── CONTEXT.md     # Documentación del contexto
```

## Solución de Problemas

### Error: "SDK not found"

```bash
echo "sdk.dir=$HOME/Android/Sdk" > local.properties
```

### Error: "Java version mismatch"

```bash
# Verificar JAVA_HOME
echo $JAVA_HOME

# En Ubuntu/Debian:
sudo update-alternatives --config java
# Seleccionar JDK 17
```

### Error: "Gradle sync failed"

```bash
./gradlew clean
./gradlew build --refresh-dependencies
```

## Tecnologías

- **Lenguaje**: Kotlin
- **UI**: Jetpack Compose
- **3D**: Filament
- **DI**: Hilt
- **Networking**: Retrofit
- **Async**: Coroutines + Flow
- **Base de datos**: Room

## Documentación

Ver `CONTEXT.md` para más detalles sobre la arquitectura y configuración.
