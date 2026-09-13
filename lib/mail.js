const { getEmailSettings } = require('./db');

async function sendMailgunEmail({ to, from, replyTo, subject, text, html }) {
  const settings = getEmailSettings();
  const { mailgunApiKey, mailgunDomain, mailgunRegion } = settings;

  if (!mailgunApiKey || !mailgunDomain) {
    throw new Error('Mailgun is not configured. Please enter your Mailgun API Key and Domain in the Admin Control Panel.');
  }

  const baseUrl = (mailgunRegion && mailgunRegion.toUpperCase() === 'EU')
    ? 'https://api.eu.mailgun.net/v3'
    : 'https://api.mailgun.net/v3';

  const endpoint = `${baseUrl}/${mailgunDomain}/messages`;

  const sender = from || settings.mailgunSenderEmail || `AREENA Notification <noreply@${mailgunDomain}>`;
  const recipient = to || settings.contactRecipientEmail || 'contact@areena.ch';

  const formData = new URLSearchParams();
  formData.append('from', sender);
  formData.append('to', recipient);
  formData.append('subject', subject || 'New Message from AREENA Contact Form');
  if (text) formData.append('text', text);
  if (html) formData.append('html', html);
  if (replyTo) formData.append('h:Reply-To', replyTo);

  const authHeader = 'Basic ' + Buffer.from(`api:${mailgunApiKey}`).toString('base64');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errMessage = `Mailgun API Error (${response.status}): ${response.statusText}`;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.message) errMessage = `Mailgun Error: ${errJson.message}`;
    } catch (e) {
      if (errorText) errMessage += ` - ${errorText}`;
    }
    throw new Error(errMessage);
  }

  return await response.json();
}

async function sendContactMessage({ name, email, subject, message }) {
  const settings = getEmailSettings();
  const recipient = settings.contactRecipientEmail || 'contact@areena.ch';

  const emailSubject = `[AREENA Contact] ${subject || 'New Inquiry'}`;
  
  const plainText = `
You have received a new contact inquiry from the AREENA website.

Name: ${name}
Email: ${email}
Subject: ${subject}

Message:
--------------------------------------------------
${message}
--------------------------------------------------
Date: ${new Date().toUTCString()}
Reply directly to this email to respond to ${name}.
  `.trim();

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #1e293b;">
      <div style="border-bottom: 2px solid #00f2fe; padding-bottom: 15px; margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0; font-size: 20px;">⚡ AREENA Contact Message</h2>
      </div>
      <p style="margin: 0 0 10px 0;"><strong>Sender Name:</strong> ${name}</p>
      <p style="margin: 0 0 10px 0;"><strong>Sender Email:</strong> <a href="mailto:${email}" style="color: #0284c7;">${email}</a></p>
      <p style="margin: 0 0 15px 0;"><strong>Subject:</strong> ${subject}</p>
      <div style="background-color: #f8fafc; border-left: 4px solid #00f2fe; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
        <p style="margin: 0; white-space: pre-wrap; font-size: 15px; line-height: 1.6;">${message}</p>
      </div>
      <div style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        Delivered to <strong>${recipient}</strong> via AREENA Mailgun Service • ${new Date().toUTCString()}
      </div>
    </div>
  `;

  // If Mailgun is configured, send the real email
  if (settings.mailgunApiKey && settings.mailgunDomain) {
    return await sendMailgunEmail({
      to: recipient,
      replyTo: `${name} <${email}>`,
      subject: emailSubject,
      text: plainText,
      html: htmlContent
    });
  } else {
    // If not yet configured, log to server console and return simulated success
    console.log(`\n📨 [CONTACT FORM RECEIVED - Mailgun Not Configured]`);
    console.log(`  To:      ${recipient}`);
    console.log(`  From:    ${name} <${email}>`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Message: ${message}\n`);
    return { simulated: true, recipient };
  }
}

async function sendPasswordResetEmail({ to, username, resetUrl }) {
  const settings = getEmailSettings();
  const subject = '[AREENA] Password Reset Request';

  const plainText = `
Hello ${username || 'Admin'},

We received a request to reset your password for your AREENA Control Panel account.

Click the following link to reset your password:
${resetUrl}

This link is valid for 1 hour.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

Best regards,
The AREENA Team
  `.trim();

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff; color: #1e293b;">
      <div style="border-bottom: 2px solid #00f2fe; padding-bottom: 16px; margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0; font-size: 22px;">🔐 AREENA Password Reset</h2>
      </div>
      <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Hello <strong>${username || 'Admin'}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
        We received a request to reset the password for your AREENA Admin account. Click the button below to choose a new password:
      </p>
      <div style="text-align: center; margin-bottom: 28px;">
        <a href="${resetUrl}" style="display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px;">Reset My Password</a>
      </div>
      <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 16px;">
        Or copy and paste this link into your browser:<br>
        <a href="${resetUrl}" style="color: #0284c7; word-break: break-all;">${resetUrl}</a>
      </p>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-bottom: 0;">
        ⚠️ This reset link will expire in <strong>1 hour</strong>. If you did not request this change, you can safely ignore this email.
      </p>
    </div>
  `;

  if (settings.mailgunApiKey && settings.mailgunDomain) {
    return await sendMailgunEmail({
      to,
      subject,
      text: plainText,
      html: htmlContent
    });
  } else {
    console.log(`\n🔐 [PASSWORD RESET REQUEST - Mailgun Not Configured]`);
    console.log(`  To:        ${to} (${username})`);
    console.log(`  Reset URL: ${resetUrl}\n`);
    return { simulated: true, to, resetUrl };
  }
}

module.exports = {
  sendMailgunEmail,
  sendContactMessage,
  sendPasswordResetEmail
};

