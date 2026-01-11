# Sigma16 Visualiser Manual

This manual is for first-year CS students who are learning Sigma16 assembly and basic CPU concepts.

## Quick Start

1) Type or load a Sigma16 program in the Program panel.
2) Click Assemble & Run.
3) Use Step Back/Step Forward to move through the program.

## Modes

- Beginner: shows only registers used by the program and keeps the UI simpler.
- Advanced: shows full registers plus extra panels (data flow, stack, condition codes, fetch/decode/execute).

## Panels

### Program
- Write or load Sigma16 assembly.
- After Assemble & Run, the program becomes read-only and highlights the current line.

### Controls
- Assemble & Run: assembles the code and builds a step-by-step timeline.
- Step Back/Step Forward: move through instructions.
- Reset: go back to step 0.
- End: jump to the last step.

### Step Explanation
- A plain-English description of what the current instruction does.

### What Changed This Step
- A short list of the registers and memory locations updated by the step.

### CPU Registers
- The 16 general registers (R0-R15).
- Inputs are highlighted in green, outputs in red.
- Advanced mode marks R14 as the stack pointer and R15 as the condition code register.

### Label Table
- Shows label names, their kind (code, data, const), and memory address.
- If a label is used in the current line, it is highlighted.

### I/O Console
- Output log shows text written by the program.
- Input buffer is used by trap reads.
- Note: type input before clicking Assemble & Run.
- Reads appear in green in the output log.
- Last run input shows exactly what was captured for the current run.

### Main Memory (RAM)
- Shows memory locations used by the program.
- In advanced mode, PC/IR and SP are highlighted.

### Data Flow (Advanced)
- Shows how values move between registers, memory, and the ALU for the current step.

### Stack (Advanced)
- Shows memory near the stack pointer (R14).
- Stack grows downward (toward lower addresses).

### Condition Codes (Advanced)
- Shows the flags set by compare and arithmetic operations.

### Fetch / Decode / Execute (Advanced)
- Explains the three major stages of a CPU instruction.

## Display Format

- Hexadecimal: compact view (base 16).
- Decimal: base 10.
- Binary: 16-bit view grouped into 4-bit chunks.

## I/O Trap Codes

Sigma16 uses trap codes for simple I/O:

- Trap code 1: read characters from the input buffer into memory.
  - R[a] = destination address, R[b] = length.
- Trap code 2: write characters from memory to the output log.
  - R[a] = source address, R[b] = length.

Each character is stored as its ASCII code in memory.

## Troubleshooting

- No output: make sure your program uses trap code 2 and that you step past the trap.
- Input not read: enter input before Assemble & Run, then re-run.
- Assembly errors: check the line number and fix syntax.
- Missing memory values: only non-zero or recently changed addresses are shown.
