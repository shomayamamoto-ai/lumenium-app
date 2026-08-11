// Gmail send via OAuth2 refresh token. No external SDK.
//
// Required env:
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER
// Obtain the refresh token via Google's OAuth 2.0 Playground with the
// scope https://www.googleapis.com/auth/gmail.send, using your own
// OAuth client credentials.

import { env } from './util.mjs';

async function accessToken() {
  const body = new URLSearchParams({
    client_id: env('GMAIL_CLIENT_ID'),
    client_secret: env('GMAIL_CLIENT_SECRET'),
    refresh_token: env('GMAIL_REFRESH_TOKEN'),
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Gmail token ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

function encodeHeader(value) {
  // RFC 2047 encoded-word for non-ASCII subjects / names.
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const b64 = Buffer.from(value, 'utf8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

function base64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildRfc822({ from, to, subject, html, text }) {
  const boundary = `bnd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text ?? '', 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html ?? '', 'utf8').toString('base64'),
    `--${boundary}--`,
    '',
  ];
  return lines.join('\r\n');
}

export async function sendMail({ to, subject, html, text }) {
  const token = await accessToken();
  const sender = env('GMAIL_SENDER');
  const raw = base64Url(Buffer.from(buildRfc822({
    from: sender,
    to,
    subject,
    html,
    text: text ?? html.replace(/<[^>]+>/g, ''),
  }), 'utf8'));

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send ${res.status}: ${await res.text()}`);
  return res.json();
}
