// Multilingual i18n loader module
const I18nManager = (() => {
  const loadedTranslations = {};
  let currentLang = 'en';

  const supportedLangs = ['en', 'de', 'fr', 'it'];
  const langLabels = {
    en: '🇬🇧 EN',
    de: '🇩🇪 DE',
    fr: '🇫🇷 FR',
    it: '🇮🇹 IT'
  };

  function getInitialLanguage() {
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    if (langParam && supportedLangs.includes(langParam.toLowerCase())) {
      return langParam.toLowerCase();
    }

    const storedLang = localStorage.getItem('areena_lang');
    if (storedLang && supportedLangs.includes(storedLang)) {
      return storedLang;
    }

    const browserLang = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
    if (supportedLangs.includes(browserLang)) {
      return browserLang;
    }

    return 'en';
  }

  async function fetchLocale(lang) {
    if (loadedTranslations[lang]) {
      return loadedTranslations[lang];
    }

    // Try reading cached dictionary from localStorage for instant load
    try {
      const cached = localStorage.getItem(`areena_cached_dict_${lang}`);
      if (cached) {
        loadedTranslations[lang] = JSON.parse(cached);
      }
    } catch (e) {}

    try {
      const response = await fetch(`/locales/${lang}.json`);
      if (response.ok) {
        const data = await response.json();
        loadedTranslations[lang] = data;
        try {
          localStorage.setItem(`areena_cached_dict_${lang}`, JSON.stringify(data));
        } catch (e) {}
        return data;
      }
    } catch (err) {
      console.warn(`[i18n] Network fetch failed for "${lang}", using fallback.`, err);
    }

    if (loadedTranslations[lang]) {
      return loadedTranslations[lang];
    }

    // Fallback to English if non-English fails
    if (lang !== 'en') {
      return await fetchLocale('en');
    }
    return {};
  }

  function getNestedValue(obj, keyPath) {
    if (!obj || !keyPath) return null;
    return keyPath.split('.').reduce((prev, curr) => (prev ? prev[curr] : null), obj);
  }

  function applyDictionaryToDOM(dict, lang) {
    if (!dict) return;

    // Update active label on switcher button
    const currentLangLabel = document.getElementById('current-lang-label');
    if (currentLangLabel) {
      currentLangLabel.textContent = langLabels[lang] || lang.toUpperCase();
    }

    // Update active class in dropdown options
    document.querySelectorAll('.lang-option').forEach(option => {
      if (option.getAttribute('data-lang') === lang) {
        option.classList.add('active');
      } else {
        option.classList.remove('active');
      }
    });

    // Update meta tags & Open Graph
    if (dict.meta) {
      if (dict.meta.title) document.title = dict.meta.title;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && dict.meta.description) {
        metaDesc.setAttribute('content', dict.meta.description);
      }
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle && dict.meta.title) {
        ogTitle.setAttribute('content', dict.meta.title);
      }
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc && dict.meta.description) {
        ogDesc.setAttribute('content', dict.meta.description);
      }
    }

    // Update standard data-i18n nodes
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = getNestedValue(dict, key);
      if (val !== null && val !== undefined) {
        el.textContent = val;
      }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = getNestedValue(dict, key);
      if (val !== null && val !== undefined) {
        el.setAttribute('placeholder', val);
      }
    });

    // Update aria-labels
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      const val = getNestedValue(dict, key);
      if (val !== null && val !== undefined) {
        el.setAttribute('aria-label', val);
      }
    });

    // Update HTML content nodes
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      const val = getNestedValue(dict, key);
      if (val !== null && val !== undefined) {
        el.innerHTML = val;
      }
    });
  }

  async function setLanguage(lang) {
    if (!supportedLangs.includes(lang)) {
      lang = 'en';
    }

    currentLang = lang;
    localStorage.setItem('areena_lang', lang);
    document.documentElement.lang = lang;

    // Fast path: if we already have it in memory or cache, apply immediately
    const dict = await fetchLocale(lang);
    applyDictionaryToDOM(dict, lang);

    // Remove the anti-flicker loading class as soon as translation is rendered
    document.documentElement.classList.remove('i18n-loading');

    // Dispatch event
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang, dict } }));
    return dict;
  }

  return {
    getInitialLanguage,
    setLanguage,
    getCurrentLang: () => currentLang,
    getLoadedDictionary: (lang) => loadedTranslations[lang || currentLang],
    getNestedValue,
    supportedLangs,
    langLabels
  };
})();

window.I18nManager = I18nManager;
