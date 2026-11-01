import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { authApi } from '../../api/client';
import { useAuth } from '../../context';
import { UserRole } from '../../types';

const SOCIAL_LINKS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    url: 'https://wa.me/94785503442',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    url: 'https://www.facebook.com/profile.php?id=61585784859815',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    url: 'https://www.linkedin.com/company/110918406',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    url: 'https://www.instagram.com/codesolutiontech/',
  },
];

// Local asset
const BACKGROUND_VIDEO_SOURCE = require('../../assets/background-video.mp4');

export default function LoginScreen() {
  const { isLoading, error, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('PARTICIPANT');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Initialize background video player
  const player = useVideoPlayer(BACKGROUND_VIDEO_SOURCE, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Ensure playback starts when screen mounts
  useEffect(() => {
    if (player) {
      player.muted = true;
      player.loop = true;
      player.play();
    }
  }, [player]);

  const handleAuthSubmit = async () => {
    setStatusMessage(null);
    try {
      if (isRegisterMode) {
        await authApi.register({
          email,
          password,
          full_name: fullName,
          role: selectedRole,
        });
        setStatusMessage('Account registered! Signing you in...');
      }
      await login(email, password);
    } catch {
      // Error surfaced via AuthContext
    }
  };

  const handleOpenLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('Failed to open link:', err);
    }
  };

  return (
    <View style={styles.rootContainer}>
      {/* Background Video Layer */}
      <VideoView
        player={player}
        style={styles.backgroundVideo}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Dark Translucent Overlay (reduced opacity to confirm visibility) */}
      <View style={styles.darkOverlay} pointerEvents="none" />

      {/* Foreground Content */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.authCard}>
              <Text style={styles.title}>My SriLanka Summit</Text>
              <Text style={styles.subtitle}>
                {isRegisterMode
                  ? 'Create an Organizer or Participant/Mentor Account'
                  : 'Sign in with your Summit Credentials'}
              </Text>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {statusMessage ? (
                <Text style={styles.statusText}>{statusMessage}</Text>
              ) : null}

              {isRegisterMode && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor="#94A3B8"
                    value={fullName}
                    onChangeText={setFullName}
                  />
                  <View style={styles.roleRow}>
                    {(
                      [
                        ['PARTICIPANT', 'Participant / Member'],
                        ['ORGANIZER', 'Organizer'],
                      ] as [UserRole, string][]
                    ).map(([roleKey, label]) => (
                      <Pressable
                        key={roleKey}
                        style={[
                          styles.roleChip,
                          selectedRole === roleKey && styles.roleChipActive,
                        ]}
                        onPress={() => setSelectedRole(roleKey)}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            selectedRole === roleKey && styles.roleChipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#94A3B8"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <Pressable
                style={styles.primaryBtn}
                onPress={handleAuthSubmit}
                disabled={isLoading}
              >
                <Text style={styles.primaryBtnText}>
                  {isLoading
                    ? 'Please wait...'
                    : isRegisterMode
                    ? 'Register & Sign In'
                    : 'Sign In'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setIsRegisterMode((prev) => !prev)}
                style={{ marginTop: 14 }}
              >
                <Text style={styles.switchModeText}>
                  {isRegisterMode
                    ? 'Already have an account? Sign In'
                    : 'Need an account? Register'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.bottomFooter}>
              <View style={styles.sponsorContainer}>
                <Text style={styles.sponsorLabel}>Sponsored by</Text>
                <Text style={styles.sponsorBrand}>Code solution</Text>
              </View>

              <View style={styles.socialRow}>
                {SOCIAL_LINKS.map((item) => (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [
                      styles.socialBadge,
                      pressed && styles.socialBadgePressed,
                    ]}
                    onPress={() => handleOpenLink(item.url)}
                  >
                    <Text style={styles.socialBadgeText}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  backgroundVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)', // Lightened to 65% so the video is clearly discernible
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  authCard: {
    width: '100%',
    justifyContent: 'center',
    flexGrow: 1,
    paddingVertical: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#CBD5E1',
    marginBottom: 20,
  },
  errorText: {
    backgroundColor: 'rgba(127, 29, 29, 0.85)',
    color: '#FCA5A5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  statusText: {
    backgroundColor: 'rgba(6, 95, 70, 0.85)',
    color: '#A7F3D0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  input: {
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    color: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.9)',
    marginBottom: 12,
    fontSize: 15,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.8)',
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    alignItems: 'center',
  },
  roleChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  roleChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  roleChipTextActive: {
    color: '#FFFFFF',
  },
  primaryBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  switchModeText: {
    color: '#38BDF8',
    textAlign: 'center',
    fontSize: 14,
  },
  bottomFooter: {
    paddingTop: 24,
    paddingBottom: 8,
    alignItems: 'center',
    width: '100%',
  },
  sponsorContainer: {
    alignItems: 'center',
    marginBottom: 14,
    gap: 4,
  },
  sponsorLabel: {
    color: '#94A3B8',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  sponsorBrand: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  socialBadge: {
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.8)',
  },
  socialBadgePressed: {
    backgroundColor: '#334155',
  },
  socialBadgeText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '500',
  },
});