# Prompting Claude Fable 5 — Research Notes

Compiled 2026-07-22 from Anthropic's official documentation and public commentary, for reference when writing one-shot prompts for Fable 5. Confidence level is noted per source, since some of this came from secondary summarization rather than primary text I read directly.

## Source confidence key

- **[Official]** — read directly from Anthropic's platform docs. Highest confidence.
- **[Verified-secondary]** — a real, specific URL exists (e.g. a named X post) and the content is cross-corroborated by multiple independent sources, but I did not fetch the primary text myself (X blocked the fetch with a 402).
- **[Unverified-secondary]** — a single blog's paraphrase of a talk or post, not confirmed against a primary transcript.

---

## Core principle [Official]

Fable 5 is built for long-horizon, agentic work — not snappy back-and-forth chat. It has high time-to-first-token, which makes it poorly suited to interactive turn-by-turn prompting. The model performs best when given the full picture up front and left to plan and self-correct, rather than walked through a procedure.

**Practical implication:** front-load everything into one dense, well-specified prompt rather than trickling context across turns.

## Give goals, not steps [Official]

Micromanaging with a step-by-step checklist actively degrades performance — that approach helped older, less capable models but works against Fable 5. Give it:
- The objective
- Success criteria ("what does done look like")
- Relevant constraints (time, audience, scope)

...and let it figure out the how.

## Specify "done" before you start [Official]

Define success criteria upfront, not mid-task. This is one-shot prompting's biggest failure mode — starting Fable on something ambiguous and course-correcting later is much less effective than nailing the definition of done in the first prompt.

## State explicit boundaries [Official]

Fable can take unrequested actions or overbuild, especially at higher effort — extra abstractions, defensive scaffolding, tidying beyond what was asked. For a scoped deliverable (like a 3–5 hour PoC), explicit boundary language matters:

> Don't add features, refactor, or introduce abstractions beyond what the task requires. A bug fix doesn't need surrounding cleanup and a one-shot operation usually doesn't need a helper. Don't design for hypothetical future requirements: do the simplest thing that works well. Avoid premature abstraction and half-finished implementations. Don't add error handling, fallbacks, or validation for scenarios that cannot happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.

## Give the reason, not just the request [Official]

Fable performs better when it understands *why* it's doing something — the intent lets it connect the task to relevant context instead of guessing. Useful template:

> I'm working on [the larger task] for [who it's for]. They need [what the output enables]. With that in mind: [request].

## Anti-overplanning instruction [Official]

To stop Fable from over-deliberating on ambiguous tasks:

> When you have enough information to act, act. Do not re-derive facts already established in the conversation, re-litigate a decision the user has already made, or narrate options you will not pursue in user-facing messages. If you are weighing a choice, give a recommendation, not an exhaustive survey.

## Ground progress claims [Official]

On long autonomous runs, Fable can occasionally report progress that isn't backed by verified tool output. Anthropic found this instruction nearly eliminated fabricated status reports:

> Before reporting progress, audit each claim against a tool result from this session. Only report work you can point to evidence for; if something is not yet verified, say so explicitly. Report outcomes faithfully: if tests fail, say so with the output; if a step was skipped, say that; when something is done and verified, state it plainly without hedging.

## Communication style for final deliverables [Official]

Fable's working shorthand (terse, dense, arrow-chains, jargon) is fine mid-task but reads poorly in a final summary meant for a human who wasn't following along:

> Write the summary as a re-grounding, not a continuation of your working thread: the outcome first, then anything you need from the reader, each explained as if new. Drop working shorthand — complete sentences, no arrow chains, no invented labels. Open with the outcome, then supporting detail. If you have to choose between short and clear, choose clear.

Directly relevant to us since one deliverable is literally a pitch script for a live audience.

## Effort levels [Official — API-only, not applicable in Claude.ai chat]

`effort` (low/medium/high/xhigh/max) trades reasoning depth for cost/latency. `high` is the default recommendation for most tasks, `xhigh` for the hardest, `medium`/`low` for routine work. This is an API parameter (`output_config.effort`) — not exposed as a toggle in the Claude.ai chat interface, so it's not directly actionable for our use case, just noted for completeness.

## Memory system [Official]

Fable performs better when it can record and reference lessons across sessions — even a plain markdown file works:

> Store one lesson per file with a one-line summary at the top. Record corrections and confirmed approaches alike, including why they mattered. Don't save what the repo or chat history already records; update an existing note rather than creating a duplicate; delete notes that turn out to be wrong.

## Subagent delegation to cheaper models [Official — Claude Code docs, confirmed via direct fetch]

Real, documented, named pattern ("Fable 5 as Orchestrator, Sonnet as Executor") — not something we're inventing. Confirmed mechanics from Claude Code's own subagent documentation (code.claude.com/docs/en/sub-agents):

**How model selection actually works:**
- A subagent's `model` frontmatter field (in a `.claude/agents/*.md` file) accepts `sonnet`, `opus`, `haiku`, `fable`, a full model ID, or `inherit` (the default — same model as the main conversation).
- **Resolution order:** (1) the `CLAUDE_CODE_SUBAGENT_MODEL` environment variable if set, (2) a per-invocation `model` parameter the orchestrating model can pass at the moment it calls a subagent, (3) the subagent definition's own `model` field, (4) fallback to the main conversation's model.
- Crucially: **the orchestrator itself (Fable) can pass a `model` override when it invokes a subagent** — this is exactly the mechanism needed for Fable to direct specific work to Sonnet, confirmed as real, documented behavior, not speculative.
- Built-in agents (Explore, Plan, general-purpose) default to `inherit` — they do **not** automatically run cheaper just because they're subagents. Getting the cost benefit requires either a custom subagent definition with `model: sonnet`, or Fable passing a per-invocation override.

**Triggering delegation:** Claude delegates automatically based on the task description and the subagent's `description` field. Including "use proactively" language in a custom subagent's description encourages the orchestrator to reach for it without being asked each time.

**Confirmed cost impact (independent reporting, not an Anthropic-published figure):** cutting costs on complex multi-step workflows by roughly 40–60% with an expensive-orchestrator/cheap-executor split, up to 5–10x in especially delegation-heavy workflows. Figures vary by how many subagent calls a session makes — not a fixed guarantee, and not Anthropic's own number.

**One honest nuance worth keeping in mind:** subagents inherit the main conversation's extended thinking setting. Since Fable always runs with thinking on, a Sonnet subagent it spawns likely runs with thinking enabled too — still far cheaper than Fable itself, but not quite as cheap as a bare non-thinking Sonnet call would be.

### Applying this to our build [Claude]

Define a custom subagent (e.g. `implementer`, `model: sonnet`, description including "use proactively" and scoped narrowly — "implements well-specified code modules exactly per a provided spec; no architecture decisions") for Fable to delegate mechanical/boilerplate work to: the static Control Panel mockup, the `BroadcastChannel` event-passing wiring, standard UI scaffolding. Fable itself retains architecture, design judgment calls, and anything not already settled in our spec. `CLAUDE_CODE_SUBAGENT_MODEL` is available as a blunt cost-ceiling safety net if wanted, forcing every subagent onto one model regardless of individual definitions.

**The orchestrator's review step is not optional.** Cheaper subagent models make more mistakes than the orchestrator would — the review/harmonization pass (already recommended above for consistency reasons) is also where errors get caught before they compound, not just a style-consistency check.

### Empirically confirmed working, in this exact environment [Claude — tested directly, not just documented]

Rather than trust the docs alone, tested it directly: spawned a subagent with a `model: "haiku"` override in this session and asked it to self-report. It returned "I am Claude Haiku 4.5 (model ID: `claude-haiku-4-5-20251001`)" — confirming the per-invocation model-override mechanism actually works in this specific Claude Code runtime, not just in theory. This resolves the earlier open uncertainty about whether cross-model subagent spawning would be supported in whatever harness this actually runs in.

**Karpathy search: came up empty.** Targeted search for Karpathy commentary specifically on the orchestrator/cheap-subagent-delegation technique found nothing attributable to him — the results were all other sources (blog posts, tooling docs). Not forcing a connection that isn't there.

## Scoped permission to do its own supplementary research [Claude]

Not addressed until explicitly raised — a real gap, not implicitly covered by everything else here. Left ambiguous, this fails in one of two directions: Fable never reaches for its own research tools even when it hits a genuine gap (guessing where it shouldn't), or it has unrestricted license to re-research everything we've already carefully vetted (the ARC Edge product research, the customer decision, the TSICP findings, the patent search), burning expensive effort re-deriving settled ground. The second failure mode is exactly what the anti-overplanning instruction already guards against — "do not re-derive facts already established in the conversation, re-litigate a decision the user has already made" — it just hadn't been pointed at this specific situation.

**The instruction to give Fable:** explicit permission to do its own web research (WebSearch/WebFetch), scoped to filling genuine gaps — pinning a specific part number where we only specified a category ("AD9361-class," "Jetson-class"), checking a datasheet detail, resolving something explicitly flagged as open rather than decided. Not re-checking anything already vetted and packaged in the reference documents. Whatever it finds should carry the same honest confidence-tagging discipline used throughout this whole project — verified vs. inferred vs. unconfirmed — not presented as more certain just because Fable found it itself.

## Karpathy's take [Verified-secondary — real URL, corroborated, not directly fetched]

Source: https://x.com/karpathy/status/2064409694761054332

Described Fable 5 as "a major-version-bump-deserving step change," strongest for "long problem-solving sessions on very difficult problems," while noting the safety classifiers felt "a little too trigger happy for launch."

## Karpathy's "Spec, Verifier, Environment" framework [Unverified-secondary]

Single-source paraphrase (not a primary transcript) of a talk attributed to Karpathy at "AISN 2026." Gist: don't use high-level planning modes — instead co-design a detailed spec, have the model interview you to pin down the actual goal/decision the project should drive, and pair that with a way to verify output and an environment for it to act in. Directionally consistent with the official "specify done upfront" guidance above, but treat the specific wording as a gloss, not confirmed.

---

## Net takeaway for our one-shot prompt

1. Front-load *all* context in one message — spec, our idea, constraints, audience, why it matters.
2. State success criteria (what "done" looks like for the feature pick + PoC + pitch) explicitly.
3. Give explicit scope boundaries — this is a bounded PoC, not production software.
4. Explain the "why" — this is a take-home eval for a specific role, reviewed by named stakeholders, meant to demonstrate specific qualities.
5. Ask for a clean, jargon-free final deliverable, since the end output is a live pitch.
6. Skip effort-level language (not applicable in chat) and skip the `send_to_user` tool concept (that's an API/agent-harness feature, not relevant to a chat-based workflow).
7. Define a `model: sonnet` custom subagent for well-specified, mechanical implementation work, and instruct Fable explicitly to delegate to it rather than implementing boilerplate itself — a documented, real cost-optimization pattern, not a hypothetical one.
8. Grant explicit, scoped permission to do its own supplementary research — filling genuine gaps only, not re-deriving anything already vetted in the reference documents — with the same honest confidence-tagging discipline applied to whatever it finds.
