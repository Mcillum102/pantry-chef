import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

type BarcodeScannerProps = {
  visible: boolean;
  language: 'zh' | 'en';
  onClose: () => void;
  onScanned: (barcode: string) => void;
};

export function BarcodeScanner({ visible, language, onClose, onScanned }: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const zh = language === 'zh';

  function handleScanned(result: BarcodeScanningResult) {
    if (scanned) return;
    setScanned(true);
    onScanned(result.data);
    setTimeout(() => setScanned(false), 600);
  }

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
          <Text style={styles.title}>{zh ? '扫描商品条形码' : 'Scan product barcode'}</Text>
          <View style={styles.placeholder} />
        </View>

        {!permission ? (
          <View style={styles.message}><Text style={styles.messageText}>{zh ? '正在检查相机权限…' : 'Checking camera permission…'}</Text></View>
        ) : !permission.granted ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionEmoji}>📷</Text>
            <Text style={styles.permissionTitle}>{zh ? '需要相机权限' : 'Camera access is needed'}</Text>
            <Text style={styles.permissionText}>{zh ? '相机只用于读取商品条形码。' : 'The camera is used only to read product barcodes.'}</Text>
            <Pressable accessibilityRole="button" onPress={() => void requestPermission()} style={styles.permissionButton}>
              <Text style={styles.permissionButtonText}>{zh ? '允许使用相机' : 'Allow camera'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={scanned ? undefined : handleScanned}
            />
            <View style={styles.overlay}>
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <Text style={styles.hint}>{scanned ? (zh ? '已识别，正在查询…' : 'Scanned, looking it up…') : (zh ? '将包装上的条形码放入框内' : 'Place the package barcode inside the frame')}</Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#111714' },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 10 },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#FFFFFF18' },
  closeText: { color: '#FFFFFF', fontSize: 27, lineHeight: 29 },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  placeholder: { width: 42 },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageText: { color: '#FFFFFF', fontSize: 13 },
  permissionCard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 },
  permissionEmoji: { fontSize: 48 },
  permissionTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  permissionText: { color: '#C9D2CD', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  permissionButton: { minWidth: 180, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 17, backgroundColor: Colors.light.primary },
  permissionButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  cameraWrap: { flex: 1, overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 24, backgroundColor: '#00000033' },
  scanFrame: { width: '78%', maxWidth: 390, aspectRatio: 1.7 },
  corner: { position: 'absolute', width: 38, height: 38, borderColor: '#FFFFFF' },
  cornerTopLeft: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 14 },
  cornerTopRight: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 14 },
  cornerBottomLeft: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 14 },
  cornerBottomRight: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 14 },
  hint: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', textAlign: 'center' },
});
