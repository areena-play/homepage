/**
 * AREENA Google Analytics 4 & GDPR / revDSG Consent Mode Manager
 */
(function() {
  const CONSENT_STORAGE_KEY = 'areena_cookie_consent';

  // 1. Initialize Google Consent Mode v2 with default 'denied'
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag('consent', 'default', {
    'analytics_storage': 'denied',
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'wait_for_update': 500
  });

  let gaConfig = {
    gaMeasurementId: '',
    gaEnabled: false
  };

  let gaScriptLoaded = false;

  function getStoredConsent() {
    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return null;
  }

  function setStoredConsent(consent) {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
        ...consent,
        timestamp: new Date().toISOString()
      }));
    } catch (e) {}
  }

  function deleteAnalyticsCookies() {
    const cookies = document.cookie.split(';');
    const domains = [
      window.location.hostname,
      '.' + window.location.hostname,
      '.' + window.location.hostname.replace(/^www\./, '')
    ];

    cookies.forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      if (name === '_ga' || name.startsWith('_ga_') || name === '_gid' || name === '_gat') {
        domains.forEach(d => {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${d}`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        });
      }
    });
  }

  function enableTracking(measurementId) {
    if (!measurementId) return;

    // Update consent state in Google Consent Mode
    gtag('consent', 'update', {
      'analytics_storage': 'granted'
    });

    // Remove any window disable flag
    window['ga-disable-' + measurementId] = false;

    // Load gtag.js script if not already loaded
    if (!gaScriptLoaded) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(script);
      gaScriptLoaded = true;

      gtag('js', new Date());
      gtag('config', measurementId, {
        anonymize_ip: true,
        cookie_flags: 'SameSite=None;Secure'
      });
    } else {
      gtag('config', measurementId, {
        anonymize_ip: true
      });
    }
  }

  function disableTracking(measurementId) {
    gtag('consent', 'update', {
      'analytics_storage': 'denied'
    });

    if (measurementId) {
      window['ga-disable-' + measurementId] = true;
    }

    deleteAnalyticsCookies();
  }

  async function fetchAnalyticsConfig() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data.analytics) {
          gaConfig.gaMeasurementId = data.analytics.gaMeasurementId || '';
          gaConfig.gaEnabled = !!data.analytics.gaEnabled;
        }
      }
    } catch (e) {
      console.warn('[analytics] Could not fetch analytics config from server:', e);
    }
    return gaConfig;
  }

  function showBanner() {
    const banner = document.getElementById('cookie-banner');
    if (banner) {
      banner.style.display = 'block';
    }
  }

  function hideBanner() {
    const banner = document.getElementById('cookie-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  function openModal() {
    const modal = document.getElementById('cookie-modal');
    const checkbox = document.getElementById('cookie-analytics-checkbox');
    const consent = getStoredConsent();

    if (checkbox) {
      checkbox.checked = consent ? !!consent.analytics : false;
    }

    if (modal) {
      modal.style.display = 'flex';
      hideBanner();
    }
  }

  function closeModal() {
    const modal = document.getElementById('cookie-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  async function applyConsent(consent) {
    setStoredConsent(consent);
    hideBanner();
    closeModal();

    await fetchAnalyticsConfig();

    if (consent.analytics && gaConfig.gaEnabled && gaConfig.gaMeasurementId) {
      enableTracking(gaConfig.gaMeasurementId);
    } else {
      disableTracking(gaConfig.gaMeasurementId);
    }

    window.dispatchEvent(new CustomEvent('cookieConsentChanged', { detail: consent }));
  }

  async function init() {
    const consent = getStoredConsent();
    await fetchAnalyticsConfig();

    if (!consent) {
      showBanner();
    } else {
      if (consent.analytics && gaConfig.gaEnabled && gaConfig.gaMeasurementId) {
        enableTracking(gaConfig.gaMeasurementId);
      } else {
        disableTracking(gaConfig.gaMeasurementId);
      }
    }

    // Attach DOM event listeners
    const acceptAllBtn = document.getElementById('cookie-accept-all-btn');
    if (acceptAllBtn) {
      acceptAllBtn.addEventListener('click', () => {
        applyConsent({ necessary: true, analytics: true });
      });
    }

    const declineBtn = document.getElementById('cookie-decline-btn');
    if (declineBtn) {
      declineBtn.addEventListener('click', () => {
        applyConsent({ necessary: true, analytics: false });
      });
    }

    const customizeBtn = document.getElementById('cookie-customize-btn');
    if (customizeBtn) {
      customizeBtn.addEventListener('click', () => {
        openModal();
      });
    }

    const modalClose = document.getElementById('cookie-modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', () => {
        closeModal();
      });
    }

    const savePrefBtn = document.getElementById('cookie-save-preferences-btn');
    if (savePrefBtn) {
      savePrefBtn.addEventListener('click', () => {
        const checkbox = document.getElementById('cookie-analytics-checkbox');
        const analyticsAllowed = checkbox ? checkbox.checked : false;
        applyConsent({ necessary: true, analytics: analyticsAllowed });
      });
    }

    // Connect footer / external cookie preference links
    document.querySelectorAll('.open-cookie-settings, #cookie-settings-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.CookieConsentManager = {
    openModal,
    closeModal,
    getConsent: getStoredConsent,
    setConsent: applyConsent
  };
})();

