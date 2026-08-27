package com.signai.app.render

import android.content.Context
import com.google.android.filament.Engine
import com.google.android.filament.gltfio.FilamentAsset
import com.google.android.filament.utils.ModelViewer
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Carga un GLB desde assets y lo añade al ModelViewer.
 *
 * Devuelve un `AvatarScene` con los bones accesibles por nombre.
 */
class AvatarLoader(private val context: Context) {

    fun loadAvatar(modelViewer: ModelViewer, assetName: String = "test_avatar.glb"): AvatarScene? {
        val bytes = context.assets.open(assetName).use { it.readBytes() }
        val buffer = ByteBuffer.allocateDirect(bytes.size)
            .order(ByteOrder.nativeOrder())
            .put(bytes)
            .also { it.flip() }

        // loadModelGlb destruye el modelo anterior y carga el nuevo.
        modelViewer.loadModelGlb(buffer)

        val asset: FilamentAsset = modelViewer.asset ?: run {
            android.util.Log.w("AvatarLoader", "asset is null after loadModelGlb")
            return null
        }

        // Cámara explícita mirando al origen desde lejos — cube centrado en origen.
        modelViewer.camera.lookAt(
            15.0, 12.0, 15.0,
            0.0, 0.0, 0.0,
            0.0, 1.0, 0.0
        )

        val bones = collectBones(modelViewer.engine, asset)
        return AvatarScene(asset, modelViewer.scene, bones)
    }

    private fun collectBones(engine: Engine, asset: FilamentAsset): Map<String, AvatarBone> {
        val tm = engine.transformManager
        val result = HashMap<String, AvatarBone>()
        for (entity in asset.entities) {
            if (!tm.hasComponent(entity)) continue
            val instance = tm.getInstance(entity)
            val localMatrix = FloatArray(16)
            tm.getTransform(instance, localMatrix)
            val worldMatrix = FloatArray(16)
            tm.getWorldTransform(instance, worldMatrix)
            val name = asset.getName(entity)
            result[name] = AvatarBone(
                entity = entity,
                transformInstance = instance,
                worldMatrix = worldMatrix,
                localMatrix = localMatrix,
                name = name
            )
        }
        return result
    }
}

data class AvatarBone(
    val entity: Int,
    val transformInstance: Int,
    val name: String,
    var worldMatrix: FloatArray,
    var localMatrix: FloatArray
)

class AvatarScene(
    val asset: FilamentAsset,
    val scene: com.google.android.filament.Scene,
    val bones: Map<String, AvatarBone>
)
