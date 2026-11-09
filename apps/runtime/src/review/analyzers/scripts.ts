import { inlineScriptSuggestions, showSuggestions } from '../../brain/domain/review.ts';
import type { RunAnalyzer } from './types.ts';

/** Inline Python (python3 -c) asks every time: keep it as a procedure script. */
export const inlineScripts: RunAnalyzer = {
  id: 'python-na-hora',
  kind: 'melhoria',
  analyze: (run) => inlineScriptSuggestions(run),
  howToFix: 'Python que se repete vira script do procedimento, em scripts, chamado com run_script.',
};

/** A table copied by hand from a script's output into show_ui. */
export const tablesByHand: RunAnalyzer = {
  id: 'tabela-copiada',
  kind: 'melhoria',
  analyze: (run) => showSuggestions(run),
  howToFix: 'Tabela que vem de arquivo: um script que imprime o componente, rodado com run_script e show: true.',
};
