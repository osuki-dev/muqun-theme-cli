import { createHash } from 'node:crypto';

/**
 * SHA-256 over the actual file bytes.
 *
 * The app computes this with `react-native-quick-crypto`, which is the one
 * place the theme toolchain touches a native module. `node:crypto` produces the
 * same lowercase hex for the same bytes, which is all the manifest's `sha256`
 * field ever means.
 */
export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
