/**
 * Compile-time check that what the runtime serves still fits what the app reads
 * (@orbi/contracts). Nothing here runs: if a runtime type drifts from the
 * contract, `npm run check:types` fails and names the pair below.
 *
 * Direction: runtime → contract. The runtime may carry extra fields; it may not
 * drop or reshape one the app uses.
 */
import type * as C from '@orbi/contracts';
import type { Autonomy, Edge, Entity, Gap, OntologyType, Playbook, PlaybookRun } from './brain/store.ts';
import type { DemoAction, NarrationSegment, Recording, Target } from './browser/recorder.ts';
import type { ConversationInfo } from './conversations/conversations.ts';
import type { InboxItem } from './conversations/inbox.ts';
import type { AutonomyLevel, Category } from './autonomy/policy.ts';
import type { SecretInfo } from './vault/vault.ts';
import type { AgentClient } from './mcp/clients.ts';
import type { VoiceStatus } from './voice/model.ts';
import type { PipelineRun } from './pipelines/runs.ts';
import type { Pipeline } from './brain/domain/pipelines.ts';
import type { AgentRequest } from './mcp/requests.ts';
import type { AgentSuggestion } from './mcp/suggestions.ts';
import type { CatalogEntry, CodeAgent, TaskAssignment } from './code-agents/index.ts';
import type { ModelStatus } from './llm/setup.ts';
import type { Followup } from './followups/domain.ts';
import type { ConversationState } from './conversations/state.ts';
import type { ConversationNotebook } from './conversations/notebook.ts';
import type { ModelChoices } from './llm/choices.ts';

type Fits<Runtime, Contract> = [Runtime] extends [Contract] ? true : false;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Check<T extends true> = T;

export type ContractChecks = [
  Check<Fits<ModelStatus, C.ModelStatus>>,
  Check<Same<Followup, C.Followup>>,
  Check<Same<ConversationState, C.ConversationState>>,
  Check<Same<ConversationNotebook, C.ConversationNotebook>>,
  Check<Same<ModelChoices, C.ModelChoices>>,
  Check<Same<CodeAgent, C.CodeAgent>>,
  Check<Fits<TaskAssignment, C.CodeAgentAssignment>>,
  Check<Fits<CatalogEntry, C.CodeAgentCatalogEntry>>,
  Check<Fits<ConversationInfo, C.ConversationInfo>>,
  Check<Fits<InboxItem, C.InboxItem>>,
  Check<Fits<OntologyType, C.OntologyType>>,
  Check<Fits<Entity, C.Entity>>,
  Check<Fits<Edge, C.Edge>>,
  Check<Fits<Gap, C.Gap>>,
  Check<Fits<Playbook, C.Playbook>>,
  Check<Fits<PlaybookRun, C.PlaybookRun>>,
  Check<Fits<Target, C.Target>>,
  Check<Fits<DemoAction, C.DemoAction>>,
  Check<Fits<NarrationSegment, C.NarrationSegment>>,
  Check<Fits<Recording, C.Recording>>,
  Check<Fits<SecretInfo, C.SecretInfo>>,
  Check<Fits<AgentClient, C.AgentClient>>,
  Check<Fits<VoiceStatus, C.VoiceStatus>>,
  Check<Fits<PipelineRun, C.PipelineRun>>,
  Check<Fits<Pipeline, C.Pipeline>>,
  Check<Fits<AgentRequest, C.AgentRequest>>,
  Check<Fits<AgentSuggestion, C.AgentSuggestion>>,
  // Enumerations must match exactly: the app offers every value as a choice.
  Check<Same<Autonomy, C.Autonomy>>,
  Check<Same<AutonomyLevel, C.Autonomy>>,
  Check<Same<Category, C.Category>>,
];
