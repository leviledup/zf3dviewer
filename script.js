import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Setup WebGL Renderer, Scene, and Camera
const container = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f0f12);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lights & Grid Helper
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const grid = new THREE.GridHelper(20, 20, 0x2a2a35, 0x1a1a22);
scene.add(grid);

let currentMesh = null;

// UI Elements
const statusEl = document.getElementById('status');
const vertexCountEl = document.getElementById('vertexCount');
const faceCountEl = document.getElementById('faceCount');
const wireframeToggle = document.getElementById('wireframeToggle');
const autoRotateToggle = document.getElementById('autoRotateToggle');
const resetCamBtn = document.getElementById('resetCamBtn');

// Handle File Loading
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); });
});

dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  dropZone.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length) handleFiles(files);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleFiles(e.target.files);
});

async function handleFiles(files) {
  statusEl.textContent = 'Processing...';
  
  for (const file of files) {
    if (file.name.endsWith('.zf3d') || file.name.endsWith('.zip')) {
      await parseZF3DContainer(file);
    } else if (file.name.endsWith('.vertex')) {
      const buffer = await file.arrayBuffer();
      renderBinaryMesh(buffer);
    }
  }
}

// Extract .zf3d archive using JSZip
async function parseZF3DContainer(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    
    // Find .vertex file inside archive
    const vertexEntry = Object.keys(zip.files).find(name => name.endsWith('.vertex'));
    
    if (vertexEntry) {
      statusEl.textContent = 'Parsing .vertex buffer...';
      const vertexBuffer = await zip.files[vertexEntry].async('arraybuffer');
      renderBinaryMesh(vertexBuffer);
    } else {
      statusEl.textContent = 'Error: No .vertex file inside .zf3d';
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed to extract file';
  }
}

// Convert packed Float32 binary buffer into a Three.js Mesh
function renderBinaryMesh(buffer) {
  const floats = new Float32Array(buffer);
  
  // Standard stride assumption for vertices (X, Y, Z coordinates)
  const geometry = new THREE.BufferGeometry();
  
  // Assign positions attribute from packed floats
  geometry.setAttribute('position', new THREE.BufferAttribute(floats, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x6366f1,
    roughness: 0.4,
    metalness: 0.2,
    side: THREE.DoubleSide,
    wireframe: wireframeToggle.checked
  });

  if (currentMesh) scene.remove(currentMesh);

  currentMesh = new THREE.Mesh(geometry, material);
  scene.add(currentMesh);

  // Recenter Camera around Model Bounds
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere.radius;
  currentMesh.position.sub(geometry.boundingSphere.center);
  camera.position.set(0, radius * 1.5, radius * 2.5);
  controls.target.set(0, 0, 0);

  // Update UI Stats
  statusEl.textContent = 'Loaded successfully';
  vertexCountEl.textContent = Math.floor(floats.length / 3).toLocaleString();
  faceCountEl.textContent = Math.floor(floats.length / 9).toLocaleString();
}

// Controls Logic
wireframeToggle.addEventListener('change', (e) => {
  if (currentMesh) currentMesh.material.wireframe = e.target.checked;
});

autoRotateToggle.addEventListener('change', (e) => {
  controls.autoRotate = e.target.checked;
});

resetCamBtn.addEventListener('click', () => {
  camera.position.set(0, 5, 10);
  controls.target.set(0, 0, 0);
});

// Window Resize & Animation Loop
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

