const nodemailer = require('nodemailer')

const from = process.env.MAIL_FROM || 'EatHub <no-reply@eathub.local>'
const configured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

if (!configured) {
  console.warn('SMTP_* are not set, verification links will be printed to this console instead of emailed. See README.md')
}

const port = Number(process.env.SMTP_PORT || 587)

//465 speaks TLS from the first byte, 587 upgrades with STARTTLS. Hosts that block
//the standard ports (DigitalOcean does) are reached on 2465 and 2587, which behave
//like 465 and 587 respectively. SMTP_SECURE overrides the guess if a provider differs.
const secure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === 'true'
  : port === 465 || port === 2465

const transport = configured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null

//surfaces a bad host, port or password now instead of when someone first signs up
async function verifyTransport() {
  if (!transport) {
    return { ok: false, reason: 'SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS)' }
  }
  try {
    await transport.verify()
    return { ok: true, host: process.env.SMTP_HOST, port, secure }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

function verificationEmail(link) {
  return {
    subject: 'Confirm your EatHub address',
    text: `Welcome to EatHub.\n\nConfirm your email address by opening this link:\n${link}\n\nThe link is good for 24 hours. If you did not sign up, ignore this message.`,
    html: `<p>Welcome to EatHub.</p>
<p>Confirm your email address:</p>
<p><a href="${link}" style="background:#d2551e;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-family:sans-serif">Confirm my address</a></p>
<p style="color:#6b5647;font-family:sans-serif;font-size:13px">The link is good for 24 hours. If you did not sign up, ignore this message.</p>`
  }
}

async function sendVerificationEmail(to, link) {
  const message = verificationEmail(link)

  //without smtp credentials there is nowhere to send, so make the link usable anyway
  if (!transport) {
    console.log(`\n--- verification link for ${to} ---\n${link}\n---\n`)
    return { delivered: false }
  }

  await transport.sendMail({ from, to, ...message })
  return { delivered: true }
}

module.exports = { sendVerificationEmail, verifyTransport, mailConfigured: configured }
