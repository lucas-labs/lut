import {
  type AgentTabStatus,
  tabAgentStatus,
  type useAgentActivityStore,
} from '@/modules/terminal/lib/agentActivity';

type ActivityState = Pick<ReturnType<typeof useAgentActivityStore.getState>, 'phases' | 'agents'>;

/** Shared result for tabs with no agent state (and for non-terminal tabs). */
export const NO_AGENT_STATUS: AgentTabStatus = Object.freeze({
  state: null,
  agent: null,
});

/**
 * One tab's agent status, derived from the global activity maps.
 *
 * Meant to be used as a store selector wrapped in `useShallow`: the maps change
 * whenever *any* pty changes phase, but a tab's `{ state, agent }` pair is two
 * primitives, so shallow equality keeps every other tab from re-rendering.
 * Subscribing to `phases`/`agents` directly would re-render all tabs on every
 * agent signal.
 */
export function selectTabAgentStatus(
  state: ActivityState,
  ptyIds: readonly number[],
): AgentTabStatus {
  if (ptyIds.length === 0) return NO_AGENT_STATUS;
  return tabAgentStatus(state.phases, state.agents, ptyIds);
}

/** What a space's button shows of its agents: one needing attention, or one whose response finished. */
export type SpaceAgentState = 'attention' | 'finished' | null;

/**
 * A space's agent state, over the ptys of every terminal in it: the most urgent wins, so a tab that needs attention
 * makes its space show it. A space shows no working agent, only what waits for the user.
 *
 * A string, so a store selector needs no `useShallow`: the space re-renders only when its own state changes.
 */
export function selectSpaceAgentState(
  state: ActivityState,
  ptyIds: readonly number[],
): SpaceAgentState {
  let finished = false;
  for (const id of ptyIds) {
    const phase = state.phases[id];
    if (phase === 'attention') return 'attention';
    if (phase === 'finished') finished = true;
  }
  return finished ? 'finished' : null;
}
