import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../context';

export default function AuthGroupLayout() {
  const { user, role } = useAuth();

  if (user) {
    if (role === 'ORGANIZER' || role === 'ADMIN') {
      return <Redirect href="/(organizer)" />;
    }
    if (role === 'MENTOR' || role === 'MANAGER') {
      return <Redirect href="/(mentor)" />;
    }
    return <Redirect href="/(participant)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
