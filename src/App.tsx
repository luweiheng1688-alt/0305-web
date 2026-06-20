import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import type { User } from '@supabase/supabase-js'

type StatusPost = {
  id: string
  author_id: string
  text: string | null
  mood: string | null
  echo_count: number | null
  created_at: string
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [posts, setPosts] = useState<StatusPost[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [newPostText, setNewPostText] = useState('')
  const [newPostMood, setNewPostMood] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
  supabase.auth.getUser().then(({ data }) => {
    setUser(data.user)

    if (data.user) {
      loadStatusPosts()
    }
  })

  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null)

    if (session?.user) {
      loadStatusPosts()
    } else {
      setPosts([])
    }
  })

  const channel = supabase
    .channel('status_posts_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'status_posts',
      },
      () => {
        loadStatusPosts()
      }
    )
    .subscribe()

  return () => {
    listener.subscription.unsubscribe()
    supabase.removeChannel(channel)
  }
}, [])

  async function loadStatusPosts() {
    setLoadingPosts(true)

    const { data, error } = await supabase
      .from('status_posts')
      .select('id, author_id, text, mood, echo_count, created_at')
      .order('created_at', { ascending: false })

    setLoadingPosts(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setPosts(data ?? [])
  }

  async function createStatusPost() {
  setMessage('')

  if (!user) {
    setMessage('请先登录')
    return
  }

  if (!newPostText.trim()) {
    setMessage('请输入动态内容')
    return
  }

  const { error } = await supabase
    .from('status_posts')
    .insert({
      author_id: user.id,
      text: newPostText.trim(),
      mood: newPostMood.trim() || null,
      echo_count: 0,
    })

  if (error) {
    setMessage(error.message)
    return
  }

  setNewPostText('')
  setNewPostMood('')
  setMessage('发布成功')
  await loadStatusPosts()
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
      setMessage('注册成功，请先去邮箱验证，然后回来登录。')
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
      setMessage('邀请码无效或已经被使用。')
      return
    }

    setMessage('注册成功，邀请码已使用。')
  }

  async function signIn() {
    setMessage('')

    if (!email || !password) {
      setMessage('请填写邮箱和密码')
      return
    }

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
    setPosts([])
    setMessage('已退出登录')
  }

  if (user) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1>0305</h1>
          <p>你已登录：{user.email}</p>

          <button style={styles.button} onClick={loadStatusPosts}>
            刷新动态
          </button>
          <textarea
  style={styles.textarea}
  placeholder="写点什么..."
  value={newPostText}
  onChange={(e) => setNewPostText(e.target.value)}
/>

<input
  style={styles.input}
  placeholder="心情，比如 开心 / 想你 / 累了"
  value={newPostMood}
  onChange={(e) => setNewPostMood(e.target.value)}
/>

<button style={styles.button} onClick={createStatusPost}>
  发布动态
</button>

          <h2 style={styles.sectionTitle}>动态</h2>

          {loadingPosts && <p>正在加载...</p>}

          {!loadingPosts && posts.length === 0 && (
            <p style={styles.emptyText}>还没有动态</p>
          )}

          {!loadingPosts && posts.map((post) => (
            <div key={post.id} style={styles.postCard}>
              <p style={styles.postText}>{post.text || '无内容'}</p>

              {post.mood && (
                <p style={styles.postMeta}>心情：{post.mood}</p>
              )}

              <p style={styles.postMeta}>
                回响：{post.echo_count ?? 0}
              </p>

              <p style={styles.postDate}>
                {new Date(post.created_at).toLocaleString()}
              </p>
            </div>
          ))}

          <button style={styles.secondaryButton} onClick={signOut}>
            退出登录
          </button>

          {message && <p>{message}</p>}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>0305</h1>
        <p>请登录或注册</p>

        <input
          style={styles.input}
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="邀请码"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
        />

        <button style={styles.button} onClick={signUp}>
          注册
        </button>

        <button style={styles.secondaryButton} onClick={signIn}>
          登录
        </button>

        {message && <p>{message}</p>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#fff7f7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: 'white',
    borderRadius: 24,
    padding: 24,
    boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  sectionTitle: {
    marginTop: 20,
    marginBottom: 12,
    fontSize: 20,
  },
  emptyText: {
    color: '#999',
  },
  postCard: {
    textAlign: 'left',
    background: '#fff7f7',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  postText: {
    fontSize: 16,
    margin: '0 0 8px',
  },
  postMeta: {
    fontSize: 13,
    color: '#666',
    margin: '4px 0',
  },
  postDate: {
    fontSize: 12,
    color: '#999',
    margin: '8px 0 0',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: 14,
    marginBottom: 12,
    borderRadius: 12,
    border: '1px solid #ddd',
    fontSize: 16,
  },
  textarea: {
  width: '100%',
  boxSizing: 'border-box',
  padding: 14,
  marginBottom: 12,
  borderRadius: 12,
  border: '1px solid #ddd',
  fontSize: 16,
  minHeight: 90,
  resize: 'vertical',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
},
  button: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    border: 'none',
    background: '#ff6b81',
    color: 'white',
    fontSize: 16,
    marginBottom: 12,
  },
  secondaryButton: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    border: '1px solid #ff6b81',
    background: 'white',
    color: '#ff6b81',
    fontSize: 16,
    marginTop: 12,
  },
}

export default App