import { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { localizeContent } from '@/data/content-translations';
import type { AppLanguage } from '@/context/language-context';
import type { StorageLocation } from '@/data/kitchen-data';

type StorageCelebrationProps = {
  emoji: string;
  itemName: string;
  storage: StorageLocation;
  language: AppLanguage;
  onComplete: () => void;
};

function storageKind(storage: StorageLocation) {
  if (storage.includes('冷冻')) return 'freezer';
  if (storage.includes('冷藏')) return 'fridge';
  if (storage.includes('零食') || storage.includes('车')) return 'cart';
  if (storage.includes('柜')) return 'cabinet';
  return 'box';
}

export function StorageCelebration({
  emoji,
  itemName,
  storage,
  language,
  onComplete,
}: StorageCelebrationProps) {
  const backdrop = useSharedValue(0);
  const scene = useSharedValue(0);
  const door = useSharedValue(0);
  const item = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const success = useSharedValue(0);
  const reaction = useSharedValue(0);
  const kind = storageKind(storage);

  useEffect(() => {
    backdrop.set(
      withTiming(1, {
        duration: 180,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      })
    );
    scene.set(withSpring(1, { damping: 13, stiffness: 135, reduceMotion: ReduceMotion.System }));
    door.set(
      withSequence(
        withDelay(
          260,
          withTiming(1, {
            duration: 360,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          })
        ),
        withDelay(
          760,
          withTiming(0, {
            duration: 330,
            easing: Easing.inOut(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          })
        )
      )
    );
    item.set(
      withDelay(
        590,
        withTiming(1, {
          duration: 690,
          easing: Easing.inOut(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        })
      )
    );
    sparkle.set(
      withDelay(
        1450,
        withSequence(
          withSpring(1, { damping: 8, stiffness: 180, reduceMotion: ReduceMotion.System }),
          withDelay(430, withTiming(0, { duration: 230, reduceMotion: ReduceMotion.System }))
        )
      )
    );
    success.set(
      withDelay(
        1510,
        withSpring(1, { damping: 10, stiffness: 160, reduceMotion: ReduceMotion.System })
      )
    );
    reaction.set(
      withDelay(
        1230,
        withSequence(
          withTiming(1, { duration: 105, reduceMotion: ReduceMotion.System }),
          withTiming(-0.8, { duration: 105, reduceMotion: ReduceMotion.System }),
          withTiming(0.45, { duration: 95, reduceMotion: ReduceMotion.System }),
          withSpring(0, { damping: 8, stiffness: 190, reduceMotion: ReduceMotion.System })
        )
      )
    );
    const exitTimer = setTimeout(() => {
      backdrop.set(
        withTiming(
          0,
          { duration: 260, reduceMotion: ReduceMotion.System },
          (finished) => {
            if (finished) runOnJS(onComplete)();
          }
        )
      );
    }, 2450);

    return () => clearTimeout(exitTimer);
  }, [backdrop, door, item, onComplete, reaction, scene, sparkle, success]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const sceneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scene.value, [0, 0.2, 1], [0, 1, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scene.value, [0, 1], [30, 0], Extrapolation.CLAMP) },
      { scale: interpolate(scene.value, [0, 1], [0.68, 1], Extrapolation.CLAMP) },
    ],
  }));
  const doorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(door.value, [0, 0.95, 1], [1, 0.88, 0.72], Extrapolation.CLAMP),
    transform: [
      { perspective: 800 },
      { translateX: interpolate(door.value, [0, 1], [0, -42], Extrapolation.CLAMP) },
      { rotateY: `${interpolate(door.value, [0, 1], [0, -72], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const itemStyle = useAnimatedStyle(() => {
    const startX = kind === 'cart' ? -98 : kind === 'cabinet' ? 96 : 82;
    const endY = kind === 'cart' ? 48 : kind === 'box' ? 45 : 4;
    const startRotation = kind === 'cart' ? -18 : kind === 'cabinet' ? 14 : -12;
    return {
      opacity: interpolate(item.value, [0, 0.72, 1], [1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(item.value, [0, 1], [startX, 0], Extrapolation.CLAMP) },
        { translateY: interpolate(item.value, [0, 1], [-132, endY], Extrapolation.CLAMP) },
        { rotate: `${interpolate(item.value, [0, 1], [startRotation, 2], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(item.value, [0, 1], [1.18, kind === 'cart' ? 0.5 : 0.42], Extrapolation.CLAMP) },
      ],
    };
  });
  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: sparkle.value,
    transform: [
      { rotate: `${interpolate(sparkle.value, [0, 1], [-20, 12], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(sparkle.value, [0, 1], [0.2, 1], Extrapolation.CLAMP) },
    ],
  }));
  const successStyle = useAnimatedStyle(() => ({
    opacity: success.value,
    transform: [
      { translateY: interpolate(success.value, [0, 1], [12, 0], Extrapolation.CLAMP) },
      { scale: interpolate(success.value, [0, 1], [0.7, 1], Extrapolation.CLAMP) },
    ],
  }));
  const storageReactionStyle = useAnimatedStyle(() => ({
    transform: kind === 'cart'
      ? [
          { translateX: reaction.value * 10 },
          { rotate: `${reaction.value * 3.5}deg` },
        ]
      : [
          { translateY: -Math.abs(reaction.value) * 8 },
          { scale: 1 + Math.abs(reaction.value) * 0.025 },
        ],
  }));
  const boxFlapStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { rotateX: `${interpolate(door.value, [0, 1], [0, -78], Extrapolation.CLAMP)}deg` },
      { translateY: interpolate(door.value, [0, 1], [0, -15], Extrapolation.CLAMP) },
    ],
  }));

  const localizedStorage = localizeContent(storage, language);
  const title =
    language === 'zh'
      ? `已把${itemName}放进${localizedStorage}`
      : `${itemName} is now in ${localizedStorage}`;
  const particles =
    kind === 'freezer'
      ? ['❄', '❅', '✧']
      : kind === 'cart'
        ? ['♡', '✦', '♡']
        : kind === 'cabinet'
          ? ['✦', '⋆', '✧']
          : ['✦', '★', '♡'];
  const successSubtitle =
    language === 'zh'
      ? kind === 'freezer'
        ? '冷冻层已稳稳收好 ❄️'
        : kind === 'cart'
          ? '零食车收到新成员啦'
          : kind === 'cabinet'
            ? '柜门关好，整整齐齐'
            : '收纳箱已经整理好啦'
      : kind === 'freezer'
        ? 'Tucked safely into the freezer ❄️'
        : kind === 'cart'
          ? 'A new treat joined the snack cart'
          : kind === 'cabinet'
            ? 'Cupboard closed, nice and tidy'
            : 'Packed neatly into storage';

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
        style={[styles.backdrop, backdropStyle]}>
        <Animated.View style={[styles.scene, sceneStyle]}>
          <Animated.Text style={[styles.sparkle, styles.sparkleLeft, sparkleStyle]}>{particles[0]}</Animated.Text>
          <Animated.Text style={[styles.sparkle, styles.sparkleRight, sparkleStyle]}>{particles[1]}</Animated.Text>
          <Animated.Text style={[styles.sparkle, styles.sparkleTop, sparkleStyle]}>{particles[2]}</Animated.Text>

          <View style={styles.storageStage}>
            {kind === 'fridge' || kind === 'freezer' ? (
              <Animated.View style={[styles.fridgeBody, kind === 'freezer' && styles.freezerBody, storageReactionStyle]}>
                <View style={styles.fridgeInside}>
                  <View style={styles.shelf} />
                  <Text style={styles.insideText}>{kind === 'freezer' ? '❄️' : '🧊'}</Text>
                  {kind === 'freezer' ? <Text style={styles.frostText}>❅　❄</Text> : null}
                </View>
                <Animated.View style={[styles.fridgeDoor, kind === 'freezer' && styles.freezerDoor, doorStyle]}>
                  <View style={styles.freezerLine} />
                  <View style={styles.fridgeHandle} />
                  <View style={styles.fridgeFace}>
                    <View style={styles.faceRow}>
                      <Text style={styles.faceEye}>•</Text>
                      <Text style={styles.faceMouth}>ᴗ</Text>
                      <Text style={styles.faceEye}>•</Text>
                    </View>
                    <View style={styles.blushRow}>
                      <View style={styles.blush} />
                      <View style={styles.blush} />
                    </View>
                  </View>
                </Animated.View>
                <View style={styles.fridgeFootLeft} />
                <View style={styles.fridgeFootRight} />
              </Animated.View>
            ) : kind === 'cart' ? (
              <Animated.View style={[styles.cartWrap, storageReactionStyle]}>
                <View style={styles.cartTopHandle} />
                <View style={styles.cartPostLeft} />
                <View style={styles.cartPostRight} />
                <View style={[styles.cartTier, styles.cartTierTop]}>
                  <View style={styles.cartTierHighlight} />
                </View>
                <View style={[styles.cartTier, styles.cartTierMiddle]}>
                  <View style={styles.cartTierHighlight} />
                </View>
                <View style={[styles.cartTier, styles.cartTierBottom]}>
                  <View style={styles.cartTierHighlight} />
                  <View style={styles.cartFaceRow}>
                    <Text style={styles.cartFace}>• ᴗ •</Text>
                    <View style={styles.cartBlush} />
                  </View>
                </View>
                <View style={styles.cartBase} />
                <View style={styles.cartWheelLeft} />
                <View style={styles.cartWheelRight} />
              </Animated.View>
            ) : kind === 'cabinet' ? (
              <Animated.View style={[styles.cabinetBody, storageReactionStyle]}>
                <View style={styles.cabinetInside} />
                <Text style={styles.cabinetInsideEmoji}>🍜　🥫</Text>
                <Animated.View style={[styles.cabinetDoor, doorStyle]}>
                  <Text style={styles.cabinetFace}>• ᴗ •</Text>
                  <View style={styles.cabinetKnob} />
                </Animated.View>
              </Animated.View>
            ) : (
              <Animated.View style={[styles.boxWrap, storageReactionStyle]}>
                <View style={styles.boxBody}>
                  <Text style={styles.boxFace}>• ᴗ •</Text>
                  <View style={styles.boxLabel} />
                </View>
                <Animated.View style={[styles.boxFlap, boxFlapStyle]} />
              </Animated.View>
            )}

            <Animated.Text style={[styles.flyingItem, itemStyle]}>{emoji}</Animated.Text>
          </View>

          <Animated.View style={[styles.successPill, successStyle]}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkText}>✓</Text>
            </View>
            <View style={styles.successCopy}>
              <Text style={styles.successTitle}>{title}</Text>
              <Text style={styles.successText}>
                {successSubtitle}
              </Text>
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(25, 43, 33, 0.56)',
  },
  scene: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 22,
    paddingTop: 30,
  },
  storageStage: { width: 250, height: 260, alignItems: 'center', justifyContent: 'flex-end' },
  fridgeBody: {
    width: 156,
    height: 224,
    borderRadius: 28,
    backgroundColor: '#D9EEE5',
    borderWidth: 5,
    borderColor: '#FFFFFF',
    shadowColor: '#102A20',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 10,
  },
  freezerBody: { backgroundColor: '#DDEFFC', borderColor: '#F6FCFF' },
  fridgeInside: { position: 'absolute', inset: 10, overflow: 'hidden', borderRadius: 16, backgroundColor: '#B7D8E4' },
  shelf: { position: 'absolute', left: 7, right: 7, top: 92, height: 5, borderRadius: 3, backgroundColor: '#E9F7FB' },
  insideText: { position: 'absolute', top: 25, alignSelf: 'center', fontSize: 32 },
  frostText: { position: 'absolute', bottom: 24, alignSelf: 'center', color: '#EAF9FF', fontSize: 22 },
  fridgeDoor: { position: 'absolute', inset: 0, borderRadius: 23, backgroundColor: '#F5FBF7', borderWidth: 2, borderColor: '#D4E8DC' },
  freezerDoor: { backgroundColor: '#F3FAFF', borderColor: '#CDE8F7' },
  freezerLine: { position: 'absolute', left: 0, right: 0, top: 67, height: 3, backgroundColor: '#D9EAE0' },
  fridgeHandle: { position: 'absolute', top: 88, right: 15, width: 7, height: 60, borderRadius: 4, backgroundColor: '#9CB7A8' },
  fridgeFace: { position: 'absolute', top: 109, left: 34, gap: 1 },
  faceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faceEye: { color: '#365A47', fontSize: 18, fontWeight: '900' },
  faceMouth: { color: '#365A47', fontSize: 18, fontWeight: '800' },
  blushRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 1, marginTop: -4 },
  blush: { width: 12, height: 6, borderRadius: 5, backgroundColor: '#F5A7A9A8' },
  fridgeFootLeft: { position: 'absolute', left: 21, bottom: -10, width: 27, height: 12, borderRadius: 6, backgroundColor: '#B8D0C2' },
  fridgeFootRight: { position: 'absolute', right: 21, bottom: -10, width: 27, height: 12, borderRadius: 6, backgroundColor: '#B8D0C2' },
  cabinetBody: { width: 176, height: 174, borderRadius: 23, backgroundColor: '#9B7754', borderWidth: 5, borderColor: '#F4D9B7', shadowColor: '#24170C', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.28, shadowRadius: 20, elevation: 9 },
  cabinetInside: { position: 'absolute', inset: 10, borderRadius: 13, backgroundColor: '#60452F' },
  cabinetInsideEmoji: { position: 'absolute', top: 58, alignSelf: 'center', fontSize: 25 },
  cabinetDoor: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#D9AB7C', borderWidth: 2, borderColor: '#F2D0A8' },
  cabinetFace: { color: '#62452E', fontSize: 20, fontWeight: '900' },
  cabinetKnob: { position: 'absolute', right: 13, width: 11, height: 11, borderRadius: 6, backgroundColor: '#FFF0D4' },
  cartWrap: { width: 170, height: 218, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 18 },
  cartTopHandle: { position: 'absolute', right: 10, top: 4, width: 57, height: 11, borderRadius: 7, backgroundColor: '#3F765C', transform: [{ rotate: '-4deg' }] },
  cartPostLeft: { position: 'absolute', left: 17, top: 28, bottom: 22, width: 8, borderRadius: 5, backgroundColor: '#5E9474' },
  cartPostRight: { position: 'absolute', right: 17, top: 28, bottom: 22, width: 8, borderRadius: 5, backgroundColor: '#5E9474' },
  cartTier: { position: 'absolute', left: 8, right: 8, height: 49, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 17, backgroundColor: '#8CC7A4', borderWidth: 4, borderColor: '#D9F0E2', shadowColor: '#234B38', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.15, shadowRadius: 9, elevation: 5 },
  cartTierTop: { top: 25 },
  cartTierMiddle: { top: 82 },
  cartTierBottom: { top: 139 },
  cartTierHighlight: { position: 'absolute', top: 5, left: 14, right: 14, height: 7, borderRadius: 5, backgroundColor: '#FFFFFF52' },
  cartFaceRow: { alignItems: 'center', gap: 1 },
  cartFace: { color: '#315F49', fontSize: 18, fontWeight: '900' },
  cartBlush: { width: 57, height: 6, borderLeftWidth: 12, borderRightWidth: 12, borderColor: '#F3A7A6', opacity: 0.8 },
  cartBase: { position: 'absolute', bottom: 18, width: 148, height: 9, borderRadius: 5, backgroundColor: '#3F765C' },
  cartWheelLeft: { position: 'absolute', left: 30, bottom: 0, width: 25, height: 25, borderRadius: 13, backgroundColor: '#315F49', borderWidth: 5, borderColor: '#BFE1CC' },
  cartWheelRight: { position: 'absolute', right: 30, bottom: 0, width: 25, height: 25, borderRadius: 13, backgroundColor: '#315F49', borderWidth: 5, borderColor: '#BFE1CC' },
  boxWrap: { width: 190, height: 175, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 },
  boxBody: { width: 172, height: 118, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#E8B56F', borderWidth: 5, borderColor: '#FFE0A8', shadowColor: '#4B2C0D', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.24, shadowRadius: 18, elevation: 8 },
  boxFace: { color: '#6E4722', fontSize: 21, fontWeight: '900' },
  boxLabel: { width: 56, height: 18, marginTop: 9, borderRadius: 7, backgroundColor: '#FFF1CC' },
  boxFlap: { position: 'absolute', top: 31, width: 176, height: 49, borderRadius: 13, backgroundColor: '#F5C783', borderWidth: 4, borderColor: '#FFE3B0' },
  flyingItem: { position: 'absolute', top: 20, zIndex: 20, fontSize: 62, textShadowColor: '#102A2047', textShadowOffset: { width: 0, height: 8 }, textShadowRadius: 10 },
  sparkle: { position: 'absolute', zIndex: 30, color: '#FFF4A8', fontSize: 39, textShadowColor: '#FFF5B0', textShadowRadius: 12 },
  sparkleLeft: { left: 26, top: 44 },
  sparkleRight: { right: 22, top: 101 },
  sparkleTop: { right: 66, top: 10, color: '#FFCFD4', fontSize: 32 },
  successPill: { width: '100%', minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 23, backgroundColor: '#FFFFFF', shadowColor: '#102A20', shadowOffset: { width: 0, height: 13 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 9 },
  checkCircle: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.light.primary },
  checkText: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  successCopy: { flex: 1, gap: 4 },
  successTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  successText: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '700' },
});
