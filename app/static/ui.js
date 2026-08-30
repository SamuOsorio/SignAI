import { state } from "./state.js";
import { startAnim, pauseAnim, resetAnim } from "./animation.js";
import { initHandFilters } from "./filters.js";

const video  = document.getElementById("video");
const select = document.getElementById("sign-select");

export function setStatus(msg, type) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className   = `status ${type ?? ""}`;
}

export async function loadSign(signId) {
  resetAnim();
  setStatus("Cargando landmarks...", "");
  try {
    const data = await fetch(`/api/landmarks/${signId}`).then(r => r.json());
    state.frames   = data.frames ?? [];
    state.fps      = data.fps ?? 30;
    state.frameIdx = 0;
    initHandFilters();
    state.lastGoodHandLms = { Left: null, Right: null };

    const rate = Math.round((data.detection_rate ?? 0) * 100);
    document.getElementById("avatar-meta").innerHTML =
      `${data.total_frames} frames · <span class="badge ${rate >= 95 ? 'green' : 'yellow'}">${rate}% detección</span>`;

    video.src = `/api/video/${signId}`;
    video.load();
    const [s, r, a] = signId.split("_");
    document.getElementById("video-meta").textContent = `seña ${s} · rep ${r} · ángulo ${a}`;
    setStatus(`Seña ${signId} lista — presiona Reproducir`, "ok");
  } catch (err) {
    setStatus(`Error: ${err.message}`, "err");
  }
}

// ── Selector de señas ─────────────────────────────────────────────────────────
fetch("/api/signs").then(r => r.json()).then(signs => {
  const bySign = {};
  for (const s of signs) {
    const n = parseInt(s.sign);
    (bySign[n] ??= []).push(s);
  }
  for (const n of Object.keys(bySign).sort((a, b) => a - b)) {
    const g = document.createElement("optgroup");
    g.label = `Seña ${n}`;
    for (const s of bySign[n]) {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = `Rep ${parseInt(s.rep)} · Ángulo ${parseInt(s.angle)}`;
      g.appendChild(o);
    }
    select.appendChild(g);
  }
  if (signs.length) loadSign(signs[0].id);
  setStatus(`${signs.length} videos LSC50 disponibles`, "ok");
}).catch(() => setStatus("Error al obtener señas", "err"));

select.addEventListener("change", () => { if (select.value) loadSign(select.value); });

// ── Botones de control ────────────────────────────────────────────────────────
document.getElementById("btn-play").addEventListener("click", () =>
  state.playing ? pauseAnim() : startAnim());
document.getElementById("btn-reset").addEventListener("click", resetAnim);
