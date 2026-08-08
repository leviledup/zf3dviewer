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

const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const grid = new THREE.GridHelper(20, 20, 0x2a2a35, 0x1a1a22);
scene.add(grid);

let currentMesh = null;

const statusEl = document.getElementById('status');
const vertexCountEl = document.getElementById('vertexCount');
const faceCountEl = document.getElementById('faceCount');
const wireframeToggle = document.getElementById('wireframeToggle');
const autoRotateToggle = document.getElementById('autoRotateToggle');
const resetCamBtn = document.getElementById('resetCamBtn');

// Add an on-screen debug log box dynamically so you can see logs on your phone screen
const debugBox = document.createElement('div');
debugBox.style.cssText = 'position:absolute; bottom:10px; right:10px; width:300px; max-height:150px; background:rgba(0,0,0,0.8); color:#00ffcc; font-family:monospace; font-size:10px; padding:8px; overflow-y:auto; border-radius:4px; z-index:999; pointer-events:none;';
debugBox.innerHTML = '<b>Debug Log:</b><br/>Ready...';
container.appendChild(debugBox);

function logDebug(text) {
  console.log(text);
  debugBox.innerHTML += `<br/>> ${text}`;
  debugBox.scrollTop = debugBox.scrollHeight;
}

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); });
});

dropZone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files.length) handleZF3DContainer(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleZF3DContainer(e.target.files[0]);
});

async function handleZF3DContainer(file) {
  try {
    statusEl.textContent = 'Reading archive...';
    logDebug(`Opening file: ${file.name}`);

    const zip = await JSZip.loadAsync(file);
    const entries = Object.keys(zip.files);
    logDebug(`Found entries: ${entries.join(', ' * 1)}`);

    const vertexKey = entries.find(name => name.endsWith('.vertex'));
    if (!vertexKey) {
      statusEl.textContent = 'Error: No .vertex file found!';
      logDebug('ERROR: Missing .vertex file in zip');
      return;
    }

    const vertexBuffer = await zip.files[vertexKey].async('arraybuffer');
    logDebug(`Loaded vertex buffer size: ${vertexBuffer.byteLength} bytes`);

    // Diagnostic Direct Dump (Stride = 3 raw positional floats)
    renderRawMeshDirectly(vertexBuffer);

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed to read package';
    logDebug(`ERROR: ${err.message}`);
  }
}

function renderRawMeshDirectly(buffer) {
  const floats = new Float32Array(buffer);
  logDebug(`Total floats parsed: ${floats.length}`);
  logDebug(`First 6 values: ${floats[0]}, ${floats[1]}, ${floats[2]} | ${floats[3]}, ${floats[4]}, ${floats[5]}`);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(floats, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x6366f1,
    roughness: 0.4,
    side: THREE.DoubleSide,
    wireframe: wireframeToggle.checked
  });

  if (currentMesh) scene.remove(currentMesh);
  currentMesh = new THREE.Mesh(geometry, material);
  scene.add(currentMesh);

  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere.radius || 10;
  currentMesh.position.sub(geometry.boundingSphere.center);
  camera.position.set(0, radius * 1.5, radius * 2.5);
  controls.target.set(0, 0, 0);

  statusEl.textContent = 'Rendered raw buffer';
  vertexCountEl.textContent = Math.floor(floats.length / 3).toLocaleString();
  faceCountEl.textContent = Math.floor(floats.length / 9).toLocaleString();
}

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
