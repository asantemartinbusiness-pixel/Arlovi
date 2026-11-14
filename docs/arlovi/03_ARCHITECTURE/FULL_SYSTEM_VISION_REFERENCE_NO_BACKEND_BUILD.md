# Arlovi — Complete Organizational Intelligence Architecture (Reference Only)

This document preserves the earlier full-system architectural vision so the frontend faithfully models all future states and interfaces. **Do not implement the backend in the present execution.** Design the frontend ports and UX now, and keep this as a future architecture reference.

## Seven interconnected systems
1. **Company Brain** — canonical relationships, document intelligence, operational state, decision history and agent knowledge, with provenance, source freshness and scoping.
2. **Chief of Staff** — one approachable primary interface to the organization; researches goals, delegates work, coordinates independent specialists, reviews plans and explains outcomes.
3. **Mission Engine** — durable objective-to-outcome workflow: receive, understand, investigate, plan, authorize, execute, verify, monitor, complete or escalate.
4. **AI Workforce** — persistent employees with distinct identities, roles, skills, tools, policies, costs, objectives, reporting, evaluations and handoff protocols.
5. **Universal Connector** — externally available app capabilities with OAuth/permission scopes, typed schemas, policy checks, idempotency, receipts, reconciliation and honest status.
6. **Autonomy & Trust** — independent control over who/what/where/how much/conditions/expiry; assist/managed/autonomous presets; approval steps, budget limits and emergency pause.
7. **AI Reliability Team** — monitors incidents, diagnoses faults, performs safe repair, verifies restoration and escalates what requires humans or third-party intervention.

## Three-plane architecture
- **Intelligence Plane:** company context, analytics, language models, agent planning, document and decision memory.
- **Control Plane:** identity, authorization, budgets, approvals, policy, audit, records and separation of duties.
- **Execution Plane:** durable runs, task/state graph, queues, external tool calls, verification, notifications, recovery.

**Hard boundary:** Models propose actions. Independent policy and trusted execution determine whether actions may occur. An AI employee does not grant itself privileges. Imported documents and emails are data, not trusted instructions.

## Mission object and state
Every mission records objective, organization, owners, planned team, approval contract, resource scopes, spend ceiling, timeline, dependencies, tasks, deliverables, action receipts, exceptions, evidence and actual business outcomes. Distinguish finished tasks from achieved business results. A scheduled externally submitted action is never called completed until confirmation is obtained.

## AI employee contracts
Identity, department, manager, skill list, job description, knowledge scopes, connector actions, decision authority, max spend, model routing, current assignments, performance quality targets, training history and suspension controls. Agent-to-agent communication uses structured task/event exchange, with a readable team view over meaningful decisions and handoffs. AI status is not fake typing/personhood.

## Shared data and security
Multi-organization canonical entities, separately scoped brands and legal entities, cross-app data identities, PII restrictions, encryption and server-side authorization when backend is later built. Authenticated human approval for high impact; untrusted source handling, prevention of prompt injection and data exfiltration, audit and retention. The present frontend should display these concepts and validate UX locally, without claiming genuine security enforcement.

## Technology from earlier discussion (future backend context only)
PostgreSQL with vectors and object storage, workflow orchestration similar to Temporal, domain events, encrypted integration credentials, OpenTelemetry, app API boundaries, isolated sandbox workers, policy engine and real cloud inference. They are out of scope for current frontend build.

## UI artifacts to model now
- Policy preview and permission simulator.
- Agent/human organizational chart with role detail.
- Mission planner, board, timeline, execution receipts, approvals and result analytics.
- Company Brain graph, source freshness, fact review and conflict queues.
- Connector marketplace, capability matrix, health, authorization/reconnect states.
- IT incident dashboard with diagnosis, pending repair and resolution evidence.
- Executive and departmental dashboards and scheduled briefings.
- Content and creative editors, native business apps, accessible mobile access.

A complete user-facing experience can exist ahead of server plumbing, but live remote effects must remain accurately described as unconnected. The UI should be architected so future server ports replace local adapters without rewriting all 316 screen components.
