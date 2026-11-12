import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import type { Group } from 'three';
import monoFont from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff?url';
import type { Engine } from '@/platform/Engine';
import { useUiStore } from '@/store/ui';
import { scenePalette } from './palette';

/**
 * Billboarded team codes above each payload (Alpha, Chassis, Sort-2…). The font is bundled locally,
 * so the scene never fetches from a CDN. Positions follow the payloads every frame through refs.
 */
export function TeamLabels({ engine, teams }: { engine: Engine; teams: readonly string[] }): JSX.Element {
  const groups = useRef<(Group | null)[]>([]);
  const theme = useUiStore(s => s.theme);
  const palette = scenePalette(theme);

  useFrame(() => {
    for (let i = 0; i < teams.length; i++) {
      const g = groups.current[i];
      const load = engine.loads[i];
      if (!g || !load || load.spec.teamId !== teams[i]) continue;
      const p = load.physics.state;
      g.position.set(p.pose.x, p.pose.y, p.z + 0.95);
    }
  });

  return (
    <>
      {teams.map((id, i) => (
        <group key={id} ref={el => { groups.current[i] = el; }}>
          <Billboard>
            <Text
              font={monoFont}
              fontSize={0.26}
              anchorX="center"
              anchorY="bottom"
              color={palette.foreground}
              outlineWidth={0.018}
              outlineColor={palette.viewport}
              outlineOpacity={0.85}
            >
              {id}
            </Text>
          </Billboard>
        </group>
      ))}
    </>
  );
}
