import { tellAgent } from '../conversations/tell.ts';
import { HttpError } from '../http/errors.ts';
import { SHELL_ROUTINE, saveShellPath } from '../agents/tools/shell-setup.ts';
import type { InboxHandler } from './types.ts';

/** "Where is Git Bash?": the runtime checks and saves the path; the Orbi only learns it is set. */
export const shellPath: InboxHandler = {
  id: 'caminho-do-shell',
  matches: (item) => item.kind === 'question' && item.routine === SHELL_ROUTINE,
  async answer(item, text, d) {
    const saved = saveShellPath(d.config, text);
    if ('problem' in saved) throw new HttpError(400, 'invalid_body', saved.problem);
    const receipt = await tellAgent(d.events, d.agent, {
      id: item.conversationId,
      message: { kind: 'signal', type: 'shell-configured', tagName: 'shell-configured', body: `O desenvolvedor configurou o shell: ${saved.path} (salvo no .env como ORBI_SHELL). Rode de novo o comando que precisava dele.`, attributes: { path: saved.path } },
    });
    d.inbox.resolve(item.id, 'answered', saved.path);
    return { status: 202, body: receipt };
  },
};
