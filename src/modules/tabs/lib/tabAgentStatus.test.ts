import { useAgentActivityStore } from '@/modules/terminal/lib/agentActivity';
import { beforeEach, describe, expect, it } from 'vitest';
import { shallow } from 'zustand/shallow';
import { NO_AGENT_STATUS, selectSpaceAgentState, selectTabAgentStatus } from './tabAgentStatus';

const select = (ptyIds: readonly number[]) =>
  selectTabAgentStatus(useAgentActivityStore.getState(), ptyIds);

beforeEach(() => {
  useAgentActivityStore.setState({ phases: {}, agents: {} });
});

describe('selectTabAgentStatus', () => {
  it('returns the shared empty status without scanning for tabs with no ptys', () => {
    expect(select([])).toBe(NO_AGENT_STATUS);
  });

  it("reflects only the tab's own ptys", () => {
    const store = useAgentActivityStore.getState();
    store.setPhase(2, 'working');
    store.setAgent(2, 'claude');
    expect(select([1])).toEqual({ state: null, agent: null });
    expect(select([1, 2])).toEqual({ state: 'working', agent: 'claude' });
  });

  it('stays shallow-equal when an unrelated pty changes, so the tab skips re-rendering', () => {
    const store = useAgentActivityStore.getState();
    store.setPhase(1, 'working');
    store.setAgent(1, 'codex');
    const before = select([1]);

    store.setPhase(2, 'attention');
    store.setAgent(2, 'claude');
    store.setPhase(3, 'finished');
    store.clear(3);

    expect(shallow(before, select([1]))).toBe(true);
  });

  it("changes when the tab's own pty changes phase", () => {
    const store = useAgentActivityStore.getState();
    store.setPhase(1, 'working');
    const before = select([1]);
    store.setPhase(1, 'attention');
    expect(shallow(before, select([1]))).toBe(false);
  });
});

describe('selectSpaceAgentState', () => {
  const space = (ptyIds: readonly number[]) =>
    selectSpaceAgentState(useAgentActivityStore.getState(), ptyIds);

  it('shows nothing for a space with no ptys, idle agents or only working ones', () => {
    const store = useAgentActivityStore.getState();
    expect(space([])).toBeNull();
    store.setPhase(1, 'idle');
    store.setPhase(2, 'working');
    expect(space([1, 2])).toBeNull();
  });

  it('shows a finished response, and a request for attention over it', () => {
    const store = useAgentActivityStore.getState();
    store.setPhase(1, 'finished');
    store.setPhase(2, 'working');
    expect(space([1, 2])).toBe('finished');
    store.setPhase(3, 'attention');
    expect(space([1, 2, 3])).toBe('attention');
    expect(space([3, 1])).toBe('attention');
  });

  it("reflects only the space's own ptys", () => {
    useAgentActivityStore.getState().setPhase(4, 'attention');
    expect(space([1, 2])).toBeNull();
  });
});
