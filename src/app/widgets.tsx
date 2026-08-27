import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { Colors } from '@/constants/theme';
import { useLanguage } from '@/context/language-context';
import { type WidgetKind, useWidgets } from '@/context/widget-context';
import { localizeContent } from '@/data/content-translations';

const widgetMeta: Record<WidgetKind, { emoji: string; zh: string; en: string; detailZh: string; detailEn: string }> = {
  expiry: { emoji: '⏳', zh: '临期库存', en: 'Expiry', detailZh: '显示最近需要处理的物品', detailEn: 'Shows items that need attention soon' },
  hydration: { emoji: '💧', zh: '今日饮水量', en: 'Hydration', detailZh: '显示饮水量和每日目标', detailEn: 'Shows hydration and your daily goal' },
  timer: { emoji: '🍳', zh: '烹饪倒计时', en: 'Cooking timer', detailZh: '显示当前菜谱、步骤和计时', detailEn: 'Shows the current recipe, step, and timer' },
};

function daysLabel(daysLeft: number, language: 'zh' | 'en') {
  if (daysLeft < 0) return language === 'zh' ? '已过期' : 'Expired';
  if (daysLeft === 0) return language === 'zh' ? '今天' : 'Today';
  if (daysLeft === 1) return language === 'zh' ? '明天' : 'Tomorrow';
  return language === 'zh' ? `${daysLeft} 天` : `${daysLeft}d`;
}

export default function WidgetCenterScreen() {
  const router = useRouter();
  const { language, locale, text } = useLanguage();
  const { enabledWidgets, setWidgetEnabled, snapshot, nativeWidgetsReady } = useWidgets();
  const hydrationProgress = Math.min(snapshot.hydration.retainedMl / Math.max(snapshot.hydration.goalMl, 1), 1);
  const timerMinutes = snapshot.timer.deadline
    ? Math.max(0, Math.ceil((snapshot.timer.deadline - Date.now()) / 60_000))
    : null;

  return (
    <AppScreen
      eyebrow={text('iPHONE 桌面', 'iPHONE HOME SCREEN')}
      title={text('小组件中心', 'Widget center')}
      subtitle={text('选择你希望在桌面或锁屏上快速查看的内容。', 'Choose what you want to see at a glance on your Home or Lock Screen.')}
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('返回设置', 'Back to settings')}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="close" size={23} color={Colors.light.text} />
        </Pressable>
      }>
      <View style={styles.statusCard}>
        <View style={styles.statusIcon}>
          <MaterialCommunityIcons name={nativeWidgetsReady ? 'check-decagram' : 'hammer-wrench'} size={26} color={Colors.light.primary} />
        </View>
        <View style={styles.statusCopy}>
          <Text style={styles.statusEyebrow}>{nativeWidgetsReady ? text('可以添加', 'READY') : text('数据层已准备', 'DATA READY')}</Text>
          <Text style={styles.statusTitle}>{text('小组件内容会随 App 数据更新', 'Widget content follows your app data')}</Text>
          <Text style={styles.statusText}>
            {text(
              'Expo Go 中可以预览与配置；正式桌面小组件将在 development build / TestFlight 阶段激活。',
              'Preview and configure in Expo Go; the actual Home Screen extension activates in a development build or TestFlight.'
            )}
          </Text>
        </View>
      </View>

      <View style={styles.previewSection}>
        <SectionHeader title={text('小组件预览', 'Widget previews')} detail={text('实时数据', 'Live data')} />
        <View style={styles.previewGrid}>
          <View style={styles.smallWidget}>
            <View style={styles.widgetTopRow}>
              <Text style={styles.widgetBrand}>{text('鲜食记', 'FRESH PANTRY')}</Text>
              <Text style={styles.widgetTopEmoji}>⏳</Text>
            </View>
            <Text style={styles.widgetLargeValue}>{snapshot.expiry.total}</Text>
            <Text style={styles.widgetMainLabel}>{text('项需要留意', 'items need attention')}</Text>
            {snapshot.expiry.items[0] ? (
              <View style={styles.widgetItemPill}>
                <Text style={styles.widgetItemEmoji}>{snapshot.expiry.items[0].emoji}</Text>
                <Text style={styles.widgetItemName} numberOfLines={1}>{localizeContent(snapshot.expiry.items[0].name, language)}</Text>
                <Text style={styles.widgetItemDays}>{daysLabel(snapshot.expiry.items[0].daysLeft, language)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.smallWidgetBlue}>
            <View style={styles.widgetTopRow}>
              <Text style={styles.widgetBrandBlue}>{text('今日饮水量', 'HYDRATION')}</Text>
              <Text style={styles.widgetTopEmoji}>💧</Text>
            </View>
            <Text style={styles.hydrationValue}>{snapshot.hydration.retainedMl}</Text>
            <Text style={styles.hydrationUnit}>mL / {snapshot.hydration.goalMl}</Text>
            <View style={styles.widgetProgressTrack}>
              <View style={[styles.widgetProgressFill, { width: `${hydrationProgress * 100}%` }]} />
            </View>
            <Text style={styles.hydrationCaption}>{text('继续保持，少量多次补水', 'Keep sipping through the day')}</Text>
          </View>
        </View>

        <View style={styles.mediumWidget}>
          <View style={styles.timerIconBox}><Text style={styles.timerEmoji}>{snapshot.timer.recipeEmoji}</Text></View>
          <View style={styles.timerCopy}>
            <Text style={styles.timerEyebrow}>{text('正在烹饪', 'COOKING NOW')}</Text>
            <Text style={styles.timerTitle} numberOfLines={1}>
              {snapshot.timer.active
                ? localizeContent(snapshot.timer.recipeName, language)
                : text('暂无进行中的菜谱', 'No active cooking session')}
            </Text>
            <Text style={styles.timerMeta}>
              {snapshot.timer.active
                ? text(`步骤 ${snapshot.timer.stepIndex + 1} / ${snapshot.timer.totalSteps}`, `Step ${snapshot.timer.stepIndex + 1} of ${snapshot.timer.totalSteps}`)
                : text('开始烹饪后会在这里显示', 'Start cooking to show it here')}
            </Text>
          </View>
          <View style={styles.timerValueBox}>
            <Text style={styles.timerValue}>{timerMinutes === null ? '—' : timerMinutes}</Text>
            <Text style={styles.timerValueUnit}>{timerMinutes === null ? text('待开始', 'READY') : 'MIN'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.settingsSection}>
        <SectionHeader title={text('显示内容', 'Included widgets')} />
        <View style={styles.settingsCard}>
          {(Object.keys(widgetMeta) as WidgetKind[]).map((kind) => {
            const meta = widgetMeta[kind];
            const enabled = enabledWidgets.includes(kind);
            return (
              <View key={kind} style={styles.settingRow}>
                <View style={styles.settingIcon}><Text style={styles.settingEmoji}>{meta.emoji}</Text></View>
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>{text(meta.zh, meta.en)}</Text>
                  <Text style={styles.settingText}>{text(meta.detailZh, meta.detailEn)}</Text>
                </View>
                <Switch
                  accessibilityLabel={text(`显示${meta.zh}小组件`, `Show ${meta.en} widget`)}
                  value={enabled}
                  onValueChange={(value) => setWidgetEnabled(kind, value)}
                  trackColor={{ false: '#D9D7D0', true: '#A7CFB6' }}
                  thumbColor={enabled ? Colors.light.primary : '#FFFFFF'}
                />
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.syncCard}>
        <MaterialCommunityIcons name="sync" size={22} color={Colors.light.primary} />
        <View style={styles.syncCopy}>
          <Text style={styles.syncTitle}>{text('小组件数据快照已同步', 'Widget snapshot is up to date')}</Text>
          <Text style={styles.syncText}>
            {text('更新时间', 'Updated')} · {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(snapshot.updatedAt))}
          </Text>
        </View>
        <View style={styles.syncBadge}><Text style={styles.syncBadgeText}>{text('本机', 'LOCAL')}</Text></View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, borderRadius: 22, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#C7DFCF' },
  statusIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FFFFFFA8' },
  statusCopy: { flex: 1, gap: 3 },
  statusEyebrow: { color: Colors.light.primary, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.6 },
  statusTitle: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  statusText: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 15 },
  previewSection: { gap: 12 },
  previewGrid: { flexDirection: 'row', gap: 10 },
  smallWidget: { flex: 1, aspectRatio: 1, justifyContent: 'space-between', padding: 14, borderRadius: 27, backgroundColor: Colors.light.primary, boxShadow: '0 12px 28px rgba(47,109,80,0.18)' },
  smallWidgetBlue: { flex: 1, aspectRatio: 1, justifyContent: 'space-between', padding: 14, borderRadius: 27, backgroundColor: '#EAF5F8', borderWidth: 1, borderColor: '#D2E8EE' },
  widgetTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  widgetBrand: { color: '#CFE5D6', fontSize: 7.5, fontWeight: '900', letterSpacing: 0.6 },
  widgetBrandBlue: { color: '#347FA3', fontSize: 7.5, fontWeight: '900', letterSpacing: 0.6 },
  widgetTopEmoji: { fontSize: 18 },
  widgetLargeValue: { color: '#FFFFFF', fontSize: 38, lineHeight: 42, fontWeight: '900' },
  widgetMainLabel: { marginTop: -8, color: '#D6E9DC', fontSize: 9.5, fontWeight: '700' },
  widgetItemPill: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 11, backgroundColor: '#FFFFFF16' },
  widgetItemEmoji: { fontSize: 14 },
  widgetItemName: { flex: 1, color: '#FFFFFF', fontSize: 8.5, fontWeight: '800' },
  widgetItemDays: { color: '#CFE5D6', fontSize: 7.5, fontWeight: '800' },
  hydrationValue: { color: '#277293', fontSize: 35, lineHeight: 39, fontWeight: '900' },
  hydrationUnit: { marginTop: -8, color: '#5A8DA3', fontSize: 8.5, fontWeight: '800' },
  widgetProgressTrack: { height: 7, overflow: 'hidden', borderRadius: 4, backgroundColor: '#CFE3E9' },
  widgetProgressFill: { height: '100%', borderRadius: 4, backgroundColor: '#347FA3' },
  hydrationCaption: { color: '#5A8293', fontSize: 7.5, lineHeight: 11 },
  mediumWidget: { minHeight: 116, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 27, backgroundColor: '#FFF5E8', borderWidth: 1, borderColor: '#EEDDC4' },
  timerIconBox: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#FFFFFFA8' },
  timerEmoji: { fontSize: 32 },
  timerCopy: { flex: 1, gap: 4 },
  timerEyebrow: { color: '#A56B2E', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  timerTitle: { color: Colors.light.text, fontSize: 15, fontWeight: '900' },
  timerMeta: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '700' },
  timerValueBox: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#FFFFFFA8' },
  timerValue: { color: '#9B6229', fontSize: 22, fontWeight: '900' },
  timerValueUnit: { color: '#A77B51', fontSize: 7.5, fontWeight: '900' },
  settingsSection: { gap: 12 },
  settingsCard: { overflow: 'hidden', borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  settingRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  settingIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.backgroundElement },
  settingEmoji: { fontSize: 21 },
  settingCopy: { flex: 1, gap: 3 },
  settingTitle: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  settingText: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 14 },
  syncCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 15, borderRadius: 20, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  syncCopy: { flex: 1, gap: 3 },
  syncTitle: { color: Colors.light.text, fontSize: 12, fontWeight: '900' },
  syncText: { color: Colors.light.textSecondary, fontSize: 9.5 },
  syncBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, backgroundColor: Colors.light.primarySoft },
  syncBadgeText: { color: Colors.light.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
});
