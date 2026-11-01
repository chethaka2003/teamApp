import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { eventsApi, gamificationApi, teamsApi, usersApi } from '../api/client';
import { useAuth } from '../context';
import {
  ParticipantLeaderboardEntry,
  ScheduleEventItem,
  SummitEvent,
  Team,
  TeamLeaderboardEntry,
  UserProfile,
  UserRole,
} from '../types';
import {
  extractInviteCodeFromQrPayload,
  extractUserIdFromQrPayload,
  formatOrdinalRank,
  loadScheduleFromOfflineCache,
  saveScheduleToOfflineCache,
} from '../utils';

const SCAN_FRAME_HEIGHT = 240;

/**
 * Clean In-Viewport Reticle with Corner Brackets & Smooth Laser Sweep
 */
export function ScannerOverlay() {
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sweep = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: SCAN_FRAME_HEIGHT - 32,
          duration: 1700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    sweep.start();

    return () => sweep.stop();
  }, [scanAnim]);

  return (
    <View style={overlayStyles.overlayContainer} pointerEvents="none">
      <View style={overlayStyles.targetFrame}>
        {/* Corner Brackets */}
        <View style={[overlayStyles.corner, overlayStyles.topLeft]} />
        <View style={[overlayStyles.corner, overlayStyles.topRight]} />
        <View style={[overlayStyles.corner, overlayStyles.bottomLeft]} />
        <View style={[overlayStyles.corner, overlayStyles.bottomRight]} />

        {/* Animated Laser Sweep */}
        <Animated.View
          style={[
            overlayStyles.laserLine,
            { transform: [{ translateY: scanAnim }] },
          ]}
        />
      </View>
    </View>
  );
}

const overlayStyles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  targetFrame: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#38BDF8',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 8,
  },
  laserLine: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 8,
    height: 2.5,
    backgroundColor: '#38BDF8',
    shadowColor: '#38BDF8',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
});

/**
 * Universal payload parser
 */
function parseInviteCode(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.includes('code=')) {
    const match = trimmed.match(/code=([^&]+)/);
    if (match && match[1]) return match[1].trim().toUpperCase();
  }
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    return parts[parts.length - 1].trim().toUpperCase();
  }
  return (extractInviteCodeFromQrPayload(trimmed) || trimmed).toUpperCase();
}

function parseUserId(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.includes('id=')) {
    const match = trimmed.match(/id=([^&]+)/);
    if (match && match[1]) return match[1].trim();
  }
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    return parts[parts.length - 1].trim();
  }
  return extractUserIdFromQrPayload(trimmed) || trimmed;
}

/**
 * Genuine ISO-Standard Scannable QR Code
 */
export function QrMatrixBadge({
  value,
  label,
  subtitle,
}: {
  value: string;
  label: string;
  subtitle?: string;
}) {
  const [imageLoading, setImageLoading] = useState(true);
  const qrUri = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(
    value
  )}`;

  return (
    <View style={styles.qrCard}>
      <Text style={styles.qrLabel}>{label}</Text>
      {subtitle ? <Text style={styles.qrSubtitle}>{subtitle}</Text> : null}
      <View style={styles.qrBox}>
        {imageLoading && (
          <View style={styles.qrLoader}>
            <ActivityIndicator size="small" color="#0284C7" />
          </View>
        )}
        <Image
          source={{ uri: qrUri }}
          style={styles.qrImage}
          onLoadEnd={() => setImageLoading(false)}
        />
      </View>
      <Text selectable style={styles.qrCodeValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Member & Mentor Profile QR Pass Card
 */
export function ProfileQrCodeCard() {
  const { user, role } = useAuth();
  if (!user) return null;

  const qrPayload = user.id;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Summit Profile & QR Pass</Text>
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {user.full_name}
            </Text>
            <Text style={styles.itemSubtitle} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
          <View style={styles.pointsBadge}>
            <Text style={styles.pointsBadgeText}>
              {user.individual_points} pts
            </Text>
          </View>
        </View>

        <View style={styles.chipRow}>
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>Role: {role}</Text>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <QrMatrixBadge
            value={qrPayload}
            label="Personal Member ID QR Code"
            subtitle={`User ID: ${user.id}`}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Organizer QR Point Scanner & Allocation
 */
export function OrganizerPointScannerPanel() {
  const [scannedInput, setScannedInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [scannedUser, setScannedUser] = useState<UserProfile | null>(null);
  const [events, setEvents] = useState<SummitEvent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [awardScope, setAwardScope] = useState<'INDIVIDUAL' | 'TEAM' | 'BOTH'>(
    'INDIVIDUAL'
  );
  const [pointsDelta, setPointsDelta] = useState('50');
  const [reason, setReason] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const isScanningRef = useRef(false);

  const loadEventsAndTeams = useCallback(async () => {
    try {
      const [evts, tms] = await Promise.all([
        eventsApi.listEvents(),
        teamsApi.listTeams('all'),
      ]);
      setEvents(evts);
      setTeams(tms);
      if (evts.length > 0 && !selectedEventId) {
        setSelectedEventId(evts[0].id);
        setPointsDelta(String(evts[0].default_points));
      }
    } catch {}
  }, [selectedEventId]);

  useEffect(() => {
    loadEventsAndTeams();
  }, [loadEventsAndTeams]);

  const handleToggleCamera = async () => {
    setErrorMsg(null);
    if (!cameraActive) {
      if (!permission?.granted) {
        const result = await requestPermission();
        if (!result.granted) {
          setErrorMsg('Camera permission is required to scan QR codes.');
          return;
        }
      }
      isScanningRef.current = false;
      setCameraActive(true);
    } else {
      setCameraActive(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (isScanningRef.current || !data) return;
    isScanningRef.current = true;

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    setCameraActive(false);
    setScannedInput(data);
    handleLookupScannedUser(data);
  };

  const handleLookupScannedUser = async (rawQr: string) => {
    const userId = parseUserId(rawQr);
    if (!userId) {
      setErrorMsg(`Unrecognized format: "${rawQr}". Ensure it is a valid Summit pass.`);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      isScanningRef.current = false;
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const foundUser = await usersApi.getUserById(userId);
      setScannedUser(foundUser);

      const memberTeam = teams.find((t) =>
        t.members?.some((m) => m.user_id === foundUser.id)
      );
      if (memberTeam) {
        setSelectedTeamId(memberTeam.id);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not find member for scanned QR code'
      );
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
    } finally {
      setLoading(false);
      isScanningRef.current = false;
    }
  };

  const handleAwardPointsSubmit = async () => {
    const pts = parseInt(pointsDelta, 10);
    if (!pts || isNaN(pts)) {
      setErrorMsg('Please enter a valid point value.');
      return;
    }

    const selectedEvt = events.find((e) => e.id === selectedEventId);
    const computedReason =
      reason.trim() ||
      (selectedEvt
        ? `Event Award: ${selectedEvt.title}`
        : 'Organizer QR Point Award');

    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await gamificationApi.awardPoints({
        target_user_id:
          awardScope === 'INDIVIDUAL' || awardScope === 'BOTH'
            ? scannedUser?.id
            : undefined,
        target_team_id:
          awardScope === 'TEAM' || awardScope === 'BOTH'
            ? selectedTeamId || undefined
            : undefined,
        event_id: selectedEventId || undefined,
        points_delta: pts,
        category: 'MILESTONE',
        reason: computedReason,
      });

      if (scannedUser) {
        const refreshedUser = await usersApi.getUserById(scannedUser.id);
        setScannedUser(refreshedUser);
      }
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      setStatusMsg(`Successfully awarded ${pts} points (${awardScope})!`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to award points'
      );
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Organizer Points Console</Text>
        <Pressable
          style={[
            styles.toggleCameraBtn,
            cameraActive && styles.toggleCameraBtnActive,
          ]}
          onPress={handleToggleCamera}
        >
          <Text style={styles.toggleCameraBtnText}>
            {cameraActive ? '✕ Close Camera' : '📷 Open Camera'}
          </Text>
        </Pressable>
      </View>

      {/* Embedded Scanner Viewport with Clean Header & Footer */}
      {cameraActive && (
        <View style={styles.scannerContainerBlock}>
          <View style={styles.scannerStatusRow}>
            <View style={styles.liveIndicatorPill}>
              <View style={styles.liveIndicatorDot} />
              <Text style={styles.liveIndicatorText}>LIVE SCANNER</Text>
            </View>
            <Text style={styles.scannerInstructionText}>
              Align code within frame
            </Text>
          </View>

          <View style={styles.cameraBoxContainer}>
            <CameraView
              key="organizer-camera"
              style={styles.cameraSurface}
              facing="back"
              autofocus="on"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <ScannerOverlay />
          </View>
        </View>
      )}

      {/* Manual Input Fallback */}
      <View style={styles.cardForm}>
        <Text style={styles.formTitle}>Member Pass or User ID</Text>
        <View style={styles.rowInputs}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="User UUID"
            placeholderTextColor="#64748B"
            value={scannedInput}
            onChangeText={setScannedInput}
          />
          <Pressable
            style={[styles.primaryBtn, { marginBottom: 0 }]}
            onPress={() => handleLookupScannedUser(scannedInput)}
          >
            <Text style={styles.primaryBtnText}>Lookup</Text>
          </Pressable>
        </View>
      </View>

      {scannedUser && (
        <View style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {scannedUser.full_name}
              </Text>
              <Text style={styles.itemSubtitle} numberOfLines={1}>
                {scannedUser.email}
              </Text>
            </View>
            <View style={styles.pointsBadge}>
              <Text style={styles.pointsBadgeText}>
                {scannedUser.individual_points} pts
              </Text>
            </View>
          </View>
          <View style={styles.chipRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>Role: {scannedUser.role}</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.cardForm}>
        <Text style={styles.formTitle}>Point Allocation Target</Text>

        <Text style={styles.fieldLabel}>Active Summit Event:</Text>
        <View style={[styles.toggleRow, { flexWrap: 'wrap', marginTop: 6 }]}>
          {events.length === 0 ? (
            <Text style={styles.emptyText}>No events available.</Text>
          ) : (
            events.map((evt) => (
              <Pressable
                key={evt.id}
                style={[
                  styles.chipBtn,
                  selectedEventId === evt.id && styles.chipBtnActive,
                ]}
                onPress={() => {
                  setSelectedEventId(evt.id);
                  setPointsDelta(String(evt.default_points));
                }}
              >
                <Text
                  style={[
                    styles.chipBtnText,
                    selectedEventId === evt.id && styles.chipBtnTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {evt.title} (+{evt.default_points})
                </Text>
              </Pressable>
            ))
          )}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
          Target Recipient:
        </Text>
        <View style={[styles.toggleRow, { marginTop: 6 }]}>
          {(
            [
              ['INDIVIDUAL', 'Individual'],
              ['TEAM', 'Team Only'],
              ['BOTH', 'Both'],
            ] as const
          ).map(([scopeKey, label]) => (
            <Pressable
              key={scopeKey}
              style={[
                styles.toggleBtn,
                awardScope === scopeKey && styles.toggleBtnActive,
              ]}
              onPress={() => setAwardScope(scopeKey)}
            >
              <Text
                style={[
                  styles.toggleBtnText,
                  awardScope === scopeKey && styles.toggleBtnTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {(awardScope === 'TEAM' || awardScope === 'BOTH') && (
          <>
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
              Target Team:
            </Text>
            <View style={[styles.toggleRow, { flexWrap: 'wrap', marginTop: 6 }]}>
              {teams.map((t) => (
                <Pressable
                  key={t.id}
                  style={[
                    styles.chipBtn,
                    selectedTeamId === t.id && styles.chipBtnActive,
                  ]}
                  onPress={() => setSelectedTeamId(t.id)}
                >
                  <Text
                    style={[
                      styles.chipBtnText,
                      selectedTeamId === t.id && styles.chipBtnTextActive,
                    ]}
                  >
                    {t.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <View style={[styles.rowInputs, { marginTop: 12 }]}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Points (e.g. 50)"
            placeholderTextColor="#64748B"
            keyboardType="numeric"
            value={pointsDelta}
            onChangeText={setPointsDelta}
          />
          <TextInput
            style={[styles.input, { flex: 2 }]}
            placeholder="Reason (optional)"
            placeholderTextColor="#64748B"
            value={reason}
            onChangeText={setReason}
          />
        </View>

        <Pressable
          style={styles.primaryBtn}
          onPress={handleAwardPointsSubmit}
          disabled={loading}
        >
          <Text style={styles.primaryBtnText}>
            {loading ? 'Awarding Points...' : 'Award Points'}
          </Text>
        </Pressable>
      </View>

      {statusMsg ? <Text style={styles.successBanner}>{statusMsg}</Text> : null}
      {errorMsg ? <Text style={styles.errorBanner}>{errorMsg}</Text> : null}
    </View>
  );
}

/**
 * QR Code Scanner for Joining Teams (Embedded In-App)
 */
export function TeamQrScannerModal({
  onJoined,
  isMentorScanner = false,
}: {
  onJoined?: (team: Team) => void;
  isMentorScanner?: boolean;
}) {
  const [qrInput, setQrInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const isScanningRef = useRef(false);

  const handleToggleCamera = async () => {
    setErrorMsg(null);
    if (!cameraActive) {
      if (!permission?.granted) {
        const result = await requestPermission();
        if (!result.granted) {
          setErrorMsg('Camera permission is required to scan QR codes.');
          return;
        }
      }
      isScanningRef.current = false;
      setCameraActive(true);
    } else {
      setCameraActive(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (isScanningRef.current || submitting || !data) return;
    isScanningRef.current = true;

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    setCameraActive(false);
    setQrInput(data);
    await executeJoin(data);
  };

  const executeJoin = async (rawPayload: string) => {
    const extractedCode = parseInviteCode(rawPayload);
    if (!extractedCode) {
      setErrorMsg(`Invalid invite code: "${rawPayload}"`);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      isScanningRef.current = false;
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const joinedTeam = isMentorScanner
        ? await teamsApi.mentorJoinByQrCode(extractedCode)
        : await teamsApi.joinByInviteCode(extractedCode);

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      Alert.alert('Success', `You have joined "${joinedTeam.name}"!`);
      setQrInput('');
      setStatusMsg(`Joined "${joinedTeam.name}"!`);
      onJoined?.(joinedTeam);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join team';
      setErrorMsg(message);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      Alert.alert('Join Failed', message);
    } finally {
      setSubmitting(false);
      isScanningRef.current = false;
    }
  };

  return (
    <View style={styles.cardForm}>
      <View style={styles.headerRow}>
        <Text style={styles.formTitle}>
          {isMentorScanner ? 'Join Team as Mentor' : 'Join Team with QR Code'}
        </Text>
        <Pressable
          style={[
            styles.toggleCameraBtn,
            cameraActive && styles.toggleCameraBtnActive,
          ]}
          onPress={handleToggleCamera}
        >
          <Text style={styles.toggleCameraBtnText}>
            {cameraActive ? '✕ Close Camera' : '📷 Scan Team QR'}
          </Text>
        </Pressable>
      </View>

      {/* Embedded Scanner Viewport with Clean Status Banner */}
      {cameraActive && (
        <View style={styles.scannerContainerBlock}>
          <View style={styles.scannerStatusRow}>
            <View style={styles.liveIndicatorPill}>
              <View style={styles.liveIndicatorDot} />
              <Text style={styles.liveIndicatorText}>LIVE SCANNER</Text>
            </View>
            <Text style={styles.scannerInstructionText}>
              Align code within frame
            </Text>
          </View>

          <View style={styles.cameraBoxContainer}>
            <CameraView
              key="team-inapp-camera"
              style={styles.cameraSurface}
              facing="back"
              autofocus="on"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <ScannerOverlay />
          </View>
        </View>
      )}

      <Text style={styles.fieldLabel}>Or enter the 6-character code:</Text>
      <View style={[styles.rowInputs, { marginTop: 6 }]}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Invite Code (e.g. SUMMIT)"
          placeholderTextColor="#64748B"
          autoCapitalize="characters"
          value={qrInput}
          onChangeText={setQrInput}
        />
        <Pressable
          style={[styles.primaryBtn, { marginBottom: 0 }]}
          onPress={() => executeJoin(qrInput)}
          disabled={submitting || !qrInput.trim()}
        >
          <Text style={styles.primaryBtnText}>
            {submitting
              ? 'Joining...'
              : isMentorScanner
              ? 'Join as Mentor'
              : 'Join Team'}
          </Text>
        </Pressable>
      </View>

      {statusMsg ? <Text style={styles.successBanner}>{statusMsg}</Text> : null}
      {errorMsg ? <Text style={styles.errorBanner}>{errorMsg}</Text> : null}
    </View>
  );
}

/**
 * Mentor Team Hub
 */
export function MentorTeamDashboardPanel() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMentoredTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await teamsApi.listTeams('accessible');
      setTeams(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load mentored team'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMentoredTeams();
  }, [fetchMentoredTeams]);

  const activeTeam = teams[0] ?? null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Mentor Team Hub</Text>
        <Pressable style={styles.refreshBtn} onPress={fetchMentoredTeams}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {!activeTeam && (
        <TeamQrScannerModal
          isMentorScanner
          onJoined={() => fetchMentoredTeams()}
        />
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#38BDF8" style={{ marginVertical: 16 }} />
      ) : activeTeam ? (
        <View style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {activeTeam.name}
              </Text>
              <View style={styles.chipRow}>
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>Code: {activeTeam.invite_code}</Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>
                    👥 {activeTeam.member_count}/{activeTeam.max_capacity}
                  </Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>
                    🛡️ {activeTeam.mentor_count ?? 0} mentors
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.pointsBadge}>
              <Text style={styles.pointsBadgeText}>
                {activeTeam.total_points} pts
              </Text>
            </View>
          </View>

          {activeTeam.mentors?.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.fieldLabel}>Assigned Mentors</Text>
              <View style={styles.chipRow}>
                {activeTeam.mentors.map((m) => (
                  <View key={m.id} style={styles.metaChip}>
                    <Text style={styles.metaChipText}>
                      {m.mentor_full_name ?? m.mentor_email ?? m.mentor_id}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={{ marginTop: 16 }}>
            <Text style={styles.fieldLabel}>
              Team Members & Individual Balances
            </Text>
            {activeTeam.members.length === 0 ? (
              <Text style={styles.emptyText}>
                No participants have joined this team yet.
              </Text>
            ) : (
              activeTeam.members.map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.user_full_name ?? 'Team Member'}
                    </Text>
                    <Text style={styles.itemSubtitle} numberOfLines={1}>
                      {member.user_email ?? member.user_id}
                    </Text>
                  </View>
                  <View style={styles.pointsPillSmall}>
                    <Text style={styles.pointsPillTextSmall}>
                      {member.individual_points} pts
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      ) : (
        <Text style={styles.emptyText}>
          You have not joined a team yet. Scan a Team Invite QR Code above to join.
        </Text>
      )}
    </View>
  );
}

/**
 * Team Management Panel
 */
export function TeamManagementPanel() {
  const { isAdmin, isManagerOrAbove, hasPermission } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedQrTeamId, setExpandedQrTeamId] = useState<string | null>(null);

  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('6');

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await teamsApi.listTeams('accessible');
      setTeams(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const handleCreateTeam = async () => {
    if (!teamName.trim()) return;
    setError(null);
    try {
      const created = await teamsApi.createTeam({
        name: teamName.trim(),
        description: teamDesc.trim() || undefined,
        max_capacity: parseInt(maxCapacity, 10) || 6,
      });
      setTeams((prev) => [created, ...prev]);
      setExpandedQrTeamId(created.id);
      setTeamName('');
      setTeamDesc('');
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    setError(null);
    try {
      await teamsApi.deleteTeam(teamId);
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Summit Teams & QRs</Text>
        <Pressable style={styles.refreshBtn} onPress={fetchTeams}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {(isManagerOrAbove || hasPermission('CREATE_RESOURCES')) && (
        <View style={styles.cardForm}>
          <Text style={styles.formTitle}>Create New Team</Text>
          <TextInput
            style={styles.input}
            placeholder="Team Name (e.g. Apex Pioneers)"
            placeholderTextColor="#64748B"
            value={teamName}
            onChangeText={setTeamName}
          />
          <TextInput
            style={styles.input}
            placeholder="Team Description (optional)"
            placeholderTextColor="#64748B"
            value={teamDesc}
            onChangeText={setTeamDesc}
          />
          <View style={styles.rowInputs}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Capacity (6)"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={maxCapacity}
              onChangeText={setMaxCapacity}
            />
            <Pressable style={styles.primaryBtn} onPress={handleCreateTeam}>
              <Text style={styles.primaryBtnText}>Create Team</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!isAdmin && <TeamQrScannerModal onJoined={() => fetchTeams()} />}

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#38BDF8"
          style={{ marginVertical: 16 }}
        />
      ) : teams.length === 0 ? (
        <Text style={styles.emptyText}>No accessible teams found.</Text>
      ) : (
        teams.map((team) => {
          const qrValue = team.invite_code.trim().toUpperCase();
          const isQrOpen = expandedQrTeamId === team.id;

          return (
            <View key={team.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {team.name}
                  </Text>
                  <View style={styles.chipRow}>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>Code: {team.invite_code}</Text>
                    </View>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>
                        👥 {team.member_count}/{team.max_capacity}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.pointsBadge}>
                  <Text style={styles.pointsBadgeText}>
                    {team.total_points} pts
                  </Text>
                </View>
              </View>

              {team.description ? (
                <Text style={styles.itemDesc} numberOfLines={2}>
                  {team.description}
                </Text>
              ) : null}

              <View style={[styles.actionRow, { marginTop: 12 }]}>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => setExpandedQrTeamId(isQrOpen ? null : team.id)}
                >
                  <Text style={styles.secondaryBtnText}>
                    {isQrOpen ? 'Hide QR' : 'View QR'}
                  </Text>
                </Pressable>
                {(isAdmin || hasPermission('DELETE_RESOURCES')) && (
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteTeam(team.id)}
                  >
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
                )}
              </View>

              {isQrOpen && (
                <View style={{ marginTop: 14 }}>
                  <QrMatrixBadge
                    value={qrValue}
                    label={`Team QR: ${team.name}`}
                    subtitle={`Invite Code: ${team.invite_code}`}
                  />
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

/**
 * Summit Events System
 */
export function SummitEventsPanel() {
  const { isAdmin } = useAuth();
  const [events, setEvents] = useState<SummitEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [defaultPoints, setDefaultPoints] = useState('50');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await eventsApi.listEvents();
      setEvents(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleCreateEvent = async () => {
    if (!title.trim()) return;
    setError(null);
    setStatusMsg(null);
    try {
      const created = await eventsApi.createEvent({
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        default_points: parseInt(defaultPoints, 10) || 50,
      });
      setEvents((prev) => [created, ...prev]);
      setTitle('');
      setDescription('');
      setLocation('');
      setStatusMsg(`Created event "${created.title}"!`);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    }
  };

  const handleJoinEvent = async (eventId: string) => {
    setError(null);
    setStatusMsg(null);
    try {
      const updated = await eventsApi.joinEvent(eventId);
      setEvents((prev) => prev.map((e) => (e.id === eventId ? updated : e)));
      setStatusMsg(`Joined "${updated.title}"!`);
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join event');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    setError(null);
    try {
      await eventsApi.deleteEvent(eventId);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event');
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Summit Events</Text>
        <Pressable style={styles.refreshBtn} onPress={fetchEvents}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {statusMsg ? <Text style={styles.successBanner}>{statusMsg}</Text> : null}

      {isAdmin && (
        <View style={styles.cardForm}>
          <Text style={styles.formTitle}>Publish New Summit Event</Text>
          <TextInput
            style={styles.input}
            placeholder="Event Title"
            placeholderTextColor="#64748B"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={styles.input}
            placeholder="Event Description"
            placeholderTextColor="#64748B"
            value={description}
            onChangeText={setDescription}
          />
          <View style={styles.rowInputs}>
            <TextInput
              style={[styles.input, { flex: 2 }]}
              placeholder="Location (e.g. Hall B)"
              placeholderTextColor="#64748B"
              value={location}
              onChangeText={setLocation}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Points (50)"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={defaultPoints}
              onChangeText={setDefaultPoints}
            />
          </View>
          <Pressable style={styles.primaryBtn} onPress={handleCreateEvent}>
            <Text style={styles.primaryBtnText}>Publish Event</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#38BDF8" style={{ marginVertical: 16 }} />
      ) : events.length === 0 ? (
        <Text style={styles.emptyText}>No summit events published yet.</Text>
      ) : (
        events.map((evt) => (
          <View key={evt.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {evt.title}
                </Text>
                <View style={styles.chipRow}>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>+{evt.default_points} pts</Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>{evt.location ?? 'TBA'}</Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>👥 {evt.participant_count ?? 0}</Text>
                  </View>
                </View>
              </View>
            </View>

            {evt.description ? (
              <Text style={styles.itemDesc} numberOfLines={3}>
                {evt.description}
              </Text>
            ) : null}

            <View style={[styles.actionRow, { marginTop: 12 }]}>
              <Pressable
                style={[
                  styles.awardBtn,
                  evt.is_joined && { backgroundColor: '#334155' },
                ]}
                onPress={() => handleJoinEvent(evt.id)}
                disabled={evt.is_joined}
              >
                <Text style={styles.awardBtnText}>
                  {evt.is_joined ? 'Joined ✓' : 'Join Event'}
                </Text>
              </Pressable>
              {isAdmin && (
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteEvent(evt.id)}
                >
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * Globally Accessible Leaderboard Screen
 */
export function LiveGlobalLeaderboard() {
  const { isAdmin, isManagerOrAbove, hasPermission } = useAuth();
  const [mode, setMode] = useState<'teams' | 'participants'>('teams');
  const [teamEntries, setTeamEntries] = useState<TeamLeaderboardEntry[]>([]);
  const [participantEntries, setParticipantEntries] = useState<
    ParticipantLeaderboardEntry[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awardReason, setAwardReason] = useState('Milestone Sprint Bonus');

  const canAllocatePoints =
    isAdmin || isManagerOrAbove || hasPermission('AWARD_POINTS');

  const refreshLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamsData, usersData] = await Promise.all([
        gamificationApi.getTeamLeaderboard(),
        gamificationApi.getParticipantLeaderboard(),
      ]);
      setTeamEntries(teamsData);
      setParticipantEntries(usersData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch leaderboard'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshLeaderboard();
    const interval = setInterval(refreshLeaderboard, 15000);
    return () => clearInterval(interval);
  }, [refreshLeaderboard]);

  const handleQuickAwardTeam = async (teamId: string, delta: number) => {
    setError(null);
    try {
      await gamificationApi.awardPoints({
        target_team_id: teamId,
        points_delta: delta,
        category: isAdmin ? 'MILESTONE' : 'MENTOR_BONUS',
        reason: awardReason.trim() || 'Summit Point Allocation',
      });
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
      await refreshLeaderboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Point allocation failed');
    }
  };

  const handleQuickAwardUser = async (userId: string, delta: number) => {
    setError(null);
    try {
      await gamificationApi.awardPoints({
        target_user_id: userId,
        points_delta: delta,
        category: isAdmin ? 'MILESTONE' : 'MENTOR_BONUS',
        reason: awardReason.trim() || 'Participant Recognition',
      });
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
      await refreshLeaderboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Point allocation failed');
    }
  };

  const getRankBadgeStyle = (rank: number) => {
    if (rank === 1) return styles.rankBadgeGold;
    if (rank === 2) return styles.rankBadgeSilver;
    if (rank === 3) return styles.rankBadgeBronze;
    return styles.rankBadgeDefault;
  };

  const getRankTextStyle = (rank: number) => {
    if (rank === 1) return styles.rankTextGold;
    if (rank === 2) return styles.rankTextSilver;
    if (rank === 3) return styles.rankTextBronze;
    return styles.rankTextDefault;
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Global Leaderboards</Text>
        <Pressable style={styles.refreshBtn} onPress={refreshLeaderboard}>
          <Text style={styles.refreshBtnText}>Live Sync</Text>
        </Pressable>
      </View>

      <View style={styles.toggleRow}>
        <Pressable
          style={[
            styles.toggleBtn,
            mode === 'teams' && styles.toggleBtnActive,
          ]}
          onPress={() => setMode('teams')}
        >
          <Text
            style={[
              styles.toggleBtnText,
              mode === 'teams' && styles.toggleBtnTextActive,
            ]}
          >
            🏆 Teams
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.toggleBtn,
            mode === 'participants' && styles.toggleBtnActive,
          ]}
          onPress={() => setMode('participants')}
        >
          <Text
            style={[
              styles.toggleBtnText,
              mode === 'participants' && styles.toggleBtnTextActive,
            ]}
          >
            ⭐ Individuals
          </Text>
        </Pressable>
      </View>

      {canAllocatePoints && (
        <View style={styles.cardForm}>
          <Text style={styles.formTitle}>
            {isAdmin
              ? 'Quick Point Allocation Controls (Organizer)'
              : 'Quick Bonus Controls (Mentor)'}
          </Text>
          <TextInput
            style={[styles.input, { marginBottom: 0 }]}
            placeholder="Reason for awarding points"
            placeholderTextColor="#64748B"
            value={awardReason}
            onChangeText={setAwardReason}
          />
        </View>
      )}

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {loading && teamEntries.length === 0 && participantEntries.length === 0 ? (
        <ActivityIndicator
          size="large"
          color="#38BDF8"
          style={{ marginVertical: 16 }}
        />
      ) : mode === 'teams' ? (
        teamEntries.length === 0 ? (
          <Text style={styles.emptyText}>No teams ranked yet.</Text>
        ) : (
          teamEntries.map((entry) => (
            <View key={entry.team_id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <View style={[styles.rankBadge, getRankBadgeStyle(entry.rank)]}>
                  <Text style={[styles.rankBadgeText, getRankTextStyle(entry.rank)]}>
                    {formatOrdinalRank(entry.rank)}
                  </Text>
                </View>

                <View style={styles.leaderboardInfoCol}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {entry.team_name}
                  </Text>
                  <View style={styles.chipRow}>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>
                        👥 {entry.member_count} members
                      </Text>
                    </View>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>
                        Code: {entry.invite_code}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.pointsBadge}>
                  <Text style={styles.pointsBadgeText}>
                    {entry.total_points} pts
                  </Text>
                </View>
              </View>

              {canAllocatePoints && (
                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.awardBtn}
                    onPress={() => handleQuickAwardTeam(entry.team_id, 50)}
                  >
                    <Text style={styles.awardBtnText}>+50 pts</Text>
                  </Pressable>
                  {isAdmin && (
                    <>
                      <Pressable
                        style={styles.awardBtn}
                        onPress={() => handleQuickAwardTeam(entry.team_id, 100)}
                      >
                        <Text style={styles.awardBtnText}>+100</Text>
                      </Pressable>
                      <Pressable
                        style={styles.deleteBtn}
                        onPress={() => handleQuickAwardTeam(entry.team_id, -25)}
                      >
                        <Text style={styles.deleteBtnText}>-25</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              )}
            </View>
          ))
        )
      ) : participantEntries.length === 0 ? (
        <Text style={styles.emptyText}>No individual members ranked yet.</Text>
      ) : (
        participantEntries.map((entry) => (
          <View key={entry.user_id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View style={[styles.rankBadge, getRankBadgeStyle(entry.rank)]}>
                <Text style={[styles.rankBadgeText, getRankTextStyle(entry.rank)]}>
                  {formatOrdinalRank(entry.rank)}
                </Text>
              </View>

              <View style={styles.leaderboardInfoCol}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {entry.full_name}
                </Text>
                <View style={styles.chipRow}>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText} numberOfLines={1}>
                      {entry.department_or_track ?? 'General Track'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.pointsBadge}>
                <Text style={styles.pointsBadgeText}>
                  {entry.individual_points} pts
                </Text>
              </View>
            </View>

            {canAllocatePoints && (
              <View style={styles.actionRow}>
                <Pressable
                  style={styles.awardBtn}
                  onPress={() => handleQuickAwardUser(entry.user_id, 25)}
                >
                  <Text style={styles.awardBtnText}>+25 pts</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );
}

/**
 * Dynamic Schedule View
 */
export function DynamicScheduleView() {
  const [events, setEvents] = useState<ScheduleEventItem[]>([]);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const liveEvents = await gamificationApi.getSchedule();
      setEvents(liveEvents);
      setIsOfflineFallback(false);
      const saved = await saveScheduleToOfflineCache(liveEvents);
      setCachedAt(saved.updatedAt);
    } catch {
      const cached = await loadScheduleFromOfflineCache();
      if (cached && cached.events.length > 0) {
        setEvents(cached.events);
        setCachedAt(cached.updatedAt);
        setIsOfflineFallback(true);
      } else {
        const defaultSeed: ScheduleEventItem[] = [
          {
            id: 'offline-01',
            title: 'Opening Keynote & Summit Kickoff',
            description:
              'Welcome address, summit rules, and challenge track overview.',
            location: 'Main Auditorium',
            track: 'General',
            starts_at: '2026-10-25T09:00:00Z',
            ends_at: '2026-10-25T10:00:00Z',
            speaker: 'Dr. Elena Vance',
          },
          {
            id: 'offline-02',
            title: 'Team Formation & QR Code Check-In',
            description:
              'Scan your team QR code or enter your 6-character invite code.',
            location: 'Breakout Hall A',
            track: 'Teams',
            starts_at: '2026-10-25T10:15:00Z',
            ends_at: '2026-10-25T11:30:00Z',
            speaker: 'Summit Organizers',
          },
        ];
        const saved = await saveScheduleToOfflineCache(defaultSeed);
        setEvents(saved.events);
        setCachedAt(saved.updatedAt);
        setIsOfflineFallback(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Event Schedule</Text>
        <Pressable style={styles.refreshBtn} onPress={loadSchedule}>
          <Text style={styles.refreshBtnText}>Sync</Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.cacheBanner,
          isOfflineFallback && styles.cacheBannerOffline,
        ]}
      >
        <Text style={styles.cacheBannerText}>
          {isOfflineFallback
            ? `Offline: Cached at ${
                cachedAt ? new Date(cachedAt).toLocaleTimeString() : 'Local'
              }`
            : `Online: Synced at ${
                cachedAt ? new Date(cachedAt).toLocaleTimeString() : 'Synced'
              }`}
        </Text>
      </View>

      {loading && events.length === 0 ? (
        <ActivityIndicator size="large" color="#38BDF8" style={{ marginVertical: 16 }} />
      ) : (
        events.map((evt) => (
          <View key={evt.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View style={styles.trackPill}>
                <Text style={styles.trackPillText}>{evt.track}</Text>
              </View>
              <Text style={styles.locationText}>{evt.location}</Text>
            </View>

            <Text style={[styles.itemTitle, { marginTop: 8 }]} numberOfLines={2}>
              {evt.title}
            </Text>
            <Text style={styles.itemDesc}>{evt.description}</Text>

            <View style={styles.chipRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>
                  🕒{' '}
                  {new Date(evt.starts_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  –{' '}
                  {new Date(evt.ends_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              {evt.speaker ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>🗣️ {evt.speaker}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * Organizer Role Management Directory
 */
export function UserDirectoryPanel() {
  const { isAdmin, hasPermission } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fetchUsers = useCallback(
    async (query?: string) => {
      setLoading(true);
      setError(null);
      try {
        const list = await usersApi.listUsers({
          search: (query ?? searchQuery).trim() || undefined,
        });
        setUsers(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        setLoading(false);
      }
    },
    [searchQuery]
  );

  useEffect(() => {
    fetchUsers('');
  }, []);

  const handleSetUserRole = async (u: UserProfile, targetRole: UserRole) => {
    setError(null);
    setStatusMsg(null);
    try {
      const updated = await usersApi.updateUserRole(u.id, targetRole);
      setUsers((prev) =>
        prev.map((item) => (item.id === u.id ? updated : item))
      );
      setStatusMsg(`Updated ${u.full_name}'s role to ${targetRole}.`);
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await usersApi.deleteUser(userId);
      setUsers((prev) => prev.filter((item) => item.id !== userId));
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Role Management</Text>
        <Pressable
          style={styles.refreshBtn}
          onPress={() => fetchUsers(searchQuery)}
        >
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      </View>

      <View style={styles.cardForm}>
        <Text style={styles.formTitle}>Search Summit Members</Text>
        <View style={styles.rowInputs}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Search by name, email, or track..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Pressable
            style={[styles.primaryBtn, { marginBottom: 0 }]}
            onPress={() => fetchUsers(searchQuery)}
          >
            <Text style={styles.primaryBtnText}>Search</Text>
          </Pressable>
        </View>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {statusMsg ? <Text style={styles.successBanner}>{statusMsg}</Text> : null}

      {loading ? (
        <ActivityIndicator size="large" color="#38BDF8" style={{ marginVertical: 16 }} />
      ) : users.length === 0 ? (
        <Text style={styles.emptyText}>No matching members found.</Text>
      ) : (
        users.map((u) => (
          <View key={u.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {u.full_name}
                </Text>
                <Text style={styles.itemSubtitle} numberOfLines={1}>
                  {u.email}
                </Text>
              </View>
              <View style={styles.pointsBadge}>
                <Text style={styles.pointsBadgeText}>
                  {u.individual_points} pts
                </Text>
              </View>
            </View>

            <View style={styles.chipRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>Role: {u.role}</Text>
              </View>
            </View>

            {(isAdmin || hasPermission('MANAGE_USERS')) && (
              <View style={[styles.actionRow, { marginTop: 12 }]}>
                {u.role !== 'MENTOR' && (
                  <Pressable
                    style={styles.awardBtn}
                    onPress={() => handleSetUserRole(u, 'MENTOR')}
                  >
                    <Text style={styles.awardBtnText}>Promote to Mentor</Text>
                  </Pressable>
                )}
                {u.role !== 'ORGANIZER' && (
                  <Pressable
                    style={styles.promoteOrgBtn}
                    onPress={() => handleSetUserRole(u, 'ORGANIZER')}
                  >
                    <Text style={styles.awardBtnText}>Promote Organizer</Text>
                  </Pressable>
                )}
                {u.role !== 'PARTICIPANT' && (
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => handleSetUserRole(u, 'PARTICIPANT')}
                  >
                    <Text style={styles.secondaryBtnText}>Set as Member</Text>
                  </Pressable>
                )}
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteUser(u.id)}
                >
                  <Text style={styles.deleteBtnText}>Remove</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.3,
  },
  toggleCameraBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  toggleCameraBtnActive: {
    backgroundColor: '#334155',
    borderColor: '#475569',
  },
  toggleCameraBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  scannerContainerBlock: {
    marginBottom: 14,
  },
  scannerStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  liveIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 132, 199, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
    gap: 6,
  },
  liveIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38BDF8',
  },
  liveIndicatorText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  scannerInstructionText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  cameraBoxContainer: {
    height: SCAN_FRAME_HEIGHT,
    width: '100%',
    backgroundColor: '#000000',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#0284C7',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraSurface: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  refreshBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  toggleBtnActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  toggleBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 13,
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  chipBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipBtnActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  chipBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  chipBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  fieldLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorBanner: {
    backgroundColor: 'rgba(127, 29, 29, 0.9)',
    color: '#FCA5A5',
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
    marginBottom: 12,
    fontSize: 13,
  },
  successBanner: {
    backgroundColor: 'rgba(6, 95, 70, 0.9)',
    color: '#A7F3D0',
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
    marginBottom: 12,
    fontSize: 13,
  },
  cacheBanner: {
    backgroundColor: '#0F2942',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#0284C7',
  },
  cacheBannerOffline: {
    backgroundColor: '#3B1A04',
    borderColor: '#D97706',
  },
  cacheBannerText: {
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  cardForm: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  formTitle: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
    fontSize: 14,
  },
  rowInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  secondaryBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  secondaryBtnText: {
    color: '#E2E8F0',
    fontWeight: '600',
    fontSize: 12,
  },
  awardBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  promoteOrgBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  awardBtnText: {
    color: '#ECFDF5',
    fontWeight: '700',
    fontSize: 12,
  },
  deleteBtn: {
    backgroundColor: '#991B1B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  deleteBtnText: {
    color: '#FEE2E2',
    fontWeight: '600',
    fontSize: 12,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 12,
  },
  itemCard: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  leaderboardInfoCol: {
    flex: 1,
    marginRight: 6,
  },
  rankBadge: {
    minWidth: 42,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeDefault: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  rankTextDefault: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 13,
  },
  rankBadgeGold: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  rankTextGold: {
    color: '#FBBF24',
    fontWeight: '800',
    fontSize: 13,
  },
  rankBadgeSilver: {
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    borderWidth: 1,
    borderColor: '#94A3B8',
  },
  rankTextSilver: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 13,
  },
  rankBadgeBronze: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    borderWidth: 1,
    borderColor: '#D97706',
  },
  rankTextBronze: {
    color: '#FDBA74',
    fontWeight: '800',
    fontSize: 13,
  },
  itemTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  itemSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  pointsBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  pointsBadgeText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  metaChip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metaChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(51, 65, 85, 0.6)',
  },
  itemDesc: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  trackPill: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  trackPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  locationText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  qrCard: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  qrLabel: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  qrSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 12,
    marginVertical: 10,
    width: 196,
    height: 196,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  qrLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrImage: {
    width: 180,
    height: 180,
    borderRadius: 6,
  },
  qrCodeValue: {
    color: '#38BDF8',
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 4,
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  memberName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  pointsPillSmall: {
    backgroundColor: 'rgba(6, 95, 70, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#065F46',
  },
  pointsPillTextSmall: {
    color: '#A7F3D0',
    fontWeight: '700',
    fontSize: 12,
  },
});