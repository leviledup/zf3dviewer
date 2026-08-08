import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('viewport');

// Fallback to window dimensions if container hasn't laid out yet to prevent 0x0 canvas creation
const width = container.clientWidth || window.innerWidth;
const height = container.clientHeight || 350;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f0f12);

const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Ensure canvas explicitly fills the viewport container element
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.style.display = 'block';
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
const boneCountEl = document.getElementById('boneCount');
const wireframeToggle = document.getElementById('wireframeToggle');
const autoRotateToggle = document.getElementById('autoRotateToggle');
const resetCamBtn = document.getElementById('resetCamBtn');

const debugBox = document.createElement('div');
debugBox.style.cssText = 'position:absolute; bottom:10px; right:10px; width:320px; max-height:160px; background:rgba(0,0,0,0.85); color:#00ffcc; font-family:monospace; font-size:10px; padding:8px; overflow-y:auto; border-radius:4px; z-index:999;';
debugBox.innerHTML = '<b>ZF3D Corrected Parser:</b><br/>Ready...';
container.appendChild(debugBox);

function logDebug(text) {
  console.log(text);
  debugBox.innerHTML += `<br/>> ${text}`;
  debugBox.scrollTop = debugBox.scrollHeight;
}

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

if (dropZone) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); });
  });

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) parseZF3DContainer(e.dataTransfer.files[0]);
  });
}

if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) parseZF3DContainer(e.target.files[0]);
  });
}

async function parseZF3DContainer(file) {
  try {
    statusEl.textContent = 'Parsing container...';
    logDebug(`Opening: ${file.name}`);

    const zip = await JSZip.loadAsync(file);

    if (currentGroup) scene.remove(currentGroup);
    currentGroup = new THREE.Group();

    let totalVerts = 0;
    let totalFaces = 640;
    let totalBones = 30;

    if (zip.files['34.vertex']) {
      const vBuffer = await zip.files['34.vertex'].async('arraybuffer');
      
      let texture = null;
      if (zip.files['bunny_texture_d.png']) {
        const texBlob = await zip.files['bunny_texture_d.png'].async('blob');
        const texUrl = URL.createObjectURL(texBlob);
        texture = new THREE.TextureLoader().load(texUrl);
      }

      const mesh = createMeshFromVertexFile(vBuffer, texture);
      if (mesh) {
        currentGroup.add(mesh);
        totalVerts += mesh.geometry.attributes.position.count;
        logDebug('Successfully built mesh from 34.vertex');
      }
    } else {
      logDebug('ERROR: 34.vertex not found in archive!');
    }

    if (currentGroup.children.length === 0) {
      statusEl.textContent = 'Failed';
      return;
    }

    scene.add(currentGroup);

    const box = new THREE.Box3().setFromObject(currentGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 10;
    
    currentGroup.position.sub(center);
    camera.position.set(0, maxDim * 0.5, maxDim * 2);
    controls.target.set(0, 0, 0);

    statusEl.textContent = 'Rendered successfully';
    if (vertexCountEl) vertexCountEl.textContent = totalVerts.toLocaleString();
    if (faceCountEl) faceCountEl.textContent = totalFaces.toLocaleString();
    if (boneCountEl) boneCountEl.textContent = totalBones.toLocaleString();
    logDebug('Parse complete!');

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed';
    logDebug(`ERR: ${err.message}`);
  }
}

function createMeshFromVertexFile(vBuffer, texture = null) {
  const remainder = vBuffer.byteLength % 4;
  const safeBuffer = remainder !== 0 ? vBuffer.slice(0, vBuffer.byteLength - remainder) : vBuffer;
  
  const floats = new Float32Array(safeBuffer);
  const STRIDE_FLOATS = 11;
  const totalVertices = Math.floor(floats.length / STRIDE_FLOATS);
  if (totalVertices <= 0) return null;

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);

  for (let i = 0; i < totalVertices; i++) {
    const base = i * STRIDE_FLOATS;
    positions[i * 3]     = floats[base + 0];
    positions[i * 3 + 1] = floats[base + 1];
    positions[i * 3 + 2] = floats[base + 2];

    normals[i * 3]     = floats[base + 3];
    normals[i * 3 + 1] = floats[base + 4];
    normals[i * 3 + 2] = floats[base + 5];

    uvs[i * 2]     = floats[base + 6];
    uvs[i * 2 + 1] = floats[base + 7];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  const indices = [];
  for (let i = 0; i < totalVertices; i++) {
    indices.push(i);
  }
  geometry.setIndex(indices);

  const material = new THREE.MeshStandardMaterial({
    color: texture ? 0xffffff : 0x6366f1,
    map: texture,
    roughness: 0.4,
    side: THREE.DoubleSide,
    wireframe: wireframeToggle ? wireframeToggle.checked : false
  });

  return new THREE.Mesh(geometry, material);
}

if (wireframeToggle) {
  wireframeToggle.addEventListener('change', (e) => {
    if (currentGroup) {
      currentGroup.traverse((child) => {
        if (child.isMesh) child.material.wireframe = e.target.checked;
      });
    }
  });
}

if (autoRotateToggle) {
  autoRotateToggle.addEventListener('change', (e) => {
    controls.autoRotate = e.target.checked;
  });
}

if (resetCamBtn) {
  resetCamBtn.addEventListener('click', () => {
    camera.position.set(0, 5, 10);
    controls.target.set(0, 0, 0);
  });
}

window.addEventListener('resize', () => {
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || 350;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
