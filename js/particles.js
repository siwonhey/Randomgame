import * as THREE from 'three';
import { cryptoRandom } from './config.js';
import { scene } from './scene.js';

const particles = [];
const particleGeo = new THREE.SphereGeometry(0.02, 4, 4);

export function spawnParticles(x, z, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(particleGeo, mat);
    mesh.position.set(x, 0.15, z);
    const angle = cryptoRandom() * Math.PI * 2;
    const speed = 0.02 + cryptoRandom() * 0.08;
    scene.add(mesh);
    particles.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vy: 0.015 + cryptoRandom() * 0.05,
      vz: Math.sin(angle) * speed,
      life: 1.0,
      decay: 0.02 + cryptoRandom() * 0.03,
    });
  }
}

export function spawnTrail(x, z, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 });
  const mesh = new THREE.Mesh(particleGeo, mat);
  mesh.position.set(x, 0.05, z);
  scene.add(mesh);
  particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0.5, decay: 0.025 });
}

export function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.vy -= 0.001;
    p.life -= p.decay;
    p.mesh.material.opacity = Math.max(0, p.life);
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

export function clearParticles() {
  particles.forEach(p => {
    scene.remove(p.mesh);
    p.mesh.material.dispose();
  });
  particles.length = 0;
}
