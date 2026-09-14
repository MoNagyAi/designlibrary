const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function cors(origin, allowed) {
  const ok = origin === allowed;
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed,
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToBuffer(pem) {
  const normalized = pem.replace(/\\n/g, '\n');
  const body = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

async function accessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  };

  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(env.FIREBASE_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  const assertion = unsigned + '.' + b64url(new Uint8Array(signature));

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!response.ok) {
    throw new Error('OAuth token request failed: ' + await response.text());
  }

  return (await response.json()).access_token;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://monagyai.github.io';
    const headers = cors(origin, allowedOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
    }

    if (origin && origin !== allowedOrigin) {
      return Response.json({ error: 'Origin not allowed' }, { status: 403, headers });
    }

    const adminKey = request.headers.get('X-Admin-Key') || '';
    if (!env.ADMIN_KEY || adminKey !== env.ADMIN_KEY) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400, headers });
    }

    const topic = ['all', 'lang_ar', 'lang_en'].includes(body.topic) ? body.topic : 'all';
    const title = String(body.title || '').trim().slice(0, 80);
    const messageBody = String(body.body || '').trim().slice(0, 300);
    const url = String(body.url || '').trim().slice(0, 1000);

    if (!title || !messageBody) {
      return Response.json({ error: 'Title and body are required' }, { status: 400, headers });
    }

    try {
      const token = await accessToken(env);
      const endpoint = `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`;
      const payload = {
        message: {
          topic,
          data: {
            title,
            body: messageBody,
            url
          },
          android: {
            priority: 'HIGH',
            ttl: '86400s'
          }
        }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      if (!response.ok) {
        return Response.json({ error: text || 'FCM send failed' }, { status: 502, headers });
      }

      return Response.json({ ok: true, topic, result: JSON.parse(text) }, { headers });
    } catch (error) {
      return Response.json({ error: String(error?.message || error) }, { status: 500, headers });
    }
  }
};
