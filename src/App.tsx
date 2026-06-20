import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import type { User } from '@supabase/supabase-js'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

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
    setMessage('已退出登录')
  }

  if (user) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1>0305</h1>
          <p>你已登录：</p>
          <p>{user.email}</p>
          <p>功能开发中。</p>
          <button style={styles.button} onClick={signOut}>
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
  },
  card: {
    width: '90%',
    maxWidth: 380,
    background: 'white',
    borderRadius: 24,
    padding: 24,
    boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
    textAlign: 'center',
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
  },
}

export default App