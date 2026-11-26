/**
 * Sanitizes log output, event data, execution details, diffs, and exported records
 * to redact sensitive credentials such as tokens, passwords, private keys, certificates,
 * and API keys before persistent storage, display, or export.
 */

export function sanitizeLogOutput(rawMessage: string): string {
  if (!rawMessage || typeof rawMessage !== 'string') return '';

  let sanitized = rawMessage;

  // 1. Redact Private Keys (PEM blocks & SSH keys)
  sanitized = sanitized.replace(
    /-----BEGIN (?:[A-Z\s]+)?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z\s]+)?PRIVATE KEY-----/gi,
    '[REDACTED_PRIVATE_KEY]'
  );
  sanitized = sanitized.replace(
    /\b(?:ssh-rsa|ssh-dss|ssh-ed25519|ecdsa-sha2-nistp\d+)\s+[A-Za-z0-9+/]{40,}[=]{0,2}\b/gi,
    '[REDACTED_SSH_KEY]'
  );

  // 2. Redact Specific Cloud & SaaS Tokens
  // AWS Access Key ID
  sanitized = sanitized.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]');

  // GitHub Tokens (classic and fine-grained)
  sanitized = sanitized.replace(
    /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9a-zA-Z]{36}\b/g,
    '[REDACTED_GITHUB_TOKEN]'
  );
  sanitized = sanitized.replace(
    /\bgithub_pat_[0-9a-zA-Z_]{22,}\b/g,
    '[REDACTED_GITHUB_PAT]'
  );

  // GitLab Personal Access Tokens
  sanitized = sanitized.replace(/\bglpat-[0-9a-zA-Z\-]{20,}\b/g, '[REDACTED_GITLAB_TOKEN]');

  // Slack Tokens
  sanitized = sanitized.replace(
    /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,32}\b/g,
    '[REDACTED_SLACK_TOKEN]'
  );

  // OpenAI / Anthropic / AI API Keys
  sanitized = sanitized.replace(
    /\bsk-(?:proj-)?[a-zA-Z0-9_-]{20,}\b/g,
    '[REDACTED_AI_API_KEY]'
  );

  // Google API / Gemini Keys
  sanitized = sanitized.replace(/\bAIza[0-9A-Za-z-_]{35}\b/g, '[REDACTED_GOOGLE_API_KEY]');

  // 3. Redact JWT tokens (typically eyJ...)
  sanitized = sanitized.replace(
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g,
    '[REDACTED_JWT_TOKEN]'
  );

  // 4. Redact Bearer / Basic tokens in headers or strings
  sanitized = sanitized.replace(
    /(Bearer\s+|Basic\s+)[A-Za-z0-9_\-.~+/]+=*/gi,
    '$1[REDACTED_TOKEN]'
  );

  // 5. Redact URL credentials: e.g. https://user:pass@host or postgres://user:pass@host
  sanitized = sanitized.replace(
    /((?:https?|mqtts?|wss?|postgres(?:ql)?|mongodb(?:\+srv)?|mysql|redis):\/\/)([^:\s/@]+):([^@\s/]+)@/gi,
    '$1$2:[REDACTED_SECRET]@'
  );

  // 6. Redact session cookies
  sanitized = sanitized.replace(
    /\b((?:connect\.sid|session(?:_id)?|auth_token)=)[A-Za-z0-9_\-.~+/%=]{8,}\b/gi,
    '$1[REDACTED_COOKIE]'
  );

  // 7. Redact query parameters containing secrets/tokens (e.g. ?token=... or &api_key=...)
  sanitized = sanitized.replace(
    /([?&](?:token|key|secret|api_?key|auth|password|access_?token)=)[^&\s]+/gi,
    '$1[REDACTED_SECRET]'
  );

  // 8. Redact key-value pairs (json, env, or cli format): "token": "xyz", token=xyz, password: xyz
  sanitized = sanitized.replace(
    /([`"']?(?:token|secret|password|passwd|api_?key|auth_?token|client_?secret|private_?key)[`"']?\s*[:=]\s*[`"']?)[A-Za-z0-9_\-.~+/]{6,}([`"']?)/gi,
    '$1[REDACTED_CREDENTIAL]$2'
  );

  return sanitized;
}

/**
 * Recursively sanitizes strings inside an object or array before logging, storing, or exporting.
 */
export function sanitizeObject<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return sanitizeLogOutput(input) as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item)) as unknown as T;
  }

  if (typeof input === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      copy[key] = sanitizeObject(value);
    }
    return copy as T;
  }

  return input;
}
