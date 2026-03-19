# Smart Contracts

## Overview

UPC provides four contract layers:

1. **`IAttestationVerifier`** — Standard interface for any attestation verifier
2. **`AttestationHub`** — On-chain registry of verifiers
3. **`ASPRegistryHub`** — Merkle root registry for ASP operators
4. **`MerkleASPVerifier`** — Adapter that wraps ASPRegistryHub as an IAttestationVerifier

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

## Deploying

Contracts are in `src/contracts/src/`. Use Foundry to compile and deploy:

```bash
cd src/contracts
forge build
forge test
```
