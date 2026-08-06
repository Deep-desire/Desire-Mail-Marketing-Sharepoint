const Handlebars = require('handlebars');

/**
 * Compiles and renders a Handlebars template string with recipient variables.
 * @param {string} templateHtml - Raw HTML template with Handlebars tokens e.g. {{name}}
 * @param {object} variables - Key-value pair object e.g. { name: 'John', email: 'john@example.com' }
 * @returns {string} Rendered HTML string
 */
function renderTemplate(templateHtml, variables = {}) {
  try {
    const compiled = Handlebars.compile(templateHtml || '');
    return compiled(variables);
  } catch (err) {
    console.error('[Template Render Error]', err);
    return templateHtml || '';
  }
}

module.exports = { renderTemplate };
