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

let currentGroup = null;

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
    statusEl.textContent = 'Extracting archive...';
    const zip = await JSZip.loadAsync(file);
    
    const entries = Object.keys(zip.files);
    console.log("All package entries:", entries);

    // Find ALL vertex files instead of just the first one
    const vertexKeys = entries.filter(name => name.endsWith('.vertex'));
    const indexKey = entries.find(name => name.endsWith('.index') || name.includes('index'));
    const textureKey = entries.find(name => name.endsWith('.jpg') || name.endsWith('.png'));

    if (vertexKeys.length === 0) {
      statusEl.textContent = 'Error: No .vertex files found!';
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

    statusEl.textContent = `Parsing ${vertexKeys.length} submesh(es)...`;

    // Load global index buffer if it exists
    let globalIndexBuffer = null;
    if (indexKey) {
      globalIndexBuffer = await zip.files[indexKey].async('arraybuffer');
    }

    // Create a parent group to hold all submeshes together
    if (currentGroup) scene.remove(currentGroup);
    currentGroup = new THREE.Group();

    let totalVertsCount = 0;
    let totalFacesCount = 0;

    // Loop through every single .vertex file found in the archive
    for (const vKey of vertexKeys) {
      const vertBuffer = await zip.files[vKey].async('arraybuffer');
      const mesh = buildSubmesh(vertBuffer, globalIndexBuffer, texture);
      if (mesh) {
        currentGroup.add(mesh);
        totalVertsCount += mesh.geometry.attributes.position.count;
        totalFacesCount += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
      }
    }

    scene.add(currentGroup);

    // Center entire group container
    const box = new THREE.Box3().setFromObject(currentGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 10;
    
    currentGroup.position.sub(center);
    camera.position.set(0, maxDim * 0.5, maxDim * 2);
    controls.target.set(0, 0, 0);

    statusEl.textContent = 'Loaded successfully';
    vertexCountEl.textContent = totalVertsCount.toLocaleString();
    faceCountEl.textContent = Math.floor(totalFacesCount).toLocaleString();

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed to read package';
  }
}

function buildSubmesh(vertBuffer, idxBuffer, texture) {
  const fullFloats = new Float32Array(vertBuffer);
  const STRIDE = 8;
  const totalVertices = Math.floor(fullFloats.length / STRIDE);
  if (totalVertices <= 0) return null;

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

  if (idxBuffer) {
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

  return new THREE.Mesh(geometry, material);
}

wireframeToggle.addEventListener('change', (e) => {
  if (currentGroup) {
    currentGroup.traverse((child) => {
      if (child.isMesh) child.material.wireframe = e.target.checked;
    });
  }
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
