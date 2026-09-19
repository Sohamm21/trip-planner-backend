const fs = require('fs');
const path = require('path');

// Simple {{placeholder}} substitution — no templating engine dependency needed for
// plain variable fill-ins. Reads the file fresh each call except for the `.html`
// contents cached in memory (small, fixed set of templates, won't change at runtime).
const cache = new Map();

function renderTemplate(templatePath, variables) {
  const absolutePath = path.join(__dirname, 'emailTemplates', templatePath);

  if (!cache.has(absolutePath)) {
    cache.set(absolutePath, fs.readFileSync(absolutePath, 'utf8'));
  }

  const template = cache.get(absolutePath);

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return key in variables ? variables[key] : match;
  });
}

module.exports = { renderTemplate };
