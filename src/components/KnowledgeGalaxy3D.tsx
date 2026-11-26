import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { NoteLink, NoteNode } from '../../shared/types';
import { computeGalaxyLayout, computeNewbornPosition, type Vec3Pos } from '../utils/forceLayout';
import { getGroupStyle } from '../utils/galaxyTheme';

export interface FocusRequest {
  id: number;
  mode: 'node' | 'cluster' | 'overview';
  nodeIds: number[];
  newbornId?: number | null;
}

export interface HoverInfo {
  node: NoteNode;
  x: number;
  y: number;
}

interface KnowledgeGalaxy3DProps {
  nodes: NoteNode[];
  links: NoteLink[];
  selectedNodeId: number | null;
  highlightedNodeIds: number[];
  neighborNodeIds: number[];
  activeGroupFilter: string | null;
  focusRequest: FocusRequest | null;
  isLiveSpeaking: boolean;
  onSelectNode: (nodeId: number) => void;
  onHoverNode: (info: HoverInfo | null) => void;
  onRegisterCapture?: (captureFn: () => string | null) => void;
}

// Pre-allocated scratch math helpers (zero per-frame GC)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _dummy = new THREE.Object3D();

interface NodeVisual {
  id: number;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  hitMesh: THREE.Mesh;
  baseColor: THREE.Color;
  basePos: THREE.Vector3;
  phase: number;
  degree: number;
}

function createCentralArcCore(isSoftwareGl: boolean): {
  root: THREE.Group;
  outerGimbal: THREE.Mesh;
  innerRing: THREE.Mesh;
  plasmaCore: THREE.Mesh;
} {
  const root = new THREE.Group();

  // 1. Outer brushed titanium gimbal ring
  const outerGeo = new THREE.TorusGeometry(4.4, 0.14, 20, 72);
  const titaniumMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.9,
    roughness: 0.24,
  });
  const outerGimbal = new THREE.Mesh(outerGeo, titaniumMat);
  outerGimbal.rotation.x = Math.PI * 0.35;
  root.add(outerGimbal);

  // 2. Inner warm-gold beveled lathe collar
  const lathePts = [
    new THREE.Vector2(2.6, -0.22),
    new THREE.Vector2(3.0, -0.14),
    new THREE.Vector2(3.15, 0),
    new THREE.Vector2(3.0, 0.14),
    new THREE.Vector2(2.6, 0.22),
  ];
  const innerGeo = new THREE.LatheGeometry(lathePts, 48);
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.92,
    roughness: 0.16,
  });
  const innerRing = new THREE.Mesh(innerGeo, goldMat);
  innerRing.rotation.z = Math.PI * 0.12;
  root.add(innerRing);

  // 3. Equatorial matte slate reticle collar (roughness >= 0.25 diff vs gold)
  const collarGeo = new THREE.TorusGeometry(3.65, 0.08, 12, 64);
  const matteSlateMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.55,
    roughness: 0.58,
  });
  const collar = new THREE.Mesh(collarGeo, matteSlateMat);
  collar.rotation.x = -Math.PI * 0.42;
  root.add(collar);

  // 4. Optical sapphire glass containment shell
  const glassGeo = new THREE.SphereGeometry(2.15, 32, 32);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    metalness: 0.0,
    roughness: 0.08,
    transmission: isSoftwareGl ? 0 : 0.88,
    transparent: true,
    opacity: isSoftwareGl ? 0.28 : 1.0,
    ior: 1.65,
    thickness: 1.2,
    clearcoat: 1.0,
    depthWrite: false,
  });
  const glassShell = new THREE.Mesh(glassGeo, glassMat);
  glassShell.renderOrder = 2;
  root.add(glassShell);

  // 5. Inner luminous plasma core
  const coreGeo = new THREE.IcosahedronGeometry(1.18, 1);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.6,
    metalness: 0.2,
    roughness: 0.2,
  });
  const plasmaCore = new THREE.Mesh(coreGeo, coreMat);
  root.add(plasmaCore);

  // 6. Three beveled radial pylon brackets (ExtrudeGeometry)
  const pylonShape = new THREE.Shape();
  pylonShape.moveTo(-0.18, 0);
  pylonShape.lineTo(0.18, 0);
  pylonShape.lineTo(0.1, 1.35);
  pylonShape.lineTo(-0.1, 1.35);
  pylonShape.closePath();

  const pylonGeo = new THREE.ExtrudeGeometry(pylonShape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  pylonGeo.center();

  const pylonMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.82,
    roughness: 0.48,
  });
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const pylon = new THREE.Mesh(pylonGeo, pylonMat);
    pylon.position.set(Math.cos(angle) * 3.15, 0, Math.sin(angle) * 3.15);
    pylon.rotation.y = -angle;
    pylon.rotation.z = Math.PI / 2;
    root.add(pylon);
  }

  // 7. Equatorial precision tick markers (InstancedMesh)
  const tickGeo = new THREE.BoxGeometry(0.06, 0.14, 0.24);
  const tickMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.9,
    metalness: 0.5,
    roughness: 0.3,
  });
  const tickCount = 24;
  const ticks = new THREE.InstancedMesh(tickGeo, tickMat, tickCount);
  for (let i = 0; i < tickCount; i++) {
    const a = (i / tickCount) * Math.PI * 2;
    _dummy.position.set(Math.cos(a) * 5.2, 0, Math.sin(a) * 5.2);
    _dummy.rotation.set(0, -a, 0);
    _dummy.scale.setScalar(i % 6 === 0 ? 1.4 : 0.9);
    _dummy.updateMatrix();
    ticks.setMatrixAt(i, _dummy.matrix);
  }
  ticks.instanceMatrix.needsUpdate = true;
  ticks.computeBoundingSphere();
  root.add(ticks);

  return { root, outerGimbal, innerRing, plasmaCore };
}

export default function KnowledgeGalaxy3D({
  nodes,
  links,
  selectedNodeId,
  highlightedNodeIds,
  neighborNodeIds,
  activeGroupFilter,
  focusRequest,
  isLiveSpeaking,
  onSelectNode,
  onHoverNode,
  onRegisterCapture,
}: KnowledgeGalaxy3DProps) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Latest props in refs so the Three.js loop never tears down on React state changes
  const nodesRef = useRef(nodes);
  const linksRef = useRef(links);
  const selectedRef = useRef(selectedNodeId);
  const highlightedRef = useRef(highlightedNodeIds);
  const neighborRef = useRef(neighborNodeIds);
  const groupFilterRef = useRef(activeGroupFilter);
  const isLiveSpeakingRef = useRef(isLiveSpeaking);
  const onSelectRef = useRef(onSelectNode);
  const onHoverRef = useRef(onHoverNode);

  nodesRef.current = nodes;
  linksRef.current = links;
  selectedRef.current = selectedNodeId;
  highlightedRef.current = highlightedNodeIds;
  neighborRef.current = neighborNodeIds;
  groupFilterRef.current = activeGroupFilter;
  isLiveSpeakingRef.current = isLiveSpeaking;
  onSelectRef.current = onSelectNode;
  onHoverRef.current = onHoverNode;

  // Imperative scene sync bridges stored in refs
  const syncGraphRef = useRef<((newbornId?: number | null) => void) | null>(null);
  const triggerFlightRef = useRef<((req: FocusRequest) => void) | null>(null);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    // 1. Software WebGL detection
    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 3. Scene, fog, studio environment
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x050811, 0.0026);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // 4. Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(
      52,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.5,
      600,
    );
    camera.position.set(0, 26, 74);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 8;
    controls.maxDistance = 155;
    controls.target.set(0, 0, 0);

    // 5. Studio 3-point warm/cool lighting rig
    const keyLight = new THREE.DirectionalLight(0xffead2, 2.0);
    keyLight.position.set(35, 48, 32);
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x7cc4ff, 0x090e1a, 0.85);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
    rimLight.position.set(-40, -18, -35);
    scene.add(rimLight);

    const corePointLight = new THREE.PointLight(0x38bdf8, 22, 65, 1.6);
    corePointLight.position.set(0, 0, 0);
    scene.add(corePointLight);

    // 6. Starfield (InstancedMesh, 720 stars)
    const starCount = 720;
    const starGeo = new THREE.OctahedronGeometry(0.18, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const starField = new THREE.InstancedMesh(starGeo, starMat, starCount);
    const starPalette = [0xe2e8f0, 0xbae6fd, 0xfef3c7, 0xc7d2fe];

    for (let i = 0; i < starCount; i++) {
      const r = 95 + Math.random() * 170;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      _dummy.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
      );
      _dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      _dummy.scale.setScalar(0.5 + Math.random() * 1.4);
      _dummy.updateMatrix();
      starField.setMatrixAt(i, _dummy.matrix);
      _colorA.setHex(starPalette[i % starPalette.length]);
      starField.setColorAt(i, _colorA);
    }
    starField.instanceMatrix.needsUpdate = true;
    if (starField.instanceColor) starField.instanceColor.needsUpdate = true;
    starField.computeBoundingSphere();
    scene.add(starField);

    // 7. Composite Central Arc Core
    const arcCore = createCentralArcCore(isSoftwareGl);
    scene.add(arcCore.root);

    // 8. Galaxy group (nodes + links + birth pulse ring)
    const galaxyGroup = new THREE.Group();
    scene.add(galaxyGroup);

    const positionsMap = new Map<number, Vec3Pos>();
    const nodeVisuals = new Map<number, NodeVisual>();
    const hitMeshes: THREE.Mesh[] = [];

    // Shared node geometries
    const nodeCoreGeo = new THREE.IcosahedronGeometry(0.75, 2);
    const nodeRingGeo = new THREE.TorusGeometry(1.18, 0.055, 10, 36);
    const nodeHitGeo = new THREE.SphereGeometry(1.75, 10, 10);
    const hitInvisibleMat = new THREE.MeshBasicMaterial({ visible: false });

    // Birth glow shockwave ring
    const pulseRingGeo = new THREE.TorusGeometry(1.6, 0.09, 12, 48);
    const pulseRingMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const pulseRing = new THREE.Mesh(pulseRingGeo, pulseRingMat);
    pulseRing.visible = false;
    galaxyGroup.add(pulseRing);

    let activePulse = { active: false, elapsed: 0, targetNodeId: -1 };

    // Link LineSegments container
    let linkLines: THREE.LineSegments | null = null;
    let linkGeo: THREE.BufferGeometry | null = null;
    const linkMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    const rebuildGalaxyObjects = (newbornId?: number | null) => {
      const curNodes = nodesRef.current;
      const curLinks = linksRef.current;

      // Compute layout preserving existing coordinates when adding a newborn star
      if (positionsMap.size === 0 && curNodes.length > 0) {
        const computed = computeGalaxyLayout(curNodes, curLinks);
        computed.forEach((v, k) => positionsMap.set(k, v));
      } else {
        for (const n of curNodes) {
          if (!positionsMap.has(n.id)) {
            const relLink = curLinks.find((l) => l.source === n.id || l.target === n.id);
            const relatedId = relLink
              ? relLink.source === n.id
                ? relLink.target
                : relLink.source
              : null;
            positionsMap.set(n.id, computeNewbornPosition(positionsMap, relatedId, n.id));
          }
        }
      }

      // Remove old node meshes
      for (const visual of nodeVisuals.values()) {
        galaxyGroup.remove(visual.group);
        (visual.coreMesh.material as THREE.Material).dispose();
        (visual.ringMesh.material as THREE.Material).dispose();
      }
      nodeVisuals.clear();
      hitMeshes.length = 0;

      // Degree counts for subtle node sizing
      const degreeMap = new Map<number, number>();
      for (const l of curLinks) {
        degreeMap.set(l.source, (degreeMap.get(l.source) ?? 0) + 1);
        degreeMap.set(l.target, (degreeMap.get(l.target) ?? 0) + 1);
      }

      for (const node of curNodes) {
        const pos = positionsMap.get(node.id) ?? { x: 0, y: 0, z: 0 };
        const style = getGroupStyle(node.group);
        const degree = degreeMap.get(node.id) ?? 1;
        const sizeScale = 0.85 + Math.min(degree, 8) * 0.08;

        const nodeGroup = new THREE.Group();
        nodeGroup.position.set(pos.x, pos.y, pos.z);

        const coreMat = new THREE.MeshStandardMaterial({
          color: style.colorInt,
          emissive: style.colorInt,
          emissiveIntensity: 0.75,
          metalness: 0.25,
          roughness: 0.25,
        });
        const coreMesh = new THREE.Mesh(nodeCoreGeo, coreMat);
        coreMesh.scale.setScalar(sizeScale);
        nodeGroup.add(coreMesh);

        const ringMat = new THREE.MeshStandardMaterial({
          color: style.colorInt,
          emissive: style.colorInt,
          emissiveIntensity: 0.35,
          metalness: 0.85,
          roughness: 0.22,
          transparent: true,
          opacity: 0.45,
        });
        const ringMesh = new THREE.Mesh(nodeRingGeo, ringMat);
        ringMesh.scale.setScalar(sizeScale);
        ringMesh.rotation.x = Math.PI * 0.35;
        nodeGroup.add(ringMesh);

        const hitMesh = new THREE.Mesh(nodeHitGeo, hitInvisibleMat);
        hitMesh.layers.set(1);
        hitMesh.userData.nodeId = node.id;
        nodeGroup.add(hitMesh);
        hitMeshes.push(hitMesh);

        galaxyGroup.add(nodeGroup);

        nodeVisuals.set(node.id, {
          id: node.id,
          group: nodeGroup,
          coreMesh,
          ringMesh,
          hitMesh,
          baseColor: new THREE.Color(style.colorInt),
          basePos: new THREE.Vector3(pos.x, pos.y, pos.z),
          phase: (node.id * 1.37) % (Math.PI * 2),
          degree,
        });
      }

      // Rebuild link LineSegments
      if (linkLines) {
        galaxyGroup.remove(linkLines);
        linkGeo?.dispose();
      }
      const posArr = new Float32Array(curLinks.length * 6);
      const colArr = new Float32Array(curLinks.length * 6);
      linkGeo = new THREE.BufferGeometry();
      linkGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      linkGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      linkLines = new THREE.LineSegments(linkGeo, linkMat);
      linkLines.frustumCulled = false;
      galaxyGroup.add(linkLines);

      if (typeof newbornId === 'number' && nodeVisuals.has(newbornId)) {
        activePulse = { active: true, elapsed: 0, targetNodeId: newbornId };
        pulseRing.visible = true;
      }
    };

    syncGraphRef.current = rebuildGalaxyObjects;
    rebuildGalaxyObjects();

    // 9. Smooth camera flight state
    const flight = {
      active: false,
      targetCamPos: new THREE.Vector3(),
      targetLookAt: new THREE.Vector3(),
    };

    const startFlight = (req: FocusRequest) => {
      if (req.mode === 'overview' || req.nodeIds.length === 0) {
        flight.targetLookAt.set(0, 0, 0);
        flight.targetCamPos.set(0, 26, 74);
        flight.active = true;
        return;
      }

      if (req.mode === 'cluster' && req.nodeIds.length >= 4) {
        // Compute centroid of cluster and frame all nodes comfortably
        _vec3A.set(0, 0, 0);
        let count = 0;
        for (const id of req.nodeIds) {
          const v = nodeVisuals.get(id);
          if (v) {
            v.group.getWorldPosition(_vec3B);
            _vec3A.add(_vec3B);
            count++;
          }
        }
        if (count === 0) return;
        _vec3A.divideScalar(count);

        // Compute spread radius
        let maxDist = 14;
        for (const id of req.nodeIds) {
          const v = nodeVisuals.get(id);
          if (v) {
            v.group.getWorldPosition(_vec3B);
            const d = _vec3B.distanceTo(_vec3A);
            if (d > maxDist) maxDist = d;
          }
        }

        flight.targetLookAt.copy(_vec3A);
        _vec3C.copy(_vec3A).normalize();
        if (_vec3C.lengthSq() < 0.01) _vec3C.set(0, 0.3, 1).normalize();
        const camDist = Math.min(82, Math.max(32, maxDist * 1.65));
        flight.targetCamPos.copy(_vec3A).addScaledVector(_vec3C, camDist);
        flight.targetCamPos.y += 12;
        flight.active = true;
        return;
      }

      // Single-node fly-to-source dive
      const primaryId = req.nodeIds[0];
      const visual = nodeVisuals.get(primaryId);
      if (!visual) return;

      visual.group.getWorldPosition(_vec3A);
      flight.targetLookAt.copy(_vec3A);

      // Approach slightly offset from radial vector so the central core stays visible in depth
      _vec3B.copy(_vec3A);
      if (_vec3B.lengthSq() < 0.01) _vec3B.set(0, 0, 1);
      _vec3B.normalize();
      flight.targetCamPos.copy(_vec3A).addScaledVector(_vec3B, 14);
      flight.targetCamPos.y += 4.2;
      flight.active = true;
    };

    triggerFlightRef.current = startFlight;

    // User interaction immediately cancels scripted flight
    const onControlsStart = () => {
      flight.active = false;
    };
    controls.addEventListener('start', onControlsStart);

    // 10. Throttled raycasting for hover & click
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverCheck = 0;
    let currentHoveredId: number | null = null;

    const updatePointer = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (ev: PointerEvent) => {
      pointerDownPos = { x: ev.clientX, y: ev.clientY };
    };

    const onPointerUp = (ev: PointerEvent) => {
      const dx = ev.clientX - pointerDownPos.x;
      const dy = ev.clientY - pointerDownPos.y;
      if (dx * dx + dy * dy > 36) return; // Dragged camera, not a click

      updatePointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      if (hits.length > 0) {
        const nodeId = hits[0].object.userData.nodeId;
        if (typeof nodeId === 'number') {
          onSelectRef.current(nodeId);
        }
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 32) return;
      lastHoverCheck = now;

      updatePointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);

      if (hits.length > 0) {
        const nodeId = hits[0].object.userData.nodeId as number;
        const node = nodesRef.current.find((n) => n.id === nodeId);
        const visual = nodeVisuals.get(nodeId);
        if (node && visual) {
          currentHoveredId = nodeId;
          renderer.domElement.style.cursor = 'pointer';
          visual.group.getWorldPosition(_vec3A);
          _vec3A.project(camera);
          const rect = renderer.domElement.getBoundingClientRect();
          const sx = ((_vec3A.x + 1) / 2) * rect.width;
          const sy = ((-_vec3A.y + 1) / 2) * rect.height;
          onHoverRef.current({ node, x: sx, y: sy });
          return;
        }
      }

      if (currentHoveredId !== null) {
        currentHoveredId = null;
        renderer.domElement.style.cursor = 'grab';
        onHoverRef.current(null);
      }
    };

    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    // 11. WebGL context loss safety
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // 12. Resize handler
    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Pre-warm shaders on GPU
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 13. Continuous 60fps loop with software-WebGL afterDraw pacing
    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      // Slow idle orbital drift on central core and gentle galaxy float
      arcCore.outerGimbal.rotation.y += dt * 0.22;
      arcCore.innerRing.rotation.z -= dt * 0.35;
      arcCore.plasmaCore.rotation.y += dt * 0.45;
      const coreScale = isLiveSpeakingRef.current
        ? 1.0 + Math.sin(elapsed * 9.0) * 0.12
        : 1.0 + Math.sin(elapsed * 1.8) * 0.04;
      arcCore.plasmaCore.scale.setScalar(coreScale);
      corePointLight.intensity = isLiveSpeakingRef.current ? 34 : 22;

      // Subtle idle rotation when user is not flying into a specific node
      if (!flight.active && selectedRef.current === null && highlightedRef.current.length === 0) {
        galaxyGroup.rotation.y += dt * 0.028;
      }

      const selId = selectedRef.current;
      const highSet = new Set(highlightedRef.current);
      const neighSet = new Set(neighborRef.current);
      const filterGroup = groupFilterRef.current;
      const hasFocus = selId !== null || highSet.size > 0;

      // Update node visuals & gentle vertical breathing
      for (const visual of nodeVisuals.values()) {
        const nodeObj = nodesRef.current.find((n) => n.id === visual.id);
        const matchesGroup = !filterGroup || nodeObj?.group === filterGroup;

        // Gentle idle drift
        const bob = Math.sin(elapsed * 0.85 + visual.phase) * 0.32;
        visual.group.position.set(visual.basePos.x, visual.basePos.y + bob, visual.basePos.z);

        const isSelected = visual.id === selId;
        const isHighlighted = highSet.has(visual.id);
        const isNeighbor = neighSet.has(visual.id);
        const isHovered = visual.id === currentHoveredId;
        const isNewborn = activePulse.active && activePulse.targetNodeId === visual.id;

        const coreMat = visual.coreMesh.material as THREE.MeshStandardMaterial;
        const ringMat = visual.ringMesh.material as THREE.MeshStandardMaterial;

        let targetScale = 0.85 + Math.min(visual.degree, 8) * 0.08;
        let targetEmissive = 0.72;
        let ringOpacity = 0.35;

        if (!matchesGroup) {
          targetScale *= 0.65;
          targetEmissive = 0.18;
          ringOpacity = 0.08;
        } else if (isSelected || isHighlighted || isNewborn) {
          targetScale *= 1.48;
          targetEmissive = isNewborn ? 2.8 : 2.1;
          ringOpacity = 0.95;
          visual.ringMesh.rotation.z += dt * 1.6;
        } else if (isNeighbor || isHovered) {
          targetScale *= 1.24;
          targetEmissive = 1.45;
          ringOpacity = 0.78;
          visual.ringMesh.rotation.z += dt * 0.9;
        } else if (hasFocus) {
          targetScale *= 0.82;
          targetEmissive = 0.25;
          ringOpacity = 0.14;
        }

        const dampFactor = 1 - Math.exp(-8 * dt);
        visual.coreMesh.scale.lerp(_vec3A.setScalar(targetScale), dampFactor);
        visual.ringMesh.scale.lerp(_vec3B.setScalar(targetScale), dampFactor);
        coreMat.emissiveIntensity = THREE.MathUtils.lerp(coreMat.emissiveIntensity, targetEmissive, dampFactor);
        ringMat.opacity = THREE.MathUtils.lerp(ringMat.opacity, ringOpacity, dampFactor);
      }

      // Newborn star shockwave pulse
      if (activePulse.active) {
        activePulse.elapsed += dt;
        const t = activePulse.elapsed / 3.0;
        const newbornVisual = nodeVisuals.get(activePulse.targetNodeId);
        if (t >= 1 || !newbornVisual) {
          activePulse.active = false;
          pulseRing.visible = false;
        } else {
          pulseRing.position.copy(newbornVisual.group.position);
          pulseRing.lookAt(camera.position);
          const expand = 1 + t * 4.5;
          pulseRing.scale.setScalar(expand);
          pulseRingMat.opacity = (1 - t) * 0.85;
        }
      }

      // Update link segment positions & colors in-place (zero allocations)
      if (linkGeo) {
        const posAttr = linkGeo.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = linkGeo.getAttribute('color') as THREE.BufferAttribute;
        const curLinks = linksRef.current;

        for (let i = 0; i < curLinks.length; i++) {
          const link = curLinks[i];
          const va = nodeVisuals.get(link.source);
          const vb = nodeVisuals.get(link.target);
          if (!va || !vb) continue;

          posAttr.setXYZ(i * 2, va.group.position.x, va.group.position.y, va.group.position.z);
          posAttr.setXYZ(i * 2 + 1, vb.group.position.x, vb.group.position.y, vb.group.position.z);

          const srcActive = link.source === selId || highSet.has(link.source);
          const dstActive = link.target === selId || highSet.has(link.target);

          if (srcActive || dstActive) {
            const activeVisual = srcActive ? va : vb;
            _colorA.copy(activeVisual.baseColor).multiplyScalar(1.35);
            _colorB.copy(activeVisual.baseColor).multiplyScalar(0.95);
          } else if (hasFocus) {
            _colorA.setHex(0x131d33);
            _colorB.setHex(0x131d33);
          } else {
            _colorA.setHex(0x283a5c);
            _colorB.setHex(0x1e2c48);
          }

          colAttr.setXYZ(i * 2, _colorA.r, _colorA.g, _colorA.b);
          colAttr.setXYZ(i * 2 + 1, _colorB.r, _colorB.g, _colorB.b);
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }

      // Smooth damped camera flight
      if (flight.active) {
        const k = 1 - Math.exp(-3.6 * dt);
        camera.position.lerp(flight.targetCamPos, k);
        controls.target.lerp(flight.targetLookAt, k);
        if (
          camera.position.distanceTo(flight.targetCamPos) < 0.2 &&
          controls.target.distanceTo(flight.targetLookAt) < 0.2
        ) {
          flight.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    onRegisterCapture?.(() => {
      if (disposed) return null;
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    });

    return () => {
      disposed = true;
      onRegisterCapture?.(() => null);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlsStart);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      controls.dispose();
      envTexture.dispose();
      starGeo.dispose();
      starMat.dispose();
      nodeCoreGeo.dispose();
      nodeRingGeo.dispose();
      nodeHitGeo.dispose();
      hitInvisibleMat.dispose();
      pulseRingGeo.dispose();
      pulseRingMat.dispose();
      linkGeo?.dispose();
      linkMat.dispose();

      for (const visual of nodeVisuals.values()) {
        (visual.coreMesh.material as THREE.Material).dispose();
        (visual.ringMesh.material as THREE.Material).dispose();
      }

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Re-sync 3D nodes & links when graph changes (e.g. Total Recall live node birth)
  useEffect(() => {
    const newborn = nodes.find((n) => n.isNewborn);
    syncGraphRef.current?.(newborn ? newborn.id : null);
  }, [nodes, links]);

  // Trigger camera flight when focusRequest updates
  useEffect(() => {
    if (focusRequest) {
      triggerFlightRef.current?.(focusRequest);
    }
  }, [focusRequest]);

  return (
    <div className="fixed inset-0 w-full h-full bg-[#050811]">
      <div ref={canvasMountRef} className="w-full h-full" />
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#050811]/95 text-slate-200 z-30">
          <div className="text-center max-w-sm px-6">
            <p className="font-display text-lg font-semibold">Graphics Context Paused</p>
            <p className="mt-2 text-sm text-slate-400">
              Your browser suspended WebGL rendering. Restoring the 3D galaxy automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
