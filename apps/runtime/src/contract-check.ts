/**
 * Compile-time check that what the runtime serves still fits what the app reads
 * (@orbi/contracts). Nothing here runs: if a runtime type drifts from the
 * contract, `npm run check:types` fails and names the pair below.
 *
 * Direction: runtime → contract. The runtime may carry extra fields; it may not
 * drop or reshape one the app uses.
 */
import type * as C from '@orbi/contracts';
import type { Autonomy, Edge, Entity, FoundIn, Gap, OntologyType, Playbook, PlaybookRun } from './language/index.ts';
import type { DemoAction, NarrationSegment, Recording, Target } from './contexts/tools/index.ts';
import type { ConversationInfo } from './contexts/talk/index.ts';
import type { InboxItem } from './contexts/talk/index.ts';
import type { AutonomyLevel, Category } from './contexts/trust/index.ts';
import type { SecretInfo } from './contexts/secrets/index.ts';
import type { VoiceStatus } from './contexts/talk/index.ts';
import type { PipelineRun } from './contexts/procedures/index.ts';
import type { Pipeline } from './contexts/procedures/index.ts';
import type { CatalogEntry, CodeAgent, TaskAssignment } from './contexts/tools/index.ts';
import type { AgentClient, AgentRequest, AgentSuggestion } from './contexts/agents/index.ts';
import type { Bridge, Domain, DomainDetail, DomainOverview, DomainSize } from './contexts/knowledge/index.ts';
import type { ModelStatus } from './contexts/models/index.ts';
import type { Followup } from './contexts/talk/index.ts';
import type { ConversationState } from './contexts/talk/index.ts';
import type { ConversationNotebook } from './contexts/talk/index.ts';
import type { ModelChoices } from './contexts/models/index.ts';
import type { ReviewNote } from './contexts/improvement/index.ts';
import type { StepLearning } from './contexts/procedures/index.ts';
import type { RunCall } from './contexts/procedures/index.ts';
import type { Diagnosis, DiagnosisReport, DiagnosisSetup } from './contexts/improvement/index.ts';
import type { IssueDraft } from './contexts/improvement/index.ts';
import type { Sent } from './contexts/improvement/index.ts';

type Fits<Runtime, Contract> = [Runtime] extends [Contract] ? true : false;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Check<T extends true> = T;

export type ContractChecks = [
  Check<Fits<ModelStatus, C.ModelStatus>>,
  Check<Same<Followup, C.Followup>>,
  Check<Same<ConversationState, C.ConversationState>>,
  Check<Same<ConversationNotebook, C.ConversationNotebook>>,
  Check<Same<ModelChoices, C.ModelChoices>>,
  Check<Same<ReviewNote, C.ReviewNote>>,
  Check<Same<StepLearning, C.StepLearning>>,
  Check<Same<RunCall, C.RunCall>>,
  Check<Same<Diagnosis, C.Diagnosis>>,
  Check<Same<DiagnosisSetup, C.DiagnosisSetup>>,
  Check<Same<DiagnosisReport, C.DiagnosisReport>>,
  Check<Same<IssueDraft, C.IssueDraft>>,
  Check<Same<Sent, C.IssueSent>>,
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
  Check<Fits<FoundIn, C.FoundIn>>,
  Check<Fits<Domain, C.Domain>>,
  Check<Fits<DomainSize, C.DomainSize>>,
  Check<Fits<Bridge, C.Bridge>>,
  Check<Fits<DomainOverview, C.DomainOverview>>,
  Check<Fits<DomainDetail, C.DomainDetail>>,
  // Enumerations must match exactly: the app offers every value as a choice.
  Check<Same<Autonomy, C.Autonomy>>,
  Check<Same<AutonomyLevel, C.Autonomy>>,
  Check<Same<Category, C.Category>>,
];
