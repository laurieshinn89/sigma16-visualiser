import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSigma16Timeline } from '../hooks/useSigma16Timeline'
import {
  wordToHex,
  wordToDecimal,
  wordToBinary,
  getDeltaSummary,
  getExecutionStats,
  decodeInstruction,
  describeInstruction
} from '../utils/formatters'
import * as arch from '@logic/architecture.mjs'
import './Sigma16Visualizer.css'

function formatValue(value, format) {
  if (format === 'decimal') return wordToDecimal(value).toString()
  if (format === 'binary') return wordToBinary(value)
  return wordToHex(value)
}

export function Sigma16Visualizer() {
  const [sourceCode, setSourceCode] = useState(EXAMPLE_PROGRAM)
  const [displayFormat, setDisplayFormat] = useState('hex')
  const [showR15InBeginner, setShowR15InBeginner] = useState(false)
  const [mode, setMode] = useState('beginner')
  const [openHelp, setOpenHelp] = useState({})
  const [showStack, setShowStack] = useState(true)
  const [selectedExample, setSelectedExample] = useState('')
  const [lastInputSnapshot, setLastInputSnapshot] = useState('')
  const [runId, setRunId] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const listingRef = useRef(null)
  const activeLineRef = useRef(null)
  const ioLogRef = useRef(null)

  const {
    currentState,
    previousState,
    currentDelta,
    currentStep,
    totalSteps,
    currentLineIndex,
    runtimeRegisterUsage,
    isExecuting,
    error,
    executeProgram,
    nextStep,
    prevStep,
    reset,
    goToEnd,
    clearTimeline,
    canStepForward,
    canStepBackward,
    hasTimeline,
    timeline
  } = useSigma16Timeline()

  const handleRun = () => {
    const inputEl = document.getElementById('IOinputBuffer')
    setLastInputSnapshot(inputEl?.value ?? '')
    setRunId((prev) => prev + 1)
    executeProgram(sourceCode, { maxSteps: 50000 })
    if (inputEl) {
      inputEl.value = ''
    }
  }

  const handleExampleLoad = () => {
    const example = EXAMPLES.find((item) => item.id === selectedExample)
    if (example) {
      setSourceCode(example.code)
    }
  }

  const toggleHelp = (key) => {
    setOpenHelp((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleFileLoad = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setSourceCode(reader.result || '')
    }
    reader.readAsText(file)
  }

  const stats = getExecutionStats(timeline, currentStep)
  const listingLines = useMemo(() => {
    return timeline?.assembly?.asmSrcLines || sourceCode.split('\n')
  }, [timeline, sourceCode])

  const visibleRegisters = useMemo(() => {
    if (!currentState) return []
    if (mode !== 'beginner') {
      return Array.from({ length: 16 }, (_, i) => i)
    }
    const used = new Set(timeline?.programRegisters || [])
    if (showR15InBeginner) {
      used.add(15)
    }
    if (used.size === 0) {
      return Array.from({ length: 16 }, (_, i) => i)
    }
    return Array.from(used).sort((a, b) => a - b)
  }, [currentState, mode, timeline, showR15InBeginner])

  const memoryLocations = useMemo(() => {
    if (!currentState) return []
    const locations = new Set()
    const programInfo = timeline?.programInfo
    if (programInfo?.minAddress !== null && programInfo?.maxAddress !== null) {
      for (let addr = programInfo.minAddress; addr <= programInfo.maxAddress; addr += 1) {
        locations.add(addr)
      }
    }

    for (let i = 0; i < currentState.mem.length; i += 1) {
      if (currentState.mem[i] !== 0) {
        locations.add(i)
      }
    }

    if (currentDelta) {
      Object.keys(currentDelta.changedMemory).forEach((addr) => {
        locations.add(Number(addr))
      })
    }

    return Array.from(locations).sort((a, b) => a - b).slice(0, 256)
  }, [currentState, currentDelta, timeline])

  const currentInstrAddress = currentDelta
    ? currentDelta.curInstrAddr
    : timeline?.programInfo?.startAddress ?? null
  const stackPointer = currentState?.reg?.[14] ?? null
  const showPointers = mode === 'advanced'
  const pointerValues = useMemo(() => {
    if (!currentState) return null
    return {
      pc: wordToHex(currentState.pc),
      ir: wordToHex(currentState.ir),
      sp: stackPointer !== null ? wordToHex(stackPointer) : '--'
    }
  }, [currentState, stackPointer])

  const stackPointerDelta = useMemo(() => {
    if (!currentState || !previousState) return null
    const prev = previousState.reg?.[14]
    if (prev === undefined || prev === null || stackPointer === null) return null
    const diff = (stackPointer - prev + 0x8000) & 0xffff
    return diff - 0x8000
  }, [currentState, previousState, stackPointer])

  const labelContext = useMemo(() => {
    const symbolTable = timeline?.assembly?.symbolTable
    if (!symbolTable) return null
    const dataOps = new Set(['data', 'reserve', 'block', 'equ'])
    const labelMeta = new Map()
    const sourceLines = timeline?.assembly?.asmSrcLines || sourceCode.split('\n')

    sourceLines.forEach((line, index) => {
      const withoutComment = line.split(';')[0]
      const trimmed = withoutComment.trim()
      if (!trimmed) return
      const hasLeadingWhitespace = /^\s/.test(withoutComment)
      const match = hasLeadingWhitespace
        ? trimmed.match(/^([A-Za-z][\w]*):\s*(.*)$/)
        : trimmed.match(/^([A-Za-z][\w]*):?\s*(.*)$/)
      if (!match) return
      const label = match[1]
      const rest = match[2].trim()
      if (!rest) {
        labelMeta.set(label, { kind: 'code', line: index + 1, op: null })
        return
      }
      const op = rest.split(/\s+/)[0].toLowerCase()
      const kind = dataOps.has(op) ? 'data' : 'code'
      labelMeta.set(label, { kind, line: index + 1, op })
    })

    const addressMap = new Map()
    for (const [name, identifier] of symbolTable.entries()) {
      const address = identifier?.value?.word
      if (typeof address !== 'number') continue
      const meta = labelMeta.get(name)
      const entry = { name, address, kind: meta?.kind || 'unknown' }
      if (!addressMap.has(address)) {
        addressMap.set(address, [])
      }
      addressMap.get(address).push(entry)
    }

    const lookupAddress = (address) => {
      const entries = addressMap.get(address)
      if (!entries || entries.length === 0) return null
      const dataEntry = entries.find((entry) => entry.kind === 'data')
      return dataEntry || entries[0]
    }

    return { lookupAddress, labelMeta }
  }, [timeline, sourceCode])

  const stackEntries = useMemo(() => {
    if (!currentState || stackPointer === null) return []
    const entries = []
    const count = 16
    for (let i = 0; i < count; i += 1) {
      const address = (stackPointer - i) & 0xffff
      const label = labelContext?.lookupAddress?.(address)
      const valueLabel = labelContext?.lookupAddress?.(currentState.mem[address])
      entries.push({
        address,
        value: currentState.mem[address],
        isTop: i === 0,
        label: label?.name || null,
        valueLabel: valueLabel?.kind === 'code' ? valueLabel.name : null
      })
    }
    return entries
  }, [currentState, stackPointer, labelContext])

  const labelRows = useMemo(() => {
    const symbolTable = timeline?.assembly?.symbolTable
    if (!symbolTable) return []
    const meta = labelContext?.labelMeta || new Map()
    const rows = []

    for (const [name, identifier] of symbolTable.entries()) {
      const address = identifier?.value?.word
      const defLine = identifier?.defLine ?? null
      const metaEntry = meta.get(name)
      const op = metaEntry?.op || null
      let kind = metaEntry?.kind || 'unknown'
      if (op === 'equ') {
        kind = 'const'
      }

      let value = null
      if (typeof address === 'number') {
        if (kind === 'data' && currentState?.mem) {
          value = currentState.mem[address]
        } else if (kind === 'const') {
          value = address
        }
      }

      rows.push({
        name,
        kind,
        address: typeof address === 'number' ? address : null,
        line: defLine,
        value
      })
    }

    rows.sort((a, b) => a.name.localeCompare(b.name))
    return rows
  }, [timeline, labelContext, currentState])

  const explanation = useMemo(() => {
    return describeInstruction(currentDelta, currentState, previousState, labelContext || {})
  }, [currentDelta, currentState, previousState, labelContext])

  const currentSourceLine = useMemo(() => {
    if (currentLineIndex == null) return null
    return listingLines[currentLineIndex] || ''
  }, [listingLines, currentLineIndex])

  const labelUsage = useMemo(() => {
    const symbolTable = timeline?.assembly?.symbolTable
    if (!symbolTable || !currentSourceLine) return new Set()
    const codeOnly = currentSourceLine.split(';')[0]
    if (!codeOnly || !codeOnly.trim()) return new Set()

    let rest = codeOnly
    const colonMatch = codeOnly.match(/^\s*([A-Za-z][\w]*)\s*:/)
    if (colonMatch && symbolTable.has(colonMatch[1])) {
      rest = codeOnly.slice(colonMatch[0].length)
    } else {
      const parts = codeOnly.trim().split(/\s+/)
      if (parts.length > 1) {
        const first = parts[0]
        const second = parts[1]
        const firstIsLabel = symbolTable.has(first)
        const secondIsMnemonic = arch.statementSpec?.has?.(second.toLowerCase())
        if (firstIsLabel && secondIsMnemonic) {
          const idx = codeOnly.indexOf(second)
          if (idx >= 0) {
            rest = codeOnly.slice(idx)
          }
        }
      }
    }

    const matches = rest.match(/\b[A-Za-z][\w]*\b/g) || []
    const used = new Set()
    for (const token of matches) {
      if (symbolTable.has(token)) {
        used.add(token)
      }
    }
    return used
  }, [timeline, currentSourceLine])

  const currentInstruction = useMemo(() => {
    if (!currentDelta || !currentState) return null
    return decodeInstruction(currentDelta.ir, {
      memory: previousState?.mem || currentState.mem,
      address: currentInstrAddress,
      sourceLine: currentSourceLine
    })
  }, [currentDelta, currentState, previousState, currentInstrAddress, currentSourceLine])

  const ioLogHtml = currentState?.ioLogBuffer
    ? `<pre>${currentState.ioLogBuffer}</pre>`
    : ''

  useEffect(() => {
    if (mode !== 'beginner') return
    const hasR15 = Boolean(timeline?.programRegisters?.has?.(15))
    setShowR15InBeginner(hasR15)
  }, [mode, timeline])

  useEffect(() => {
    if (!ioLogRef.current) return
    ioLogRef.current.innerHTML = ioLogHtml
  }, [ioLogHtml, runId])

  const cycleSteps = useMemo(() => {
    if (!currentState) return []
    const fetchAddr = currentInstrAddress !== null ? wordToHex(currentInstrAddress) : 'PC'
    const fetchDetail = `Read memory at ${fetchAddr} into IR.`
    const decodeDetail = currentInstruction
      ? `Decode as ${currentInstruction.mnemonic} ${currentInstruction.operands}.`
      : 'Decode IR into opcode and operands.'
    const executeDetail = currentInstruction
      ? `Execute ${currentInstruction.mnemonic} and update registers/memory.`
      : 'Execute instruction and update state.'

    return [
      { key: 'fetch', title: 'Fetch', detail: fetchDetail },
      { key: 'decode', title: 'Decode', detail: decodeDetail },
      { key: 'execute', title: 'Execute', detail: executeDetail }
    ]
  }, [currentState, currentInstruction, currentInstrAddress])

  const dataFlowLines = useMemo(() => {
    if (mode !== 'advanced' || !currentDelta || !currentState || !currentInstruction) return []
    const flows = []
    const prevRegs = previousState?.reg || currentState.reg
    const regName = (idx) => `R${idx}`
    const addrLabel = (addr) => {
      const label = labelContext?.lookupAddress?.(addr)
      if (label?.name) {
        return `${label.name} (${wordToHex(addr)})`
      }
      return wordToHex(addr)
    }

    const { mnemonic, d, a, b, disp } = currentInstruction
    const ea = disp !== null ? ((disp + prevRegs[a]) & 0xffff) : null
    const memRef = ea !== null ? `mem[${addrLabel(ea)}]` : 'mem[addr]'
    const target = ea !== null ? addrLabel(ea) : 'target'

    switch (mnemonic) {
      case 'load':
        flows.push(`${memRef} -> ${regName(d)}`)
        break
      case 'store':
        flows.push(`${regName(d)} -> ${memRef}`)
        break
      case 'lea':
        flows.push(`addr ${target} -> ${regName(d)}`)
        break
      case 'testset':
        flows.push(`${memRef} -> ${regName(d)}`)
        flows.push(`${regName(d)} -> ${memRef}`)
        break
      case 'add':
      case 'sub':
      case 'mul':
      case 'div':
      case 'addc':
      case 'xadd':
      case 'xsub':
      case 'xmul':
      case 'xdiv':
        flows.push(`${regName(a)}, ${regName(b)} -> ALU -> ${regName(d)}`)
        break
      case 'muln':
        flows.push(`${regName(a)}, ${regName(b)} -> ALU -> ${regName(d)}, R15`)
        break
      case 'divn':
        flows.push(`R15:${regName(a)}, ${regName(b)} -> ALU -> ${regName(d)} (quotient)`)
        flows.push(`R15:${regName(a)}, ${regName(b)} -> ALU -> ${regName(a)} (remainder)`)
        break
      case 'cmp':
        flows.push(`${regName(a)}, ${regName(b)} -> compare -> CC (R15)`)
        break
      case 'jump':
      case 'jumpz':
      case 'jumpnz':
      case 'jumpc0':
      case 'jumpc1':
      case 'brz':
      case 'brnz':
      case 'bvc0':
      case 'brc1':
        flows.push(`${target} -> PC`)
        break
      case 'jal':
        flows.push(`PC -> ${regName(d)} (return addr)`)
        flows.push(`${target} -> PC`)
        break
      case 'shiftl':
      case 'shiftr':
        if (currentDelta.fetchedRegisters?.length) {
          flows.push(`${currentDelta.fetchedRegisters.map(regName).join(', ')} -> ${regName(d)}`)
        }
        break
      case 'push':
        flows.push(`${currentDelta.fetchedRegisters?.map(regName).join(', ') || 'reg'} -> stack`)
        break
      case 'pop':
      case 'top':
        flows.push(`stack -> ${currentDelta.storedRegisters?.map(regName).join(', ') || regName(d)}`)
        break
      case 'getctl':
        flows.push('control reg -> register')
        break
      case 'putctl':
        flows.push('register -> control reg')
        break
      default:
        break
    }

    if (Object.keys(currentDelta.changedMemory || {}).length > 0 && !flows.some((line) => line.includes('mem['))) {
      const inputs = currentDelta.fetchedRegisters?.map(regName).join(', ') || 'registers'
      Object.keys(currentDelta.changedMemory).forEach((addr) => {
        const numericAddr = Number(addr)
        flows.push(`${inputs} -> mem[${addrLabel(numericAddr)}]`)
      })
    }

    if (flows.length === 0) {
      const inputs = currentDelta.fetchedRegisters?.map(regName).join(', ')
      const outputs = currentDelta.storedRegisters?.map(regName).join(', ')
      if (inputs && outputs) {
        flows.push(`${inputs} -> ${outputs}`)
      }
    }

    return flows
  }, [mode, currentDelta, currentInstruction, currentState, previousState, labelContext])

  useEffect(() => {
    if (!hasTimeline || currentLineIndex == null) return
    const container = listingRef.current
    const activeLine = activeLineRef.current
    if (!container || !activeLine) return

    const containerRect = container.getBoundingClientRect()
    const activeRect = activeLine.getBoundingClientRect()
    const outOfView = activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom

    if (outOfView) {
      const offset = activeRect.top - containerRect.top
      const target = container.scrollTop + offset - container.clientHeight / 2 + activeRect.height / 2
      container.scrollTo({ top: target, behavior: 'smooth' })
    }
  }, [hasTimeline, currentLineIndex])

  return (
    <div className={`sigma16-visualizer ${displayFormat === 'binary' ? 'format-binary' : ''}`}>
      <header className="visualizer-header">
        <div className="header-title">
          <div className="header-text">
            <h1>Sigma16 Visualiser</h1>
            <p>Step through Sigma16 programs with a clear view of memory and registers.</p>
          </div>
          <div className="header-graphic" aria-hidden="true">
            <div className="graphic-chip">
              <span className="chip-dot dot-a" />
              <span className="chip-dot dot-b" />
              <span className="chip-dot dot-c" />
            </div>
            <div className="graphic-signal">
              <span className="signal-dot s1" />
              <span className="signal-dot s2" />
              <span className="signal-dot s3" />
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="help-link"
            onClick={() => setShowHelp(true)}
          >
            Need help?
          </button>
          <div className="mode-toggle">
            <label htmlFor="mode-select">Mode</label>
            <select
              id="mode-select"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="beginner">Beginner</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>
      </header>

      <div className="visualizer-body">
        <div className="top-row">
          <section className="program-section compact-section">
            <div className="section-title">
              <h2>Program</h2>
              <div className="program-actions">
                <button
                  type="button"
                  className={`help-button ${openHelp.program ? 'active' : ''}`}
                  onClick={() => toggleHelp('program')}
                  aria-label="Explain the Program panel"
                  title="Explain the Program panel"
                >
                  ?
                </button>
                {!hasTimeline ? (
                  <>
                    <div className="example-selector">
                      <select
                        value={selectedExample}
                        onChange={(event) => setSelectedExample(event.target.value)}
                        aria-label="Select an example program"
                      >
                        <option value="">Example programs</option>
                        {EXAMPLES.map((example) => (
                          <option key={example.id} value={example.id}>
                            {example.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="toggle-button"
                        onClick={handleExampleLoad}
                        disabled={!selectedExample}
                      >
                        Load Example
                      </button>
                    </div>
                    <div className="file-input">
                      <input type="file" accept=".asm,.s16,.txt" onChange={handleFileLoad} />
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="toggle-button"
                    onClick={clearTimeline}
                  >
                    Edit Program
                  </button>
                )}
              </div>
            </div>
            {openHelp.program && (
              <p className="pane-help">
                Write or load Sigma16 assembly here. Sigma16 is a small educational CPU with 16-bit
                words, 16 registers (R0-R15), and a simple memory model where every address holds
                one 16-bit value. Programs are sequences of instructions that move data between
                registers and memory using operations like `load`, `store`, `add`, and `jump`.
                Labels give names to instruction lines or `data` values so you can refer to them
                by name instead of raw addresses. Use the example selector to load a sample program.
              </p>
            )}
            {!hasTimeline ? (
              <textarea
                className="assembly-editor"
                value={sourceCode}
                onChange={(event) => setSourceCode(event.target.value)}
                placeholder="Enter Sigma16 assembly code..."
                rows={20}
                disabled={isExecuting}
              />
            ) : (
              <>
                <p className="program-status">Stepping through assembled program.</p>
                <div className="listing listing-locked" ref={listingRef}>
                  {listingLines.map((line, index) => {
                    const isActive = index === currentLineIndex
                    return (
                      <div
                        key={`${index}-${line}`}
                        ref={isActive ? activeLineRef : null}
                        className={`listing-line ${isActive ? 'active' : ''}`}
                      >
                        <span className="line-number">{String(index + 1).padStart(3, ' ')}</span>
                        <span className="line-text">{line || ' '}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </section>

          <section className="control-panel compact-section">
            <div className="section-title">
              <h2>Controls</h2>
              <button
                type="button"
                className={`help-button ${openHelp.controls ? 'active' : ''}`}
                onClick={() => toggleHelp('controls')}
                aria-label="Explain the Controls panel"
                title="Explain the Controls panel"
              >
                ?
              </button>
            </div>
            {openHelp.controls && (
              <p className="pane-help">
                Assemble &amp; Run translates your human-readable assembly into machine code that
                the Sigma16 CPU can execute, then builds a step-by-step timeline so you can follow
                each instruction. Use Step Back/Forward to move, Reset to return to step 0, and End
                to jump to the final step.
              </p>
            )}
            <div className="control-layout">
              <div className="control-buttons">
                <button
                  onClick={handleRun}
                  disabled={isExecuting || !sourceCode}
                  className="btn-primary"
                >
                  {isExecuting ? 'Running...' : 'Assemble & Run'}
                </button>

                <div className="step-controls">
                  <button onClick={reset} disabled={!hasTimeline || currentStep === 0}>
                    Reset
                  </button>
                  <button onClick={prevStep} disabled={!canStepBackward}>
                    Step Back
                  </button>
                  <button onClick={nextStep} disabled={!canStepForward}>
                    Step Forward
                  </button>
                  <button onClick={goToEnd} disabled={!hasTimeline || currentStep === totalSteps}>
                    End
                  </button>
                </div>
              </div>

              <div className="control-stats">
                {stats && (
                  <div className="stats">
                    <h3>Execution Statistics</h3>
                    <div className="stat-item">
                      <span>Step</span>
                      <span>{stats.currentStep} / {stats.totalSteps}</span>
                    </div>
                    <div className="stat-item">
                      <span>Progress</span>
                      <span>{stats.progress}%</span>
                    </div>
                    <div className="stat-item">
                      <span>Status</span>
                      <span>{stats.completed ? 'Halted' : 'Running'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="format-selector">
              <label>
                Display Format
                <button
                  type="button"
                  className={`help-button ${openHelp.displayFormat ? 'active' : ''}`}
                  onClick={() => toggleHelp('displayFormat')}
                  aria-label="Explain the display format option"
                  title="Explain the display format option"
                >
                  ?
                </button>
              </label>
              <select value={displayFormat} onChange={(event) => setDisplayFormat(event.target.value)}>
                <option value="hex">Hexadecimal</option>
                <option value="decimal">Decimal</option>
                <option value="binary">Binary</option>
              </select>
            </div>
            {openHelp.displayFormat && (
              <p className="pane-help">
                Choose how numbers are shown. Hexadecimal is compact (base 16), decimal is the
                usual base 10, and binary shows all 16 bits so you can see individual ones and
                zeros. Computers store everything as binary bits, so viewing binary helps you see
                the raw representation the CPU actually uses.
              </p>
            )}

            {error && (
              <div className="error-display">
                <h3>Error</h3>
                <pre>{error}</pre>
              </div>
            )}
          </section>
        </div>

        <div className="visualizer-content">
          <div className="left-panel">
            {!currentState ? (
              <div className="no-state">
                <p>Assemble and run a program to see the visualisation.</p>
              </div>
            ) : (
              <>
                <section className="explanation-section">
                  <h2>Step Explanation</h2>
                  <p className="instruction-explanation">{explanation}</p>
                </section>

                {currentDelta && (
                  <section className="delta-summary">
                    <h2>What Changed This Step</h2>
                    <ul className="changes-list">
                      {getDeltaSummary(currentDelta, {
                        memory: previousState?.mem || currentState.mem,
                        address: currentInstrAddress,
                        lookupAddress: labelContext?.lookupAddress,
                        mode,
                        sourceLine: currentSourceLine
                      }).map((change, idx) => (
                        <li key={idx}>{change}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {mode === 'advanced' && (
                  <section className="current-instruction">
                    <div className="section-title">
                      <h2>Current Instruction</h2>
                      <button
                        type="button"
                        className={`help-button ${openHelp.instruction ? 'active' : ''}`}
                        onClick={() => toggleHelp('instruction')}
                        aria-label="Explain the current instruction panel"
                        title="Explain the current instruction panel"
                      >
                        ?
                      </button>
                    </div>
                    {openHelp.instruction && (
                      <p className="pane-help">
                        PC (program counter) holds the memory address of the instruction being
                        executed. IR (instruction register) holds the fetched instruction word. The
                        decoded line is the human-readable version: the instruction name (like
                        `load` or `add`) plus the registers or memory addresses it uses. Typical
                        formats look like "operation destination, source1, source2" or "operation
                        destination, offset[base]".
                      </p>
                    )}
                    <div className="instruction-display">
                      <div className="instr-field">
                        <span className="label">PC</span>
                        <span className="value">{wordToHex(currentState.pc)}</span>
                      </div>
                      <div className="instr-field">
                        <span className="label">IR</span>
                        <span className="value">{wordToHex(currentState.ir)}</span>
                      </div>
                      {currentInstruction && (
                        <div className="instr-decoded">
                          <span className="mnemonic">{currentInstruction.mnemonic}</span>
                          <span className="operands">{currentInstruction.operands}</span>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {mode === 'advanced' && (
                  <section className="condition-codes">
                    <div className="section-title">
                      <h2>Condition Codes</h2>
                      <button
                        type="button"
                        className={`help-button ${openHelp.conditionCodes ? 'active' : ''}`}
                        onClick={() => toggleHelp('conditionCodes')}
                        aria-label="Explain the condition codes panel"
                        title="Explain the condition codes panel"
                      >
                        ?
                      </button>
                    </div>
                    {openHelp.conditionCodes && (
                      <p className="pane-help">
                        C, V, G, and E flags come from the condition-code register (R15). They are
                        updated by arithmetic and compare instructions.
                      </p>
                    )}
                    <div className="flags">
                      <span className={`flag ${currentState.ccC ? 'active' : ''}`}>C</span>
                      <span className={`flag ${currentState.ccV ? 'active' : ''}`}>V</span>
                      <span className={`flag ${currentState.ccg ? 'active' : ''}`}>&gt;</span>
                      <span className={`flag ${currentState.ccl ? 'active' : ''}`}>&lt;</span>
                      <span className={`flag ${currentState.ccG ? 'active' : ''}`}>G</span>
                      <span className={`flag ${currentState.ccE ? 'active' : ''}`}>E</span>
                      <span className={`flag ${currentState.ccL ? 'active' : ''}`}>L</span>
                    </div>
                    <div className="flag-legend">
                      <span><strong>C</strong> carry out from arithmetic</span>
                      <span><strong>V</strong> overflow from arithmetic</span>
                      <span><strong>&gt;</strong> greater-than (signed)</span>
                      <span><strong>&lt;</strong> less-than (signed)</span>
                      <span><strong>G</strong> greater-than (unsigned)</span>
                      <span><strong>L</strong> less-than (unsigned)</span>
                      <span><strong>E</strong> equal</span>
                    </div>
                    {currentInstruction?.mnemonic === 'cmp' && (
                      <p className="flag-note">
                        <strong>cmp</strong> compares two registers (like a subtraction without
                        storing the result). It updates the comparison flags (&gt;/&lt; and G/L,
                        plus E when equal). If the left value is greater than the right, &gt; (signed)
                        and G (unsigned) turn on; if it is smaller, &lt; (signed) and L (unsigned)
                        turn on. Carry/overflow flags are not changed by <strong>cmp</strong>.
                      </p>
                    )}
                  </section>
                )}

                {mode === 'advanced' && cycleSteps.length > 0 && (
                  <section className="cycle-panel">
                    <div className="section-title">
                      <h2>Fetch / Decode / Execute</h2>
                      <button
                        type="button"
                        className={`help-button ${openHelp.cycle ? 'active' : ''}`}
                        onClick={() => toggleHelp('cycle')}
                        aria-label="Explain the fetch/decode/execute panel"
                        title="Explain the fetch/decode/execute panel"
                      >
                        ?
                      </button>
                    </div>
                    {openHelp.cycle && (
                      <p className="pane-help">
                        Most CPUs run each instruction in three big stages. <strong>Fetch</strong> reads
                        the instruction from memory using the PC. <strong>Decode</strong> figures out
                        what the instruction means and which registers or memory addresses it will
                        use. <strong>Execute</strong> performs the work (often in the ALU) and writes
                        results back to registers or memory.
                      </p>
                    )}
                    <div className="cycle-steps">
                      {cycleSteps.map((step) => (
                        <div key={step.key} className={`cycle-step ${step.key}`}>
                          <span className="cycle-title">{step.title}</span>
                          <span className="cycle-detail">{step.detail}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="memory-section ram-panel">
                  <div className="section-title">
                    <h2>Main Memory (RAM) <span className="section-badge ram">RAM</span></h2>
                    <button
                      type="button"
                      className={`help-button ${openHelp.memory ? 'active' : ''}`}
                      onClick={() => toggleHelp('memory')}
                      aria-label="Explain the memory panel"
                      title="Explain the memory panel"
                    >
                      ?
                    </button>
                  </div>
                  {openHelp.memory && (
                    <p className="pane-help">
                      Memory words in use. RAM is separate from the CPU and holds both instructions
                      and data. In advanced mode, highlights and pointer callouts show the current
                      instruction address (PC/IR) and the stack pointer (SP).
                    </p>
                  )}
                  {mode === 'beginner' && (
                    <p className="panel-subtitle">
                      RAM is larger, slower storage outside the CPU.
                    </p>
                  )}
                  {!currentState ? (
                    <p className="empty-state">Run a program to see memory.</p>
                  ) : (
                    <>
                      {mode === 'advanced' && pointerValues && (
                        <div className="pointer-callouts">
                          <span>PC -&gt; {pointerValues.pc}</span>
                          <span>IR -&gt; {pointerValues.ir}</span>
                          <span>SP -&gt; {pointerValues.sp}</span>
                        </div>
                      )}
                      <div className="memory-view">
                        {memoryLocations.map((addr) => {
                          const isChanged = currentDelta?.changedMemory?.[addr] !== undefined
                          const isCurrentInstr = showPointers && currentInstrAddress === addr
                          const isStackPointer = showPointers && stackPointer === addr
                          return (
                            <div
                              key={addr}
                              className={`memory-cell ${isChanged ? 'changed' : ''} ${isCurrentInstr ? 'current-instruction' : ''} ${isStackPointer ? 'stack-pointer' : ''}`}
                              title={isCurrentInstr ? 'Current instruction address' : (isStackPointer ? 'Stack pointer' : (isChanged ? 'Changed in this step' : ''))}
                            >
                              <span className="mem-addr">{wordToHex(addr)}</span>
                              <span className="mem-value">{formatValue(currentState.mem[addr], displayFormat)}</span>
                              {showPointers && (isCurrentInstr || isStackPointer) && (
                                <span className="mem-tags">
                                  {isCurrentInstr && <span className="mem-tag">PC/IR</span>}
                                  {isStackPointer && <span className="mem-tag">SP</span>}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </section>

              </>
            )}
          </div>

          <div className="middle-panel">
            {!currentState ? (
              <div className="no-state">
                <p>Run a program to see registers and labels.</p>
              </div>
            ) : (
              <>
                <section className="registers-section cpu-panel">
                  <div className="section-title">
                    <h2>CPU Registers <span className="section-badge cpu">CPU</span></h2>
                    <button
                      type="button"
                      className={`help-button ${openHelp.registers ? 'active' : ''}`}
                      onClick={() => toggleHelp('registers')}
                      aria-label="Explain the registers panel"
                      title="Explain the registers panel"
                    >
                      ?
                    </button>
                  </div>
                  {openHelp.registers && (
                    <p className="pane-help">
                      Register values at the current step. Registers live inside the CPU and store
                      small, fast-changing values while your program runs. Beginner mode dims
                      unused registers until they are touched.
                    </p>
                  )}
                  {mode === 'beginner' && (
                    <>
                      <p className="panel-subtitle">
                        CPU registers are small, fast storage inside the processor.
                      </p>
                      <label className="register-toggle">
                        <input
                          type="checkbox"
                          checked={showR15InBeginner}
                          onChange={(event) => setShowR15InBeginner(event.target.checked)}
                        />
                        Show R15 (condition codes)
                      </label>
                    </>
                  )}
                  <div className="registers-grid">
                    {visibleRegisters.map((index) => {
                      const isChanged = currentDelta?.changedRegisters?.[index] !== undefined
                      const isOutput = currentDelta?.storedRegisters?.includes(index)
                      const isInput = currentDelta?.fetchedRegisters?.includes(index)
                      const isUsed = runtimeRegisterUsage.has(index)
                      const showUnused = mode === 'beginner' && !isUsed
                      const specialLabel = mode === 'advanced'
                        ? (index === 14 ? 'stack ptr' : (index === 15 ? 'compare' : null))
                        : null
                      const specialClass = mode === 'advanced'
                        ? (index === 14 ? 'special-sp' : (index === 15 ? 'special-cc' : ''))
                        : ''
                      return (
                        <div
                          key={index}
                          className={`register ${specialClass} ${isChanged ? 'changed' : ''} ${isInput ? 'input' : ''} ${isOutput ? 'output' : ''} ${showUnused ? 'unused' : ''}`}
                          title={isChanged ? 'Changed in this step' : ''}
                        >
                          <span className="reg-name">R{index}</span>
                          <span className="reg-value">{formatValue(currentState.reg[index], displayFormat)}</span>
                          {specialLabel && <span className="reg-label">{specialLabel}</span>}
                          {(isInput || isOutput) && (
                            <span className="reg-badges">
                              {isInput && <span className="reg-badge input">in</span>}
                              {isOutput && <span className="reg-badge output">out</span>}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>

                <section className="label-section">
                  <div className="section-title">
                    <h2>Label Table</h2>
                    <button
                      type="button"
                      className={`help-button ${openHelp.labels ? 'active' : ''}`}
                      onClick={() => toggleHelp('labels')}
                      aria-label="Explain the label table"
                      title="Explain the label table"
                    >
                      ?
                    </button>
                  </div>
                  {openHelp.labels && (
                    <p className="pane-help">
                      A list of the names you gave to things in your program (labels). You can see
                      whether each label points to code or data, where it lives in memory, the line
                      it was defined on, and its current value if it is data. When you use a label
                      in an instruction, the assembler replaces it with the memory address of that
                      label. If a label names an instruction, it points to code; if it names a
                      `data` line, it points to a memory value. The label itself does not enforce
                      meaning; how you use it in your code does.
                    </p>
                  )}
                  {labelRows.length > 0 ? (
                    <div className="label-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Label</th>
                            <th>Kind</th>
                            <th>Address</th>
                            <th>Line</th>
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {labelRows.map((row) => (
                            <tr
                              key={row.name}
                              className={labelUsage.has(row.name) ? 'highlight' : ''}
                            >
                              <td>{row.name}</td>
                              <td>{row.kind}</td>
                              <td>{row.address !== null ? wordToHex(row.address) : '-'}</td>
                              <td>{row.line ?? '-'}</td>
                              <td>{row.value !== null ? formatValue(row.value, displayFormat) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="empty-state">Run a program to see the label table.</p>
                  )}
                </section>
              </>
            )}
          </div>

          <div className="right-panel">
            <section className="io-section">
              <div className="section-title">
                <h2>I/O Console</h2>
                <button
                  type="button"
                  className={`help-button ${openHelp.io ? 'active' : ''}`}
                  onClick={() => toggleHelp('io')}
                  aria-label="Explain the I/O console"
                  title="Explain the I/O console"
                >
                  ?
                </button>
              </div>
              {openHelp.io && (
                <p className="pane-help">
                  Sigma16 uses trap codes for basic I/O. Trap code 1 reads characters from the
                  input buffer into memory (R[a] = address, R[b] = length). Trap code 2 writes
                  characters from memory to the output log. Each character is stored as its ASCII
                  code in memory. Reads are highlighted in green in the log.
                </p>
              )}
              <div className="io-console">
                <div
                  id="IOlog"
                  className="io-log"
                  aria-live="polite"
                  ref={ioLogRef}
                />
                <div className="io-last-input">
                  <div className="io-last-title">Last run input</div>
                  <div className="io-last-content">
                    {lastInputSnapshot ? (
                      <pre>{lastInputSnapshot}</pre>
                    ) : (
                      <span className="io-last-empty">No input captured yet.</span>
                    )}
                  </div>
                </div>
                <div className="io-input">
                  <label htmlFor="IOinputBuffer">Input buffer</label>
                  <p className="io-note">
                    Note: type input here before clicking Assemble &amp; Run. The program reads
                    whatever is in this buffer at run time.
                  </p>
                  <textarea
                    id="IOinputBuffer"
                    rows={3}
                    placeholder="Type input text for trap reads..."
                  />
                </div>
              </div>
            </section>

            {mode === 'advanced' && currentState && (
              <section className="data-flow-placeholder">
                <div className="section-title">
                  <h2>Data Flow</h2>
                  <button
                    type="button"
                    className={`help-button ${openHelp.dataFlow ? 'active' : ''}`}
                    onClick={() => toggleHelp('dataFlow')}
                    aria-label="Explain the data flow panel"
                    title="Explain the data flow panel"
                  >
                    ?
                  </button>
                </div>
                {openHelp.dataFlow && (
                  <p className="pane-help">
                    Visualizes how values move between registers, memory, and the stack for the
                    current instruction. The ALU (Arithmetic Logic Unit) is the part of the CPU
                    that performs operations like add, subtract, compare, and bitwise logic; the
                    flow lines show how values enter the ALU and where the results go.
                  </p>
                )}
                {dataFlowLines.length > 0 ? (
                  <ul className="data-flow-list">
                    {dataFlowLines.map((line, idx) => (
                      <li key={`${line}-${idx}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">Step to see data flow arrows.</p>
                )}
              </section>
            )}

            {mode === 'advanced' && currentState && (
              <section className="stack-section">
                <div className="section-title">
                  <h2>Stack</h2>
                  <div className="stack-actions">
                    <button
                      type="button"
                      className={`help-button ${openHelp.stack ? 'active' : ''}`}
                      onClick={() => toggleHelp('stack')}
                      aria-label="Explain the stack panel"
                      title="Explain the stack panel"
                    >
                      ?
                    </button>
                    <span className="stack-meta">SP (R14): {stackPointer !== null ? wordToHex(stackPointer) : '--'}</span>
                    {stackPointerDelta !== null && stackPointerDelta !== 0 && (
                      <span className={`stack-delta ${stackPointerDelta > 0 ? 'up' : 'down'}`}>
                        SP delta {stackPointerDelta > 0 ? `+${stackPointerDelta}` : stackPointerDelta}
                      </span>
                    )}
                    <button
                      type="button"
                      className="toggle-button"
                      onClick={() => setShowStack((prev) => !prev)}
                    >
                      {showStack ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                {openHelp.stack && (
                  <p className="pane-help">
                    View of memory around the stack pointer (R14). The top marker shows the
                    current SP, and the stack grows downward. Named data labels appear on stack
                    addresses when they match a label, and code labels appear when a value looks
                    like a code address.
                  </p>
                )}
                {showStack ? (
                  <>
                    <p className="stack-note">Stack grows downward (toward lower addresses).</p>
                    <div className="stack-list">
                      {stackEntries.map((entry) => (
                        <div
                          key={entry.address}
                          className={`stack-row ${entry.isTop ? 'top' : ''} ${currentDelta?.changedMemory?.[entry.address] !== undefined ? 'changed' : ''}`}
                        >
                          <div className="stack-addr-group">
                            <span className="stack-addr">
                              {entry.label ? entry.label : wordToHex(entry.address)}
                            </span>
                            {entry.label && (
                              <span className="stack-addr-sub">{wordToHex(entry.address)}</span>
                            )}
                          </div>
                          <div className="stack-value-group">
                            <span className="stack-value">{formatValue(entry.value, displayFormat)}</span>
                            {entry.valueLabel && (
                              <span className="stack-value-label">code: {entry.valueLabel}</span>
                            )}
                          </div>
                          {entry.isTop && <span className="stack-label">TOP</span>}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="stack-collapsed">Stack view hidden.</p>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      {showHelp && (
        <div className="glossary-overlay" role="dialog" aria-modal="true" aria-label="Help">
          <div className="glossary-card">
            <div className="glossary-header">
              <h3>Help</h3>
              <button
                type="button"
                className="toggle-button"
                onClick={() => setShowHelp(false)}
              >
                Close
              </button>
            </div>
            <div className="help-section">
              <h4>How to Use</h4>
              <ol className="howto-steps">
                <li>Write or load a Sigma16 program (or pick an example).</li>
                <li>Click Assemble &amp; Run to build the execution timeline.</li>
                <li>Step through and read the panels to see what changes.</li>
              </ol>
            </div>
            <div className="help-section">
              <h4>Glossary</h4>
              <dl className="glossary-list">
                <div>
                  <dt>PC (Program Counter)</dt>
                  <dd>The memory address of the next instruction to run.</dd>
                </div>
                <div>
                  <dt>IR (Instruction Register)</dt>
                  <dd>The current instruction word that was fetched from memory.</dd>
                </div>
                <div>
                  <dt>ALU</dt>
                  <dd>The CPU unit that performs arithmetic and logic operations.</dd>
                </div>
                <div>
                  <dt>Register</dt>
                  <dd>Small, fast storage inside the CPU (R0-R15).</dd>
                </div>
                <div>
                  <dt>RAM (Main Memory)</dt>
                  <dd>Where both instructions and data live during execution.</dd>
                </div>
                <div>
                  <dt>Stack</dt>
                  <dd>A region of memory used for temporary values and call returns.</dd>
                </div>
                <div>
                  <dt>Instruction</dt>
                  <dd>A single operation like load, add, or jump.</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const EXAMPLE_PROGRAM = `; Add: A minimal program that adds two integer variables.

    load   R1,x[R0]   ; R1 := x
    load   R2,y[R0]   ; R2 := y
    add    R3,R1,R2   ; R3 := x + y
    store  R3,z[R0]   ; z := x + y
    trap   R0,R0,R0   ; terminate

x     data  23
y     data  14
z     data   0
`

const EXAMPLES = [
  {
    id: 'add-two',
    name: 'Add two numbers',
    code: EXAMPLE_PROGRAM
  },
  {
    id: 'const-arith',
    name: 'Constants + multiply (lea, mul)',
    code: `; ConstArith: illustrate lea and arithmetic instructions.

    lea   R1,6[R0]    ; R1 := 6
    lea   R2,2[R0]    ; R2 := 2
    lea   R3,4[R0]    ; R3 := 4
    mul   R2,R2,R3    ; R2 := R2*R3 = 8
    add   R10,R1,R2   ; R10 := R1+R2 = 14
    trap  R0,R0,R0    ; halt
`
  },
  {
    id: 'sum-loop',
    name: 'Sum 1..N (loop)',
    code: `; Sum numbers from 1 to N

    load  R1,n[R0]
    load  R2,sum[R0]
    load  R3,one[R0]
loop add  R2,R2,R1
    sub  R1,R1,R3
    jumpnz R1,loop[R0]
    store R2,sum[R0]
    trap  R0,R0,R0

n    data  5
one  data  1
sum  data  0
`
  },
  {
    id: 'cond-jump',
    name: 'Conditional jump (cmp + jumplt)',
    code: `; ConditionalJump: compare + conditional jump

    lea     R1,5[R0]   ; R1 := 5
    lea     R2,23[R0]  ; R2 := 23
    cmp     R1,R2      ; compare R1 with R2
    jumplt  yes[R0]    ; if R1 < R2 then goto yes
no  add     R0,R0,R0   ; executes if we did NOT jump
    jump    done[R0]   ; go to end of program
yes add     R0,R0,R0   ; executes if we DID jump
done trap   R0,R0,R0   ; halt
`
  },
  {
    id: 'pointer',
    name: 'Pointer example (lea + indirect)',
    code: `; Pointer: illustrate pointers and indirect load/store

    lea    R1,5[R0]     ; R1 := 5

    load   R2,x[R0]     ; R2 := x
    add    R2,R2,R1     ; R2 := x + 5
    store  R2,x[R0]     ; x := x + 5

    lea    R3,x[R0]     ; R3 := &x
    load   R4,0[R3]     ; R4 := *R3
    add    R4,R4,R1     ; R4 := *R3 + 5
    store  R4,0[R3]     ; *R3 := *R3 + 5

    lea    R3,y[R0]     ; R3 := &y
    load   R4,0[R3]     ; R4 := *R3
    add    R4,R4,R1     ; R4 := *R3 + 5
    store  R4,0[R3]     ; *R3 := *R3 + 5

    trap   R0,R0,R0     ; halt

x    data   2
y    data   9
`
  },
  {
    id: 'function-call',
    name: 'Subroutine call (JAL)',
    code: `; Jal: illustrate simple subroutine call and return

    lea   R1,3[R0]        ; R1 := 3
    jal   R14,subr[R0]    ; call subr  expect 6
    jal   R14,subr[R0]    ; call subr  expect 12
    store R1,result[R0]   ; result := return value, expect 12
    trap  R0,R0,R0        ; terminate

subr add  R1,R1,R1        ; subr doubles its arg in R1
     jump 0[R14]          ; return

result data 0
`
  },
  {
    id: 'division',
    name: 'Division (quotient + remainder)',
    code: `; Div: quotient in dest, remainder in R15

    load   R1,x[R0]
    load   R2,y[R0]
    div    R3,R1,R2    ; R3 = quotient, R15 = remainder
    trap   R0,R0,R0

x    data  19
y    data   4
`
  },
  {
    id: 'shift-demo',
    name: 'Shift left/right',
    code: `; Shift a value left and right

    load  R1,value[R0]
    shiftl R2,R1,1
    shiftr R3,R1,1
    store R2,left[R0]
    store R3,right[R0]
    trap  R0,R0,R0

value data  8
left  data  0
right data  0
`
  },
  {
    id: 'addc-carry',
    name: 'Add with carry',
    code: `; Demonstrate add with carry

    load  R1,hi[R0]
    load  R2,lo[R0]
    add   R3,R1,R2
    addc  R4,R1,R2
    store R3,sum[R0]
    store R4,sumc[R0]
    trap  R0,R0,R0

hi    data  65535
lo    data  1
sum   data  0
sumc  data  0
`
  },
  {
    id: 'testset',
    name: 'Test and set (lock)',
    code: `; Test-and-set example

    testset R1,lock[R0]
    store  R1,old[R0]
    trap   R0,R0,R0

lock data 0
old  data 0
`
  }
]

export default Sigma16Visualizer
