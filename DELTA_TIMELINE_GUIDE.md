# Delta-Based Timeline System Guide

This document explains the delta-based timeline implementation for the Sigma16 Visualizer.

## Overview

The visualizer uses a **delta-based timeline** approach where:
1. The initial CPU state is stored as a full snapshot
2. Each instruction execution stores only the **changes** (deltas) from the previous state
3. States at any point in time are reconstructed by applying deltas sequentially

## Architecture

```
Timeline Structure:
┌─────────────────────────────────────────────────────────┐
│ Initial State (Full Snapshot)                           │
│ - All 16 registers                                      │
│ - Full memory (65,536 words)                            │
│ - All flags and control registers                       │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│ Delta 1 (Step 0 → 1)                                    │
│ - pc: 0001                                              │
│ - changedRegisters: { 1: 0x002A }                       │
│ - changedMemory: {}                                     │
│ - flags: { ccC: false, ccV: false, ... }                │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│ Delta 2 (Step 1 → 2)                                    │
│ - pc: 0002                                              │
│ - changedRegisters: { 2: 0x0011 }                       │
│ - changedMemory: {}                                     │
│ - flags: { ccC: false, ccV: false, ... }                │
└─────────────────────────────────────────────────────────┘
                      ↓
                     ...
```

## Memory Efficiency

### Comparison: Full Snapshots vs Delta Snapshots

For a typical educational program (100 instructions):

**Full Snapshots:**
- Initial state: ~131 KB
- Per step: ~131 KB
- 100 steps: ~13.1 MB
- 1000 steps: ~131 MB

**Delta Snapshots:**
- Initial state: ~131 KB
- Per step: ~50-500 bytes (typical)
- 100 steps: ~180 KB (including initial)
- 1000 steps: ~630 KB (including initial)

**Memory Savings: ~99% for typical programs!**

### Delta Size Breakdown

A typical delta contains:
```javascript
{
  pc: 2 bytes,                      // Program counter
  ir: 2 bytes,                      // Instruction register
  instrCode: 2 bytes,               // Decoded instruction
  instrOp: 2 bytes,
  instrOpCode: 2 bytes,
  instrDisp: 2 bytes,
  instrEa: 2 bytes,

  changedRegisters: {               // 0-16 registers
    // Each: 4 bytes (key) + 2 bytes (value)
  },

  changedMemory: {                  // 0-N memory locations
    // Each: 4 bytes (key) + 2 bytes (value)
  },

  ccC: 1 byte,                      // Condition codes
  ccV: 1 byte,
  ccG: 1 byte,
  ccE: 1 byte,

  halted: 1 byte,
  blocked: 1 byte,
  instrCount: 4 bytes
}
```

**Typical Delta Size:**
- Base: ~30 bytes
- Per changed register: ~6 bytes
- Per changed memory: ~6 bytes
- Average: 50-200 bytes per instruction

## Implementation Details

### 1. useSigma16Timeline Hook

Location: `src/hooks/useSigma16Timeline.js`

**Key Functions:**

```javascript
const {
  // Current state
  currentState,        // Full state at currentStep
  currentDelta,        // Delta that led to currentState
  currentStep,         // Current step number (0 to totalSteps)
  totalSteps,          // Total number of steps

  // Timeline data
  timeline,            // Full timeline object

  // Status
  isExecuting,         // True while executing program
  error,               // Error message if any
  hasTimeline,         // True if timeline exists

  // Navigation
  goToStep,            // Go to specific step
  nextStep,            // Step forward
  prevStep,            // Step backward
  reset,               // Go to step 0
  goToEnd,             // Go to last step

  // Actions
  executeProgram,      // Execute assembly code
  clearTimeline,       // Clear timeline

  // Capabilities
  canStepForward,      // Can step forward?
  canStepBackward,     // Can step backward?
  isAtStart,           // At step 0?
  isAtEnd              // At last step?
} = useSigma16Timeline()
```

### 2. State Reconstruction

**How it works:**

```javascript
// To get state at step N:
function getStateAtStep(N) {
  let state = clone(initialState)

  for (let i = 0; i < N; i++) {
    state = applyDelta(state, deltas[i])
  }

  return state
}
```

**Optimization:**
- States are memoized using React's `useMemo`
- Only recomputed when `currentStep` changes
- Navigation uses efficient array slicing

### 3. Delta Computation

```javascript
function computeDelta(before, after) {
  const delta = {}

  // Always store PC (changes every instruction)
  delta.pc = after.pc

  // Store changed registers (sparse)
  delta.changedRegisters = {}
  for (let i = 0; i < 16; i++) {
    if (before.reg[i] !== after.reg[i]) {
      delta.changedRegisters[i] = after.reg[i]
    }
  }

  // Store changed memory (sparse)
  delta.changedMemory = {}
  for (let i = 0; i < after.mem.length; i++) {
    if (before.mem[i] !== after.mem[i]) {
      delta.changedMemory[i] = after.mem[i]
    }
  }

  // Always store flags (small)
  delta.ccC = after.ccC
  delta.ccV = after.ccV
  delta.ccG = after.ccG
  delta.ccE = after.ccE

  return delta
}
```

## Usage Examples

### Basic Usage

```javascript
import { useSigma16Timeline } from '@hooks/useSigma16Timeline'

function MyComponent() {
  const {
    currentState,
    executeProgram,
    nextStep,
    prevStep
  } = useSigma16Timeline()

  const handleRun = () => {
    const code = `
      load R1,x[R0]
      load R2,y[R0]
      add R3,R1,R2
      trap R0,R0,R0

      x data 10
      y data 20
    `
    executeProgram(code)
  }

  return (
    <div>
      <button onClick={handleRun}>Run</button>
      <button onClick={nextStep}>Step Forward</button>
      <button onClick={prevStep}>Step Back</button>

      {currentState && (
        <div>
          PC: {currentState.pc}
          R1: {currentState.reg[1]}
        </div>
      )}
    </div>
  )
}
```

### Displaying Changed Values

```javascript
function RegisterDisplay({ currentState, currentDelta }) {
  return (
    <div>
      {Array.from({ length: 16 }, (_, i) => {
        const isChanged = currentDelta?.changedRegisters?.[i] !== undefined

        return (
          <div
            key={i}
            className={isChanged ? 'changed' : ''}
          >
            R{i}: {currentState.reg[i]}
          </div>
        )
      })}
    </div>
  )
}
```

### Timeline Scrubber

```javascript
function TimelineScrubber({ currentStep, totalSteps, goToStep }) {
  return (
    <input
      type="range"
      min={0}
      max={totalSteps}
      value={currentStep}
      onChange={(e) => goToStep(parseInt(e.target.value))}
      style={{ width: '100%' }}
    />
  )
}
```

### Auto-Play Animation

```javascript
function AutoPlay({ nextStep, canStepForward }) {
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (!isPlaying) return

    const interval = setInterval(() => {
      if (canStepForward) {
        nextStep()
      } else {
        setIsPlaying(false)
      }
    }, 500) // 500ms per step

    return () => clearInterval(interval)
  }, [isPlaying, canStepForward, nextStep])

  return (
    <button onClick={() => setIsPlaying(!isPlaying)}>
      {isPlaying ? 'Pause' : 'Play'}
    </button>
  )
}
```

## Performance Considerations

### Time Complexity

- **Execute program**: O(N) where N = number of instructions
- **Go to step M**: O(M) to reconstruct state (must apply M deltas)
- **Step forward/backward**: O(1) if using cached state + delta application
- **Memory usage**: O(N × D) where D = average delta size

### Optimization Strategies

1. **Memoization**: Current state is memoized
2. **Incremental updates**: Moving forward/backward only applies one delta
3. **Sparse storage**: Only changed values are stored
4. **Typed arrays**: Using Uint16Array for registers and memory

### Future Optimizations

1. **Checkpoint system**: Store full snapshots every N steps for faster random access
2. **Lazy loading**: Only reconstruct visible memory ranges
3. **Compression**: Compress deltas for long-running programs
4. **Web Worker**: Offload state reconstruction to background thread

## Visualization Benefits

The delta-based approach enables:

1. **Highlighting changes**: Easily show what changed each step
2. **Diff view**: Compare any two states efficiently
3. **Heatmaps**: Track which registers/memory changed most
4. **Timeline scrubbing**: Drag to any point in execution
5. **Replay**: Forward/backward with smooth animations
6. **Breakpoints**: Stop at specific conditions
7. **Watch values**: Track specific registers/memory

## Example: Complete Visualizer

See [src/components/Sigma16Visualizer.jsx](src/components/Sigma16Visualizer.jsx) for a complete working example that demonstrates:

- Assembly code editor
- Step-by-step execution controls
- Register display with change highlighting
- Memory view with change highlighting
- Condition code display
- Delta summary (what changed this step)
- Execution statistics

## Testing

Example test program:

```assembly
; Test program for delta visualization
    load  R1,x[R0]      ; Delta: R1 changed
    load  R2,y[R0]      ; Delta: R2 changed
    add   R3,R1,R2      ; Delta: R3, flags changed
    store R3,sum[R0]    ; Delta: memory changed
    trap  R0,R0,R0      ; Delta: halted flag

x    data  42
y    data  17
sum  data  0
```

Expected deltas:
1. Load x: R1 = 42
2. Load y: R2 = 17
3. Add: R3 = 59, flags updated
4. Store: mem[8] = 59
5. Trap: halted = true

## Debugging

To inspect the timeline:

```javascript
const { timeline } = useSigma16Timeline()

console.log('Initial state:', timeline.initialState)
console.log('All deltas:', timeline.deltas)
console.log('Step 0→1:', timeline.deltas[0])
console.log('Changed regs:', timeline.deltas[0].changedRegisters)
console.log('Changed mem:', timeline.deltas[0].changedMemory)
```

## Summary

The delta-based timeline system provides:

✅ **99% memory savings** compared to full snapshots
✅ **Fast forward/backward stepping**
✅ **Change highlighting** for visualization
✅ **Scales to 10,000+ instructions**
✅ **Perfect for educational visualizers**

This approach is ideal for the Sigma16 Visualizer because:
- Educational programs are typically short (<1000 instructions)
- Each instruction changes only 1-3 values on average
- Visualization benefits from knowing what changed
- Memory efficiency allows storing entire execution history
