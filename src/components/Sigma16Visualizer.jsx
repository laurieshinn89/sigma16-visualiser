import React, { useMemo, useState } from 'react'
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
import './Sigma16Visualizer.css'

function formatValue(value, format) {
  if (format === 'decimal') return wordToDecimal(value).toString()
  if (format === 'binary') return wordToBinary(value)
  return wordToHex(value)
}

export function Sigma16Visualizer() {
  const [sourceCode, setSourceCode] = useState(EXAMPLE_PROGRAM)
  const [displayFormat, setDisplayFormat] = useState('hex')
  const [mode, setMode] = useState('beginner')
  const [showLabelHelp, setShowLabelHelp] = useState(false)

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
    canStepForward,
    canStepBackward,
    hasTimeline,
    timeline
  } = useSigma16Timeline()

  const handleRun = () => {
    executeProgram(sourceCode, { maxSteps: 50000 })
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
    const used = timeline?.programRegisters
    if (!used || used.size === 0) {
      return Array.from({ length: 16 }, (_, i) => i)
    }
    return Array.from(used).sort((a, b) => a - b)
  }, [currentState, mode, timeline])

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

  const labelContext = useMemo(() => {
    const symbolTable = timeline?.assembly?.symbolTable
    if (!symbolTable) return null
    const dataOps = new Set(['data', 'reserve', 'block', 'equ'])
    const labelMeta = new Map()
    const sourceLines = timeline?.assembly?.asmSrcLines || sourceCode.split('\n')

    sourceLines.forEach((line, index) => {
      const withoutComment = line.split(';')[0]
      if (/^\s/.test(withoutComment)) {
        return
      }
      const trimmed = withoutComment.trim()
      if (!trimmed) return
      const match = trimmed.match(/^([A-Za-z][\w]*)\s+(.+)$/)
      if (!match) return
      const label = match[1]
      const rest = match[2].trim()
      if (!rest) return
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

  return (
    <div className="sigma16-visualizer">
      <header className="visualizer-header">
        <div>
          <h1>Sigma16 Visualiser</h1>
          <p>Step through Sigma16 programs with a clear view of memory and registers.</p>
        </div>
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
      </header>

      <div className="visualizer-content">
        <div className="left-panel">
          <section className="editor-section">
            <div className="section-title">
              <h2>Assembly Code</h2>
              <div className="file-input">
                <input type="file" accept=".asm,.s16,.txt" onChange={handleFileLoad} />
              </div>
            </div>
            <textarea
              className="assembly-editor"
              value={sourceCode}
              onChange={(event) => setSourceCode(event.target.value)}
              placeholder="Enter Sigma16 assembly code..."
              rows={20}
              disabled={isExecuting}
            />
          </section>

          <section className="control-panel">
            <h2>Controls</h2>
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

            <div className="format-selector">
              <label>Display Format</label>
              <select value={displayFormat} onChange={(event) => setDisplayFormat(event.target.value)}>
                <option value="hex">Hexadecimal</option>
                <option value="decimal">Decimal</option>
                <option value="binary">Binary</option>
              </select>
            </div>

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

            {error && (
              <div className="error-display">
                <h3>Error</h3>
                <pre>{error}</pre>
              </div>
            )}
          </section>

          <section className="listing-section">
            <h2>Source Listing</h2>
            <div className="listing">
              {listingLines.map((line, index) => {
                const isActive = index === currentLineIndex
                return (
                  <div
                    key={`${index}-${line}`}
                    className={`listing-line ${isActive ? 'active' : ''}`}
                  >
                    <span className="line-number">{String(index + 1).padStart(3, ' ')}</span>
                    <span className="line-text">{line || ' '}</span>
                  </div>
                )
              })}
            </div>
          </section>

        </div>

        <div className="right-panel">
          {currentState ? (
            <>
              <section className="current-instruction">
                <h2>Current Instruction</h2>
                <div className="instruction-display">
                  <div className="instr-field">
                    <span className="label">PC</span>
                    <span className="value">{wordToHex(currentState.pc)}</span>
                  </div>
                  <div className="instr-field">
                    <span className="label">IR</span>
                    <span className="value">{wordToHex(currentState.ir)}</span>
                  </div>
                  {currentDelta && (() => {
                    const decoded = decodeInstruction(currentDelta.ir, {
                      memory: previousState?.mem || currentState.mem,
                      address: currentInstrAddress
                    })
                    return (
                      <div className="instr-decoded">
                        <span className="mnemonic">{decoded.mnemonic}</span>
                        <span className="operands">{decoded.operands}</span>
                      </div>
                    )
                  })()}
                </div>
              </section>

              <section className="registers-section">
                <h2>Registers</h2>
                <div className="registers-grid">
                  {visibleRegisters.map((index) => {
                    const isChanged = currentDelta?.changedRegisters?.[index] !== undefined
                    const isUsed = runtimeRegisterUsage.has(index)
                    const showUnused = mode === 'beginner' && !isUsed
                    return (
                      <div
                        key={index}
                        className={`register ${isChanged ? 'changed' : ''} ${showUnused ? 'unused' : ''}`}
                        title={isChanged ? 'Changed in this step' : ''}
                      >
                        <span className="reg-name">R{index}</span>
                        <span className="reg-value">{formatValue(currentState.reg[index], displayFormat)}</span>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="explanation-section">
                <h2>Step Explanation</h2>
                <p className="instruction-explanation">{explanation}</p>
              </section>

              <section className="condition-codes">
                <h2>Condition Codes</h2>
                <div className="flags">
                  <span className={`flag ${currentState.ccC ? 'active' : ''}`}>C</span>
                  <span className={`flag ${currentState.ccV ? 'active' : ''}`}>V</span>
                  <span className={`flag ${currentState.ccG ? 'active' : ''}`}>G</span>
                  <span className={`flag ${currentState.ccE ? 'active' : ''}`}>E</span>
                </div>
              </section>

              <section className="memory-section">
                <h2>Main Memory</h2>
                <div className="memory-view">
                  {memoryLocations.map((addr) => {
                    const isChanged = currentDelta?.changedMemory?.[addr] !== undefined
                    const isCurrentInstr = currentInstrAddress === addr
                    return (
                      <div
                        key={addr}
                        className={`memory-cell ${isChanged ? 'changed' : ''} ${isCurrentInstr ? 'current-instruction' : ''}`}
                        title={isCurrentInstr ? 'Current instruction address' : (isChanged ? 'Changed in this step' : '')}
                      >
                        <span className="mem-addr">{wordToHex(addr)}</span>
                        <span className="mem-value">{formatValue(currentState.mem[addr], displayFormat)}</span>
                      </div>
                    )
                  })}
                </div>
              </section>

              {currentDelta && (
                <section className="delta-summary">
                  <h2>What Changed This Step</h2>
                  <ul className="changes-list">
                    {getDeltaSummary(currentDelta, {
                      memory: previousState?.mem || currentState.mem,
                      address: currentInstrAddress
                    }).map((change, idx) => (
                      <li key={idx}>{change}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="label-section">
                <div className="section-title">
                  <h2>Label Table</h2>
                  <button
                    type="button"
                    className="help-button"
                    onClick={() => setShowLabelHelp((prev) => !prev)}
                  >
                    Help
                  </button>
                </div>
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
                          <tr key={row.name}>
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
                {showLabelHelp && (
                  <p className="label-help">
                    Types are shown for clarity. Labels only gain meaning based on how you use them
                    in your program.
                  </p>
                )}
              </section>
            </>
          ) : (
            <div className="no-state">
              <p>Assemble and run a program to see the visualisation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const EXAMPLE_PROGRAM = `; Simple addition program
; Add two numbers and store result

    load  R1,x[R0]
    load  R2,y[R0]
    add   R3,R1,R2
    store R3,sum[R0]
    trap  R0,R0,R0

x    data  42
y    data  17
sum  data  0
`

export default Sigma16Visualizer
