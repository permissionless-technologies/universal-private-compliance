// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ASPRegistryHub.sol";
import "../src/AttestationHub.sol";
import "../src/verifiers/MerkleASPVerifier.sol";
import "../interfaces/IASPRegistry.sol";

contract MerkleASPVerifierTest is Test {
    ASPRegistryHub public aspHub;
    AttestationHub public attestationHub;
    MerkleASPVerifier public verifier;

    address public operator = address(0xA);

    function setUp() public {
        aspHub = new ASPRegistryHub();
        attestationHub = new AttestationHub();
        verifier = new MerkleASPVerifier(IASPRegistryHub(address(aspHub)));

        // Register verifier with attestation hub
        attestationHub.registerVerifier(verifier);

        // Register an ASP and set a root
        vm.startPrank(operator);
        aspHub.registerASP("Test ASP"); // aspId = 1
        aspHub.updateRoot(1, 42);
        vm.stopPrank();
    }

    // ============ Direct Verification ============

    function test_verify_validRoot() public view {
        bytes memory proof = abi.encode(uint256(1), uint256(42));
        assertTrue(verifier.verify(0, proof));
    }

    function test_verify_invalidRoot() public view {
        bytes memory proof = abi.encode(uint256(1), uint256(99));
        assertFalse(verifier.verify(0, proof));
    }

    function test_verify_unknownASP() public view {
        bytes memory proof = abi.encode(uint256(999), uint256(42));
        assertFalse(verifier.verify(0, proof));
    }

    function test_verify_zeroRoot() public view {
        bytes memory proof = abi.encode(uint256(1), uint256(0));
        assertFalse(verifier.verify(0, proof));
    }

    // ============ Through AttestationHub ============

    function test_verifyThroughHub() public view {
        bytes memory proof = abi.encode(uint256(1), uint256(42));
        assertTrue(attestationHub.verify(1, 0, proof));
    }

    function test_verifyThroughHub_invalidRoot() public view {
        bytes memory proof = abi.encode(uint256(1), uint256(99));
        assertFalse(attestationHub.verify(1, 0, proof));
    }

    // ============ Metadata ============

    function test_name() public view {
        assertEq(verifier.name(), "Merkle ASP Verifier");
    }

    function test_attestationType() public view {
        assertEq(verifier.attestationType(), "MerkleASP");
    }

    // ============ Root History Through Verifier ============

    function test_verify_historicalRoot() public {
        vm.startPrank(operator);
        aspHub.updateRoot(1, 100);
        aspHub.updateRoot(1, 200);
        vm.stopPrank();

        // Previous root should still be valid
        bytes memory proof42 = abi.encode(uint256(1), uint256(42));
        assertTrue(verifier.verify(0, proof42));

        bytes memory proof100 = abi.encode(uint256(1), uint256(100));
        assertTrue(verifier.verify(0, proof100));

        bytes memory proof200 = abi.encode(uint256(1), uint256(200));
        assertTrue(verifier.verify(0, proof200));
    }
}
