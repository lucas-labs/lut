import {
  type AgentLaunchRequest,
  findAgentLauncher,
  validateAgentLaunchCommand,
} from '@/modules/agents';
import { whenSessionReady, writeToSession } from '@/modules/terminal';
import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';

type AgentLaunchArgs = {
  inheritedCwdForNewTab: () => string | undefined;
  newAgentGroupTab: (
    cwd: string | undefined,
    title: string,
    instances: AgentLaunchRequest['instances'],
  ) => { leafIds: number[] };
};

/** Opens an agent group tab and starts the agent in each of its terminals (E09-03). */
export function useAgentLaunch({ inheritedCwdForNewTab, newAgentGroupTab }: AgentLaunchArgs) {
  return useCallback(
    (request: AgentLaunchRequest) => {
      const command = validateAgentLaunchCommand(request.command);
      if (!command.ok) return;
      const launcher = findAgentLauncher(request.agent);
      const title =
        request.instances === 1 ? launcher.label : `${launcher.label} × ${request.instances}`;
      const { leafIds: agentLeafIds } = newAgentGroupTab(
        inheritedCwdForNewTab(),
        title,
        request.instances,
      );
      const hooksReady = launcher.supportsHooks
        ? invoke('agent_enable_hooks', {
            agent: request.agent,
          }).catch((error) => {
            console.warn(`[lut] could not enable ${request.agent} notifications:`, error);
          })
        : Promise.resolve();

      for (const leafId of agentLeafIds) {
        void (async () => {
          await Promise.all([whenSessionReady(leafId), hooksReady]);
          if (!writeToSession(leafId, `${command.command}\r`)) {
            console.error(`[lut] agent terminal ${leafId} closed before launch`);
          }
        })();
      }
    },
    [inheritedCwdForNewTab, newAgentGroupTab],
  );
}
