import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
    statusEl.textContent = 'Extracting package...';
    const zip = await JSZip.loadAsync(file);
    
    // Find all internal file components
    const entries = Object.keys(zip.files);
    console.log("Archive contents:", entries);

    const vertexKey = entries.find(name => name.endsWith('.vertex'));
    const indexKey = entries.find(name => name.endsWith('.index') || name.includes('index'));
    const textureKey = entries.find(name => name.endsWith('.jpg') || name.endsWith('.png'));

    if (!vertexKey) {
      statusEl.textContent = 'Error: Missing .vertex file!';
      return;
    }

    // Load texture if available
    let texture = null;
    if (textureKey) {
      const texBlob = await zip.files[textureKey].async('blob');
      const texURL = URL.createObjectURL(texBlob);
      texture = new THREE.TextureLoader().load(texURL);
      texture.colorSpace = THREE.SRGBColorSpace;
    }

    statusEl.textContent = 'Parsing buffers...';
    const vertexBuffer = await zip.files[vertexKey].async('arraybuffer');
    
    let indexBuffer = null;
    if (indexKey) {
      indexBuffer = await zip.files[indexKey].async('arraybuffer');
    }

    renderIndexedMesh(vertexBuffer, indexBuffer, texture);

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed to parse package';
  }
}

function renderIndexedMesh(vertBuffer, idxBuffer, texture) {
  const fullFloats = new Float32Array(vertBuffer);
  const STRIDE = 8; // Standard interleaved layout: Pos(3) + Normal(3) + UV(2)
  const totalVertices = Math.floor(fullFloats.length / STRIDE);

  const positions = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);

  for (let i = 0; i < totalVertices; i++) {
    const base = i * STRIDE;
    positions[i * 3]     = fullFloats[base + 0];
    positions[i * 3 + 1] = fullFloats[base + 1];
    positions[i * 3 + 2] = fullFloats[base + 2];

    uvs[i * 2]     = fullFloats[base + 6];
    uvs[i * 2 + 1] = fullFloats[base + 7];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  // If an index/face buffer exists, parse it so triangles form correctly
  if (idxBuffer) {
    // Try reading indices as 16-bit integers (standard for Flash/Flare3D)
    const indices = new Uint16Array(idxBuffer);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: texture ? 0xffffff : 0x6366f1,
    map: texture,
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

  statusEl.textContent = 'Rendered successfully';
  vertexCountEl.textContent = totalVertices.toLocaleString();
  faceCountEl.textContent = geometry.index ? Math.floor(geometry.index.count / 3).toLocaleString() : Math.floor(totalVertices / 3).toLocaleString();
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
