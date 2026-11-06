import { describe, expect, it } from 'vitest';
import type { FlueConversationPart } from '@flue/react';
import { groupParts } from '../src/views/conversation/Message';

const tool = (toolName: string, state = 'output-available') => ({ type: 'dynamic-tool', toolName, state, input: {} }) as unknown as FlueConversationPart;
const text = (t: string) => ({ type: 'text', text: t }) as FlueConversationPart;

describe('groupParts', () => {
  it('junta ferramentas seguidas e esconde as que já viram interface', () => {
    const parts = [text('oi'), tool('run_command'), tool('show_ui'), tool('brain_query'), text('pronto'), tool('run_command')];
    const groups = groupParts(parts);
    expect(groups).toHaveLength(4);
    expect(Array.isArray(groups[1]) && groups[1].map((t) => t.toolName)).toEqual(['run_command', 'brain_query']);
    expect(Array.isArray(groups[3]) && groups[3]).toHaveLength(1);
  });

  it('mostra uma ferramenta silenciosa quando ela falha', () => {
    const groups = groupParts([tool('show_ui', 'output-error')]);
    expect(groups).toHaveLength(1);
  });
});
