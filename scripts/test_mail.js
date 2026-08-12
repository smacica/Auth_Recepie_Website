#!/usr/bin/env node
//Checks the SMTP settings in .env and sends one real email.
//   npm run mail:test -- you@example.com
require('dotenv').config()
const { verifyTransport, sendVerificationEmail } = require('../mailer')

const to = process.argv[2]

async function main(){
  console.log('host   :', process.env.SMTP_HOST || '(not set)')
  console.log('port   :', process.env.SMTP_PORT || '587 (default)')
  console.log('user   :', process.env.SMTP_USER || '(not set)')
  console.log('from   :', process.env.MAIL_FROM || '(default)')
  console.log('')

  const check = await verifyTransport()
  if(!check.ok){
    console.error('✗ could not connect:', check.reason)
    console.error('')
    console.error('  timed out?      the host blocks this port - try 2587 or 2465')
    console.error('  auth failed?    for gmail SMTP_PASS must be an app password, not your login')
    console.error('  host not found? check SMTP_HOST for typos')
    process.exit(1)
  }
  console.log(`✓ connected to ${check.host}:${check.port} (${check.secure ? 'implicit TLS' : 'STARTTLS'})`)

  if(!to){
    console.log('')
    console.log('Pass an address to send a real test email:')
    console.log('  npm run mail:test -- you@example.com')
    return
  }

  const result = await sendVerificationEmail(to, 'https://example.com/verify-email?token=test-link')
  if(result.delivered){
    console.log(`✓ sent to ${to} - check the inbox, and the spam folder`)
  }else{
    console.log('✗ nothing was sent, SMTP is not configured')
    process.exit(1)
  }
}

main().catch(err=>{
  console.error('✗ failed:', err.message)
  process.exit(1)
})
