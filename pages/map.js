import { useEffect, useState } from 'react';

export default function MapPage() {
  const [CanvasComponent, setCanvas] = useState(null);
  const [OrbitControlsComponent, setOrbitControls] = useState(null);

  useEffect(() => {
    async function load() {
      const fiber = await import('@react-three/fiber');
      const drei = await import('@react-three/drei');
      setCanvas(() => fiber.Canvas);
      setOrbitControls(() => drei.OrbitControls);
    }
    load();
  }, []);

  const Box = () => (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={'#00A8E8'} />
    </mesh>
  );

  if (!CanvasComponent || !OrbitControlsComponent) {
    return (
      <main className="container">
        <h1>Interactive Map</h1>
        <p>Loading 3D scene...</p>
      </main>
    );
  }

  const Canvas = CanvasComponent;
  const OrbitControls = OrbitControlsComponent;

  return (
    <main className="container">
      <h1>Interactive Map</h1>
      <div style={{ height: '60vh', width: '100%' }}>
        <Canvas camera={{ position: [0, 0, 5] }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          <Box />
          <OrbitControls />
        </Canvas>
      </div>
    </main>
  );
}
