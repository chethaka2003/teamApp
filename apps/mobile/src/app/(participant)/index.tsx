import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  LiveGlobalLeaderboard,
  ProfileQrCodeCard,
  SummitEventsPanel,
  TeamManagementPanel,
  TeamQrScannerModal,
} from '../../components';
import { useAuth } from '../../context';

type ParticipantTab =
  | 'leaderboard'
  | 'events'
  | 'profile_qr'
  | 'qr_join'
  | 'my_team';

const MENU_ITEMS: { key: ParticipantTab; label: string; icon: string }[] = [
  { key: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  { key: 'events', label: 'Events & Sessions', icon: '📅' },
  { key: 'profile_qr', label: 'My Profile QR', icon: '📱' },
  { key: 'qr_join', label: 'Scan Team QR', icon: '📷' },
  { key: 'my_team', label: 'My Team', icon: '👥' },
];

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.78, 320);

export default function ParticipantDashboardScreen() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ParticipantTab>('leaderboard');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const openDrawer = () => {
    setIsDrawerOpen(true);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDrawer = (callback?: () => void) => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsDrawerOpen(false);
      if (callback) callback();
    });
  };

  const handleSelectTab = (tab: ParticipantTab) => {
    closeDrawer(() => setActiveTab(tab));
  };

  const currentTabLabel =
    MENU_ITEMS.find((item) => item.key === activeTab)?.label ?? 'Dashboard';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <View style={styles.headerLeft}>
          <Pressable
            style={styles.hamburgerBtn}
            onPress={openDrawer}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
          </Pressable>
          <View>
            <Text style={styles.currentScreenTitle}>{currentTabLabel}</Text>
            <Text style={styles.headerSubtitle}>
              {user?.individual_points ?? 0} pts
            </Text>
          </View>
        </View>

        <Pressable style={styles.quickLogoutBtn} onPress={logout}>
          <Text style={styles.quickLogoutText}>Logout</Text>
        </Pressable>
      </View>

      {/* Main Screen Body */}
      <ScrollView contentContainerStyle={styles.scrollBody}>
        {activeTab === 'leaderboard' && <LiveGlobalLeaderboard />}
        {activeTab === 'events' && <SummitEventsPanel />}
        {activeTab === 'profile_qr' && <ProfileQrCodeCard />}
        {activeTab === 'qr_join' && (
          <TeamQrScannerModal onJoined={() => setActiveTab('my_team')} />
        )}
        {activeTab === 'my_team' && <TeamManagementPanel />}
      </ScrollView>

      {/* Slide-out Side Drawer Modal */}
      <Modal
        visible={isDrawerOpen}
        transparent
        animationType="none"
        onRequestClose={() => closeDrawer()}
      >
        <View style={styles.modalRoot}>
          {/* Backdrop Overlay */}
          <Animated.View
            style={[styles.backdrop, { opacity: fadeAnim }]}
          >
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => closeDrawer()} />
          </Animated.View>

          {/* Drawer Content */}
          <Animated.View
            style={[
              styles.drawerContainer,
              { transform: [{ translateX: slideAnim }] },
            ]}
          >
            <SafeAreaView style={styles.drawerInner} edges={['top', 'bottom', 'left']}>
              {/* Drawer User Info */}
              <View style={styles.drawerHeader}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
                  </Text>
                </View>
                <Text style={styles.userNameText} numberOfLines={1}>
                  {user?.full_name ?? 'Participant'}
                </Text>
                <Text style={styles.roleTag}>
                  PARTICIPANT • {user?.individual_points ?? 0} PTS
                </Text>
              </View>

              <View style={styles.divider} />

              {/* Navigation Links */}
              <ScrollView style={styles.drawerList}>
                {MENU_ITEMS.map((item) => {
                  const isActive = activeTab === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      style={[
                        styles.menuLink,
                        isActive && styles.menuLinkActive,
                      ]}
                      onPress={() => handleSelectTab(item.key)}
                    >
                      <Text style={styles.menuIcon}>{item.icon}</Text>
                      <Text
                        style={[
                          styles.menuLabel,
                          isActive && styles.menuLabelActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Drawer Footer */}
              <View style={styles.drawerFooter}>
                <Pressable
                  style={styles.drawerLogoutBtn}
                  onPress={() => {
                    closeDrawer();
                    logout();
                  }}
                >
                  <Text style={styles.drawerLogoutText}>Sign Out</Text>
                </Pressable>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  hamburgerBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  hamburgerLine: {
    width: 18,
    height: 2,
    backgroundColor: '#F8FAFC',
    borderRadius: 2,
  },
  currentScreenTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#A855F7',
    fontSize: 12,
    fontWeight: '600',
  },
  quickLogoutBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickLogoutText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollBody: {
    padding: 20,
  },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  drawerContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#111827',
    borderRightWidth: 1,
    borderRightColor: '#1F2937',
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 4, height: 0 },
  },
  drawerInner: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
  },
  drawerHeader: {
    padding: 20,
    paddingBottom: 16,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  userNameText: {
    color: '#F9FAFB',
    fontSize: 17,
    fontWeight: '700',
  },
  roleTag: {
    color: '#A855F7',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: '#1F2937',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  drawerList: {
    flex: 1,
    paddingHorizontal: 12,
  },
  menuLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 4,
    gap: 12,
  },
  menuLinkActive: {
    backgroundColor: '#1F2937',
    borderLeftWidth: 3,
    borderLeftColor: '#7C3AED',
  },
  menuIcon: {
    fontSize: 18,
  },
  menuLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  menuLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  drawerFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  drawerLogoutBtn: {
    backgroundColor: '#1F2937',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  drawerLogoutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
});