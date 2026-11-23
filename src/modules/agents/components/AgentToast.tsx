import { Kbd } from '@/components/ui/kbd';
import { shortcutLabel } from '@/modules/shortcuts';
import { toast } from 'sonner';
import { AgentIcon } from '../lib/agentIcon';

type AgentToastArgs = {
  agent: string;
  title: string;
  body?: string;
  onActivate: () => void;
};

export function showAgentToast({ agent, title, body, onActivate }: AgentToastArgs) {
  const hint = shortcutLabel('agent.focusAttention');
  toast(title, {
    description: hint ? (
      <span className="flex items-center gap-1.5">
        {body ? <span className="min-w-0 truncate">{body}</span> : null}
        <Kbd className="ml-auto shrink-0">{hint}</Kbd>
      </span>
    ) : (
      body
    ),
    icon: <AgentIcon agent={agent} size="md" />,
    action: { label: 'Open', onClick: onActivate },
    duration: 6000,
  });
}
