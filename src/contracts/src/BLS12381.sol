// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

/// @title BLS12-381 Precompile Library
/// @notice Wraps EIP-2537 precompiles (live since Pectra, May 2025) for BLS12-381 curve operations.
/// @dev All field elements are 64 bytes BigEndian (top 16 bytes zero for Fp, which is 381 bits).
///      G1 points are 128 bytes (x: 64, y: 64). G2 points are 256 bytes. Scalars are 32 bytes.
library BLS12381 {
    // ============ Precompile Addresses (EIP-2537) ============

    address internal constant G1ADD           = address(0x0b);
    address internal constant G1MSM           = address(0x0c);
    address internal constant G2ADD           = address(0x0d);
    address internal constant G2MSM           = address(0x0e);
    address internal constant PAIRING_CHECK   = address(0x0f);
    address internal constant MAP_FP_TO_G1    = address(0x10);
    address internal constant MAP_FP2_TO_G2   = address(0x11);

    // ============ Constants ============

    /// @notice Size of a G1 point in bytes (x: 64 bytes + y: 64 bytes)
    uint256 internal constant G1_POINT_SIZE = 128;

    /// @notice Size of a G2 point in bytes (x: 128 bytes + y: 128 bytes)
    uint256 internal constant G2_POINT_SIZE = 256;

    /// @notice Size of a field element (Fp) in bytes
    uint256 internal constant FP_SIZE = 64;

    /// @notice Size of a scalar in bytes
    uint256 internal constant SCALAR_SIZE = 32;

    // ============ G1 Operations ============

    /// @notice Add two G1 points
    /// @param p1 First G1 point (128 bytes)
    /// @param p2 Second G1 point (128 bytes)
    /// @return result The sum p1 + p2 (128 bytes)
    function g1Add(bytes memory p1, bytes memory p2) internal view returns (bytes memory result) {
        require(p1.length == G1_POINT_SIZE && p2.length == G1_POINT_SIZE, "Invalid G1 point size");
        bytes memory input = abi.encodePacked(p1, p2);
        result = new bytes(G1_POINT_SIZE);

        assembly {
            let success := staticcall(
                gas(),
                0x0b,                    // G1ADD precompile
                add(input, 0x20),        // input data (skip length prefix)
                256,                     // 2 × 128 bytes
                add(result, 0x20),       // output location
                128                      // 128 bytes output
            )
            if iszero(success) { revert(0, 0) }
        }
    }

    /// @notice Scalar multiplication of a G1 point: s * P
    /// @param point G1 point (128 bytes)
    /// @param scalar Scalar value (32 bytes, BigEndian)
    /// @return result s * P (128 bytes)
    function g1Mul(bytes memory point, uint256 scalar) internal view returns (bytes memory result) {
        require(point.length == G1_POINT_SIZE, "Invalid G1 point size");
        // G1MSM input: 128 bytes (point) + 32 bytes (scalar) = 160 bytes per pair
        bytes memory input = new bytes(160);

        assembly {
            // Copy point (128 bytes)
            let src := add(point, 0x20)
            let dst := add(input, 0x20)
            mstore(dst, mload(src))
            mstore(add(dst, 0x20), mload(add(src, 0x20)))
            mstore(add(dst, 0x40), mload(add(src, 0x40)))
            mstore(add(dst, 0x60), mload(add(src, 0x60)))
            // Store scalar (32 bytes)
            mstore(add(dst, 0x80), scalar)
        }

        result = new bytes(G1_POINT_SIZE);

        assembly {
            let success := staticcall(
                gas(),
                0x0c,                    // G1MSM precompile
                add(input, 0x20),
                160,                     // 1 pair = 160 bytes
                add(result, 0x20),
                128
            )
            if iszero(success) { revert(0, 0) }
        }
    }

    /// @notice Multi-scalar multiplication: sum(s_i * P_i)
    /// @param points Array of G1 points (128 bytes each)
    /// @param scalars Array of scalars (uint256 each)
    /// @return result MSM result (128 bytes)
    function g1Msm(bytes[] memory points, uint256[] memory scalars) internal view returns (bytes memory result) {
        uint256 k = points.length;
        require(k > 0 && k == scalars.length, "Invalid MSM input");

        // Each pair: 128 bytes (point) + 32 bytes (scalar) = 160 bytes
        bytes memory input = new bytes(k * 160);

        for (uint256 i = 0; i < k; i++) {
            require(points[i].length == G1_POINT_SIZE, "Invalid G1 point size");
            uint256 offset = i * 160;

            assembly {
                let src := add(mload(add(add(points, 0x20), mul(i, 0x20))), 0x20)
                let dst := add(add(input, 0x20), offset)
                // Copy 128-byte G1 point
                mstore(dst, mload(src))
                mstore(add(dst, 0x20), mload(add(src, 0x20)))
                mstore(add(dst, 0x40), mload(add(src, 0x40)))
                mstore(add(dst, 0x60), mload(add(src, 0x60)))
                // Copy 32-byte scalar
                let s := mload(add(add(scalars, 0x20), mul(i, 0x20)))
                mstore(add(dst, 0x80), s)
            }
        }

        result = new bytes(G1_POINT_SIZE);

        assembly {
            let success := staticcall(
                gas(),
                0x0c,                    // G1MSM precompile
                add(input, 0x20),
                mul(k, 160),
                add(result, 0x20),
                128
            )
            if iszero(success) { revert(0, 0) }
        }
    }

    // ============ Pairing ============

    /// @notice Pairing check: e(P1,Q1) × e(P2,Q2) × ... == 1
    /// @param g1Points Array of G1 points (128 bytes each)
    /// @param g2Points Array of G2 points (256 bytes each)
    /// @return True if the pairing equation holds
    function pairingCheck(bytes[] memory g1Points, bytes[] memory g2Points) internal view returns (bool) {
        uint256 k = g1Points.length;
        require(k > 0 && k == g2Points.length, "Invalid pairing input");

        // Each pair: 128 bytes (G1) + 256 bytes (G2) = 384 bytes
        bytes memory input = new bytes(k * 384);

        for (uint256 i = 0; i < k; i++) {
            require(g1Points[i].length == G1_POINT_SIZE, "Invalid G1 point size");
            require(g2Points[i].length == G2_POINT_SIZE, "Invalid G2 point size");
            uint256 offset = i * 384;

            // Copy G1 point (128 bytes)
            assembly {
                let src := add(mload(add(add(g1Points, 0x20), mul(i, 0x20))), 0x20)
                let dst := add(add(input, 0x20), offset)
                mstore(dst, mload(src))
                mstore(add(dst, 0x20), mload(add(src, 0x20)))
                mstore(add(dst, 0x40), mload(add(src, 0x40)))
                mstore(add(dst, 0x60), mload(add(src, 0x60)))
            }

            // Copy G2 point (256 bytes)
            assembly {
                let src := add(mload(add(add(g2Points, 0x20), mul(i, 0x20))), 0x20)
                let dst := add(add(input, 0x20), add(offset, 128))
                mstore(dst, mload(src))
                mstore(add(dst, 0x20), mload(add(src, 0x20)))
                mstore(add(dst, 0x40), mload(add(src, 0x40)))
                mstore(add(dst, 0x60), mload(add(src, 0x60)))
                mstore(add(dst, 0x80), mload(add(src, 0x80)))
                mstore(add(dst, 0xa0), mload(add(src, 0xa0)))
                mstore(add(dst, 0xc0), mload(add(src, 0xc0)))
                mstore(add(dst, 0xe0), mload(add(src, 0xe0)))
            }
        }

        bool success;
        bytes memory output = new bytes(32);

        assembly {
            success := staticcall(
                gas(),
                0x0f,                    // PAIRING_CHECK precompile
                add(input, 0x20),
                mul(k, 384),
                add(output, 0x20),
                32
            )
        }

        require(success, "Pairing check call failed");
        return output[31] == 0x01;
    }

    // ============ Negate ============

    /// @notice Negate a G1 point (reflect over x-axis)
    /// @dev BLS12-381 Fp modulus
    ///      p = 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab
    /// @param point G1 point (128 bytes)
    /// @return The negated point -P
    function g1Negate(bytes memory point) internal pure returns (bytes memory) {
        require(point.length == G1_POINT_SIZE, "Invalid G1 point size");

        // Check for point at infinity (all zeros)
        bool isInfinity = true;
        for (uint256 i = 0; i < G1_POINT_SIZE; i++) {
            if (point[i] != 0) { isInfinity = false; break; }
        }
        if (isInfinity) return point;

        // Negate: keep x, compute p - y for the y-coordinate
        bytes memory result = new bytes(G1_POINT_SIZE);

        // Copy x-coordinate (first 64 bytes)
        assembly {
            let src := add(point, 0x20)
            let dst := add(result, 0x20)
            mstore(dst, mload(src))
            mstore(add(dst, 0x20), mload(add(src, 0x20)))
        }

        // For y-coordinate negation (p - y), we use the fact that
        // the Fp modulus fits in 48 bytes (384 bits, but top 3 bits are 0).
        // Since coordinates are stored as 64 bytes BigEndian with top 16 bytes = 0,
        // we need to compute the subtraction in the lower 48 bytes.
        //
        // p = 1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab
        //
        // We split this into two 256-bit halves for Solidity arithmetic:
        // p_hi (bytes 16..47) and p_lo (bytes 48..63)

        // Load y as two uint256 parts (big-endian in 64-byte field)
        uint256 y_hi;
        uint256 y_lo;
        assembly {
            y_hi := mload(add(point, 0x60)) // bytes 64..95 of point
            y_lo := mload(add(point, 0x80)) // bytes 96..127 of point
        }

        // BLS12-381 base field modulus split into two uint256s
        // Full modulus: 0x000000000000000000000000000000001a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab
        uint256 p_hi = 0x000000000000000000000000000000001a0111ea397fe69a4b1ba7b6434bacd7;
        uint256 p_lo = 0x64774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab;

        // Compute p - y with borrow
        uint256 neg_lo;
        uint256 neg_hi;
        unchecked {
            neg_lo = p_lo - y_lo;
            neg_hi = p_hi - y_hi;
            if (p_lo < y_lo) {
                neg_hi -= 1; // borrow
            }
        }

        assembly {
            let dst := add(result, 0x60) // y-coordinate starts at byte 64
            mstore(dst, neg_hi)
            mstore(add(dst, 0x20), neg_lo)
        }

        return result;
    }
}
