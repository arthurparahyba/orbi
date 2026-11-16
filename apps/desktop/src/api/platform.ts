/**
 * A máquina: o que está ligado e configurado.
 */

import type { Health } from '@orbi/contracts';
import { request } from './request.ts';

export const platformApi = {
  health: () => request<Health>('/api/health'),
};
