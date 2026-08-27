#!/bin/bash

# SignAI - Verificación de Entorno
# Ejecutar: bash check_environment.sh

echo "=================================="
echo "  Verificación de Entorno SignAI  "
echo "=================================="
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para verificar comando
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $2: $(command -v $1)"
        return 0
    else
        echo -e "${RED}✗${NC} $2: No encontrado"
        return 1
    fi
}

# Función para verificar versión
check_version() {
    version=$($1 --version 2>&1 | head -1)
    if [[ $version == *"$2"* ]]; then
        echo -e "${GREEN}✓${NC} $3: $version"
        return 0
    else
        echo -e "${RED}✗${NC} $3: Versión incorrecta (esperado: $2)"
        return 1
    fi
}

echo "1. Verificando herramientas básicas..."
check_command "java" "Java"
check_command "git" "Git"
echo ""

echo "2. Verificando Java..."
if command -v java &> /dev/null; then
    java_version=$(java -version 2>&1 | head -1 | cut -d'"' -f2)
    major_version=$(echo $java_version | cut -d'.' -f1)
    if [ "$major_version" -ge 17 ]; then
        echo -e "${GREEN}✓${NC} Java 17+ detectado: $java_version"
    else
        echo -e "${RED}✗${NC} Se requiere Java 17+. Actual: $java_version"
    fi
fi
echo ""

echo "3. Verificando Android SDK..."
if [ -n "$ANDROID_HOME" ]; then
    echo -e "${GREEN}✓${NC} ANDROID_HOME: $ANDROID_HOME"
    
    if [ -d "$ANDROID_HOME/platforms" ]; then
        platforms=$(ls $ANDROID_HOME/platforms 2>/dev/null)
        echo -e "${GREEN}✓${NC} Plataformas instaladas: $platforms"
    fi
    
    if [ -d "$ANDROID_HOME/build-tools" ]; then
        tools=$(ls $ANDROID_HOME/build-tools 2>/dev/null)
        echo -e "${GREEN}✓${NC} Build Tools instalados: $tools"
    fi
    
    if command -v adb &> /dev/null; then
        echo -e "${GREEN}✓${NC} ADB disponible"
    else
        echo -e "${YELLOW}⚠${NC} ADB no encontrado en PATH"
    fi
else
    echo -e "${RED}✗${NC} ANDROID_HOME no está configurado"
    echo "  Ejecuta: export ANDROID_HOME=\$HOME/Android/Sdk"
fi
echo ""

echo "4. Verificando proyecto..."
if [ -f "gradlew" ]; then
    echo -e "${GREEN}✓${NC} Gradle Wrapper encontrado"
else
    echo -e "${YELLOW}⚠${NC} No se encontró gradle-wrapper.jar"
fi

if [ -f "build.gradle.kts" ] || [ -f "build.gradle" ]; then
    echo -e "${GREEN}✓${NC} build.gradle encontrado"
else
    echo -e "${YELLOW}⚠${NC} build.gradle no encontrado (¿estás en la carpeta correcta?)"
fi
echo ""

echo "=================================="
echo "  Resumen"
echo "=================================="
echo ""
echo "Si todo está correcto, puedes compilar con:"
echo "  ./gradlew build"
echo ""
echo "Para instalar en dispositivo/emulador:"
echo "  ./gradlew installDebug"
echo ""
