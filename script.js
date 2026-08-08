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
debugBox.style.cssText = 'position:absolute; bottom:10px; right:10px; width:320px; max-height:180px; background:rgba(0,0,0,0.85); color:#00ffcc; font-family:monospace; font-size:10px; padding:8px; overflow-y:auto; border-radius:4px; z-index:999;';
debugBox.innerHTML = '<b>ZF3D Structure Inspector:</b><br/>Ready...';
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
  if (e.dataTransfer.files.length) inspectFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) inspectFile(e.target.files[0]);
});

async function inspectFile(file) {
  try {
    statusEl.textContent = 'Inspecting file structure...';
    logDebug(`--- File: ${file.name} (${file.size} bytes) ---`);

    const zip = await JSZip.loadAsync(file);
    const entries = Object.keys(zip.files);
    logDebug(`Entries found (${entries.length}): ${entries.slice(0, 5).join(', ')}...`);

    // Let's look inside a .vertex file specifically
    const vertexKey = entries.find(name => name.includes('.vertex') || name.endsWith('vertex'));
    if (!vertexKey) {
      logDebug('ERROR: No .vertex file found in archive.');
      return;
    }

    const vertexBuffer = await zip.files[vertexKey].async('arraybuffer');
    logDebug(`Inspected ${vertexKey}: ${vertexBuffer.byteLength} bytes`);

    // Inspect first 64 bytes as text and hex to see if there's a header
    const headerBytes = new Uint8Array(vertexBuffer.slice(0, 64));
    let textHeader = '';
    let hexHeader = '';
    for (let i = 0; i < headerBytes.length; i++) {
      let b = headerBytes[i];
      textHeader += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
      hexHeader += b.toString(16).padStart(2, '0') + ' ';
    }

    logDebug(`Header Text: ${textHeader.substring(0, 32)}`);
    logDebug(`Header Hex: ${hexHeader.substring(0, 40)}...`);

    // Try reading as Int16 or Float32 to check value ranges
    const int16View = new Int16Array(vertexBuffer.slice(0, 32));
    const float32View = new Float32Array(vertexBuffer.slice(0, 32));
    logDebug(`Int16 sample: [${int16View.slice(0, 6).join(', ')}]`);
    logDebug(`Float32 sample: [${float32View.slice(0, 6).map(n => n.toFixed(2)).join(', ')}]`);

    statusEl.textContent = 'Inspection complete';

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Inspection failed';
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
