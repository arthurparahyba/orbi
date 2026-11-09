import type { LevelState } from './levels.ts';
import type { Playbook } from './types.ts';

/** The level part of a procedure, as the level rules take it. */
export const levelState = (pb: Playbook): LevelState => ({ level: pb.level, levelMax: pb.levelMax, levelBy: pb.levelBy, cleanStreak: pb.cleanStreak });
