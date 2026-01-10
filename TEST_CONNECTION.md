# Testing the Sigma16 Logic Connection

## Quick Test

To verify if the Sigma16 logic is properly connected:

### Option 1: Use Browser Console

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:5173 in your browser

3. Open browser console (F12)

4. Run:
   ```javascript
   import { testBasicConnection } from './src/utils/testConnection.js'
   testBasicConnection()
   ```

### Option 2: Try the Visualizer

1. Start the dev server
2. Enter this test program:
   ```assembly
   load R1,x[R0]
   trap R0,R0,R0
   x data 42
   ```
3. Click "Assemble & Run"
4. If you see errors in console, the connection has issues
5. If it works, you should be able to step through execution

## Common Issues and Solutions

### Issue 1: "Cannot find module" errors

**Problem**: Vite can't resolve `@logic/` imports

**Solution**: Check [vite.config.js](vite.config.js:5-11) has correct path aliases

### Issue 2: "document is not defined"

**Problem**: Some Sigma16 code references browser-only APIs

**Solution**: The code checks `runningBrowser` flag, should work automatically

### Issue 3: "assembler is not a function"

**Problem**: Import path or export doesn't match

**Solution**: Check the import statement matches the export

### Issue 4: Assembly errors

**Problem**: The Sigma16 assembler might have different syntax expectations

**Current State**: We're importing these functions:
```javascript
// From assembler.mjs
import { assembler } from '@logic/assembler.mjs'

// From emulator.mjs
import {
  EmulatorState,
  executeInstruction,
  procReset,
  initializeMachineState
} from '@logic/emulator.mjs'
```

**What the hook does**:
1. Calls `assembler('program', sourceCode)`
2. Gets back an `AsmInfo` object
3. Accesses `.objectCode` property
4. Creates `new EmulatorState()`
5. Calls `procReset(es)`
6. Loads object code into memory
7. Calls `executeInstruction(es)` repeatedly

## Verification Checklist

- [ ] Dev server starts without errors
- [ ] Browser console shows no import errors
- [ ] Can create EmulatorState instance
- [ ] Can call assembler function
- [ ] Assembler returns object with `.objectCode`
- [ ] Can execute instructions
- [ ] State changes are reflected in deltas

## Manual Verification Steps

1. **Check imports work**:
   ```javascript
   // In browser console
   const module = await import('./src/logic/emulator.mjs')
   console.log(module.EmulatorState)
   ```

2. **Check assembler works**:
   ```javascript
   const asm = await import('./src/logic/assembler.mjs')
   const result = asm.assembler('test', 'load R1,x[R0]\nx data 42')
   console.log(result)
   ```

3. **Check execution works**:
   ```javascript
   const em = await import('./src/logic/emulator.mjs')
   const es = new em.EmulatorState()
   em.procReset(es)
   es.mem[0] = 0x1000  // Simple load instruction
   em.executeInstruction(es)
   console.log('PC after execution:', es.pc)
   ```

## Expected Behavior

If everything is connected properly:

1. **Assembly**:
   - Input: Assembly source code string
   - Output: AsmInfo object with `.objectCode` array

2. **Execution**:
   - Input: EmulatorState with program in memory
   - Output: State changes after each instruction

3. **Visualization**:
   - Each step shows what changed
   - Registers/memory highlighting works
   - Can step forward/backward

## Next Steps if Not Connected

If the connection doesn't work, we may need to:

1. **Add initialization code**: Some modules might need setup
2. **Handle GUI dependencies**: Skip GUI-related functions
3. **Fix circular dependencies**: May need to restructure imports
4. **Add polyfills**: For any Node.js-specific code

Run the test and let me know what errors you see!
