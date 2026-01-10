# Sigma16 Logic Integration Guide

This guide explains how to integrate the Sigma16 core logic into your React components.

## Quick Start Example

```javascript
import { useState, useEffect } from 'react'
import { assembler } from '@logic/assembler.mjs'
import { EmulatorState, executeInstruction, procReset } from '@logic/emulator.mjs'
import { initializeMachineState } from '@logic/state.mjs'

function MyComponent() {
  const [emState, setEmState] = useState(null)

  useEffect(() => {
    // Initialize emulator on mount
    const es = new EmulatorState()
    initializeMachineState(es)
    setEmState(es)
  }, [])

  const handleAssemble = (sourceCode) => {
    try {
      const result = assembler('myprogram', sourceCode)
      // result contains: objectCode, listing, metadata
      console.log('Assembly successful:', result)
    } catch (error) {
      console.error('Assembly error:', error)
    }
  }

  const handleStep = () => {
    if (emState) {
      executeInstruction(emState)
      // Force re-render to show updated state
      setEmState({...emState})
    }
  }

  const handleReset = () => {
    if (emState) {
      procReset(emState)
      setEmState({...emState})
    }
  }

  return (
    <div>
      {/* Your UI here */}
    </div>
  )
}
```

## Core Modules Overview

### 1. Assembler (`@logic/assembler.mjs`)

**Purpose**: Convert assembly language to machine code

```javascript
import { assembler } from '@logic/assembler.mjs'

// Assemble code
const sourceCode = `
  load R1,x[R0]
  add R2,R1,R3
  store R2,y[R0]
  trap R0,R0,R0
`

const result = assembler('program', sourceCode)

// Result structure:
// {
//   objectCode: Array,      // Machine code
//   listing: String,        // Assembly listing
//   metadata: Object,       // Symbol table, etc.
//   errors: Array          // Assembly errors if any
// }
```

### 2. Emulator (`@logic/emulator.mjs`)

**Purpose**: Execute Sigma16 instructions

```javascript
import {
  EmulatorState,
  executeInstruction,
  procReset,
  initializeMachineState
} from '@logic/emulator.mjs'

// Create and initialize emulator
const es = new EmulatorState()
initializeMachineState(es)

// Execute single instruction
executeInstruction(es)

// Reset processor
procReset(es)

// Access state
console.log('PC:', es.pc)
console.log('Registers:', es.reg)  // Array of 16 registers
console.log('Memory:', es.mem)     // Memory array
console.log('Condition codes:', es.ccC, es.ccV, es.ccG)
```

### 3. Architecture (`@logic/architecture.mjs`)

**Purpose**: Architecture definitions and constants

```javascript
import {
  mnemonicRRR,    // RRR instruction names
  mnemonicRX,     // RX instruction names
  iRRR,           // RRR format constants
  iRX,            // RX format constants
  ctlReg          // Control register map
} from '@logic/architecture.mjs'

// Get instruction mnemonic
const instr = 0x1234
const op = (instr >> 12) & 0xf
const mnemonic = mnemonicRX[op]
```

### 4. State Management (`@logic/state.mjs`)

**Purpose**: Global state and initialization

```javascript
import {
  SystemState,
  initializeMachineState,
  env  // Global environment
} from '@logic/state.mjs'

// Initialize machine state
const es = new EmulatorState()
initializeMachineState(es)

// Access global environment
console.log(env)
```

### 5. Arithmetic (`@logic/arithmetic.mjs`)

**Purpose**: Word operations and conversions

```javascript
import {
  wordToHex4,       // Convert word to hex string
  limit16,          // Limit to 16 bits
  binaryToDecimal   // Convert binary string to number
} from '@logic/arithmetic.mjs'

// Example: Convert register value to hex
const regValue = es.reg[1]
const hexString = wordToHex4(regValue)
console.log(`R1 = ${hexString}`)
```

## Emulator State Structure

```javascript
class EmulatorState {
  // Program counter
  pc: number

  // General-purpose registers (R0-R15)
  reg: Array[16]

  // Memory (65,536 words)
  mem: Array[65536]

  // Condition codes
  ccC: boolean  // Carry
  ccV: boolean  // Overflow
  ccG: boolean  // Greater

  // Control registers
  statusreg: number
  mask: number
  req: number
  istat: number
  ipc: number
  vect: number

  // Instruction register
  ir: number

  // Current instruction components
  instrCode: number
  instrOp: number
  instrOpCode: number
  instrDisp: number

  // Additional state...
}
```

## Common Patterns

### Pattern 1: Assembly + Execution

```javascript
const runProgram = (sourceCode) => {
  // Step 1: Assemble
  const asmResult = assembler('prog', sourceCode)

  if (asmResult.errors && asmResult.errors.length > 0) {
    console.error('Assembly errors:', asmResult.errors)
    return
  }

  // Step 2: Load into memory
  const objectCode = asmResult.objectCode
  for (let i = 0; i < objectCode.length; i++) {
    es.mem[i] = objectCode[i]
  }

  // Step 3: Execute
  while (!es.halted) {
    executeInstruction(es)
  }
}
```

### Pattern 2: Step-by-Step Execution

```javascript
const [isRunning, setIsRunning] = useState(false)
const [stepCount, setStepCount] = useState(0)

const singleStep = () => {
  if (!es.halted) {
    executeInstruction(es)
    setStepCount(c => c + 1)
    // Trigger re-render
    setEmState({...es})
  }
}

const runContinuous = () => {
  setIsRunning(true)
  const interval = setInterval(() => {
    if (es.halted) {
      clearInterval(interval)
      setIsRunning(false)
    } else {
      executeInstruction(es)
      setEmState({...es})
    }
  }, 100) // Execute every 100ms
}
```

### Pattern 3: Register Display

```javascript
const RegisterDisplay = ({ emState }) => {
  if (!emState) return null

  return (
    <div className="registers">
      {emState.reg.map((value, index) => (
        <div key={index} className="register">
          <span className="reg-name">R{index}</span>
          <span className="reg-value">{wordToHex4(value)}</span>
        </div>
      ))}
    </div>
  )
}
```

### Pattern 4: Memory View

```javascript
const MemoryView = ({ emState, start = 0, count = 256 }) => {
  if (!emState) return null

  return (
    <div className="memory">
      {Array.from({ length: count }, (_, i) => {
        const addr = start + i
        const value = emState.mem[addr]
        return (
          <div key={addr} className="mem-cell">
            <span className="addr">{wordToHex4(addr)}</span>
            <span className="value">{wordToHex4(value)}</span>
          </div>
        )
      })}
    </div>
  )
}
```

## Important Notes

### Module Loading
- All logic files use `.mjs` extension (ES6 modules)
- Import using `@logic/` path alias (configured in vite.config.js)
- Modules may have circular dependencies (handled by ES6 module system)

### State Updates
- Emulator state is mutable
- Force React re-renders with `setEmState({...emState})`
- Or use a counter: `const [tick, setTick] = useState(0)` and increment on changes

### Performance
- Executing many instructions can be slow in JavaScript
- Consider using Web Workers for long-running execution
- The `emwt.mjs` module provides Web Worker support

### Browser Compatibility
- Requires modern browser with ES6 module support
- WebAssembly support for `emcore.wat` (optional performance boost)

## Example Programs

### Hello World (Trap output)
```assembly
; Display message and halt
      lea   R1,msg[R0]      ; Point to message
      load  R2,len[R0]      ; Length of message
      trap  R1,R2,R0        ; Write trap
      trap  R0,R0,R0        ; Halt trap

msg   data  $0048           ; 'H'
      data  $0065           ; 'e'
      data  $006c           ; 'l'
      data  $006c           ; 'l'
      data  $006f           ; 'o'
len   data  5
```

### Simple Addition
```assembly
; Add two numbers
      load  R1,x[R0]        ; Load first number
      load  R2,y[R0]        ; Load second number
      add   R3,R1,R2        ; Add them
      store R3,z[R0]        ; Store result
      trap  R0,R0,R0        ; Halt

x     data  42
y     data  17
z     data  0
```

## Debugging Tips

1. **Enable logging**: Check `common.mjs` for debug flags
2. **Inspect state**: Use browser DevTools to inspect `emState` object
3. **Watch PC**: Monitor program counter to track execution
4. **Check IR**: Instruction register shows current instruction
5. **Condition codes**: Watch ccC, ccV, ccG for arithmetic results

## Next Steps

1. Study the `useSigma16.js` hook as a starting point
2. Implement assembly in the hook
3. Add step/run/reset functionality
4. Create UI components to display state
5. Add breakpoint support
6. Implement memory/register inspection

## Resources

- Core logic is in `src/logic/`
- Original Sigma16 docs in `Sigma16/docs/`
- Examples in `Sigma16/Examples/`
