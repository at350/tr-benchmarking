# Paper Static Lint Analysis

## Result

Status: passed.

The current manuscript resolves all LaTeX input files, figure files,
bibliography files, and citation keys under the static linter.

## Interpretation

This is not equivalent to a compiled PDF. It is a local build guard for the
current environment, where no TeX engine is installed. The open manuscript gap
remains: compile `paper/main.tex` with `latexmk`, `pdflatex`, `xelatex`, or
another real TeX engine in an environment that provides one.
