// 打包 / 发布网页版之前的检查。
// 少了 Supabase 地址、Key 或厨房邮箱，App 会悄悄变成「只存本机」：两台手机各存各的，互相看不到消息。
//   node scripts/check-web-env.mjs        检查 .env / 环境变量（打包前）
//   node scripts/check-web-env.mjs dist   检查打好的包里有没有云端地址（发布前）
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_KITCHEN_EMAIL'];

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function readDotEnv() {
  const values = {};
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && match[2]) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  return values;
}

function filesIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)]
  );
}

const fileValues = readDotEnv();
const value = (name) => process.env[name] || fileValues[name] || '';

if (process.argv[2] === 'dist') {
  const dir = join('dist', 'client', '_expo', 'static', 'js', 'web');
  if (!existsSync(dir)) fail('还没打包：先运行 npm run web:export');
  const url = value('EXPO_PUBLIC_SUPABASE_URL') || '.supabase.co';
  const bundled = filesIn(dir).some((file) => file.endsWith('.js') && readFileSync(file, 'utf8').includes(url));
  if (!bundled) fail('打好的包里没有 Supabase 地址（会变成只存本机）。检查 .env 后重新运行 npm run web:export');
  console.log('✓ 网页包已连接云端');
} else {
  const missing = REQUIRED.filter((name) => !value(name) || /your-|example\.com/.test(value(name)));
  if (missing.length) fail(`缺少 ${missing.join('、')}。复制 .env.example 为 .env 并填好再打包`);
  console.log('✓ 云端配置齐全');
}
