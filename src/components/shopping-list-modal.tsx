import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import type { ShoppingListItem } from '@/data/kitchen-data';

type ShoppingListModalProps = {
  visible: boolean;
  onClose: () => void;
  onTransfer: (item: ShoppingListItem) => void;
};

const units = ['个', '克', '毫升', '包', '盒', '瓶'];

function guessEmoji(name: string) {
  const rules: [RegExp, string][] = [
    [/番茄|西红柿/, '🍅'], [/蛋/, '🥚'], [/奶/, '🥛'], [/鸡|肉/, '🍗'],
    [/菜|菠菜|青菜/, '🥬'], [/苹果/, '🍎'], [/面/, '🍜'], [/米/, '🍚'],
    [/咖啡/, '☕️'], [/水|饮料|果汁/, '🥤'], [/豆腐/, '◻️'], [/面包|吐司/, '🍞'],
  ];
  return rules.find(([pattern]) => pattern.test(name))?.[1] ?? '🛒';
}

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1);
}

export function ShoppingListModal({ visible, onClose, onTransfer }: ShoppingListModalProps) {
  const insets = useSafeAreaInsets();
  const { text } = useLanguage();
  const {
    shoppingList,
    addShoppingItem,
    adjustShoppingItemQuantity,
    toggleShoppingItem,
    deleteShoppingItem,
    clearCheckedShoppingItems,
  } = useKitchen();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('个');

  const pending = useMemo(() => shoppingList.filter((item) => !item.checked), [shoppingList]);
  const checked = useMemo(() => shoppingList.filter((item) => item.checked), [shoppingList]);

  function addManualItem() {
    const parsedQuantity = Number(quantity);
    if (!name.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    addShoppingItem({
      name: name.trim(),
      emoji: guessEmoji(name),
      quantity: parsedQuantity,
      unit,
    });
    setName('');
    setQuantity('1');
  }

  function renderItem(item: ShoppingListItem) {
    return (
      <View key={item.id} style={[styles.itemRow, item.checked && styles.itemRowChecked]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={text(`标记${item.name}${item.checked ? '为未购买' : '为已购买'}`, `Mark ${item.name} as ${item.checked ? 'not bought' : 'bought'}`)}
          onPress={() => toggleShoppingItem(item.id)}
          style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
          <Text style={styles.checkboxText}>{item.checked ? '✓' : ''}</Text>
        </Pressable>
        <Text style={styles.itemEmoji}>{item.emoji}</Text>
        <View style={styles.itemCopy}>
          <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>{item.name}</Text>
          <Text style={styles.itemSource} numberOfLines={1}>
            {item.sourceRecipeName
              ? text(`来自菜谱 · ${item.sourceRecipeName}`, `From recipe · ${item.sourceRecipeName}`)
              : text('手动添加', 'Added manually')}
          </Text>
          {item.checked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text(`将${item.name}加入库存`, `Add ${item.name} to inventory`)}
              onPress={() => onTransfer(item)}
              style={styles.transferButton}>
              <Text style={styles.transferButtonText}>{text('放入库存', 'Add to inventory')} ›</Text>
            </Pressable>
          ) : null}
        </View>
        {!item.checked ? (
          <View style={styles.quantityControl}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text(`减少${item.name}数量`, `Decrease ${item.name}`)}
              onPress={() => adjustShoppingItemQuantity(item.id, -1)}
              style={styles.quantityButton}>
              <Text style={styles.quantityButtonText}>−</Text>
            </Pressable>
            <Text style={styles.quantityText}>{formatQuantity(item.quantity)}{item.unit}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text(`增加${item.name}数量`, `Increase ${item.name}`)}
              onPress={() => adjustShoppingItemQuantity(item.id, 1)}
              style={styles.quantityButton}>
              <Text style={styles.quantityButtonText}>＋</Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text(`删除${item.name}`, `Delete ${item.name}`)}
          onPress={() => deleteShoppingItem(item.id)}
          style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>×</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={text('关闭购物清单', 'Close shopping list')} onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{text('家庭购物清单', 'Household shopping list')}</Text>
            <Text style={styles.subtitle}>{text(`${pending.length} 项待购买`, `${pending.length} items to buy`)}</Text>
          </View>
          <View style={styles.headerPlaceholder} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryValue}>{pending.length}</Text>
              <Text style={styles.summaryLabel}>{text('项待购买', 'items to buy')}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View>
              <Text style={styles.summaryValue}>{checked.length}</Text>
              <Text style={styles.summaryLabel}>{text('项已买到', 'items bought')}</Text>
            </View>
            <Text style={styles.summaryEmoji}>🛒</Text>
          </View>

          <View style={styles.quickAddCard}>
            <Text style={styles.sectionTitle}>{text('快速添加', 'Quick add')}</Text>
            <View style={styles.quickAddRow}>
              <TextInput
                accessibilityLabel={text('购物物品名称', 'Shopping item name')}
                value={name}
                onChangeText={setName}
                onSubmitEditing={addManualItem}
                placeholder={text('例如：牛奶', 'For example: milk')}
                placeholderTextColor={Colors.light.textSecondary}
                returnKeyType="done"
                style={styles.nameInput}
              />
              <TextInput
                accessibilityLabel={text('购物数量', 'Shopping quantity')}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                selectTextOnFocus
                style={styles.quantityInput}
              />
              <Pressable accessibilityRole="button" onPress={addManualItem} style={styles.addButton}>
                <Text style={styles.addButtonText}>＋</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitRow}>
              {units.map((option) => (
                <Pressable key={option} onPress={() => setUnit(option)} style={[styles.unitChip, unit === option && styles.unitChipActive]}>
                  <Text style={[styles.unitChipText, unit === option && styles.unitChipTextActive]}>{option}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{text('待购买', 'To buy')}</Text>
            <Text style={styles.sectionCount}>{pending.length}</Text>
          </View>
          <View style={styles.listCard}>
            {pending.length > 0 ? pending.map(renderItem) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🧺</Text>
                <Text style={styles.emptyTitle}>{text('清单暂时空空的', 'Your list is empty')}</Text>
                <Text style={styles.emptyText}>{text('可以手动添加，或从菜谱一键补齐缺少的食材。', 'Add something manually or send missing recipe ingredients here.')}</Text>
              </View>
            )}
          </View>

          {checked.length > 0 ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{text('已经买到', 'Bought')}</Text>
                <Pressable accessibilityRole="button" onPress={clearCheckedShoppingItems}>
                  <Text style={styles.clearText}>{text('清除全部', 'Clear all')}</Text>
                </Pressable>
              </View>
              <View style={styles.listCard}>{checked.map(renderItem)}</View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.background },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.background },
  headerCopy: { alignItems: 'center', gap: 2 },
  title: { color: Colors.light.text, fontSize: 16, fontWeight: '900' },
  subtitle: { color: Colors.light.textSecondary, fontSize: 10, fontWeight: '700' },
  headerPlaceholder: { width: 42, height: 42 },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  closeButtonText: { color: Colors.light.text, fontSize: 26, lineHeight: 28 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 16, padding: 18 },
  summaryCard: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 20, borderRadius: 23, backgroundColor: Colors.light.primary },
  summaryValue: { color: '#FFFFFF', fontSize: 25, fontWeight: '900' },
  summaryLabel: { color: '#D8EADF', fontSize: 9.5, fontWeight: '700' },
  summaryDivider: { width: 1, height: 38, backgroundColor: '#FFFFFF30' },
  summaryEmoji: { marginLeft: 'auto', fontSize: 37 },
  quickAddCard: { gap: 11, padding: 15, borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  sectionTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  quickAddRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1, minHeight: 47, paddingHorizontal: 13, borderRadius: 14, color: Colors.light.text, backgroundColor: Colors.light.backgroundElement },
  quantityInput: { width: 55, minHeight: 47, textAlign: 'center', borderRadius: 14, color: Colors.light.text, fontWeight: '800', backgroundColor: Colors.light.backgroundElement },
  addButton: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.light.primary },
  addButtonText: { color: '#FFFFFF', fontSize: 23, fontWeight: '700' },
  unitRow: { gap: 7 },
  unitChip: { minWidth: 45, minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, backgroundColor: Colors.light.backgroundElement },
  unitChipActive: { backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#A7CFB6' },
  unitChipText: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '800' },
  unitChipTextActive: { color: Colors.light.primary },
  sectionHeader: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionCount: { minWidth: 25, textAlign: 'center', paddingVertical: 4, borderRadius: 9, color: Colors.light.primary, backgroundColor: Colors.light.primarySoft, fontSize: 10, fontWeight: '900' },
  clearText: { color: Colors.light.danger, fontSize: 10.5, fontWeight: '800' },
  listCard: { overflow: 'hidden', borderRadius: 20, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  itemRow: { minHeight: 83, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  itemRowChecked: { backgroundColor: '#F4F7F3' },
  checkbox: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1.5, borderColor: '#B9BDB6' },
  checkboxChecked: { borderColor: Colors.light.primary, backgroundColor: Colors.light.primary },
  checkboxText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  itemEmoji: { fontSize: 24 },
  itemCopy: { flex: 1, gap: 3 },
  itemName: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  itemNameChecked: { color: Colors.light.textSecondary, textDecorationLine: 'line-through' },
  itemSource: { color: Colors.light.textSecondary, fontSize: 8.5 },
  transferButton: { alignSelf: 'flex-start', minHeight: 25, justifyContent: 'center', marginTop: 2 },
  transferButtonText: { color: Colors.light.primary, fontSize: 10, fontWeight: '900' },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  quantityButton: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: Colors.light.backgroundElement },
  quantityButtonText: { color: Colors.light.text, fontSize: 15, fontWeight: '800' },
  quantityText: { minWidth: 40, color: Colors.light.text, fontSize: 9.5, fontWeight: '900', textAlign: 'center' },
  deleteButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  deleteButtonText: { color: Colors.light.danger, fontSize: 20 },
  emptyState: { alignItems: 'center', gap: 6, padding: 28 },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  emptyText: { maxWidth: 260, color: Colors.light.textSecondary, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
