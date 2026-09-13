const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = path.join(__dirname, '..', 'components');

const componentCache = new Map();

function getComponent(name, options = {}) {
  const componentPath = path.join(COMPONENTS_DIR, `${name}.html`);
  if (!fs.existsSync(componentPath)) {
    return '';
  }

  let content = fs.readFileSync(componentPath, 'utf8');

  // Variable replacements
  const isSubpage = !!options.isSubpage;
  const prefix = isSubpage ? '/' : '';
  const rootHref = isSubpage ? '/' : '#home';
  const activeHome = isSubpage ? '' : 'active';

  content = content
    .replace(/\{\{prefix\}\}/g, prefix)
    .replace(/\{\{rootHref\}\}/g, rootHref)
    .replace(/\{\{activeHome\}\}/g, activeHome);

  return content;
}

function renderHtmlWithComponents(htmlString, options = {}) {
  // Replace any <component name="xyz"></component> or <component name="xyz" />
  return htmlString.replace(/<component\s+name=["']([a-zA-Z0-9_-]+)["']\s*(?:\/>|><\/component>)/gi, (match, componentName) => {
    return getComponent(componentName, options);
  });
}

function renderPage(filePath, options = {}) {
  const rawHtml = fs.readFileSync(filePath, 'utf8');
  return renderHtmlWithComponents(rawHtml, options);
}

module.exports = {
  getComponent,
  renderHtmlWithComponents,
  renderPage
};

