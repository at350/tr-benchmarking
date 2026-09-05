"""TR-Benchmarking: cluster and inspect how language models reason about legal questions.

Library entry points:
    trbench.pipeline.LSHEvaluationPipeline        embed + cluster free-form answers
    trbench.irac.pipeline.IRACEvaluationPipeline  the same for IRAC-structured answers, plus doctrine labels
    trbench.results.build_results_document        the run_<timestamp>.json format the portal reads

Command line: ``trbench --help`` (or ``python -m trbench.cli --help``).
"""

__version__ = "0.1.0"
