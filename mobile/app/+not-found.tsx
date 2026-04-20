import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';


export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '页面未找到' }} />
      <View className="flex-1 items-center justify-center p-5">
        <Text className="text-xl font-bold text-app-text dark:text-app-text-dark">此页面不存在</Text>

        <Link href="/" className="mt-[15px] py-[15px]">
          <Text className="text-sm text-app-primary dark:text-app-primary-dark">返回首页</Text>
        </Link>
      </View>
    </>
  );
}
