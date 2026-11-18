/**
 * Compartilhar um procedimento (documento 30): o pacote que sai daqui e vai para o Orbi de outra
 * pessoa. Regras puras — quem monta o pacote é o caso de uso.
 *
 * O corte é um só: **vocabulário viaja, dados não.** Viaja o que o procedimento *é* — os passos, o
 * gatilho, as entradas, a entrega, os scripts, e os conceitos que ele cita, porque sem a palavra
 * `Ambiente` o passo que diz {{ambiente}} não quer dizer nada. Não viaja o que só vale nesta
 * máquina: as provas dos passos, o nível de autonomia, as execuções passadas e qualquer valor do
 * cofre. Os fatos são escolha de quem exporta, um por um, com o que cada um revela à vista.
 */
import type { Edge, Entity, OntologyType, Playbook, PlaybookOutput, PlaybookParam, PlaybookStep } from '../../../../language/index.ts';
import type { StepLearning } from '../../learnings/src/learnings.ts';
import type { PlaybookScript } from './scripts.ts';

/** A versão do formato do arquivo. Quem importa recusa o que não souber ler. */
export const PACKAGE_FORMAT = 1;

/** O procedimento como ele viaja: o que ele é, sem o histórico dele. */
export interface SharedProcedure {
  name: string;
  description: string;
  trigger: string;
  appliesTo: string | null;
  instructions: string;
  steps: PlaybookStep[];
  outputs: PlaybookOutput[];
  scripts: PlaybookScript[];
  domain?: string | null;
  intent?: string;
  inputs?: PlaybookParam[];
}

/** Os campos do procedimento que viajam. */
export const SHARED_FIELDS = [
  'name', 'description', 'trigger', 'appliesTo', 'instructions', 'steps', 'outputs', 'scripts', 'domain', 'intent', 'inputs',
] as const satisfies ReadonlyArray<keyof Playbook>;

/**
 * Os campos que ficam, cada um com o porquê. A lista é explícita para que um campo novo no
 * `Playbook` não vaze por descuido: o teste cobra que todo campo esteja em uma das duas listas.
 */
export const LEFT_BEHIND: ReadonlyArray<{ field: keyof Playbook; why: string }> = [
  { field: 'level', why: 'O nível entra em N1 no Orbi de quem recebe: autonomia é dele, não sua.' },
  { field: 'levelMax', why: 'O teto de autonomia é escolha de quem recebe.' },
  { field: 'levelBy', why: 'Quem decidiu o nível foi você, nesta máquina.' },
  { field: 'autonomy', why: 'Observar ou agir é decisão de quem recebe.' },
  { field: 'cleanStreak', why: 'A sequência sem erro é desta máquina.' },
  { field: 'uses', why: 'As execuções passadas são suas.' },
  { field: 'successes', why: 'O histórico de acertos é desta máquina.' },
  { field: 'testedRun', why: 'O ensaio que provou o procedimento rodou aqui.' },
  { field: 'learnedFrom', why: 'A conversa em que você ensinou o procedimento fica aqui.' },
  { field: 'variationOf', why: 'A ligação com o procedimento de origem só existe no seu cérebro.' },
  { field: 'updatedAt', why: 'Quando você editou por último não diz nada lá.' },
];

/** O pacote inteiro: um arquivo, legível, que a pessoa pode abrir e ler antes de importar. */
export interface ProcedurePackage {
  orbi: number;
  exportedAt: string;
  procedure: SharedProcedure;
  /** Os conceitos citados pelas entradas: a palavra, não o valor. */
  types: OntologyType[];
  /** Só os **nomes** dos segredos. O valor nunca sai do cofre; quem recebe cria os dele. */
  secrets: string[];
  /** Fatos escolhidos um por um por quem exporta. Vazio é o normal. */
  facts: Entity[];
  /** As ligações entre os fatos escolhidos; uma ponta de fora não viaja. */
  links: Edge[];
  /** Os aprendizados dos passos, se quem exporta quiser mandá-los. */
  learnings: StepLearning[];
}

/** O procedimento reduzido ao que viaja. Campo a campo, de propósito. */
export function shareable(pb: Playbook): SharedProcedure {
  const out = {} as Record<string, unknown>;
  for (const field of SHARED_FIELDS) if (pb[field] !== undefined) out[field] = pb[field];
  return out as unknown as SharedProcedure;
}

/** Os nomes de segredo que o procedimento cita, sem valor nenhum. */
export function secretsNamedIn(pb: Pick<Playbook, 'steps' | 'instructions'>): string[] {
  const text = [pb.instructions, ...pb.steps.map((s) => `${s.label} ${s.how}`)].join('\n');
  const found = [...text.matchAll(/\{\{\s*segredo:([a-z0-9][a-z0-9._/@-]{0,127})\s*\}\}/gi)].map((m) => m[1]!);
  return [...new Set(found)];
}

/** Os conceitos que o procedimento cita: os das entradas, mais o que ele se aplica a. */
export function conceptsOf(pb: Pick<Playbook, 'inputs' | 'appliesTo'>): string[] {
  const names = (pb.inputs ?? []).map((i) => i.concept).filter((c): c is string => !!c);
  if (pb.appliesTo && /^[A-Z]/.test(pb.appliesTo)) names.push(pb.appliesTo);
  return [...new Set(names)];
}

/** O fato como ele viaja: o valor e onde ele foi achado, sem o "conferido em" desta máquina. */
export function shareableFact(fact: Entity): Entity {
  const { checkedAt: _ignored, ...rest } = fact;
  return rest;
}

/** O pacote montado. `links` já vem filtrado: só ligação entre dois fatos que estão no pacote. */
export function packageOf(
  procedure: SharedProcedure,
  parts: { types: OntologyType[]; secrets: string[]; facts: Entity[]; links: Edge[]; learnings: StepLearning[] },
  at: string,
): ProcedurePackage {
  const inside = new Set(parts.facts.map((f) => f.id));
  return {
    orbi: PACKAGE_FORMAT,
    exportedAt: at,
    procedure,
    types: parts.types,
    secrets: parts.secrets,
    facts: parts.facts.map(shareableFact),
    links: parts.links.filter((e) => inside.has(e.from) && inside.has(e.to) && e.validTo === null),
    learnings: parts.learnings,
  };
}

/** O nome do arquivo que a pessoa baixa. */
export function packageFileName(name: string): string {
  return `${name}.orbi.json`;
}

/** O que um fato revela, em uma linha: é com isso à vista que a escolha de mandá-lo é informada. */
export function revealsOf(fact: Entity): string {
  const values = Object.entries(fact.props)
    .filter(([key, value]) => key !== 'nome' && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key} ${String(value).slice(0, 80)}`);
  return values.length ? values.join(' · ') : fact.body.slice(0, 120) || 'nada além do nome';
}

// ── a chegada ───────────────────────────────────────────────────────────────

/** O que a caixinha mostra antes de aplicar: o que vai entrar, e o que já existe aqui. */
export interface PackageSeen {
  name: string;
  description: string;
  domain: string | null;
  /** Os números da caixinha, na ordem em que a pessoa pensa neles. */
  counts: { steps: number; inputs: number; outputs: number; scripts: number };
  /** Já existe um procedimento com este nome aqui: aplicar não vai em cima dele. */
  conflict: boolean;
  /** Conceitos que vão nascer agora; os que já existem ficam como estão. */
  newTypes: string[];
  keptTypes: string[];
  /** Fatos que vão entrar; os que já existem aqui não são tocados. */
  newFacts: string[];
  keptFacts: string[];
  /** Os segredos que o Orbi vai pedir quando rodar, e os que você já tem no cofre. */
  secretsToAsk: string[];
  secretsHeld: string[];
  learnings: number;
}

/** O que já existe aqui, para o pacote ser lido contra a máquina de quem recebe. */
export interface AlreadyHere {
  procedure: boolean;
  types: (name: string) => boolean;
  facts: (id: string) => boolean;
  secrets: (name: string) => boolean;
}

/**
 * A leitura do pacote contra esta máquina. Puro de propósito: é a mesma conta que a caixinha
 * mostra e que a aplicação faz, e as duas não podem discordar.
 */
export function readPackage(pack: ProcedurePackage, here: AlreadyHere): PackageSeen {
  const p = pack.procedure;
  const split = <T>(items: T[], has: (x: T) => boolean): [T[], T[]] => [items.filter((x) => !has(x)), items.filter(has)];
  const [newTypes, keptTypes] = split(pack.types.map((t) => t.name), here.types);
  const [newFacts, keptFacts] = split(pack.facts.map((f) => f.id), here.facts);
  const [secretsToAsk, secretsHeld] = split(pack.secrets, here.secrets);
  return {
    name: p.name,
    description: p.description,
    domain: p.domain ?? null,
    counts: { steps: p.steps.length, inputs: (p.inputs ?? []).length, outputs: p.outputs.length, scripts: p.scripts.length },
    conflict: here.procedure,
    newTypes, keptTypes, newFacts, keptFacts, secretsToAsk, secretsHeld,
    learnings: pack.learnings.length,
  };
}

/**
 * O procedimento como ele nasce aqui. Duas coisas são decididas neste lugar e em nenhum outro:
 * **`autonomy: 'ask'`**, que faz o procedimento entrar em N1 por mais que o pacote diga o
 * contrário (o `save` dá N3 a quem chega marcado `auto`, e um arquivo mexido à mão não vai ganhar
 * isso), e **`learnedFrom`**, que registra que ele veio de fora e não de uma conversa daqui.
 */
export function arriving(p: SharedProcedure, exportedAt: string): SharedProcedure & { autonomy: 'ask'; learnedFrom: string; variationOf: null } {
  // `variationOf` fica nulo: a ligação com o procedimento de origem só existe no cérebro de quem mandou.
  return { ...p, autonomy: 'ask', learnedFrom: `pacote:${exportedAt}`, variationOf: null };
}
