/**
 * Sanitizes log output to redact sensitive data such as tokens, passwords,
 * API keys, certificates, and credentials before displaying in the UI.
 */
export function sanitizeLogOutput(rawMessage: string): string {
  if (!rawMessage) return '';

  let sanitized = rawMessage;

  // 1. Redact Private Keys (PEM blocks)
  sanitized = sanitized.replace(
    /-----BEGIN [A-Z\s]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z\s]+ PRIVATE KEY-----/gi,
    '[REDACTED_PRIVATE_KEY]'
  );

  // 2. Redact JWT tokens (typically eyJ...)
  sanitized = sanitized.replace(
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g,
    '[REDACTED_JWT_TOKEN]'
  );

  // 3. Redact Bearer / Basic tokens in headers or strings
  sanitized = sanitized.replace(
    /(Bearer\s+|Basic\s+)[A-Za-z0-9_\-.~+/]+=*/gi,
    '$1[REDACTED_TOKEN]'
  );

  // 4. Redact URL credentials: e.g. mqtt://user:pass@host or https://user:pass@host
  sanitized = sanitized.replace(
    /((?:https?|mqtts?|wss?):\/\/)([^:\s/@]+):([^@\s/]+)@/gi,
    '$1$2:[REDACTED_SECRET]@'
  );

  // 5. Redact query parameters containing secrets/tokens (e.g. ?token=... or &api_key=...)
  sanitized = sanitized.replace(
    /([?&](?:token|key|secret|api_?key|auth|password|access_?token)=)[^&\s]+/gi,
    '$1[REDACTED_SECRET]'
  );

  // 6. Redact key-value pairs (json, env, or cli format): "token": "xyz", token=xyz, password: xyz
  sanitized = sanitized.replace(
    /([`"']?(?:token|secret|password|passwd|api_?key|auth_?token|client_?secret|private_?key)[`"']?\s*[:=]\s*[`"']?)[A-Za-z0-9_\-.~+/]{6,}([`"']?)/gi,
    '$1[REDACTED_CREDENTIAL]$2'
  );

  return sanitized;
}
