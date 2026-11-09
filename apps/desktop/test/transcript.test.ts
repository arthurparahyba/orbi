import { describe, expect, it } from 'vitest';
import type { FlueConversationMessage } from '@flue/react';
import { conversationMarkdown } from '../src/components/chat/transcript';

const msg = (m: Partial<FlueConversationMessage> & Pick<FlueConversationMessage, 'role'>) =>
  ({ id: Math.random().toString(36), parts: [], ...m }) as unknown as FlueConversationMessage;

describe('copiar conversa', () => {
  const messages = [
    msg({ role: 'user', parts: [{ type: 'text', text: 'Deleta o repositório teste-orbi' }] as never }),
    msg({
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Vou conferir antes.' },
        { type: 'dynamic-tool', toolName: 'run_command', state: 'output-error', input: { binary: 'gh', args: ['repo', 'delete'] }, errorText: 'gh: não encontrado' },
        { type: 'data-ui', data: { components: [
          { component: 'approval', id: 'a', title: 'Deletar teste-orbi', detail: 'gh repo delete teste-orbi --yes', category: 'comandos-escrita', inboxId: 'i' },
          { component: 'stepper', id: 's', title: 'Deletar repositório', status: 'running', steps: [{ id: '1', label: 'Conferir dono', status: 'done' }, { id: '2', label: 'Deletar', status: 'pending' }] },
        ] } },
      ] as never,
    }),
    msg({ role: 'system', settlement: { outcome: 'failed' } as never }),
    msg({ role: 'system', parts: [{ type: 'text', text: 'mcp disponível' }] as never }),
    msg({ role: 'assistant', display: 'hidden', parts: [{ type: 'text', text: 'segredo interno' }] as never } as never),
  ];
  const md = conversationMarkdown({ id: 'chat:1', title: 'Deletar repo' }, messages, new Date('2026-11-06T20:00:00Z'));

  it('mantém a ordem e quem falou', () => {
    expect(md.startsWith('# Deletar repo\n')).toBe(true);
    expect(md.indexOf('### Você')).toBeLessThan(md.indexOf('### Orbi'));
    expect(md).toContain('Deleta o repositório teste-orbi');
  });
  it('traz ferramentas com entrada e erro, cartões e falhas', () => {
    expect(md).toContain('**Ferramenta `run_command`** (erro)');
    expect(md).toContain('"binary": "gh"');
    expect(md).toContain('gh: não encontrado');
    expect(md).toContain('**Pedido de aprovação: Deletar teste-orbi**');
    expect(md).toContain('- [x] Conferir dono');
    expect(md).toContain('- [ ] Deletar');
    expect(md).toContain('a execução falhou');
  });
  it('deixa de fora o que o app também esconde', () => {
    expect(md).not.toContain('mcp disponível');
    expect(md).not.toContain('segredo interno');
  });
  it('corta saídas muito longas', () => {
    const long = conversationMarkdown({ id: 'c', title: 't' }, [
      msg({ role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: 'run_command', state: 'output-available', input: {}, output: 'x'.repeat(10_000) }] as never }),
    ]);
    expect(long).toContain('6000 caracteres cortados');
  });
});
