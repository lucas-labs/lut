import { AppIcon } from '@/components/AppIcon';
import {
  AgentClaudeIcon,
  AgentCodexIcon,
  AgentGeminiIcon,
  AgentGrokIcon,
  AgentPiIcon,
  CodeIcon,
  LUT_ICON_SIZES,
  type LutIconProps,
  type LutIconSize,
  SparklesIcon,
} from '@lut/lut-icons';

/** The agent's mark: a known CLI's logo, or sparkles for any other agent. */
function agentMark(agent: string, props: LutIconProps) {
  const a = agent.toLowerCase();
  if (a === 'pi') return <AgentPiIcon {...props} />;
  if (a.includes('claude')) return <AgentClaudeIcon {...props} />;
  if (a.includes('gemini')) return <AgentGeminiIcon {...props} />;
  if (a.includes('opencode')) return <CodeIcon {...props} />;
  if (a.includes('grok')) return <AgentGrokIcon {...props} />;
  if (a.includes('codex') || a.includes('gpt') || a.includes('openai')) return <AgentCodexIcon {...props} />;
  return <SparklesIcon {...props} />;
}

export function AgentIcon({
  agent,
  size = 'sm',
  className,
}: {
  agent: string;
  size?: LutIconSize;
  className?: string;
}) {
  if (agent.toLowerCase().includes('lut')) {
    return <AppIcon size={LUT_ICON_SIZES[size].px} className={className} />;
  }
  return agentMark(agent, { size, className });
}
