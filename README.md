# Sigma16 Visualiser

An interactive visualiser for the Sigma16 educational CPU. It lets students load programs, step through execution, and see how registers, memory, and I/O change.

## Features

- Beginner and advanced modes
- Load Sigma16 programs from text or file
- Parse and validate Sigma16 assembly
- Step forward and backward through execution
- Visualise registers, memory, and labels
- I/O console for trap-based read/write
- Advanced panels: data flow, condition codes, stack, fetch/decode/execute

## Quick Start

1) Install dependencies:

```bash
npm install
```

2) Run the dev server:

```bash
npm run dev
```

3) Build for production:

```bash
npm run build
```

## Manual

See `manual.md` for a student-friendly walkthrough of the UI and panels.

## GitHub Pages

This repo is configured for GitHub Pages. Push to `main` and the workflow deploys to:

`https://laurieshinn89.github.io/sigma16-visualiser/`

## Project Layout

```
.
+- src/
¦  +- components/
¦  ¦  +- Sigma16Visualizer.jsx
¦  +- hooks/
¦  ¦  +- useSigma16Timeline.js
¦  +- logic/              # Sigma16 core (from upstream project)
¦  +- utils/
¦     +- formatters.js
+- public/
+- manual.md
+- package.json
+- vite.config.js
```

## Core Sigma16 Logic

The visualiser reuses the Sigma16 core logic:

- `src/logic/architecture.mjs`: instruction formats and opcodes
- `src/logic/assembler.mjs`: assembly to machine code
- `src/logic/emulator.mjs`: execution engine
- `src/logic/arrbuf.mjs`: memory access helpers
- `src/logic/arithmetic.mjs`: word operations
