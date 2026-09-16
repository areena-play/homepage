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
  const lang = (options.lang && options.lang !== 'en') ? options.lang : '';
  const langSegment = lang ? `/${lang}` : '';
  const prefix = isSubpage ? (langSegment ? `${langSegment}/` : '/') : '';
  const rootHref = isSubpage ? (langSegment ? `${langSegment}` : '/') : '#home';
  const activeHome = isSubpage ? '' : 'active';
  const sttHref = langSegment ? `${langSegment}/swiss-table-tennis` : '/swiss-table-tennis';
  const impressumHref = langSegment ? `${langSegment}/impressum` : '/impressum';
  const privacyHref = langSegment ? `${langSegment}/privacy-policy` : '/privacy-policy';

  content = content
    .replace(/\{\{prefix\}\}/g, prefix)
    .replace(/\{\{rootHref\}\}/g, rootHref)
    .replace(/\{\{activeHome\}\}/g, activeHome)
    .replace(/\{\{sttHref\}\}/g, sttHref)
    .replace(/\{\{impressumHref\}\}/g, impressumHref)
    .replace(/\{\{privacyHref\}\}/g, privacyHref);

  return content;
}

function renderHtmlWithComponents(htmlString, options = {}) {
  // Replace <html lang="..."> if lang option is provided
  let rendered = htmlString;
  if (options.lang) {
    rendered = rendered.replace(/<html(?:\s+lang=["'][^"']*["'])?/i, `<html lang="${options.lang}"`);
  }

  // Replace any <component name="xyz"></component> or <component name="xyz" />
  return rendered.replace(/<component\s+name=["']([a-zA-Z0-9_-]+)["']\s*(?:\/>|><\/component>)/gi, (match, componentName) => {
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

