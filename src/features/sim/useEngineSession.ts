import { useEffect, useRef, useState } from 'react';
import { Engine } from '@/platform/Engine';
import type { MissionDef } from '@/app/missions';
import { useUiStore, type CameraMode, type Selection } from '@/store/ui';
import type { GamepadFocus } from '@/contracts/types';
import { createTrendBuffers } from '@/features/telemetry/rows';
import { getPad } from './pad';
import { buildSnapshot } from './snapshot';
import { EMPTY_SNAPSHOT, useSimStore } from './simStore';

export const TELEMETRY_INTERVAL_MS = 250;

const CAMERA_CYCLE: readonly CameraMode[] = ['orbit', 'top', 'auto'];
const focusKey = (f: GamepadFocus): string => (f.kind === 'agent' ? `a${f.agentId}` : `t${f.teamId}`);

/**
 * Owns the Engine for one mission screen:
 *  - creates / disposes it when the mission, seed or restart token changes;
 *  - publishes a 4 Hz snapshot to the sim store (React never reads the engine per frame);
 *  - keeps UI settings, the gamepad driver and the engine in sync in both directions.
 */
export function useEngineSession(mission: MissionDef): Engine | null {
  const seed = useUiStore(s => s.seed);
  const restartToken = useUiStore(s => s.restartToken);
  const [engine, setEngine] = useState<Engine | null>(null);
  const lastMission = useRef<string | null>(null);

  useEffect(() => {
    const pad = getPad();
    const ui = useUiStore.getState();
    const e = new Engine(pad, mission.mode, seed);
    const freshMission = lastMission.current !== mission.id;
    lastMission.current = mission.id;

    // Settings: a new mission adopts the engine's defaults; a restart keeps the operator's choices.
    if (freshMission) useUiStore.setState({ lossP: e.lossP });
    else e.setLossP(ui.lossP);
    e.diagnostics = ui.overlay;
    pad.setState({ controller: ui.controller, powerLimit: ui.powerLimit, paused: false });

    useSimStore.setState({ engine: e, snap: EMPTY_SNAPSHOT });
    setEngine(e);

    // Pad focus (Tab, LB/RB, Y) → selection. Initialised when the engine becomes ready so the
    // mission's default focus does not fly the camera away on load.
    let padFocus: string | null = null;
    const buffers = { trends: createTrendBuffers() };
    const poll = (): void => {
      if (e.disposed) return;
      if (e.workflow) e.workflow.learning = useUiStore.getState().routeLearning;
      if(import.meta.env.DEV)Object.assign(window,{__talosEngine:e});
      useSimStore.setState({ snap: buildSnapshot(e, buffers) });
      if (e.phase !== 'ready') return;
      const f = pad.getSnapshot().focus, key = focusKey(f);
      if (padFocus === null) { padFocus = key; return; }
      if (key !== padFocus) {
        padFocus = key;
        useUiStore.getState().select(f.kind === 'agent' ? { kind: 'agent', id: f.agentId } : { kind: 'team', id: f.teamId });
      }
    };
    poll();
    const timer = setInterval(poll, TELEMETRY_INTERVAL_MS);

    // Gamepad buttons (X controller, D-pad power, START pause, R3 camera) → UI store.
    let prevPad = pad.getSnapshot();
    const offPad = pad.subscribe(() => {
      const s = pad.getSnapshot(), st = useUiStore.getState();
      const patch: Partial<Pick<typeof st, 'controller' | 'powerLimit' | 'paused' | 'camera'>> = {};
      if (s.controller !== prevPad.controller && s.controller !== st.controller) patch.controller = s.controller;
      if (s.powerLimit !== prevPad.powerLimit && s.powerLimit !== st.powerLimit) patch.powerLimit = s.powerLimit;
      if (s.paused !== prevPad.paused && s.paused !== st.paused) patch.paused = s.paused;
      if (s.camera !== prevPad.camera) patch.camera = CAMERA_CYCLE[(CAMERA_CYCLE.indexOf(st.camera) + 1) % CAMERA_CYCLE.length];
      prevPad = s;
      if (Object.keys(patch).length) useUiStore.setState(patch);
    });

    // UI store → gamepad driver / engine.
    const offUi = useUiStore.subscribe((st, prev) => {
      if (st.controller !== prev.controller) pad.setState({ controller: st.controller });
      if (st.powerLimit !== prev.powerLimit) pad.setState({ powerLimit: st.powerLimit });
      if (st.paused !== prev.paused) pad.setState({ paused: st.paused });
      if (st.lossP !== prev.lossP) e.setLossP(st.lossP);
      if (st.overlay !== prev.overlay) e.diagnostics = st.overlay;
      if (st.selection !== prev.selection && e.ready) driveFocus(e, st.selection, key => { padFocus = key; });
    });

    return () => {
      clearInterval(timer);
      offPad();
      offUi();
      e.dispose();
      useSimStore.setState({ engine: null, snap: EMPTY_SNAPSHOT });
    };
  }, [mission.id, mission.mode, seed, restartToken]);

  return engine;
}

/** Selecting a robot or team in the UI also hands the keyboard / gamepad to that team. */
function driveFocus(e: Engine, selection: Selection, remember: (key: string) => void): void {
  if (!selection) return;
  const pad = e.pad;
  if (e.mode === 0) {
    if (selection.kind === 'agent') { pad.setState({ focus: { kind: 'agent', agentId: selection.id } }); remember(`a${selection.id}`); }
    return;
  }
  const team = selection.kind === 'team' ? selection.id : e.teamOf(selection.id);
  if (!team) return;
  pad.setState({ focus: { kind: 'swarm', teamId: team } });
  remember(`t${team}`);
}
