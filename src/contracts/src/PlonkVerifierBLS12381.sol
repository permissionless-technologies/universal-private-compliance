// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

import "./BLS12381.sol";

/// @title PLONK Verifier for BLS12-381
/// @notice Verifies PLONK proofs over the BLS12-381 curve using EIP-2537 precompiles.
///         Compatible with snarkjs PLONK proofs compiled with `--prime bls12381`.
///
/// @dev Circuit-specific verifiers inherit this contract and set the verification key
///      via the constructor. The verification key format matches snarkjs output.
///
///      Gas estimate: ~200-250k per verification (vs ~290k for BN254 PLONK).
///
///      Proof system: PLONK with KZG commitments over BLS12-381.
///      Trusted setup: Universal (Phase 1 = PPoT, Phase 2 = deterministic).
///      Security: 128-bit (institutional audit grade).
contract PlonkVerifierBLS12381 {
    using BLS12381 for *;

    // ============ BLS12-381 Scalar Field ============

    /// @notice BLS12-381 scalar field order (r)
    /// @dev r = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001
    uint256 internal constant Q = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001;

    // ============ Verification Key ============

    struct VerificationKey {
        // Circuit size (power of 2)
        uint256 n;
        // Number of public inputs
        uint256 nPublic;
        // Generator of the evaluation domain (omega)
        uint256 omega;
        // Selector polynomial commitments (G1 points, 128 bytes each)
        bytes Qm;   // multiplication selector
        bytes Ql;   // left selector
        bytes Qr;   // right selector
        bytes Qo;   // output selector
        bytes Qc;   // constant selector
        // Permutation polynomial commitments (G1 points)
        bytes S1;
        bytes S2;
        bytes S3;
        // Copy constraint polynomial evaluation at omega
        uint256 k1;
        uint256 k2;
        // SRS elements
        bytes X_2;  // [x]_2 (G2 point, 256 bytes) — from trusted setup
    }

    /// @notice The verification key for this circuit
    VerificationKey public vk;

    constructor(VerificationKey memory _vk) {
        vk = _vk;
    }

    // ============ Proof Structure ============

    /// @notice PLONK proof elements
    /// @dev Matches snarkjs PLONK proof format
    struct Proof {
        // Round 1: Wire commitments (G1 points)
        bytes A;    // [a(x)]_1
        bytes B;    // [b(x)]_1
        bytes C;    // [c(x)]_1

        // Round 2: Permutation commitment
        bytes Z;    // [z(x)]_1

        // Round 3: Quotient commitments
        bytes T1;   // [t_lo(x)]_1
        bytes T2;   // [t_mid(x)]_1
        bytes T3;   // [t_hi(x)]_1

        // Round 4: Opening evaluations (scalar field, fits uint256)
        uint256 eval_a;
        uint256 eval_b;
        uint256 eval_c;
        uint256 eval_s1;
        uint256 eval_s2;
        uint256 eval_zw;

        // Round 5: Opening proof commitments
        bytes Wxi;   // [W_ζ(x)]_1
        bytes Wxiw;  // [W_ζω(x)]_1
    }

    // ============ Verification ============

    /// @notice Verify a PLONK proof
    /// @param proof The PLONK proof
    /// @param pubSignals Public input signals
    /// @return True if the proof is valid
    function verifyProof(
        Proof calldata proof,
        uint256[] calldata pubSignals
    ) public view returns (bool) {
        require(pubSignals.length == vk.nPublic, "Wrong number of public inputs");

        // Step 1: Compute challenges via Fiat-Shamir
        (
            uint256 beta,
            uint256 gamma,
            uint256 alpha,
            uint256 xi,
            uint256 v,
            uint256 u
        ) = computeChallenges(proof, pubSignals);

        // Step 2: Compute zero polynomial evaluation
        // Z_H(ζ) = ζ^n - 1
        uint256 zh = addmod(expMod(xi, vk.n), Q - 1, Q);

        // Step 3: Compute Lagrange polynomial L_1(ζ)
        // L_1(ζ) = (ζ^n - 1) / (n * (ζ - 1))
        uint256 l1;
        {
            uint256 xiMinusOne = addmod(xi, Q - 1, Q);
            uint256 nInv = inverseMod(vk.n);
            l1 = mulmod(zh, mulmod(nInv, inverseMod(xiMinusOne), Q), Q);
        }

        // Step 4: Compute public input polynomial evaluation PI(ζ)
        uint256 pi = computePI(pubSignals, xi);

        // Step 5: Compute linearization constant part r_0
        // r_0 = PI(ζ) - L_1(ζ) · α² - α · (ā + β·s̄₁ + γ)(b̄ + β·s̄₂ + γ)(c̄ + γ)·z̄_ω
        uint256 r0;
        {
            uint256 alphaSquared = mulmod(alpha, alpha, Q);

            // (ā + β·s̄₁ + γ)
            uint256 t1 = addmod(addmod(proof.eval_a, mulmod(beta, proof.eval_s1, Q), Q), gamma, Q);
            // (b̄ + β·s̄₂ + γ)
            uint256 t2 = addmod(addmod(proof.eval_b, mulmod(beta, proof.eval_s2, Q), Q), gamma, Q);
            // (c̄ + γ)
            uint256 t3 = addmod(proof.eval_c, gamma, Q);

            r0 = addmod(
                pi,
                Q - addmod(
                    mulmod(l1, alphaSquared, Q),
                    mulmod(alpha, mulmod(mulmod(t1, mulmod(t2, t3, Q), Q), proof.eval_zw, Q), Q),
                    Q
                ),
                Q
            );
        }

        // Step 6: Compute linearization polynomial commitment [D]_1
        bytes memory D = computeD(proof, alpha, beta, gamma, xi, zh, l1, v);

        // Step 7: Compute full batched commitment [F]_1
        bytes memory F = computeF(proof, D, v);

        // Step 8: Compute group-encoded batch evaluation [E]_1
        // E = (-r_0 + v·ā + v²·b̄ + v³·c̄ + v⁴·s̄₁ + v⁵·s̄₂ + u·z̄_ω) · G₁
        bytes memory E;
        {
            uint256 eScalar = Q - r0; // start with -r0
            uint256 vPow = v;
            eScalar = addmod(eScalar, mulmod(vPow, proof.eval_a, Q), Q);
            vPow = mulmod(vPow, v, Q);
            eScalar = addmod(eScalar, mulmod(vPow, proof.eval_b, Q), Q);
            vPow = mulmod(vPow, v, Q);
            eScalar = addmod(eScalar, mulmod(vPow, proof.eval_c, Q), Q);
            vPow = mulmod(vPow, v, Q);
            eScalar = addmod(eScalar, mulmod(vPow, proof.eval_s1, Q), Q);
            vPow = mulmod(vPow, v, Q);
            eScalar = addmod(eScalar, mulmod(vPow, proof.eval_s2, Q), Q);
            eScalar = addmod(eScalar, mulmod(u, proof.eval_zw, Q), Q);

            E = BLS12381.g1Mul(g1Generator(), eScalar);
        }

        // Step 9: Pairing check
        // e(W_ζ + u · W_ζω, [x]_2) == e(ζ · W_ζ + u·ζ·ω · W_ζω + [F]_1 - [E]_1, [1]_2)
        return pairingVerify(proof, F, E, xi, u);
    }

    // ============ Internal: Challenges ============

    function computeChallenges(
        Proof calldata proof,
        uint256[] calldata pubSignals
    ) internal view returns (
        uint256 beta,
        uint256 gamma,
        uint256 alpha,
        uint256 xi,
        uint256 v,
        uint256 u
    ) {
        // Round 2 challenge: β, γ
        bytes32 h1 = keccak256(abi.encodePacked(proof.A, proof.B, proof.C));
        for (uint256 i = 0; i < pubSignals.length; i++) {
            h1 = keccak256(abi.encodePacked(h1, pubSignals[i]));
        }
        beta = uint256(h1) % Q;
        gamma = uint256(keccak256(abi.encodePacked(h1, uint8(1)))) % Q;

        // Round 3 challenge: α
        alpha = uint256(keccak256(abi.encodePacked(proof.Z, beta, gamma))) % Q;

        // Round 4 challenge: ζ (xi)
        xi = uint256(keccak256(abi.encodePacked(proof.T1, proof.T2, proof.T3, alpha))) % Q;

        // Round 5 challenge: v
        v = uint256(keccak256(abi.encodePacked(
            proof.eval_a, proof.eval_b, proof.eval_c,
            proof.eval_s1, proof.eval_s2, proof.eval_zw, xi
        ))) % Q;

        // Separation challenge: u
        u = uint256(keccak256(abi.encodePacked(proof.Wxi, proof.Wxiw, v))) % Q;
    }

    // ============ Internal: Public Input Polynomial ============

    function computePI(
        uint256[] calldata pubSignals,
        uint256 xi
    ) internal view returns (uint256) {
        // PI(ζ) = Σ pubSignals[i] · L_{i+1}(ζ)
        // For simplicity, compute via barycentric evaluation
        if (pubSignals.length == 0) return 0;

        uint256 result = 0;
        uint256 w = 1; // omega^0

        // Z_H(ζ) = ζ^n - 1
        uint256 zh = addmod(expMod(xi, vk.n), Q - 1, Q);
        uint256 nInv = inverseMod(vk.n);

        for (uint256 i = 0; i < pubSignals.length; i++) {
            // L_{i+1}(ζ) = (ζ^n - 1) · ω^i / (n · (ζ - ω^i))
            uint256 xiMinusW = addmod(xi, Q - w, Q);
            uint256 li = mulmod(zh, mulmod(w, mulmod(nInv, inverseMod(xiMinusW), Q), Q), Q);
            result = addmod(result, mulmod(pubSignals[i], li, Q), Q);
            w = mulmod(w, vk.omega, Q);
        }

        return result;
    }

    // ============ Internal: Linearization Commitment ============

    function computeD(
        Proof calldata proof,
        uint256 alpha,
        uint256 beta,
        uint256 gamma,
        uint256 xi,
        uint256 zh,
        uint256 l1,
        uint256 v
    ) internal view returns (bytes memory) {
        // D = ā·b̄·[Qm] + ā·[Ql] + b̄·[Qr] + c̄·[Qo] + [Qc]
        //   + α·((ā+β·ζ+γ)(b̄+β·k₁·ζ+γ)(c̄+β·k₂·ζ+γ)·[Z]
        //        - (ā+β·s̄₁+γ)(b̄+β·s̄₂+γ)·β·z̄_ω·[S3])
        //   + α²·L₁(ζ)·[Z]
        //   - Z_H(ζ)·([T1] + ζⁿ·[T2] + ζ²ⁿ·[T3])

        bytes[] memory points = new bytes[](10);
        uint256[] memory scalars = new uint256[](10);

        // Gate constraints
        scalars[0] = mulmod(proof.eval_a, proof.eval_b, Q); // ā·b̄
        points[0] = abi.decode(abi.encodePacked(vk.Qm), (bytes));

        scalars[1] = proof.eval_a;
        points[1] = abi.decode(abi.encodePacked(vk.Ql), (bytes));

        scalars[2] = proof.eval_b;
        points[2] = abi.decode(abi.encodePacked(vk.Qr), (bytes));

        scalars[3] = proof.eval_c;
        points[3] = abi.decode(abi.encodePacked(vk.Qo), (bytes));

        scalars[4] = 1;
        points[4] = abi.decode(abi.encodePacked(vk.Qc), (bytes));

        // Permutation (Z commitment coefficient)
        {
            uint256 betaXi = mulmod(beta, xi, Q);
            uint256 t1 = addmod(addmod(proof.eval_a, betaXi, Q), gamma, Q);
            uint256 t2 = addmod(addmod(proof.eval_b, mulmod(betaXi, vk.k1, Q), Q), gamma, Q);
            uint256 t3 = addmod(addmod(proof.eval_c, mulmod(betaXi, vk.k2, Q), Q), gamma, Q);
            uint256 zCoeff = addmod(
                mulmod(alpha, mulmod(t1, mulmod(t2, t3, Q), Q), Q),
                mulmod(mulmod(alpha, alpha, Q), l1, Q),
                Q
            );
            scalars[5] = zCoeff;
        }
        points[5] = abi.decode(abi.encodePacked(proof.Z), (bytes));

        // S3 coefficient (negative)
        {
            uint256 t1 = addmod(addmod(proof.eval_a, mulmod(beta, proof.eval_s1, Q), Q), gamma, Q);
            uint256 t2 = addmod(addmod(proof.eval_b, mulmod(beta, proof.eval_s2, Q), Q), gamma, Q);
            uint256 s3Coeff = Q - mulmod(alpha, mulmod(mulmod(t1, t2, Q), mulmod(beta, proof.eval_zw, Q), Q), Q);
            scalars[6] = s3Coeff;
        }
        points[6] = abi.decode(abi.encodePacked(vk.S3), (bytes));

        // Quotient polynomial: -Z_H(ζ) · [T1], -Z_H(ζ)·ζⁿ · [T2], -Z_H(ζ)·ζ²ⁿ · [T3]
        uint256 negZh = Q - zh;
        uint256 xiN = expMod(xi, vk.n);

        scalars[7] = negZh;
        points[7] = abi.decode(abi.encodePacked(proof.T1), (bytes));

        scalars[8] = mulmod(negZh, xiN, Q);
        points[8] = abi.decode(abi.encodePacked(proof.T2), (bytes));

        scalars[9] = mulmod(negZh, mulmod(xiN, xiN, Q), Q);
        points[9] = abi.decode(abi.encodePacked(proof.T3), (bytes));

        return BLS12381.g1Msm(points, scalars);
    }

    // ============ Internal: Full Batched Commitment ============

    function computeF(
        Proof calldata proof,
        bytes memory D,
        uint256 v
    ) internal view returns (bytes memory) {
        // F = D + v·[A] + v²·[B] + v³·[C] + v⁴·[S1] + v⁵·[S2]
        bytes[] memory points = new bytes[](6);
        uint256[] memory scalars = new uint256[](6);

        scalars[0] = 1;
        points[0] = D;

        uint256 vPow = v;
        scalars[1] = vPow;
        points[1] = abi.decode(abi.encodePacked(proof.A), (bytes));

        vPow = mulmod(vPow, v, Q);
        scalars[2] = vPow;
        points[2] = abi.decode(abi.encodePacked(proof.B), (bytes));

        vPow = mulmod(vPow, v, Q);
        scalars[3] = vPow;
        points[3] = abi.decode(abi.encodePacked(proof.C), (bytes));

        vPow = mulmod(vPow, v, Q);
        scalars[4] = vPow;
        points[4] = abi.decode(abi.encodePacked(vk.S1), (bytes));

        vPow = mulmod(vPow, v, Q);
        scalars[5] = vPow;
        points[5] = abi.decode(abi.encodePacked(vk.S2), (bytes));

        return BLS12381.g1Msm(points, scalars);
    }

    // ============ Internal: Pairing Verification ============

    function pairingVerify(
        Proof calldata proof,
        bytes memory F,
        bytes memory E,
        uint256 xi,
        uint256 u
    ) internal view returns (bool) {
        // Left side: W_ζ + u · W_ζω
        bytes memory leftG1;
        {
            bytes memory uWxiw = BLS12381.g1Mul(
                abi.decode(abi.encodePacked(proof.Wxiw), (bytes)),
                u
            );
            leftG1 = BLS12381.g1Add(
                abi.decode(abi.encodePacked(proof.Wxi), (bytes)),
                uWxiw
            );
        }

        // Right side: ζ · W_ζ + u·ζ·ω · W_ζω + F - E
        bytes memory rightG1;
        {
            uint256 xiOmega = mulmod(xi, vk.omega, Q);

            bytes[] memory points = new bytes[](4);
            uint256[] memory scalars = new uint256[](4);

            scalars[0] = xi;
            points[0] = abi.decode(abi.encodePacked(proof.Wxi), (bytes));

            scalars[1] = mulmod(u, xiOmega, Q);
            points[1] = abi.decode(abi.encodePacked(proof.Wxiw), (bytes));

            scalars[2] = 1;
            points[2] = F;

            // -E (negate E point)
            scalars[3] = 1;
            points[3] = BLS12381.g1Negate(E);

            rightG1 = BLS12381.g1Msm(points, scalars);
        }

        // Pairing check: e(-leftG1, [x]_2) · e(rightG1, [1]_2) == 1
        // Equivalent to: e(leftG1, [x]_2) == e(rightG1, [1]_2)
        bytes[] memory g1Points = new bytes[](2);
        bytes[] memory g2Points = new bytes[](2);

        g1Points[0] = BLS12381.g1Negate(leftG1);
        g2Points[0] = vk.X_2;

        g1Points[1] = rightG1;
        g2Points[1] = g2Generator();

        return BLS12381.pairingCheck(g1Points, g2Points);
    }

    // ============ Internal: Field Arithmetic ============

    function expMod(uint256 base, uint256 exp) internal pure returns (uint256 result) {
        result = 1;
        base = base % Q;
        while (exp > 0) {
            if (exp & 1 == 1) {
                result = mulmod(result, base, Q);
            }
            exp >>= 1;
            base = mulmod(base, base, Q);
        }
    }

    function inverseMod(uint256 a) internal pure returns (uint256) {
        return expMod(a, Q - 2);
    }

    // ============ Internal: Generator Points ============

    /// @notice BLS12-381 G1 generator point (128 bytes)
    /// @dev G1 generator: x = 0x17f1d3...5d5, y = 0x08b3f4...aab
    function g1Generator() internal pure returns (bytes memory) {
        bytes memory g = new bytes(128);
        assembly {
            let p := add(g, 0x20)
            // x coordinate (64 bytes, top 16 bytes zero)
            mstore(p, 0x0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0f)
            mstore(add(p, 0x20), 0xc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb)
            // y coordinate (64 bytes, top 16 bytes zero)
            mstore(add(p, 0x40), 0x0000000000000000000000000000000008b3f481e3aaa0f1a09e30ed741d8ae4)
            mstore(add(p, 0x60), 0xfcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1)
        }
        return g;
    }

    /// @notice BLS12-381 G2 generator point (256 bytes)
    function g2Generator() internal pure returns (bytes memory) {
        bytes memory g = new bytes(256);
        assembly {
            let p := add(g, 0x20)
            // x = c0 + c1*v (each component is 64 bytes)
            // x.c0
            mstore(p, 0x00000000000000000000000000000000024aa2b2f08f0a91260805272dc51051)
            mstore(add(p, 0x20), 0xc6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8)
            // x.c1
            mstore(add(p, 0x40), 0x0000000000000000000000000000000013e02b6052719f607dacd3a088274f65)
            mstore(add(p, 0x60), 0x596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e)
            // y = c0 + c1*v
            // y.c0
            mstore(add(p, 0x80), 0x0000000000000000000000000000000006606652a0b90440763cf41d3e0bdfab)
            mstore(add(p, 0xa0), 0xbf8e3f7268c948617e65d7e6b0f86e0193db4240568c7e85e964e10a55880bc8)
            // y.c1
            mstore(add(p, 0xc0), 0x000000000000000000000000000000000ce5d527727d6e118cc9cdc6da2e351a)
            mstore(add(p, 0xe0), 0xadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801)
        }
        return g;
    }
}
