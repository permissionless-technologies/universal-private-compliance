/**
 * ASPRegistryHub Contract ABI
 *
 * Copied from upp-sdk. This ABI is shared between UPC and UPP.
 */

export const ASP_REGISTRY_HUB_ABI = [
  {
    "type": "function",
    "name": "ROOT_HISTORY_SIZE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "aspRootHistory",
    "inputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" },
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "aspRootIndex",
    "inputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "asps",
    "inputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      { "name": "id", "type": "uint256", "internalType": "uint256" },
      { "name": "operator", "type": "address", "internalType": "address" },
      { "name": "name", "type": "string", "internalType": "string" },
      { "name": "currentRoot", "type": "uint256", "internalType": "uint256" },
      { "name": "lastUpdated", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getASP",
    "inputs": [{ "name": "aspId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ASPInfo",
        "components": [
          { "name": "id", "type": "uint256", "internalType": "uint256" },
          { "name": "operator", "type": "address", "internalType": "address" },
          { "name": "name", "type": "string", "internalType": "string" },
          { "name": "currentRoot", "type": "uint256", "internalType": "uint256" },
          { "name": "lastUpdated", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCurrentRoot",
    "inputs": [{ "name": "aspId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isValidASPRoot",
    "inputs": [
      { "name": "aspId", "type": "uint256", "internalType": "uint256" },
      { "name": "root", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextASPId",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerASP",
    "inputs": [{ "name": "name", "type": "string", "internalType": "string" }],
    "outputs": [{ "name": "aspId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateRoot",
    "inputs": [
      { "name": "aspId", "type": "uint256", "internalType": "uint256" },
      { "name": "newRoot", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ASPRegistered",
    "inputs": [
      { "name": "aspId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "operator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "name", "type": "string", "indexed": false, "internalType": "string" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ASPRootUpdated",
    "inputs": [
      { "name": "aspId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "oldRoot", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "newRoot", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;
