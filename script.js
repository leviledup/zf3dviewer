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

const debugBox = document.createElement('div');
debugBox.style.cssText = 'position:absolute; bottom:10px; right:10px; width:320px; max-height:150px; background:rgba(0,0,0,0.85); color:#00ffcc; font-family:monospace; font-size:10px; padding:8px; overflow-y:auto; border-radius:4px; z-index:999;';
debugBox.innerHTML = '<b>ZF3D Parser:</b><br/>Ready...';
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
  if (e.dataTransfer.files.length) parseZF3D(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) parseZF3D(e.target.files[0]);
});

async function parseZF3D(file) {
  try {
    statusEl.textContent = 'Parsing container...';
    logDebug(`Opening: ${file.name}`);

    const zip = await JSZip.loadAsync(file);
    const entries = Object.keys(zip.files);
    
    const vertexKey = entries.find(name => name.includes('.vertex') || name.endsWith('vertex'));
    const indexKey = entries.find(name => name.includes('.index') || name.endsWith('index'));

    if (!vertexKey) {
      logDebug('ERROR: No vertex file found');
      return;
    }

    const vBuffer = await zip.files[vertexKey].async('arraybuffer');
    let idxBuffer = indexKey ? await zip.files[indexKey].async('arraybuffer') : null;

    logDebug(`Vertex buffer: ${vBuffer.byteLength} bytes`);

    // Flare3D standard interleaved vertex layout usually has a stride of 8 floats (32 bytes):
    // Pos (3 floats) + Normal/UV/Weights (5 floats) = 8 floats per vertex.
    const STRIDE_FLOATS = 8; 
    const floats = new Float32Array(vBuffer);
    const totalVertices = Math.floor(floats.length / STRIDE_FLOATS);

    logDebug(`Calculated vertices: ${totalVertices} (Stride: ${STRIDE_FLOATS})`);

    const positions = new Float32Array(totalVertices * 3);
    const uvs = new Float32Array(totalVertices * 2);

    for (let i = 0; i < totalVertices; i++) {
      const base = i * STRIDE_FLOATS;
      // Position X, Y, Z
      positions[i * 3]     = floats[base + 0];
      positions[i * 3 + 1] = floats[base + 1];
      positions[i * 3 + 2] = floats[base + 2];

      // UVs are usually at offset 6 and 7 in standard Flare3D layouts
      if (STRIDE_FLOATS >= 8) {
        uvs[i * 2]     = floats[base + 6];
        uvs[i * 2 + 1] = floats[base + 7];
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    if (idxBuffer) {
      const indices = new Uint16Array(idxBuffer);
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      logDebug(`Loaded index count: ${indices.length}`);
    }

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

    statusEl.textContent = 'Rendered successfully';
    vertexCountEl.textContent = totalVertices.toLocaleString();
    faceCountEl.textContent = geometry.index ? (geometry.index.count / 3).toLocaleString() : Math.floor(totalVertices / 3).toLocaleString();
    logDebug('Render complete!');

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed';
    logDebug(`ERR: ${err.message}`);
  }
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
