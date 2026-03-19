# Smart Contracts

## Overview

UPC provides six contract layers:

1. **`IAttestationVerifier`** — Standard interface for any attestation verifier
2. **`AttestationHub`** — On-chain registry of verifiers
3. **`ASPRegistryHub`** — Merkle root registry for ASP operators
4. **`BLS12381`** — Library wrapping EIP-2537 precompiles for BLS12-381 curve operations
5. **`PlonkVerifierBLS12381`** — PLONK proof verification using EIP-2537 precompiles (128-bit security)
6. **Verifier adapters** — `MerkleASPVerifier`, `PlonkMembershipVerifier`, `SemaphoreVerifier`

## IAttestationVerifier

The core interface that all attestation backends must implement:

```solidity
interface IAttestationVerifier {
    /// @notice Verify that an identity holds a specific attestation
    /// @param identity The ZK identity commitment (or other identifier)
    /// @param proof Arbitrary proof data (format depends on backend)
    /// @return valid Whether the attestation is verified
    function verify(
        uint256 identity,
        bytes calldata proof
    ) external view returns (bool valid);

    /// @notice Human-readable name of this verifier
    function name() external view returns (string memory);

    /// @notice What type of attestation this verifier checks
    function attestationType() external view returns (string memory);
}
```

## AttestationHub

Registry of verifiers. Consumer protocols call `hub.verify()` which delegates to the appropriate verifier:

```solidity
contract AttestationHub {
    function registerVerifier(IAttestationVerifier verifier) external returns (uint256 verifierId);
    function verify(uint256 verifierId, uint256 identity, bytes calldata proof) external view returns (bool);
    function getVerifier(uint256 verifierId) external view returns (IAttestationVerifier);
}
```

## ASPRegistryHub

Manages Merkle roots for ASP operators. Each ASP has an operator address, a name, and a current root. Maintains a 64-entry history buffer of recent roots for backward compatibility.

```solidity
interface IASPRegistryHub {
    function registerASP(string calldata name) external returns (uint256 aspId);
    function updateRoot(uint256 aspId, uint256 newRoot) external;
    function isValidASPRoot(uint256 aspId, uint256 root) external view returns (bool);
    function getCurrentRoot(uint256 aspId) external view returns (uint256);
}
```

## MerkleASPVerifier

Wraps `ASPRegistryHub` as an `IAttestationVerifier`:

```solidity
contract MerkleASPVerifier is IAttestationVerifier {
    function verify(uint256 identity, bytes calldata proof) external view returns (bool) {
        // Decode ASP ID and root from proof bytes
        (uint256 aspId, uint256 root) = abi.decode(proof, (uint256, uint256));
        return aspHub.isValidASPRoot(aspId, root);
    }
}
```

## BLS12381 Library

Wraps EIP-2537 precompiles (live since Pectra, May 2025) for BLS12-381 curve operations:

```solidity
library BLS12381 {
    function g1Add(bytes memory p1, bytes memory p2) → bytes memory     // 375 gas
    function g1Mul(bytes memory point, uint256 scalar) → bytes memory   // ~12,000 gas
    function g1Msm(bytes[] memory points, uint256[] memory scalars) → bytes memory
    function pairingCheck(bytes[] memory g1, bytes[] memory g2) → bool  // ~103,000 gas (2 pairs)
    function g1Negate(bytes memory point) → bytes memory
}
```

Field elements are 64 bytes BigEndian (top 16 bytes zero). G1 points are 128 bytes, G2 points are 256 bytes, scalars are 32 bytes.

## PlonkVerifierBLS12381

PLONK proof verifier using the BLS12381 library. Takes a circuit-specific verification key as constructor parameter — reusable across any PLONK circuit compiled for BLS12-381.

```solidity
contract PlonkVerifierBLS12381 {
    constructor(VerificationKey memory _vk);
    function verifyProof(Proof calldata proof, uint256[] calldata pubSignals) → bool;
}
```

Gas estimate: ~200-250k per verification.

## PlonkMembershipVerifier

`IAttestationVerifier` adapter that verifies PLONK membership proofs on-chain. Wraps `PlonkVerifierBLS12381` and checks that the public signals match the claimed identity.

```solidity
contract PlonkMembershipVerifier is IAttestationVerifier {
    function verify(uint256 identity, bytes calldata proof) → bool;
    // proof = abi.encode(PlonkProof, uint256[] pubSignals)
    // pubSignals[0] = identity, pubSignals[1] = attestationRoot
}
```

## Deploying

Contracts are in `src/contracts/src/`. Use Foundry to compile and deploy:

```bash
cd src/contracts
forge build
forge test
```
