import * as THREE from 'three';

export const gameArea = document.getElementById('game-area');

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);

export const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
gameArea.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

export const spotLight = new THREE.SpotLight(0x00BFFF, 0, 20, Math.PI / 6, 0.5);
spotLight.position.set(0, 10, 0);
scene.add(spotLight);

export const flashLight = new THREE.PointLight(0xffffff, 0, 5);
flashLight.position.y = 0.5;
scene.add(flashLight);

export function onResize() {
  const w = gameArea.clientWidth;
  const h = gameArea.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);
