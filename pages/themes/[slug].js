import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const themes = [
  {
    slug: 'damashqi',
    title: '\u0627\u0644\u062b\u064a\u0645 \u0627\u0644\u062f\u0645\u0634\u0642\u064a',
    description: '\u062b\u064a\u0645 \u0639\u0631\u0628\u064a \u0628\u062a\u0635\u0645\u064a\u0645 \u062f\u0645\u0634\u0642\u064a',
    image: '/hero.png'
  },
  {
    slug: 'modern',
    title: '\u0627\u0644\u062b\u064a\u0645 \u0627\u0644\u0639\u0635\u0631\u064a',
    description: '\u062a\u0635\u0645\u064a\u0645 \u062d\u062f\u064a\u062b \u0648\u0623\u0646\u064a\u0642',
    image: '/hero.png'
  }
];

export default function ThemeDetail() {
  const router = useRouter();
  const { slug } = router.query;

  const theme = themes.find((t) => t.slug === slug);

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
      <meshStandardMaterial color={'#FF6F61'} />
    </mesh>
  );

  if (!theme) {
    return (
      <main className="container">
        <p>Theme not found.</p>
      </main>
    );
  }

  if (!CanvasComponent || !OrbitControlsComponent) {
    return (
      <main className="container">
        <h1>{theme.title}</h1>
        <p>Loading 3D preview...</p>
      </main>
    );
  }

  const Canvas = CanvasComponent;
  const OrbitControls = OrbitControlsComponent;

  return (
    <main className="container">
      <h1>{theme.title}</h1>
      <p>{theme.description}</p>
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
