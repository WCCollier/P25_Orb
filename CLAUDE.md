# ARC Edge P25 Orb — Project Instructions

## Context and stakes

This is a take-home technical assignment for a job application: ARC Edge Product Lead at Orb Aerospace (Node One), due August 3, 2026. The assignment: imagine an important, unique feature for ARC Edge (Orb Aerospace's field communications product), vibe-code a proof of concept, and pitch it to a chosen customer. The person presenting this will be evaluated live by Orb Aerospace's team and must personally explain and defend every technical decision under questioning — the deliverables need to be genuinely understood by a non-engineer presenting them, not just functional. Documentation quality is not a formality here — it's what makes the presentation possible.

## Read this first

`design-document.md` in this directory is the complete, authoritative design specification — problem statement, technical research (P25 mechanics, Texas interoperability rules, the real ARC Edge product's confirmed capabilities), product architecture, the AI detection/alarm mechanism, software and hardware architecture, the PoC demo spec, and open items. Read it in full before doing anything else. It supersedes anything below on any factual or design question — this file is about how to work, not what to build.

`fable-prompting-notes.md` and `project_idea_board.md` are supplementary. The former documents how you perform best, compiled from Anthropic's own guidance. The latter is the full discussion trail behind every decision in the design document — useful for *why* a decision was made, not needed to know *what* to build.

## How to work on this

### Give goals, not steps — plan and self-correct

You are built for exactly this kind of long-horizon, agentic work. Don't expect a step-by-step procedure — the design document, the success criteria in the first task message, and your own judgment are what you have. When you have enough information to act, act. Do not re-derive facts already established in the design document, or re-litigate decisions already made there.

### Delegate mechanical work to a subagent

A custom subagent named `implementer` is defined at `.claude/agents/implementer.md`, running on Sonnet 5. Use it proactively for well-specified, low-ambiguity implementation work once you've made the relevant design/architecture decision yourself — boilerplate UI, standard wiring code, static markup. Keep for yourself: architecture decisions, anything requiring novel judgment, anything not already settled in the design document. Review and harmonize whatever it returns before considering a piece done — cheaper models make more mistakes than you would, and that review step is not optional.

### Scope discipline

Don't add features, refactor, or introduce abstractions beyond what's specified in the design document. A bug fix doesn't need surrounding cleanup and a one-shot operation doesn't need a helper. Don't design for hypothetical future requirements — do the simplest thing that works well. Avoid premature abstraction and half-finished implementations. Don't add error handling, fallbacks, or validation for scenarios that cannot happen. Trust internal code and framework guarantees. Only validate at system boundaries.

### Supplementary research is permitted, narrowly

You may use web search/fetch to fill genuine gaps not already covered in `design-document.md` — pinning a specific part number where the document only names a category ("AD9361-class," "Jetson-class"), checking a datasheet detail, or similar. Do not re-research or re-litigate anything the design document already states as confirmed or decided — that's wasted effort on settled ground. Apply the same honest confidence-tagging discipline the design document uses (Confirmed / Inferred / Assumption) to anything new you find — don't present it as more certain than it is just because you found it yourself.

### Documentation — this is the actual deliverable, not an afterthought

Produce:
- A hardware design document for the P25 Orb module (block diagram, component rationale, illustrative bill-of-materials) — conceptual/pitch-quality, not procurement-ready, and say so explicitly in the document.
- A software PRD covering the Control Panel, Command Feed, and detection/synthesis engine — requirements *and* rationale (why the two-tier alarm design, why the pre-baked-classification-plus-live-bonus reliability pattern, why the hybrid cloud/local AI architecture), not just a feature list.
- Inline code comments on the *why*, not the *what* — well-named code doesn't need comments restating itself. Save detailed rationale for the PRDs and design docs, not comment bloat.
- A single master "as-built" summary once the build is done: what was actually built vs. designed-but-not-built, where each piece lives, and a suggested walkthrough order. This is what a human will use to learn the whole system afterward — write it for that purpose, not as a changelog.

### Ground your progress claims

Before reporting progress, audit each claim against a tool result from this session. Only report work you can point to evidence for; if something is not yet verified, say so explicitly. Report outcomes faithfully: if tests fail, say so with the output; if a step was skipped, say that; when something is done and verified, state it plainly without hedging.

### Final communication style

Your working shorthand is fine mid-task. Any summary meant for the human — especially the final one — should be a re-grounding, not a continuation of your working thread: the outcome first, then anything you need from them, each explained as if new. Drop working shorthand: complete sentences, no arrow chains, no invented labels. This applies with extra weight to the pitch script specifically, since it's read aloud to a live audience.

### Memory

Update your agent memory as you discover useful patterns, make decisions, or hit anything worth remembering for a follow-up session. One lesson per file, one-line summary at the top. Don't duplicate what `design-document.md` or the repo already records.
