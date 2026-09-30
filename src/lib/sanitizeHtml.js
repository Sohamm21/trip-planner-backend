const sanitizeHtml = require('sanitize-html');

// Matches the exact HTML the frontend's tiptap editor (StarterKit + TaskList/
// TaskItem + TextStyleKit) can produce — nothing more. Notes are rendered
// back via dangerouslySetInnerHTML for every trip member, so anything not
// explicitly allowed here (script tags, event handlers, iframes, etc.) must
// be stripped at write time, not just trusted from the client.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 's', 'u', 'code', 'pre',
  'blockquote', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'span', 'label', 'input',
];

const ALLOWED_ATTRIBUTES = {
  li: ['data-type', 'data-checked'],
  ul: ['data-type'],
  input: ['type', 'checked', 'disabled'],
  span: ['style'],
};

const ALLOWED_STYLES = {
  span: {
    color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^hsl\(/],
    'font-family': [/^[\w\s,'-]+$/],
  },
};

function sanitizeNoteContent(html) {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: ALLOWED_STYLES,
    // Checkbox inputs in task items are the only <input>s tiptap emits.
    allowedSchemes: [],
    disallowedTagsMode: 'discard',
  });
}

module.exports = { sanitizeNoteContent };
