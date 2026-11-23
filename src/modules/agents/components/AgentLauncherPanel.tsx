import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AgentIcon } from '@/modules/agents/lib/agentIcon';
import {
  AGENT_LAUNCHERS,
  type AgentInstanceCount,
  type AgentLaunchCommands,
  type AgentLauncherId,
  type AgentLaunchRequest,
  DEFAULT_AGENT_LAUNCH_COMMANDS,
  findAgentLauncher,
  validateAgentLaunchCommand,
} from '@/modules/agents/lib/launcher';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { setAgentLaunchCommands } from '@/modules/settings/store';
import { ChevronIcon, PlayIcon, RefreshIcon } from '@lut/lut-icons';
import { useEffect, useRef, useState } from 'react';

type Props = {
  onBack: () => void;
  onLaunch: (request: AgentLaunchRequest) => void;
};

const INSTANCE_COUNTS: AgentInstanceCount[] = [1, 2, 3, 4];

export function AgentLauncherPanel({ onBack, onLaunch }: Props) {
  const storedCommands = usePreferencesStore((s) => s.agentLaunchCommands);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const [agentId, setAgentId] = useState<AgentLauncherId>('claude');
  const [instances, setInstances] = useState<AgentInstanceCount>(2);
  const [drafts, setDrafts] = useState<AgentLaunchCommands>(storedCommands);
  const hydratedRef = useRef(hydrated);
  const persistedRef = useRef(storedCommands);
  const command = drafts[agentId];
  const validation = validateAgentLaunchCommand(command);
  const launcher = findAgentLauncher(agentId);

  useEffect(() => {
    if (!hydrated || hydratedRef.current) return;
    hydratedRef.current = true;
    persistedRef.current = storedCommands;
    setDrafts(storedCommands);
  }, [hydrated, storedCommands]);

  const save = (next: AgentLaunchCommands) => {
    const changed = AGENT_LAUNCHERS.some(({ id }) => next[id] !== persistedRef.current[id]);
    if (!changed) return;
    const previous = persistedRef.current;
    persistedRef.current = next;
    void setAgentLaunchCommands(next).catch((error) => {
      persistedRef.current = previous;
      console.error('[lut] failed to save agent launch commands:', error);
    });
  };

  const persist = (id: AgentLauncherId, value: string): AgentLaunchCommands | null => {
    const result = validateAgentLaunchCommand(value);
    if (!result.ok) return null;
    const next = { ...drafts, [id]: result.command };
    setDrafts(next);
    save(next);
    return next;
  };

  const selectAgent = (id: AgentLauncherId) => {
    persist(agentId, command);
    setAgentId(id);
  };

  const resetCommand = () => {
    const next = {
      ...drafts,
      [agentId]: DEFAULT_AGENT_LAUNCH_COMMANDS[agentId],
    };
    setDrafts(next);
    save(next);
  };

  const submit = () => {
    const next = persist(agentId, command);
    if (!next) return;
    onLaunch({
      agent: agentId,
      command: next[agentId],
      instances,
    });
  };

  return (
    <form
      className="animate-in fade-in-0 slide-in-from-right-2 duration-150"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex h-9 items-center gap-2 px-1">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to new tab menu">
          <ChevronIcon rotate={180} size="sm" />
        </Button>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground">Launch agents</div>
          <div className="text-[11px] text-muted-foreground">One workspace, up to four panes</div>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-1 border-t border-border pt-1.5">
        {AGENT_LAUNCHERS.map((agent) => {
          const selected = agent.id === agentId;
          return (
            <Button
              key={agent.id}
              variant="outline-hover"
              disabled={!hydrated}
              aria-pressed={selected}
              onClick={() => selectAgent(agent.id)}
              className="min-w-0 justify-start"
            >
              <AgentIcon
                agent={agent.id}
                size="md"
                className={cn('shrink-0', selected ? 'text-primary' : 'text-muted-foreground')}
              />
              <span className="truncate">{agent.label}</span>
            </Button>
          );
        })}
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1.5 text-[11px] text-muted-foreground">Instances</legend>
        <div className="grid grid-cols-4 gap-1">
          {INSTANCE_COUNTS.map((count) => (
            <Button
              key={count}
              variant="outline-hover"
              disabled={!hydrated}
              aria-label={`${count} ${count === 1 ? 'instance' : 'instances'}`}
              aria-pressed={instances === count}
              onClick={() => setInstances(count)}
            >
              <PaneGlyph count={count} />
              {count}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center">
          <label htmlFor="agent-start-command" className="text-[11px] text-muted-foreground">
            Start command
          </label>
          <Button
            variant="ghost"
            size="xs"
            onClick={resetCommand}
            disabled={!hydrated || command === DEFAULT_AGENT_LAUNCH_COMMANDS[agentId]}
            className="ml-auto"
            title={`Reset to ${launcher.defaultCommand}`}
          >
            <RefreshIcon size="xs" />
            Reset
          </Button>
        </div>
        <Input
          variant="subtle"
          id="agent-start-command"
          disabled={!hydrated}
          value={command}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={!validation.ok}
          onChange={(event) =>
            setDrafts((current) => ({
              ...current,
              [agentId]: event.target.value,
            }))
          }
          onBlur={() => persist(agentId, command)}
          className="font-mono"
          placeholder={launcher.defaultCommand}
        />
        <div className={cn('mt-1 min-h-4 text-[11px]', validation.ok ? 'text-muted-foreground' : 'text-destructive')}>
          {validation.ok ? 'Aliases and flags are supported.' : validation.error}
        </div>
      </div>

      <Button type="submit" className="mt-1 w-full" disabled={!hydrated || !validation.ok}>
        <PlayIcon size="sm" />
        Launch {instances} {instances === 1 ? 'agent' : 'agents'}
      </Button>
    </form>
  );
}

function PaneGlyph({ count }: { count: AgentInstanceCount }) {
  const cell = 'rounded-[1px] bg-current opacity-75';
  if (count === 1) {
    return (
      <span className="grid size-3 grid-cols-1 gap-px rounded-[2px] border border-current/50 p-px">
        <span className={cell} />
      </span>
    );
  }
  if (count === 2) {
    return (
      <span className="grid size-3 grid-cols-2 gap-px rounded-[2px] border border-current/50 p-px">
        <span className={cell} />
        <span className={cell} />
      </span>
    );
  }
  if (count === 3) {
    return (
      <span className="grid size-3 grid-cols-2 grid-rows-2 gap-px rounded-[2px] border border-current/50 p-px">
        <span className={cn(cell, 'row-span-2')} />
        <span className={cell} />
        <span className={cell} />
      </span>
    );
  }
  return (
    <span className="grid size-3 grid-cols-2 grid-rows-2 gap-px rounded-[2px] border border-current/50 p-px">
      <span className={cell} />
      <span className={cell} />
      <span className={cell} />
      <span className={cell} />
    </span>
  );
}
