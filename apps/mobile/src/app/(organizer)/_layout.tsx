import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../context';

export default function OrganizerGroupLayout() {
  const { user, isAdmin } = useAuth();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!isAdmin) {
    return <Redirect href="/" />;
  }


  return <Stack screenOptions={{ headerShown: false }} />;
}
