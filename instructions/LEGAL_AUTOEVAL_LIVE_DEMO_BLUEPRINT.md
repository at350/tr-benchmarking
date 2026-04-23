# Legal Auto-Eval Live Demo Blueprint

Simple script for the Frank and Karthic portion of the live demo on the `Legal Auto-Eval Pipeline` page.

Assumption: the demo JSON is already loaded, so the goal is to show the logic of the workflow clearly instead of waiting for steps to run live.

## Core framing

- Use `/legal-autoeval-pipeline`.
- Treat the loaded demo JSON as the prepared state for the presentation.
- Total demo time: 5 minutes.
- This section covers your 3-minute portion.
- Your teammate covers the remaining 2 minutes on Dasha and Zak.

## Main idea

"We start with a real legal source, turn it into a shared question, and turn that question into a scoring standard before the later evaluation stages begin."

## Recommended loaded state

Use the saved Westside example.

- Frank packet: `frank_v2_1776737688714_67b0f085`
- Approved rubric pack: `karthic_v2_1776739479433_c6ef5ee0`

## Pre-demo checklist

1. Open `http://localhost:3000/legal-autoeval-pipeline`.
2. Confirm the demo JSON is already loaded.
3. Confirm the Westside packet is selected or easy to select.
4. Confirm the rubric pack is available in the Karthic stages.
5. Keep one backup tab open on the same page.

## 3-minute script

### 0:00-0:25 Opening

Click:

- Open `Legal Auto-Eval Pipeline`
- Briefly point to the top-level blocks

Say:

"This is our representation of the research workflow. Our actual work is not building a consumer application, but building and justifying the pipeline itself, so this interface is mainly a way to show the method clearly."

### 0:25-0:45 What this section covers

Click:

- Stay on the top-level view for a moment

Say:

"My part of the demo covers the first two parts of that workflow. First, we turn one legal source into a fair shared question, and then we turn that example into a scoring standard for the later evaluation stages."

### 0:45-1:05 Load the example

Click:

- In `Source Upload / Packet Selection`
- Open `Saved Frank packets`
- Select the Westside packet if needed

Say:

"For the demo, we are using a prepared example so we can focus on the reasoning behind the workflow instead of waiting for a live run."

### 1:05-1:25 Routing / Intake

Click:

- `Routing / Intake`

Point out:

- `Selected pack`
- `Routing reason`
- `Intake checklist`

Say:

"This first step is a quality check. It decides what kind of legal problem we are dealing with and whether this source is strong enough to build the rest of the workflow on."

### 1:25-1:45 Extraction / Mapping

Click:

- `Extraction / Mapping`

Point out:

- `Source extraction sheet`
- `Gold packet mapping`
- `Locked controller card`
- `Likely failure modes`

Say:

"This step organizes the important parts of the source into a stable reference point. That matters because every later step needs to stay tied to the same legal ideas, the same facts, and the same likely mistakes."

### 1:45-2:00 Benchmark Answer

Click:

- `Benchmark Answer`

Action:

- Scroll slightly in the benchmark answer box

Say:

"This answer is our model of what a strong answer should look like. It gives the workflow a concrete target instead of leaving quality to general impression."

### 2:00-2:10 Reverse-Engineered Question

Click:

- `Reverse-Engineered Question`

Action:

- Read only the first couple lines

Say:

"This question turns that target answer back into a fair test, so every later model is answering the same prompt under the same conditions."

### 2:10-2:30 Seed Rubric

Click:

- `Seed Rubric`

Point out:

- Initial rubric rows
- Connection to the packet and question

Say:

"The seed rubric is the first draft of the scoring guide. It takes the source, the target answer, and the test question and turns them into the first list of things a good answer should get right."

### 2:30-2:50 Refine Rubric

Click:

- `Refine Rubric`

Point out:

- Sharper row wording
- Cleaner structure
- Removal of overlap

Say:

"The refine step improves that first draft. It makes broad or repetitive criteria more precise, so the scoring guide becomes easier to apply and better at separating strong answers from weak ones."

### 2:50-3:10 Approve Rubric and handoff

Click:

- `Approve Rubric`

Point out:

- Final row set
- Scoring policy
- Penalties and caps

Say:

"The approve step freezes the scoring standard that the later evaluation stages will use. This matters because once scoring begins, we want one stable rubric rather than changing the rules while looking at results."

Handoff line:

"At this point, the example, the question, and the scoring standard are all set, so the next part of the demo can focus on evaluating model answers against that fixed standard."

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

## Easy lines to memorize

- "This interface is a representation of the workflow, not the main research product."
- "This step checks whether the source is good enough to build on."
- "This step turns the source into one shared question."
- "This step creates the first scoring guide."
- "This step sharpens the scoring guide so it is easier to apply."
- "This step locks the final scoring standard before evaluation begins."

## What to avoid saying

- Do not assume the audience knows any project terms.
- Do not imply that the interface itself is the main contribution.
- Do not imply that every step is running from scratch live.
- Do not read long text blocks aloud.
- Do not spend time editing fields live.
