// Supabase Edge Function：给两台 iPhone（主屏幕 App）发 Web Push。
//
// 请求类型（POST JSON）：
//   { type: 'public-key' }              返回推送公钥（公开信息，App 订阅时要用）；第一次调用时生成密钥
//   { type: 'test', member }            给自己发一条测试通知（需要登录态 Authorization）
//   { type: 'nudge', nudgeId }          有人发了消息 → 推给对方（数据库触发器调用，需要 x-push-secret）
//   { type: 'tick' }                    每分钟检查该推送的提醒 / 日程（pg_cron 调用，需要 x-push-secret）
//
// 密钥都在数据库 public.push_config 里（只有服务端能读），不经过 App 也不需要手动配置。
import { createClient } from 'npm:@supabase/supabase-js@2';

import { addDays, dueNotifications, localClock, notificationBody, DEFAULT_TIME_ZONE, type MemberId, type ScheduledReminder } from './schedule.ts';
import { generateVapidKeys, sendWebPush, type PushMessage, type VapidKeys } from './webpush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') || SUPABASE_URL;
const MEMBER_NAMES: Record<MemberId, string> = {
  a: Deno.env.get('MEMBER_A_NAME') || '丁丁',
  b: Deno.env.get('MEMBER_B_NAME') || '小林',
};

const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function readConfig(key: string) {
  const { data, error } = await admin.from('push_config').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return (data?.value as string | undefined) ?? null;
}

let vapidCache: VapidKeys | null = null;

/** 读取推送密钥；还没有就生成一对存起来（两个请求同时生成时以先写入的为准） */
async function vapidKeys(): Promise<VapidKeys> {
  if (vapidCache) return vapidCache;
  const stored = await readConfig('vapid_keys');
  if (stored) return (vapidCache = JSON.parse(stored) as VapidKeys);
  const fresh = await generateVapidKeys();
  const { error } = await admin.from('push_config').insert({ key: 'vapid_keys', value: JSON.stringify(fresh) });
  if (error && error.code !== '23505') throw error;
  const winner = await readConfig('vapid_keys');
  return (vapidCache = JSON.parse(winner ?? JSON.stringify(fresh)) as VapidKeys);
}

type SubscriptionRow = {
  id: string; household_id: string; member: MemberId; endpoint: string; p256dh: string; auth: string; timezone: string;
  /** App 正在前台使用到这个时间（期间不推送）；列不存在（migration 没执行）时是 undefined */
  active_until?: string | null;
};

/** 这台设备现在正开着 App：不用推送，免得人在 App 里还弹通知 */
function isActive(subscription: SubscriptionRow, now = Date.now()) {
  return Boolean(subscription.active_until && Date.parse(subscription.active_until) > now);
}

async function subscriptionsFor(householdId: string, member: MemberId) {
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('household_id', householdId)
    .eq('member', member);
  if (error) throw error;
  return (data ?? []) as SubscriptionRow[];
}

/** 推给一组设备；失效的订阅（404 / 410）直接删掉 */
async function deliver(subscriptions: SubscriptionRow[], message: PushMessage, options: { includeActive?: boolean } = {}) {
  const keys = await vapidKeys();
  const targets = options.includeActive ? subscriptions : subscriptions.filter((s) => !isActive(s));
  const results = await Promise.all(targets.map(async (subscription) => {
    try {
      const result = await sendWebPush(subscription, message, keys, SUBJECT);
      if (result.status === 404 || result.status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', subscription.id);
      } else if (result.status >= 200 && result.status < 300) {
        await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', subscription.id);
      } else {
        console.error('push failed', result.status, result.detail);
      }
      return result.status;
    } catch (error) {
      console.error('push error', error instanceof Error ? error.message : String(error));
      return 0;
    }
  }));
  return { sent: results.filter((status) => status >= 200 && status < 300).length, total: results.length, skippedActive: subscriptions.length - targets.length };
}

async function handleNudge(nudgeId: string) {
  const { data: nudge, error } = await admin
    .from('nudges')
    .select('id,household_id,from_member,to_member,message')
    .eq('id', nudgeId)
    .maybeSingle();
  if (error) throw error;
  if (!nudge) return { sent: 0, total: 0 };
  return deliver(await subscriptionsFor(nudge.household_id, nudge.to_member), {
    title: `${MEMBER_NAMES[nudge.from_member as MemberId]}给你发了消息`,
    body: nudge.message,
    url: '/',
    tag: `nudge-${nudge.id}`,
  });
}

async function handleTick() {
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('*');
  if (error) throw error;
  const subs = (subscriptions ?? []) as SubscriptionRow[];
  if (subs.length === 0) return { sent: 0 };

  const householdIds = [...new Set(subs.map((s) => s.household_id))];
  const { data: reminderRows, error: reminderError } = await admin
    .from('reminders')
    .select('id,household_id,kind,title,emoji,due_date,due_time,repeat,assignee,remind_before')
    .in('household_id', householdIds)
    .not('remind_before', 'is', null);
  if (reminderError) throw reminderError;
  const reminders: ScheduledReminder[] = (reminderRows ?? []).map((row) => ({
    id: row.id, householdId: row.household_id, kind: row.kind === 'event' ? 'event' : 'task', title: row.title, emoji: row.emoji,
    dueDate: row.due_date, dueTime: row.due_time, repeat: row.repeat, assignee: row.assignee, remindBefore: row.remind_before,
  }));
  if (reminders.length === 0) return { sent: 0 };

  const now = new Date();
  let sent = 0;
  // 每个家庭的每个人一组；用 TA 第一台设备的时区算「现在几点」
  const groups = new Map<string, SubscriptionRow[]>();
  subs.forEach((s) => groups.set(`${s.household_id}:${s.member}`, [...(groups.get(`${s.household_id}:${s.member}`) ?? []), s]));

  for (const devices of groups.values()) {
    const { household_id: householdId, member } = devices[0];
    const clock = localClock(now, devices[0].timezone || DEFAULT_TIME_ZONE);
    const own = reminders.filter((r) => r.householdId === householdId);
    // 提前提醒最多提前一周多，往后看 9 天的完成记录就够
    const { data: completions } = await admin
      .from('reminder_completions')
      .select('reminder_id,occurrence_date')
      .eq('household_id', householdId)
      .gte('occurrence_date', clock.dateKey)
      .lte('occurrence_date', addDays(clock.dateKey, 9));
    const done = new Set((completions ?? []).map((c) => `${c.reminder_id}:${c.occurrence_date}`));

    for (const { reminder, occurrenceDate, daysAhead } of dueNotifications(own, member, clock, (id, date) => done.has(`${id}:${date}`))) {
      // 先登记再发送：同一条提醒的同一次只推一次
      const { data: claimed, error: claimError } = await admin
        .from('push_deliveries')
        .upsert({ reminder_id: reminder.id, occurrence_date: occurrenceDate, member }, { onConflict: 'reminder_id,occurrence_date,member', ignoreDuplicates: true })
        .select('reminder_id');
      if (claimError) throw claimError;
      if (!claimed || claimed.length === 0) continue;
      const result = await deliver(devices, {
        title: `${reminder.emoji} ${reminder.title}`,
        body: notificationBody(reminder, daysAhead),
        url: '/',
        tag: `reminder-${reminder.id}-${occurrenceDate}`,
      });
      sent += result.sent;
    }
  }
  return { sent };
}

async function handleTest(req: Request, member: MemberId) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!userData.user) return json({ error: 'sign-in-required' }, 401);
  const { data: membership } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return json({ error: 'household-required' }, 403);
  const result = await deliver(await subscriptionsFor(membership.household_id, member), {
    title: '通知已开启 ✅',
    body: `${MEMBER_NAMES[member]}，以后收到消息和到点的提醒都会这样通知你。`,
    url: '/',
    tag: 'push-test',
  }, { includeActive: true });
  return json(result);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  let body: { type?: string; nudgeId?: string; member?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid-json' }, 400);
  }

  try {
    if (body.type === 'public-key') return json({ publicKey: (await vapidKeys()).publicKey });
    if (body.type === 'test') {
      if (body.member !== 'a' && body.member !== 'b') return json({ error: 'invalid-member' }, 400);
      return await handleTest(req, body.member);
    }

    // 下面两种只接受数据库发来的请求
    const secret = await readConfig('webhook_secret');
    if (!secret || req.headers.get('x-push-secret') !== secret) return json({ error: 'forbidden' }, 403);
    if (body.type === 'nudge' && typeof body.nudgeId === 'string') return json(await handleNudge(body.nudgeId));
    if (body.type === 'tick') return json(await handleTick());
    return json({ error: 'unknown-type' }, 400);
  } catch (error) {
    console.error('push function error', error instanceof Error ? error.message : String(error));
    return json({ error: 'internal-error' }, 500);
  }
});
