# Sigma16 Visualiser - Project Structure

## Overview
This is a React-based visualisation tool for the Sigma16 computer architecture. It reuses the core logic from the Sigma16 project while providing a completely new React-based UI.

## Directory Structure

```
sigma16 visualiser/
├── src/
│   ├── logic/                      # Core Sigma16 logic (copied from Sigma16/src/base)
│   │   ├── architecture.mjs        # Instruction set definitions, opcodes, formats
│   │   ├── assembler.mjs           # Assembly language to machine code translator
│   │   ├── emulator.mjs            # CPU execution engine
│   │   ├── arithmetic.mjs          # Word operations and conversions
│   │   ├── state.mjs               # Global state management
│   │   ├── arrbuf.mjs              # Memory layout and shared buffers
│   │   ├── common.mjs              # Utility functions and logging
│   │   ├── linker.mjs              # Module linker
│   │   ├── s16module.mjs           # Module and file handling
│   │   ├── sexp.mjs                # S-expression parsing
│   │   ├── emwt.mjs                # Web Worker thread support
│   │   ├── emcore.wat              # WebAssembly emulator core
│   │   ├── shmparams.mjs           # Shared memory parameters
│   │   └── version.mjs             # Version info
│   │
│   ├── components/                 # React UI components (to be built)
│   │   └── (Add visualisation components here)
│   │
│   ├── hooks/                      # Custom React hooks
│   │   └── useSigma16.js           # Hook for Sigma16 emulator integration
│   │
│   ├── utils/                      # Utility functions
│   │   └── (Add helper functions here)
│   │
│   ├── App.jsx                     # Main application component
│   ├── App.css                     # Main application styles
│   ├── main.jsx                    # Entry point
│   └── index.css                   # Global styles
│
├── public/                         # Static assets
│
├── index.html                      # HTML template
├── package.json                    # Project dependencies and scripts
├── vite.config.js                  # Vite build configuration
├── .gitignore                      # Git ignore rules
├── README.md                       # Project documentation
└── PROJECT_STRUCTURE.md            # This file
```

## Core Logic Modules

### Essential Modules (From Sigma16/src/base)

1. **architecture.mjs** (30KB)
   - Instruction formats: RRR, RX, EXP
   - Opcodes and mnemonics
   - Control registers
   - Bit manipulation functions

2. **assembler.mjs** (71KB)
   - Parses assembly source code
   - Generates object code
   - Creates assembly listings
   - Handles labels and symbols

3. **emulator.mjs** (74KB)
   - Executes Sigma16 instructions
   - Manages CPU registers and memory
   - Handles interrupts
   - Instruction decode and execution loop

4. **state.mjs** (42KB)
   - Global state management
   - Module set management
   - Stage management (Asm → Obj → Exe)

5. **arithmetic.mjs** (34KB)
   - Word representation (16-bit/32-bit)
   - Data type conversions
   - Arithmetic operations

6. **arrbuf.mjs** (19KB)
   - Memory map layout
   - Shared array buffer support
   - State vector organization

7. **common.mjs** (4KB)
   - Platform detection
   - Logging utilities
   - Error handling

## React Components Structure

### Planned Components

```
components/
├── Editor/
│   ├── AssemblyEditor.jsx       # Code editor for assembly
│   └── SyntaxHighlighter.jsx    # Syntax highlighting
│
├── Visualiser/
│   ├── CPUState.jsx             # Display CPU registers
│   ├── MemoryView.jsx           # Memory visualization
│   ├── InstructionView.jsx      # Current instruction display
│   └── ControlPanel.jsx         # Run/Step/Reset controls
│
├── Debugger/
│   ├── Breakpoints.jsx          # Breakpoint management
│   └── Watchlist.jsx            # Watch variables
│
└── Layout/
    ├── Header.jsx               # App header
    └── Sidebar.jsx              # Navigation sidebar
```

## Integration Points

### How React Interfaces with Sigma16 Logic

1. **Initialization**
   ```javascript
   import { initializeMachineState } from '@logic/emulator.mjs'
   const emulatorState = initializeMachineState()
   ```

2. **Assembly**
   ```javascript
   import { assembler } from '@logic/assembler.mjs'
   const result = assembler('program', sourceCode)
   ```

3. **Execution**
   ```javascript
   import { executeInstruction } from '@logic/emulator.mjs'
   executeInstruction(emulatorState)
   ```

4. **State Access**
   ```javascript
   // Access registers, memory, flags from emulatorState
   const registers = emulatorState.reg
   const memory = emulatorState.mem
   ```

## Development Workflow

### Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run Development Server**
   ```bash
   npm run dev
   ```
   Opens at http://localhost:5173

3. **Build for Production**
   ```bash
   npm run build
   ```

### Key Development Tasks

1. **Create Visualisation Components**
   - Build React components in `src/components/`
   - Import and use Sigma16 logic from `@logic/` modules
   - Use the `useSigma16` hook for emulator integration

2. **Integrate Emulator**
   - Expand `useSigma16.js` hook
   - Connect assembly, execution, and state management
   - Provide real-time state updates to components

3. **Add Visualisations**
   - Register displays
   - Memory viewer
   - Instruction highlighting
   - Execution flow diagrams

## Technology Stack

- **Frontend Framework**: React 18
- **Build Tool**: Vite 5
- **Module System**: ES6 modules (.mjs)
- **Styling**: CSS (can be upgraded to Styled Components, Tailwind, etc.)
- **Core Logic**: Sigma16 modules (pure JavaScript)

## Path Aliases

Configured in `vite.config.js`:
- `@` → `/src`
- `@logic` → `/src/logic`
- `@components` → `/src/components`
- `@hooks` → `/src/hooks`
- `@utils` → `/src/utils`

## Next Steps

1. Expand `useSigma16` hook to fully integrate the emulator
2. Create visualisation components for:
   - CPU registers
   - Memory display
   - Instruction execution
   - Control flow
3. Add debugging features:
   - Breakpoints
   - Step execution
   - Watch values
4. Implement assembly editor with syntax highlighting
5. Add example programs
6. Create user documentation

## Notes

- All core logic files use `.mjs` extension (ES6 modules)
- The logic is completely separated from UI
- No modifications to core logic files should be needed
- React components should import and use logic as-is
- The visualiser runs entirely in the browser (no backend required)
