/**
 * Determines whether a keyboard event target is an editable form element
 * (e.g. input, textarea, select, contenteditable, or code editor).
 *
 * When an editable element is active, single-key navigation (1/2/3),
 * help toggles (?), and task approval shortcuts (Ctrl+Enter) are suppressed
 * to ensure normal text editing and typing are never hijacked.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  if (tagName === 'textarea' || tagName === 'select') return true;

  if (tagName === 'input') {
    const type = (target as HTMLInputElement).type?.toLowerCase();
    const nonTextTypes = [
      'checkbox',
      'radio',
      'button',
      'submit',
      'reset',
      'file',
      'image',
      'range',
      'color',
    ];
    return !nonTextTypes.includes(type);
  }

  if (target.isContentEditable) return true;

  if (target.closest('[contenteditable="true"], .monaco-editor, [role="textbox"]')) {
    return true;
  }

  return false;
}
