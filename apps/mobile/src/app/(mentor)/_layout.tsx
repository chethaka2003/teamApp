import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../context';

export default function MentorGroupLayout() {
  const { user, isManagerOrAbove } = useAuth();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!isManagerOrAbove) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
