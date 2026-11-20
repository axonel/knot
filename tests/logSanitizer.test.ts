import { describe, it, expect } from 'vitest';
import { sanitizeLogOutput } from '../src/main/logSanitizer.js';

describe('sanitizeLogOutput', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeLogOutput('')).toBe('');
  });

  it('redacts private key blocks', () => {
    const raw = `-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Y\n-----END RSA PRIVATE KEY-----`;
    const sanitized = sanitizeLogOutput(raw);
    expect(sanitized).toContain('[REDACTED_PRIVATE_KEY]');
    expect(sanitized).not.toContain('MIIEowIBAAKCAQEA0Y');
  });

  it('redacts JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const raw = `Connected with session: ${jwt}`;
    const sanitized = sanitizeLogOutput(raw);
    expect(sanitized).toContain('[REDACTED_JWT_TOKEN]');
    expect(sanitized).not.toContain('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
  });

  it('redacts Bearer and Basic auth headers', () => {
    const raw = 'Authorization: Bearer secret_access_token_12345';
    const sanitized = sanitizeLogOutput(raw);
    expect(sanitized).toContain('Bearer [REDACTED_TOKEN]');
    expect(sanitized).not.toContain('secret_access_token_12345');
  });

  it('redacts credentials in URLs (MQTT and HTTP)', () => {
    const rawMqtt = 'Connecting to mqtt://device_user:super_secret_password@broker.desktopcommander.internal:8883';
    const sanitizedMqtt = sanitizeLogOutput(rawMqtt);
    expect(sanitizedMqtt).toContain('mqtt://device_user:[REDACTED_SECRET]@broker.desktopcommander.internal:8883');
    expect(sanitizedMqtt).not.toContain('super_secret_password');
  });

  it('redacts sensitive query parameters', () => {
    const raw = 'GET /api/v1/stream?token=abc123xyz456&client=remote';
    const sanitized = sanitizeLogOutput(raw);
    expect(sanitized).toContain('token=[REDACTED_SECRET]');
    expect(sanitized).not.toContain('abc123xyz456');
  });

  it('redacts key-value credential fields', () => {
    const raw = 'Config loaded: password: "superSecretPassword123" and api_key=xyz987654321';
    const sanitized = sanitizeLogOutput(raw);
    expect(sanitized).toContain('[REDACTED_CREDENTIAL]');
    expect(sanitized).not.toContain('superSecretPassword123');
    expect(sanitized).not.toContain('xyz987654321');
  });

  it('preserves ordinary non-sensitive log lines', () => {
    const raw = '[23:37:51] Desktop Commander Remote MCP device connected to localhost';
    expect(sanitizeLogOutput(raw)).toBe(raw);
  });
});
