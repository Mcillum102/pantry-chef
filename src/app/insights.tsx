import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { Colors } from '@/constants/theme';
import { useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import { formatAmount, localizeContent } from '@/data/content-translations';
import { formatQuantity, type InventoryTransaction } from '@/data/kitchen-data';

type DisposalReason = 'finished' | 'expired' | 'discarded';

const reasonMeta: Record<DisposalReason, { emoji: string; zh: string; en: string; color: string; background: string }> = {
  finished: { emoji: '😋', zh: '正常吃完', en: 'Finished', color: Colors.light.primary, background: '#E9F4EC' },
  expired: { emoji: '⏰', zh: '过期丢弃', en: 'Expired', color: Colors.light.danger, background: Colors.light.dangerSoft },
  discarded: { emoji: '🗑️', zh: '其他丢弃', en: 'Discarded', color: Colors.light.warning, background: Colors.light.warningSoft },
};

function isDisposalTransaction(transaction: InventoryTransaction): transaction is InventoryTransaction & { reason: DisposalReason } {
  return transaction.reason === 'finished' || transaction.reason === 'expired' || transaction.reason === 'discarded';
}

export default function SavingsInsightsScreen() {
  const router = useRouter();
  const { transactions, inventory } = useKitchen();
  const { language, locale, text } = useLanguage();
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);

  const disposalTransactions = useMemo(() => {
    const start = Date.now() - rangeDays * 86_400_000;
    return transactions
      .filter(isDisposalTransaction)
      .filter((transaction) => new Date(transaction.createdAt).getTime() >= start);
  }, [rangeDays, transactions]);

  const finished = disposalTransactions.filter((item) => item.reason === 'finished');
  const expired = disposalTransactions.filter((item) => item.reason === 'expired');
  const discarded = disposalTransactions.filter((item) => item.reason === 'discarded');
  const wastedCount = expired.length + discarded.length;
  const saveRate = disposalTransactions.length > 0
    ? Math.round((finished.length / disposalTransactions.length) * 100)
    : 100;
  const expiringNow = inventory.filter((item) => item.quantity > 0 && item.daysLeft <= 3).length;

  const reasonCounts: Record<DisposalReason, number> = {
    finished: finished.length,
    expired: expired.length,
    discarded: discarded.length,
  };
  const maxReasonCount = Math.max(...Object.values(reasonCounts), 1);

  return (
    <AppScreen
      eyebrow={text('减少浪费', 'REDUCE WASTE')}
      title={text('节约报告', 'Savings report')}
      subtitle={text('记录物品最后的去向，看看这段时间减少了多少浪费。', 'Track where food went and see how much waste you avoided.')}
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('返回首页', 'Back to home')}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="close" size={23} color={Colors.light.text} />
        </Pressable>
      }>
      <View style={styles.rangeTabs}>
        {([7, 30] as const).map((days) => (
          <Pressable
            key={days}
            accessibilityRole="radio"
            accessibilityState={{ checked: rangeDays === days }}
            onPress={() => setRangeDays(days)}
            style={[styles.rangeTab, rangeDays === days && styles.rangeTabSelected]}>
            <Text style={[styles.rangeTabText, rangeDays === days && styles.rangeTabTextSelected]}>
              {days === 7 ? text('最近 7 天', 'Last 7 days') : text('最近 30 天', 'Last 30 days')}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroRing}>
          <Text style={styles.heroRate}>{saveRate}%</Text>
          <Text style={styles.heroRateLabel}>{text('妥善使用率', 'use rate')}</Text>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>{text('本期表现', 'THIS PERIOD')}</Text>
          <Text style={styles.heroTitle}>
            {wastedCount === 0
              ? text('做得很好，没有记录到浪费', 'Great work — no waste recorded')
              : text(`吃完 ${finished.length} 项，浪费 ${wastedCount} 项`, `${finished.length} finished, ${wastedCount} wasted`)}
          </Text>
          <Text style={styles.heroText}>
            {expiringNow > 0
              ? text(`现在还有 ${expiringNow} 项临期库存，优先安排到菜单里。`, `${expiringNow} items are expiring soon; plan them into meals.`)
              : text('当前没有需要紧急处理的临期库存。', 'Nothing in your pantry needs urgent attention.')}
          </Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: '#EDF7F0' }]}>
          <Text style={styles.statEmoji}>😋</Text>
          <Text style={[styles.statValue, { color: Colors.light.primary }]}>{finished.length}</Text>
          <Text style={styles.statLabel}>{text('正常吃完', 'Finished')}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#FFF1ED' }]}>
          <Text style={styles.statEmoji}>⏰</Text>
          <Text style={[styles.statValue, { color: Colors.light.danger }]}>{expired.length}</Text>
          <Text style={styles.statLabel}>{text('过期丢弃', 'Expired')}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#FFF7E7' }]}>
          <Text style={styles.statEmoji}>🗑️</Text>
          <Text style={[styles.statValue, { color: Colors.light.warning }]}>{discarded.length}</Text>
          <Text style={styles.statLabel}>{text('其他丢弃', 'Discarded')}</Text>
        </View>
      </View>

      <View style={styles.chartSection}>
        <SectionHeader title={text('物品去向', 'Where items went')} detail={text(`${disposalTransactions.length} 条记录`, `${disposalTransactions.length} records`)} />
        <View style={styles.chartCard}>
          {(Object.keys(reasonMeta) as DisposalReason[]).map((reason) => {
            const meta = reasonMeta[reason];
            const count = reasonCounts[reason];
            return (
              <View key={reason} style={styles.chartRow}>
                <Text style={styles.chartEmoji}>{meta.emoji}</Text>
                <Text style={styles.chartLabel}>{text(meta.zh, meta.en)}</Text>
                <View style={styles.chartTrack}>
                  <View style={[styles.chartFill, { width: `${(count / maxReasonCount) * 100}%`, backgroundColor: meta.color }]} />
                </View>
                <Text style={[styles.chartCount, { color: meta.color }]}>{count}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.recentSection}>
        <SectionHeader title={text('最近处理记录', 'Recent item outcomes')} />
        {disposalTransactions.length > 0 ? (
          <View style={styles.recentList}>
            {disposalTransactions.slice(0, 8).map((transaction) => {
              const meta = reasonMeta[transaction.reason];
              return (
                <View key={transaction.id} style={styles.recentRow}>
                  <View style={[styles.recentIcon, { backgroundColor: meta.background }]}>
                    <Text style={styles.recentEmoji}>{meta.emoji}</Text>
                  </View>
                  <View style={styles.recentCopy}>
                    <Text style={styles.recentName}>{localizeContent(transaction.itemName, language)}</Text>
                    <Text style={styles.recentDate}>
                      {new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(transaction.createdAt))}
                    </Text>
                  </View>
                  <View style={styles.recentOutcome}>
                    <Text style={[styles.recentOutcomeText, { color: meta.color }]}>{text(meta.zh, meta.en)}</Text>
                    <Text style={styles.recentAmount}>{formatAmount(formatQuantity(Math.abs(transaction.amount)), transaction.unit, language)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>{text('还没有处理记录', 'No item outcomes yet')}</Text>
              <Text style={styles.emptyText}>{text('在库存中左滑删除物品时，选择“吃完、过期或丢弃”即可开始统计。', 'Swipe an inventory item and choose finished, expired, or discarded to start tracking.')}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.tipCard}>
        <View style={styles.tipIcon}><Text style={styles.tipEmoji}>💡</Text></View>
        <View style={styles.tipCopy}>
          <Text style={styles.tipTitle}>{text('本周小建议', 'A small suggestion')}</Text>
          <Text style={styles.tipText}>
            {expiringNow > 0
              ? text('把临期食材加入“本周菜单”，系统会优先推荐能消耗它们的菜谱。', 'Add expiring food to your weekly plan so recipes that use it are prioritized.')
              : text('继续在每次清理库存时记录原因，报告会越来越准确。', 'Keep recording item outcomes so this report becomes more useful.')}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/planner')} style={styles.tipButton}>
          <Text style={styles.tipButtonText}>{text('去计划', 'Plan')}</Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  rangeTabs: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: 15, backgroundColor: Colors.light.backgroundElement },
  rangeTab: { flex: 1, minHeight: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  rangeTabSelected: { backgroundColor: Colors.light.surface, boxShadow: '0 2px 8px rgba(40, 58, 47, 0.08)' },
  rangeTabText: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '800' },
  rangeTabTextSelected: { color: Colors.light.primary },
  heroCard: { minHeight: 180, flexDirection: 'row', alignItems: 'center', gap: 18, padding: 20, borderRadius: 27, backgroundColor: Colors.light.primary },
  heroRing: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center', borderRadius: 52, borderWidth: 9, borderColor: '#FFFFFF35', backgroundColor: '#FFFFFF12' },
  heroRate: { color: '#FFFFFF', fontSize: 27, fontWeight: '900' },
  heroRateLabel: { color: '#D6EADB', fontSize: 8.5, fontWeight: '800' },
  heroCopy: { flex: 1, gap: 6 },
  heroEyebrow: { color: '#CFE5D6', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  heroTitle: { color: '#FFFFFF', fontSize: 19, lineHeight: 25, fontWeight: '900' },
  heroText: { color: '#D7EBDD', fontSize: 10.5, lineHeight: 17 },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, minHeight: 122, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 9, borderRadius: 20 },
  statEmoji: { fontSize: 23 },
  statValue: { fontSize: 25, fontWeight: '900' },
  statLabel: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '800', textAlign: 'center' },
  chartSection: { gap: 12 },
  chartCard: { gap: 16, padding: 17, borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  chartEmoji: { width: 24, fontSize: 18 },
  chartLabel: { width: 67, color: Colors.light.text, fontSize: 10.5, fontWeight: '800' },
  chartTrack: { flex: 1, height: 9, overflow: 'hidden', borderRadius: 5, backgroundColor: Colors.light.backgroundElement },
  chartFill: { height: '100%', minWidth: 3, borderRadius: 5 },
  chartCount: { width: 22, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  recentSection: { gap: 12 },
  recentList: { overflow: 'hidden', borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  recentRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  recentIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  recentEmoji: { fontSize: 22 },
  recentCopy: { flex: 1, gap: 3 },
  recentName: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  recentDate: { color: Colors.light.textSecondary, fontSize: 9.5 },
  recentOutcome: { alignItems: 'flex-end', gap: 3 },
  recentOutcomeText: { fontSize: 9.5, fontWeight: '900' },
  recentAmount: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '700' },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 18, borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  emptyEmoji: { fontSize: 31 },
  emptyCopy: { flex: 1, gap: 4 },
  emptyTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  emptyText: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16 },
  tipCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 15, borderRadius: 21, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#C8DFD0' },
  tipIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FFFFFFA8' },
  tipEmoji: { fontSize: 21 },
  tipCopy: { flex: 1, gap: 3 },
  tipTitle: { color: Colors.light.primary, fontSize: 12, fontWeight: '900' },
  tipText: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 15 },
  tipButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: Colors.light.primary },
  tipButtonText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '900' },
});
