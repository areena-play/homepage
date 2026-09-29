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
  let turnstileWidgetId = null;
  
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

    // Refresh turnstile theme if present
    if (window.turnstile && turnstileWidgetId !== null) {
      try {
        window.turnstile.reset(turnstileWidgetId);
      } catch (e) {}
    }
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

    // Sync language when navigating via browser back/forward history
    window.addEventListener('popstate', async () => {
      if (window.I18nManager) {
        const lang = window.I18nManager.getInitialLanguage();
        await window.I18nManager.setLanguage(lang, false);
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

  // Contact Form Handling (Submit to /api/contact with Honeypot & Turnstile)
  const contactForm = document.getElementById('contact-form');
  const formFeedback = document.getElementById('form-feedback');
  const submitBtn = document.getElementById('submit-btn');

  if (contactForm && formFeedback && submitBtn) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitText = submitBtn.querySelector('span');
      const originalText = submitText ? submitText.textContent : 'Send Message';
      const curDict = window.I18nManager ? window.I18nManager.getLoadedDictionary() : null;
      const sendingText = curDict?.contact?.sendingBtn || 'Sending...';

      const name = document.getElementById('name').value;
      const email = document.getElementById('email').value;
      const subject = document.getElementById('subject').value;
      const message = document.getElementById('message').value;
      const _hp_website = document.getElementById('hp-website')?.value || '';

      // Get Turnstile token if widget exists
      let turnstileToken = '';
      if (window.turnstile && turnstileWidgetId !== null) {
        turnstileToken = window.turnstile.getResponse(turnstileWidgetId) || '';
      }

      if (submitText) submitText.textContent = sendingText;
      submitBtn.disabled = true;

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, subject, message, _hp_website, turnstileToken })
        });
        const result = await res.json();

        if (res.ok) {
          formFeedback.className = 'form-feedback success';
          formFeedback.style.display = 'block';
          formFeedback.style.backgroundColor = '';
          formFeedback.style.borderColor = '';
          formFeedback.style.color = '';
          formFeedback.textContent = curDict?.contact?.successMsg || 'Thank you! Your message has been received.';
          contactForm.reset();
          if (window.turnstile && turnstileWidgetId !== null) {
            window.turnstile.reset(turnstileWidgetId);
          }
        } else {
          formFeedback.className = 'form-feedback error';
          formFeedback.style.display = 'block';
          formFeedback.style.backgroundColor = '';
          formFeedback.style.borderColor = '';
          formFeedback.style.color = '';
          formFeedback.textContent = result.error || 'Failed to send message. Please try again.';
          if (window.turnstile && turnstileWidgetId !== null) {
            window.turnstile.reset(turnstileWidgetId);
          }
        }
      } catch (err) {
        formFeedback.className = 'form-feedback error';
        formFeedback.style.display = 'block';
        formFeedback.style.backgroundColor = '';
        formFeedback.style.borderColor = '';
        formFeedback.style.color = '';
        formFeedback.textContent = 'Network error while sending message. Please try again.';
      } finally {
        if (submitText) submitText.textContent = originalText;
        submitBtn.disabled = false;
        setTimeout(() => {
          formFeedback.style.display = 'none';
        }, 7000);
      }
    });
  }

  // Initialize Language
  if (window.I18nManager) {
    const initialLang = window.I18nManager.getInitialLanguage();
    await window.I18nManager.setLanguage(initialLang);
  }

  // --- Platform Status, Turnstile & Setup Check ---
  try {
    const statusRes = await fetch('/api/status');
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      
      // Dynamic Status Section Visibility
      const statusSection = document.getElementById('status');
      const statusNavLinks = document.querySelectorAll('a[href*="#status"]');
      if (statusData.showStatusSection === false) {
        if (statusSection) statusSection.style.display = 'none';
        statusNavLinks.forEach(link => {
          const parentLi = link.closest('li');
          if (parentLi) parentLi.style.display = 'none';
          else link.style.display = 'none';
        });
      } else {
        if (statusSection) statusSection.style.display = '';
        statusNavLinks.forEach(link => {
          const parentLi = link.closest('li');
          if (parentLi) parentLi.style.display = '';
          else link.style.display = '';
        });
      }

      // 1. First-Time Setup Prompt
      if (statusData.needsSetup && !window.location.pathname.startsWith('/admin')) {
        const curDict = window.I18nManager ? window.I18nManager.getLoadedDictionary() : null;
        const title = curDict?.setupPrompt?.title || 'Initial Setup Required';
        const desc = curDict?.setupPrompt?.desc || 'No admin account has been configured yet. Set up the primary administrator account to secure the platform.';
        const btn = curDict?.setupPrompt?.button || 'Configure Admin Now';

        const promptBanner = document.createElement('div');
        promptBanner.style.cssText = `
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          z-index: 999;
          background: #111728;
          border: 1px solid var(--accent-cyan);
          border-radius: var(--radius-md);
          padding: 1.5rem;
          max-width: 380px;
          box-shadow: 0 15px 40px rgba(0,0,0,0.7), var(--accent-glow);
          animation: slideUp 0.4s ease;
        `;
        promptBanner.innerHTML = `
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--accent-cyan); margin-bottom: 0.35rem; text-transform: uppercase;">⚡ Admin Notice</div>
          <div style="font-weight: 700; font-size: 1rem; margin-bottom: 0.4rem;">${title}</div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.5;">${desc}</p>
          <a href="/admin" class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.85rem; width: 100%;">${btn}</a>
        `;
        document.body.appendChild(promptBanner);
      }

      // 2. Cloudflare Turnstile Dynamic Widget Mounting
      if (statusData.turnstileSiteKey) {
        const turnstileContainer = document.getElementById('turnstile-container');
        if (turnstileContainer) {
          turnstileContainer.style.display = 'flex';

          const renderWidget = () => {
            if (window.turnstile) {
              const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
              turnstileWidgetId = window.turnstile.render('#turnstile-container', {
                sitekey: statusData.turnstileSiteKey,
                theme: activeTheme,
                appearance: 'always'
              });
            }
          };

          if (!window.turnstile) {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            script.onload = renderWidget;
            document.head.appendChild(script);
          } else {
            renderWidget();
          }
        }
      }

      // 3. Social Media Links Dynamic Rendering
      if (statusData.socialLinks) {
        const { instagramUrl, linkedinUrl } = statusData.socialLinks;
        const hasSocial = Boolean(instagramUrl || linkedinUrl);

        const renderPill = (platform, url) => {
          if (!url) return '';
          if (platform === 'instagram') {
            return `
              <a href="${url}" target="_blank" rel="noopener noreferrer" class="social-pill social-pill-instagram" aria-label="Follow AREENA on Instagram">
                <svg class="social-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                </svg>
                <span>Instagram</span>
              </a>
            `;
          }
          if (platform === 'linkedin') {
            return `
              <a href="${url}" target="_blank" rel="noopener noreferrer" class="social-pill social-pill-linkedin" aria-label="Connect with AREENA on LinkedIn">
                <svg class="social-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.63 1.63 0 0 0-1.63 1.63c0 .9.73 1.63 1.63 1.63.9 0 1.63-.73 1.63-1.63 0-.9-.73-1.63-1.63-1.63Z"/>
                </svg>
                <span>LinkedIn</span>
              </a>
            `;
          }
          return '';
        };

        const renderIconBtn = (platform, url) => {
          if (!url) return '';
          if (platform === 'instagram') {
            return `
              <a href="${url}" target="_blank" rel="noopener noreferrer" class="social-icon-btn social-icon-instagram" aria-label="AREENA on Instagram" title="Instagram">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                </svg>
              </a>
            `;
          }
          if (platform === 'linkedin') {
            return `
              <a href="${url}" target="_blank" rel="noopener noreferrer" class="social-icon-btn social-icon-linkedin" aria-label="AREENA on LinkedIn" title="LinkedIn">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.63 1.63 0 0 0-1.63 1.63c0 .9.73 1.63 1.63 1.63.9 0 1.63-.73 1.63-1.63 0-.9-.73-1.63-1.63-1.63Z"/>
                </svg>
              </a>
            `;
          }
          return '';
        };

        // 1. Hero Social Links
        const heroSocial = document.getElementById('hero-social-links');
        if (heroSocial) {
          if (hasSocial) {
            heroSocial.innerHTML = renderPill('instagram', instagramUrl) + renderPill('linkedin', linkedinUrl);
            heroSocial.style.display = 'flex';
          } else {
            heroSocial.style.display = 'none';
          }
        }

        // 2. Contact Card Social Media Section
        const contactSocialItem = document.getElementById('contact-social-item');
        const contactSocialPills = document.getElementById('contact-social-pills');
        if (contactSocialItem && contactSocialPills) {
          if (hasSocial) {
            contactSocialPills.innerHTML = renderPill('instagram', instagramUrl) + renderPill('linkedin', linkedinUrl);
            contactSocialItem.style.display = 'flex';
          } else {
            contactSocialItem.style.display = 'none';
          }
        }

        // 3. Footer Social Links
        const footerSocial = document.getElementById('footer-social-links');
        if (footerSocial) {
          if (hasSocial) {
            footerSocial.innerHTML = renderIconBtn('instagram', instagramUrl) + renderIconBtn('linkedin', linkedinUrl);
            footerSocial.style.display = 'flex';
          } else {
            footerSocial.style.display = 'none';
          }
        }
      }
    }
  } catch (e) {}
});
