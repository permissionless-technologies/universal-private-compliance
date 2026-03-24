/**
 * EIP-712 domain and types for authenticated ASP API requests.
 *
 * Used by both server (verifyTypedData) and client (signTypedData).
 * No chainId — ASP may serve multiple chains.
 */

export const ASP_EIP712_DOMAIN = {
  name: 'UPC-ASP',
  version: '1',
} as const

export const ASP_EIP712_TYPES = {
  ASPRequest: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const

/** Signature validity window in seconds */
export const ASP_SIGNATURE_MAX_AGE_SECONDS = 300
