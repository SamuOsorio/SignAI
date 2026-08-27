package com.signai.app.render

import android.content.Context
import android.view.MotionEvent
import android.view.Surface
import android.view.SurfaceView
import com.google.android.filament.Box
import com.google.android.filament.Camera
import com.google.android.filament.Colors
import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.IndexBuffer
import com.google.android.filament.LightManager
import com.google.android.filament.Material
import com.google.android.filament.MaterialInstance
import com.google.android.filament.RenderableManager
import com.google.android.filament.Renderer
import com.google.android.filament.Scene
import com.google.android.filament.Skybox
import com.google.android.filament.SwapChain
import com.google.android.filament.VertexBuffer
import com.google.android.filament.View
import com.google.android.filament.android.ChoreographerHelper
import com.google.android.filament.android.DisplayHelper
import com.google.android.filament.android.UiHelper
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt

/**
 * Renderer estilo `sample-lit-cube` de Filament.
 * Sin ModelViewer ni gltfio — todo manual.
 */
class FilamentRenderer(private val context: Context) {

    companion object {
        init { com.google.android.filament.Filament.init() }
    }

    val engine: Engine = Engine.create()
    private val renderer: Renderer = engine.createRenderer()
    private val scene: Scene = engine.createScene()
    private val view: View = engine.createView()
    private val cameraEntity: Int = EntityManager.get().create()
    val camera: Camera = engine.createCamera(cameraEntity)

    private val uiHelper = UiHelper(UiHelper.ContextErrorPolicy.DONT_CHECK)
    private val displayHelper = DisplayHelper(context)
    private val surfaceCallback = SurfaceCallback()
    private var swapChain: SwapChain? = null
    private var surfaceView: SurfaceView? = null

    private val frameScheduler = FrameCallback()

    private var azimuth: Float = 0.6f
    private var elevation: Float = 0.4f
    private var distance: Float = 8.0f
    private var lastX: Float = 0f
    private var lastY: Float = 0f
    private var lastPinchDist: Float = 0f
    private var isPinching: Boolean = false

    private var cubeEntity: Int = 0
    private var wireEntity: Int = 0
    private var lightEntity: Int = 0
    private var skybox: Skybox? = null
    private lateinit var material: Material
    private lateinit var wireMaterial: Material
    private lateinit var wireInstance: MaterialInstance
    private val faceMaterials = arrayOfNulls<MaterialInstance>(6)
    private lateinit var vertexBuffer: VertexBuffer
    private lateinit var indexBuffer: IndexBuffer
    private lateinit var wireVertexBuffer: VertexBuffer
    private lateinit var wireIndexBuffer: IndexBuffer

    init {
        setupView()
        setupScene()
    }

    fun attach(surface: SurfaceView) {
        surfaceView = surface
        uiHelper.renderCallback = surfaceCallback
        uiHelper.attachTo(surface)
        frameScheduler.setRenderer(renderer)
        frameScheduler.post()
    }

    fun onTouchEvent(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastX = event.x; lastY = event.y
                isPinching = false
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (event.pointerCount >= 2) {
                    val dx = event.getX(0) - event.getX(1)
                    val dy = event.getY(0) - event.getY(1)
                    lastPinchDist = kotlin.math.sqrt((dx * dx + dy * dy).toDouble()).toFloat()
                    isPinching = true
                }
            }
            MotionEvent.ACTION_MOVE -> {
                if (isPinching && event.pointerCount >= 2) {
                    // Pinch-to-zoom
                    val dx = event.getX(0) - event.getX(1)
                    val dy = event.getY(0) - event.getY(1)
                    val pinchDist = kotlin.math.sqrt((dx * dx + dy * dy).toDouble()).toFloat()
                    if (lastPinchDist > 0f) {
                        val ratio = lastPinchDist / pinchDist
                        distance = (distance * ratio).coerceIn(2.5f, 30f)
                        updateCamera()
                    }
                    lastPinchDist = pinchDist
                } else if (event.pointerCount == 1) {
                    // Orbit (1 dedo)
                    val dx = event.x - lastX
                    val dy = event.y - lastY
                    lastX = event.x; lastY = event.y
                    azimuth -= dx * 0.01f
                    elevation -= dy * 0.01f
                    elevation = elevation.coerceIn(-1.5f, 1.5f)
                    updateCamera()
                }
            }
            MotionEvent.ACTION_POINTER_UP -> {
                if (event.pointerCount <= 2) {
                    isPinching = false
                    lastPinchDist = 0f
                    // Al levantar un dedo y quedar 1, reseteamos lastX/lastY al dedo actual
                    // para evitar un "salto" en el orbit.
                    val remainingIndex = if (event.actionIndex == 0) 1 else 0
                    lastX = event.getX(remainingIndex)
                    lastY = event.getY(remainingIndex)
                }
            }
            MotionEvent.ACTION_UP -> {
                isPinching = false
                lastPinchDist = 0f
            }
        }
    }

    fun destroy() {
        frameScheduler.remove()
        uiHelper.detach()
        engine.destroyEntity(cubeEntity)
        engine.destroyEntity(wireEntity)
        engine.destroyEntity(cameraEntity)
        engine.destroyIndexBuffer(indexBuffer)
        engine.destroyIndexBuffer(wireIndexBuffer)
        engine.destroyVertexBuffer(vertexBuffer)
        engine.destroyVertexBuffer(wireVertexBuffer)
        faceMaterials.forEach { it?.let { m -> engine.destroyMaterialInstance(m) } }
        engine.destroyMaterialInstance(wireInstance)
        engine.destroyMaterial(material)
        skybox?.let { engine.destroySkybox(it) }
        engine.destroy()
    }

    private fun updateCamera() {
        val ce = kotlin.math.cos(elevation)
        val eyeX = distance * ce * kotlin.math.sin(azimuth)
        val eyeY = distance * kotlin.math.sin(elevation)
        val eyeZ = distance * ce * kotlin.math.cos(azimuth)
        camera.lookAt(
            eyeX.toDouble(), eyeY.toDouble(), eyeZ.toDouble(),
            0.0, 0.0, 0.0,
            0.0, 1.0, 0.0
        )
    }

    private fun setupView() {
        skybox = Skybox.Builder()
            .color(0.10f, 0.10f, 0.12f, 1.0f)
            .build(engine)
        scene.skybox = skybox
        view.camera = camera
        view.scene = scene
    }

    private fun setupScene() {
        createMaterials()
        createMesh()
        createWireMesh()

        cubeEntity = EntityManager.get().create()
        val rb = RenderableManager.Builder(6)
            .boundingBox(Box(0.0f, 0.0f, 0.0f, 1.5f, 1.5f, 1.5f))
        for (face in 0 until 6) {
            rb.geometry(face, RenderableManager.PrimitiveType.TRIANGLES,
                vertexBuffer, indexBuffer, face * 6, 6)
              .material(face, faceMaterials[face]!!)
        }
        rb.build(engine, cubeEntity)
        scene.addEntity(cubeEntity)

        // Wireframe overlay: 12 aristas del cubo como líneas.
        wireEntity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(Box(0.0f, 0.0f, 0.0f, 1.5f, 1.5f, 1.5f))
            .geometry(0, RenderableManager.PrimitiveType.LINES,
                wireVertexBuffer, wireIndexBuffer, 0, 24)
            .material(0, wireInstance)
            .build(engine, wireEntity)
        scene.addEntity(wireEntity)

        camera.setExposure(16.0f, 1.0f / 125.0f, 100.0f)
        updateCamera()
    }

    private fun createMaterials() {
        // Material unlit para que las caras se vean siempre de su color, sin sombras.
        val payload = readAsset("materials/unlit.filamat")
        material = Material.Builder().payload(payload, payload.remaining()).build(engine)

        // 6 colores para diferenciar las 6 caras.
        // -Z (atrás), +Z (frente), -X (izq), +X (der), -Y (abajo), +Y (arriba)
        val colors = arrayOf(
            floatArrayOf(0.85f, 0.30f, 0.30f),  // -Z  rojo
            floatArrayOf(0.30f, 0.85f, 0.30f),  // +Z  verde
            floatArrayOf(0.30f, 0.30f, 0.85f),  // -X  azul
            floatArrayOf(0.85f, 0.85f, 0.30f),  // +X  amarillo
            floatArrayOf(0.85f, 0.30f, 0.85f),  // -Y  magenta
            floatArrayOf(0.30f, 0.85f, 0.85f),  // +Y  cian
        )
        for (i in 0 until 6) {
            val mi = material.createInstance()
            mi.setParameter("color", colors[i][0], colors[i][1], colors[i][2], 1.0f)
            faceMaterials[i] = mi
        }

        // Material sin iluminación para wireframe (color negro puro).
        wireMaterial = material
        wireInstance = wireMaterial.createInstance()
        wireInstance.setParameter("color", 0.0f, 0.0f, 0.0f, 1.0f)
    }

    private fun createMesh() {
        val vertexSize = 3 * 4  // solo posición
        val vertexCount = 24
        val vbuf = ByteBuffer.allocate(vertexCount * vertexSize).order(ByteOrder.nativeOrder())

        fun put(x: Float, y: Float, z: Float) {
            vbuf.putFloat(x); vbuf.putFloat(y); vbuf.putFloat(z)
        }
        // Vértices en orden CCW visto desde fuera (Filament: CCW = front por defecto).
        // -Z (atrás) — normal hacia -Z
        put(-1f, -1f, -1f); put( 1f, -1f, -1f); put( 1f,  1f, -1f); put(-1f,  1f, -1f)
        // +Z (frente) — normal hacia +Z
        put(-1f, -1f,  1f); put(-1f,  1f,  1f); put( 1f,  1f,  1f); put( 1f, -1f,  1f)
        // -X (izquierda) — normal hacia -X
        put(-1f, -1f, -1f); put(-1f,  1f, -1f); put(-1f,  1f,  1f); put(-1f, -1f,  1f)
        // +X (derecha) — normal hacia +X
        put( 1f, -1f,  1f); put( 1f,  1f,  1f); put( 1f,  1f, -1f); put( 1f, -1f, -1f)
        // -Y (abajo) — normal hacia -Y
        put(-1f, -1f, -1f); put(-1f, -1f,  1f); put( 1f, -1f,  1f); put( 1f, -1f, -1f)
        // +Y (arriba) — normal hacia +Y
        put(-1f,  1f, -1f); put( 1f,  1f, -1f); put( 1f,  1f,  1f); put(-1f,  1f,  1f)

        vbuf.flip()

        vertexBuffer = VertexBuffer.Builder()
            .bufferCount(1)
            .vertexCount(vertexCount)
            .attribute(VertexBuffer.VertexAttribute.POSITION, 0,
                VertexBuffer.AttributeType.FLOAT3, 0, vertexSize)
            .build(engine)
        vertexBuffer.setBufferAt(engine, 0, vbuf)

        val ibuf = ByteBuffer.allocate(36 * 2).order(ByteOrder.nativeOrder())
        for (i in 0 until 6) {
            val o = (i * 4).toShort()
            // CCW estándar: (0, 1, 2) + (0, 2, 3)
            ibuf.putShort(o); ibuf.putShort((o + 2).toShort()); ibuf.putShort((o + 1).toShort())
            ibuf.putShort(o); ibuf.putShort((o + 3).toShort()); ibuf.putShort((o + 2).toShort())
        }
        ibuf.flip()
        indexBuffer = IndexBuffer.Builder()
            .indexCount(36)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)
        indexBuffer.setBuffer(engine, ibuf)
    }

    private fun createWireMesh() {
        // 8 vértices del cubo + 24 índices (12 aristas × 2).
        val verts = floatArrayOf(
            -1f, -1f, -1f,
             1f, -1f, -1f,
             1f,  1f, -1f,
            -1f,  1f, -1f,
            -1f, -1f,  1f,
             1f, -1f,  1f,
             1f,  1f,  1f,
            -1f,  1f,  1f,
        )
        val vbuf = ByteBuffer.allocate(verts.size * 4).order(ByteOrder.nativeOrder())
        verts.forEach { vbuf.putFloat(it) }
        vbuf.flip()

        wireVertexBuffer = VertexBuffer.Builder()
            .bufferCount(1)
            .vertexCount(8)
            .attribute(VertexBuffer.VertexAttribute.POSITION, 0,
                VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .build(engine)
        wireVertexBuffer.setBufferAt(engine, 0, vbuf)

        // 12 aristas del cubo, cada una como 2 índices (LINES).
        val edges = shortArrayOf(
            // -Z square
            0, 1,  1, 2,  2, 3,  3, 0,
            // +Z square
            4, 5,  5, 6,  6, 7,  7, 4,
            // conectores
            0, 4,  1, 5,  2, 6,  3, 7,
        )
        val ibuf = ByteBuffer.allocate(edges.size * 2).order(ByteOrder.nativeOrder())
        edges.forEach { ibuf.putShort(it) }
        ibuf.flip()
        wireIndexBuffer = IndexBuffer.Builder()
            .indexCount(24)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)
        wireIndexBuffer.setBuffer(engine, ibuf)
    }

    private fun readAsset(name: String): ByteBuffer {
        val bytes = context.assets.open(name).use { it.readBytes() }
        return ByteBuffer.allocateDirect(bytes.size)
            .order(ByteOrder.nativeOrder())
            .put(bytes).also { it.flip() }
    }

    private inner class SurfaceCallback : UiHelper.RendererCallback {
        override fun onNativeWindowChanged(surface: Surface) {
            swapChain?.let { engine.destroySwapChain(it) }
            swapChain = engine.createSwapChain(surface)
            surfaceView?.display?.let { displayHelper.attach(renderer, it) }
        }
        override fun onDetachedFromSurface() {
            swapChain?.let { engine.destroySwapChain(it); swapChain = null }
        }
        override fun onResized(width: Int, height: Int) {
            view.viewport = com.google.android.filament.Viewport(0, 0, width, height)
            val aspect = width.toDouble() / height.toDouble()
            camera.setProjection(45.0, aspect, 0.1, 100.0, Camera.Fov.VERTICAL)
        }
    }

    private inner class FrameCallback : ChoreographerHelper() {
        override fun onFrame(frameTimeNanos: Long) {
            val sc = swapChain ?: return
            if (uiHelper.isReadyToRender) {
                if (renderer.beginFrame(sc, frameTimeNanos)) {
                    renderer.render(view)
                    renderer.endFrame()
                }
            }
        }
    }
}
