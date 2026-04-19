// Google OAuth 2.0 — exchange a long-lived refresh_token for a short-lived
// access_token. One token works for both Gmail and Calendar scopes provided
// the refresh_token was issued against both.

export async function getAccessToken() {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
  const refreshToken = requireEnv('GOOGLE_REFRESH_TOKEN');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`OAuth token refresh failed ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth response missing access_token: ${JSON.stringify(data)}`);
  return data.access_token;
}

function requireEnv(k) {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env: ${k}`);
  return v;
}
