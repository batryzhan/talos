import { useState } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';

/**
 * Restrained post-processing: ambient occlusion for contact grounding, a soft bloom that only
 * catches emissive status lights (threshold 1), light vignette and film grain, ACES tone mapping.
 * A performance monitor drops AO, MSAA and pixel ratio when the frame rate declines.
 */
export function Effects(): JSX.Element {
  const [degraded, setDegraded] = useState(false);
  const setDpr = useThree(s => s.setDpr);

  const decline = (): void => {
    setDegraded(true);
    setDpr(1);
  };

  return (
    <>
      <PerformanceMonitor onDecline={decline} onFallback={decline} flipflops={3} />
      {degraded ? (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.3} />
          <Vignette offset={0.3} darkness={0.4} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={4}>
          <N8AO halfRes aoRadius={0.6} distanceFalloff={0.6} intensity={1.6} quality="performance" />
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.3} />
          <Vignette offset={0.3} darkness={0.4} />
          <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.18} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </>
  );
}
