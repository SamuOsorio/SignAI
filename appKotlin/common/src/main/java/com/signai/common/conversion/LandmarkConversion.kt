package com.signai.common.conversion

import com.signai.common.math.Vec3

/**
 * Puerto de app.js:
 *   `lmDir(a, b) = (b.x - a.x, -(b.y - a.y), -(b.z - a.z))`
 *
 * Convención de ejes image → world:
 * - image-x → +X
 * - image-y (0 arriba) → -Y
 * - image-z → -Z
 */
fun lmDir(a: Vec3, b: Vec3): Vec3 =
    Vec3(b.x - a.x, -(b.y - a.y), -(b.z - a.z))

/**
 * Puerto de app.js `mpToThree(lm, wrist)`:
 * Vector de un landmark relativo a la muñeca, ya en convención world.
 */
fun mpToThree(lm: Vec3, wrist: Vec3): Vec3 =
    Vec3(lm.x - wrist.x, -(lm.y - wrist.y), -(lm.z - wrist.z))
