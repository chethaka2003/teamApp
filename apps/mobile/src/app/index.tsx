import { Redirect } from 'expo-router';
import { useAuth } from '../context';

export default function IndexGate() {
  const { user, role } = useAuth();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (role === 'ORGANIZER' || role === 'ADMIN') {
    return <Redirect href="/(organizer)" />;
  }

  if (role === 'MENTOR' || role === 'MANAGER') {
    return <Redirect href="/(mentor)" />;
  }

  return <Redirect href="/(participant)" />;
}
