import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { getPool } from '../db';
import { signToken, verifyToken } from '../auth';

export const googleAuthRouter = Router();

const getGoogleClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');
  return new OAuth2Client(clientId);
};

async function resolveGoogleProfile(credential: string, tokenType?: string): Promise<{ email: string; name?: string; picture?: string; googleId: string }> {
  if (tokenType === 'access_token') {
    // Exchange access_token for user info via Google's userinfo endpoint
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${credential}` },
    });
    if (!resp.ok) throw new Error('Failed to fetch Google user info');
    const info = await resp.json() as { email?: string; name?: string; picture?: string; sub?: string };
    if (!info.email) throw new Error('No email in Google user info');
    return { email: info.email, name: info.name, picture: info.picture, googleId: info.sub || '' };
  }

  // Default: verify id_token
  const client = getGoogleClient();
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email) throw new Error('Invalid Google token');
  return { email: payload.email, name: payload.name, picture: payload.picture, googleId: payload.sub! };
}

googleAuthRouter.post('/google', async (req, res) => {
  try {
    const { credential, clientUserId, tokenType } = req.body;
    if (!credential) {
      res.status(400).json({ error: 'credential is required' });
      return;
    }

    const { email, name, picture, googleId } = await resolveGoogleProfile(credential, tokenType);
    const pool = getPool();

    // Check if user already exists by email
    const existing = await pool.query(
      'SELECT id, email, name, avatar_url, google_id FROM users WHERE email = $1',
      [email],
    );

    let userId: string;

    if (existing.rows.length > 0) {
      // Existing user — update last login and profile
      userId = existing.rows[0].id;
      await pool.query(
        'UPDATE users SET last_login_at = NOW(), name = COALESCE($1, name), avatar_url = COALESCE($2, avatar_url) WHERE id = $3',
        [name, picture, userId],
      );
    } else {
      // New user — use the client's current openclaw-user-id to maintain data continuity
      userId = clientUserId || crypto.randomUUID();
      await pool.query(
        'INSERT INTO users (id, email, name, avatar_url, google_id) VALUES ($1, $2, $3, $4, $5)',
        [userId, email, name || '', picture || '', googleId],
      );
    }

    const token = signToken({ userId, email });

    res.json({
      token,
      user: {
        id: userId,
        email,
        name: name || '',
        avatarUrl: picture || '',
      },
    });
  } catch (err: any) {
    console.error('[auth] Google login error:', err.message);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

// Verify current token and return user info
googleAuthRouter.get('/me', async (req, res) => {
  const bearer = req.headers['authorization'];
  if (!bearer?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const payload = verifyToken(bearer.slice(7));
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const pool = getPool();
  const result = await pool.query(
    'SELECT id, email, name, avatar_url FROM users WHERE id = $1',
    [payload.userId],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = result.rows[0];
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
    },
  });
});
