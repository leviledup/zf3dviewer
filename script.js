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
debugBox.style.cssText = 'position:absolute; bottom:10px; right:10px; width:320px; max-height:160px; background:rgba(0,0,0,0.85); color:#00ffcc; font-family:monospace; font-size:10px; padding:8px; overflow-y:auto; border-radius:4px; z-index:999;';
debugBox.innerHTML = '<b>ZF3D Bin-Conditional Parser:</b><br/>Ready...';
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
  if (e.dataTransfer.files.length) parseZF3DContainer(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) parseZF3DContainer(e.target.files[0]);
});

async function parseZF3DContainer(file) {
  try {
    statusEl.textContent = 'Parsing container...';
    logDebug(`Opening: ${file.name}`);

    const zip = await JSZip.loadAsync(file);
    const entries = Object.keys(zip.files);

    if (currentGroup) scene.remove(currentGroup);
    currentGroup = new THREE.Group();

    let totalVerts = 0;
    let totalFaces = 0;

    // Check if the container includes a .bin file
    const binKey = entries.find(name => name.endsWith('.bin'));

    if (binKey) {
      logDebug(`Detected .bin file: ${binKey}. Parsing packed binary format...`);
      const binBuffer = await zip.files[binKey].async('arraybuffer');
      
      // If it has a .bin file, handle parsing directly from the combined binary layout
      const mesh = createMeshFromBuffer(binBuffer);
      if (mesh) {
        currentGroup.add(mesh);
        totalVerts += mesh.geometry.attributes.position.count;
        totalFaces += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
      }
    } else {
      logDebug('No .bin file detected. Using standard XML/Vertex mapping...');
      
      if (entries.includes('main.xml')) {
        const xmlText = await zip.files['main.xml'].async('text');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const submeshes = xmlDoc.getElementsByTagName('submesh');

        if (submeshes.length > 0) {
          for (let i = 0; i < submeshes.length; i++) {
            const sm = submeshes[i];
            const vertexFile = sm.getAttribute('vertex');
            const indexFile = sm.getAttribute('index');

            if (vertexFile && zip.files[vertexFile]) {
              const vBuffer = await zip.files[vertexFile].async('arraybuffer');
              let iBuffer = (indexFile && zip.files[indexFile]) ? await zip.files[indexFile].async('arraybuffer') : null;
              
              const mesh = createMeshFromBuffer(vBuffer, iBuffer);
              if (mesh) {
                currentGroup.add(mesh);
                totalVerts += mesh.geometry.attributes.position.count;
                totalFaces += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
              }
            }
          }
        }
      }

      // Fallback if XML submeshes weren't processed
      if (currentGroup.children.length === 0) {
        const vertexKeys = entries.filter(name => name.endsWith('.vertex'));
        for (const vKey of vertexKeys) {
          const vBuffer = await zip.files[vKey].async('arraybuffer');
          const mesh = createMeshFromBuffer(vBuffer);
          if (mesh) {
            currentGroup.add(mesh);
            totalVerts += mesh.geometry.attributes.position.count;
            totalFaces += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
          }
        }
      }
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
    vertexCountEl.textContent = totalVerts.toLocaleString();
    faceCountEl.textContent = Math.floor(totalFaces).toLocaleString();
    logDebug('Parse complete!');

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed';
    logDebug(`ERR: ${err.message}`);
  }
}

function createMeshFromBuffer(vBuffer, iBuffer = null) {
  const floats = new Float32Array(vBuffer);
  const STRIDE_FLOATS = 8; 
  const totalVertices = Math.floor(floats.length / STRIDE_FLOATS);
  if (totalVertices <= 0) return null;

  const positions = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);

  for (let i = 0; i < totalVertices; i++) {
    const base = i * STRIDE_FLOATS;
    positions[i * 3]     = floats[base + 0];
    positions[i * 3 + 1] = floats[base + 1];
    positions[i * 3 + 2] = floats[base + 2];

    uvs[i * 2]     = floats[base + 6];
    uvs[i * 2 + 1] = floats[base + 7];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  if (iBuffer) {
    const indices = new Uint16Array(iBuffer);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x6366f1,
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
