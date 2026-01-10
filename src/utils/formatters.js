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
export function decodeInstruction(ir) {
  const op = (ir >> 12) & 0xf
  const d = (ir >> 8) & 0xf
  const a = (ir >> 4) & 0xf
  const b = ir & 0xf
  const disp = ir & 0xfff

  // Basic RX instruction names (expand this with architecture.mjs)
  const rxInstructions = [
    'lea', 'load', 'store', 'jump', 'jumpc0', 'jumpc1', 'jumpf', 'jumpt',
    'jal', 'testset', '', '', '', '', '', 'trap'
  ]

  // Basic RRR instruction names (for op = 0)
  const rrrInstructions = [
    'add', 'sub', 'mul', 'div', 'cmp', '', '', '',
    '', '', '', '', '', '', '', ''
  ]

  let mnemonic = rxInstructions[op] || 'unknown'
  let format = 'RX'
  let operands = `R${d},${wordToHex(disp)}[R${a}]`

  if (op === 0) {
    // RRR format
    format = 'RRR'
    const rrr_op = b
    mnemonic = rrrInstructions[rrr_op] || 'unknown'
    operands = `R${d},R${a},R${b}`
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
    hex: wordToHex(ir)
  }
}

/**
 * Get a human-readable summary of what changed in a delta
 * @param {Object} delta - Delta object from timeline
 * @returns {Array<string>} Array of change descriptions
 */
export function getDeltaSummary(delta) {
  if (!delta) return []

  const changes = []

  // PC change
  changes.push(`PC: ${wordToHex(delta.pc)}`)

  // Instruction executed
  const instr = decodeInstruction(delta.ir)
  changes.push(`Instruction: ${instr.mnemonic} ${instr.operands}`)

  // Register changes
  const regChanges = Object.keys(delta.changedRegisters)
  if (regChanges.length > 0) {
    const regList = regChanges.map(r => `R${r}`).join(', ')
    changes.push(`Registers changed: ${regList}`)
  }

  // Memory changes
  const memChanges = Object.keys(delta.changedMemory)
  if (memChanges.length > 0) {
    const memList = memChanges.map(addr => wordToHex(parseInt(addr))).join(', ')
    changes.push(`Memory changed: ${memList}`)
  }

  // Condition codes
  const flags = []
  if (delta.ccC) flags.push('C')
  if (delta.ccV) flags.push('V')
  if (delta.ccG) flags.push('G')
  if (delta.ccE) flags.push('E')
  if (flags.length > 0) {
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
