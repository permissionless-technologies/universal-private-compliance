// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

import "../../interfaces/IAttestationVerifier.sol";

/// @title SemaphoreVerifier (Skeleton)
/// @notice Adapter that wraps Semaphore's verifyProof() as an IAttestationVerifier.
///
///         This is a skeleton — to deploy, provide the actual Semaphore contract address.
///         The Semaphore protocol must be deployed separately.
///
///         Proof format: abi.encode(SemaphoreProof)
///         where SemaphoreProof matches Semaphore v4's proof struct.
///
/// @dev To use this adapter:
///      1. Deploy Semaphore v4 contracts
///      2. Create a group and add members
///      3. Deploy this adapter with the Semaphore address and group ID
///      4. Register this adapter with AttestationHub
contract SemaphoreVerifier is IAttestationVerifier {
    /// @notice Minimal interface for Semaphore's verifyProof
    /// @dev Full interface at: https://github.com/semaphore-protocol/semaphore
    interface ISemaphore {
        struct SemaphoreProof {
            uint256 merkleTreeDepth;
            uint256 merkleTreeRoot;
            uint256 nullifier;
            uint256 message;
            uint256 scope;
            uint256[8] points;
        }

        function verifyProof(
            uint256 groupId,
            SemaphoreProof calldata proof
        ) external view returns (bool);
    }

    ISemaphore public immutable semaphore;
    uint256 public immutable groupId;

    constructor(ISemaphore _semaphore, uint256 _groupId) {
        semaphore = _semaphore;
        groupId = _groupId;
    }

    /// @notice Verify a Semaphore group membership proof
    /// @param identity Not used directly (identity is embedded in the Semaphore proof)
    /// @param proof abi-encoded ISemaphore.SemaphoreProof
    function verify(
        uint256 identity,
        bytes calldata proof
    ) external view override returns (bool valid) {
        ISemaphore.SemaphoreProof memory semProof = abi.decode(proof, (ISemaphore.SemaphoreProof));
        return semaphore.verifyProof(groupId, semProof);
    }

    function name() external pure override returns (string memory) {
        return "Semaphore Group Verifier";
    }

    function attestationType() external pure override returns (string memory) {
        return "SemaphoreGroup";
    }
}
