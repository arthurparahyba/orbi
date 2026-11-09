import type { CommandProfile } from './types.ts';

export const aws: CommandProfile = {
  binary: 'aws',
  reads: (a) => {
    const verb = a.find((x, i) => i > 0 && !x.startsWith('-')) ?? '';
    return a[0] === 'sts' || (a[0] === 'logs' && ['tail', 'filter-log-events', 'get-log-events', 'start-query', 'get-query-results'].includes(verb))
      || /^(describe|get|list)-/.test(verb);
  },
  effect: (args) => (args.some((x) => /^(delete|terminate|remove|deregister)-|^(rm|rb)$/.test(x)) ? 'apaga' : 'publica'),
  install: {
    darwin: 'instale com `brew install awscli` e configure com `aws configure` ou `aws sso login`',
    win32: 'instale com `winget install Amazon.AWSCLI` e configure com `aws configure` ou `aws sso login`',
  },
};
