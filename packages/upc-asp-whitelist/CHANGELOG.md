# Changelog

## [0.6.0](https://github.com/permissionless-technologies/universal-private-compliance/compare/upc-asp-whitelist-v0.5.1...upc-asp-whitelist-v0.6.0) (2026-04-09)


### Features

* add CORS headers, /health endpoint, bump to v0.4.1 ([6f0579a](https://github.com/permissionless-technologies/universal-private-compliance/commit/6f0579ab547b9636e3ef12a29fd1607624e49fd1))
* add Subsquid indexer mode to upc-asp-whitelist ([1502a06](https://github.com/permissionless-technologies/universal-private-compliance/commit/1502a069b92b214564dc23aedf7f567af06320d7))
* EIP-712 gated /proof, per-address /status, remove /members ([70c652a](https://github.com/permissionless-technologies/universal-private-compliance/commit/70c652a5012e9446745a317d35b80942f3f7d2f3))


### Bug Fixes

* debounce root publishing to prevent nonce conflicts (v0.4.2) ([b4977f0](https://github.com/permissionless-technologies/universal-private-compliance/commit/b4977f09d4e044748e398d2aca5919d8b642404f))
* make /proof public; drop EIP-712 gate ([dd1fe40](https://github.com/permissionless-technologies/universal-private-compliance/commit/dd1fe400ddbfeeccdbab4f0a0e137eb2f2d75536))


### Refactors

* composable IEventSource + IMembershipGate in upc-asp-whitelist (v0.4.0) ([d168f0a](https://github.com/permissionless-technologies/universal-private-compliance/commit/d168f0a118ccb6c705576eb5b668d64409d20a0a))
* make upc-asp-whitelist pool-agnostic (v0.3.0) ([f4cd38d](https://github.com/permissionless-technologies/universal-private-compliance/commit/f4cd38dfd8537e5d3e6150fcf133a604551549cd))
* rename to upc-sdk and extract asp-whitelist package ([546a424](https://github.com/permissionless-technologies/universal-private-compliance/commit/546a4244bcd9c6dfb823159613177d03974f01a9))
