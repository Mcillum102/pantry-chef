import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { recordDiagnostic } from '@/services/diagnostics';

type State = { error: Error | null };

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void recordDiagnostic('react-render', new Error(`${error.message}\n${info.componentStack ?? ''}`));
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.page}>
        <Text style={styles.emoji}>🧯</Text>
        <Text style={styles.title}>这个页面暂时卡住了</Text>
        <Text style={styles.subtitle}>Something went wrong on this screen.</Text>
        <Text style={styles.detail}>错误已保存在本机诊断记录中。库存数据不会因此被删除。</Text>
        <Pressable onPress={() => this.setState({ error: null })} style={styles.button}>
          <Text style={styles.buttonText}>重新打开 · Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28, backgroundColor: Colors.light.background },
  emoji: { fontSize: 52 },
  title: { color: Colors.light.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: Colors.light.textSecondary, fontSize: 13, textAlign: 'center' },
  detail: { maxWidth: 360, color: Colors.light.textSecondary, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingHorizontal: 24, borderRadius: 16, backgroundColor: Colors.light.primary },
  buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});
