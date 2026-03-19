// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ASPRegistryHub.sol";
import "../interfaces/IASPRegistry.sol";

contract ASPRegistryHubTest is Test {
    ASPRegistryHub public hub;
    address public operator = address(0xA);
    address public other = address(0xB);

    function setUp() public {
        hub = new ASPRegistryHub();
    }

    // ============ Registration ============

    function test_registerASP() public {
        vm.prank(operator);
        uint256 aspId = hub.registerASP("Test ASP");

        assertEq(aspId, 1);

        ASPInfo memory info = hub.getASP(aspId);
        assertEq(info.id, 1);
        assertEq(info.operator, operator);
        assertEq(info.name, "Test ASP");
        assertEq(info.currentRoot, 0);
    }

    function test_registerMultipleASPs() public {
        vm.prank(operator);
        uint256 id1 = hub.registerASP("ASP One");

        vm.prank(other);
        uint256 id2 = hub.registerASP("ASP Two");

        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_registerASP_emitsEvent() public {
        vm.prank(operator);
        vm.expectEmit(true, true, false, true);
        emit ASPRegistryHub.ASPRegistered(1, operator, "Test ASP");
        hub.registerASP("Test ASP");
    }

    // ============ Root Updates ============

    function test_updateRoot() public {
        vm.prank(operator);
        uint256 aspId = hub.registerASP("Test ASP");

        vm.prank(operator);
        hub.updateRoot(aspId, 12345);

        assertEq(hub.getCurrentRoot(aspId), 12345);
    }

    function test_updateRoot_onlyOperator() public {
        vm.prank(operator);
        uint256 aspId = hub.registerASP("Test ASP");

        vm.prank(other);
        vm.expectRevert("Not ASP operator");
        hub.updateRoot(aspId, 12345);
    }

    function test_updateRoot_emitsEvent() public {
        vm.prank(operator);
        uint256 aspId = hub.registerASP("Test ASP");

        vm.prank(operator);
        vm.expectEmit(true, false, false, true);
        emit ASPRegistryHub.ASPRootUpdated(aspId, 0, 12345);
        hub.updateRoot(aspId, 12345);
    }

    // ============ Root Validation ============

    function test_isValidASPRoot_currentRoot() public {
        vm.prank(operator);
        uint256 aspId = hub.registerASP("Test ASP");

        vm.prank(operator);
        hub.updateRoot(aspId, 42);

        assertTrue(hub.isValidASPRoot(aspId, 42));
    }

    function test_isValidASPRoot_zeroRootInvalid() public {
        vm.prank(operator);
        uint256 aspId = hub.registerASP("Test ASP");

        assertFalse(hub.isValidASPRoot(aspId, 0));
    }

    function test_isValidASPRoot_unknownASP() public {
        assertFalse(hub.isValidASPRoot(999, 42));
    }

    function test_isValidASPRoot_wrongRoot() public {
        vm.prank(operator);
        uint256 aspId = hub.registerASP("Test ASP");

        vm.prank(operator);
        hub.updateRoot(aspId, 42);

        assertFalse(hub.isValidASPRoot(aspId, 99));
    }

    // ============ Root History ============

    function test_rootHistory_previousRootsValid() public {
        vm.prank(operator);
        uint256 aspId = hub.registerASP("Test ASP");

        vm.startPrank(operator);
        hub.updateRoot(aspId, 100);
        hub.updateRoot(aspId, 200);
        hub.updateRoot(aspId, 300);
        vm.stopPrank();

        // Current root valid
        assertTrue(hub.isValidASPRoot(aspId, 300));
        // Previous roots still valid (in history)
        assertTrue(hub.isValidASPRoot(aspId, 200));
        assertTrue(hub.isValidASPRoot(aspId, 100));
    }

    function test_rootHistory_expiresAfter64() public {
        vm.prank(operator);
        uint256 aspId = hub.registerASP("Test ASP");

        vm.startPrank(operator);
        // Set initial root
        hub.updateRoot(aspId, 1);
        // Push 64 more roots to overflow the history buffer
        for (uint256 i = 2; i <= 65; i++) {
            hub.updateRoot(aspId, i);
        }
        vm.stopPrank();

        // Root 1 should be expired (pushed out of 64-slot buffer)
        assertFalse(hub.isValidASPRoot(aspId, 1));
        // Recent roots should still be valid
        assertTrue(hub.isValidASPRoot(aspId, 65));
        assertTrue(hub.isValidASPRoot(aspId, 64));
    }
}
