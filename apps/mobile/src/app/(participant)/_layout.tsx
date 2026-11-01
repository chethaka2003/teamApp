import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../context';

export default function ParticipantGroupLayout() {
  const { user } = useAuth();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
