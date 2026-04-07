# TR-Benchmarking

TR-Benchmarking is a framework for evaluating how reliably large language models perform **legal reasoning**, not just whether they produce the correct answer.

Most current LLM benchmarks measure **final answer accuracy**. That misses a critical problem: two models can produce the same answer while following completely different reasoning paths. In high-stakes domains like law, medicine, and finance, the reasoning process matters as much as the answer.

TR-Benchmarking is designed to evaluate the **structure, consistency, and robustness of reasoning** used by LLMs.

---

# The Problem

Modern LLM evaluation has three major limitations:

1. **Answer-only evaluation**  
   Benchmarks usually check whether the final answer matches a label. They do not evaluate *how the model reasoned*.

2. **Hidden reasoning instability**  
   Models may produce different legal arguments across runs even when answering the same question.

3. **Poor visibility into failure modes**  
   When a model is wrong, it is difficult to understand whether the issue came from:
   - misapplied rules
   - flawed logic
   - hallucinated facts
   - unstable reasoning paths

TR-Benchmarking attempts to make reasoning **observable and comparable**.

---

# Core Idea

The framework forces LLMs to produce structured legal analysis in **IRAC format**:

- Issue  
- Rule  
- Application  
- Conclusion

This structured reasoning is then normalized, embedded, and clustered to identify **distinct reasoning patterns** across models.

Instead of asking:

> Did the model get the answer right?

we can ask:

> What reasoning strategies did the model use, and how consistent are they?

---

# How It Works

## 1. Structured Generation

LLMs are prompted to output legal reasoning in a strict JSON schema:

```json
{
  "issue": "...",
  "rule": "...",
  "application": "...",
  "conclusion": "..."
}
```

This removes conversational fluff and forces models to expose their reasoning structure.

---

## 2. Parsing and Normalization

LLM outputs are often messy. The pipeline:

- extracts valid JSON from model responses
- handles markdown blocks and malformed outputs
- strips boilerplate
- converts responses into a consistent representation

Example normalized output:

```text
Issue: ...
Rule: ...
Application: ...
Conclusion: ...
```

---

## 3. Embedding Reasoning

Each reasoning trace is embedded using an instruction-tuned model (`hkunlp/instructor-large`) with a prompt emphasizing **legal reasoning structure**.

This creates a vector representation of the model’s reasoning path.

---

## 4. Clustering Reasoning Strategies

UMAP + HDBSCAN clustering groups responses by **semantic reasoning similarity**.

This reveals:

- distinct legal argument strategies
- unstable reasoning clusters
- outliers and hallucinated logic
- differences between models

Clusters represent **different legal reasoning approaches**, not just answer correctness.

---

## 5. Robustness Testing

The pipeline can inject **poisoned responses** (e.g., logically inconsistent or irrelevant reasoning) to test whether the clustering system correctly isolates flawed reasoning.

This helps evaluate whether the system can distinguish:

- valid reasoning
- inconsistent reasoning
- adversarial outputs

---

# Current Demo

The current demo uses law questions from the  
**SuperGPQA benchmark**:

https://github.com/SuperGPQA/SuperGPQA

The repository demonstrates the core workflow:

1. Generate structured reasoning from multiple LLMs
2. Normalize responses
3. Embed reasoning traces
4. Cluster reasoning patterns
5. Identify outliers

This is currently a **research prototype** demonstrating the concept.

---

# Who This Is For

Potential users include:

- **Legal AI companies** evaluating model reliability  
- **AI research teams** comparing models beyond answer accuracy  
- **Benchmark designers** exploring reasoning-level evaluation  
- **Safety teams** studying model robustness and failure modes  

---

# Setup

1. Clone the repository

```bash
git clone https://github.com/at350/tr-benchmarking
```

2. Add an `.env` file in the `frontend` directory containing your API keys.

Example:

```bash
OPENAI_API_KEY=your_key_here
```

3. Run the benchmark pipeline.

(Exact run instructions may evolve as the project develops.)

---

# Limitations

Current limitations include:

- Small dataset size
- Possible question bias
- Limited automated reasoning evaluation
- Early-stage clustering pipeline
- Prototype-level infrastructure

Results should currently be interpreted as **exploratory analysis**, not definitive benchmarking.

---

# Roadmap

Planned improvements include:

- Larger benchmark datasets
- Improved reasoning quality metrics
- LLM-as-a-judge evaluation
- model comparison dashboards
- reproducible benchmark runs
- automated reporting

---

# Why This Matters

If LLMs are going to be trusted in legal workflows, we need to answer a deeper question:

**When a model gets a legal question right, did it actually reason correctly — or did it just guess well?**

TR-Benchmarking attempts to measure that difference.
