import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSceneSync, SCENE_SYNC_MS } from "./sceneSync";

describe("createSceneSync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("exports a 100ms interval as the documented constant", () => {
    expect(SCENE_SYNC_MS).toBe(100);
  });

  it("coalesces a burst of calls into a single notification", () => {
    const onChange = vi.fn();
    const sync = createSceneSync(onChange);
    for (let i = 0; i < 50; i++) sync();
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SCENE_SYNC_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not fire again until another call arrives", () => {
    const onChange = vi.fn();
    const sync = createSceneSync(onChange);
    sync();
    vi.advanceTimersByTime(SCENE_SYNC_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SCENE_SYNC_MS * 3);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("fires again once new calls arrive after the interval", () => {
    const onChange = vi.fn();
    const sync = createSceneSync(onChange);
    sync();
    vi.advanceTimersByTime(SCENE_SYNC_MS);
    sync();
    vi.advanceTimersByTime(SCENE_SYNC_MS);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("trailing call still fires when flushed mid-interval", () => {
    const onChange = vi.fn();
    const sync = createSceneSync(onChange);
    sync();
    sync.flush();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("dispose cancels a pending notification", () => {
    const onChange = vi.fn();
    const sync = createSceneSync(onChange);
    sync();
    sync.dispose();
    vi.advanceTimersByTime(SCENE_SYNC_MS * 5);
    expect(onChange).not.toHaveBeenCalled();
  });
});
