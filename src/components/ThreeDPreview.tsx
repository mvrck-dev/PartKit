// src/components/ThreeDPreview.tsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface Pad {
  number: string;
  type: string;
  shape: string;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}

interface ThreeDPreviewProps {
  pads: Pad[];
  offset: { x: number; y: number; z: number };
  rotate: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export const ThreeDPreview: React.FC<ThreeDPreviewProps> = ({ pads, offset, rotate, scale }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const padsGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#000000');
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 15, 20);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight1.position.set(10, 20, 10);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-10, 5, -10);
    scene.add(dirLight2);

    // Substrate / Board Grid
    const boardGeometry = new THREE.BoxGeometry(30, 0.2, 30);
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.9,
      metalness: 0.1,
    });
    const board = new THREE.Mesh(boardGeometry, boardMaterial);
    board.position.y = -0.1;
    board.receiveShadow = true;
    scene.add(board);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(30, 30, 0xffffff, 0x222222);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Group for pads
    const padsGroup = new THREE.Group();
    scene.add(padsGroup);
    padsGroupRef.current = padsGroup;

    // Group for the 3D component model
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update pads representation when pads change
  useEffect(() => {
    const padsGroup = padsGroupRef.current;
    if (!padsGroup) return;

    // Clear previous pads
    while (padsGroup.children.length > 0) {
      padsGroup.remove(padsGroup.children[0]);
    }

    if (!pads || pads.length === 0) return;

    // Red copper pad material
    const padMaterial = new THREE.MeshStandardMaterial({
      color: 0xcd7f32, // copper color
      roughness: 0.3,
      metalness: 0.8,
    });

    pads.forEach((pad) => {
      // Create pad mesh
      // KiCad coordinates are in mm. Size w and h are in mm.
      // We map: X -> X, Y -> -Y (downwards in KiCad)
      const w = pad.w || 1;
      const h = pad.h || 1;
      const padGeo = new THREE.BoxGeometry(w, 0.05, h);
      const mesh = new THREE.Mesh(padGeo, padMaterial);
      
      mesh.position.set(pad.x, 0.025, pad.y); // Use Y for Z in 3D grid plane
      mesh.rotation.y = -THREE.MathUtils.degToRad(pad.angle || 0);
      padsGroup.add(mesh);
    });
  }, [pads]);

  // Update model rendering and offsets
  useEffect(() => {
    const modelGroup = modelGroupRef.current;
    if (!modelGroup) return;

    // Clear previous model children
    while (modelGroup.children.length > 0) {
      modelGroup.remove(modelGroup.children[0]);
    }

    // Draw procedural chip model based on footprint bounds
    if (pads && pads.length > 0) {
      // Find bounding box of pads
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      pads.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });

      // Calculate approximate body dimensions
      const padSpanX = maxX - minX;
      const padSpanY = maxY - minY;
      
      const bodyW = Math.max(padSpanX * 0.8, 2);
      const bodyH = Math.max(padSpanY * 0.8, 2);
      const bodyThickness = 1.2;

      // Create chip body group (this group gets scaled)
      const bodyGroup = new THREE.Group();

      // Main plastic package body
      const chipGeo = new THREE.BoxGeometry(bodyW, bodyThickness, bodyH);
      const chipMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a, // Dark grey plastic
        roughness: 0.7,
        metalness: 0.1,
      });
      const chipBody = new THREE.Mesh(chipGeo, chipMat);
      chipBody.position.y = bodyThickness / 2;
      chipBody.castShadow = true;
      chipBody.receiveShadow = true;
      bodyGroup.add(chipBody);

      // Pin 1 indicator dot (silver)
      const dotGeo = new THREE.CylinderGeometry(bodyW * 0.04, bodyW * 0.04, 0.02, 16);
      const dotMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
      const indicatorDot = new THREE.Mesh(dotGeo, dotMat);
      indicatorDot.position.set(-bodyW / 2 + bodyW * 0.12, bodyThickness + 0.01, -bodyH / 2 + bodyH * 0.12);
      bodyGroup.add(indicatorDot);

      // Add silver metal leads/pins extending from body to pads
      const pinMaterial = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        metalness: 0.9,
        roughness: 0.2,
      });

      pads.forEach((pad) => {
        // Create small metallic pins from chip edge to pads
        const pinW = Math.min(pad.w, 0.4);
        const pinGeo = new THREE.BoxGeometry(pinW, 0.1, 1.2);
        const pin = new THREE.Mesh(pinGeo, pinMaterial);
        
        // Position pin extending outwards from body towards pad location
        // Let's place it at pad coordinate but slightly elevated
        pin.position.set(pad.x, 0.2, pad.y);
        bodyGroup.add(pin);
      });

      modelGroup.add(bodyGroup);
    } else {
      // Fallback: simple beautiful preview box if no pads
      const fallbackGeo = new THREE.BoxGeometry(4, 1.5, 4);
      const fallbackMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.5,
        metalness: 0.2,
      });
      const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
      fallbackMesh.position.y = 0.75;
      modelGroup.add(fallbackMesh);
    }
  }, [pads]);

  // Apply slider modifications (Offset, Rotation, Scale)
  useEffect(() => {
    const modelGroup = modelGroupRef.current;
    if (!modelGroup) return;

    // Apply offset
    // Note: KiCad offsets: X and Y are in mm, Z is usually in mm.
    // In KiCad footprint: Y is downwards, so we negate it for Three.js Z axis
    // KiCad Z matches Three.js Y (height)
    modelGroup.position.set(offset.x, offset.z, offset.y);

    // Apply rotation (convert degrees to radians)
    modelGroup.rotation.set(
      THREE.MathUtils.degToRad(rotate.x),
      THREE.MathUtils.degToRad(rotate.z),
      -THREE.MathUtils.degToRad(rotate.y)
    );

    // Apply scale
    modelGroup.scale.set(scale.x, scale.z, scale.y);
  }, [offset, rotate, scale]);

  return (
    <div className="relative w-full h-full min-h-0">
      <div ref={containerRef} className="w-full h-full overflow-hidden border border-[#333333]" />
      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black border border-[#333333] text-[9px] font-mono text-[#888888] pointer-events-none select-none">
        3D VIEW [DRAG_TO_ROTATE]
      </div>
    </div>
  );
};
