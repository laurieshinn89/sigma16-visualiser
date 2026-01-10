import { useState, useCallback, useMemo } from 'react'
import { assembler } from '@logic/assembler.mjs'
import {
  EmulatorState,
  executeInstruction,
  initializeMachineState,
  procReset
} from '@logic/emulator.mjs'
import * as ab from '@logic/arrbuf.mjs'
import * as com from '@logic/common.mjs'
import * as arch from '@logic/architecture.mjs'

const MEMORY_WORDS = 65536

function allocateStateVector(es) {
  es.vecbuf = new ArrayBuffer(ab.StateVecSizeBytes)
  es.vec16 = new Uint16Array(es.vecbuf)
  es.vec32 = new Uint32Array(es.vecbuf)
  es.vec64 = new BigUint64Array(es.vecbuf)
  es.shm = es.vec16
}

function createEmulatorState() {
  const es = new EmulatorState(com.ES_gui_thread)
  allocateStateVector(es)
  initializeMachineState(es)
  procReset(es)
  return es
}

function parseHexWord(value) {
  const cleaned = value.trim().replace(/^0x/i, '')
  if (!cleaned) return null
  const parsed = parseInt(cleaned, 16)
  return Number.isNaN(parsed) ? null : parsed
}

function loadObjectCode(es, objectLines) {
  let address = 0
  let minAddress = null
  let maxAddress = null

  for (const rawLine of objectLines) {
    const line = rawLine.trim()
    if (!line) continue

    const [op, rest = ''] = line.split(/\s+/, 2)
    if (op === 'org') {
      const nextAddr = parseHexWord(rest)
      if (nextAddr !== null) {
        address = nextAddr
        if (minAddress === null || address < minAddress) {
          minAddress = address
        }
        if (maxAddress === null || address > maxAddress) {
          maxAddress = address
        }
      }
      continue
    }

    if (op === 'data') {
      const values = rest.split(',').map((value) => parseHexWord(value)).filter((val) => val !== null)
      for (const value of values) {
        ab.writeMem16(es, address, value)
        if (minAddress === null || address < minAddress) {
          minAddress = address
        }
        if (maxAddress === null || address > maxAddress) {
          maxAddress = address
        }
        address += 1
      }
      continue
    }

    // Ignore module/import/export/relocate lines for single-module execution.
  }

  return {
    startAddress: minAddress ?? 0,
    minAddress,
    maxAddress
  }
}

function captureRegisters(es) {
  const regValues = new Uint16Array(16)
  for (let i = 0; i < 16; i += 1) {
    regValues[i] = es.regfile[i].get()
  }
  return regValues
}

function captureMemory(es) {
  const memValues = new Uint16Array(MEMORY_WORDS)
  memValues.set(es.vec16.subarray(ab.MemOffset16, ab.MemOffset16 + MEMORY_WORDS))
  return memValues
}

function captureFullState(es) {
  const ccWord = es.regfile[15]?.get?.() ?? 0
  const ccC = arch.extractBoolLE(ccWord, arch.bit_ccC)
  const ccV = arch.extractBoolLE(ccWord, arch.bit_ccV)
  const ccG = arch.extractBoolLE(ccWord, arch.bit_ccG)
  const ccE = arch.extractBoolLE(ccWord, arch.bit_ccE)

  return {
    pc: es.pc.get(),
    ir: es.ir.get(),
    reg: captureRegisters(es),
    mem: captureMemory(es),
    ccC,
    ccV,
    ccG,
    ccE,
    statusreg: es.statusreg.get(),
    mask: es.mask.get(),
    req: es.req.get(),
    vect: es.vect.get(),
    halted: ab.readSCB(es, ab.SCB_status) === ab.SCB_halted,
    instrCount: ab.readInstrCount(es)
  }
}

function cloneState(state) {
  return {
    ...state,
    reg: new Uint16Array(state.reg),
    mem: new Uint16Array(state.mem)
  }
}

function computeDelta(es) {
  const changedRegisters = {}
  const changedMemory = {}
  const touchedRegisters = new Set()
  const ccWord = es.regfile[15]?.get?.() ?? 0
  const ccC = arch.extractBoolLE(ccWord, arch.bit_ccC)
  const ccV = arch.extractBoolLE(ccWord, arch.bit_ccV)
  const ccG = arch.extractBoolLE(ccWord, arch.bit_ccG)
  const ccE = arch.extractBoolLE(ccWord, arch.bit_ccE)

  for (const regIndex of es.copyable.regFetched) {
    if (regIndex >= 0 && regIndex < 16) {
      touchedRegisters.add(regIndex)
    }
  }
  for (const regIndex of es.copyable.regStored) {
    if (regIndex >= 0 && regIndex < 16) {
      touchedRegisters.add(regIndex)
      changedRegisters[regIndex] = es.regfile[regIndex].get()
    }
  }

  for (const addr of es.copyable.memStoreLog) {
    changedMemory[addr] = ab.readMem16(es, addr)
  }

  return {
    pc: es.pc.get(),
    ir: es.ir.get(),
    curInstrAddr: ab.readSCB(es, ab.SCB_cur_instr_addr),
    nextInstrAddr: ab.readSCB(es, ab.SCB_next_instr_addr),
    ccC,
    ccV,
    ccG,
    ccE,
    controlRegs: {
      statusreg: es.statusreg.get(),
      mask: es.mask.get(),
      req: es.req.get(),
      vect: es.vect.get()
    },
    halted: ab.readSCB(es, ab.SCB_status) === ab.SCB_halted,
    instrCount: ab.readInstrCount(es),
    changedRegisters,
    changedMemory,
    touchedRegisters: Array.from(touchedRegisters)
  }
}

function applyDelta(state, delta) {
  const next = {
    ...state,
    pc: delta.pc,
    ir: delta.ir,
    ccC: delta.ccC,
    ccV: delta.ccV,
    ccG: delta.ccG,
    ccE: delta.ccE,
    halted: delta.halted,
    instrCount: delta.instrCount
  }

  next.reg = new Uint16Array(state.reg)
  for (const [index, value] of Object.entries(delta.changedRegisters)) {
    next.reg[Number(index)] = value
  }

  next.mem = new Uint16Array(state.mem)
  for (const [address, value] of Object.entries(delta.changedMemory)) {
    next.mem[Number(address)] = value
  }

  next.statusreg = delta.controlRegs.statusreg
  next.mask = delta.controlRegs.mask
  next.req = delta.controlRegs.req
  next.vect = delta.controlRegs.vect

  return next
}

function detectRegistersUsed(sourceCode) {
  const used = new Set()
  const lines = sourceCode.split('\n')
  for (const line of lines) {
    const withoutComment = line.split(';')[0]
    const matches = withoutComment.match(/\bR(1[0-5]|[0-9])\b/gi)
    if (!matches) continue
    for (const match of matches) {
      const index = Number(match.slice(1))
      if (!Number.isNaN(index)) {
        used.add(index)
      }
    }
  }
  return used
}

export function useSigma16Timeline() {
  const [timeline, setTimeline] = useState(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState(null)

  const executeProgram = useCallback((sourceCode, options = {}) => {
    const { maxSteps = 50000 } = options

    try {
      setIsExecuting(true)
      setError(null)

      const asmResult = assembler('program', sourceCode)
      if (asmResult.nAsmErrors && asmResult.nAsmErrors > 0) {
        throw new Error(`Assembly failed with ${asmResult.nAsmErrors} error(s).`)
      }

      const es = createEmulatorState()
      const programInfo = loadObjectCode(es, asmResult.objectCode || [])

      es.pc.put(programInfo.startAddress)
      ab.writeSCB(es, ab.SCB_cur_instr_addr, programInfo.startAddress)
      ab.writeSCB(es, ab.SCB_next_instr_addr, programInfo.startAddress)

      const initialState = captureFullState(es)

      const deltas = []
      let steps = 0

      while (ab.readSCB(es, ab.SCB_status) !== ab.SCB_halted && steps < maxSteps) {
        executeInstruction(es)
        deltas.push(computeDelta(es))
        steps += 1
      }

      setTimeline({
        initialState,
        deltas,
        assembly: asmResult,
        sourceCode,
        totalSteps: deltas.length,
        completed: ab.readSCB(es, ab.SCB_status) === ab.SCB_halted,
        lineMap: asmResult.metadata?.mapArr || [],
        programRegisters: detectRegistersUsed(sourceCode),
        programInfo
      })
      setCurrentStep(0)
    } catch (err) {
      setError(err.message || String(err))
      setTimeline(null)
    } finally {
      setIsExecuting(false)
    }
  }, [])

  const getStateAtStep = useCallback((step) => {
    if (!timeline || step < 0 || step > timeline.totalSteps) {
      return null
    }

    let state = cloneState(timeline.initialState)
    for (let i = 0; i < step; i += 1) {
      state = applyDelta(state, timeline.deltas[i])
    }
    return state
  }, [timeline])

  const currentState = useMemo(() => getStateAtStep(currentStep), [getStateAtStep, currentStep])
  const previousState = useMemo(() => {
    if (currentStep <= 0) return null
    return getStateAtStep(currentStep - 1)
  }, [getStateAtStep, currentStep])

  const currentDelta = useMemo(() => {
    if (!timeline || currentStep === 0) {
      return null
    }
    return timeline.deltas[currentStep - 1]
  }, [timeline, currentStep])

  const currentLineIndex = useMemo(() => {
    if (!timeline) return null
    const lineMap = timeline.lineMap || []
    if (currentStep === 0) {
      return lineMap[timeline.initialState.pc] ?? null
    }
    if (!currentDelta) return null
    return lineMap[currentDelta.curInstrAddr] ?? null
  }, [timeline, currentStep, currentDelta])

  const runtimeRegisterUsage = useMemo(() => {
    if (!timeline) return new Set()
    const used = new Set()
    for (let i = 0; i < currentStep; i += 1) {
      const delta = timeline.deltas[i]
      for (const regIndex of delta.touchedRegisters || []) {
        used.add(regIndex)
      }
    }
    return used
  }, [timeline, currentStep])

  const goToStep = useCallback((step) => {
    if (timeline && step >= 0 && step <= timeline.totalSteps) {
      setCurrentStep(step)
    }
  }, [timeline])

  const nextStep = useCallback(() => {
    if (timeline && currentStep < timeline.totalSteps) {
      setCurrentStep((prev) => prev + 1)
    }
  }, [timeline, currentStep])

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }, [currentStep])

  const reset = useCallback(() => {
    setCurrentStep(0)
  }, [])

  const goToEnd = useCallback(() => {
    if (timeline) {
      setCurrentStep(timeline.totalSteps)
    }
  }, [timeline])

  const clearTimeline = useCallback(() => {
    setTimeline(null)
    setCurrentStep(0)
    setError(null)
  }, [])

  return {
    timeline,
    currentStep,
    currentState,
    previousState,
    currentDelta,
    currentLineIndex,
    runtimeRegisterUsage,
    totalSteps: timeline?.totalSteps || 0,
    isExecuting,
    error,
    executeProgram,
    goToStep,
    nextStep,
    prevStep,
    reset,
    goToEnd,
    clearTimeline,
    canStepForward: timeline && currentStep < timeline.totalSteps,
    canStepBackward: currentStep > 0,
    hasTimeline: timeline !== null,
    isAtStart: currentStep === 0,
    isAtEnd: timeline && currentStep === timeline.totalSteps
  }
}
