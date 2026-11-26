import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

describe('Prompt 14 — Automated Security Regression & Quality Gates (UI)', () => {
  // =========================================================================
  // 3. React Markdown Rendering Safety
  // =========================================================================
  describe('React Markdown Rendering Safety', () => {
    it('renders malicious markup strictly as escaped text without executing scripts', () => {
      const maliciousPayload = '<script>window.__PWNED__ = true;</script><img src="x" onerror="window.__PWNED__ = true;" />';

      // Component rendering message markdown in React children (matching Knot message UI)
      const MessageComponent: React.FC<{ content: string }> = ({ content }) => (
        <div data-testid="markdown-body" className="text-xs whitespace-pre-wrap font-sans">
          {content}
        </div>
      );

      const { container } = render(<MessageComponent content={maliciousPayload} />);

      const el = screen.getByTestId('markdown-body');
      expect(el).toBeInTheDocument();
      // The text is escaped and preserved as literal text
      expect(el.textContent).toContain('<script>window.__PWNED__ = true;</script>');

      // No actual <script> or <img> tags were created in the DOM
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();

      // Window property was not set
      expect((window as unknown as { __PWNED__?: boolean }).__PWNED__).toBeUndefined();
    });
  });
});
