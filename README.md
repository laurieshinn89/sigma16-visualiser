# Sigma16 Visualiser

An interactive visualiser for the Sigma16 computer architecture built with React.

## Project Structure

```
sigma16 visualiser/
├── src/
│   ├── logic/              # Core Sigma16 logic (copied from Sigma16/src/base)
│   │   ├── architecture.mjs    # Instruction set definitions
│   │   ├── assembler.mjs       # Assembly to machine code
│   │   ├── emulator.mjs        # Execution engine
│   │   ├── arithmetic.mjs      # Arithmetic operations
│   │   ├── state.mjs           # State management
│   │   ├── arrbuf.mjs          # Memory management
│   │   ├── common.mjs          # Utilities
│   │   ├── linker.mjs          # Module linker
│   │   ├── s16module.mjs       # Module handling
│   │   └── sexp.mjs            # S-expression parsing
│   ├── components/         # React UI components
│   ├── hooks/             # Custom React hooks
│   ├── utils/             # Utility functions
│   ├── App.jsx            # Main App component
│   └── main.jsx           # Entry point
├── public/                # Static assets
├── index.html            # HTML template
├── package.json          # Dependencies
└── vite.config.js        # Vite configuration
```

## Core Logic Modules

The visualiser reuses the core Sigma16 logic from the main Sigma16 project:

- **architecture.mjs**: Defines instruction formats, opcodes, and architecture constants
- **assembler.mjs**: Translates assembly language to machine code
- **emulator.mjs**: Executes Sigma16 instructions and manages CPU state
- **state.mjs**: Global state management
- **arithmetic.mjs**: Word operations and conversions

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Development

The visualiser is built with:
- React 18
- Vite (build tool)
- ES6 modules

The core Sigma16 logic is imported as ES6 modules and integrated with React components for visualization.
