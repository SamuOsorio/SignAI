package com.signai.data.parser

import com.signai.common.constants.LandmarkConstants.BODY_LANDMARK_COUNT
import com.signai.common.constants.LandmarkConstants.FACE_KEY_LMS
import com.signai.common.constants.LandmarkConstants.HAND_LANDMARK_COUNT
import com.signai.domain.model.BodyFrame
import com.signai.domain.model.FaceFrame
import com.signai.domain.model.HandSide
import com.signai.domain.model.Frame
import com.signai.domain.model.HandFrame
import com.signai.domain.model.Landmark
import com.signai.domain.model.SignLandmarks

/**
 * Parser de CSVs de LSC50. Produce un `SignLandmarks` con todos los frames
 * alineados a la duración de BODY (que tiene menos o igual número que FACE).
 *
 * Formato CSV:
 *   ,landmark_0_x,landmark_0_y,landmark_0_z,landmark_1_x,...
 *   0,0.521,0.434,-0.290,...
 *
 * Cada CSV tiene UN frame por fila.
 *
 * Bug 3 fix (sincronización de face): FACE viene de video a 50fps; BODY/HANDS de
 * video a 24fps. Calculamos `face_ratio = len_face / len_body` y muestreamos
 * face con `round(i * face_ratio)` para que cada frame de body tenga su par
 * de cara correspondiente.
 */
class CsvLandmarksParser {

    fun parse(
        stem: String,
        leftHandCsv: List<String>?,
        rightHandCsv: List<String>?,
        bodyCsv: List<String>?,
        faceCsv: List<String>?
    ): SignLandmarks? {
        val leftFrames = parseHandCsv(leftHandCsv, HandSide.Left)
        val rightFrames = parseHandCsv(rightHandCsv, HandSide.Right)
        val bodyFrames = parseBodyCsv(bodyCsv)
        val faceFrames = parseFaceCsv(faceCsv)

        val n = maxOf(
            leftFrames.size,
            rightFrames.size,
            bodyFrames.size
        )
        if (n == 0) return null

        // Sincronización face → body (Bug 3 fix).
        val faceRatio = if (bodyFrames.isEmpty()) 1.0 else
            faceFrames.size.toDouble() / bodyFrames.size

        val frames = ArrayList<Frame>(n)
        for (i in 0 until n) {
            val hands = mutableListOf<HandFrame>()
            if (i < leftFrames.size) hands += leftFrames[i]
            if (i < rightFrames.size) hands += rightFrames[i]

            val body = if (i < bodyFrames.size) bodyFrames[i] else null
            val face = faceFrames.getOrNull((i * faceRatio).toInt().coerceAtMost(faceFrames.lastIndex))

            frames += Frame(
                hands = hands,
                body = body,
                face = face
            )
        }

        val framesWithHand = frames.count { it.hands.isNotEmpty() }
        val detectionRate = if (frames.isEmpty()) 0f else
            framesWithHand.toFloat() / frames.size

        return SignLandmarks(
            stem = stem,
            fps = 30,
            totalFrames = frames.size,
            framesWithHand = framesWithHand,
            detectionRate = detectionRate,
            source = "lsc50",
            frames = frames
        )
    }

    private fun parseHandCsv(csv: List<String>?, side: HandSide): List<HandFrame> {
        if (csv.isNullOrEmpty()) return emptyList()
        return csv.asSequence()
            .filter { it.isNotBlank() }
            .map { rowToTriples(it, HAND_LANDMARK_COUNT) }
            .filter { it.size == HAND_LANDMARK_COUNT }
            .map { HandFrame(side, it) }
            .toList()
    }

    private fun parseBodyCsv(csv: List<String>?): List<BodyFrame> {
        if (csv.isNullOrEmpty()) return emptyList()
        return csv.asSequence()
            .filter { it.isNotBlank() }
            .map { rowToTriples(it, BODY_LANDMARK_COUNT) }
            .filter { it.size == BODY_LANDMARK_COUNT }
            .map { BodyFrame(it) }
            .toList()
    }

    private fun parseFaceCsv(csv: List<String>?): List<FaceFrame> {
        if (csv.isNullOrEmpty()) return emptyList()
        return csv.asSequence()
            .filter { it.isNotBlank() }
            .map { rowToFaceMap(it) }
            .filter { it.isNotEmpty() }
            .map { FaceFrame(it) }
            .toList()
    }

    /**
     * Lee una fila CSV con `count * 3` columnas landmark_x_y_z después del índice
     * de fila y devuelve `count` triples (x, y, z).
     * Ignora la primera celda (índice de fila).
     */
    private fun rowToTriples(row: String, count: Int): List<Landmark> {
        val cols = row.split(",")
        if (cols.size < 1 + count * 3) return emptyList()
        val out = ArrayList<Landmark>(count)
        val cells = cols.drop(1) // skip frame index
        for (i in 0 until count) {
            val base = i * 3
            val x = cells[base].toFloatOrNull() ?: 0f
            val y = cells[base + 1].toFloatOrNull() ?: 0f
            val z = cells[base + 2].toFloatOrNull() ?: 0f
            out += Landmark(x, y, z)
        }
        return out
    }

    /**
     * Para face: extrae SOLO los landmarks en FACE_KEY_LMS para no leer 1405
     * columnas inútiles (468 * 3).
     */
    private fun rowToFaceMap(row: String): Map<Int, Landmark> {
        val cols = row.split(",")
        if (cols.size < 2) return emptyMap()
        val cells = cols.drop(1)
        val out = HashMap<Int, Landmark>(FACE_KEY_LMS.size)
        for (lm in FACE_KEY_LMS) {
            val base = lm * 3
            if (base + 2 >= cells.size) continue
            val x = cells[base].toFloatOrNull() ?: continue
            val y = cells[base + 1].toFloatOrNull() ?: continue
            val z = cells[base + 2].toFloatOrNull() ?: continue
            out[lm] = Landmark(x, y, z)
        }
        return out
    }
}
