import path from 'node:path';
import { AGENT_PROVIDERS, PROVIDER_META, isAgentEffort, providerMeta, providerNames, type AgentProvider } from '../shared/providers.js';

/**
 * Finds the provider represented by the configured executable.  Keep this deliberately based on
 * the final path component: --agent may be an absolute path, and Windows paths can be supplied
 * while the office itself is running under a POSIX shell. A Windows npm launcher (`pi.cmd`) counts as
 * its executable too.
 */
export function configuredProvider(command: string): AgentProvider {
  const base = commandBase(command);
  return AGENT_PROVIDERS.find((p) => selectNames(p).includes(base)) ?? 'custom';
}

/** Basenames that mean this provider: its bin, the commands it launches, and any alias (`cursor`). */
function selectNames(provider: AgentProvider): string[] {
  const meta = PROVIDER_META[provider];
  return [meta.bin, ...(meta.commands ?? []), ...(meta.aliases ?? [])].filter((n): n is string => !!n);
}

/** The executables to try for `provider`, in order. Cursor is `cursor-agent`, then `agent`. */
export function commandNames(provider: AgentProvider): readonly string[] {
  const meta = PROVIDER_META[provider];
  if (meta.commands?.length) return meta.commands;
  return meta.bin ? [meta.bin] : [provider];
}

/**
 * The command line name a worker runs. The office's own `--agent` is used as given when it is this
 * provider (or it actually exists). Otherwise the first of the provider's command names that exists
 * wins, so Cursor finds `cursor-agent` before `agent`.
 */
export function workerCommand(provider: AgentProvider | undefined, defaultProvider: AgentProvider, agentCmd: string, resolve: (cmd: string) => string | null): string {
  const names = provider ? commandNames(provider) : [];
  if (!provider || provider === defaultProvider) {
    const base = commandBase(agentCmd);
    if (!provider || names.includes(base) || names.length === 0 || resolve(agentCmd)) return agentCmd;
  }
  return names.find((b) => resolve(b)) ?? names[0] ?? agentCmd;
}

function commandBase(command: string): string {
  return path.basename(command.replaceAll('\\', '/')).toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/, '');
}

/** The providers an office started with `configured` can hire: the ones it knows, and a custom --agent only when that's what it was started with. */
export function agentProviders(configured: AgentProvider): AgentProvider[] {
  return AGENT_PROVIDERS.filter((p) => p !== 'custom' || configured === 'custom');
}

/** The command a provider's CLI runs as: the office's --agent when that's this provider, else its own executable. */
export function providerCommand(provider: AgentProvider, agentCmd: string): string {
  return configuredProvider(agentCmd) === provider ? agentCmd : (PROVIDER_META[provider].bin ?? agentCmd);
}

export function validateWorkerModel(kind: 'agent' | 'shell', provider: AgentProvider | undefined, model: unknown): string | undefined {
  if (model === undefined) return undefined;
  if (kind === 'shell') return 'Shell workers do not have an agent model';
  const meta = providerMeta(provider);
  if (!meta?.validModel) return `Models can only be selected for ${providerNames((m) => !!m.validModel)} workers`;
  return meta.validModel(model) ? undefined : meta.invalidModel;
}

/** Claude Code, Grok and Muse reasoning-effort flags; DSH advertises a reasoning_effort configuration option. */
export function validateWorkerEffort(kind: 'agent' | 'shell', provider: AgentProvider | undefined, effort: unknown): string | undefined {
  if (effort === undefined) return undefined;
  if (kind === 'shell') return 'Shell workers do not have a reasoning effort';
  if (!providerMeta(provider)?.takesEffort) return `Reasoning effort can only be selected for ${providerNames((m) => !!m.takesEffort)} workers`;
  return isAgentEffort(effort) ? undefined : 'Invalid effort (expected low, medium, high, xhigh or max)';
}
