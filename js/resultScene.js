// ═══════════════════════════════════════════
// RESULT SCENE — isolated three.js view for the winner's 3D model
// Clones the winner top into a dedicated canvas inside the result overlay,
// spins it fast on Y (like a real top) while the camera orbits slowly.
// ═══════════════════════════════════════════
import * as THREE from 'three';
import { createTop3D } from './tops.js';

const SIZE = 320;  // square viewport (px)

const container = document.getElementById('result-3d');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(SIZE, SIZE);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(3, 5, 3);
scene.add(key);
const rim = new THREE.DirectionalLight(0x88bbff, 0.4);
rim.position.set(-2, 2, -3);
scene.add(rim);

let winnerMesh = null;
let spinAngle = 0;
let orbitAngle = 0;
let active = false;

function disposeMesh(obj) {
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

export function showWinner(winner) {
  if (winnerMesh) {
    scene.remove(winnerMesh);
    disposeMesh(winnerMesh);
    winnerMesh = null;
  }
  winnerMesh = createTop3D(winner.color);
  winnerMesh.position.set(0, -0.3, 0);
  scene.add(winnerMesh);
  spinAngle = 0;
  orbitAngle = 0;
  active = true;
}

export function hideWinner() {
  active = false;
  if (winnerMesh) {
    scene.remove(winnerMesh);
    disposeMesh(winnerMesh);
    winnerMesh = null;
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (!active || !winnerMesh) return;

  spinAngle += 0.05;       // fast top-spin
  orbitAngle += 0.008;     // slow camera orbit

  winnerMesh.rotation.y = spinAngle;

  const R = 4.2;
  camera.position.set(
    Math.sin(orbitAngle) * R,
    1.8,
    Math.cos(orbitAngle) * R,
  );
  camera.lookAt(0, 0.6, 0);

  renderer.render(scene, camera);
}
animate();
