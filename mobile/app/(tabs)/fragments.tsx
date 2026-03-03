import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

/**
 * 碎片库页面 - 展示所有灵感碎片列表
 * 阶段 4.3 将实现完整功能
 */
export default function FragmentsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>碎片库</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Text style={styles.subtitle}>这里将展示您的灵感碎片列表</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
});
