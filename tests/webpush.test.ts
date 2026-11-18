import assert from 'node:assert/strict';
import test from 'node:test';

import {
  base64UrlDecode,
  base64UrlEncode,
  encryptPayload,
  generateVapidKeys,
  vapidAuthorization,
} from '../supabase/functions/push/webpush.ts';

// RFC 8291 附录 A 的示例数据
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

function jwkFromRaw(publicKey: string, privateKey?: string): JsonWebKey {
  const raw = base64UrlDecode(publicKey);
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(raw.slice(1, 33)),
    y: base64UrlEncode(raw.slice(33, 65)),
    ...(privateKey ? { d: privateKey } : {}),
  };
}

async function importEcdhPair(publicKey: string, privateKey: string): Promise<CryptoKeyPair> {
  const algorithm = { name: 'ECDH', namedCurve: 'P-256' };
  return {
    publicKey: await crypto.subtle.importKey('raw', base64UrlDecode(publicKey), algorithm, true, []),
    privateKey: await crypto.subtle.importKey('jwk', jwkFromRaw(publicKey, privateKey), algorithm, true, ['deriveBits']),
  };
}

/** 浏览器那一侧的解密（按 RFC 8291 独立实现），用来验证加密结果 */
async function decrypt(body: Uint8Array, uaPair: CryptoKeyPair, uaPublic: string, auth: string) {
  const hmac = async (key: Uint8Array, data: Uint8Array) => new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    await crypto.subtle.importKey('raw', Uint8Array.from(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    Uint8Array.from(data)
  ));
  const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));
  const utf8 = (value: string) => new TextEncoder().encode(value);
  const salt = body.slice(0, 16);
  const idLength = body[20];
  const serverPublic = body.slice(21, 21 + idLength);
  const ciphertext = body.slice(21 + idLength);
  const serverKey = await crypto.subtle.importKey('raw', Uint8Array.from(serverPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, uaPair.privateKey, 256));
  const prkKey = await hmac(base64UrlDecode(auth), shared);
  const ikm = (await hmac(prkKey, join(utf8('WebPush: info\0'), base64UrlDecode(uaPublic), serverPublic, Uint8Array.of(1)))).slice(0, 32);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, join(utf8('Content-Encoding: aes128gcm\0'), Uint8Array.of(1)))).slice(0, 16);
  const nonce = (await hmac(prk, join(utf8('Content-Encoding: nonce\0'), Uint8Array.of(1)))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, Uint8Array.from(ciphertext)));
  assert.equal(padded[padded.length - 1], 2);
  return new TextDecoder().decode(padded.slice(0, -1));
}

test('encryption matches the RFC 8291 example byte for byte', async () => {
  const serverKeys = await importEcdhPair(RFC.asPublic, RFC.asPrivate);
  const body = await encryptPayload(RFC.uaPublic, RFC.auth, new TextEncoder().encode(RFC.plaintext), {
    serverKeys,
    salt: base64UrlDecode(RFC.salt),
  });
  assert.equal(base64UrlEncode(body), RFC.body);
});

test('a browser key pair can decrypt what we send', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublic = base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey)));
  const auth = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const message = JSON.stringify({ title: '小林提醒你', body: '记得倒垃圾 🗑️' });
  const body = await encryptPayload(uaPublic, auth, new TextEncoder().encode(message));
  assert.equal(await decrypt(body, ua, uaPublic, auth), message);
});

test('VAPID header is a valid ES256 JWT for the push service origin', async () => {
  const keys = await generateVapidKeys();
  assert.equal(base64UrlDecode(keys.publicKey).length, 65);
  const now = Date.UTC(2026, 10, 17, 12, 0, 0);
  const header = await vapidAuthorization('https://web.push.apple.com/QGuQyavXut', keys, 'https://example.supabase.co', now);
  const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
  assert.ok(match);
  const [, head, claims, signature, k] = match;
  assert.equal(k, keys.publicKey);
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(claims)));
  assert.equal(payload.aud, 'https://web.push.apple.com');
  assert.equal(payload.exp, now / 1000 + 12 * 3600);
  const verifyKey = await crypto.subtle.importKey('raw', base64UrlDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    verifyKey,
    base64UrlDecode(signature),
    new TextEncoder().encode(`${head}.${claims}`)
  );
  assert.equal(valid, true);
});
