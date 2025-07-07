import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';

function RocketModel() {
  const { scene } = useGLTF('/rocket_model.gltf');
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (meshRef.current) {
      // Add a more noticeable up and down floating motion
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.3;
      // Add a slight forward and backward motion for more natural movement
      meshRef.current.position.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.05;
      // Add gentle rotation around Z-axis for more dynamic feel
      meshRef.current.rotation.z = -Math.PI / 2 + Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  return (
    <group ref={meshRef} scale={0.8} position={[0, -1, 0]}>
      <primitive object={scene} />
    </group>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#666" />
    </mesh>
  );
}

function RocketScene() {
  return (
    <div className="w-[400px] h-[400px] relative">
      <Canvas
        camera={{ position: [0, 0, 25], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        {/* Lighting setup for metallic appearance */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1.2}
        />
        <pointLight position={[-10, -10, -5]} intensity={0.5} color="#4a90e2" />
        <pointLight position={[10, -5, 0]} intensity={0.3} color="#ffffff" />
        
        {/* Environment for reflections on metallic surface */}
        <Environment preset="city" />
        
        <Suspense fallback={<LoadingFallback />}>
          <RocketModel />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Preload the model for better performance
useGLTF.preload('/rocket_model.gltf');

export default RocketScene;
