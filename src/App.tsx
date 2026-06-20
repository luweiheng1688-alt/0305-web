import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import type { User } from '@supabase/supabase-js'

type Profile = {
  id: string
  email: string
  planet_code: string
}

type Space = {
  id: string
  owner_id: string
  title: string
  theme_kind: string | null
  artist_name: string | null
  song_title: string | null
  lyric_line: string | null
  lyric_translation: string | null
  loop_count: number | null
  progress: number | null
  mood: string | null
  topic: string | null
  is_live: boolean | null
  listeners: number | null
  created_at: string
}

type SpaceMessage = {
  id: string
  space_id: string
  sender_id: string | null
  sender_code: string | null
  kind: string
  text: string
  created_at: string
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const [spaces, setSpaces] = useState<Space[]>([])
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null)
  const [messages, setMessages] = useState<SpaceMessage[]>([])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState('')

  const [isTextMode, setIsTextMode] = useState(true)
  const [isShowingDetail, setIsShowingDetail] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user)

      if (data.user) {
        await loadProfile(data.user.id)
        await loadSpaces()
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)

      if (session?.user) {
        await loadProfile(session.user.id)
        await loadSpaces()
      } else {
        setProfile(null)
        setSpaces([])
        setSelectedSpace(null)
        setMessages([])
      }
    })

    const spacesChannel = supabase
      .channel('spaces_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spaces' },
        () => loadSpaces()
      )
      .subscribe()

    const messagesChannel = supabase
      .channel('space_messages_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'space_messages' },
        () => {
          if (selectedSpace) {
            loadSpaceMessages(selectedSpace.id)
          }
        }
      )
      .subscribe()

    return () => {
      listener.subscription.unsubscribe()
      supabase.removeChannel(spacesChannel)
      supabase.removeChannel(messagesChannel)
    }
  }, [selectedSpace?.id])

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, planet_code')
      .eq('id', userId)
      .single()

    if (error) {
      setMessage(`读取用户资料失败：${error.message}`)
      return
    }

    setProfile(data)
  }

  async function loadSpaces() {
    const { data, error } = await supabase
      .from('spaces')
      .select('id, owner_id, title, theme_kind, artist_name, song_title, lyric_line, lyric_translation, loop_count, progress, mood, topic, is_live, listeners, created_at')
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(`读取时空失败：${error.message}`)
      return
    }

    setSpaces(data ?? [])
  }

  async function loadSpaceMessages(spaceId: string) {
    const { data, error } = await supabase
      .from('space_messages')
      .select('id, space_id, sender_id, sender_code, kind, text, created_at')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(`读取消息失败：${error.message}`)
      return
    }

    setMessages(data ?? [])
  }

  async function openSpace(space: Space) {
    setSelectedSpace(space)
    setIsShowingDetail(false)
    await loadSpaceMessages(space.id)
  }

  async function sendTextMessage() {
    setMessage('')

    if (!user) {
      setMessage('请先登录')
      return
    }

    if (!profile) {
      setMessage('用户资料未加载，请刷新后再试')
      return
    }

    if (!selectedSpace) {
      setMessage('请先进入一个时空')
      return
    }

    const text = draft.trim()

    if (!text) {
      return
    }

    setSending(true)

    const { error } = await supabase
      .from('space_messages')
      .insert({
        space_id: selectedSpace.id,
        sender_id: user.id,
        sender_code: profile.planet_code,
        kind: 'user',
        text,
      })

    setSending(false)

    if (error) {
      setMessage(`发送失败：${error.message}`)
      return
    }

    setDraft('')
    await loadSpaceMessages(selectedSpace.id)
  }

  async function sendEmojiEvent() {
    if (!user || !profile || !selectedSpace) return

    const { error } = await supabase
      .from('space_messages')
      .insert({
        space_id: selectedSpace.id,
        sender_id: user.id,
        sender_code: profile.planet_code,
        kind: 'system',
        text: '欢迎欢迎👏',
      })

    if (error) {
      setMessage(`发送失败：${error.message}`)
      return
    }

    await loadSpaceMessages(selectedSpace.id)
  }

  async function signUp() {
    setMessage('')

    if (!email || !password || !inviteCode) {
      setMessage('请填写邮箱、密码和邀请码')
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    if (!data.user) {
      setMessage('注册成功，请先验证邮箱后登录')
      return
    }

    const { data: ok, error: inviteError } = await supabase.rpc('use_invite_code', {
      invite_code: inviteCode,
    })

    if (inviteError) {
      setMessage(inviteError.message)
      return
    }

    if (!ok) {
      setMessage('邀请码无效或已经被使用')
      return
    }

    setMessage('注册成功，邀请码已使用')
  }

  async function signIn() {
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('登录成功')
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (!user) {
    return (
      <div style={styles.loginPage}>
        <div style={styles.loginCard}>
          <h1 style={styles.loginTitle}>0305</h1>
          <p style={styles.loginSub}>进入我们的星球</p>

          <input
            style={styles.loginInput}
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            style={styles.loginInput}
            placeholder="密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            style={styles.loginInput}
            placeholder="邀请码"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />

          <button style={styles.blackButton} onClick={signUp}>注册</button>
          <button style={styles.whiteButton} onClick={signIn}>登录</button>

          {message && <p style={styles.message}>{message}</p>}
        </div>
      </div>
    )
  }

  if (selectedSpace && isShowingDetail) {
    return (
      <div style={styles.page}>
        <div style={styles.detailTop}>
          <button style={styles.backIcon} onClick={() => setIsShowingDetail(false)}>‹</button>
        </div>

        <main style={styles.detailMain}>
          <h1 style={styles.detailTitle}>{selectedSpace.title}</h1>

          <div style={styles.ownerRow}>
            <div style={styles.bigAvatar}>
              {(selectedSpace.artist_name || profile?.planet_code || '??').slice(0, 2)}
            </div>

            <div>
              <div style={styles.ownerName}>
                {selectedSpace.artist_name || '未知用户'}
                {selectedSpace.owner_id === user.id && (
                  <span style={styles.ownerBadge}>时空主人</span>
                )}
              </div>

              <div style={styles.createdText}>
                创建于：{formatDate(selectedSpace.created_at)}
              </div>
            </div>
          </div>

          <div style={styles.topicBlock}>
            <div style={styles.topicLine}></div>
            <p style={styles.topicText}>
              TA说： {selectedSpace.topic || selectedSpace.lyric_line || selectedSpace.title}
            </p>
          </div>
        </main>

        <section style={styles.detailList}>
          <div style={styles.listRow}>
            <span style={styles.listIcon}>☺</span>
            <span style={styles.listTitle}>累计来过</span>
            <span style={styles.listValue}>{selectedSpace.listeners ?? 0}</span>
            <span style={styles.arrow}>›</span>
          </div>

          <div style={styles.listRow}>
            <span style={styles.heart}>♥</span>
            <span style={styles.listTitle}>喜欢这个时空</span>
            <span style={styles.listValue}>0</span>
            <span style={styles.arrow}>›</span>
          </div>

          <div style={styles.listRow}>
            <span style={styles.listIcon}>✎</span>
            <span style={styles.listTitle}>留言板</span>
            <span style={styles.listValue}>0</span>
            <span style={styles.arrow}>›</span>
          </div>
        </section>
      </div>
    )
  }

  if (selectedSpace) {
    return (
      <div style={styles.roomPage}>
        <header style={styles.roomHeader}>
          <div style={styles.roomTitleRow}>
            <h1 style={styles.roomTitle}>{selectedSpace.title}</h1>

            <div style={styles.roomActions}>
              <button style={styles.roomIconButton} onClick={() => setSelectedSpace(null)}>↘</button>
              <button style={styles.roomIconButton} onClick={() => setIsShowingDetail(true)}>•••</button>
            </div>
          </div>

          <div style={styles.memberRow}>
            <div style={styles.smallAvatar}>
              {(selectedSpace.artist_name || profile?.planet_code || '??').slice(0, 2)}
            </div>

            <div style={styles.memberSpacer}></div>

            <div style={styles.peoplePill}>
              此刻{selectedSpace.listeners ?? 0}人
            </div>
          </div>
        </header>

        <div style={styles.divider}></div>

        <main style={styles.messageStream}>
          {messages.map((item) => {
            if (item.kind === 'system') {
              return (
                <div key={item.id} style={styles.systemMessage}>
                  <div>{item.text}</div>
                  <div style={styles.timeText}>{formatTime(item.created_at)}</div>
                </div>
              )
            }

            return (
              <div key={item.id} style={styles.userMessage}>
                {item.sender_code && (
                  <div style={styles.senderCode}>{item.sender_code}</div>
                )}
                <div style={styles.messageText}>{item.text}</div>
              </div>
            )
          })}

          {messages.length === 0 && (
            <div style={styles.emptyRoom}>这里还没有人说话</div>
          )}

          {message && <p style={styles.message}>{message}</p>}
        </main>

        <footer style={styles.inputBar}>
          <button style={styles.emojiButton} onClick={sendEmojiEvent}>☺</button>

          {isTextMode ? (
            <input
              style={styles.chatInput}
              placeholder="一起说会儿话吧..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  sendTextMessage()
                }
              }}
            />
          ) : (
            <button style={styles.voiceButton}>按住说话</button>
          )}

          <button style={styles.roundButton} onClick={() => setIsTextMode(!isTextMode)}>
            {isTextMode ? '🎙' : '⌨'}
          </button>

          <button style={styles.roundButton}>▧</button>

          {isTextMode && (
            <button style={styles.sendMiniButton} onClick={sendTextMessage} disabled={sending}>
              发
            </button>
          )}
        </footer>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={styles.homeHeader}>
        <button style={styles.homeIcon}>♙</button>

        <div style={styles.homeRight}>
          <button style={styles.searchIcon}>⌕</button>
          <button style={styles.profileCircle}></button>
        </div>
      </header>

      <main style={styles.grid}>
        {spaces.map((space) => (
          <button
            key={space.id}
            style={styles.spaceCell}
            onClick={() => openSpace(space)}
          >
            <div style={styles.spaceTitle}>{space.title}</div>
            <div style={styles.spaceSub}>此刻{space.listeners ?? 0}人</div>
          </button>
        ))}

        <button style={styles.addCell}>＋</button>
      </main>

      <button style={styles.logoutButton} onClick={signOut}>
        退出登录
      </button>

      {message && <p style={styles.message}>{message}</p>}
    </div>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatTime(value: string) {
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#fff',
    color: '#3f3f46',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  },
  loginPage: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    padding: 24,
  },
  loginCard: {
    width: '100%',
    maxWidth: 360,
  },
  loginTitle: {
    fontSize: 56,
    margin: 0,
    color: '#333',
  },
  loginSub: {
    color: '#999',
    marginBottom: 28,
  },
  loginInput: {
    width: '100%',
    height: 52,
    boxSizing: 'border-box',
    border: '1px solid #eee',
    background: '#fafafa',
    borderRadius: 16,
    padding: '0 16px',
    fontSize: 16,
    marginBottom: 12,
  },
  blackButton: {
    width: '100%',
    height: 52,
    border: 'none',
    borderRadius: 16,
    background: '#333',
    color: '#fff',
    fontSize: 16,
    marginTop: 8,
  },
  whiteButton: {
    width: '100%',
    height: 52,
    border: '1px solid #eee',
    borderRadius: 16,
    background: '#fff',
    color: '#333',
    fontSize: 16,
    marginTop: 12,
  },
  homeHeader: {
    height: 122,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: '0 42px 28px',
    boxSizing: 'border-box',
  },
  homeIcon: {
    border: 'none',
    background: 'transparent',
    fontSize: 34,
    color: '#3f3f46',
  },
  homeRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 30,
  },
  searchIcon: {
    border: 'none',
    background: 'transparent',
    fontSize: 48,
    lineHeight: 1,
    color: '#3f3f46',
  },
  profileCircle: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    border: '4px solid #555',
    background: '#fff',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    borderTop: '1px solid #eee',
    borderLeft: '1px solid #eee',
  },
  spaceCell: {
    height: 150,
    border: 'none',
    borderRight: '1px solid #eee',
    borderBottom: '1px solid #eee',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spaceTitle: {
    fontSize: 15,
    color: '#3f3f46',
    marginBottom: 8,
  },
  spaceSub: {
    fontSize: 13,
    color: '#aaa',
  },
  addCell: {
    height: 150,
    border: 'none',
    borderRight: '1px solid #eee',
    borderBottom: '1px solid #eee',
    background: '#fff',
    fontSize: 42,
    color: '#444',
  },
  logoutButton: {
    position: 'fixed',
    right: 16,
    bottom: 16,
    background: '#fff',
    border: '1px solid #eee',
    borderRadius: 999,
    padding: '8px 14px',
    color: '#999',
  },
  roomPage: {
    minHeight: '100vh',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    color: '#3f3f46',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  },
  roomHeader: {
    padding: '22px 20px 14px',
  },
  roomTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  roomTitle: {
    fontSize: 36,
    fontWeight: 400,
    margin: 0,
    flex: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  roomActions: {
    display: 'flex',
    gap: 8,
  },
  roomIconButton: {
    width: 44,
    height: 44,
    border: 'none',
    background: 'transparent',
    fontSize: 24,
    color: '#3f3f46',
  },
  memberRow: {
    display: 'flex',
    alignItems: 'center',
    marginTop: 28,
  },
  smallAvatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '1px solid #eee',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#777',
    background: '#fff',
  },
  memberSpacer: {
    flex: 1,
  },
  peoplePill: {
    padding: '13px 24px',
    borderRadius: 999,
    background: '#f3f3f3',
    color: '#777',
    fontSize: 18,
  },
  divider: {
    height: 1,
    background: '#eee',
  },
  messageStream: {
    flex: 1,
    padding: '36px 20px 120px',
    overflowY: 'auto',
  },
  systemMessage: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 18,
    marginBottom: 28,
  },
  timeText: {
    fontSize: 13,
    marginTop: 8,
    color: '#bbb',
  },
  userMessage: {
    textAlign: 'center',
    marginBottom: 28,
  },
  senderCode: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 8,
  },
  messageText: {
    color: '#999',
    fontSize: 18,
    lineHeight: 1.5,
  },
  emptyRoom: {
    textAlign: 'center',
    color: '#aaa',
    marginTop: 80,
  },
  inputBar: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 18px 22px',
    boxSizing: 'border-box',
  },
  emojiButton: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    border: '3px solid #555',
    background: '#fff',
    fontSize: 24,
  },
  chatInput: {
    flex: 1,
    height: 54,
    border: 'none',
    borderRadius: 999,
    background: '#f4f4f4',
    padding: '0 20px',
    fontSize: 16,
    minWidth: 0,
  },
  voiceButton: {
    flex: 1,
    height: 54,
    border: 'none',
    borderRadius: 999,
    background: '#f4f4f4',
    color: '#aaa',
    fontSize: 18,
  },
  roundButton: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    border: '2px solid #ddd',
    background: '#fff',
    fontSize: 20,
  },
  sendMiniButton: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    background: '#333',
    color: '#fff',
  },
  detailTop: {
    height: 96,
    display: 'flex',
    alignItems: 'flex-end',
    paddingLeft: 34,
  },
  backIcon: {
    border: 'none',
    background: 'transparent',
    fontSize: 72,
    color: '#3f3f46',
  },
  detailMain: {
    padding: '34px 44px 70px',
  },
  detailTitle: {
    fontSize: 56,
    fontWeight: 400,
    margin: '0 0 54px',
    color: '#3f3f46',
  },
  ownerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 22,
    marginBottom: 48,
  },
  bigAvatar: {
    width: 88,
    height: 88,
    borderRadius: '50%',
    background: '#ead796',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 28,
    fontWeight: 700,
  },
  ownerName: {
    fontSize: 26,
    color: '#999',
  },
  ownerBadge: {
    fontSize: 16,
    border: '1px solid #aaa',
    borderRadius: 6,
    padding: '4px 8px',
    marginLeft: 12,
  },
  createdText: {
    fontSize: 20,
    color: '#aaa',
    marginTop: 8,
  },
  topicBlock: {
    display: 'flex',
    gap: 24,
  },
  topicLine: {
    width: 8,
    background: '#f1f1f1',
  },
  topicText: {
    fontSize: 30,
    color: '#aaa',
    lineHeight: 1.5,
    margin: 0,
  },
  detailList: {
    borderTop: '12px solid #f7f7f7',
  },
  listRow: {
    height: 92,
    display: 'grid',
    gridTemplateColumns: '56px 1fr 50px 28px',
    alignItems: 'center',
    padding: '0 44px',
    borderBottom: '1px solid #f2f2f2',
  },
  listIcon: {
    fontSize: 30,
    color: '#666',
  },
  heart: {
    fontSize: 34,
    color: '#28c29d',
  },
  listTitle: {
    fontSize: 30,
    color: '#3f3f46',
  },
  listValue: {
    fontSize: 24,
    color: '#aaa',
    textAlign: 'right',
  },
  arrow: {
    fontSize: 42,
    color: '#aaa',
    textAlign: 'right',
  },
  message: {
    color: '#d44',
    textAlign: 'center',
    padding: 12,
  },
}

export default App