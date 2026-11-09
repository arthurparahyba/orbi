import type { CatalogEntry } from './types.ts';

/**
 * Coding agents the Orbi already knows how to call in one-shot mode. Data, not code paths: an
 * agent missing here is found by the configuration chat from its `--help` and registered the
 * same way (code-agents/discovery.ts). Every entry is only a suggestion until the developer
 * approves the registration.
 */
export const CATALOG: readonly CatalogEntry[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    binary: 'claude',
    command: 'claude -p --model {modelo} -- {prompt}',
    models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    binary: 'cursor-agent',
    command: 'cursor-agent -p --model {modelo} {prompt}',
    models: [],
    note: 'Confira o comando e os modelos com cursor-agent --help.',
  },
  {
    id: 'devin',
    name: 'Devin',
    binary: 'devin',
    // --print refuses an untrusted folder, and the copy is always a new one.
    command: 'devin -p --respect-workspace-trust false -- {prompt}',
    models: [],
    note: 'Usa o modelo padrão do Devin. Precisa de devin auth login.',
  },
];

/** Programs the discovery looks for, known or not. */
export const KNOWN_BINARIES = ['claude', 'cursor-agent', 'devin', 'codex', 'copilot', 'gemini', 'aider'] as const;

export const catalogEntry = (id: string): CatalogEntry | undefined => CATALOG.find((c) => c.id === id);
