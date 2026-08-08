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
    logDebug(`Entries count: ${entries.length}`);

    // Find all vertex-related files
    const vertexKeys = entries.filter(name => name.includes('.vertex') || name.endsWith('vertex'));
    const indexKeys = entries.filter(name => name.includes('.index') || name.endsWith('index'));
    
    logDebug(`Found vertex files: ${vertexKeys.length}`);

    if (vertexKeys.length === 0) {
      statusEl.textContent = 'Error: No vertex files found!';
      return;
    }

    if (currentGroup) scene.remove(currentGroup);
    currentGroup = new THREE.Group();

    let totalVerts = 0;

    for (const vKey of vertexKeys) {
      const vBuffer = await zip.files[vKey].async('arraybuffer');
      logDebug(`Parsing ${vKey} (${vBuffer.byteLength} bytes)`);

      const floats = new Float32Array(vBuffer);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(floats, 3));
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        color: 0x6366f1,
        roughness: 0.4,
        side: THREE.DoubleSide,
        wireframe: wireframeToggle.checked
      });

      const mesh = new THREE.Mesh(geometry, material);
      currentGroup.add(mesh);
      totalVerts += floats.length / 3;
    }

    scene.add(currentGroup);

    const box = new THREE.Box3().setFromObject(currentGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 10;
    
    currentGroup.position.sub(center);
    camera.position.set(0, maxDim * 0.5, maxDim * 2);
    controls.target.set(0, 0, 0);

    statusEl.textContent = 'Parsed successfully';
    vertexCountEl.textContent = totalVerts.toLocaleString();
    faceCountEl.textContent = Math.floor(totalVerts / 3).toLocaleString();
    logDebug('Render complete!');

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed to parse';
    logDebug(`ERR: ${err.message}`);
  }
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
