const { getTurnstileSettings } = require('./db');

async function verifyTurnstileToken(token, remoteIp) {
  const { turnstileSecretKey } = getTurnstileSettings();
  
  // If secret key is not set, Turnstile is optional/disabled
  if (!turnstileSecretKey) {
    return { success: true, bypassed: true };
  }

  if (!token) {
    return { success: false, error: 'CAPTCHA token missing. Please complete the security challenge.' };
  }

  const formData = new URLSearchParams();
  formData.append('secret', turnstileSecretKey);
  formData.append('response', token);
  if (remoteIp) {
    formData.append('remoteip', remoteIp);
  }

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const data = await res.json();
    if (data.success) {
      return { success: true, hostname: data.hostname, action: data.action };
    } else {
      return {
        success: false,
        error: 'Security challenge verification failed. Please try again.',
        errorCodes: data['error-codes']
      };
    }
  } catch (err) {
    console.error('[Turnstile Verify Error]:', err.message);
    return { success: false, error: 'Security challenge server unreachable.' };
  }
}

module.exports = {
  verifyTurnstileToken
};

