// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AttestationHub.sol";
import "../interfaces/IAttestationVerifier.sol";

/// @dev Mock verifier that always returns true
contract MockVerifierTrue is IAttestationVerifier {
    function verify(uint256, bytes calldata) external pure returns (bool) {
        return true;
    }
    function name() external pure returns (string memory) { return "Mock True"; }
    function attestationType() external pure returns (string memory) { return "MockTrue"; }
}

/// @dev Mock verifier that always returns false
contract MockVerifierFalse is IAttestationVerifier {
    function verify(uint256, bytes calldata) external pure returns (bool) {
        return false;
    }
    function name() external pure returns (string memory) { return "Mock False"; }
    function attestationType() external pure returns (string memory) { return "MockFalse"; }
}

/// @dev Mock verifier that checks identity against a stored value
contract MockVerifierCheckIdentity is IAttestationVerifier {
    uint256 public approvedIdentity;
    constructor(uint256 _id) { approvedIdentity = _id; }

    function verify(uint256 identity, bytes calldata) external view returns (bool) {
        return identity == approvedIdentity;
    }
    function name() external pure returns (string memory) { return "Mock Check"; }
    function attestationType() external pure returns (string memory) { return "MockCheck"; }
}

contract AttestationHubTest is Test {
    AttestationHub public hub;

    function setUp() public {
        hub = new AttestationHub();
    }

    // ============ Registration ============

    function test_registerVerifier() public {
        MockVerifierTrue v = new MockVerifierTrue();
        uint256 id = hub.registerVerifier(v);
        assertEq(id, 1);
        assertEq(address(hub.getVerifier(id)), address(v));
    }

    function test_registerMultipleVerifiers() public {
        MockVerifierTrue v1 = new MockVerifierTrue();
        MockVerifierFalse v2 = new MockVerifierFalse();

        uint256 id1 = hub.registerVerifier(v1);
        uint256 id2 = hub.registerVerifier(v2);

        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_registerVerifier_emitsEvent() public {
        MockVerifierTrue v = new MockVerifierTrue();
        vm.expectEmit(true, true, false, true);
        emit AttestationHub.VerifierRegistered(1, address(this), address(v), "Mock True", "MockTrue");
        hub.registerVerifier(v);
    }

    // ============ Verification ============

    function test_verify_delegatesToVerifier_true() public {
        MockVerifierTrue v = new MockVerifierTrue();
        uint256 id = hub.registerVerifier(v);

        assertTrue(hub.verify(id, 42, ""));
    }

    function test_verify_delegatesToVerifier_false() public {
        MockVerifierFalse v = new MockVerifierFalse();
        uint256 id = hub.registerVerifier(v);

        assertFalse(hub.verify(id, 42, ""));
    }

    function test_verify_unregisteredVerifier_reverts() public {
        vm.expectRevert("Verifier not registered");
        hub.verify(999, 42, "");
    }

    function test_verify_passesIdentityToVerifier() public {
        MockVerifierCheckIdentity v = new MockVerifierCheckIdentity(42);
        uint256 id = hub.registerVerifier(v);

        assertTrue(hub.verify(id, 42, ""));
        assertFalse(hub.verify(id, 99, ""));
    }

    function test_verify_passesProofToVerifier() public {
        // Verifier that decodes proof and checks a value
        MockVerifierTrue v = new MockVerifierTrue();
        uint256 id = hub.registerVerifier(v);

        // Should work with any proof data
        assertTrue(hub.verify(id, 1, abi.encode(uint256(123))));
        assertTrue(hub.verify(id, 1, ""));
    }

    // ============ Getters ============

    function test_getVerifier_unregistered() public view {
        IAttestationVerifier v = hub.getVerifier(999);
        assertEq(address(v), address(0));
    }
}
