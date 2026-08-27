package com.signai.domain.model

/** Identificador de mano: izquierda o derecha. */
enum class HandSide { Left, Right }

/**
 * Landmarks de UNA mano en un frame concreto. Siempre 21 puntos (MediaPipe Hands).
 */
data class HandFrame(val side: HandSide, val landmarks: List<Landmark>)

/**
 * Pose del cuerpo en un frame. 33 landmarks (MediaPipe Pose).
 * Acceso directo por índice: `body.landmarks[11]` = hombro izquierdo.
 */
data class BodyFrame(val landmarks: List<Landmark>)

/**
 * Landmarks clave de cara (ver FACE_KEY_LMS). El mapa indexa por id FaceMesh.
 */
data class FaceFrame(val landmarks: Map<Int, Landmark>)

/**
 * Frame completo: cero o dos manos + body + face opcional.
 *
 * Nota (Bug 3): FACE viene del video a 50fps y BODY/HANDS a 24fps.
 * Para sincronización, el consumer debe mapear el índice de frame al de face
 * con un factor ≈ 50/24. El data layer ya sincroniza al construir SignLandmarks.
 */
data class Frame(
    val hands: List<HandFrame>,
    val body: BodyFrame?,
    val face: FaceFrame?
)
