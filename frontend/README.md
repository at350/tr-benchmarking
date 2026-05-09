# Research Workbench

This is the minimal browser workbench for the TR research pipeline. It is not a
separate product surface; the CLI in `../research/validation/` remains the
source of truth.

## Run

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`.

## Pages

- `/` runs and inspects the offline fixture.
- `/paper` renders the current manuscript from `../paper/`.

Generated build artifacts, env files, and dependencies are ignored by git.
