// Voice configuration: LiveKit SFU (recommended, production) or P2P mesh fallback (dev / small groups)
import crypto from 'node:crypto';

let AccessToken = null;
try { ({ AccessToken } = await import('livekit-server-sdk')); } catch { /* optional */ }

const LK_URL = process.env.LIVEKIT_URL || '';
const LK_KEY = process.env.LIVEKIT_API_KEY || '';
const LK_SECRET = process.env.LIVEKIT_API_SECRET || '';

export function voiceConfig() {
  if (LK_URL && LK_KEY && LK_SECRET && AccessToken) return { mode: 'livekit', url: LK_URL };
  return { mode: 'mesh' };
}

// ICE servers for the mesh fallback. Supports static TURN creds or coturn "use-auth-secret" (REST API) creds.
export function iceServers(playerId) {
  const list = [{ urls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302').split(',') }];
  const turn = process.env.TURN_URLS ? process.env.TURN_URLS.split(',') : null;
  if (turn) {
    if (process.env.TURN_SECRET) {
      const username = `${Math.floor(Date.now() / 1000) + 12 * 3600}:${playerId}`;
      const credential = crypto.createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64');
      list.push({ urls: turn, username, credential });
    } else list.push({ urls: turn, username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' });
  }
  return list;
}

export async function livekitToken(room, player) {
  if (!AccessToken || !LK_KEY) return null;
  const at = new AccessToken(LK_KEY, LK_SECRET, { identity: player.id, name: player.name, ttl: '6h' });
  at.addGrant({ roomJoin: true, room: `bb_${room.code}`, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: ['microphone'] });
  return await at.toJwt();
}
