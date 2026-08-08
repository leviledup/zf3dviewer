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
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
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
  if (files.length) handleZF3DContainer(files[0]);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleZF3DContainer(e.target.files[0]);
});

// Extract .zf3d archive and parse using XML metadata
async function handleZF3DContainer(file) {
  try {
    statusEl.textContent = 'Extracting archive...';
    const zip = await JSZip.loadAsync(file);
    
    // 1. Find files inside the container
    const xmlEntry = Object.keys(zip.files).find(name => name.endsWith('.xml'));
    const vertexEntry = Object.keys(zip.files).find(name => name.endsWith('.vertex'));
    const textureEntry = Object.keys(zip.files).find(name => name.endsWith('.jpg') || name.endsWith('.png'));

    if (!vertexEntry) {
      statusEl.textContent = 'Error: No .vertex file found!';
      return;
    }

    // 2. Parse XML layout if available
    let vertexFormat = { stride: 8, posOffset: 0, uvOffset: 6 }; // fallback default
    if (xmlEntry) {
      const xmlText = await zip.files[xmlEntry].async('text');
      vertexFormat = parseFlare3DXML(xmlText);
    }

    // 3. Load Texture (.jpg) if available
    let loadedTexture = null;
    if (textureEntry) {
      const texBlob = await zip.files[textureEntry].async('blob');
      const texURL = URL.createObjectURL(texBlob);
      loadedTexture = new THREE.TextureLoader().load(texURL);
      loadedTexture.colorSpace = THREE.SRGBColorSpace;
    }

    // 4. Load Vertex Binary Buffer
    statusEl.textContent = 'Parsing vertex buffers...';
    const vertexBuffer = await zip.files[vertexEntry].async('arraybuffer');
    
    renderStructuredMesh(vertexBuffer, vertexFormat, loadedTexture);

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed to parse .zf3d package';
  }
}

// Simple XML inspector to detect Flare3D vertex layout attributes
function parseFlare3DXML(xmlText) {
  // Flare3D XML files typically define vertex layout blocks like vertexFormat="position3,normal3,uv2"
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  
  // Default values
  let stride = 8;
  let posOffset = 0;
  let uvOffset = 6;

  // Look for format descriptions in the XML tree elements
  const subMeshes = xmlDoc.getElementsByTagName('subMesh');
  if (subMeshes.length > 0) {
    // You can inspect console logs to see your model's exact XML structure structure if needed
    console.log("Found model submeshes in XML");
  }

  return { stride, posOffset, uvOffset };
}

// Build mesh using precise offsets
function renderBinaryMesh(buffer) {
  renderStructuredMesh(buffer, { stride: 8, posOffset: 0, uvOffset: 6 }, null);
}

function renderStructuredMesh(buffer, format, texture) {
  const fullFloats = new Float32Array(buffer);
  const STRIDE = format.stride;
  const totalVertices = Math.floor(fullFloats.length / STRIDE);
  
  const positions = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);

  for (let i = 0; i < totalVertices; i++) {
    const srcOffset = i * STRIDE;
    
    // Extract Position
    positions[i * 3]     = fullFloats[srcOffset + format.posOffset + 0];
    positions[i * 3 + 1] = fullFloats[srcOffset + format.posOffset + 1];
    positions[i * 3 + 2] = fullFloats[srcOffset + format.posOffset + 2];

    // Extract UVs
    uvs[i * 2]     = fullFloats[srcOffset + format.uvOffset + 0];
    uvs[i * 2 + 1] = fullFloats[srcOffset + format.uvOffset + 1];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: texture ? 0xffffff : 0x6366f1,
    map: texture,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
    wireframe: wireframeToggle.checked
  });

  if (currentMesh) scene.remove(currentMesh);

  currentMesh = new THREE.Mesh(geometry, material);
  scene.add(currentMesh);

  // Auto Recenter Camera
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere.radius || 10;
  currentMesh.position.sub(geometry.boundingSphere.center);
  camera.position.set(0, radius * 1.5, radius * 2.5);
  controls.target.set(0, 0, 0);

  // Update UI
  statusEl.textContent = 'Loaded successfully with texture!';
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
