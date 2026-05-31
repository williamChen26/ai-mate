# Spec: Tldraw-First AI Coworker Canvas MVP

## Background
This run began as an AI Product Spec Canvas MVP with a custom flowchart graph protocol. After validating the runnable tldraw canvas shell and reviewing the tldraw AI, agent, collaboration, and sync direction, the product has pivoted: tldraw document/editor/store state is now the source of truth.

The product goal is an AI coworker that shares the user's canvas, understands current document state, notices recent edits, can explain when its assumptions are stale, and later collaborates in real time. The next MVP slices should prepare that agent layer without implementing real AI model calls, autonomous agent behavior, or live collaboration yet.

## Goals
1. Keep the completed runnable tldraw canvas shell as the foundation for all future canvas and agent work.
2. Establish a serializable, tldraw-aware canvas context contract that future AI prompts and agent decisions can consume.
3. Define typed agent action planning boundaries so future AI outputs can be validated, dry-run, and applied through controlled tldraw-aware operations.
4. Prepare collaboration and conflict-awareness concepts around tldraw document state, recent edits, presence, and stale assumptions without shipping real sync or multi-user editing.
5. Preserve the harness audit trail so future Generator and Evaluator phases understand which earlier flowchart-protocol work is superseded.

## Non-Goals
1. No real AI model integration, prompt execution, chat UI, autonomous editing, or generated canvas edits are required in this replanned MVP.
2. No real-time collaboration backend, tldraw sync service, authentication, persistence backend, permissions model, or deployment work is required.
3. No revival of the custom flowchart graph protocol as an active source of truth.
4. No custom flowchart CRUD layer is required beyond baseline tldraw editing behavior already provided by the canvas shell.
5. No full product-spec ontology, feature-tree extraction, PRD ingestion, state-machine generation, or API/data sketch generation is required.
6. No requirement to finalize visual design beyond keeping the runnable canvas shell coherent enough for manual validation and future agent-readiness work.

## Product/Engineering Approach
The active architecture should treat tldraw as the canonical workspace. Future AI coworker behavior should read from the current tldraw document/editor/store state, not from a parallel product graph. When structured product-spec output is needed later, it should be derived from canvas context rather than kept in sync as a separate source of truth.

The next layer should make canvas state understandable and actionable for a future agent. First, expose a serializable context snapshot that includes document summary, shape inventory, selection, viewport, and a recent-change summary boundary. Then define typed action plans that a future AI system could propose, validate, dry-run, and apply only through explicit controlled boundaries. Collaboration and conflict-awareness work should identify what future sync, presence, and stale-assumption checks need to know, while keeping the current MVP local and non-collaborative.

Sprint contracts should keep implementation scope realistic: deterministic logic should be testable, runnable canvas behavior should keep E2E/runtime checks, and documentation-only or scaffold-only work should still produce inspectable contracts for future sprints. The repository quality commands currently center on the web app typecheck, build, and Playwright smoke checks.

## Superseded History
F1 and F2 originally created a shared flowchart graph protocol and graph operations package. That direction passed earlier sprint evaluation but is no longer active product architecture. The pivot in `pivot.md`, `pivot-validation.md`, and `docs/product-direction.md` supersedes the flowchart protocol as the source of truth.

Historical flowchart-protocol artifacts should be treated only as audit context unless a future replanning pass explicitly reintroduces a derived export format. Active work should not depend on a custom graph protocol for canvas meaning.

## Feature List

### F3: Runnable Tldraw Canvas Application Shell
The completed foundation is a runnable tldraw-first canvas shell. It gives users and future agents a shared editable workspace, validates that the app can load the tldraw editor as the first-screen experience, and provides the runtime base for context extraction and future agent action boundaries.

**Behavior Scenarios:**
- Scenario: Open the tldraw canvas shell
  - Given the web app is started through the documented package scripts
  - When a user opens the local application in a browser
  - Then the first screen shows an editable tldraw canvas
  - And the user can interact with the canvas without seeing a setup page or protocol-focused placeholder
- Scenario: Use baseline canvas interactions
  - Given the tldraw canvas shell is visible
  - When the user pans, zooms, selects, or uses standard tldraw editing affordances
  - Then the editor remains responsive and visibly interactive
  - And the shell does not require custom flowchart tools to demonstrate baseline canvas readiness
- Scenario: Preserve tldraw-first orientation
  - Given a developer inspects the current MVP shell
  - When they review the visible product framing
  - Then the shell presents the tldraw-first AI coworker direction
  - And it does not present the superseded custom graph protocol as active architecture

**Acceptance Criteria:**
- AC-3.1: The local web app opens to a visible tldraw canvas as the primary first-screen experience.
- AC-3.2: Baseline tldraw interactions are available and verified through runtime or E2E evidence.
- AC-3.3: The visible shell frames the product around the tldraw-first AI coworker direction.
- AC-3.4: The app no longer depends on the superseded flowchart graph protocol for active shell status or canvas meaning.
- AC-3.5: The completed sprint evidence records successful typecheck, build, and E2E/runtime validation for the shell.

**Priority:** P0 (must-have)
**Status:** Completed
**Dependencies:** None

### F4: Agent-Ready Canvas Context Extraction
Provide a serializable tldraw-aware context snapshot that future AI prompts and agent decisions can consume. The context should describe the current canvas document at a useful level of detail, including document summary, shape inventory, selection, viewport, recent-change summary boundary, and explicit constraints for future prompt/action consumers. This feature must not call an AI model or introduce autonomous agent UI.

**Behavior Scenarios:**
- Scenario: Extract a current canvas context snapshot
  - Given the tldraw canvas contains one or more shapes
  - When the app or a developer-facing caller requests the current canvas context
  - Then it receives serializable context describing the document summary and shape inventory
  - And the context is derived from tldraw document/editor/store state rather than a custom flowchart protocol
- Scenario: Include user focus in the context
  - Given the user has a current selection and viewport on the canvas
  - When the canvas context is extracted
  - Then the context includes selection and viewport information sufficient for a future agent to understand what the user is looking at or editing
  - And the context remains valid when there is no active selection
- Scenario: Represent recent change awareness without real AI
  - Given the user has made canvas edits during the current session
  - When the canvas context is extracted
  - Then the context includes a recent-change summary field or hook that can represent what changed
  - And the implementation clearly distinguishes placeholder or local summary behavior from real AI interpretation
- Scenario: Communicate future-agent constraints
  - Given a future AI prompt or action planner consumes the context
  - When it reads the context metadata
  - Then it can identify constraints such as source-of-truth state, unsupported assumptions, and action-safety boundaries
  - And those constraints are serializable for tests, logs, or developer inspection

**Acceptance Criteria:**
- AC-4.1: A context extraction boundary exists that returns JSON-serializable canvas context from tldraw editor/store/document state.
- AC-4.2: The context includes at minimum document summary, shape inventory, current selection, viewport, recent-change summary field or hook, and future-agent constraint metadata.
- AC-4.3: The context handles empty canvas, populated canvas, no selection, active selection, and changed-since-load states without throwing or producing non-serializable data.
- AC-4.4: Deterministic tests or runtime checks verify that context output changes when tldraw document state, selection, viewport, or recent edits change.
- AC-4.5: No AI model call, chat workflow, autonomous edit, or custom flowchart protocol dependency is introduced by this feature.

**Priority:** P0 (must-have)
**Status:** Pending
**Dependencies:** F3

### F5: Typed Agent Action Planning and Dry-Run/Apply Boundary
Define typed action plans for future AI operations over the tldraw canvas. The feature should make proposed agent edits explicit, validated, inspectable, and dry-runnable before any apply step is allowed. It should prepare the boundary between "an AI suggested an action" and "the app intentionally applied a safe action" without shipping an autonomous agent UI or model-generated plans.

**Behavior Scenarios:**
- Scenario: Validate a proposed canvas action plan
  - Given a future-agent caller provides a typed action plan for a supported tldraw canvas operation
  - When the plan is validated
  - Then the result identifies whether the plan is acceptable for the current canvas context
  - And invalid or unsupported actions return inspectable errors without mutating the canvas
- Scenario: Dry-run an action plan
  - Given a valid proposed action plan and a current canvas context
  - When the caller requests a dry run
  - Then the result describes the expected canvas impact in serializable form
  - And the tldraw document remains unchanged
- Scenario: Apply an explicitly accepted action plan
  - Given a valid action plan has passed validation and dry-run checks
  - When an explicit apply request is made through the controlled boundary
  - Then the intended tldraw canvas change is applied
  - And the outcome records success, failure, or partial-safety refusal in an inspectable result
- Scenario: Reject stale or unsafe action assumptions
  - Given the canvas context has changed since an action plan was prepared
  - When the plan is validated or dry-run against the newer context
  - Then the result can refuse or flag the plan as stale
  - And the canvas is not mutated unless the plan is explicitly accepted under the current state

**Acceptance Criteria:**
- AC-5.1: Typed schemas or equivalent validators exist for a focused set of future-agent canvas action plans.
- AC-5.2: Validation rejects malformed, unsupported, stale, or unsafe action plans with inspectable error information and no canvas mutation.
- AC-5.3: Dry-run behavior returns a serializable expected-impact result and leaves the tldraw document unchanged.
- AC-5.4: Apply behavior is separated from validation and dry-run, requires an explicit call, and reports an inspectable outcome.
- AC-5.5: Focused tests or runtime checks cover valid plans, invalid plans, dry-run no-mutation behavior, explicit apply behavior, and stale-context refusal or warning behavior.

**Priority:** P0 (must-have)
**Status:** Pending
**Dependencies:** F4

### F6: Collaboration and Conflict-Awareness Readiness
Prepare the product for future real-time collaboration and AI coworker conflict awareness without implementing live sync. This feature should document and lightly scaffold the concepts needed for tldraw sync/presence integration, recent user edit observation, stale agent assumptions, and future collaborator-like AI presence.

**Behavior Scenarios:**
- Scenario: Describe future collaboration state needs
  - Given the product will later use tldraw collaboration concepts
  - When a developer reviews the collaboration readiness artifact or scaffold
  - Then it identifies the future state needed for participants, presence, document version/change markers, and agent observation
  - And it does not claim that real collaboration is already implemented
- Scenario: Identify stale agent assumptions
  - Given a future agent plan is associated with a prior canvas context
  - When newer user edits or context changes are compared conceptually against that plan
  - Then the readiness layer describes how stale assumptions would be detected or represented
  - And the current MVP can expose the concept through documented structures, examples, or lightweight local scaffolding
- Scenario: Explain conflict guidance behavior
  - Given a future agent would propose an edit that overlaps with recent user changes
  - When the conflict-awareness strategy is inspected
  - Then it describes how the agent should guide the user about conflict, ambiguity, or stale context before applying edits
  - And it keeps the final human-facing decision boundary explicit
- Scenario: Keep current runtime honest
  - Given the MVP remains local and non-collaborative
  - When a user or evaluator inspects the app and docs
  - Then collaboration and conflict-awareness are presented as readiness work
  - And no UI or status text implies live multi-user sync or real AI coworker behavior exists

**Acceptance Criteria:**
- AC-6.1: A collaboration/conflict-awareness readiness artifact or scaffold defines future concepts for participants, presence, document change markers, recent edits, stale assumptions, and conflict guidance.
- AC-6.2: The readiness work is explicitly aligned with tldraw document state and future tldraw sync/presence concepts rather than a custom flowchart protocol.
- AC-6.3: The feature includes at least one concrete example of how a future agent plan could become stale after user edits and how that state should be surfaced.
- AC-6.4: Any runtime-facing wording or developer-facing status clearly states that real collaboration, real AI, and autonomous editing are not implemented yet.
- AC-6.5: Validation includes inspectable documentation review and, if lightweight structures are added, deterministic checks that they serialize and represent stale/conflict examples as intended.

**Priority:** P1 (should-have)
**Status:** Pending
**Dependencies:** F5

## Risks/Dependencies
1. Tldraw APIs and store record shapes may evolve, so the context extraction contract must avoid overfitting to unstable internals while still being concrete enough for tests.
2. Agent-ready context can become too broad if it attempts to solve product-spec extraction, prompting, and collaboration at once; F4 should stay focused on serializable canvas state.
3. Action schemas can become unsafe if validation and apply behavior are blurred; F5 must keep dry-run and apply boundaries explicit.
4. Stale-context and conflict concepts may be underspecified without real collaboration data; F6 should use concrete examples while clearly labeling future sync assumptions.
5. Browser canvas verification can be brittle; contracts should combine deterministic tests for context/action logic with runtime/E2E checks for visible tldraw behavior where practical.
6. Current required validation depends on the web app quality commands: typecheck, build, and Playwright smoke checks.

## Open Questions
1. Which tldraw shape details are essential in the first agent context: only ids/types/text/bounds, or richer geometry, style, bindings, and metadata?
2. How much recent-change history should be retained locally before real collaboration or persistence exists?
3. What first action types should F5 support for future AI plans: create shape, update text, move shape, delete shape, select/focus, or comments/annotations?
4. Should dry-run output be optimized for developer inspection first, or shaped as future user-facing "agent proposal" copy?
5. When collaboration is added later, should the AI coworker appear as a full participant with presence, or as a system assistant observing the shared document?

## Suggested Sprint Order
1. Sprint 4: F4 Agent-Ready Canvas Context Extraction. This is the next foundational slice because future agent prompts, stale-context checks, and action validation all need a reliable view of current tldraw state.
2. Sprint 5: F5 Typed Agent Action Planning and Dry-Run/Apply Boundary. This builds on extracted context to define how future AI proposals can be validated and safely separated from actual canvas mutation.
3. Sprint 6: F6 Collaboration and Conflict-Awareness Readiness. This uses the context and action boundaries to document and lightly scaffold how future real-time sync, presence, stale assumptions, and conflict guidance should fit the tldraw-first product.
