import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Swipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { ShoppingListModal } from '@/components/shopping-list-modal';
import { StorageCelebration } from '@/components/storage-celebration';
import { Colors, Spacing } from '@/constants/theme';
import { useKitchen } from '@/context/kitchen-context';
import { useLanguage, type AppLanguage } from '@/context/language-context';
import { formatAmount, localizeContent } from '@/data/content-translations';
import {
  daysUntilDate,
  effectiveExpiryDate,
  formatQuantity,
  type InventoryItem,
  type InventoryLibrary,
  type InventoryLibraryDefinition,
  type ShoppingListItem,
  type StorageLocation,
} from '@/data/kitchen-data';
import { getShelfLifeSuggestion } from '@/data/shelf-life-data';
import type { SmartInventoryItem } from '@/data/ai-import';
import { analyzeInventoryText, analyzeReceiptImage } from '@/services/ai-import';
import { lookupBarcodeProduct } from '@/services/product-lookup';

type InventoryView = '全部' | InventoryLibrary;
type StorageCelebrationData = {
  emoji: string;
  itemName: string;
  storage: StorageLocation;
};

const allInventoryView: InventoryLibraryDefinition = {
  key: '全部',
  label: '全部库存',
  emoji: '🗂️',
  description: '集中查看家中所有库存物品',
  color: Colors.light.primary,
};

const defaultStorageByLibrary: Record<string, StorageLocation> = {
  食材: '冷藏',
  甜品: '冷藏',
  零食: '零食车',
  饮料: '冷藏',
  速食: '速食柜',
};

const defaultShelfDays: Record<string, number> = {
  冷藏: 7,
  冷冻: 30,
  速食柜: 90,
  零食车: 60,
};

const emojiOptions: Record<string, string[]> = {
  食材: [
    '🥬', '🍅', '🥕', '🥚', '🍗', '🥩', '🐟', '🧅', '🍚', '🍜', '🥦', '🥒',
    '🌽', '🥔', '🍠', '🫑', '🧄', '🍄', '🫘', '🥑', '🍋', '🍎', '🍌', '🧀',
  ],
  甜品: [
    '🍰', '🍮', '🧁', '🍩', '🍫', '🍨', '🍪', '🥧', '🍦', '🍧', '🍡', '🥮',
    '🍭', '🍬', '🍯', '🥐', '🧇', '🥞', '🍓', '🍒',
  ],
  零食: [
    '🍿', '🍘', '🥨', '🥜', '🍟', '🍬', '🍭', '🥔', '🍪', '🍫', '🌰', '🫘',
    '🍎', '🍌', '🍇', '🧀', '🥠', '🧇', '🥖', '🫓',
  ],
  饮料: [
    '🥤', '🥛', '🧃', '☕', '🍵', '🧋', '🫧', '💧', '🧊', '🍹', '🍺', '🍷',
    '🥂', '🍶', '🫖', '🍼', '🍋', '🍊', '🥥', '🧉',
  ],
  速食: [
    '🍱', '🥟', '🍜', '🍛', '🥫', '🌯', '🍕', '🍙', '🍝', '🍲', '🥡', '🌮',
    '🥪', '🍔', '🌭', '🥘', '🥣', '🧆', '🫕', '🍚',
  ],
};

const unitPresets: Record<string, string[]> = {
  食材: ['个', '克', '根', '把', '袋'],
  甜品: ['个', '块', '杯', '盒'],
  零食: ['包', '袋', '盒', '罐'],
  饮料: ['瓶', '罐', '盒', '杯'],
  速食: ['包', '袋', '盒', '桶'],
};

const customLibraryEmojis = [
  '📦', '🧴', '💊', '🧸', '🐾', '🫙', '🛒', '✨', '🧺', '🧊', '🌿', '🧂',
  '🧻', '🧼', '🕯️', '🎁',
];
const customLibraryColors = ['#2F6D50', '#347C8C', '#C56A46', '#A65D7B', '#6E68A8', '#8A713F'];
const quickItemPresets: {
  name: string;
  emoji: string;
  library: InventoryLibrary;
  storage: StorageLocation;
  unit: string;
  shelfDays: number;
}[] = [
  { name: '鸡蛋', emoji: '🥚', library: '食材', storage: '冷藏', unit: '个', shelfDays: 14 },
  { name: '番茄', emoji: '🍅', library: '食材', storage: '冷藏', unit: '个', shelfDays: 7 },
  { name: '鲜牛奶', emoji: '🥛', library: '饮料', storage: '冷藏', unit: '盒', shelfDays: 7 },
  { name: '每日坚果', emoji: '🥜', library: '零食', storage: '零食车', unit: '袋', shelfDays: 120 },
];
const fallbackEmojis = [
  '📦', '🛍️', '🫙', '✨', '🏷️', '🧺', '🧴', '🧊', '🌿', '🧂', '🎁', '🛒',
  '🥣', '🍽️', '🫕', '🧃',
];
const fallbackUnits = ['个', '件', '包', '盒', '袋'];

function getEmojiOptions(library: InventoryLibrary) {
  return emojiOptions[library] ?? fallbackEmojis;
}

function getUnitPresets(library: InventoryLibrary) {
  return unitPresets[library] ?? fallbackUnits;
}

function colorWithAlpha(color: string, alpha: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? `${color}${alpha}` : color;
}

function isoDateFromToday(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function isoDateFromBase(baseDate: string, offset: number) {
  const date = isValidIsoDate(baseDate) ? new Date(`${baseDate}T12:00:00`) : new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatFullDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function expiryLabel(item: InventoryItem, language: AppLanguage) {
  if (item.quantity === 0) return language === 'zh' ? '已用完' : 'Used up';
  if (!effectiveExpiryDate(item)) return language === 'zh' ? '未设置固定保质期' : 'No fixed expiry date';
  if (item.daysLeft < 0) {
    return language === 'zh'
      ? `已过期 ${Math.abs(item.daysLeft)} 天`
      : `Expired ${Math.abs(item.daysLeft)} day${Math.abs(item.daysLeft) === 1 ? '' : 's'} ago`;
  }
  if (item.daysLeft === 0) return language === 'zh' ? '今天到期' : 'Expires today';
  if (item.daysLeft === 1) return language === 'zh' ? '明天到期' : 'Expires tomorrow';
  if (item.daysLeft <= 3) return language === 'zh' ? `${item.daysLeft}天后到期` : `Expires in ${item.daysLeft} days`;
  return language === 'zh' ? `还可存放 ${item.daysLeft} 天` : `${item.daysLeft} days remaining`;
}

type InventorySwipeRowProps = {
  item: InventoryItem;
  showLibraryBadge: boolean;
  libraryColor: string;
  onOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
  onPress: () => void;
  onDelete: () => void;
};

function InventorySwipeRow({
  item,
  showLibraryBadge,
  libraryColor,
  onOpen,
  onClose,
  onPress,
  onDelete,
}: InventorySwipeRowProps) {
  const { language, text } = useLanguage();
  const swipeableRef = useRef<SwipeableMethods | null>(null);
  const urgent = item.quantity > 0 && Boolean(effectiveExpiryDate(item)) && item.daysLeft <= 3;

  return (
    <Swipeable
      ref={swipeableRef}
      testID={`inventory-swipe-${item.id}`}
      friction={2}
      rightThreshold={42}
      overshootLeft={false}
      overshootRight={false}
      enableTrackpadTwoFingerGesture
      containerStyle={styles.swipeableRow}
      childrenContainerStyle={styles.swipeableContent}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) onOpen(swipeableRef.current);
      }}
      onSwipeableClose={() => {
        if (swipeableRef.current) onClose(swipeableRef.current);
      }}
      renderRightActions={(_, __, methods) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text(`删除${item.name}`, `Delete ${localizeContent(item.name, language)}`)}
          onPress={() => {
            methods.close();
            onDelete();
          }}
          style={({ pressed }) => [styles.deleteAction, pressed && styles.deleteActionPressed]}>
          <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
          <Text style={styles.deleteActionText}>{text('删除', 'Delete')}</Text>
        </Pressable>
      )}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text(`查看${item.name}详情`, `View ${localizeContent(item.name, language)} details`)}
        onPress={onPress}
        style={({ pressed }) => [
          styles.inventoryRow,
          item.quantity === 0 && styles.usedRow,
          pressed && styles.inventoryRowPressed,
        ]}>
        <View style={[styles.emojiBox, urgent && styles.urgentEmojiBox]}>
          <Text style={styles.emoji}>{item.emoji}</Text>
        </View>
        <View style={styles.itemCopy}>
          <View style={styles.itemTitleRow}>
            <Text style={styles.itemName}>{localizeContent(item.name, language)}</Text>
            {showLibraryBadge ? (
              <View
                style={[
                  styles.libraryBadge,
                  { backgroundColor: colorWithAlpha(libraryColor, '1F') },
                ]}>
                <Text style={[styles.libraryBadgeText, { color: libraryColor }]}>
                  {localizeContent(item.library, language)}
                </Text>
              </View>
            ) : null}
            <View style={[styles.storageBadge, urgent && styles.urgentBadge]}>
              <Text style={[styles.storageText, urgent && styles.urgentText]}>
                {localizeContent(item.storage, language)}
              </Text>
            </View>
          </View>
          <Text style={[styles.expiryText, urgent && styles.expiryUrgent]}>
            {expiryLabel(item, language)}
          </Text>
        </View>
        <View style={styles.quantityColumn}>
          <Text style={styles.quantity}>
            {formatQuantity(item.quantity)}
            <Text style={styles.quantityUnit}> {localizeContent(item.unit, language)}</Text>
          </Text>
          <Text style={styles.detailHint}>{text('详情 ›', 'Details ›')}</Text>
        </View>
      </Pressable>
    </Swipeable>
  );
}

export default function InventoryScreen() {
  const { language, locale, text } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const {
    inventory,
    transactions,
    libraries,
    storageLocations,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    deletedInventory,
    restoreDeletedInventoryItem,
    permanentlyDeleteInventoryItem,
    adjustInventoryQuantity,
    addInventoryLibrary,
    addStorageLocation,
    shoppingList,
    deleteShoppingItem,
  } = useKitchen();
  const inventoryViews = [allInventoryView, ...libraries];
  const [isAdding, setIsAdding] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const addMenuProgress = useSharedValue(0);
  const detailSwipeX = useSharedValue(0);
  const screenWidthRef = useRef(screenWidth);
  screenWidthRef.current = screenWidth;
  const [isSmartAddOpen, setIsSmartAddOpen] = useState(false);
  const [isShoppingListOpen, setIsShoppingListOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [shoppingTransferId, setShoppingTransferId] = useState<string | null>(null);
  const [smartInput, setSmartInput] = useState('');
  const [smartInputMode, setSmartInputMode] = useState<'text' | 'receipt'>('text');
  const [receiptImage, setReceiptImage] = useState<{ uri: string; dataUrl: string } | null>(null);
  const [smartAddError, setSmartAddError] = useState<string | null>(null);
  const [smartItems, setSmartItems] = useState<SmartInventoryItem[]>([]);
  const [selectedSmartItemIds, setSelectedSmartItemIds] = useState<string[]>([]);
  const [editingSmartItemId, setEditingSmartItemId] = useState<string | null>(null);
  const [isSmartAnalyzing, setIsSmartAnalyzing] = useState(false);
  const [smartAnalysisSource, setSmartAnalysisSource] = useState<'openai' | 'local' | null>(null);
  const [smartAddMessage, setSmartAddMessage] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(getEmojiOptions('食材')[0]);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('个');
  const [storage, setStorage] = useState<StorageLocation>('冷藏');
  const [selectedLibrary, setSelectedLibrary] = useState<InventoryView>('全部');
  const [library, setLibrary] = useState<InventoryLibrary>('食材');
  const [purchaseDate, setPurchaseDate] = useState(isoDateFromToday());
  const [hasExpiry, setHasExpiry] = useState(true);
  const [expiryDate, setExpiryDate] = useState(isoDateFromToday(7));
  const [hasOpened, setHasOpened] = useState(false);
  const [openedAt, setOpenedAt] = useState(isoDateFromToday());
  const [openedExpiryDate, setOpenedExpiryDate] = useState(isoDateFromToday(3));
  const [cookingSuggestion, setCookingSuggestion] = useState('');
  const [volumeMl, setVolumeMl] = useState('500');
  const [barcode, setBarcode] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [disposalItem, setDisposalItem] = useState<InventoryItem | null>(null);
  const [storageCelebration, setStorageCelebration] = useState<StorageCelebrationData | null>(null);
  const pendingStorageCelebrationRef = useRef<StorageCelebrationData | null>(null);
  const [isCreatingLibrary, setIsCreatingLibrary] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState('');
  const [newLibraryEmoji, setNewLibraryEmoji] = useState(customLibraryEmojis[0]);
  const [newLibraryColor, setNewLibraryColor] = useState(customLibraryColors[1]);
  const [isAddingStorage, setIsAddingStorage] = useState(false);
  const [newStorageName, setNewStorageName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'expiry' | 'name' | 'quantity'>('expiry');
  const [selectedStorageFilter, setSelectedStorageFilter] = useState<StorageLocation | '全部位置'>(
    '全部位置'
  );

  const addButtonIconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(addMenuProgress.value, [0, 1], [0, 45], Extrapolation.CLAMP)}deg`,
      },
    ],
  }));

  const addMenuStyle = useAnimatedStyle(() => ({
    opacity: interpolate(addMenuProgress.value, [0, 0.2, 1], [0, 0.72, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(addMenuProgress.value, [0, 1], [-12, 0], Extrapolation.CLAMP) },
      { scale: interpolate(addMenuProgress.value, [0, 1], [0.82, 1], Extrapolation.CLAMP) },
      {
        rotate: `${interpolate(addMenuProgress.value, [0, 1], [-7, 0], Extrapolation.CLAMP)}deg`,
      },
    ],
  }));

  const detailSwipeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs(detailSwipeX.value),
      [0, Math.max(screenWidth * 0.8, 1)],
      [1, 0.72],
      Extrapolation.CLAMP
    ),
    transform: [{ translateX: detailSwipeX.value }],
  }));

  const detailPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        detailSwipeX.value = 0;
      },
      onPanResponderMove: (_, gestureState) => {
        const isMostlyHorizontal =
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 0.75;
        if (isMostlyHorizontal) {
          detailSwipeX.value = Math.max(0, gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldClose = gestureState.dx > 72 || gestureState.vx > 0.55;
        if (shouldClose) {
          detailSwipeX.value = withTiming(screenWidthRef.current, { duration: 190 }, (finished) => {
            if (finished) runOnJS(closeItemDetails)();
          });
          return;
        }
        detailSwipeX.value = withTiming(0, { duration: 180 });
      },
      onPanResponderTerminate: () => {
        detailSwipeX.value = withTiming(0, { duration: 180 });
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);
  const closeStorageCelebration = useCallback(() => setStorageCelebration(null), []);
  const selectedItemTransactions = useMemo(
    () =>
      selectedItem
        ? transactions
            .filter(
              (transaction) =>
                transaction.itemId === selectedItem.id ||
                transaction.itemName === selectedItem.name
            )
            .slice(0, 5)
        : [],
    [selectedItem, transactions]
  );

  const selectedLibraryInfo =
    inventoryViews.find((option) => option.key === selectedLibrary) ?? inventoryViews[0];
  const selectedLibraryColor = selectedLibraryInfo.color;
  const libraryItems =
    selectedLibrary === '全部'
      ? inventory
      : inventory.filter((item) => item.library === selectedLibrary);
  const hasStorageFilter =
    selectedLibrary === '全部' && selectedStorageFilter !== '全部位置';
  const storageFilteredItems = hasStorageFilter
    ? libraryItems.filter((item) => item.storage === selectedStorageFilter)
    : libraryItems;
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const filteredItems = hasSearchQuery
    ? storageFilteredItems.filter((item) =>
        [
          item.name,
          localizeContent(item.name, language),
          item.library,
          localizeContent(item.library, language),
          item.storage,
          localizeContent(item.storage, language),
          item.category,
          localizeContent(item.category, language),
          item.unit,
          localizeContent(item.unit, language),
          ...(item.cookingSuggestions ?? []).flatMap((suggestion) => [
            suggestion,
            localizeContent(suggestion, language),
          ]),
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalizedSearchQuery)
      )
    : storageFilteredItems;
  const visibleItems = [...filteredItems].sort((a, b) => {
    if (sortMode === 'name') {
      return localizeContent(a.name, language).localeCompare(localizeContent(b.name, language), locale);
    }
    if (sortMode === 'quantity') return b.quantity - a.quantity;
    const aExpiry = effectiveExpiryDate(a) ?? '9999-12-31';
    const bExpiry = effectiveExpiryDate(b) ?? '9999-12-31';
    return aExpiry.localeCompare(bExpiry);
  });
  const hasInventoryFilter = hasSearchQuery || hasStorageFilter;
  const activeItems = libraryItems.filter((item) => item.quantity > 0);
  const expiringItems = activeItems.filter((item) => effectiveExpiryDate(item) && item.daysLeft <= 3);
  const validPurchaseDate = isValidIsoDate(purchaseDate);
  const validExpiryDate =
    !hasExpiry || (isValidIsoDate(expiryDate) && expiryDate >= purchaseDate);
  const validOpenedDate = !hasOpened || (
    isValidIsoDate(openedAt)
    && isValidIsoDate(openedExpiryDate)
    && openedAt >= purchaseDate
    && openedExpiryDate >= openedAt
  );
  const validVolume =
    library !== '饮料' || volumeMl.trim().length === 0 || Number(volumeMl) > 0;
  const shelfLifeSuggestion = getShelfLifeSuggestion(name, storage, library, language);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
  const normalizedLibraryName = newLibraryName.trim().replace(/库$/, '');
  const canCreateLibrary =
    normalizedLibraryName.length > 0 &&
    !libraries.some((existing) => existing.key === normalizedLibraryName);
  const canSave =
    name.trim().length > 0 &&
    emoji.trim().length > 0 &&
    Number(quantity) > 0 &&
    unit.trim().length > 0 &&
    validPurchaseDate &&
    validExpiryDate &&
    validOpenedDate &&
    validVolume;

  function getDefaultStorage(targetLibrary: InventoryLibrary) {
    return defaultStorageByLibrary[targetLibrary] ?? storageLocations[0] ?? '冷藏';
  }

  function getDefaultShelfDays(targetStorage: StorageLocation) {
    return defaultShelfDays[targetStorage] ?? 30;
  }

  function getLibraryColor(targetLibrary: InventoryLibrary) {
    return libraries.find((option) => option.key === targetLibrary)?.color ?? Colors.light.primary;
  }

  function openAddItem() {
    const targetLibrary = selectedLibrary === '全部' ? '食材' : selectedLibrary;
    const targetStorage = getDefaultStorage(targetLibrary);
    setEditingItemId(null);
    setShoppingTransferId(null);
    setName('');
    setEmoji(getEmojiOptions(targetLibrary)[0]);
    setQuantity('1');
    setUnit(getUnitPresets(targetLibrary)[0]);
    setLibrary(targetLibrary);
    setStorage(targetStorage);
    setPurchaseDate(isoDateFromToday());
    setHasExpiry(true);
    setExpiryDate(isoDateFromToday(getDefaultShelfDays(targetStorage)));
    setHasOpened(false);
    setOpenedAt(isoDateFromToday());
    setOpenedExpiryDate(isoDateFromToday(3));
    setCookingSuggestion('');
    setVolumeMl('500');
    setBarcode('');
    setScanStatus(null);
    setIsAddingStorage(false);
    setNewStorageName('');
    setIsAdding(true);
  }

  function transferShoppingItem(item: ShoppingListItem) {
    const isDrink = item.unit === '毫升' || /水|奶|咖啡|茶|饮料|果汁/.test(item.name);
    const targetLibrary: InventoryLibrary = isDrink ? '饮料' : '食材';
    const targetStorage = getDefaultStorage(targetLibrary);
    setEditingItemId(null);
    setShoppingTransferId(item.id);
    setName(item.name);
    setEmoji(item.emoji);
    setQuantity(String(item.quantity));
    setUnit(item.unit);
    setLibrary(targetLibrary);
    setStorage(targetStorage);
    setPurchaseDate(isoDateFromToday());
    setHasExpiry(true);
    setExpiryDate(isoDateFromToday(getDefaultShelfDays(targetStorage)));
    setHasOpened(false);
    setOpenedAt(isoDateFromToday());
    setOpenedExpiryDate(isoDateFromToday(3));
    setCookingSuggestion('');
    setVolumeMl(item.unit === '毫升' ? String(item.quantity) : '500');
    setBarcode('');
    setScanStatus(null);
    setIsAddingStorage(false);
    setNewStorageName('');
    setIsShoppingListOpen(false);
    setIsAdding(true);
  }

  function openAddModeMenu() {
    setIsAddMenuOpen(true);
    addMenuProgress.set(0);
    addMenuProgress.set(
      withTiming(1, {
        duration: 280,
        easing: Easing.out(Easing.back(1.55)),
      })
    );
  }

  function closeAddModeMenu() {
    addMenuProgress.set(
      withTiming(0, {
        duration: 150,
        easing: Easing.in(Easing.quad),
      })
    );
    setTimeout(() => setIsAddMenuOpen(false), 150);
  }

  function selectBasicAddMode() {
    addMenuProgress.set(0);
    setIsAddMenuOpen(false);
    openAddItem();
  }

  function openSmartAdd() {
    addMenuProgress.set(0);
    setIsAddMenuOpen(false);
    setSmartInput('');
    setSmartInputMode('text');
    setReceiptImage(null);
    setSmartAddError(null);
    setSmartItems([]);
    setSelectedSmartItemIds([]);
    setEditingSmartItemId(null);
    setSmartAnalysisSource(null);
    setIsSmartAddOpen(true);
  }

  async function analyzeSmartInput() {
    if (!smartInput.trim() || isSmartAnalyzing) return;
    setIsSmartAnalyzing(true);
    const analysis = await analyzeInventoryText(smartInput.trim());
    setSmartItems(analysis.result);
    setSelectedSmartItemIds(analysis.result.map((item) => item.id));
    setSmartAnalysisSource(analysis.source);
    setIsSmartAnalyzing(false);
  }

  function confirmSmartItems() {
    const selectedItems = smartItems.filter((item) =>
      selectedSmartItemIds.includes(item.id) && item.name.trim() && item.unit.trim() && item.quantity > 0
    );
    if (selectedItems.length === 0) return;
    const today = isoDateFromToday();
    selectedItems.forEach((item) => addInventoryItem({
      name: item.name,
      emoji: item.emoji,
      quantity: item.quantity,
      unit: item.unit,
      storage: item.storage,
      library: item.library,
      purchaseDate: today,
      expiryDate: isoDateFromToday(Math.max(1, Math.round(item.shelfDays))),
      volumeMlPerUnit: item.library === '饮料' && item.unit === '瓶' ? 500 : undefined,
    }));
    setSelectedLibrary('全部');
    setSelectedStorageFilter('全部位置');
    setSmartAddMessage(text(
      `已智能添加 ${selectedItems.length} 项库存。`,
      `Smart-added ${selectedItems.length} inventory items.`
    ));
    setIsSmartAddOpen(false);
    setSmartInput('');
    setSmartItems([]);
    setSelectedSmartItemIds([]);
    setEditingSmartItemId(null);
  }

  function applyQuickItemPreset(preset: (typeof quickItemPresets)[number]) {
    setName(preset.name);
    setEmoji(preset.emoji);
    setLibrary(preset.library);
    setStorage(preset.storage);
    setUnit(preset.unit);
    setQuantity('1');
    setPurchaseDate(isoDateFromToday());
    setHasExpiry(true);
    setExpiryDate(isoDateFromToday(preset.shelfDays));
    setVolumeMl(preset.library === '饮料' ? '500' : '');
    setBarcode('');
    setScanStatus(null);
  }

  async function handleBarcodeScanned(scannedBarcode: string) {
    setIsScannerOpen(false);
    setBarcode(scannedBarcode);
    setScanStatus(text('正在查询商品资料…', 'Looking up product details…'));
    try {
      const product = await lookupBarcodeProduct(scannedBarcode, language);
      if (!product) {
        setScanStatus(text('没有找到商品资料，请手动填写名称。', 'Product not found. Enter the name manually.'));
        return;
      }
      setName(product.name);
      setEmoji(product.emoji);
      setLibrary(product.library);
      setStorage(product.storage);
      setUnit(product.library === '饮料' ? '瓶' : getUnitPresets(product.library)[0]);
      if (product.volumeMlPerUnit) setVolumeMl(String(product.volumeMlPerUnit));
      setScanStatus(text('已自动填写商品资料，请确认后保存。', 'Product details filled. Review and save.'));
    } catch {
      setScanStatus(text('暂时无法查询网络资料，条码已保留。', 'Could not reach the product database. The barcode is saved.'));
    }
  }

  function openItemDetails(item: InventoryItem) {
    detailSwipeX.value = 0;
    setIsDetailEditing(false);
    setSelectedItem(item);
  }

  function switchSmartInputMode(mode: 'text' | 'receipt') {
    setSmartInputMode(mode);
    setSmartItems([]);
    setSelectedSmartItemIds([]);
    setEditingSmartItemId(null);
    setSmartAnalysisSource(null);
    setSmartAddError(null);
  }

  async function chooseReceiptImage(source: 'camera' | 'library') {
    setSmartAddError(null);
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setSmartAddError(text('需要相机权限才能拍摄小票。', 'Camera permission is required to photograph a receipt.'));
        return;
      }
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.55 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.55 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      setSmartAddError(text('无法读取这张图片，请换一张重试。', 'Could not read this image. Please try another one.'));
      return;
    }
    setReceiptImage({
      uri: asset.uri,
      dataUrl: `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`,
    });
    setSmartItems([]);
    setSelectedSmartItemIds([]);
    setEditingSmartItemId(null);
  }

  async function analyzeReceipt() {
    if (!receiptImage || isSmartAnalyzing) return;
    setIsSmartAnalyzing(true);
    setSmartAddError(null);
    try {
      const analysis = await analyzeReceiptImage(receiptImage.dataUrl);
      setSmartItems(analysis.result);
      setSelectedSmartItemIds(analysis.result.map((item) => item.id));
      setSmartAnalysisSource(analysis.source);
      if (analysis.result.length === 0) {
        setSmartAddError(text('没有识别到食品，请确认小票清晰完整。', 'No food items were detected. Make sure the receipt is clear and complete.'));
      }
    } catch {
      setSmartAddError(text('小票识别暂时不可用，请检查网络或 AI 配置后重试。', 'Receipt recognition is unavailable. Check the network or AI setup and try again.'));
    } finally {
      setIsSmartAnalyzing(false);
    }
  }

  function updateSmartItem(itemId: string, update: Partial<SmartInventoryItem>) {
    setSmartItems((current) => current.map((item) =>
      item.id === itemId ? { ...item, ...update } : item
    ));
  }

  function closeItemDetails() {
    setIsDetailEditing(false);
    setEditingItemId(null);
    setSelectedItem(null);
  }

  function confirmItemDisposal(reason: 'finished' | 'expired' | 'discarded') {
    if (!disposalItem) return;
    deleteInventoryItem(disposalItem.id, reason);
    setDisposalItem(null);
  }

  function editSelectedItem() {
    if (!selectedItem) return;
    const item = selectedItem;
    setEditingItemId(item.id);
    setName(item.name);
    setEmoji(item.emoji);
    setQuantity(formatQuantity(item.quantity));
    setUnit(item.unit);
    setLibrary(item.library);
    setStorage(item.storage);
    setPurchaseDate(item.purchaseDate);
    setHasExpiry(Boolean(item.expiryDate));
    setExpiryDate(item.expiryDate ?? isoDateFromToday(getDefaultShelfDays(item.storage)));
    setHasOpened(Boolean(item.openedAt));
    setOpenedAt(item.openedAt ?? isoDateFromToday());
    setOpenedExpiryDate(item.openedExpiryDate ?? isoDateFromToday(3));
    setCookingSuggestion(item.cookingSuggestions?.join('、') ?? '');
    setVolumeMl(item.volumeMlPerUnit ? String(item.volumeMlPerUnit) : '');
    setBarcode(item.barcode ?? '');
    setScanStatus(null);
    setIsAddingStorage(false);
    setNewStorageName('');
    setIsDetailEditing(true);
  }

  function cancelDetailEditing() {
    setEditingItemId(null);
    setIsAddingStorage(false);
    setNewStorageName('');
    setIsDetailEditing(false);
  }

  function handleAddItemDismiss() {
    const celebration = pendingStorageCelebrationRef.current;
    if (!celebration) return;
    pendingStorageCelebrationRef.current = null;
    setStorageCelebration(celebration);
  }

  function chooseLibrary(nextLibrary: InventoryLibrary) {
    const nextStorage = getDefaultStorage(nextLibrary);
    setLibrary(nextLibrary);
    setEmoji(getEmojiOptions(nextLibrary)[0]);
    setUnit(getUnitPresets(nextLibrary)[0]);
    setVolumeMl(nextLibrary === '饮料' ? '500' : '');
    setStorage(nextStorage);
    if (hasExpiry) setExpiryDate(isoDateFromToday(getDefaultShelfDays(nextStorage)));
  }

  function chooseStorage(nextStorage: StorageLocation) {
    setStorage(nextStorage);
    if (hasExpiry) setExpiryDate(isoDateFromToday(getDefaultShelfDays(nextStorage)));
  }

  function saveCustomLibrary() {
    if (!canCreateLibrary) return;

    addInventoryLibrary({
      key: normalizedLibraryName,
      label: language === 'zh' ? `${normalizedLibraryName}库` : normalizedLibraryName,
      emoji: newLibraryEmoji,
      description: text('你创建的自定义库存分类', 'A custom inventory category you created'),
      color: newLibraryColor,
    });
    setSelectedLibrary(normalizedLibraryName);
    setSelectedStorageFilter('全部位置');
    setNewLibraryName('');
    setNewLibraryEmoji(customLibraryEmojis[0]);
    setNewLibraryColor(customLibraryColors[1]);
    setIsCreatingLibrary(false);
  }

  function saveCustomStorage() {
    const location = newStorageName.trim();
    if (!location) return;

    addStorageLocation(location);
    chooseStorage(location);
    setNewStorageName('');
    setIsAddingStorage(false);
  }

  function applyShelfLifeSuggestion() {
    if (!shelfLifeSuggestion?.recommendedDays) return;
    setHasExpiry(true);
    setExpiryDate(isoDateFromBase(purchaseDate, shelfLifeSuggestion.recommendedDays));
  }

  function buildItemForm() {
    return {
      name: name.trim(),
      emoji,
      quantity: Number(quantity),
      unit: unit.trim(),
      storage,
      library,
      purchaseDate,
      expiryDate: hasExpiry ? expiryDate : undefined,
      openedAt: hasOpened ? openedAt : undefined,
      openedExpiryDate: hasOpened ? openedExpiryDate : undefined,
      cookingSuggestions:
        library === '食材'
          ? cookingSuggestion
              .split(/[、,，\n]/)
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined,
      volumeMlPerUnit:
        library === '饮料' && Number(volumeMl) > 0 ? Number(volumeMl) : undefined,
      barcode: barcode || undefined,
    };
  }

  function saveDetailEdits() {
    if (!canSave || !selectedItem) return;

    const itemForm = buildItemForm();
    updateInventoryItem(selectedItem.id, itemForm);
    setSelectedItem((current) =>
      current
        ? {
            ...current,
            ...itemForm,
            daysLeft: itemForm.expiryDate ? daysUntilDate(itemForm.expiryDate) : 36_500,
          }
        : current
    );
    setSelectedLibrary(library);
    setSelectedStorageFilter('全部位置');
    setEditingItemId(null);
    setIsAddingStorage(false);
    setNewStorageName('');
    setIsDetailEditing(false);
  }

  function saveItem() {
    if (!canSave) return;

    const itemForm = buildItemForm();

    if (editingItemId) {
      updateInventoryItem(editingItemId, itemForm);
    } else {
      addInventoryItem(itemForm);
      if (shoppingTransferId) deleteShoppingItem(shoppingTransferId);
      pendingStorageCelebrationRef.current = {
        emoji: itemForm.emoji,
        itemName: itemForm.name,
        storage: itemForm.storage,
      };
    }
    setSelectedLibrary(library);
    setSelectedStorageFilter('全部位置');
    setEditingItemId(null);
    setShoppingTransferId(null);
    setName('');
    setEmoji(getEmojiOptions('食材')[0]);
    setQuantity('1');
    setUnit('个');
    setStorage('冷藏');
    setPurchaseDate(isoDateFromToday());
    setHasExpiry(true);
    setExpiryDate(isoDateFromToday(7));
    setHasOpened(false);
    setOpenedAt(isoDateFromToday());
    setOpenedExpiryDate(isoDateFromToday(3));
    setCookingSuggestion('');
    setVolumeMl('500');
    setBarcode('');
    setScanStatus(null);
    setIsAdding(false);
    if (Platform.OS !== 'ios') requestAnimationFrame(handleAddItemDismiss);
  }

  return (
    <>
      <AppScreen
        eyebrow={dateLabel}
        title={text('家里的库存', 'Home inventory')}
        subtitle={text('分库管理食材、零食和饮品，先用快过期的。', 'Organize food, snacks, and drinks—and use expiring items first.')}
        action={
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text(`打开最近删除，${deletedInventory.length}项`, `Open recently deleted, ${deletedInventory.length} items`)}
              onPress={() => setIsTrashOpen(true)}
              style={({ pressed }) => [styles.shoppingButton, pressed && styles.pressed]}>
              <Ionicons name="trash-bin-outline" size={20} color={Colors.light.text} />
              {deletedInventory.length ? (
                <View style={styles.shoppingBadge}><Text style={styles.shoppingBadgeText}>{deletedInventory.length}</Text></View>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text(`打开购物清单，${shoppingList.filter((item) => !item.checked).length}项待购买`, `Open shopping list, ${shoppingList.filter((item) => !item.checked).length} items to buy`)}
              onPress={() => setIsShoppingListOpen(true)}
              style={({ pressed }) => [styles.shoppingButton, pressed && styles.pressed]}>
              <Text style={styles.shoppingButtonIcon}>🛒</Text>
              {shoppingList.some((item) => !item.checked) ? (
                <View style={styles.shoppingBadge}>
                  <Text style={styles.shoppingBadgeText}>{shoppingList.filter((item) => !item.checked).length}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('添加库存', 'Add inventory item')}
              onPress={openAddModeMenu}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
              <Animated.Text style={[styles.addButtonIcon, addButtonIconStyle]}>＋</Animated.Text>
            </Pressable>
          </View>
        }>
        {smartAddMessage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('关闭智能添加提示', 'Dismiss smart-add message')}
            onPress={() => setSmartAddMessage(null)}
            style={styles.smartSuccessBanner}>
            <Text style={styles.smartSuccessIcon}>✦</Text>
            <Text style={styles.smartSuccessText}>{smartAddMessage}</Text>
            <Text style={styles.smartSuccessClose}>×</Text>
          </Pressable>
        ) : null}
        <View style={styles.librarySection}>
          <View style={styles.libraryHeader}>
            <Text style={styles.libraryTitle}>{text('库存分类', 'Categories')}</Text>
            <Text style={styles.libraryTotal}>
              {text(`${libraries.length} 个库`, `${libraries.length} categories`)}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.libraryScroller}>
            {inventoryViews.map((option) => {
              const isSelected = selectedLibrary === option.key;
              const count = inventory.filter((item) => {
                if (item.quantity <= 0) return false;
                return option.key === '全部' || item.library === option.key;
              }).length;

              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    openSwipeableRef.current?.close();
                    setSelectedLibrary(option.key);
                    if (option.key !== '全部') setSelectedStorageFilter('全部位置');
                  }}
                  style={({ pressed }) => [
                    styles.libraryChip,
                    isSelected && styles.libraryChipSelected,
                    {
                      backgroundColor: isSelected
                        ? option.color
                        : colorWithAlpha(option.color, '14'),
                      borderColor: colorWithAlpha(option.color, isSelected ? 'FF' : '45'),
                    },
                    pressed && styles.chipPressed,
                  ]}>
                  <Text style={styles.libraryEmoji}>{option.emoji}</Text>
                  <View style={styles.libraryChipCopy}>
                    <Text
                      style={[
                        styles.libraryChipLabel,
                        { color: isSelected ? '#FFFFFF' : option.color },
                      ]}>
                      {localizeContent(option.label, language)}
                    </Text>
                    <Text
                      style={[
                        styles.libraryChipCount,
                        { color: isSelected ? '#FFFFFFCC' : option.color },
                      ]}>
                      {text(`${count} 项`, `${count} items`)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('新建库存库', 'Create inventory category')}
              onPress={() => setIsCreatingLibrary(true)}
              style={({ pressed }) => [styles.newLibraryChip, pressed && styles.chipPressed]}>
              <Text style={styles.newLibraryPlus}>＋</Text>
              <Text style={styles.newLibraryText}>{text('新建库', 'New')}</Text>
            </Pressable>
          </ScrollView>
          <Text style={styles.libraryDescription}>
            {localizeContent(selectedLibraryInfo.description, language)}
          </Text>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.light.textSecondary} />
          <TextInput
            accessibilityLabel={text('搜索库存', 'Search inventory')}
            value={searchQuery}
            onChangeText={(value) => {
              openSwipeableRef.current?.close();
              setSearchQuery(value);
            }}
            placeholder={text(
              `搜索${selectedLibraryInfo.label}`,
              `Search ${localizeContent(selectedLibraryInfo.label, language).toLocaleLowerCase()}`
            )}
            placeholderTextColor={Colors.light.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={Colors.light.primary}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('清空搜索', 'Clear search')}
              hitSlop={10}
              onPress={() => setSearchQuery('')}
              style={({ pressed }) => pressed && styles.searchClearPressed}>
              <Ionicons name="close-circle" size={21} color={Colors.light.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {selectedLibrary === '全部' ? (
          <View style={styles.storageFilterSection}>
            <View style={styles.storageFilterHeader}>
              <Text style={styles.storageFilterTitle}>{text('按存放位置查看', 'Filter by location')}</Text>
              {hasStorageFilter ? (
                <Text style={styles.storageFilterActive}>{text('已筛选', 'FILTERED')}</Text>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storageFilterScroller}>
              {(['全部位置', ...storageLocations] as const).map((option) => {
                const isSelected = selectedStorageFilter === option;
                const count = inventory.filter(
                  (item) =>
                    item.quantity > 0 && (option === '全部位置' || item.storage === option)
                ).length;

                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityLabel={text(`筛选${option}`, `Filter by ${localizeContent(option, language)}`)}
                    accessibilityState={{ checked: isSelected }}
                    onPress={() => {
                      openSwipeableRef.current?.close();
                      setSelectedStorageFilter(option);
                    }}
                    style={({ pressed }) => [
                      styles.storageFilterChip,
                      isSelected && styles.storageFilterChipSelected,
                      pressed && styles.chipPressed,
                    ]}>
                    <Text
                      style={[
                        styles.storageFilterChipText,
                        isSelected && styles.storageFilterChipTextSelected,
                      ]}>
                      {localizeContent(option, language)}
                    </Text>
                    <View
                      style={[
                        styles.storageFilterCount,
                        isSelected && styles.storageFilterCountSelected,
                      ]}>
                      <Text
                        style={[
                          styles.storageFilterCountText,
                          isSelected && styles.storageFilterCountTextSelected,
                        ]}>
                        {count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {!hasInventoryFilter ? (
          <View style={[styles.summaryCard, { backgroundColor: selectedLibraryColor }]}>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryEyebrow}>
                {text(
                  `${selectedLibraryInfo.label}概览`,
                  `${localizeContent(selectedLibraryInfo.label, language)} overview`
                )}
              </Text>
              <Text style={styles.summaryTitle}>
                {expiringItems.length > 0
                  ? text('有物品需要优先处理', 'Some items need attention')
                  : text('这个库状态不错', 'Everything looks good')}
              </Text>
              <Text style={styles.summaryText}>
                {expiringItems.length > 0
                  ? text(
                      `有 ${expiringItems.length} 项物品即将到期。`,
                      `${expiringItems.length} items expire soon.`
                    )
                  : text('目前没有临期物品，可以放心使用。', 'Nothing is close to expiring right now.')}
              </Text>
            </View>
            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryNumber}>{activeItems.length}</Text>
                <Text style={styles.summaryLabel}>{text('项库存', 'items')}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryStat}>
                <Text style={styles.summaryNumber}>{expiringItems.length}</Text>
                <Text style={styles.summaryLabel}>{text('快到期', 'expiring')}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {!hasInventoryFilter && expiringItems.length > 0 ? (
          <View style={styles.expiryNotice}>
            <Text style={styles.noticeIcon}>⏳</Text>
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>
                {text('先处理 ', 'Use first: ')}{localizeContent(expiringItems[0].name, language)}
              </Text>
              <Text style={styles.noticeText}>
                {expiryLabel(expiringItems[0], language)}
                {text('，建议优先安排使用，避免过期浪费。', '. Plan to use it soon to avoid waste.')}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.listToolbar}>
            <Text style={styles.listToolbarLabel}>{text('排序', 'Sort')}</Text>
            <View style={styles.sortOptions}>
              {([
                ['expiry', text('到期', 'Expiry')],
                ['name', text('名称', 'Name')],
                ['quantity', text('数量', 'Quantity')],
              ] as const).map(([key, label]) => (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortMode === key }}
                  onPress={() => setSortMode(key)}
                  style={[styles.sortOption, sortMode === key && styles.sortOptionSelected]}>
                  <Text style={[styles.sortOptionText, sortMode === key && styles.sortOptionTextSelected]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <SectionHeader
            title={
              hasSearchQuery
                ? text('搜索结果', 'Search results')
                : hasStorageFilter
                  ? text(
                      `${selectedStorageFilter}库存`,
                      `${localizeContent(selectedStorageFilter, language)} inventory`
                    )
                  : localizeContent(selectedLibraryInfo.label, language)
            }
            detail={
              hasInventoryFilter
                ? text(`找到 ${visibleItems.length} 项`, `${visibleItems.length} found`)
                : text(`${activeItems.length} 项`, `${activeItems.length} items`)
            }
          />
          {visibleItems.length > 0 ? (
            <View style={styles.inventoryList}>
              {visibleItems.map((item) => (
                <InventorySwipeRow
                  key={item.id}
                  item={item}
                  showLibraryBadge={selectedLibrary === '全部'}
                  libraryColor={getLibraryColor(item.library)}
                  onOpen={(methods) => {
                    if (openSwipeableRef.current !== methods) openSwipeableRef.current?.close();
                    openSwipeableRef.current = methods;
                  }}
                  onClose={(methods) => {
                    if (openSwipeableRef.current === methods) openSwipeableRef.current = null;
                  }}
                  onPress={() => {
                    openSwipeableRef.current?.close();
                    openItemDetails(item);
                  }}
                  onDelete={() => {
                    openSwipeableRef.current = null;
                    setDisposalItem(item);
                  }}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptySearch}>
              <View style={styles.emptySearchIcon}>
                <Ionicons
                  name={hasSearchQuery ? 'search-outline' : 'cube-outline'}
                  size={25}
                  color={selectedLibraryColor}
                />
              </View>
              <Text style={styles.emptySearchTitle}>
                {hasSearchQuery
                  ? text(`没有找到“${searchQuery.trim()}”`, `No results for “${searchQuery.trim()}”`)
                  : text(
                      `${selectedStorageFilter}暂无库存`,
                      `No items in ${localizeContent(selectedStorageFilter, language).toLocaleLowerCase()}`
                    )}
              </Text>
              <Text style={styles.emptySearchText}>
                {hasSearchQuery
                  ? text('试试物品名称、分类、存放位置或做菜建议', 'Try an item, category, location, or cooking suggestion')
                  : text('这个位置目前还没有记录任何物品', 'No items have been recorded in this location yet')}
              </Text>
              {hasSearchQuery && selectedLibrary !== '全部' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text('在全部库存中搜索', 'Search all inventory')}
                  onPress={() => {
                    setSelectedLibrary('全部');
                    setSelectedStorageFilter('全部位置');
                  }}
                  style={({ pressed }) => [
                    styles.searchAllButton,
                    { backgroundColor: colorWithAlpha(selectedLibraryColor, '14') },
                    pressed && styles.searchClearPressed,
                  ]}>
                  <Text style={[styles.searchAllButtonText, { color: selectedLibraryColor }]}>
                    {text('在全部库存中搜索', 'Search all inventory')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      </AppScreen>

      <ShoppingListModal
        visible={isShoppingListOpen}
        onClose={() => setIsShoppingListOpen(false)}
        onTransfer={transferShoppingItem}
      />

      <Modal
        visible={isAddMenuOpen}
        transparent
        animationType="none"
        onRequestClose={closeAddModeMenu}>
        <View style={[styles.addModeBackdrop, { paddingTop: Math.max(insets.top, 12) + 58 }]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeAddModeMenu} />
          <Animated.View style={[styles.addModeSheet, addMenuStyle]}>
            <Text style={styles.addModeTitle}>{text('添加食材', 'Add inventory')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('基础添加食材', 'Basic inventory add')}
              onPress={selectBasicAddMode}
              style={styles.addModeOption}>
              <View style={styles.addModeIcon}><Text style={styles.addModeIconText}>＋</Text></View>
              <View style={styles.addModeCopy}>
                <Text style={styles.addModeOptionTitle}>{text('基础添加', 'Basic add')}</Text>
                <Text style={styles.addModeOptionText}>{text('逐项填写名称、数量与保质期', 'Enter one item and its details')}</Text>
              </View>
              <Text style={styles.addModeChevron}>›</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('智能添加食材', 'Smart inventory add')}
              onPress={openSmartAdd}
              style={[styles.addModeOption, styles.addModeOptionAi]}>
              <View style={[styles.addModeIcon, styles.addModeIconAi]}><Text style={styles.addModeAiIcon}>✦</Text></View>
              <View style={styles.addModeCopy}>
                <Text style={styles.addModeOptionTitle}>{text('智能添加', 'Smart add')}</Text>
                <Text style={styles.addModeOptionText}>{text('输入一段话，自动识别买了什么', 'Describe your shopping in one sentence')}</Text>
              </View>
              <Text style={styles.addModeChevron}>›</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={isSmartAddOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsSmartAddOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalPage}>
          <View nativeID="inventory-smart-add-header" style={styles.modalHeader}>
            <Pressable accessibilityRole="button" onPress={() => setIsSmartAddOpen(false)} hitSlop={12}>
              <Text style={styles.modalCancel}>{text('取消', 'Cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{text('智能添加', 'Smart add')}</Text>
            <View style={styles.smartHeaderPlaceholder} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.smartAddContent}>
            <View style={styles.smartAddIntro}>
              <Text style={styles.smartAddIntroIcon}>✦</Text>
              <View style={styles.smartAddIntroCopy}>
                <Text style={styles.smartAddIntroTitle}>{text('一次录入整袋采购', 'Add a whole shopping trip')}</Text>
                <Text style={styles.smartAddIntroText}>
                  {text('可以描述买了什么，也可以拍摄购物小票批量识别。', 'Describe what you bought or scan a receipt to detect multiple items.')}
                </Text>
              </View>
            </View>
            <View style={styles.smartModeSwitch}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: smartInputMode === 'text' }}
                onPress={() => switchSmartInputMode('text')}
                style={[styles.smartModeOption, smartInputMode === 'text' && styles.smartModeOptionSelected]}>
                <Text style={[styles.smartModeText, smartInputMode === 'text' && styles.smartModeTextSelected]}>
                  {text('✍️ 文字录入', '✍️ Text')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: smartInputMode === 'receipt' }}
                onPress={() => switchSmartInputMode('receipt')}
                style={[styles.smartModeOption, smartInputMode === 'receipt' && styles.smartModeOptionSelected]}>
                <Text style={[styles.smartModeText, smartInputMode === 'receipt' && styles.smartModeTextSelected]}>
                  {text('🧾 小票识别', '🧾 Receipt')}
                </Text>
              </Pressable>
            </View>

            {smartInputMode === 'text' ? (
              <>
                <TextInput
                  accessibilityLabel={text('输入购买内容', 'Shopping description')}
                  value={smartInput}
                  onChangeText={setSmartInput}
                  placeholder={text('例如：两个番茄、一盒鸡蛋和一瓶牛奶…', 'For example: tomatoes, eggs, and a bottle of milk…')}
                  placeholderTextColor={Colors.light.textSecondary}
                  multiline
                  maxLength={6000}
                  style={styles.smartTextInput}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text('开始智能分析', 'Analyze shopping description')}
                  disabled={!smartInput.trim() || isSmartAnalyzing}
                  onPress={analyzeSmartInput}
                  style={[styles.smartAnalyzeButton, (!smartInput.trim() || isSmartAnalyzing) && styles.modalSaveDisabled]}>
                  <Text style={styles.smartAnalyzeButtonText}>
                    {isSmartAnalyzing ? text('正在分析…', 'Analyzing…') : text('✦ 一键分析', '✦ Analyze')}
                  </Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.receiptSection}>
                {receiptImage ? (
                  <View style={styles.receiptPreviewCard}>
                    <Image source={{ uri: receiptImage.uri }} resizeMode="cover" style={styles.receiptPreview} />
                    <View style={styles.receiptPreviewCopy}>
                      <Text style={styles.receiptPreviewTitle}>{text('小票已准备好', 'Receipt ready')}</Text>
                      <Text style={styles.receiptPreviewText}>{text('请确认商品行清晰、没有被裁掉。', 'Make sure all item lines are clear and uncropped.')}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={text('移除小票图片', 'Remove receipt image')}
                      onPress={() => {
                        setReceiptImage(null);
                        setSmartItems([]);
                        setSelectedSmartItemIds([]);
                      }}
                      style={styles.receiptRemoveButton}>
                      <Text style={styles.receiptRemoveText}>×</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.receiptEmptyCard}>
                    <Text style={styles.receiptEmptyEmoji}>🧾</Text>
                    <Text style={styles.receiptEmptyTitle}>{text('把整张小票拍清楚', 'Capture the whole receipt')}</Text>
                    <Text style={styles.receiptEmptyText}>{text('尽量平铺、避免阴影；图片只在你点击分析后发送给 AI。', 'Lay it flat and avoid shadows. The image is sent to AI only after you tap Analyze.')}</Text>
                  </View>
                )}
                <View style={styles.receiptActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={text('拍摄购物小票', 'Photograph receipt')} onPress={() => chooseReceiptImage('camera')} style={styles.receiptActionButton}>
                    <Ionicons name="camera-outline" size={19} color={Colors.light.primary} />
                    <Text style={styles.receiptActionText}>{text('拍小票', 'Camera')}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={text('从相册选择小票', 'Choose receipt from library')} onPress={() => chooseReceiptImage('library')} style={styles.receiptActionButton}>
                    <Ionicons name="images-outline" size={19} color={Colors.light.primary} />
                    <Text style={styles.receiptActionText}>{text('从相册选', 'Photo library')}</Text>
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text('开始识别购物小票', 'Analyze receipt')}
                  disabled={!receiptImage || isSmartAnalyzing}
                  onPress={analyzeReceipt}
                  style={[styles.smartAnalyzeButton, (!receiptImage || isSmartAnalyzing) && styles.modalSaveDisabled]}>
                  <Text style={styles.smartAnalyzeButtonText}>
                    {isSmartAnalyzing ? text('正在读取小票…', 'Reading receipt…') : text('✦ 识别全部商品', '✦ Detect all items')}
                  </Text>
                </Pressable>
              </View>
            )}

            {smartAddError ? (
              <View style={styles.smartErrorCard}>
                <Text style={styles.smartErrorIcon}>!</Text>
                <Text style={styles.smartErrorText}>{smartAddError}</Text>
              </View>
            ) : null}

            {smartItems.length > 0 ? (
              <View style={styles.smartResultSection}>
                <View style={styles.smartResultHeader}>
                  <View>
                    <Text style={styles.smartResultTitle}>{text('识别结果', 'Detected items')}</Text>
                    <Text style={styles.smartResultHint}>
                      {text(
                        `${smartItems.length} 项 · 可校对或取消选择${smartAnalysisSource === 'local' ? ' · 本地智能解析' : ''}`,
                        `${smartItems.length} items · Review or deselect${smartAnalysisSource === 'local' ? ' · Local parser' : ''}`
                      )}
                    </Text>
                  </View>
                  <Text style={styles.smartSelectedCount}>{selectedSmartItemIds.length}/{smartItems.length}</Text>
                </View>
                <View style={styles.smartItemList}>
                  {smartItems.map((item) => {
                    const selected = selectedSmartItemIds.includes(item.id);
                    const editing = editingSmartItemId === item.id;
                    return (
                      <View key={item.id} style={[styles.smartItemCard, selected && styles.smartItemCardSelected]}>
                        <View style={styles.smartItemMainRow}>
                          <Text style={styles.smartItemEmoji}>{item.emoji}</Text>
                          <View style={styles.smartItemCopy}>
                            <Text style={styles.smartItemName}>{item.name}</Text>
                            <Text style={styles.smartItemMeta}>
                              {item.library} · {item.storage} · {text(`约 ${item.shelfDays} 天`, `about ${item.shelfDays} days`)}
                            </Text>
                          </View>
                          <Text style={styles.smartItemAmount}>{formatQuantity(item.quantity)} {item.unit}</Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={text(`校对${item.name}`, `Edit ${item.name}`)}
                            onPress={() => setEditingSmartItemId(editing ? null : item.id)}
                            style={[styles.smartEditButton, editing && styles.smartEditButtonActive]}>
                            <Ionicons name={editing ? 'checkmark' : 'pencil'} size={13} color={editing ? '#FFFFFF' : '#735C9B'} />
                          </Pressable>
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            accessibilityLabel={text(`${selected ? '取消选择' : '选择'}${item.name}`, `${selected ? 'Deselect' : 'Select'} ${item.name}`)}
                            onPress={() => setSelectedSmartItemIds((current) =>
                              selected ? current.filter((id) => id !== item.id) : [...current, item.id]
                            )}
                            style={[styles.smartItemCheck, selected && styles.smartItemCheckSelected]}>
                            <Text style={styles.smartItemCheckText}>{selected ? '✓' : ''}</Text>
                          </Pressable>
                        </View>
                        {editing ? (
                          <View style={styles.smartItemEditor}>
                            <TextInput
                              accessibilityLabel={text(`${item.name}名称`, `${item.name} name`)}
                              value={item.name}
                              onChangeText={(value) => updateSmartItem(item.id, { name: value })}
                              placeholder={text('物品名称', 'Item name')}
                              placeholderTextColor={Colors.light.textSecondary}
                              style={[styles.smartEditInput, styles.smartEditNameInput]}
                            />
                            <TextInput
                              accessibilityLabel={text(`${item.name}数量`, `${item.name} quantity`)}
                              value={String(item.quantity)}
                              onChangeText={(value) => {
                                const parsed = Number(value);
                                if (Number.isFinite(parsed) && parsed >= 0) updateSmartItem(item.id, { quantity: parsed });
                              }}
                              keyboardType="decimal-pad"
                              style={[styles.smartEditInput, styles.smartEditQuantityInput]}
                            />
                            <TextInput
                              accessibilityLabel={text(`${item.name}单位`, `${item.name} unit`)}
                              value={item.unit}
                              onChangeText={(value) => updateSmartItem(item.id, { unit: value })}
                              placeholder={text('单位', 'Unit')}
                              placeholderTextColor={Colors.light.textSecondary}
                              style={[styles.smartEditInput, styles.smartEditUnitInput]}
                            />
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text('确认批量添加选中的食材', 'Add selected inventory items')}
                  disabled={selectedSmartItemIds.length === 0}
                  onPress={confirmSmartItems}
                  style={[styles.smartConfirmButton, selectedSmartItemIds.length === 0 && styles.modalSaveDisabled]}>
                  <Text style={styles.smartConfirmButtonText}>
                    {text(`确认添加 ${selectedSmartItemIds.length} 项`, `Add ${selectedSmartItemIds.length} items`)}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isAdding}
        animationType="slide"
        presentationStyle="pageSheet"
        onDismiss={handleAddItemDismiss}
        onRequestClose={() => setIsAdding(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalPage}>
          <View nativeID="inventory-add-header" style={styles.modalHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('取消编辑', 'Cancel editing')}
              onPress={() => setIsAdding(false)}
              hitSlop={12}>
              <Text style={styles.modalCancel}>{text('取消', 'Cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingItemId ? text('编辑物品', 'Edit item') : text('添加库存', 'Add item')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('保存物品', 'Save item')}
              disabled={!canSave}
              onPress={saveItem}
              hitSlop={12}>
              <Text style={[styles.modalSave, !canSave && styles.modalSaveDisabled]}>
                {text('保存', 'Save')}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.form}
            showsVerticalScrollIndicator={false}>
            {!editingItemId ? (
              <View style={styles.quickPresetSection}>
                <View style={styles.quickPresetHeader}>
                  <Text style={styles.fieldLabel}>{text('常用物品快速填写', 'Quick fill common items')}</Text>
                  <Text style={styles.quickPresetHint}>{text('点一下再修改数量', 'Tap, then adjust quantity')}</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickPresetList}>
                  {quickItemPresets.map((preset) => (
                    <Pressable
                      key={preset.name}
                      accessibilityRole="button"
                      accessibilityLabel={text(
                        `快速填写${preset.name}`,
                        `Quick fill ${localizeContent(preset.name, 'en')}`
                      )}
                      onPress={() => applyQuickItemPreset(preset)}
                      style={styles.quickPresetChip}>
                      <Text style={styles.quickPresetEmoji}>{preset.emoji}</Text>
                      <Text style={styles.quickPresetName}>
                        {localizeContent(preset.name, language)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text('扫描商品条形码', 'Scan a product barcode')}
                  onPress={() => setIsScannerOpen(true)}
                  style={styles.scanBarcodeButton}>
                  <Ionicons name="barcode-outline" size={20} color={Colors.light.primary} />
                  <View style={styles.scanBarcodeCopy}>
                    <Text style={styles.scanBarcodeTitle}>{text('扫描条形码自动填写', 'Scan barcode to fill details')}</Text>
                    <Text style={styles.scanBarcodeText}>{text('使用 Open Food Facts 公开商品资料', 'Uses the public Open Food Facts database')}</Text>
                  </View>
                  <Text style={styles.scanBarcodeChevron}>›</Text>
                </Pressable>
                {scanStatus ? (
                  <Text style={styles.scanStatus}>
                    {scanStatus}{barcode ? ` · ${barcode}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.fieldLabel}>{text('放入哪个库', 'Inventory category')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.modalLibraryOptions}>
              {libraries.map((option) => (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: library === option.key }}
                  onPress={() => chooseLibrary(option.key)}
                  style={[
                    styles.modalLibraryOption,
                    library === option.key && styles.modalLibraryOptionSelected,
                    library === option.key && {
                      backgroundColor: colorWithAlpha(option.color, '1F'),
                      borderColor: option.color,
                    },
                  ]}>
                  <Text style={styles.modalLibraryEmoji}>{option.emoji}</Text>
                  <Text
                    style={[
                      styles.modalLibraryLabel,
                      library === option.key && styles.modalLibraryLabelSelected,
                      library === option.key && { color: option.color },
                    ]}>
                    {localizeContent(option.key, language)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>{text('选择 Emoji', 'Choose an emoji')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.emojiOptions}>
              {getEmojiOptions(library).map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={text(`选择 ${option}`, `Choose ${option}`)}
                  accessibilityState={{ checked: emoji === option }}
                  onPress={() => setEmoji(option)}
                  style={[styles.emojiOption, emoji === option && styles.emojiOptionSelected]}>
                  <Text style={styles.emojiOptionText}>{option}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.customEmojiRow}>
              <Text style={styles.customEmojiHint}>{text('没有合适的？', 'Need another one?')}</Text>
              <TextInput
                accessibilityLabel={text('自定义 Emoji', 'Custom emoji')}
                value={emoji}
                onChangeText={setEmoji}
                maxLength={16}
                autoCapitalize="none"
                placeholder={text('输入任意 Emoji', 'Enter any emoji')}
                placeholderTextColor={Colors.light.textSecondary}
                style={styles.customEmojiInput}
              />
            </View>

            <Text style={styles.fieldLabel}>{text('物品名称', 'Item name')}</Text>
            <TextInput
              autoFocus
              value={editingItemId && language === 'en' ? localizeContent(name, language) : name}
              onChangeText={setName}
              placeholder={text(
                `例如：${library === '饮料' ? '牛奶' : library === '零食' ? '薯片' : '番茄'}`,
                `For example: ${library === '饮料' ? 'milk' : library === '零食' ? 'chips' : 'tomatoes'}`
              )}
              placeholderTextColor={Colors.light.textSecondary}
              style={styles.input}
            />

            <View style={styles.fieldRow}>
              <View style={styles.flexField}>
                <Text style={styles.fieldLabel}>{text('数量', 'Quantity')}</Text>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
              <View style={styles.flexField}>
                <Text style={styles.fieldLabel}>{text('单位', 'Unit')}</Text>
                <TextInput
                  value={language === 'en' ? localizeContent(unit, language) : unit}
                  onChangeText={setUnit}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.unitPresetRow}>
              {getUnitPresets(library).map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={text(`单位 ${option}`, `Unit ${localizeContent(option, language)}`)}
                  accessibilityState={{ checked: unit === option }}
                  onPress={() => setUnit(option)}
                  style={[styles.unitPreset, unit === option && styles.unitPresetSelected]}>
                  <Text
                    style={[
                      styles.unitPresetText,
                      unit === option && styles.unitPresetTextSelected,
                    ]}>
                    {localizeContent(option, language)}
                  </Text>
                </Pressable>
              ))}
              <Text style={styles.unitCustomHint}>{text('也可在上方输入自定义单位', 'Or enter a custom unit above')}</Text>
            </View>

            {library === '饮料' ? (
              <>
                <Text style={styles.fieldLabel}>
                  {text(`每${unit || '份'}容量（毫升）`, `Volume per ${localizeContent(unit || 'item', language)} (mL)`)}
                </Text>
                <TextInput
                  value={volumeMl}
                  onChangeText={setVolumeMl}
                  keyboardType="decimal-pad"
                  placeholder={text('例如：500', 'For example: 500')}
                  placeholderTextColor={Colors.light.textSecondary}
                  style={[styles.input, !validVolume && styles.inputError]}
                />
              </>
            ) : null}

            <Text style={styles.fieldLabel}>{text('存放位置', 'Storage location')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storageOptions}>
              {storageLocations.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => chooseStorage(option)}
                  style={[styles.storageOption, storage === option && styles.storageOptionSelected]}>
                  <Text
                    style={[
                      styles.storageOptionText,
                      storage === option && styles.storageOptionTextSelected,
                    ]}>
                    {localizeContent(option, language)}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('新增存放位置', 'Add storage location')}
                onPress={() => setIsAddingStorage(true)}
                style={styles.addStorageOption}>
                <Text style={styles.addStorageOptionText}>＋ {text('新增位置', 'New location')}</Text>
              </Pressable>
            </ScrollView>

            {isAddingStorage ? (
              <View style={styles.inlineCreateRow}>
                <TextInput
                  autoFocus
                  value={newStorageName}
                  onChangeText={setNewStorageName}
                  placeholder={text('例如：咖啡柜', 'For example: Coffee cabinet')}
                  placeholderTextColor={Colors.light.textSecondary}
                  style={[styles.input, styles.inlineCreateInput]}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!newStorageName.trim()}
                  onPress={saveCustomStorage}
                  style={[
                    styles.inlineCreateButton,
                    !newStorageName.trim() && styles.modalSaveDisabled,
                  ]}>
                  <Text style={styles.inlineCreateButtonText}>{text('添加', 'Add')}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.shelfSuggestionCard}>
              <View style={styles.shelfSuggestionHeader}>
                <View style={styles.shelfSuggestionIcon}>
                  <Ionicons name="cloud-outline" size={19} color={Colors.light.primary} />
                </View>
                <View style={styles.shelfSuggestionHeading}>
                  <Text style={styles.shelfSuggestionEyebrow}>{text('权威资料建议', 'TRUSTED STORAGE GUIDANCE')}</Text>
                  <Text style={styles.shelfSuggestionTitle}>
                    {shelfLifeSuggestion?.title ?? text('填写名称后匹配保存期限', 'Enter a name to match a storage time')}
                  </Text>
                </View>
              </View>
              {shelfLifeSuggestion ? (
                <>
                  <View style={styles.shelfSuggestionResult}>
                    <Text style={styles.shelfSuggestionRange}>
                      {shelfLifeSuggestion.rangeLabel}
                    </Text>
                    <Text style={styles.shelfSuggestionNote}>{shelfLifeSuggestion.note}</Text>
                  </View>
                  <View style={styles.shelfSuggestionActions}>
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={text(`查看${shelfLifeSuggestion.sourceLabel}`, `View ${shelfLifeSuggestion.sourceLabel}`)}
                      onPress={() => void WebBrowser.openBrowserAsync(shelfLifeSuggestion.sourceUrl)}
                      style={({ pressed }) => pressed && styles.searchClearPressed}>
                      <Text style={styles.shelfSuggestionSource}>
                        {shelfLifeSuggestion.sourceLabel} ↗
                      </Text>
                    </Pressable>
                    {shelfLifeSuggestion.recommendedDays ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={text('应用建议保质期', 'Apply suggested expiry date')}
                        onPress={applyShelfLifeSuggestion}
                        style={({ pressed }) => [
                          styles.applySuggestionButton,
                          pressed && styles.chipPressed,
                        ]}>
                        <Text style={styles.applySuggestionText}>{text('应用建议', 'Apply')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </>
              ) : (
                <Text style={styles.shelfSuggestionNote}>
                  {text(
                    '输入物品名称并选择存放位置后，会匹配加拿大卫生部与 USDA FoodKeeper 的公开保存资料。',
                    'Enter an item name and storage location to match public guidance from Health Canada and USDA FoodKeeper.'
                  )}
                </Text>
              )}
              <Text style={styles.shelfSuggestionDisclaimer}>
                {text(
                  '建议仅作提醒；包装日期和储存说明优先。食物状态可疑时请勿食用。',
                  'Guidance is for reminders only. Follow package dates and storage instructions first; discard food when in doubt.'
                )}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>{text('购买日期', 'Purchase date')}</Text>
            <TextInput
              value={purchaseDate}
              onChangeText={setPurchaseDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.light.textSecondary}
              style={[styles.input, !validPurchaseDate && styles.inputError]}
            />

            <Text style={styles.fieldLabel}>{text('保质期设置', 'Expiry setting')}</Text>
            <View style={styles.expiryOptions}>
              <Pressable
                onPress={() => {
                  setHasExpiry(true);
                  if (!isValidIsoDate(expiryDate)) {
                    setExpiryDate(isoDateFromToday(getDefaultShelfDays(storage)));
                  }
                }}
                style={[styles.expiryOption, hasExpiry && styles.expiryOptionSelected]}>
                <Text style={[styles.expiryOptionText, hasExpiry && styles.expiryOptionTextSelected]}>
                  {text('有具体日期', 'Specific date')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setHasExpiry(false)}
                style={[styles.expiryOption, !hasExpiry && styles.expiryOptionSelected]}>
                <Text style={[styles.expiryOptionText, !hasExpiry && styles.expiryOptionTextSelected]}>
                  {text('无固定日期', 'No fixed date')}
                </Text>
              </Pressable>
            </View>

            {hasExpiry ? (
              <>
                <Text style={styles.fieldLabel}>{text('到期日期', 'Expiry date')}</Text>
                <TextInput
                  value={expiryDate}
                  onChangeText={setExpiryDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.light.textSecondary}
                  style={[styles.input, !validExpiryDate && styles.inputError]}
                />
                {!validExpiryDate ? (
                  <Text style={styles.fieldError}>
                    {text('请输入有效日期，并确保到期日期不早于购买日期。', 'Enter a valid date that is not earlier than the purchase date.')}
                  </Text>
                ) : null}
              </>
            ) : null}

            <Text style={styles.fieldLabel}>{text('开封状态', 'Opened status')}</Text>
            <View style={styles.expiryOptions}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: !hasOpened }}
                onPress={() => setHasOpened(false)}
                style={[styles.expiryOption, !hasOpened && styles.expiryOptionSelected]}>
                <Text style={[styles.expiryOptionText, !hasOpened && styles.expiryOptionTextSelected]}>{text('未开封', 'Unopened')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: hasOpened }}
                onPress={() => setHasOpened(true)}
                style={[styles.expiryOption, hasOpened && styles.expiryOptionSelected]}>
                <Text style={[styles.expiryOptionText, hasOpened && styles.expiryOptionTextSelected]}>{text('已开封', 'Opened')}</Text>
              </Pressable>
            </View>
            {hasOpened ? (
              <View style={styles.openedFields}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>{text('开封日期', 'Opened on')}</Text>
                  <TextInput value={openedAt} onChangeText={setOpenedAt} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.light.textSecondary} style={[styles.input, !validOpenedDate && styles.inputError]} />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>{text('开封后到期', 'Use by')}</Text>
                  <TextInput value={openedExpiryDate} onChangeText={setOpenedExpiryDate} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.light.textSecondary} style={[styles.input, !validOpenedDate && styles.inputError]} />
                </View>
              </View>
            ) : null}

            {library === '食材' ? (
              <>
                <Text style={styles.fieldLabel}>{text('做菜建议（选填）', 'Cooking ideas (optional)')}</Text>
                <TextInput
                  value={
                    editingItemId && language === 'en'
                      ? cookingSuggestion
                          .split('、')
                          .map((suggestion) => localizeContent(suggestion, language))
                          .join(', ')
                      : cookingSuggestion
                  }
                  onChangeText={setCookingSuggestion}
                  multiline
                  placeholder={text('例如：番茄炒蛋、番茄鸡蛋面', 'For example: tomato & eggs, tomato egg noodles')}
                  placeholderTextColor={Colors.light.textSecondary}
                  style={[styles.input, styles.suggestionInput]}
                />
              </>
            ) : null}

            <View style={styles.formHint}>
              <Text style={styles.formHintIcon}>💡</Text>
              <Text style={styles.formHintText}>
                {text(
                  `物品会加入${library}库；购买和到期日期可以在详情中随时查看。`,
                  `This item will be added to ${localizeContent(library, language)}. Purchase and expiry dates remain available in its details.`
                )}
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={selectedItem !== null}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={closeItemDetails}>
        <Animated.View style={[styles.detailModalPage, detailSwipeStyle]}>
          <View
            testID="detail-edge-swipe-zone"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.detailEdgeSwipeZone}
            {...detailPanResponder.panHandlers}
          />
          <View
            style={[
              styles.modalHeader,
              styles.detailModalHeader,
              {
                minHeight: Math.max(insets.top, 10) + 54,
                paddingTop: Math.max(insets.top, 10),
              },
            ]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isDetailEditing
                ? text('取消编辑', 'Cancel editing')
                : text('编辑物品', 'Edit item')}
              onPress={isDetailEditing ? cancelDetailEditing : editSelectedItem}
              hitSlop={8}
              style={({ pressed }) => [
                styles.detailHeaderButton,
                isDetailEditing ? styles.detailCancelButton : styles.detailEditButton,
                pressed && styles.detailHeaderButtonPressed,
              ]}>
              <Text style={isDetailEditing ? styles.modalCancel : styles.modalEdit}>
                {isDetailEditing ? text('取消', 'Cancel') : text('编辑', 'Edit')}
              </Text>
            </Pressable>
            <Text style={[styles.modalTitle, styles.detailHeaderTitle]}>
              {isDetailEditing ? text('编辑物品', 'Edit item') : text('库存详情', 'Item details')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isDetailEditing
                ? text('保存物品', 'Save item')
                : text('关闭详情', 'Close details')}
              disabled={isDetailEditing && !canSave}
              onPress={isDetailEditing ? saveDetailEdits : closeItemDetails}
              hitSlop={8}
              style={({ pressed }) => [
                styles.detailHeaderButton,
                styles.detailDoneButton,
                isDetailEditing && !canSave && styles.detailHeaderButtonDisabled,
                pressed && styles.detailHeaderButtonPressed,
              ]}>
              <Text style={styles.detailDoneText}>
                {isDetailEditing ? text('保存', 'Save') : text('完成', 'Done')}
              </Text>
            </Pressable>
          </View>

          {selectedItem ? (
            <ScrollView
              contentInsetAdjustmentBehavior="never"
              contentContainerStyle={[
                styles.detailContent,
                { paddingBottom: Math.max(insets.bottom, 18) + 42 },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {isDetailEditing ? (
                <View style={styles.detailInlineForm}>
                  <View style={styles.detailEditIntro}>
                    <View style={styles.detailEditEmojiPreview}>
                      <Text style={styles.detailEditEmojiPreviewText}>{emoji}</Text>
                    </View>
                    <View style={styles.detailEditIntroCopy}>
                      <Text style={styles.detailEditIntroTitle}>
                        {text('直接修改物品资料', 'Edit this item here')}
                      </Text>
                      <Text style={styles.detailEditIntroText}>
                        {text('保存后会留在当前详情页，不会再跳出新窗口。', 'After saving, you will stay on this details page.')}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.fieldLabel}>{text('放入哪个库', 'Inventory category')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.modalLibraryOptions}>
                    {libraries.map((option) => (
                      <Pressable
                        key={option.key}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: library === option.key }}
                        onPress={() => chooseLibrary(option.key)}
                        style={[
                          styles.modalLibraryOption,
                          library === option.key && styles.modalLibraryOptionSelected,
                          library === option.key && {
                            backgroundColor: colorWithAlpha(option.color, '1F'),
                            borderColor: option.color,
                          },
                        ]}>
                        <Text style={styles.modalLibraryEmoji}>{option.emoji}</Text>
                        <Text
                          style={[
                            styles.modalLibraryLabel,
                            library === option.key && styles.modalLibraryLabelSelected,
                            library === option.key && { color: option.color },
                          ]}>
                          {localizeContent(option.key, language)}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <Text style={styles.fieldLabel}>{text('选择 Emoji', 'Choose an emoji')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.emojiOptions}>
                    {getEmojiOptions(library).map((option) => (
                      <Pressable
                        key={option}
                        accessibilityRole="radio"
                        accessibilityLabel={text(`选择 ${option}`, `Choose ${option}`)}
                        accessibilityState={{ checked: emoji === option }}
                        onPress={() => setEmoji(option)}
                        style={[styles.emojiOption, emoji === option && styles.emojiOptionSelected]}>
                        <Text style={styles.emojiOptionText}>{option}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View style={styles.customEmojiRow}>
                    <Text style={styles.customEmojiHint}>{text('自定义', 'Custom')}</Text>
                    <TextInput
                      accessibilityLabel={text('自定义 Emoji', 'Custom emoji')}
                      value={emoji}
                      onChangeText={setEmoji}
                      maxLength={16}
                      placeholder={text('输入 Emoji', 'Enter an emoji')}
                      placeholderTextColor={Colors.light.textSecondary}
                      style={styles.customEmojiInput}
                    />
                  </View>

                  <Text style={styles.fieldLabel}>{text('物品名称', 'Item name')}</Text>
                  <TextInput
                    accessibilityLabel={text('物品名称', 'Item name')}
                    value={name}
                    onChangeText={setName}
                    placeholder={text('输入物品名称', 'Enter item name')}
                    placeholderTextColor={Colors.light.textSecondary}
                    style={styles.input}
                  />

                  <View style={styles.fieldRow}>
                    <View style={styles.flexField}>
                      <Text style={styles.fieldLabel}>{text('数量', 'Quantity')}</Text>
                      <TextInput
                        accessibilityLabel={text('数量', 'Quantity')}
                        value={quantity}
                        onChangeText={setQuantity}
                        keyboardType="decimal-pad"
                        style={styles.input}
                      />
                    </View>
                    <View style={styles.flexField}>
                      <Text style={styles.fieldLabel}>{text('单位', 'Unit')}</Text>
                      <TextInput
                        accessibilityLabel={text('单位', 'Unit')}
                        value={unit}
                        onChangeText={setUnit}
                        style={styles.input}
                      />
                    </View>
                  </View>
                  <View style={styles.unitPresetRow}>
                    {getUnitPresets(library).map((option) => (
                      <Pressable
                        key={option}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: unit === option }}
                        onPress={() => setUnit(option)}
                        style={[styles.unitPreset, unit === option && styles.unitPresetSelected]}>
                        <Text style={[styles.unitPresetText, unit === option && styles.unitPresetTextSelected]}>
                          {localizeContent(option, language)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {library === '饮料' ? (
                    <>
                      <Text style={styles.fieldLabel}>
                        {text(`每${unit || '份'}容量（毫升）`, `Volume per ${localizeContent(unit || 'item', language)} (mL)`)}
                      </Text>
                      <TextInput
                        accessibilityLabel={text('每份容量', 'Volume per item')}
                        value={volumeMl}
                        onChangeText={setVolumeMl}
                        keyboardType="decimal-pad"
                        placeholder="500"
                        placeholderTextColor={Colors.light.textSecondary}
                        style={[styles.input, !validVolume && styles.inputError]}
                      />
                    </>
                  ) : null}

                  <Text style={styles.fieldLabel}>{text('存放位置', 'Storage location')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.storageOptions}>
                    {storageLocations.map((option) => (
                      <Pressable
                        key={option}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: storage === option }}
                        onPress={() => chooseStorage(option)}
                        style={[styles.storageOption, storage === option && styles.storageOptionSelected]}>
                        <Text style={[styles.storageOptionText, storage === option && styles.storageOptionTextSelected]}>
                          {localizeContent(option, language)}
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={text('新增存放位置', 'Add storage location')}
                      onPress={() => setIsAddingStorage(true)}
                      style={styles.addStorageOption}>
                      <Text style={styles.addStorageOptionText}>＋ {text('新增位置', 'New location')}</Text>
                    </Pressable>
                  </ScrollView>
                  {isAddingStorage ? (
                    <View style={styles.inlineCreateRow}>
                      <TextInput
                        accessibilityLabel={text('新存放位置名称', 'New storage location name')}
                        value={newStorageName}
                        onChangeText={setNewStorageName}
                        placeholder={text('例如：咖啡柜', 'For example: Coffee cabinet')}
                        placeholderTextColor={Colors.light.textSecondary}
                        style={[styles.input, styles.inlineCreateInput]}
                      />
                      <Pressable
                        accessibilityRole="button"
                        disabled={!newStorageName.trim()}
                        onPress={saveCustomStorage}
                        style={[styles.inlineCreateButton, !newStorageName.trim() && styles.modalSaveDisabled]}>
                        <Text style={styles.inlineCreateButtonText}>{text('添加', 'Add')}</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <Text style={styles.fieldLabel}>{text('购买日期', 'Purchase date')}</Text>
                  <TextInput
                    accessibilityLabel={text('购买日期', 'Purchase date')}
                    value={purchaseDate}
                    onChangeText={setPurchaseDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.light.textSecondary}
                    style={[styles.input, !validPurchaseDate && styles.inputError]}
                  />

                  <Text style={styles.fieldLabel}>{text('保质期', 'Expiry')}</Text>
                  <View style={styles.expiryOptions}>
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: hasExpiry }}
                      onPress={() => setHasExpiry(true)}
                      style={[styles.expiryOption, hasExpiry && styles.expiryOptionSelected]}>
                      <Text style={[styles.expiryOptionText, hasExpiry && styles.expiryOptionTextSelected]}>
                        {text('有具体日期', 'Specific date')}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: !hasExpiry }}
                      onPress={() => setHasExpiry(false)}
                      style={[styles.expiryOption, !hasExpiry && styles.expiryOptionSelected]}>
                      <Text style={[styles.expiryOptionText, !hasExpiry && styles.expiryOptionTextSelected]}>
                        {text('无固定日期', 'No fixed date')}
                      </Text>
                    </Pressable>
                  </View>
                  {hasExpiry ? (
                    <TextInput
                      accessibilityLabel={text('到期日期', 'Expiry date')}
                      value={expiryDate}
                      onChangeText={setExpiryDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={Colors.light.textSecondary}
                      style={[styles.input, !validExpiryDate && styles.inputError]}
                    />
                  ) : null}

                  <Text style={styles.fieldLabel}>{text('开封状态', 'Opened status')}</Text>
                  <View style={styles.expiryOptions}>
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: !hasOpened }}
                      onPress={() => setHasOpened(false)}
                      style={[styles.expiryOption, !hasOpened && styles.expiryOptionSelected]}>
                      <Text style={[styles.expiryOptionText, !hasOpened && styles.expiryOptionTextSelected]}>{text('未开封', 'Unopened')}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: hasOpened }}
                      onPress={() => setHasOpened(true)}
                      style={[styles.expiryOption, hasOpened && styles.expiryOptionSelected]}>
                      <Text style={[styles.expiryOptionText, hasOpened && styles.expiryOptionTextSelected]}>{text('已开封', 'Opened')}</Text>
                    </Pressable>
                  </View>
                  {hasOpened ? (
                    <View style={styles.openedFields}>
                      <View style={styles.halfField}>
                        <Text style={styles.fieldLabel}>{text('开封日期', 'Opened on')}</Text>
                        <TextInput value={openedAt} onChangeText={setOpenedAt} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.light.textSecondary} style={[styles.input, !validOpenedDate && styles.inputError]} />
                      </View>
                      <View style={styles.halfField}>
                        <Text style={styles.fieldLabel}>{text('开封后到期', 'Use by')}</Text>
                        <TextInput value={openedExpiryDate} onChangeText={setOpenedExpiryDate} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.light.textSecondary} style={[styles.input, !validOpenedDate && styles.inputError]} />
                      </View>
                    </View>
                  ) : null}

                  {shelfLifeSuggestion ? (
                    <View style={styles.detailShelfSuggestion}>
                      <Ionicons name="sparkles-outline" size={18} color={Colors.light.primary} />
                      <View style={styles.detailShelfSuggestionCopy}>
                        <Text style={styles.detailShelfSuggestionTitle}>{shelfLifeSuggestion.title}</Text>
                        <Text style={styles.detailShelfSuggestionText}>{shelfLifeSuggestion.rangeLabel}</Text>
                      </View>
                      {shelfLifeSuggestion.recommendedDays ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={text('应用建议保质期', 'Apply suggested expiry date')}
                          onPress={applyShelfLifeSuggestion}
                          style={styles.detailShelfSuggestionButton}>
                          <Text style={styles.detailShelfSuggestionButtonText}>{text('应用', 'Apply')}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  {library === '食材' ? (
                    <>
                      <Text style={styles.fieldLabel}>{text('做菜建议', 'Cooking ideas')}</Text>
                      <TextInput
                        accessibilityLabel={text('做菜建议', 'Cooking ideas')}
                        value={cookingSuggestion}
                        onChangeText={setCookingSuggestion}
                        multiline
                        placeholder={text('例如：番茄炒蛋、番茄鸡蛋面', 'For example: tomato & eggs, tomato egg noodles')}
                        placeholderTextColor={Colors.light.textSecondary}
                        style={[styles.input, styles.suggestionInput]}
                      />
                    </>
                  ) : null}

                  <Text style={styles.fieldLabel}>{text('条形码（可选）', 'Barcode (optional)')}</Text>
                  <TextInput
                    accessibilityLabel={text('条形码', 'Barcode')}
                    value={barcode}
                    onChangeText={setBarcode}
                    keyboardType="number-pad"
                    placeholder={text('没有可留空', 'Leave blank if unavailable')}
                    placeholderTextColor={Colors.light.textSecondary}
                    style={styles.input}
                  />
                </View>
              ) : (
                <>
              <View style={styles.detailHero}>
                <View style={styles.detailEmojiBox}>
                  <Text style={styles.detailEmoji}>{selectedItem.emoji}</Text>
                </View>
                <Text style={styles.detailName}>{localizeContent(selectedItem.name, language)}</Text>
                <View style={styles.detailBadges}>
                  <View
                    style={[
                      styles.detailLibraryBadge,
                      {
                        backgroundColor: colorWithAlpha(
                          getLibraryColor(selectedItem.library),
                          '1F'
                        ),
                      },
                    ]}>
                    <Text
                      style={[
                        styles.detailLibraryBadgeText,
                        { color: getLibraryColor(selectedItem.library) },
                      ]}>
                      {localizeContent(`${selectedItem.library}库`, language)}
                    </Text>
                  </View>
                  <View style={styles.detailCategoryBadge}>
                    <Text style={styles.detailCategoryBadgeText}>
                      {localizeContent(selectedItem.category, language)}
                    </Text>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.detailStatus,
                  effectiveExpiryDate(selectedItem) && selectedItem.daysLeft <= 3
                    ? styles.detailStatusUrgent
                    : null,
                ]}>
                <Text style={styles.detailStatusIcon}>
                  {effectiveExpiryDate(selectedItem) && selectedItem.daysLeft <= 3 ? '⏳' : '✓'}
                </Text>
                <View style={styles.detailStatusCopy}>
                  <Text style={styles.detailStatusTitle}>{expiryLabel(selectedItem, language)}</Text>
                  <Text style={styles.detailStatusText}>
                    {effectiveExpiryDate(selectedItem)
                      ? text(
                          `${selectedItem.openedExpiryDate ? '开封后建议使用至' : '到期日'}：${formatFullDate(effectiveExpiryDate(selectedItem)!, locale)}`,
                          `${selectedItem.openedExpiryDate ? 'Use after opening by' : 'Expires'}: ${formatFullDate(effectiveExpiryDate(selectedItem)!, locale)}`
                        )
                      : text('这个物品没有设置固定到期日期', 'This item has no fixed expiry date')}
                  </Text>
                </View>
              </View>

              <View style={styles.detailGrid}>
                <View style={styles.detailInfoCard}>
                  <Text style={styles.detailInfoLabel}>{text('购买日期', 'Purchased')}</Text>
                  <Text style={styles.detailInfoValue}>{formatFullDate(selectedItem.purchaseDate, locale)}</Text>
                </View>
                {selectedItem.openedAt ? (
                  <View style={styles.detailInfoCard}>
                    <Text style={styles.detailInfoLabel}>{text('开封日期', 'Opened')}</Text>
                    <Text style={styles.detailInfoValue}>{formatFullDate(selectedItem.openedAt, locale)}</Text>
                  </View>
                ) : null}
                <View style={styles.detailInfoCard}>
                  <Text style={styles.detailInfoLabel}>{text('存放位置', 'Location')}</Text>
                  <Text style={styles.detailInfoValue}>{localizeContent(selectedItem.storage, language)}</Text>
                </View>
                <View style={styles.detailInfoCard}>
                  <Text style={styles.detailInfoLabel}>{text('当前数量', 'Quantity')}</Text>
                  <Text style={styles.detailInfoValue}>
                    {formatAmount(formatQuantity(selectedItem.quantity), selectedItem.unit, language)}
                  </Text>
                </View>
                <View style={styles.detailInfoCard}>
                  <Text style={styles.detailInfoLabel}>{text('保质期', 'Expiry')}</Text>
                  <Text style={styles.detailInfoValue}>
                    {selectedItem.expiryDate
                      ? text('已设置日期', 'Date set')
                      : text('无固定日期', 'No fixed date')}
                  </Text>
                </View>
                {selectedItem.volumeMlPerUnit ? (
                  <>
                    <View style={styles.detailInfoCard}>
                      <Text style={styles.detailInfoLabel}>
                        {text(`每${selectedItem.unit}容量`, `Per ${localizeContent(selectedItem.unit, language)}`)}
                      </Text>
                      <Text style={styles.detailInfoValue}>{selectedItem.volumeMlPerUnit} mL</Text>
                    </View>
                    <View style={styles.detailInfoCard}>
                      <Text style={styles.detailInfoLabel}>{text('总容量', 'Total volume')}</Text>
                      <Text style={styles.detailInfoValue}>
                        {formatQuantity(selectedItem.quantity * selectedItem.volumeMlPerUnit)} mL
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>

              <View style={styles.batchCard}>
                <View style={styles.batchIcon}>
                  <Text style={styles.batchIconText}>#</Text>
                </View>
                <View style={styles.batchCopy}>
                  <Text style={styles.batchTitle}>{text('独立库存批次', 'Separate inventory batch')}</Text>
                  <Text style={styles.batchText}>
                    {text(
                      `批次 ${selectedItem.batchId ?? selectedItem.id} · 按最早到期优先扣减`,
                      `Batch ${selectedItem.batchId ?? selectedItem.id} · earliest expiry is used first`
                    )}
                  </Text>
                </View>
              </View>

              <View style={styles.quickAdjustCard}>
                <View style={styles.quickAdjustCopy}>
                  <Text style={styles.quickAdjustTitle}>{text('快速调整数量', 'Quick quantity adjustment')}</Text>
                  <Text style={styles.quickAdjustValue}>
                    {formatAmount(formatQuantity(selectedItem.quantity), selectedItem.unit, language)}
                  </Text>
                </View>
                <View style={styles.quickAdjustActions}>
                  {(() => {
                    const step = ['克', 'g'].includes(selectedItem.unit)
                      ? 50
                      : ['毫升', 'mL', 'ml'].includes(selectedItem.unit)
                        ? 100
                        : 1;
                    return (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={text('减少库存数量', 'Decrease stock quantity')}
                          onPress={() => {
                            const delta = -Math.min(step, selectedItem.quantity);
                            adjustInventoryQuantity(selectedItem.id, delta);
                            setSelectedItem((current) =>
                              current
                                ? { ...current, quantity: Math.max(0, current.quantity + delta) }
                                : current
                            );
                          }}
                          style={styles.quickAdjustButton}>
                          <Text style={styles.quickAdjustButtonText}>−{step}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={text('增加库存数量', 'Increase stock quantity')}
                          onPress={() => {
                            adjustInventoryQuantity(selectedItem.id, step);
                            setSelectedItem((current) =>
                              current ? { ...current, quantity: current.quantity + step } : current
                            );
                          }}
                          style={styles.quickAdjustButton}>
                          <Text style={styles.quickAdjustButtonText}>＋{step}</Text>
                        </Pressable>
                      </>
                    );
                  })()}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={text('标记为已用完', 'Mark as finished')}
                    disabled={selectedItem.quantity <= 0}
                    onPress={() => {
                      adjustInventoryQuantity(selectedItem.id, -selectedItem.quantity);
                      setSelectedItem((current) => (current ? { ...current, quantity: 0 } : current));
                    }}
                    style={[styles.finishedButton, selectedItem.quantity <= 0 && styles.adjustDisabled]}>
                    <Text style={styles.finishedButtonText}>{text('已用完', 'Finished')}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.historySection}>
                <View style={styles.suggestionHeader}>
                  <Text style={styles.suggestionTitle}>{text('库存记录', 'Stock history')}</Text>
                  <Text style={styles.suggestionDetail}>{text('最近 5 条', 'Latest 5')}</Text>
                </View>
                {selectedItemTransactions.length > 0 ? (
                  <View style={styles.historyList}>
                    {selectedItemTransactions.map((transaction) => {
                      const reason =
                        transaction.reason === 'added'
                          ? text('加入库存', 'Added')
                          : transaction.reason === 'cooked'
                            ? text('烹饪消耗', 'Used for cooking')
                            : transaction.reason === 'restored'
                              ? text('撤销做菜，已补回', 'Restored after undo')
                            : transaction.reason === 'deleted'
                              ? text('删除物品', 'Deleted')
                            : transaction.reason === 'finished'
                              ? text('已经吃完', 'Finished')
                            : transaction.reason === 'expired'
                              ? text('过期处理', 'Expired')
                            : transaction.reason === 'discarded'
                              ? text('其他原因丢弃', 'Discarded')
                              : text('数量调整', 'Quantity adjusted');
                      return (
                        <View key={transaction.id} style={styles.historyRow}>
                          <View style={styles.historyCopy}>
                            <Text style={styles.historyReason}>{reason}</Text>
                            <Text style={styles.historyDate}>
                              {new Intl.DateTimeFormat(locale, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              }).format(new Date(transaction.createdAt))}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.historyAmount,
                              transaction.amount > 0 && styles.historyAmountPositive,
                            ]}>
                            {transaction.amount > 0 ? '+' : ''}
                            {formatAmount(
                              formatQuantity(transaction.amount),
                              transaction.unit,
                              language
                            )}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.emptySuggestion}>
                    {text('这个批次还没有数量变动。', 'No quantity changes for this batch yet.')}
                  </Text>
                )}
              </View>

              {selectedItem.library === '食材' ? (
                <View style={styles.suggestionSection}>
                  <View style={styles.suggestionHeader}>
                    <Text style={styles.suggestionTitle}>{text('做菜建议', 'Cooking ideas')}</Text>
                    <Text style={styles.suggestionDetail}>{text('按这个食材推荐', 'Ideas for this ingredient')}</Text>
                  </View>
                  {selectedItem.cookingSuggestions?.length ? (
                    <View style={styles.suggestionList}>
                      {selectedItem.cookingSuggestions.map((suggestion) => (
                        <View key={suggestion} style={styles.suggestionRow}>
                          <Text style={styles.suggestionIcon}>🍳</Text>
                          <Text style={styles.suggestionText}>{localizeContent(suggestion, language)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptySuggestion}>
                      {text('还没有做菜建议，可在新增食材时填写。', 'No cooking ideas yet. Add them while creating or editing the item.')}
                    </Text>
                  )}
                </View>
              ) : null}
                </>
              )}
            </ScrollView>
          ) : null}
        </Animated.View>
      </Modal>

      <Modal
        visible={disposalItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDisposalItem(null)}>
        <View style={styles.disposalBackdrop}>
          <View style={[styles.disposalCard, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.disposalHandle} />
            <View style={styles.disposalHero}>
              <View style={styles.disposalEmojiBox}>
                <Text style={styles.disposalEmoji}>{disposalItem?.emoji}</Text>
              </View>
              <Text style={styles.disposalTitle}>{text('这件物品怎么处理了？', 'What happened to this item?')}</Text>
              <Text style={styles.disposalSubtitle}>
                {disposalItem
                  ? text(
                      `记录「${disposalItem.name}」的去向，帮助生成节约报告。`,
                      `Record what happened to ${localizeContent(disposalItem.name, 'en')} for your savings report.`
                    )
                  : ''}
              </Text>
            </View>
            <View style={styles.disposalOptions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('已经吃完', 'Finished')}
                onPress={() => confirmItemDisposal('finished')}
                style={({ pressed }) => [styles.disposalOption, styles.disposalFinished, pressed && styles.chipPressed]}>
                <View style={[styles.disposalOptionIcon, { backgroundColor: '#DDEFE3' }]}>
                  <Text style={styles.disposalOptionEmoji}>😋</Text>
                </View>
                <View style={styles.disposalOptionCopy}>
                  <Text style={styles.disposalOptionTitle}>{text('已经吃完', 'Finished')}</Text>
                  <Text style={styles.disposalOptionText}>{text('正常消耗，不计入浪费', 'Used normally; not counted as waste')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.light.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('过期丢弃', 'Expired')}
                onPress={() => confirmItemDisposal('expired')}
                style={({ pressed }) => [styles.disposalOption, styles.disposalExpired, pressed && styles.chipPressed]}>
                <View style={[styles.disposalOptionIcon, { backgroundColor: Colors.light.dangerSoft }]}>
                  <Text style={styles.disposalOptionEmoji}>⏰</Text>
                </View>
                <View style={styles.disposalOptionCopy}>
                  <Text style={styles.disposalOptionTitle}>{text('过期丢弃', 'Expired')}</Text>
                  <Text style={styles.disposalOptionText}>{text('计入过期浪费统计', 'Counts toward expired food waste')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.light.danger} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('其他原因丢弃', 'Discarded for another reason')}
                onPress={() => confirmItemDisposal('discarded')}
                style={({ pressed }) => [styles.disposalOption, styles.disposalDiscarded, pressed && styles.chipPressed]}>
                <View style={[styles.disposalOptionIcon, { backgroundColor: Colors.light.warningSoft }]}>
                  <Text style={styles.disposalOptionEmoji}>🗑️</Text>
                </View>
                <View style={styles.disposalOptionCopy}>
                  <Text style={styles.disposalOptionTitle}>{text('其他原因丢弃', 'Discarded')}</Text>
                  <Text style={styles.disposalOptionText}>{text('变质、口味或其他原因', 'Spoilage, preference, or another reason')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.light.warning} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('取消处理', 'Cancel')}
              onPress={() => setDisposalItem(null)}
              style={({ pressed }) => [styles.disposalCancel, pressed && styles.chipPressed]}>
              <Text style={styles.disposalCancelText}>{text('取消', 'Cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isCreatingLibrary}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsCreatingLibrary(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('取消新建库', 'Cancel new category')}
              onPress={() => setIsCreatingLibrary(false)}
              hitSlop={12}>
              <Text style={styles.modalCancel}>{text('取消', 'Cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{text('新建库存库', 'New inventory category')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('保存新库存库', 'Save new inventory category')}
              disabled={!canCreateLibrary}
              onPress={saveCustomLibrary}
              hitSlop={12}>
              <Text style={[styles.modalSave, !canCreateLibrary && styles.modalSaveDisabled]}>
                {text('保存', 'Save')}
              </Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>{text('库名称', 'Category name')}</Text>
            <TextInput
              autoFocus
              value={newLibraryName}
              onChangeText={setNewLibraryName}
              placeholder={text('例如：咖啡、宠物食品', 'For example: Coffee, Pet food')}
              placeholderTextColor={Colors.light.textSecondary}
              style={styles.input}
            />
            {normalizedLibraryName && !canCreateLibrary ? (
              <Text style={styles.fieldError}>
                {text('这个库已经存在，请换一个名称。', 'This category already exists. Choose another name.')}
              </Text>
            ) : null}

            <Text style={styles.fieldLabel}>{text('选择 Emoji', 'Choose an emoji')}</Text>
            <View style={styles.customChoiceGrid}>
              {customLibraryEmojis.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={text(`自定义库图标 ${option}`, `Category icon ${option}`)}
                  accessibilityState={{ checked: newLibraryEmoji === option }}
                  onPress={() => setNewLibraryEmoji(option)}
                  style={[
                    styles.emojiOption,
                    newLibraryEmoji === option && styles.emojiOptionSelected,
                  ]}>
                  <Text style={styles.emojiOptionText}>{option}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{text('库颜色', 'Category colour')}</Text>
            <View style={styles.customChoiceGrid}>
              {customLibraryColors.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={text(`选择颜色 ${option}`, `Choose colour ${option}`)}
                  accessibilityState={{ checked: newLibraryColor === option }}
                  onPress={() => setNewLibraryColor(option)}
                  style={[
                    styles.colorOption,
                    { backgroundColor: option },
                    newLibraryColor === option && styles.colorOptionSelected,
                  ]}>
                  {newLibraryColor === option ? <Text style={styles.colorCheck}>✓</Text> : null}
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{text('预览', 'Preview')}</Text>
            <View style={[styles.libraryPreview, { backgroundColor: newLibraryColor }]}>
              <Text style={styles.libraryPreviewEmoji}>{newLibraryEmoji}</Text>
              <View style={styles.libraryPreviewCopy}>
                <Text style={styles.libraryPreviewName}>
                  {normalizedLibraryName
                    ? text(`${normalizedLibraryName}库`, normalizedLibraryName)
                    : text('自定义库', 'Custom category')}
                </Text>
                <Text style={styles.libraryPreviewDetail}>{text('0 项库存', '0 items')}</Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isTrashOpen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsTrashOpen(false)}>
        <View style={styles.trashPage}>
          <View style={[styles.trashHeader, { paddingTop: Math.max(insets.top, 12) }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('关闭最近删除', 'Close recently deleted')}
              onPress={() => setIsTrashOpen(false)}
              style={styles.trashCloseButton}>
              <Text style={styles.trashCloseText}>×</Text>
            </Pressable>
            <View style={styles.trashHeaderCopy}>
              <Text style={styles.trashHeaderTitle}>{text('最近删除', 'Recently deleted')}</Text>
              <Text style={styles.trashHeaderSubtitle}>
                {text(`${deletedInventory.length} 条库存记录`, `${deletedInventory.length} inventory records`)}
              </Text>
            </View>
            <View style={styles.trashHeaderPlaceholder} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.trashList, { paddingBottom: Math.max(insets.bottom, 18) + 30 }]}>
            <View style={styles.trashIntroCard}>
              <View style={styles.trashIntroIcon}><Text style={styles.trashIntroEmoji}>🧺</Text></View>
              <View style={styles.trashIntroCopy}>
                <Text style={styles.trashIntroTitle}>{text('删除的库存都在这里', 'Deleted inventory stays here')}</Text>
                <Text style={styles.trashIntroText}>{text('最多保留最近 100 条记录；恢复后会作为独立批次回到库存。', 'Up to 100 recent records are kept. Restored items return as a separate batch.')}</Text>
              </View>
            </View>
            {deletedInventory.length ? deletedInventory.map((record) => (
              <View key={record.id} style={styles.trashCard}>
                <Text style={styles.trashEmoji}>{record.item.emoji}</Text>
                <View style={styles.trashCopy}>
                  <Text style={styles.trashName}>{localizeContent(record.item.name, language)}</Text>
                  <Text style={styles.trashMeta}>{formatAmount(formatQuantity(record.item.quantity), record.item.unit, language)} · {new Date(record.deletedAt).toLocaleDateString(locale)}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={text(`恢复${record.item.name}`, `Restore ${record.item.name}`)} onPress={() => restoreDeletedInventoryItem(record.id)} style={styles.restoreButton}>
                  <Text style={styles.restoreButtonText}>{text('恢复', 'Restore')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={text(`永久删除${record.item.name}`, `Delete ${record.item.name} permanently`)} onPress={() => permanentlyDeleteInventoryItem(record.id)} hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={23} color={Colors.light.textSecondary} />
                </Pressable>
              </View>
            )) : (
              <View style={styles.trashEmpty}>
                <Text style={styles.trashEmptyEmoji}>✨</Text>
                <Text style={styles.trashEmptyTitle}>{text('这里还是空的', 'Nothing here yet')}</Text>
                <Text style={styles.trashHint}>{text('删除、吃完或丢弃的库存会暂存在这里。', 'Deleted, finished, and discarded stock will appear here.')}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      <BarcodeScanner
        visible={isScannerOpen}
        language={language}
        onClose={() => setIsScannerOpen(false)}
        onScanned={(value) => void handleBarcodeScanned(value)}
      />

      {storageCelebration ? (
        <StorageCelebration
          emoji={storageCelebration.emoji}
          itemName={storageCelebration.itemName}
          storage={storageCelebration.storage}
          language={language}
          onComplete={closeStorageCelebration}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  openedFields: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  halfField: { flex: 1, gap: 5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shoppingButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  shoppingButtonIcon: { fontSize: 20 },
  shoppingBadge: { position: 'absolute', top: -3, right: -2, minWidth: 19, height: 19, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 10, borderWidth: 2, borderColor: Colors.light.background, backgroundColor: Colors.light.danger },
  shoppingBadgeText: { color: '#FFFFFF', fontSize: 8.5, fontWeight: '900' },
  trashPage: { flex: 1, backgroundColor: Colors.light.background },
  trashHeader: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.background },
  trashCloseButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  trashCloseText: { color: Colors.light.text, fontSize: 27, lineHeight: 29, fontWeight: '500' },
  trashHeaderCopy: { alignItems: 'center', gap: 2 },
  trashHeaderTitle: { color: Colors.light.text, fontSize: 16, fontWeight: '900' },
  trashHeaderSubtitle: { color: Colors.light.textSecondary, fontSize: 10, fontWeight: '700' },
  trashHeaderPlaceholder: { width: 42, height: 42 },
  trashList: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 12, padding: 18, paddingBottom: 40 },
  trashIntroCard: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 17, borderRadius: 23, backgroundColor: Colors.light.primary },
  trashIntroIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#FFFFFF24' },
  trashIntroEmoji: { fontSize: 34 },
  trashIntroCopy: { flex: 1, gap: 5 },
  trashIntroTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  trashIntroText: { color: '#DDEDE3', fontSize: 10.5, lineHeight: 16, fontWeight: '600' },
  trashHint: { color: Colors.light.textSecondary, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  trashCard: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  trashEmoji: { fontSize: 27 },
  trashCopy: { flex: 1, gap: 4 },
  trashName: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  trashMeta: { color: Colors.light.textSecondary, fontSize: 10 },
  restoreButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.light.primarySoft },
  restoreButtonText: { color: Colors.light.primary, fontSize: 11, fontWeight: '900' },
  trashEmpty: { alignItems: 'center', gap: 8, paddingVertical: 70 },
  trashEmptyEmoji: { fontSize: 48 },
  trashEmptyTitle: { color: Colors.light.text, fontSize: 17, fontWeight: '900' },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonIcon: { color: '#FFFFFF', fontSize: 27, lineHeight: 29, fontWeight: '500' },
  librarySection: { gap: 11 },
  libraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  libraryTitle: { color: Colors.light.text, fontSize: 18, fontWeight: '800' },
  libraryTotal: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '700' },
  libraryScroller: { gap: 9, paddingRight: Spacing.three },
  libraryChip: {
    minWidth: 112,
    minHeight: 58,
    paddingHorizontal: 12,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  libraryChipSelected: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  chipPressed: { transform: [{ scale: 0.97 }] },
  libraryEmoji: { fontSize: 23 },
  libraryChipCopy: { gap: 1 },
  libraryChipLabel: { color: Colors.light.text, fontSize: 14, fontWeight: '800' },
  libraryChipLabelSelected: { color: '#FFFFFF' },
  libraryChipCount: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '600' },
  libraryChipCountSelected: { color: '#D9EBE0' },
  newLibraryChip: {
    minWidth: 104,
    minHeight: 58,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primarySoft,
  },
  newLibraryPlus: { color: Colors.light.primary, fontSize: 20, fontWeight: '600' },
  newLibraryText: { color: Colors.light.primary, fontSize: 13, fontWeight: '800' },
  libraryDescription: { color: Colors.light.textSecondary, fontSize: 12, lineHeight: 17 },
  searchBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
    borderRadius: 17,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchInput: {
    flex: 1,
    minHeight: 50,
    paddingVertical: 0,
    color: Colors.light.text,
    fontSize: 15,
  },
  searchClearPressed: { opacity: 0.55 },
  storageFilterSection: { gap: 9 },
  storageFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  storageFilterTitle: { color: Colors.light.text, fontSize: 13, fontWeight: '800' },
  storageFilterActive: { color: Colors.light.primary, fontSize: 11, fontWeight: '800' },
  storageFilterScroller: { gap: 8, paddingRight: Spacing.three },
  storageFilterChip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  storageFilterChipSelected: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  storageFilterChipText: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '700' },
  storageFilterChipTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  storageFilterCount: {
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: Colors.light.backgroundElement,
  },
  storageFilterCountSelected: { backgroundColor: '#FFFFFF2E' },
  storageFilterCountText: {
    color: Colors.light.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  storageFilterCountTextSelected: { color: '#FFFFFF' },
  summaryCard: {
    backgroundColor: Colors.light.primary,
    borderRadius: 26,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  summaryCopy: { gap: 5 },
  summaryEyebrow: { color: '#CDE5D6', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  summaryTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  summaryText: { color: '#E4F0E8', fontSize: 14, lineHeight: 20 },
  summaryStats: { flexDirection: 'row', alignItems: 'center' },
  summaryStat: { flex: 1, gap: 2 },
  summaryDivider: {
    width: 1,
    height: 34,
    marginHorizontal: Spacing.four,
    backgroundColor: '#FFFFFF33',
  },
  summaryNumber: { color: '#FFFFFF', fontSize: 27, fontWeight: '800' },
  summaryLabel: { color: '#D6E9DD', fontSize: 12, fontWeight: '600' },
  expiryNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.warningSoft,
    borderRadius: 18,
    padding: Spacing.three,
    gap: 12,
  },
  noticeIcon: { fontSize: 24 },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { color: Colors.light.text, fontSize: 15, fontWeight: '800' },
  noticeText: { color: Colors.light.warning, fontSize: 13, lineHeight: 19 },
  section: { gap: Spacing.three },
  listToolbar: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  listToolbarLabel: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '800' },
  sortOptions: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 12, backgroundColor: Colors.light.backgroundElement },
  sortOption: { minWidth: 48, minHeight: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  sortOptionSelected: { backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  sortOptionText: { color: Colors.light.textSecondary, fontSize: 10, fontWeight: '800' },
  sortOptionTextSelected: { color: Colors.light.primary },
  emptySearch: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: 8,
    borderRadius: 22,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  emptySearchIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    borderRadius: 16,
    backgroundColor: Colors.light.backgroundElement,
  },
  emptySearchTitle: { color: Colors.light.text, fontSize: 16, fontWeight: '800' },
  emptySearchText: {
    color: Colors.light.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  searchAllButton: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  searchAllButtonText: { fontSize: 12, fontWeight: '800' },
  inventoryList: {
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  inventoryRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  swipeableRow: { backgroundColor: Colors.light.danger },
  swipeableContent: { backgroundColor: Colors.light.surface },
  deleteAction: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.light.danger,
  },
  deleteActionPressed: { backgroundColor: '#A53D36' },
  deleteActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  inventoryRowPressed: { backgroundColor: Colors.light.backgroundSelected },
  usedRow: { opacity: 0.45 },
  emojiBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.backgroundElement,
  },
  urgentEmojiBox: { backgroundColor: Colors.light.dangerSoft },
  emoji: { fontSize: 25 },
  itemCopy: { flex: 1, gap: 5 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  itemName: { color: Colors.light.text, fontSize: 16, fontWeight: '800' },
  libraryBadge: {
    backgroundColor: Colors.light.primarySoft,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  libraryBadgeText: { color: Colors.light.primary, fontSize: 10, fontWeight: '800' },
  storageBadge: {
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  storageText: { color: Colors.light.textSecondary, fontSize: 10, fontWeight: '700' },
  urgentBadge: { backgroundColor: Colors.light.dangerSoft },
  urgentText: { color: Colors.light.danger },
  expiryText: { color: Colors.light.textSecondary, fontSize: 12 },
  expiryUrgent: { color: Colors.light.danger, fontWeight: '700' },
  quantity: { color: Colors.light.text, fontSize: 18, fontWeight: '800' },
  quantityUnit: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '600' },
  quantityColumn: { alignItems: 'flex-end', gap: 3 },
  detailHint: { color: Colors.light.primary, fontSize: 10, fontWeight: '700' },
  modalPage: { flex: 1, backgroundColor: Colors.light.background },
  modalHeader: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  detailModalHeader: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    backgroundColor: Colors.light.background,
  },
  detailHeaderButton: {
    minWidth: 64,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  detailEditButton: { backgroundColor: Colors.light.primarySoft },
  detailCancelButton: { backgroundColor: Colors.light.backgroundElement },
  detailDoneButton: { backgroundColor: Colors.light.primary },
  detailHeaderButtonDisabled: { opacity: 0.38 },
  detailHeaderButtonPressed: { opacity: 0.68, transform: [{ scale: 0.96 }] },
  detailHeaderTitle: { flex: 1, textAlign: 'center', paddingHorizontal: 8 },
  detailDoneText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  modalCancel: { color: Colors.light.textSecondary, fontSize: 16, fontWeight: '600' },
  modalEdit: { color: Colors.light.primary, fontSize: 16, fontWeight: '800' },
  modalTitle: { color: Colors.light.text, fontSize: 17, fontWeight: '800' },
  modalSave: { color: Colors.light.primary, fontSize: 16, fontWeight: '800' },
  modalSaveDisabled: { opacity: 0.35 },
  form: { padding: 22, gap: 13 },
  quickPresetSection: { gap: 9, marginBottom: 2 },
  quickPresetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quickPresetHint: { color: Colors.light.textSecondary, fontSize: 9.5 },
  quickPresetList: { gap: 8, paddingRight: 8 },
  quickPresetChip: { minWidth: 88, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 16, backgroundColor: Colors.light.primarySoft },
  quickPresetEmoji: { fontSize: 20 },
  quickPresetName: { color: Colors.light.primary, fontSize: 11, fontWeight: '900' },
  scanBarcodeButton: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderRadius: 17, borderWidth: 1, borderColor: '#B7DCC5', backgroundColor: Colors.light.primarySoft },
  scanBarcodeCopy: { flex: 1, gap: 3 },
  scanBarcodeTitle: { color: Colors.light.primary, fontSize: 12, fontWeight: '900' },
  scanBarcodeText: { color: Colors.light.textSecondary, fontSize: 9.5 },
  scanBarcodeChevron: { color: Colors.light.primary, fontSize: 22 },
  scanStatus: { color: Colors.light.primary, fontSize: 10.5, lineHeight: 16, fontWeight: '700' },
  fieldLabel: { color: Colors.light.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    color: Colors.light.text,
    fontSize: 16,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  inputError: { borderColor: Colors.light.danger },
  fieldError: { color: Colors.light.danger, fontSize: 12, lineHeight: 17 },
  suggestionInput: {
    minHeight: 96,
    paddingTop: 14,
    paddingBottom: 14,
    textAlignVertical: 'top',
  },
  fieldRow: { flexDirection: 'row', gap: 12 },
  flexField: { flex: 1, gap: 13 },
  modalLibraryOptions: { gap: 9, paddingRight: 18 },
  modalLibraryOption: {
    minWidth: 75,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  modalLibraryOptionSelected: {
    backgroundColor: Colors.light.primarySoft,
    borderColor: Colors.light.primary,
  },
  modalLibraryEmoji: { fontSize: 21 },
  modalLibraryLabel: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '700' },
  modalLibraryLabelSelected: { color: Colors.light.primary, fontWeight: '800' },
  emojiOptions: { gap: 9, paddingRight: 18 },
  emojiOption: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  emojiOptionSelected: {
    backgroundColor: Colors.light.primarySoft,
    borderColor: Colors.light.primary,
  },
  emojiOptionText: { fontSize: 25 },
  customEmojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  customEmojiHint: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '700' },
  customEmojiInput: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    color: Colors.light.text,
    fontSize: 18,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  unitPresetRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  unitPreset: {
    minWidth: 46,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: Colors.light.backgroundElement,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  unitPresetSelected: {
    backgroundColor: Colors.light.primarySoft,
    borderColor: Colors.light.primary,
  },
  unitPresetText: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '700' },
  unitPresetTextSelected: { color: Colors.light.primary, fontWeight: '800' },
  unitCustomHint: { color: Colors.light.textSecondary, fontSize: 10, fontWeight: '600' },
  storageOptions: { gap: 7, paddingRight: 14 },
  storageOption: {
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 13,
    backgroundColor: Colors.light.backgroundElement,
  },
  storageOptionSelected: { backgroundColor: Colors.light.primary },
  storageOptionText: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '700' },
  storageOptionTextSelected: { color: '#FFFFFF' },
  shelfSuggestionCard: {
    gap: 12,
    marginTop: 4,
    padding: 15,
    borderRadius: 18,
    backgroundColor: Colors.light.primarySoft,
    borderWidth: 1,
    borderColor: '#BED9C8',
  },
  shelfSuggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shelfSuggestionIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFFA8',
  },
  shelfSuggestionHeading: { flex: 1, gap: 2 },
  shelfSuggestionEyebrow: {
    color: Colors.light.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  shelfSuggestionTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '800' },
  shelfSuggestionResult: { gap: 5 },
  shelfSuggestionRange: { color: Colors.light.primary, fontSize: 20, fontWeight: '900' },
  shelfSuggestionNote: { color: Colors.light.textSecondary, fontSize: 11, lineHeight: 17 },
  shelfSuggestionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  shelfSuggestionSource: { color: Colors.light.primary, fontSize: 10, fontWeight: '800' },
  applySuggestionButton: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: Colors.light.primary,
  },
  applySuggestionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  shelfSuggestionDisclaimer: {
    paddingTop: 9,
    color: Colors.light.textSecondary,
    fontSize: 9,
    lineHeight: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#AFCDBA',
  },
  addStorageOption: {
    minWidth: 96,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: Colors.light.primarySoft,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.light.primary,
  },
  addStorageOptionText: { color: Colors.light.primary, fontSize: 12, fontWeight: '800' },
  inlineCreateRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  inlineCreateInput: { flex: 1 },
  inlineCreateButton: {
    minHeight: 52,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: Colors.light.primary,
  },
  inlineCreateButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  expiryOptions: { flexDirection: 'row', gap: 10 },
  expiryOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 13,
    backgroundColor: Colors.light.backgroundElement,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  expiryOptionSelected: {
    backgroundColor: Colors.light.primarySoft,
    borderColor: Colors.light.primary,
  },
  expiryOptionText: { color: Colors.light.textSecondary, fontSize: 13, fontWeight: '700' },
  expiryOptionTextSelected: { color: Colors.light.primary, fontWeight: '800' },
  formHint: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
    padding: 15,
    borderRadius: 15,
    backgroundColor: Colors.light.primarySoft,
  },
  formHintIcon: { fontSize: 18 },
  formHintText: { flex: 1, color: Colors.light.primary, fontSize: 13, lineHeight: 20 },
  detailModalPage: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: Colors.light.background,
    boxShadow: '0 24px 80px rgba(20, 36, 27, 0.24)',
  },
  detailEdgeSwipeZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 32,
    zIndex: 50,
  },
  detailContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 54, gap: 18 },
  detailInlineForm: { gap: 13 },
  detailEditIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.light.primarySoft,
    borderWidth: 1,
    borderColor: '#BED9C8',
  },
  detailEditEmojiPreview: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#FFFFFFB8',
  },
  detailEditEmojiPreviewText: { fontSize: 29 },
  detailEditIntroCopy: { flex: 1, gap: 3 },
  detailEditIntroTitle: { color: Colors.light.primary, fontSize: 14, fontWeight: '900' },
  detailEditIntroText: { color: Colors.light.textSecondary, fontSize: 11, lineHeight: 16 },
  detailShelfSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: 15,
    backgroundColor: Colors.light.primarySoft,
  },
  detailShelfSuggestionCopy: { flex: 1, gap: 2 },
  detailShelfSuggestionTitle: { color: Colors.light.text, fontSize: 12, fontWeight: '800' },
  detailShelfSuggestionText: { color: Colors.light.primary, fontSize: 11, fontWeight: '700' },
  detailShelfSuggestionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: Colors.light.primary,
  },
  detailShelfSuggestionButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  disposalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 10,
    backgroundColor: '#17231C70',
  },
  disposalCard: {
    gap: 15,
    padding: 18,
    borderRadius: 30,
    backgroundColor: Colors.light.background,
    boxShadow: '0 -16px 52px rgba(28, 48, 36, 0.24)',
  },
  disposalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.light.border,
  },
  disposalHero: { alignItems: 'center', gap: 7, paddingHorizontal: 10 },
  disposalEmojiBox: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    borderRadius: 21,
    backgroundColor: Colors.light.surface,
  },
  disposalEmoji: { fontSize: 34 },
  disposalTitle: { color: Colors.light.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  disposalSubtitle: { color: Colors.light.textSecondary, fontSize: 11.5, lineHeight: 18, textAlign: 'center' },
  disposalOptions: { gap: 9 },
  disposalOption: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    borderRadius: 19,
    borderWidth: 1,
  },
  disposalFinished: { backgroundColor: '#EFF7F1', borderColor: '#D5E9DB' },
  disposalExpired: { backgroundColor: '#FFF4F1', borderColor: '#F1D7D1' },
  disposalDiscarded: { backgroundColor: '#FFF9EC', borderColor: '#F1E3C2' },
  disposalOptionIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  disposalOptionEmoji: { fontSize: 23 },
  disposalOptionCopy: { flex: 1, gap: 3 },
  disposalOptionTitle: { color: Colors.light.text, fontSize: 13.5, fontWeight: '900' },
  disposalOptionText: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 15 },
  disposalCancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.light.backgroundElement },
  disposalCancelText: { color: Colors.light.textSecondary, fontSize: 13, fontWeight: '800' },
  detailHero: { alignItems: 'center', gap: 9, paddingVertical: 6 },
  detailEmojiBox: {
    width: 80,
    height: 80,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.primarySoft,
  },
  detailEmoji: { fontSize: 42 },
  detailName: { color: Colors.light.text, fontSize: 26, fontWeight: '900' },
  detailBadges: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLibraryBadge: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.light.primarySoft,
  },
  detailLibraryBadgeText: { color: Colors.light.primary, fontSize: 12, fontWeight: '800' },
  detailCategoryBadge: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.light.backgroundElement,
  },
  detailCategoryBadgeText: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '700' },
  detailStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Colors.light.primarySoft,
  },
  detailStatusUrgent: { backgroundColor: Colors.light.warningSoft },
  detailStatusIcon: { fontSize: 23 },
  detailStatusCopy: { flex: 1, gap: 3 },
  detailStatusTitle: { color: Colors.light.text, fontSize: 16, fontWeight: '800' },
  detailStatusText: { color: Colors.light.textSecondary, fontSize: 12, lineHeight: 17 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailInfoCard: {
    width: '48%',
    minHeight: 88,
    padding: 14,
    borderRadius: 16,
    justifyContent: 'space-between',
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  detailInfoLabel: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '700' },
  detailInfoValue: { color: Colors.light.text, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  batchCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 18, backgroundColor: Colors.light.primarySoft },
  batchIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.light.surface },
  batchIconText: { color: Colors.light.primary, fontSize: 17, fontWeight: '900' },
  batchCopy: { flex: 1, gap: 3 },
  batchTitle: { color: Colors.light.primary, fontSize: 12.5, fontWeight: '900' },
  batchText: { color: Colors.light.primary, fontSize: 10, lineHeight: 15 },
  quickAdjustCard: { gap: 13, padding: 14, borderRadius: 18, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  quickAdjustCopy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quickAdjustTitle: { color: Colors.light.text, fontSize: 12.5, fontWeight: '900' },
  quickAdjustValue: { color: Colors.light.primary, fontSize: 15, fontWeight: '900' },
  quickAdjustActions: { flexDirection: 'row', gap: 7 },
  quickAdjustButton: { minWidth: 64, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.light.backgroundElement },
  quickAdjustButtonText: { color: Colors.light.primary, fontSize: 11, fontWeight: '900' },
  finishedButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.light.primarySoft },
  finishedButtonText: { color: Colors.light.primary, fontSize: 11, fontWeight: '900' },
  adjustDisabled: { opacity: 0.35 },
  historySection: { gap: 12 },
  historyList: { overflow: 'hidden', borderRadius: 18, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  historyRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  historyCopy: { gap: 3 },
  historyReason: { color: Colors.light.text, fontSize: 12, fontWeight: '900' },
  historyDate: { color: Colors.light.textSecondary, fontSize: 9.5 },
  historyAmount: { color: Colors.light.danger, fontSize: 12, fontWeight: '900' },
  historyAmountPositive: { color: Colors.light.primary },
  suggestionSection: { gap: 13 },
  suggestionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  suggestionTitle: { color: Colors.light.text, fontSize: 20, fontWeight: '900' },
  suggestionDetail: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '600' },
  suggestionList: { gap: 9 },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 15,
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  suggestionIcon: { fontSize: 18 },
  suggestionText: { color: Colors.light.text, fontSize: 14, fontWeight: '700' },
  emptySuggestion: {
    color: Colors.light.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    padding: 15,
    borderRadius: 15,
    backgroundColor: Colors.light.surface,
  },
  customChoiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorOption: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorOptionSelected: { borderColor: '#FFFFFF', boxShadow: '0 0 0 2px #2F6D50' },
  colorCheck: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  libraryPreview: {
    minHeight: 92,
    borderRadius: 22,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  libraryPreviewEmoji: { fontSize: 35 },
  libraryPreviewCopy: { gap: 2 },
  libraryPreviewName: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  libraryPreviewDetail: { color: '#FFFFFFCC', fontSize: 12, fontWeight: '600' },
  smartSuccessBanner: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#F0EBFF', borderWidth: 1, borderColor: '#D7CBF2' },
  smartSuccessIcon: { width: 29, height: 29, overflow: 'hidden', textAlign: 'center', lineHeight: 29, borderRadius: 15, color: '#FFFFFF', backgroundColor: '#735C9B', fontSize: 14, fontWeight: '900' },
  smartSuccessText: { flex: 1, color: '#654D8B', fontSize: 12, fontWeight: '800' },
  smartSuccessClose: { color: '#735C9B', fontSize: 20 },
  addModeBackdrop: { flex: 1, alignItems: 'flex-end', paddingHorizontal: 14, backgroundColor: '#16221C38' },
  addModeSheet: { width: 286, gap: 8, padding: 11, borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: '#FFFFFF', shadowColor: '#173D2F', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },
  addModeHandle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: Colors.light.border, marginBottom: 3 },
  addModeTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900', paddingHorizontal: 5, paddingTop: 2, paddingBottom: 1 },
  addModeSubtitle: { color: Colors.light.textSecondary, fontSize: 11.5, marginBottom: 3 },
  addModeOption: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border },
  addModeOptionAi: { backgroundColor: '#F5F1FF', borderColor: '#D7CBF2' },
  addModeIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.light.primarySoft },
  addModeIconAi: { backgroundColor: '#735C9B' },
  addModeIconText: { color: Colors.light.primary, fontSize: 25, fontWeight: '700' },
  addModeAiIcon: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  addModeCopy: { flex: 1, gap: 4 },
  addModeOptionTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  addModeOptionText: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 15 },
  addModeChevron: { color: Colors.light.textSecondary, fontSize: 24 },
  smartHeaderPlaceholder: { width: 46 },
  smartAddContent: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: 15, padding: 18, paddingBottom: 44 },
  smartAddIntro: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 21, backgroundColor: '#735C9B' },
  smartAddIntroIcon: { width: 42, height: 42, overflow: 'hidden', textAlign: 'center', lineHeight: 42, borderRadius: 15, color: '#735C9B', backgroundColor: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  smartAddIntroCopy: { flex: 1, gap: 4 },
  smartAddIntroTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  smartAddIntroText: { color: '#EEE8FA', fontSize: 10.5, lineHeight: 16 },
  smartModeSwitch: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: Colors.light.backgroundElement },
  smartModeOption: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  smartModeOptionSelected: { backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  smartModeText: { color: Colors.light.textSecondary, fontSize: 11.5, fontWeight: '800' },
  smartModeTextSelected: { color: '#735C9B', fontWeight: '900' },
  smartTextInput: { minHeight: 132, padding: 15, borderRadius: 20, color: Colors.light.text, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' },
  receiptSection: { gap: 11 },
  receiptEmptyCard: { minHeight: 174, alignItems: 'center', justifyContent: 'center', gap: 7, padding: 22, borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: '#BBAFD0' },
  receiptEmptyEmoji: { fontSize: 39 },
  receiptEmptyTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  receiptEmptyText: { maxWidth: 290, color: Colors.light.textSecondary, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  receiptPreviewCard: { minHeight: 122, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  receiptPreview: { width: 74, height: 100, borderRadius: 13, backgroundColor: Colors.light.backgroundElement },
  receiptPreviewCopy: { flex: 1, gap: 5 },
  receiptPreviewTitle: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  receiptPreviewText: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 14 },
  receiptRemoveButton: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.backgroundElement },
  receiptRemoveText: { color: Colors.light.danger, fontSize: 19, lineHeight: 21 },
  receiptActions: { flexDirection: 'row', gap: 9 },
  receiptActionButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#B8D6C2' },
  receiptActionText: { color: Colors.light.primary, fontSize: 11, fontWeight: '900' },
  smartErrorCard: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 15, backgroundColor: Colors.light.warningSoft },
  smartErrorIcon: { width: 24, height: 24, overflow: 'hidden', textAlign: 'center', lineHeight: 24, borderRadius: 12, color: '#FFFFFF', backgroundColor: Colors.light.warning, fontSize: 12, fontWeight: '900' },
  smartErrorText: { flex: 1, color: Colors.light.warning, fontSize: 10.5, lineHeight: 15, fontWeight: '700' },
  smartAnalyzeButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#735C9B' },
  smartAnalyzeButtonText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  smartResultSection: { gap: 12 },
  smartResultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smartResultTitle: { color: Colors.light.text, fontSize: 17, fontWeight: '900' },
  smartResultHint: { color: Colors.light.textSecondary, fontSize: 9.5, marginTop: 3 },
  smartSelectedCount: { color: '#735C9B', fontSize: 12, fontWeight: '900' },
  smartItemList: { gap: 8 },
  smartItemCard: { minHeight: 68, gap: 9, padding: 11, borderRadius: 17, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  smartItemCardSelected: { borderColor: '#735C9B', backgroundColor: '#F5F1FF' },
  smartItemMainRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smartItemEmoji: { width: 38, fontSize: 27, textAlign: 'center' },
  smartItemCopy: { flex: 1, gap: 3 },
  smartItemName: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  smartItemMeta: { color: Colors.light.textSecondary, fontSize: 9.5 },
  smartItemAmount: { color: Colors.light.text, fontSize: 11, fontWeight: '900' },
  smartEditButton: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#ECE5F7' },
  smartEditButtonActive: { backgroundColor: '#735C9B' },
  smartItemEditor: { flexDirection: 'row', gap: 7, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#CFC5DE' },
  smartEditInput: { minHeight: 39, paddingHorizontal: 10, borderRadius: 11, color: Colors.light.text, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, fontSize: 11, fontWeight: '700' },
  smartEditNameInput: { flex: 1 },
  smartEditQuantityInput: { width: 56, textAlign: 'center' },
  smartEditUnitInput: { width: 57, textAlign: 'center' },
  smartItemCheck: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.background },
  smartItemCheckSelected: { backgroundColor: '#735C9B', borderColor: '#735C9B' },
  smartItemCheckText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  smartConfirmButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: Colors.light.primary },
  smartConfirmButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
