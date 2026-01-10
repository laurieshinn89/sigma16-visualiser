import * as arch from '@logic/architecture.mjs'

/**
 * Utility functions for formatting Sigma16 data for display
 */

/**
 * Convert a 16-bit word to hexadecimal string
 * @param {number} word - 16-bit value
 * @returns {string} Hex string (e.g., "01a3")
 */
export function wordToHex(word) {
  return (word & 0xffff).toString(16).padStart(4, '0')
}

/**
 * Convert a 16-bit word to binary string
 * @param {number} word - 16-bit value
 * @returns {string} Binary string (e.g., "0000000110100011")
 */
export function wordToBinary(word) {
  return (word & 0xffff).toString(2).padStart(16, '0')
}

/**
 * Convert a 16-bit word to signed decimal
 * @param {number} word - 16-bit value
 * @returns {number} Signed decimal value
 */
export function wordToDecimal(word) {
  const unsigned = word & 0xffff
  // Convert to signed using two's complement
  return unsigned > 32767 ? unsigned - 65536 : unsigned
}

/**
 * Format a register value for display
 * @param {number} index - Register index (0-15)
 * @param {number} value - Register value
 * @param {string} format - Display format: 'hex', 'decimal', 'binary'
 * @returns {string} Formatted string
 */
export function formatRegister(index, value, format = 'hex') {
  const regName = `R${index}`
  let valueStr

  switch (format) {
    case 'decimal':
      valueStr = wordToDecimal(value).toString().padStart(6, ' ')
      break
    case 'binary':
      valueStr = wordToBinary(value)
      break
    case 'hex':
    default:
      valueStr = wordToHex(value)
      break
  }

  return `${regName}: ${valueStr}`
}

/**
 * Format a memory location for display
 * @param {number} address - Memory address
 * @param {number} value - Memory value
 * @param {string} format - Display format: 'hex', 'decimal', 'binary'
 * @returns {string} Formatted string
 */
export function formatMemory(address, value, format = 'hex') {
  const addrStr = wordToHex(address)
  let valueStr

  switch (format) {
    case 'decimal':
      valueStr = wordToDecimal(value).toString().padStart(6, ' ')
      break
    case 'binary':
      valueStr = wordToBinary(value)
      break
    case 'hex':
    default:
      valueStr = wordToHex(value)
      break
  }

  return `[${addrStr}]: ${valueStr}`
}

/**
 * Format condition codes for display
 * @param {Object} state - Emulator state with condition codes
 * @returns {string} Formatted condition codes
 */
export function formatConditionCodes(state) {
  const flags = []
  if (state.ccC) flags.push('C')
  if (state.ccV) flags.push('V')
  if (state.ccG) flags.push('G')
  if (state.ccE) flags.push('E')
  return flags.length > 0 ? flags.join(' ') : 'none'
}

function parseSourceInstruction(line) {
  if (!line) return null
  const [code] = line.split(';')
  if (!code) return null
  const trimmed = code.trim()
  if (!trimmed) return null

  let rest = trimmed
  const colonMatch = trimmed.match(/^([A-Za-z][\w]*):\s*(.*)$/)
  if (colonMatch) {
    rest = colonMatch[2].trim()
  } else {
    const parts = trimmed.split(/\s+/)
    if (parts.length > 1) {
      const first = parts[0].toLowerCase()
      const second = parts[1].toLowerCase()
      const firstIsMnemonic = arch.statementSpec?.has?.(first)
      const secondIsMnemonic = arch.statementSpec?.has?.(second)
      if (!firstIsMnemonic && secondIsMnemonic) {
        rest = trimmed.replace(/^[A-Za-z][\w]*\s+/, '')
      }
    }
  }

  if (!rest) return null
  const [mnemonic, ...operandParts] = rest.split(/\s+/)
  if (!mnemonic) return null
  return {
    mnemonic: mnemonic.toLowerCase(),
    operandsText: operandParts.join(' ').trim()
  }
}

/**
 * Get register name
 * @param {number} index - Register index (0-15)
 * @returns {string} Register name (e.g., "R0", "R15")
 */
export function getRegisterName(index) {
  return `R${index}`
}

/**
 * Decode instruction to human-readable format
 * This is a simplified version - you may want to integrate with architecture.mjs
 *
 * @param {number} ir - Instruction register value
 * @returns {Object} Decoded instruction info
 */
export function decodeInstruction(ir, options = {}) {
  const op = (ir >> 12) & 0xf
  const d = (ir >> 8) & 0xf
  const a = (ir >> 4) & 0xf
  const b = ir & 0xf
  const memory = options.memory || null
  const address = options.address ?? null
  const disp = memory && address !== null ? memory[(address + 1) & 0xffff] : null

  let format = 'RRR'
  let mnemonic = arch.mnemonicRRR[op] || 'unknown'
  let operands = `R${d},R${a},R${b}`

  if (op === 15) {
    format = 'RX'
    const rxOp = b
    mnemonic = arch.mnemonicRX[rxOp] || 'unknown'
    const dispStr = disp !== null ? wordToHex(disp) : 'disp'
    operands = `R${d},${dispStr}[R${a}]`
  } else if (op === 14) {
    format = 'EXP'
    const expCode = (a << 4) | b
    mnemonic = arch.mnemonicEXP[expCode] || 'exp'
    const extraStr = disp !== null ? wordToHex(disp) : 'word'
    operands = `R${d},R${a},R${b},${extraStr}`
  } else if (op === 13) {
    format = 'EXP3'
    const expCode = (a << 4) | b
    mnemonic = arch.mnemonicEXP[expCode] || 'exp3'
    operands = `R${d},R${a},R${b}`
  }

  const machineMnemonic = mnemonic
  const machineOperands = operands
  let sourceMnemonic = null
  let sourceOperands = null

  if (options.sourceLine) {
    const parsed = parseSourceInstruction(options.sourceLine)
    if (parsed) {
      sourceMnemonic = parsed.mnemonic
      sourceOperands = parsed.operandsText
      mnemonic = sourceMnemonic
      operands = sourceOperands
    }
  }

  return {
    op,
    mnemonic,
    format,
    operands,
    d,
    a,
    b,
    disp,
    machineMnemonic,
    machineOperands,
    sourceMnemonic,
    sourceOperands,
    hex: wordToHex(ir)
  }
}

const CC_BIT_NAMES = new Map([
  [arch.bit_ccC, 'C'],
  [arch.bit_ccV, 'V'],
  [arch.bit_ccv, 'v'],
  [arch.bit_ccl, '<'],
  [arch.bit_ccL, 'L'],
  [arch.bit_ccE, 'E'],
  [arch.bit_ccG, 'G'],
  [arch.bit_ccg, '>'],
  [arch.bit_ccS, 'S'],
  [arch.bit_ccs, 's'],
  [arch.bit_ccf, 'f']
])

function formatValueWithDecimal(value) {
  return `0x${wordToHex(value)} (${wordToDecimal(value)})`
}

export function describeInstruction(delta, currentState, previousState, context = {}) {
  if (!delta || !currentState) {
    return 'Program loaded. Step forward to begin execution.'
  }

  const memory = previousState?.mem || currentState.mem
  const address = delta.curInstrAddr ?? null
  const decoded = decodeInstruction(delta.ir, { memory, address })
  const { mnemonic, format, d, a, b, disp } = decoded
  const prevRegs = previousState?.reg || currentState.reg
  const currRegs = currentState.reg
  const lookupAddress = context.lookupAddress
  const labelInfo = disp !== null ? lookupAddress?.((disp + prevRegs[a]) & 0xffff) : null

  const regName = (idx) => `R${idx}`
  const ea = disp !== null ? ((disp + prevRegs[a]) & 0xffff) : null
  const eaText = ea !== null ? wordToHex(ea) : 'effective address'
  const targetName = labelInfo?.name
  const targetKind = labelInfo?.kind
  const targetLabel = targetName
    ? `${targetKind === 'data' ? 'variable' : 'label'} ${targetName}`
    : null

  const taken = ea !== null && currentState.pc === ea
  const ccBitName = CC_BIT_NAMES.get(d)
  const extraWord = disp !== null ? wordToHex(disp) : 'control word'

  switch (mnemonic) {
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
    case 'addc':
      return `${mnemonic.toUpperCase()} ${regName(a)} and ${regName(b)}, store result in ${regName(d)}.`
    case 'muln':
      return `Multiply ${regName(a)} and ${regName(b)}, store the low word in ${regName(d)} and the high word in R15.`
    case 'divn':
      return `Divide the 32-bit value in R15:${regName(a)} by ${regName(b)}, store the quotient in ${regName(d)} and the remainder in ${regName(a)}.`
    case 'rrr1':
    case 'rrr2':
    case 'rrr3':
    case 'rrr4':
      return `Reserved RRR instruction (${mnemonic}).`
    case 'cmp':
      return `Compare ${regName(a)} with ${regName(b)} and update condition codes.`
    case 'trap': {
      const code = prevRegs[d]
      if (code === 0) {
        return 'Trap 0: halt execution.'
      }
      return `Trap ${wordToHex(code)}: invoke system handler.`
    }
    case 'lea':
      if (targetLabel) {
        return `Compute the address of ${targetLabel} (${eaText}) and store it in ${regName(d)}.`
      }
      return `Compute ${eaText} and store it in ${regName(d)}.`
    case 'load':
      if (ea !== null) {
        const value = memory?.[ea] ?? 0
        if (targetLabel) {
          return `Load ${targetLabel} from memory address ${eaText} (value ${formatValueWithDecimal(value)}) into ${regName(d)}.`
        }
        return `Load memory address ${eaText} (value ${formatValueWithDecimal(value)}) into ${regName(d)}.`
      }
      return `Load memory into ${regName(d)}.`
    case 'store':
      if (ea !== null) {
        const value = currentState.mem?.[ea] ?? prevRegs[d]
        if (targetLabel) {
          return `Store ${regName(d)} into ${targetLabel} at address ${eaText}. New value is ${formatValueWithDecimal(value)}.`
        }
        return `Store ${regName(d)} into memory address ${eaText}. New value is ${formatValueWithDecimal(value)}.`
      }
      return `Store ${regName(d)} into memory.`
    case 'jump':
      if (targetLabel) {
        return `Jump to ${targetLabel} at address ${eaText}.`
      }
      return `Jump to ${eaText}.`
    case 'bvc0':
      return 'Branch if the overflow flag is 0 (no overflow).'
    case 'brc1':
      return 'Branch if the carry flag is 1.'
    case 'brz':
      return `Branch if ${regName(d)} is zero.`
    case 'brnz':
      return `Branch if ${regName(d)} is not zero.`
    case 'dispatch':
      return 'Dispatch to a handler address using a dispatch table.'
    case 'jal':
      if (targetLabel) {
        return `Store return address in ${regName(d)} and jump to ${targetLabel} at address ${eaText}.`
      }
      return `Store return address in ${regName(d)} and jump to ${eaText}.`
    case 'jumpz': {
      const cond = prevRegs[d] === 0
      if (targetLabel) {
        return `Jump to ${targetLabel} at address ${eaText} if ${regName(d)} is zero (${cond ? 'taken' : 'not taken'}).`
      }
      return `Jump to ${eaText} if ${regName(d)} is zero (${cond ? 'taken' : 'not taken'}).`
    }
    case 'jumpnz': {
      const cond = prevRegs[d] !== 0
      if (targetLabel) {
        return `Jump to ${targetLabel} at address ${eaText} if ${regName(d)} is not zero (${cond ? 'taken' : 'not taken'}).`
      }
      return `Jump to ${eaText} if ${regName(d)} is not zero (${cond ? 'taken' : 'not taken'}).`
    }
    case 'jumpc0':
      return `Jump to ${targetLabel ? `${targetLabel} at address ${eaText}` : eaText} if condition code bit ${ccBitName || d} is 0 (${taken ? 'taken' : 'not taken'}).`
    case 'jumpc1':
      return `Jump to ${targetLabel ? `${targetLabel} at address ${eaText}` : eaText} if condition code bit ${ccBitName || d} is 1 (${taken ? 'taken' : 'not taken'}).`
    case 'testset':
      if (targetLabel) {
        return `Test and set ${targetLabel} at address ${eaText}, returning the old value in ${regName(d)}.`
      }
      return `Test and set memory at ${eaText}, returning the old value in ${regName(d)}.`
    case 'logicf':
      return `Apply a logic function (control ${extraWord}) to the source registers and store the result in ${regName(d)}.`
    case 'logicb':
      return `Apply a bit-level logic operation (control ${extraWord}) and store the result in ${regName(d)}.`
    case 'extract':
      return `Extract a bit field (control ${extraWord}) and store it in ${regName(d)}.`
    case 'shiftl':
      return `Shift left by the specified amount and store the result in ${regName(d)}.`
    case 'shiftr':
      return `Shift right by the specified amount and store the result in ${regName(d)}.`
    case 'push':
      return 'Push a value onto the stack.'
    case 'pop':
      return 'Pop a value from the stack into a register.'
    case 'top':
      return 'Copy the top of the stack into a register without popping it.'
    case 'save':
      return 'Save a range of registers to memory.'
    case 'restore':
      return 'Restore a range of registers from memory.'
    case 'getctl':
      return 'Read a control register into a general-purpose register.'
    case 'putctl':
      return 'Write a general-purpose register into a control register.'
    case 'resume':
      return 'Resume execution after an interrupt or trap.'
    case 'timon':
      return 'Enable the timer.'
    case 'timoff':
      return 'Disable the timer.'
    case 'xadd':
      return 'Extended-precision add (32-bit) using paired registers.'
    case 'xsub':
      return 'Extended-precision subtract (32-bit) using paired registers.'
    case 'xmul':
      return 'Extended-precision multiply (32-bit) using paired registers.'
    case 'xdiv':
      return 'Extended-precision divide (32-bit) using paired registers.'
    case 'xlea':
      return 'Extended-address LEA: compute a larger effective address into the destination register.'
    case 'xload':
      return 'Extended-address LOAD: read memory using a larger address and store it in a register.'
    case 'xstore':
      return 'Extended-address STORE: write a register value to memory using a larger address.'
    case 'nop':
    case 'noprx':
      return 'No operation.'
    default:
      return `Execute ${mnemonic} instruction.`
  }
}

/**
 * Get a human-readable summary of what changed in a delta
 * @param {Object} delta - Delta object from timeline
 * @returns {Array<string>} Array of change descriptions
 */
export function getDeltaSummary(delta, context = {}) {
  if (!delta) return []

  const {
    memory,
    address,
    lookupAddress,
    mode = 'advanced',
    sourceLine
  } = context
  const changes = []

  // PC change
  changes.push(`PC: ${wordToHex(delta.pc)}`)

  // Instruction executed
  const instr = decodeInstruction(delta.ir, { memory, address, sourceLine })
  changes.push(`Instruction: ${instr.mnemonic} ${instr.operands}`)

  // Register changes
  const regChanges = Object.entries(delta.changedRegisters)
  if (regChanges.length > 0) {
    if (mode === 'beginner') {
      const regList = regChanges
        .map(([r, value]) => `R${r} = ${formatValueWithDecimal(value)}`)
        .join(', ')
      changes.push(`Registers updated: ${regList}`)
    } else {
      const regList = regChanges.map(([r]) => `R${r}`).join(', ')
      changes.push(`Registers changed: ${regList}`)
    }
  }

  // Memory changes
  const memChanges = Object.entries(delta.changedMemory)
  if (memChanges.length > 0) {
    if (mode === 'beginner') {
      memChanges.forEach(([addr, value]) => {
        const numericAddr = Number(addr)
        const label = lookupAddress?.(numericAddr)
        if (label?.name) {
          const kindLabel = label.kind === 'data' ? 'variable' : 'label'
          changes.push(
            `Memory: ${kindLabel} ${label.name} at ${wordToHex(numericAddr)} = ${formatValueWithDecimal(value)}`
          )
        } else {
          changes.push(`Memory[${wordToHex(numericAddr)}] = ${formatValueWithDecimal(value)}`)
        }
      })
    } else {
      const memList = memChanges.map(([addr]) => wordToHex(Number(addr))).join(', ')
      changes.push(`Memory changed: ${memList}`)
    }
  }

  // Condition codes
  const flags = []
  if (delta.ccC) flags.push('C')
  if (delta.ccV) flags.push('V')
  if (delta.ccl) flags.push('<')
  if (delta.ccL) flags.push('L')
  if (delta.ccE) flags.push('E')
  if (delta.ccG) flags.push('G')
  if (delta.ccg) flags.push('>')
  if (flags.length > 0 && mode === 'advanced') {
    changes.push(`Flags: ${flags.join(' ')}`)
  }

  return changes
}

/**
 * Format execution statistics
 * @param {Object} timeline - Timeline object
 * @param {number} currentStep - Current step number
 * @returns {Object} Statistics object
 */
export function getExecutionStats(timeline, currentStep) {
  if (!timeline) return null

  const totalInstructions = timeline.totalSteps
  const progress = totalInstructions > 0 ? (currentStep / totalInstructions) * 100 : 0

  // Count total register changes across all deltas
  let totalRegChanges = 0
  let totalMemChanges = 0

  for (let i = 0; i < currentStep; i++) {
    const delta = timeline.deltas[i]
    totalRegChanges += Object.keys(delta.changedRegisters).length
    totalMemChanges += Object.keys(delta.changedMemory).length
  }

  return {
    currentStep,
    totalSteps: totalInstructions,
    progress: progress.toFixed(1),
    completed: timeline.completed,
    totalRegChanges,
    totalMemChanges,
  }
}
