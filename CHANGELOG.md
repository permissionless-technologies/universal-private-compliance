# Changelog

## [0.4.1](https://github.com/permissionless-technologies/universal-private-compliance/compare/upc-sdk-v0.4.0...upc-sdk-v0.4.1) (2026-04-10)


### Bug Fixes

* **ci:** drop registry-url from publish jobs ([ca70350](https://github.com/permissionless-technologies/universal-private-compliance/commit/ca703507caf9f4a1f56667975dee73d996e081c5))
* **ci:** restore registry-url and NPM_TOKEN for publish jobs ([3f99e2e](https://github.com/permissionless-technologies/universal-private-compliance/commit/3f99e2e5044351a64f0884d5f24e01b1cdacf016))
* **ci:** use correct output key for root release ([9ccd849](https://github.com/permissionless-technologies/universal-private-compliance/commit/9ccd8491062116a28fd1c88c655b4d68ff87e7ea))
* updated release-please workflow to work with github OIDC ([3930930](https://github.com/permissionless-technologies/universal-private-compliance/commit/3930930f600d263c785b3564278af477afc84eea))

## [0.4.0](https://github.com/permissionless-technologies/universal-private-compliance/compare/upc-sdk-v0.3.2...upc-sdk-v0.4.0) (2026-04-09)


### Features

* add auto-whitelist-asp example ([c461aa8](https://github.com/permissionless-technologies/universal-private-compliance/commit/c461aa822f36225f590b90697d8173b1ca3c1a15))
* add CORS headers, /health endpoint, bump to v0.4.1 ([6f0579a](https://github.com/permissionless-technologies/universal-private-compliance/commit/6f0579ab547b9636e3ef12a29fd1607624e49fd1))
* add dev:asp-local script and env.local.example ([f3fd947](https://github.com/permissionless-technologies/universal-private-compliance/commit/f3fd94755045598d560fc4e2e99f645bdc3e5e49))
* add per-chain deployments and ASP list utilities ([c624b08](https://github.com/permissionless-technologies/universal-private-compliance/commit/c624b084bf28e762d4e2e178d95ae46a42a25690))
* add PLONK on-chain verifier using EIP-2537 BLS12-381 precompiles ([196fd8d](https://github.com/permissionless-technologies/universal-private-compliance/commit/196fd8d88ae13b24f07229422c0b87f876a7e9e9))
* add sanctions screening and dual event-source to auto-whitelist-asp ([c88207d](https://github.com/permissionless-technologies/universal-private-compliance/commit/c88207d84abe34f79836cb580293eb71415bc2da))
* add Subsquid indexer mode to upc-asp-whitelist ([1502a06](https://github.com/permissionless-technologies/universal-private-compliance/commit/1502a069b92b214564dc23aedf7f567af06320d7))
* define ASP service interface standard (v0.2.0) ([de1ccf4](https://github.com/permissionless-technologies/universal-private-compliance/commit/de1ccf44e18bf200b69ea856b565baf9d980357b))
* EIP-712 gated /proof, per-address /status, remove /members ([70c652a](https://github.com/permissionless-technologies/universal-private-compliance/commit/70c652a5012e9446745a317d35b80942f3f7d2f3))
* initial universal-private-compliance SDK ([a181b39](https://github.com/permissionless-technologies/universal-private-compliance/commit/a181b391234b7b1df4e2a49bed0055163fa01d8e))
* pluggable hash with BLS12-381 as default ([f9270d4](https://github.com/permissionless-technologies/universal-private-compliance/commit/f9270d466d488f890d0fc777ff70b2d21204d87d))
* switch to PLONK and drop OptionalMembershipProof ([aad05d3](https://github.com/permissionless-technologies/universal-private-compliance/commit/aad05d34fbf33a885f55d7f610b84aa5fa07621c))


### Bug Fixes

* correct Poseidon255 signal name in BLS12-381 merkle circuit ([507c5b7](https://github.com/permissionless-technologies/universal-private-compliance/commit/507c5b736d92f5bb084df2cc3db0865ae203b992))
* debounce root publishing to prevent nonce conflicts (v0.4.2) ([b4977f0](https://github.com/permissionless-technologies/universal-private-compliance/commit/b4977f09d4e044748e398d2aca5919d8b642404f))
* make /proof public; drop EIP-712 gate ([dd1fe40](https://github.com/permissionless-technologies/universal-private-compliance/commit/dd1fe400ddbfeeccdbab4f0a0e137eb2f2d75536))
* readme tables ([f9ff300](https://github.com/permissionless-technologies/universal-private-compliance/commit/f9ff3004ede5af260fc40d069fb0bc142e5d4e08))
* updated gitignore with .DS_Store, cache and out directory ([75dade6](https://github.com/permissionless-technologies/universal-private-compliance/commit/75dade67150172fa87a35cac0680cf86b8d3056e))


### Refactors

* composable IEventSource + IMembershipGate in upc-asp-whitelist (v0.4.0) ([d168f0a](https://github.com/permissionless-technologies/universal-private-compliance/commit/d168f0a118ccb6c705576eb5b668d64409d20a0a))
* make upc-asp-whitelist pool-agnostic (v0.3.0) ([f4cd38d](https://github.com/permissionless-technologies/universal-private-compliance/commit/f4cd38dfd8537e5d3e6150fcf133a604551549cd))
* rename to upc-sdk and extract asp-whitelist package ([546a424](https://github.com/permissionless-technologies/universal-private-compliance/commit/546a4244bcd9c6dfb823159613177d03974f01a9))


### Tests

* add Foundry test suite with 30 Solidity tests ([c037e4e](https://github.com/permissionless-technologies/universal-private-compliance/commit/c037e4e664261b58673408821cee20208d5627f9))
* expand coverage to 110 tests across tree, identity, and providers ([517e67b](https://github.com/permissionless-technologies/universal-private-compliance/commit/517e67ba37e669517b0ff697786983fa5586117a))


### Documentation

* add protocol integration guide ([25fbc5b](https://github.com/permissionless-technologies/universal-private-compliance/commit/25fbc5bb44af1349bf4df6bbc47f03c1fc2e784b))
* document ASP service interfaces across README, CLAUDE, architecture ([40c1c47](https://github.com/permissionless-technologies/universal-private-compliance/commit/40c1c47264a2b2b81d2e2b38cd7881e91037eaed))
