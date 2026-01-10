/**
 * Test file to verify Sigma16 logic connection
 * Run this to check if imports work correctly
 */

import { assembler } from '../logic/assembler.mjs'
import { EmulatorState, executeInstruction, procReset, initializeMachineState } from '../logic/emulator.mjs'

export function testBasicConnection() {
  console.log('Testing Sigma16 logic connection...')

  try {
    // Test 1: Simple assembly
    const testCode = `
      load R1,x[R0]
      trap R0,R0,R0
      x data 42
    `

    console.log('Test 1: Assembling code...')
    const asmResult = assembler('test', testCode)
    console.log('Assembly result:', asmResult)
    console.log('Object code:', asmResult.objectCode)
    console.log('Errors:', asmResult.nAsmErrors)

    // Test 2: Emulator initialization
    console.log('\nTest 2: Initializing emulator...')
    const es = new EmulatorState()
    console.log('EmulatorState created:', es)

    procReset(es)
    console.log('After procReset')

    // Test 3: Load and execute
    console.log('\nTest 3: Loading program into memory...')
    if (asmResult.objectCode && asmResult.objectCode.length > 0) {
      for (let i = 0; i < asmResult.objectCode.length; i++) {
        es.mem[i] = asmResult.objectCode[i]
      }
      console.log('Program loaded. First few memory locations:')
      console.log(es.mem.slice(0, 10))

      console.log('\nTest 4: Executing one instruction...')
      console.log('Before execution - PC:', es.pc, 'R1:', es.reg[1])
      executeInstruction(es)
      console.log('After execution - PC:', es.pc, 'R1:', es.reg[1])

      console.log('\n✅ All tests passed! Connection is working.')
      return true
    } else {
      console.error('❌ No object code generated')
      return false
    }

  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error(error.stack)
    return false
  }
}

// Run test automatically when imported
if (typeof window !== 'undefined') {
  console.log('Connection test module loaded. Call testBasicConnection() to run tests.')
}
