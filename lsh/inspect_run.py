"""Inspect a saved clustering run (lsh/results/run_*.json or lsh-IRAC/results/run_*.json).

Replaces the earlier one-off scripts (debug_clusters.py, debug_small_clusters.py,
deep_inspect.py, inspect_clusters.py), each of which hardcoded a single run file.

Usage (from the repository root):
    python lsh/inspect_run.py lsh/results/run_20260217_153621.json summary
    python lsh/inspect_run.py lsh/results/run_20260217_153621.json small --max-size 3
    python lsh/inspect_run.py lsh/results/run_20260217_153621.json verdicts
    python lsh/inspect_run.py lsh/results/run_20260217_153621.json excerpts --chars 800
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

NO_PATTERNS = [
    "not enforceable", "unenforceable", "probably not", "likely not",
    "unlikely", "no, the", "no. the", "no the", "short answer: no", "answer: no",
]
YES_PATTERNS = [
    "is enforceable", "are enforceable", "likely enforceable",
    "probably yes", "likely yes", "very likely yes", "short answer: yes",
    "answer: yes", "potentially enforceable", "may be enforceable",
]


def member_text(member: dict) -> str:
    """Free-form runs store `text`; IRAC runs store the four IRAC fields."""
    if member.get("text"):
        return member["text"]
    parts = [member.get(k, "") for k in ("issue", "rule", "application", "conclusion")]
    return " ".join(p for p in parts if p)


def verdict_hint(text: str) -> str:
    """Crude yes/no/ambiguous classifier over the opening of a response."""
    clean = " ".join(re.sub(r"[*_]", "", text[:300]).split()).lower()
    if any(p in clean for p in NO_PATTERNS):
        return "NO"
    if any(p in clean for p in YES_PATTERNS):
        return "YES"
    return "AMBIGUOUS"


def load_clusters(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if "clusters" not in data:
        raise SystemExit(f"{path} has no 'clusters' key (keys: {list(data)})")
    return data["clusters"]


def cmd_summary(clusters: dict, args: argparse.Namespace) -> None:
    print(f"Total clusters: {len(clusters)}\n")
    for cluster_id, cluster in clusters.items():
        members = cluster.get("members", [])
        counts = Counter(m.get("model", "?") for m in members)
        print(f"=== Cluster {cluster_id} (size {len(members)}) ===")
        print(f"Model breakdown: {dict(counts)}")
        if args.model:
            hits = [m for m in members if m.get("model") == args.model]
            if hits:
                print(f"Contains {len(hits)} {args.model} responses. Sample:")
                print(member_text(hits[0])[:300] + "...")
        print("-" * 40)


def cmd_small(clusters: dict, args: argparse.Namespace) -> None:
    print(f"Total clusters: {len(clusters)}")
    for cluster_id, cluster in clusters.items():
        members = cluster.get("members", [])
        if len(members) <= args.max_size:
            rep = cluster.get("representative", {})
            print(f"\n--- Cluster {cluster_id} (size {len(members)}) ---")
            print(f"Model: {rep.get('model', '?')}")
            print(f"Preview: {member_text(rep)[:200]}...")


def cmd_verdicts(clusters: dict, args: argparse.Namespace) -> None:
    for cluster_id, cluster in clusters.items():
        if cluster_id in ("noise", "-1"):
            continue
        members = cluster.get("members", [])
        verdicts = [verdict_hint(member_text(m)) for m in members]
        yes, no, amb = (verdicts.count(v) for v in ("YES", "NO", "AMBIGUOUS"))
        print(f"\n=== Cluster {cluster_id} (size {len(members)}) ===")
        print(f"Verdicts: YES={yes}, NO={no}, AMBIGUOUS={amb}")
        if yes and no:
            print("!!! Mixed cluster: members disagree on the outcome !!!")
            for label in ("YES", "NO"):
                idx = verdicts.index(label)
                print(f"--- {label} example [{members[idx].get('model', '?')}] ---")
                print(member_text(members[idx])[:300] + "...")


def cmd_excerpts(clusters: dict, args: argparse.Namespace) -> None:
    lines = [f"Total clusters: {len(clusters)}"]
    for cluster_id, cluster in clusters.items():
        rep = cluster.get("representative", {})
        lines.append(f"\n=== Cluster {cluster_id} (size {len(cluster.get('members', []))}) ===")
        lines.append(f"Representative model: {rep.get('model', '?')}")
        lines.append(member_text(rep)[:args.chars])
        lines.append("...")
    output = "\n".join(lines)
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"Wrote {args.output}")
    else:
        print(output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("results", type=Path, help="Path to a run_*.json results file")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("summary", help="Per-cluster model breakdown")
    p.add_argument("--model", help="Also show a sample response from this model in each cluster")
    p.set_defaults(func=cmd_summary)

    p = sub.add_parser("small", help="List clusters at or below a size threshold")
    p.add_argument("--max-size", type=int, default=3)
    p.set_defaults(func=cmd_small)

    p = sub.add_parser("verdicts", help="Heuristic yes/no verdict split per cluster; flags mixed clusters")
    p.set_defaults(func=cmd_verdicts)

    p = sub.add_parser("excerpts", help="Representative excerpt per cluster")
    p.add_argument("--chars", type=int, default=800)
    p.add_argument("--output", help="Write to this file instead of stdout")
    p.set_defaults(func=cmd_excerpts)

    args = parser.parse_args()
    args.func(load_clusters(args.results), args)


if __name__ == "__main__":
    main()
