import { defineSkill } from '../agents/runtime-port.ts';
import instructions from '../prompts/aprender-procedimento.md?raw';

/**
 * The one skill Orbi ships with: how to learn. Every other procedure (CI, GMUD,
 * portals) is learned with the developer and stored in the brain as a playbook.
 */
export const aprenderProcedimento = defineSkill({
  name: 'aprender-procedimento',
  description:
    'Aprender um procedimento novo com o desenvolvedor (ex. subir um repo para dev, acompanhar a esteira, abrir uma GMUD, atualizar a versão num portal) e guardá-lo como playbook. Use quando pedirem algo que nenhum playbook cobre, ou quando disserem "vou te ensinar".',
  instructions,
});
