# Legal Auto-Eval Live Demo Blueprint

Simple script for a two-person live demo of the `Legal Auto-Eval Pipeline` page.

Assumption: the demo JSON is already loaded, so the goal is to show the flow clearly and quickly instead of waiting for steps to run live.

## Core framing

- Use `/legal-autoeval-pipeline`.
- Treat the loaded demo JSON as the prepared state for the presentation.
- Target total time: 5 minutes 30 seconds.
- Hard maximum: about 6 minutes.

## Demo structure

Do not alternate every line between the two people.

Use two coherent end-to-end segments:

1. Person A demos the first half of the pipeline while Person B keeps time.
2. Person B demos the second half of the pipeline while Person A keeps time.

This will feel cleaner and more natural than constantly swapping speakers.

## Recommended loaded state

Use the saved Westside example.

- Frank packet: `frank_v2_1776737688714_67b0f085`
- Approved rubric pack: `karthic_v2_1776739479433_c6ef5ee0`
- Judged Dasha run: `dasha_v2_1776438870000_0c991aa5`
- Optional Zak review: `zak_v1_1776738650983_45512350`

## Pre-demo checklist

1. Open `http://localhost:3000/legal-autoeval-pipeline`.
2. Confirm the demo JSON is already loaded.
3. Confirm the Westside packet is selected or easy to select.
4. Confirm the saved Dasha run is available in the run selector.
5. Keep one backup tab open on the same page.

## Main idea

"We start with a real legal source, turn it into a clear shared test, look at many answers in a consistent way, and bring in human review when the system is not reliable enough to stand on its own."

## 5.5-minute script

### Segment 1: Person A

Time budget: about 2 minutes 40 seconds.

Person B's only job during this segment: keep time and give a quiet 30-second warning if needed.

#### 0:00-0:30 Opening

Click:

- Open `Legal Auto-Eval Pipeline`
- Briefly point to `Frank`, `Karthic`, `Dasha`, `Zak`

Say:

"This page shows the full path from one legal source to a final evaluation. We start with a real case, turn it into a shared question, score many answers in a consistent way, and then check whether the result is clear enough to trust."

#### 0:30-0:55 Load the packet

Click:

- In `Source Upload / Packet Selection`
- Open `Saved Frank packets`
- Select the Westside packet if it is not already selected

Say:

"For this demo, we are using a preloaded example so we can focus on what each step does. The point of the presentation is to understand the flow, not to spend time waiting for a live run."

#### 0:55-1:25 Routing / Intake

Click:

- `Routing / Intake`

Point out:

- `Selected pack`
- `Routing reason`
- `Intake checklist`

Say:

"This first step is a quality check. It decides what kind of legal problem this is and whether this source is strong enough to use as the foundation for everything that comes after."

#### 1:25-1:55 Extraction / Mapping

Click:

- `Extraction / Mapping`

Point out:

- `Source extraction sheet`
- `Gold packet mapping`
- `Locked controller card`
- `Likely failure modes`

Say:

"This step takes the important ideas out of the source and organizes them clearly. That matters because every later step needs to stay tied to the same facts and legal points instead of drifting in different directions."

#### 1:55-2:20 Benchmark Answer

Click:

- `Benchmark Answer`

Action:

- Scroll slightly in the benchmark answer box

Say:

"This answer is our example of what a strong answer should look like. It gives the rest of the pipeline a clear target, so we are not judging future answers by instinct or by whatever sounds persuasive in the moment."

#### 2:20-2:40 Reverse-Engineered Question and handoff

Click:

- `Reverse-Engineered Question`

Action:

- Read only the first couple lines

Say:

"This question turns that strong answer back into a fair test. Every model gets the same question, which means the comparison later is based on the same task instead of different prompts or different assumptions."

Handoff line:

"Now that the source has been turned into a question with a clear target answer, Person B will take over for scoring and results."

### Segment 2: Person B

Time budget: about 2 minutes 50 seconds.

Person A's only job during this segment: keep time and give a quiet 30-second warning if needed.

#### 2:40-3:15 Karthic rubric

Click:

- `Seed Rubric`
- `Refine Rubric`
- `Approve Rubric`

Point out:

- Rubric rows
- Refined structure
- Penalties and caps in scoring policy

Say:

"This step turns the example into a scoring guide. Instead of just saying one answer feels better than another, we spell out what we are looking for, so different answers can be judged in the same way."

#### 3:15-3:55 Dasha cluster setup

Click:

- `Dasha Cluster`
- Point to `Requested responses`
- Point to `Model configuration`
- Point to `Saved runs`
- Select the judged Dasha run if needed

Say:

"This step collects many answers and groups similar ones together. That matters because the goal is not to stare at one answer at a time, but to understand the main patterns that show up across a whole batch."

#### 3:55-4:25 Dasha judge

Click:

- `Dasha Judge`

Point out:

- Clustered run selection
- Judge configuration

Say:

"This step applies the same scoring guide to those answer groups. That gives us a cleaner comparison, because now we can see which kinds of answers do well and which kinds of answers miss the mark."

#### 4:25-5:00 Dasha results

Click:

- `Dasha Results`
- Show `Compare`
- Click one module or row if helpful
- Show `Diagnose`
- Show `Explain`

Say:

"This results view is where everything comes together. It shows which answer groups did better, where they differed, and why, so the final evaluation is something a person can actually inspect and understand."

#### 5:00-5:30 Optional Zak or close

If there is time:

- Click `Zak Review`
- Briefly point out that human escalation exists

Short close:

"If the result is unclear or unstable, the workflow can hand the case to a person for review. That matters because a useful evaluation system should know when to stop and ask for human judgment."

If there is not time, skip Zak and end with:

"This pipeline turns one legal source into a shared test, scores many answers in a consistent way, and adds human review when the automated result is not clear enough on its own."

## Fast click order

1. `Source Upload / Packet Selection`
2. Select Westside packet
3. `Routing / Intake`
4. `Extraction / Mapping`
5. `Benchmark Answer`
6. `Reverse-Engineered Question`
7. `Seed Rubric`
8. `Refine Rubric`
9. `Approve Rubric`
10. `Dasha Cluster`
11. Select saved Dasha run if needed
12. `Dasha Judge`
13. `Dasha Results`
14. Optional: `Zak Review`

## Easy lines to memorize

- "We are turning one legal source into a shared test."
- "This step checks whether the source is good enough to build on."
- "This step turns the source into one shared question."
- "This step turns the example into a scoring guide."
- "This step compares groups of similar answers, not just one answer at a time."
- "If the result is unclear, a person reviews it."

## What to avoid saying

- Do not assume the audience knows any project terms.
- Do not imply that every step is running from scratch live.
- Do not read long text blocks aloud.
- Do not spend time editing fields live.
- Do not let Zak eat time unless the earlier parts moved quickly.

## Final recommendation

If you rehearse only one version, rehearse the 5 minute 30 second version with a very short Zak mention at the end. If time gets tight, keep Zak to one sentence and use the shorter closing line.
