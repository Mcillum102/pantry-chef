// Web Push（RFC 8291 加密 + RFC 8292 VAPID），只用 WebCrypto 和 fetch，
// 同一份代码在 Supabase Edge Function (Deno) 和本地 Node 测试里都能跑。

type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const RECORD_SIZE = 4096;

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Bytes {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const text = (value: string): Bytes => Uint8Array.from(encoder.encode(value));

async function hmacSha256(key: Bytes, data: Bytes): Promise<Bytes> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data));
}

/** HKDF：先 extract 再 expand，输出长度不超过 32 字节 */
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const prk = await hmacSha256(salt, ikm);
  return (await hmacSha256(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

export type VapidKeys = {
  /** 未压缩的 P-256 公钥（65 字节）的 base64url，给浏览器的 applicationServerKey 用 */
  publicKey: string;
  privateJwk: JsonWebKey;
};

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: base64UrlEncode(raw), privateJwk };
}

/** VAPID 授权头：Authorization: vapid t=<JWT>, k=<公钥> */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()) {
  const header = base64UrlEncode(text(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64UrlEncode(text(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: subject,
  })));
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    { ...keys.privateJwk, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, text(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${base64UrlEncode(signature)}, k=${keys.publicKey}`;
}

/**
 * 按 RFC 8291 (aes128gcm) 加密推送内容。
 * p256dh / auth 来自浏览器的 PushSubscription；serverKeys / salt 只在测试里指定。
 */
export async function encryptPayload(
  p256dh: string,
  authSecret: string,
  plaintext: Uint8Array,
  options: { serverKeys?: CryptoKeyPair; salt?: Bytes } = {}
): Promise<Bytes> {
  if (plaintext.length > RECORD_SIZE - 17) throw new Error('push-payload-too-large');
  const userAgentPublic = base64UrlDecode(p256dh);
  const auth = base64UrlDecode(authSecret);
  const serverKeys = options.serverKeys
    ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const userAgentKey = await crypto.subtle.importKey('raw', userAgentPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: userAgentKey }, serverKeys.privateKey, 256));

  const ikm = await hkdf(auth, ecdhSecret, concat(text('WebPush: info\0'), userAgentPublic, serverPublic), 32);
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, ikm, text('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, text('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  // 只有一条记录：内容后面跟 0x02 表示最后一条
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    concat(plaintext, new Uint8Array([2]))
  ));

  const header = new Uint8Array(16 + 4 + 1 + serverPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = serverPublic.length;
  header.set(serverPublic, 21);
  return concat(header, ciphertext);
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type PushMessage = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/** 发送一条推送，返回推送服务的 HTTP 状态码（201 成功；404 / 410 表示这个订阅已失效） */
export async function sendWebPush(target: PushTarget, message: PushMessage, keys: VapidKeys, subject: string) {
  const body = await encryptPayload(target.p256dh, target.auth, text(JSON.stringify(message)));
  const response = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(24 * 60 * 60),
      Urgency: 'high',
      Authorization: await vapidAuthorization(target.endpoint, keys, subject),
    },
    body,
  });
  const detail = response.ok ? '' : (await response.text().catch(() => '')).slice(0, 300);
  return { status: response.status, detail };
}
