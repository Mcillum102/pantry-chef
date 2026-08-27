import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { Colors } from '@/constants/theme';
import { useCloudSync } from '@/context/cloud-sync-context';
import { useLanguage } from '@/context/language-context';

type AuthMode = 'register' | 'login';

type AccountScreenProps = {
  requiredSetup?: boolean;
};

const googleOAuthEnabled = true;
const appleOAuthEnabled = false;

function accountErrorMessage(message: string, text: (zh: string, en: string) => string) {
  if (message.includes('already registered')) return text('这个邮箱已经注册，可以直接登录。', 'This email is already registered. Sign in instead.');
  if (message.includes('Invalid login credentials')) return text('邮箱或密码不正确。', 'The email or password is incorrect.');
  if (message.includes('Email not confirmed')) return text('请先打开邮件完成邮箱验证。', 'Confirm your email before signing in.');
  if (message.includes('Password should be')) return text('密码强度不足，请至少使用 8 位字符。', 'Use a stronger password with at least 8 characters.');
  if (message.includes('already-in-household')) return text('这个账号已经属于一个家庭。', 'This account already belongs to a household.');
  if (message.includes('invite-email-mismatch')) return text('邀请码绑定的邮箱与当前账号不一致。', 'This invite belongs to another email address.');
  if (message.includes('invite-not-found')) return text('邀请码无效或已经过期。', 'The invite is invalid or expired.');
  if (message.includes('transfer-household-first')) return text('请先把家庭管理员权限移交给另一位成员。', 'Transfer household ownership to another member first.');
  if (message.includes('household-member-not-found')) return text('找不到这位家庭成员，请刷新后再试。', 'This household member could not be found. Refresh and try again.');
  return text('操作没有完成，请检查网络或稍后再试。', 'The action could not be completed. Check your connection and try again.');
}

export default function AccountScreen({ requiredSetup = false }: AccountScreenProps) {
  const router = useRouter();
  const { text } = useLanguage();
  const {
    configured,
    status,
    session,
    household,
    register,
    signIn,
    signInWithProvider,
    signOut,
    createHousehold,
    acceptInvite,
    inviteMember,
    requestPasswordReset,
    changePassword,
    transferOwnership,
    removeMember,
    leaveHousehold,
    deleteAccount,
  } = useCloudSync();
  const [mode, setMode] = useState<AuthMode>('register');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [latestInviteCode, setLatestInviteCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const normalizedEmail = email.trim().toLocaleLowerCase();
  const registrationValid = displayName.trim().length >= 2
    && normalizedEmail.includes('@')
    && password.length >= 8;
  const loginValid = normalizedEmail.includes('@') && password.length >= 8;
  const currentDisplayName = String(session?.user.user_metadata?.display_name ?? '')
    || session?.user.email?.split('@')[0]
    || text('家庭成员', 'Household member');
  const memberCount = household?.members.length ?? 0;
  const statusText = useMemo(() => {
    if (status === 'syncing') return text('正在同步', 'Syncing');
    if (status === 'synced') return text('已同步', 'Synced');
    if (status === 'pending') return text('等待联网', 'Waiting for network');
    if (status === 'conflict') return text('需要确认版本', 'Review required');
    return text('账号已连接', 'Account connected');
  }, [status, text]);

  async function submitRegistration() {
    if (!configured || !registrationValid || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await register(normalizedEmail, password, displayName);
      setPassword('');
      setNotice(result.needsEmailVerification
        ? text('账号已创建。请打开验证邮件，验证后回来登录。', 'Account created. Confirm your email, then return to sign in.')
        : text('账号创建成功，接下来创建或加入家庭。', 'Account created. Now create or join a household.'));
      if (result.needsEmailVerification) setMode('login');
    } catch (error) {
      setNotice(accountErrorMessage(error instanceof Error ? error.message : String(error), text));
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin() {
    if (!configured || !loginValid || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await signIn(normalizedEmail, password);
      setPassword('');
      setNotice(text('登录成功。', 'Signed in.'));
    } catch (error) {
      setNotice(accountErrorMessage(error instanceof Error ? error.message : String(error), text));
    } finally {
      setBusy(false);
    }
  }

  async function submitSocialLogin(provider: 'google' | 'apple') {
    if (!configured || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await signInWithProvider(provider);
    } catch (error) {
      setNotice(accountErrorMessage(error instanceof Error ? error.message : String(error), text));
      setBusy(false);
    }
  }

  async function submitPasswordReset() {
    if (!normalizedEmail.includes('@') || busy) return;
    setBusy(true);
    try {
      await requestPasswordReset(normalizedEmail);
      setNotice(text('密码重置邮件已发送，请检查邮箱。', 'Password reset email sent. Check your inbox.'));
    } catch (error) {
      setNotice(accountErrorMessage(error instanceof Error ? error.message : String(error), text));
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordChange() {
    if (newPassword.length < 8 || busy) return;
    setBusy(true);
    try {
      await changePassword(newPassword);
      setNewPassword('');
      setNotice(text('密码已经更新。', 'Password updated.'));
    } catch (error) {
      setNotice(accountErrorMessage(error instanceof Error ? error.message : String(error), text));
    } finally {
      setBusy(false);
    }
  }

  function confirmTransfer(memberId: string, name: string) {
    Alert.alert(
      text('移交管理员权限？', 'Transfer admin role?'),
      text(`移交给 ${name} 后，你会成为普通成员。`, `You will become a member after transferring ownership to ${name}.`),
      [
        { text: text('取消', 'Cancel'), style: 'cancel' },
        { text: text('确认移交', 'Transfer'), onPress: () => void transferOwnership(memberId).catch((error) => setNotice(accountErrorMessage(String(error), text))) },
      ]
    );
  }

  function confirmRemove(memberId: string, name: string) {
    Alert.alert(
      text('移除家庭成员？', 'Remove household member?'),
      text(`${name} 将无法继续访问这个家庭的数据。`, `${name} will lose access to this household's data.`),
      [
        { text: text('取消', 'Cancel'), style: 'cancel' },
        { text: text('移除', 'Remove'), style: 'destructive', onPress: () => void removeMember(memberId).catch((error) => setNotice(accountErrorMessage(String(error), text))) },
      ]
    );
  }

  function confirmLeave() {
    Alert.alert(
      text('退出这个家庭？', 'Leave this household?'),
      household?.role === 'owner' && memberCount > 1
        ? text('请先把管理员权限移交给另一位成员。', 'Transfer the admin role to another member first.')
        : text('本机数据会保留，但之后不会再同步这个家庭。', 'Local data stays on this device but will no longer sync with this household.'),
      household?.role === 'owner' && memberCount > 1 ? [{ text: text('知道了', 'OK') }] : [
        { text: text('取消', 'Cancel'), style: 'cancel' },
        { text: text('确认退出', 'Leave'), style: 'destructive', onPress: () => void leaveHousehold().catch((error) => setNotice(accountErrorMessage(String(error), text))) },
      ]
    );
  }

  function confirmDeleteAccount() {
    Alert.alert(
      text('永久删除账号？', 'Delete account permanently?'),
      text('此操作不可撤销。若家庭还有其他成员，请先移交管理员权限。建议先导出本地备份。', 'This cannot be undone. Transfer ownership first if others remain, and export a backup before continuing.'),
      [
        { text: text('取消', 'Cancel'), style: 'cancel' },
        { text: text('永久删除', 'Delete permanently'), style: 'destructive', onPress: () => void deleteAccount().catch((error) => setNotice(accountErrorMessage(String(error), text))) },
      ]
    );
  }

  async function submitHousehold() {
    if (householdName.trim().length < 2 || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await createHousehold(householdName);
      setHouseholdName('');
      setNotice(text('家庭创建成功，本机数据会开始同步。', 'Household created. This device will start syncing.'));
    } catch (error) {
      setNotice(accountErrorMessage(error instanceof Error ? error.message : String(error), text));
    } finally {
      setBusy(false);
    }
  }

  async function submitInviteCode() {
    if (inviteCode.trim().length < 6 || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await acceptInvite(inviteCode);
      setInviteCode('');
      setNotice(text('已经加入家庭，正在同步共享数据。', 'You joined the household. Shared data is syncing.'));
    } catch (error) {
      setNotice(accountErrorMessage(error instanceof Error ? error.message : String(error), text));
    } finally {
      setBusy(false);
    }
  }

  async function submitMemberInvite() {
    if (!inviteEmail.includes('@') || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const invite = await inviteMember(inviteEmail);
      setLatestInviteCode(invite.code);
      setInviteEmail('');
      setNotice(text('邀请码已创建，有效期为 7 天。', 'Invite created and valid for 7 days.'));
    } catch (error) {
      setNotice(accountErrorMessage(error instanceof Error ? error.message : String(error), text));
    } finally {
      setBusy(false);
    }
  }

  async function submitSignOut() {
    setBusy(true);
    try {
      await signOut();
      setNotice(text('已退出账号，本机数据仍然保留。', 'Signed out. Local data remains on this device.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen
      eyebrow={session ? text('账户与家庭', 'ACCOUNT & HOUSEHOLD') : undefined}
      title={session ? text(`你好，${currentDisplayName}`, `Hi, ${currentDisplayName}`) : text('鲜食记', 'Fresh Pantry')}
      subtitle={session
        ? text('让库存、菜谱和健康记录在家庭设备之间同步。', 'Sync inventory, recipes, and health across household devices.')
        : mode === 'register'
          ? text('创建账号后，继续创建或加入家庭。', 'Create an account, then create or join a household.')
          : text('登录后继续进入你的家庭厨房。', 'Sign in to continue to your household kitchen.')}
      action={requiredSetup ? undefined : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('返回我的页面', 'Back to profile')}
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="close" size={23} color={Colors.light.text} />
        </Pressable>
      )}>
      {!configured ? (
        <View style={styles.setupBanner}>
          <View style={styles.setupIcon}><MaterialCommunityIcons name="cloud-cog-outline" size={24} color="#8A5B28" /></View>
          <View style={styles.setupCopy}>
            <Text style={styles.setupTitle}>{text('需要连接 Supabase', 'Connect Supabase first')}</Text>
            <Text style={styles.setupText}>{text('账号界面已经完成；填写 .env 并运行 supabase/schema.sql 后即可注册真实账号。', 'The account UI is ready. Add .env values and run supabase/schema.sql to enable real accounts.')}</Text>
          </View>
        </View>
      ) : null}

      {!session ? (
        <View style={styles.section}>
          <View style={styles.modeTabs}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'register' }}
              onPress={() => { setMode('register'); setNotice(null); }}
              style={[styles.modeTab, mode === 'register' && styles.modeTabSelected]}>
              <Text style={[styles.modeTabText, mode === 'register' && styles.modeTabTextSelected]}>{text('注册', 'Create account')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'login' }}
              onPress={() => { setMode('login'); setNotice(null); }}
              style={[styles.modeTab, mode === 'login' && styles.modeTabSelected]}>
              <Text style={[styles.modeTabText, mode === 'login' && styles.modeTabTextSelected]}>{text('登录', 'Sign in')}</Text>
            </Pressable>
          </View>

          {Platform.OS === 'web' && (googleOAuthEnabled || appleOAuthEnabled) ? (
            <View style={styles.socialStack}>
              {googleOAuthEnabled ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={!configured || busy}
                  onPress={() => void submitSocialLogin('google')}
                  style={({ pressed }) => [styles.socialButton, (!configured || busy) && styles.disabled, pressed && styles.pressed]}>
                  <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
                  <Text style={styles.socialButtonText}>{text('使用 Google 继续', 'Continue with Google')}</Text>
                </Pressable>
              ) : null}
              {appleOAuthEnabled ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={!configured || busy}
                  onPress={() => void submitSocialLogin('apple')}
                  style={({ pressed }) => [styles.socialButton, (!configured || busy) && styles.disabled, pressed && styles.pressed]}>
                  <MaterialCommunityIcons name="apple" size={22} color="#111111" />
                  <Text style={styles.socialButtonText}>{text('使用 Apple 继续', 'Continue with Apple')}</Text>
                </Pressable>
              ) : null}
              <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>{text('或使用邮箱', 'OR USE EMAIL')}</Text><View style={styles.orLine} /></View>
            </View>
          ) : null}

          <View style={styles.formCard}>
            {mode === 'register' ? (
              <TextInput
                accessibilityLabel={text('账号昵称', 'Account display name')}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                placeholder={text('你的昵称', 'Display name')}
                placeholderTextColor={Colors.light.textSecondary}
                style={styles.input}
              />
            ) : null}
            <TextInput
              accessibilityLabel={text('账号邮箱', 'Account email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder={text('邮箱', 'Email')}
              placeholderTextColor={Colors.light.textSecondary}
              style={styles.input}
            />
            <View style={styles.passwordField}>
              <TextInput
                accessibilityLabel={text('账号密码', 'Account password')}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                secureTextEntry={!showPassword}
                placeholder={text('密码（至少 8 位）', 'Password (8+ characters)')}
                placeholderTextColor={Colors.light.textSecondary}
                style={styles.passwordInput}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? text('隐藏密码', 'Hide password') : text('显示密码', 'Show password')}
                onPress={() => setShowPassword((current) => !current)}
                hitSlop={10}>
                <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={!configured || busy || (mode === 'register' ? !registrationValid : !loginValid)}
              onPress={() => void (mode === 'register' ? submitRegistration() : submitLogin())}
              style={({ pressed }) => [styles.primaryButton, (!configured || busy || (mode === 'register' ? !registrationValid : !loginValid)) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>{busy ? text('请稍候…', 'Please wait…') : mode === 'register' ? text('创建账号', 'Create account') : text('登录账号', 'Sign in')}</Text>
            </Pressable>
            {mode === 'login' ? (
              <Pressable
                accessibilityRole="button"
                disabled={!normalizedEmail.includes('@') || busy}
                onPress={() => void submitPasswordReset()}>
                <Text style={[styles.textButton, (!normalizedEmail.includes('@') || busy) && styles.disabled]}>{text('忘记密码？发送重置邮件', 'Forgot password? Send reset email')}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.termsText}>{text('继续即表示你同意仅将账号用于家庭数据同步。密码不会写入库存数据库。', 'Continue to use your account for household sync. Passwords are never stored in the inventory database.')}</Text>
          </View>
        </View>
      ) : !household ? (
        <View style={styles.section}>
          <View style={styles.accountReadyCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{currentDisplayName.slice(0, 1).toLocaleUpperCase()}</Text></View>
            <View style={styles.accountReadyCopy}>
              <Text style={styles.accountReadyName}>{currentDisplayName}</Text>
              <Text style={styles.accountReadyEmail}>{session.user.email}</Text>
            </View>
            <View style={styles.verifiedBadge}><Text style={styles.verifiedText}>{text('已登录', 'SIGNED IN')}</Text></View>
          </View>

          <SectionHeader title={text('选择下一步', 'Choose what to do next')} detail={text('一个账号加入一个家庭', 'One household per account')} />
          <View style={styles.familyChoiceCard}>
            <View style={styles.choiceHeader}>
              <View style={[styles.choiceIcon, { backgroundColor: '#EAF4ED' }]}><Text style={styles.choiceEmoji}>🏡</Text></View>
              <View style={styles.choiceCopy}>
                <Text style={styles.choiceTitle}>{text('创建新家庭', 'Create a household')}</Text>
                <Text style={styles.choiceText}>{text('你将成为管理员，可以邀请其他成员。', 'You will be the admin and can invite members.')}</Text>
              </View>
            </View>
            <TextInput
              accessibilityLabel={text('家庭名称', 'Household name')}
              value={householdName}
              onChangeText={setHouseholdName}
              maxLength={40}
              placeholder={text('例如：Marti 的家', "For example: Marti's home")}
              placeholderTextColor={Colors.light.textSecondary}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={householdName.trim().length < 2 || busy}
              onPress={() => void submitHousehold()}
              style={[styles.primaryButton, (householdName.trim().length < 2 || busy) && styles.disabled]}>
              <Text style={styles.primaryButtonText}>{text('创建家庭', 'Create household')}</Text>
            </Pressable>
          </View>

          <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>{text('或者', 'OR')}</Text><View style={styles.orLine} /></View>

          <View style={styles.familyChoiceCard}>
            <View style={styles.choiceHeader}>
              <View style={[styles.choiceIcon, { backgroundColor: '#F3ECF6' }]}><Text style={styles.choiceEmoji}>✉️</Text></View>
              <View style={styles.choiceCopy}>
                <Text style={styles.choiceTitle}>{text('加入已有家庭', 'Join a household')}</Text>
                <Text style={styles.choiceText}>{text('输入家庭管理员发给你的邀请码。', 'Enter the code sent by the household admin.')}</Text>
              </View>
            </View>
            <TextInput
              accessibilityLabel={text('家庭邀请码', 'Household invite code')}
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={text('输入邀请码', 'Enter invite code')}
              placeholderTextColor={Colors.light.textSecondary}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={inviteCode.trim().length < 6 || busy}
              onPress={() => void submitInviteCode()}
              style={[styles.secondaryButton, (inviteCode.trim().length < 6 || busy) && styles.disabled]}>
              <Text style={styles.secondaryButtonText}>{text('加入家庭', 'Join household')}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.householdHero}>
            <View style={styles.householdHeroTop}>
              <Text style={styles.householdEmoji}>🏡</Text>
              <View style={styles.syncBadge}><View style={styles.syncDot} /><Text style={styles.syncText}>{statusText}</Text></View>
            </View>
            <Text style={styles.householdName}>{household.name}</Text>
            <Text style={styles.householdMeta}>{text(`${memberCount} 位成员 · 你是${household.role === 'owner' ? '管理员' : '成员'}`, `${memberCount} member${memberCount === 1 ? '' : 's'} · You are ${household.role === 'owner' ? 'admin' : 'a member'}`)}</Text>
          </View>

          <SectionHeader title={text('家庭成员', 'Household members')} detail={text(`${memberCount} 人`, `${memberCount} people`)} />
          <View style={styles.memberList}>
            {household.members.map((member) => (
              <View key={member.userId} style={styles.memberRow}>
                <View style={styles.memberAvatar}><Text style={styles.memberAvatarText}>{(member.displayName || member.email).slice(0, 1).toLocaleUpperCase()}</Text></View>
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName}>{member.displayName || member.email.split('@')[0]}</Text>
                  <Text style={styles.memberEmail}>{member.email}</Text>
                </View>
                {household.role === 'owner' && member.userId !== session.user.id ? (
                  <View style={styles.memberActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={text(`移交管理员给${member.displayName}`, `Transfer admin to ${member.displayName}`)} onPress={() => confirmTransfer(member.userId, member.displayName || member.email)} style={styles.memberActionPrimary}>
                      <Text style={styles.memberActionPrimaryText}>{text('移交', 'Transfer')}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={text(`移除${member.displayName}`, `Remove ${member.displayName}`)} onPress={() => confirmRemove(member.userId, member.displayName || member.email)} style={styles.memberActionDanger}>
                      <MaterialCommunityIcons name="account-remove-outline" size={17} color={Colors.light.danger} />
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.memberRole}>{member.role === 'owner' ? text('管理员', 'ADMIN') : text('成员', 'MEMBER')}</Text>
                )}
              </View>
            ))}
          </View>

          {household.role === 'owner' ? (
            <View style={styles.inviteCard}>
              <Text style={styles.inviteTitle}>{text('邀请家人', 'Invite a member')}</Text>
              <Text style={styles.inviteText}>{text('邀请码会绑定对方邮箱，并在 7 天后过期。', 'The code is tied to their email and expires after 7 days.')}</Text>
              <TextInput
                accessibilityLabel={text('受邀成员邮箱', 'Invitee email')}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="family@example.com"
                placeholderTextColor={Colors.light.textSecondary}
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!inviteEmail.includes('@') || busy}
                onPress={() => void submitMemberInvite()}
                style={[styles.secondaryButton, (!inviteEmail.includes('@') || busy) && styles.disabled]}>
                <Text style={styles.secondaryButtonText}>{text('生成邀请码', 'Create invite code')}</Text>
              </Pressable>
              {latestInviteCode ? (
                <View style={styles.inviteCodeBox}>
                  <Text style={styles.inviteCodeLabel}>{text('家庭邀请码', 'INVITE CODE')}</Text>
                  <Text selectable style={styles.inviteCode}>{latestInviteCode}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.securityManageCard}>
            <Text style={styles.inviteTitle}>{text('账号安全', 'Account security')}</Text>
            <Text style={styles.inviteText}>{text('更新密码后，其他设备上的现有会话仍可在 Supabase 安全设置中统一撤销。', 'After changing your password, existing sessions can be revoked from Supabase security settings.')}</Text>
            <View style={styles.passwordField}>
              <TextInput
                accessibilityLabel={text('新密码', 'New password')}
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
                secureTextEntry={!showPassword}
                placeholder={text('输入至少 8 位的新密码', 'Enter a new password (8+ characters)')}
                placeholderTextColor={Colors.light.textSecondary}
                style={styles.passwordInput}
              />
              <Pressable onPress={() => setShowPassword((current) => !current)} hitSlop={10}>
                <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
            <Pressable disabled={newPassword.length < 8 || busy} onPress={() => void submitPasswordChange()} style={[styles.secondaryButton, (newPassword.length < 8 || busy) && styles.disabled]}>
              <Text style={styles.secondaryButtonText}>{text('更新密码', 'Update password')}</Text>
            </Pressable>
          </View>

          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>{text('家庭与账号操作', 'Household & account actions')}</Text>
            <Pressable accessibilityRole="button" onPress={confirmLeave} style={styles.dangerRow}>
              <MaterialCommunityIcons name="home-export-outline" size={19} color={Colors.light.warning} />
              <Text style={styles.dangerRowText}>{text(household.role === 'owner' && memberCount === 1 ? '解散并退出家庭' : '退出这个家庭', household.role === 'owner' && memberCount === 1 ? 'Close and leave household' : 'Leave this household')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={confirmDeleteAccount} style={styles.dangerRow}>
              <MaterialCommunityIcons name="account-cancel-outline" size={19} color={Colors.light.danger} />
              <Text style={[styles.dangerRowText, { color: Colors.light.danger }]}>{text('永久删除账号', 'Delete account permanently')}</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void submitSignOut()}
            style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="logout" size={19} color={Colors.light.danger} />
            <Text style={styles.signOutText}>{text('退出账号', 'Sign out')}</Text>
          </Pressable>
        </View>
      )}

      {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.42 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  section: { gap: 15 },
  setupBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 21, backgroundColor: '#FFF5E2', borderWidth: 1, borderColor: '#ECD9B7' },
  setupIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFFFFFA8' },
  setupCopy: { flex: 1, gap: 4 },
  setupTitle: { color: '#815020', fontSize: 13, fontWeight: '900' },
  setupText: { color: '#866A4F', fontSize: 10, lineHeight: 16 },
  modeTabs: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: 17, backgroundColor: Colors.light.backgroundElement },
  modeTab: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  modeTabSelected: { backgroundColor: Colors.light.surface, boxShadow: '0 3px 10px rgba(45, 64, 51, 0.09)' },
  modeTabText: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '800' },
  modeTabTextSelected: { color: Colors.light.primary },
  socialStack: { gap: 10 },
  socialButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 16, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  socialButtonText: { color: Colors.light.text, fontSize: 12.5, fontWeight: '800' },
  formCard: { gap: 11, padding: 15, borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  fieldGroup: { gap: 7 },
  fieldLabel: { color: Colors.light.text, fontSize: 11, fontWeight: '900' },
  input: { minHeight: 50, paddingHorizontal: 14, borderRadius: 15, color: Colors.light.text, fontSize: 13, backgroundColor: Colors.light.backgroundElement, borderWidth: 1, borderColor: Colors.light.border },
  passwordField: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14, borderRadius: 15, backgroundColor: Colors.light.backgroundElement, borderWidth: 1, borderColor: Colors.light.border },
  passwordInput: { flex: 1, minHeight: 48, paddingHorizontal: 14, color: Colors.light.text, fontSize: 13 },
  primaryButton: { minHeight: 51, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 16, backgroundColor: Colors.light.primary },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  secondaryButton: { minHeight: 49, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 16, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#C8DDD0' },
  secondaryButtonText: { color: Colors.light.primary, fontSize: 12.5, fontWeight: '900' },
  securityNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 15, backgroundColor: '#EDF6F0' },
  securityText: { flex: 1, color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 15 },
  termsText: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 15, textAlign: 'center' },
  textButton: { color: Colors.light.primary, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  accountReadyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  avatar: { width: 51, height: 51, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: Colors.light.primary },
  avatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  accountReadyCopy: { flex: 1, gap: 3 },
  accountReadyName: { color: Colors.light.text, fontSize: 15, fontWeight: '900' },
  accountReadyEmail: { color: Colors.light.textSecondary, fontSize: 10 },
  verifiedBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.light.primarySoft },
  verifiedText: { color: Colors.light.primary, fontSize: 7.5, fontWeight: '900', letterSpacing: 0.5 },
  familyChoiceCard: { gap: 14, padding: 17, borderRadius: 24, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  choiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  choiceIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  choiceEmoji: { fontSize: 25 },
  choiceCopy: { flex: 1, gap: 4 },
  choiceTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  choiceText: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 15 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.light.border },
  orText: { color: Colors.light.textSecondary, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  householdHero: { minHeight: 176, justifyContent: 'flex-end', gap: 6, padding: 20, borderRadius: 27, backgroundColor: Colors.light.primary },
  householdHeroTop: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  householdEmoji: { fontSize: 34 },
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 11, backgroundColor: '#FFFFFF1F' },
  syncDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#BCE4C7' },
  syncText: { color: '#E1F0E5', fontSize: 8.5, fontWeight: '800' },
  householdName: { color: '#FFFFFF', fontSize: 25, fontWeight: '900' },
  householdMeta: { color: '#D6E9DB', fontSize: 10.5 },
  memberList: { overflow: 'hidden', borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  memberRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  memberAvatar: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.primarySoft },
  memberAvatarText: { color: Colors.light.primary, fontSize: 15, fontWeight: '900' },
  memberCopy: { flex: 1, gap: 3 },
  memberName: { color: Colors.light.text, fontSize: 12.5, fontWeight: '900' },
  memberEmail: { color: Colors.light.textSecondary, fontSize: 9 },
  memberRole: { color: Colors.light.primary, fontSize: 7.5, fontWeight: '900', letterSpacing: 0.45 },
  memberActions: { alignItems: 'center', gap: 5 },
  memberActionPrimary: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 10, backgroundColor: Colors.light.primarySoft },
  memberActionPrimaryText: { color: Colors.light.primary, fontSize: 9, fontWeight: '900' },
  memberActionDanger: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.light.dangerSoft },
  securityManageCard: { gap: 12, padding: 17, borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  dangerCard: { overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: '#E8D6C8', backgroundColor: '#FFF9F4' },
  dangerTitle: { padding: 14, color: Colors.light.text, fontSize: 12, fontWeight: '900' },
  dangerRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E8D6C8' },
  dangerRowText: { color: Colors.light.warning, fontSize: 11.5, fontWeight: '800' },
  inviteCard: { gap: 12, padding: 17, borderRadius: 23, backgroundColor: '#F4EFF7', borderWidth: 1, borderColor: '#E2D7E8' },
  inviteTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  inviteText: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 15 },
  inviteCodeBox: { alignItems: 'center', gap: 5, padding: 14, borderRadius: 16, backgroundColor: '#FFFFFFB8' },
  inviteCodeLabel: { color: Colors.light.textSecondary, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  inviteCode: { color: '#76527E', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  signOutButton: { minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: Colors.light.dangerSoft },
  signOutText: { color: Colors.light.danger, fontSize: 12, fontWeight: '900' },
  notice: { padding: 14, borderRadius: 17, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#C8DDD0' },
  noticeText: { color: Colors.light.primary, fontSize: 10.5, lineHeight: 16, fontWeight: '700' },
});
