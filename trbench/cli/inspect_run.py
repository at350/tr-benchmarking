"""``trbench inspect``: summarise a saved clustering run (runs/*/results/run_*.json).

    trbench inspect runs/free-form/results/run_20260217_153621.json summary
    trbench inspect runs/free-form/results/run_20260217_153621.json small --max-size 3
    trbench inspect runs/free-form/results/run_20260217_153621.json verdicts
    trbench inspect runs/irac/results/run_20260303_163604.json excerpts --chars 800
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from trbench.verdict import verdict_hint


def member_text(member: dict) -> str:
    """Free-form runs store `text`; IRAC runs store the four IRAC fields."""
    if member.get("text"):
        return member["text"]
    parts = [member.get(k, "") for k in ("issue", "rule", "application", "conclusion")]
    return " ".join(p for p in parts if p)


NOISE_KEYS = {"-1", "noise"}


def load_run(path: Path) -> dict:
    """Read a run_<timestamp>.json document, with a short message when given the wrong file."""
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        raise SystemExit(f"{path} is a list of answers (a responses file), not a run file. "
                         "Run files are the run_<timestamp>.json documents under runs/*/results/.")
    if not isinstance(data, dict) or "clusters" not in data:
        found = ", ".join(list(data)[:10]) if isinstance(data, dict) else type(data).__name__
        raise SystemExit(f"{path} has no 'clusters' key (found: {found})")
    return data


def ordered_clusters(document: dict) -> list:
    """(cluster_id, cluster) pairs, largest first, with the noise bucket last."""
    items = list(document["clusters"].items())
    real = sorted((kv for kv in items if kv[0] not in NOISE_KEYS), key=lambda kv: -len(kv[1].get("members", [])))
    return real + [kv for kv in items if kv[0] in NOISE_KEYS]


def describe_totals(document: dict) -> str:
    """One line with the numbers the README's results table reports."""
    clusters = document["clusters"]
    real = [c for k, c in clusters.items() if k not in NOISE_KEYS]
    members = [m for c in clusters.values() for m in c.get("members", [])]
    unclustered = sum(len(clusters[k].get("members", [])) for k in clusters if k in NOISE_KEYS)
    models = {m.get("model", "?") for m in members}
    largest = max((len(c.get("members", [])) for c in real), default=0)
    line = (f"Answers: {len(members)} from {len(models)} models | Clusters: {len(real)} | "
            f"Unclustered: {unclustered} | Largest cluster: {largest}")
    failures = (document.get("metadata") or {}).get("failures") or {}
    if isinstance(failures, dict) and failures:
        line += " | Dropped as generation failures: " + ", ".join(f"{m} {n}" for m, n in failures.items())
    return line


def cmd_summary(document: dict, args: argparse.Namespace) -> None:
    print(describe_totals(document) + "\n")
    for cluster_id, cluster in ordered_clusters(document):
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


def cmd_small(document: dict, args: argparse.Namespace) -> None:
    print(describe_totals(document))
    for cluster_id, cluster in ordered_clusters(document):
        members = cluster.get("members", [])
        if len(members) <= args.max_size:
            rep = cluster.get("representative", {})
            print(f"\n--- Cluster {cluster_id} (size {len(members)}) ---")
            print(f"Model: {rep.get('model', '?')}")
            print(f"Preview: {member_text(rep)[:200]}...")


def cmd_verdicts(document: dict, args: argparse.Namespace) -> None:
    for cluster_id, cluster in ordered_clusters(document):
        if cluster_id in NOISE_KEYS:
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


def cmd_excerpts(document: dict, args: argparse.Namespace) -> None:
    lines = [describe_totals(document)]
    for cluster_id, cluster in ordered_clusters(document):
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


def add_parser(subparsers, name, help_text):
    parser = subparsers.add_parser(name, help=help_text, description=__doc__,
                                   formatter_class=argparse.RawDescriptionHelpFormatter)
    configure(parser)
    parser.set_defaults(run=run)


def configure(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("results", type=Path, help="Path to a run_*.json results file")
    sub = parser.add_subparsers(dest="view", required=True, metavar="<view>")

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



def run(args) -> int:
    args.func(load_run(args.results), args)
    return 0
