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

// Lighting & Grid Helper
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

// File Upload Handlers
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
      statusEl.textContent = 'Error: No .vertex file found inside .zf3d';
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed to extract file';
  }
}

// Fixed Binary Buffer Parsing (De-interleaving $X, Y, Z$ positions)
function renderBinaryMesh(buffer) {
  const fullFloats = new Float32Array(buffer);
  
  // -------------------------------------------------------------------
  // FLARE3D STRIDE CONFIG:
  // Default is 8 floats per vertex block (Pos3f + Norm3f + UV2f)
  // If mesh shape looks weird, change STRIDE to 6, 10, or 12
  // -------------------------------------------------------------------
  const STRIDE = 8; 
  const totalVertices = Math.floor(fullFloats.length / STRIDE);
  
  const positions = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);

  for (let i = 0; i < totalVertices; i++) {
    const srcOffset = i * STRIDE;
    const dstPosOffset = i * 3;
    const dstUvOffset = i * 2;

    // 1. Extract Position (X, Y, Z) - Floats 0, 1, 2
    positions[dstPosOffset]     = fullFloats[srcOffset + 0];
    positions[dstPosOffset + 1] = fullFloats[srcOffset + 1];
    positions[dstPosOffset + 2] = fullFloats[srcOffset + 2];

    // 2. Extract UVs (U, V) - Floats 6 & 7
    if (STRIDE >= 8) {
      uvs[dstUvOffset]     = fullFloats[srcOffset + 6];
      uvs[dstUvOffset + 1] = fullFloats[srcOffset + 7];
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  if (STRIDE >= 8) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }

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

  // Auto Recenter & Scale Camera to Model Bounds
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere.radius || 10;
  currentMesh.position.sub(geometry.boundingSphere.center);
  camera.position.set(0, radius * 1.5, radius * 2.5);
  controls.target.set(0, 0, 0);

  // Update Sidebar UI Stats
  statusEl.textContent = 'Loaded successfully';
  vertexCountEl.textContent = totalVertices.toLocaleString();
  faceCountEl.textContent = Math.floor(totalVertices / 3).toLocaleString();
}

// UI Event Listeners
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

// Viewport Resize & Render Loop
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
