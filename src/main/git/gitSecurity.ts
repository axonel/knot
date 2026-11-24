import fs from 'node:fs';
import path from 'node:path';

// Strict commit hash validator (prevent flag injection or path traversal)
const COMMIT_HASH_REGEX = /^(?:[0-9a-fA-F]{4,40}|HEAD(?:~[0-9]+|\^[0-9]*)?)$/;

// Sensitive file patterns
const SENSITIVE_FILENAME_REGEX = /(?:^|\/)(?:\.env(?:\..*)?|.*\.env|id_rsa|id_ed25519|id_ecdsa|id_dsa|.*\.pem|.*\.key|.*\.pkcs12|.*\.pfx|.*\.keystore|.*\.jks|credentials\.json|auth\.json|token\.json|client_secrets\.json|secrets\.ya?ml)$/i;

const SENSITIVE_CONTENT_PATTERNS = [
  /-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[0-9a-zA-Z]{36}/,
  /gho_[0-9a-zA-Z]{36}/,
  /glpat-[0-9a-zA-Z\-]{20}/,
  /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,32}/,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT token
];

/**
 * Validates that a repository directory exists, is a valid directory,
 * is not a symlink escaping its target, and matches the registered project path.
 */
export function validateRepositoryPath(repoPath: string, allowedRoot?: string): string {
  if (!repoPath || typeof repoPath !== 'string') {
    throw new Error('Repository path must be a non-empty string.');
  }

  const resolved = path.resolve(repoPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Repository directory does not exist: "${resolved}".`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Repository path is not a directory: "${resolved}".`);
  }

  // Resolve real canonical path to guard against symlink tricks
  const canonical = fs.realpathSync(resolved);

  if (allowedRoot) {
    const canonicalAllowed = fs.realpathSync(path.resolve(allowedRoot));
    if (canonical !== canonicalAllowed && !canonical.startsWith(canonicalAllowed + path.sep)) {
      throw new Error(`Access denied: repository path "${canonical}" is outside registered path "${canonicalAllowed}".`);
    }
  }

  return canonical;
}

/**
 * Validates a relative file path inside a repository.
 * Rejects path traversal, null bytes, absolute paths, and symlink escapes.
 */
export function validateRelativeFilePath(filePath: string, repoRoot: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string.');
  }

  if (filePath.includes('\0')) {
    throw new Error('Invalid file path containing null bytes.');
  }

  // Normalize path and reject absolute paths
  const normalized = path.normalize(filePath).replace(/^(\.\/)+/, '');
  if (path.isAbsolute(normalized) || normalized.startsWith('..' + path.sep) || normalized === '..') {
    throw new Error(`Path traversal attempt detected in path: "${filePath}".`);
  }

  const fullPath = path.resolve(repoRoot, normalized);
  const canonicalRoot = fs.realpathSync(repoRoot);

  if (fullPath !== canonicalRoot && !fullPath.startsWith(canonicalRoot + path.sep)) {
    throw new Error(`Path traversal attempt detected: "${filePath}" escapes repository.`);
  }

  // If the file exists, check realpath for symlink escape
  if (fs.existsSync(fullPath)) {
    const canonicalFile = fs.realpathSync(fullPath);
    if (canonicalFile !== canonicalRoot && !canonicalFile.startsWith(canonicalRoot + path.sep)) {
      throw new Error(`Symlink escape attempt detected: "${filePath}" resolves outside repository.`);
    }
  }

  return normalized;
}

/**
 * Validates commit hash format to prevent flag injection or arbitrary revisions.
 */
export function validateCommitHash(hash: string): string {
  if (!hash || typeof hash !== 'string') {
    throw new Error('Commit hash must be a non-empty string.');
  }

  const trimmed = hash.trim();
  if (trimmed.startsWith('-')) {
    throw new Error(`Invalid commit hash format: "${trimmed}" (must not start with a dash).`);
  }

  if (!COMMIT_HASH_REGEX.test(trimmed)) {
    throw new Error(`Invalid commit hash: "${trimmed}".`);
  }

  return trimmed;
}

/**
 * Detects whether a file name or path matches known sensitive / secret-bearing patterns.
 */
export function isSensitiveFilePath(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');
  return SENSITIVE_FILENAME_REGEX.test(normalized);
}

/**
 * Inspects file text content for high-entropy secrets, private keys, or API tokens.
 */
export function containsSensitiveSecrets(content: string): boolean {
  if (!content || typeof content !== 'string') return false;
  return SENSITIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Detects whether a buffer contains binary data (e.g. null bytes in initial 8KB).
 */
export function isBinaryContent(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8000);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}
