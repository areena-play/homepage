document.addEventListener('DOMContentLoaded', async () => {
  // Safety timeout to ensure body is always visible even in edge network cases
  setTimeout(() => {
    document.documentElement.classList.remove('i18n-loading');
    document.documentElement.classList.remove('preload');
  }, 1000);

  // Remove preload class after initial paint so subsequent manual clicks transition smoothly
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.documentElement.classList.remove('preload');
    }, 50);
  });

  // --- Theme Management (Light / Dark) ---
  const themeBtn = document.getElementById('theme-toggle');
  
  function updateThemeButton(theme) {
    if (themeBtn) {
      themeBtn.innerHTML = theme === 'light' ? '🌙' : '☀️';
      const label = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
      themeBtn.setAttribute('title', label);
      themeBtn.setAttribute('aria-label', label);
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('areena_theme', theme);
    updateThemeButton(theme);
  }

  // Sync button state with current theme (already set by head inline script)
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeButton(currentTheme);

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
    });
  }

  // --- Multilingual Internationalization (i18n) ---
  const langBtn = document.getElementById('lang-btn');
  const langDropdown = document.getElementById('lang-dropdown');

  if (langBtn && langDropdown) {
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      langDropdown.classList.toggle('open');
    });

    document.querySelectorAll('.lang-option').forEach(option => {
      option.addEventListener('click', async (e) => {
        const selectedLang = option.getAttribute('data-lang');
        if (window.I18nManager) {
          await window.I18nManager.setLanguage(selectedLang);
        }
        langDropdown.classList.remove('open');
      });
    });

    document.addEventListener('click', (e) => {
      if (!langDropdown.contains(e.target) && !langBtn.contains(e.target)) {
        langDropdown.classList.remove('open');
      }
    });
  }

  // Mobile Navigation Toggle
  const mobileToggle = document.getElementById('mobile-toggle');
  const navLinks = document.getElementById('nav-links');

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      const isOpen = navLinks.classList.contains('open');
      mobileToggle.innerHTML = isOpen ? '✕' : '☰';
      mobileToggle.setAttribute('aria-expanded', isOpen);
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        mobileToggle.innerHTML = '☰';
        mobileToggle.setAttribute('aria-expanded', false);
      });
    });
  }

  // Active section scroll spy (for index page)
  const sections = document.querySelectorAll('section[id]');
  if (sections.length > 0) {
    window.addEventListener('scroll', () => {
      const scrollY = window.pageYOffset;
      sections.forEach(current => {
        const sectionHeight = current.offsetHeight;
        const sectionTop = current.offsetTop - 120;
        const sectionId = current.getAttribute('id');
        const navLink = document.querySelector(`.nav-links a[href*="#${sectionId}"]`);
        
        if (navLink) {
          if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
            navLink.classList.add('active');
          } else {
            navLink.classList.remove('active');
          }
        }
      });
    });
  }

  // Contact Form Handling (Simulated sending & feedback)
  const contactForm = document.getElementById('contact-form');
  const formFeedback = document.getElementById('form-feedback');
  const submitBtn = document.getElementById('submit-btn');

  if (contactForm && formFeedback && submitBtn) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const submitText = submitBtn.querySelector('span');
      const originalText = submitText ? submitText.textContent : 'Send Message';
      const curDict = window.I18nManager ? window.I18nManager.getLoadedDictionary() : null;
      const sendingText = curDict?.contact?.sendingBtn || 'Sending...';

      if (submitText) submitText.textContent = sendingText;
      submitBtn.disabled = true;

      // Simulate sending latency
      setTimeout(() => {
        formFeedback.style.display = 'block';
        formFeedback.textContent = curDict?.contact?.successMsg || 'Thank you! Your message has been received.';
        contactForm.reset();
        if (submitText) submitText.textContent = originalText;
        submitBtn.disabled = false;

        setTimeout(() => {
          formFeedback.style.display = 'none';
        }, 6000);
      }, 600);
    });
  }

  // Initialize Language (if not already set synchronously)
  if (window.I18nManager) {
    const initialLang = window.I18nManager.getInitialLanguage();
    await window.I18nManager.setLanguage(initialLang);
  }
});
