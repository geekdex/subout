<template>
  <div class="login-bg-container">
    <canvas ref="canvasRef" class="login-bg-canvas"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";

const props = defineProps({
  isDark: {
    type: Boolean,
    default: true,
  },
});

const canvasRef = ref(null);
let ctx = null;
let animationFrameId = null;

// 3D Particles Configuration
const particleCount = 120;
const focalLength = 320;
const maxConnectionDist = 200;
const particles = [];
let tick = 0;

// Initialize particles with 3D positions and movement directions
const initParticles = () => {
  particles.length = 0;
  for (let i = 0; i < particleCount; i++) {
    const isBokeh = Math.random() > 0.72; // 28% soft bokeh circles, 72% small node points
    particles.push({
      x: (Math.random() - 0.5) * 1600, // Wide spread in horizontal space
      y: (Math.random() - 0.5) * 1000, // Vertical space spread
      z: (Math.random() - 0.5) * 900, // Depth space spread
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      vz: (Math.random() - 0.5) * 0.25,
      radius: isBokeh ? 6.0 + Math.random() * 7.5 : 1.8 + Math.random() * 2.0,
      baseOpacity: isBokeh
        ? 0.13 + Math.random() * 0.2
        : 0.35 + Math.random() * 0.45,
      type: isBokeh ? "bokeh" : "node",
      phase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.008 + Math.random() * 0.018,
      // Color variety: 75% main theme colors, 25% accent gold/amber colors
      colorType:
        Math.random() > 0.75 ? "accent" : Math.random() > 0.5 ? "cyan" : "main",
    });
  }
};

// Mouse movement state for parallax rotations
const mouse = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
};

const handleMouseMove = (e) => {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  mouse.targetX = (e.clientX - centerX) / centerX; // Range: -1 to 1
  mouse.targetY = (e.clientY - centerY) / centerY; // Range: -1 to 1
};

const handleMouseLeave = () => {
  mouse.targetX = 0;
  mouse.targetY = 0;
};

const resizeCanvas = () => {
  if (!canvasRef.value) return;
  const canvas = canvasRef.value;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};

// Sharp-peak ridged mountain wave formula
const getMountainY = (x, layer, width, height, time, mouseX, mouseY) => {
  // Parallax offsets: Closer layers shift more with the cursor
  const parallaxX = mouseX * (layer + 1) * 22;
  const parallaxY = mouseY * (layer + 1) * 9;

  // Base parameters for each of the 4 layers (Far to Near)
  const baseHeights = [0.44, 0.29, 0.16, 0.07]; // height ratio from bottom
  const amplitudes = [95, 68, 44, 25]; // wave height peak-to-valley
  const speeds = [0.0006, 0.0012, 0.0022, 0.0035]; // speed of left-to-right drift (slowed down for majesty)
  const frequencies = [0.0011, 0.0024, 0.0048, 0.0085]; // mountain peak width density

  const baselineY = height - height * baseHeights[layer] + parallaxY;

  // Input coordinate with time-based drift and parallax shift
  const px = x + parallaxX + time * speeds[layer] * 120;

  // Multi-frequency wave calculation for natural, rugged peaks
  // (1 - abs(sin(x))) creates a pointed ridged effect
  const peakWave =
    (1 - Math.abs(Math.sin(px * frequencies[layer]))) * amplitudes[layer];
  const secondaryWave =
    Math.cos(px * frequencies[layer] * 2.3 + 1.2) * (amplitudes[layer] * 0.35);
  const detailWave =
    Math.sin(px * frequencies[layer] * 5.1 - 0.7) * (amplitudes[layer] * 0.12);

  return baselineY - (peakWave + secondaryWave + detailWave);
};

// Canvas animation render loop
const loop = () => {
  if (!ctx || !canvasRef.value) return;

  const canvas = canvasRef.value;
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;

  // Clear screen
  ctx.clearRect(0, 0, width, height);
  tick++;

  // Dampen/smooth mouse parallax coordinates
  mouse.x += (mouse.targetX - mouse.x) * 0.045;
  mouse.y += (mouse.targetY - mouse.y) * 0.045;

  const isDarkVal = props.isDark;

  // Dynamic Theme Colors
  const rgbMain = isDarkVal ? "99, 102, 241" : "79, 70, 229"; // Indigo
  const rgbCyan = isDarkVal ? "34, 211, 238" : "8, 145, 178"; // Cyan
  const rgbAccent = isDarkVal ? "251, 191, 36" : "217, 119, 6"; // Amber

  // 1. Draw Mouse Glow Aura (Back Layer)
  if (mouse.x !== 0 || mouse.y !== 0) {
    const mx = centerX + mouse.x * centerX;
    const my = centerY + mouse.y * centerY;
    const glowRadius = Math.max(width, height) * 0.28;

    const mouseGlow = ctx.createRadialGradient(mx, my, 0, mx, my, glowRadius);
    const glowColor = isDarkVal ? "99, 102, 241" : "224, 231, 255";
    mouseGlow.addColorStop(0, `rgba(${glowColor}, ${isDarkVal ? 0.09 : 0.07})`);
    mouseGlow.addColorStop(
      0.5,
      `rgba(${glowColor}, ${isDarkVal ? 0.03 : 0.02})`,
    );
    mouseGlow.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = mouseGlow;
    ctx.beginPath();
    ctx.arc(mx, my, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. 3D Camera Rotation Matrix (Pitch & Yaw)
  const rotY = mouse.x * 0.24; // Yaw rotation around Y axis
  const rotX = -mouse.y * 0.14; // Pitch rotation around X axis

  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);

  const projected = [];

  // Update particles and project in 3D perspective
  for (let i = 0; i < particleCount; i++) {
    const p = particles[i];

    // Slow drifting movement
    p.x += p.vx;
    p.y += p.vy;
    p.z += p.vz;

    // Wrap particles inside box boundaries
    if (p.x < -850) p.x = 850;
    if (p.x > 850) p.x = -850;
    if (p.y < -550) p.y = 550;
    if (p.y > 550) p.y = -550;
    if (p.z < -450) p.z = 450;
    if (p.z > 450) p.z = -450;

    // Camera space rotations
    // Yaw (Around Y-axis)
    const rx1 = p.x * cosY - p.z * sinY;
    const rz1 = p.x * sinY + p.z * cosY;

    // Pitch (Around X-axis)
    const ry2 = p.y * cosX - rz1 * sinX;
    const rz2 = p.y * sinX + rz1 * cosX;

    // 3D Perspective Projection
    const cameraDistance = 900;
    const scale = focalLength / (cameraDistance + rz2);
    const screenX = centerX + rx1 * scale;
    const screenY = centerY + ry2 * scale;

    // Breathing breathing effect (opacity fluctuation)
    const breathing = Math.sin(tick * p.pulseSpeed + p.phase) * 0.22 + 0.78;
    const opacity = p.baseOpacity * breathing;

    projected.push({
      x: screenX,
      y: screenY,
      z: rz2,
      scale: scale,
      opacity: opacity,
      radius: p.radius * scale,
      type: p.type,
      colorType: p.colorType,
      raw: p,
    });
  }

  // Draw node connection lines (plexus effect - made more visible)
  const lineOpacityFactor = isDarkVal ? 0.32 : 0.22;
  for (let i = 0; i < particleCount; i++) {
    const p1 = projected[i];
    if (p1.type !== "node") continue;

    let lineCount = 0;
    for (let j = i + 1; j < particleCount; j++) {
      const p2 = projected[j];
      if (p2.type !== "node") continue;
      if (lineCount >= 2) break; // Limit mesh density

      // Distance calculation in raw 3D space
      const dx = p1.raw.x - p2.raw.x;
      const dy = p1.raw.y - p2.raw.y;
      const dz = p1.raw.z - p2.raw.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < maxConnectionDist) {
        const distFactor = 1 - dist / maxConnectionDist;
        const avgZ = (p1.z + p2.z) / 2;
        // Fade out lines deep in the background
        const depthFactor = Math.max(0, Math.min(1, (750 - avgZ) / 1200));
        const opacity =
          distFactor *
          lineOpacityFactor *
          depthFactor *
          Math.min(p1.opacity, p2.opacity);

        if (opacity > 0.005) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(${rgbMain}, ${opacity})`;
          ctx.lineWidth = 0.55 * ((p1.scale + p2.scale) / 2);
          ctx.stroke();
          lineCount++;
        }
      }
    }
  }

  // Sort projected coordinates by depth (Painter's algorithm: draw background first)
  const sortedIndices = Array.from({ length: particleCount }, (_, i) => i);
  sortedIndices.sort((a, b) => projected[b].z - projected[a].z);

  // Render particles
  for (let k = 0; k < particleCount; k++) {
    const idx = sortedIndices[k];
    const p = projected[idx];

    // Skip drawing if particle is completely off-screen
    if (p.x < -50 || p.x > width + 50 || p.y < -50 || p.y > height + 50)
      continue;

    const baseRGB =
      p.colorType === "accent"
        ? rgbAccent
        : p.colorType === "cyan"
          ? rgbCyan
          : rgbMain;

    if (p.type === "bokeh") {
      // Soft glowing circular shapes
      const radialGrad = ctx.createRadialGradient(
        p.x,
        p.y,
        0,
        p.x,
        p.y,
        p.radius,
      );
      radialGrad.addColorStop(0, `rgba(${baseRGB}, ${p.opacity})`);
      radialGrad.addColorStop(0.4, `rgba(${baseRGB}, ${p.opacity * 0.3})`);
      radialGrad.addColorStop(1, `rgba(${baseRGB}, 0)`);

      ctx.fillStyle = radialGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Crisp glowing node particles
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${baseRGB}, ${p.opacity})`;
      ctx.fill();

      // Outer halo/glow for foreground particles
      if (p.z < 150 && p.radius > 1.3) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 3.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${baseRGB}, ${p.opacity * 0.16})`;
        ctx.fill();
      }
    }
  }

  // 3. Draw Undulating Mountain Ridges (Layered Bottom Silhouette - made more subtle/faint)
  const ridgeColors = isDarkVal
    ? [
        ["rgba(15, 17, 36, 0.12)", "rgba(9, 10, 22, 0.20)"], // Far Ridge Layer
        ["rgba(21, 22, 48, 0.22)", "rgba(9, 10, 22, 0.35)"], // Mid-Far Ridge Layer
        ["rgba(25, 24, 60, 0.35)", "rgba(6, 7, 16, 0.55)"], // Mid-Near Ridge Layer
        ["rgba(14, 12, 36, 0.55)", "rgba(6, 7, 16, 0.75)"], // Near Ridge Layer
      ]
    : [
        ["rgba(165, 243, 252, 0.15)", "rgba(248, 250, 252, 0.10)"],
        ["rgba(147, 197, 253, 0.24)", "rgba(248, 250, 252, 0.20)"],
        ["rgba(129, 140, 248, 0.34)", "rgba(248, 250, 252, 0.38)"],
        ["rgba(99, 102, 241, 0.44)", "rgba(248, 250, 252, 0.65)"],
      ];

  const ridgeStrokeColors = isDarkVal
    ? [
        "49, 196, 219", // Cyan Accent
        "99, 102, 241", // Indigo
        "139, 92, 246", // Violet
        "34, 211, 238", // Cyan Highlight
      ]
    : [
        "103, 232, 249", // Cyan 300
        "147, 197, 253", // Blue 300
        "129, 140, 248", // Indigo 300
        "79, 70, 229", // Indigo 600
      ];

  const drawRidge = (layerIndex) => {
    ctx.beginPath();
    ctx.moveTo(0, height);

    // Collect coordinates along the width
    const step = 6;
    for (let x = 0; x <= width; x += step) {
      const y = getMountainY(
        x,
        layerIndex,
        width,
        height,
        tick,
        mouse.x,
        mouse.y,
      );
      if (x === 0) {
        ctx.lineTo(0, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.lineTo(width, height);
    ctx.closePath();

    // Fill Ridge Gradient
    const colors = ridgeColors[layerIndex];
    const fillGradient = ctx.createLinearGradient(0, height - 300, 0, height);
    fillGradient.addColorStop(0, colors[0]);
    fillGradient.addColorStop(1, colors[1]);

    ctx.fillStyle = fillGradient;
    ctx.fill();

    // Draw glowing ridge stroke highlight
    ctx.beginPath();
    let first = true;
    for (let x = 0; x <= width; x += step) {
      const y = getMountainY(
        x,
        layerIndex,
        width,
        height,
        tick,
        mouse.x,
        mouse.y,
      );
      if (first) {
        ctx.moveTo(0, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }

    // Horizontal linear gradient to fade out stroke edges elegantly
    const strokeGrad = ctx.createLinearGradient(0, 0, width, 0);
    const mainStrokeColor = ridgeStrokeColors[layerIndex];
    strokeGrad.addColorStop(0, `rgba(${mainStrokeColor}, 0.02)`);
    strokeGrad.addColorStop(0.2, `rgba(${mainStrokeColor}, 0.28)`);
    strokeGrad.addColorStop(0.5, `rgba(${mainStrokeColor}, 0.45)`);
    strokeGrad.addColorStop(0.8, `rgba(${mainStrokeColor}, 0.28)`);
    strokeGrad.addColorStop(1, `rgba(${mainStrokeColor}, 0.02)`);

    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = [0.8, 1.1, 1.4, 1.8][layerIndex];
    ctx.stroke();
  };

  // Draw 4 layers of ridges (Back-to-Front)
  drawRidge(0);
  drawRidge(1);
  drawRidge(2);
  drawRidge(3);

  animationFrameId = requestAnimationFrame(loop);
};

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  ctx = canvas.getContext("2d");
  resizeCanvas();
  initParticles();

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseleave", handleMouseLeave);

  loop();
});

onUnmounted(() => {
  window.removeEventListener("resize", resizeCanvas);
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseleave", handleMouseLeave);
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
});

// Re-initialize particles when viewport size changes to distribute them optimally
watch(
  () => canvasRef.value?.width,
  () => {
    initParticles();
  },
);
</script>

<style scoped>
.login-bg-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 1;
  pointer-events: none;
}

.login-bg-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
