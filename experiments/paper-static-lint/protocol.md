# Paper Static Lint Protocol

## Purpose

The manuscript should be buildable as a LaTeX paper, but this machine currently
does not have `latexmk`, `pdflatex`, `xelatex`, or `tectonic`. This experiment
adds a static fallback check that catches missing paper inputs before a full TeX
environment is available.

## Acceptance Checks

- Every `\input{...}` target exists.
- Every `\includegraphics{...}` target resolves.
- Every `\bibliography{...}` file exists.
- Every citation key referenced by `\cite...{...}` appears in the bibliography.

## Command

```bash
python3 -m research.validation paper-lint --paper-root paper --output research/runs/paper_lint.json
```
