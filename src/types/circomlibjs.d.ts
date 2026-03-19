declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<any>
}

declare module 'poseidon-bls12381' {
  export function poseidon1(inputs: bigint[]): bigint
  export function poseidon2(inputs: bigint[]): bigint
  export function poseidon3(inputs: bigint[]): bigint
  export function poseidon4(inputs: bigint[]): bigint
  export function poseidon5(inputs: bigint[]): bigint
  export function poseidon6(inputs: bigint[]): bigint
  export function poseidon7(inputs: bigint[]): bigint
  export function poseidon8(inputs: bigint[]): bigint
  export function poseidon9(inputs: bigint[]): bigint
  export function poseidon10(inputs: bigint[]): bigint
  export function poseidon11(inputs: bigint[]): bigint
  export function poseidon12(inputs: bigint[]): bigint
  export function poseidon13(inputs: bigint[]): bigint
  export function poseidon14(inputs: bigint[]): bigint
  export function poseidon15(inputs: bigint[]): bigint
  export function poseidon16(inputs: bigint[]): bigint
}
