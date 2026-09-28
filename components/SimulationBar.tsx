"use client";

/**
 * Simulation clock bar (blueprint §6.1).
 * Sprint 1 will wire these controls to lib/clock.ts + the Rapier loop.
 * For now the buttons are local UI state so the /physics route has a
 * working shell that the engine can attach to.
 */
export interface SimState {
  playing: boolean;
  speed: number;
  stepCount: number;
}

export default function SimulationBar({
  sim,
  onChange,
  onReset,
}: {
  sim: SimState;
  onChange: (next: SimState) => void;
  onReset: () => void;
}) {
  return (
    <div className="sim-bar" role="toolbar" aria-label="Simulation controls">
      <button
        type="button"
        className="mini"
        onClick={onReset}
        title="Reset world to the start of the experiment"
      >
        ⏪ Reset
      </button>
      <button
        type="button"
        className="mini"
        aria-pressed={sim.playing}
        onClick={() => onChange({ ...sim, playing: !sim.playing })}
        title="Play / pause the fixed-timestep clock"
      >
        {sim.playing ? "⏸ Pause" : "▶ Play"}
      </button>
      <button
        type="button"
        className="mini"
        onClick={() =>
          onChange({
            ...sim,
            speed: sim.speed === 1 ? 0.25 : 1,
          })
        }
        title="Toggle 1x / 0.25x slow motion"
      >
        {sim.speed === 1 ? "⏩ 1x" : "⏩ 0.25x"}
      </button>
      <button
        type="button"
        className="mini"
        onClick={() => onChange({ ...sim, stepCount: sim.stepCount + 1 })}
        title="Advance one 16.67ms tick while paused"
      >
        ⏭ Step{sim.stepCount > 0 ? ` ${sim.stepCount}` : ""}
      </button>
    </div>
  );
}
