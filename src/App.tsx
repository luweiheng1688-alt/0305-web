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

type SpaceComment = {
  id: string
  space_id: string
  author_id: string
  author_code: string | null
  text: string | null
  image_data: string | null
  image_mime_type: string | null
  created_at: string
}

type Profile = {
  id: string
  email: string
  planet_code: string
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const [posts, setPosts] = useState<StatusPost[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  const [comments, setComments] = useState<SpaceComment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)

  const [spaceId, setSpaceId] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [message, setMessage] = useState('')

  const [newPostText, setNewPostText] = useState('')
  const [newPostMood, setNewPostMood] = useState('')
  const [posting, setPosting] = useState(false)

  const [newCommentText, setNewCommentText] = useState('')
  const [commenting, setCommenting] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user)

      if (data.user) {
        await loadMyProfile(data.user.id)
        await loadFirstSpace()
        await loadStatusPosts()
        await loadSpaceComments()
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)

      if (session?.user) {
        await loadMyProfile(session.user.id)
        await loadFirstSpace()
        await loadStatusPosts()
        await loadSpaceComments()
      } else {
        setProfile(null)
        setPosts([])
        setComments([])
      }
    })

    const postsChannel = supabase
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

    const commentsChannel = supabase
      .channel('space_comments_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'space_comments',
        },
        () => {
          loadSpaceComments()
        }
      )
      .subscribe()

    return () => {
      listener.subscription.unsubscribe()
      supabase.removeChannel(postsChannel)
      supabase.removeChannel(commentsChannel)
    }
  }, [])

  async function loadMyProfile(userId: string) {
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

  async function loadFirstSpace() {
    const { data, error } = await supabase
      .from('spaces')
      .select('id')
      .limit(1)
      .single()

    if (error) {
      setMessage(`读取空间失败：${error.message}`)
      return
    }

    setSpaceId(data.id)
  }

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

  async function loadSpaceComments() {
    setLoadingComments(true)

    const { data, error } = await supabase
      .from('space_comments')
      .select('id, space_id, author_id, author_code, text, image_data, image_mime_type, created_at')
      .order('created_at', { ascending: false })

    setLoadingComments(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setComments(data ?? [])
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
    setProfile(null)
    setPosts([])
    setComments([])
    setMessage('已退出登录')
  }

  async function createStatusPost() {
    setMessage('')

    if (!user) {
      setMessage('请先登录后再发布')
      return
    }

    if (!newPostText.trim()) {
      setMessage('请输入动态内容')
      return
    }

    setPosting(true)

    const { error } = await supabase
      .from('status_posts')
      .insert({
        author_id: user.id,
        text: newPostText.trim(),
        mood: newPostMood.trim() || '平静',
        echo_count: 0,
      })

    setPosting(false)

    if (error) {
      setMessage(`发布失败：${error.message}`)
      return
    }

    setNewPostText('')
    setNewPostMood('')
    setMessage('发布成功')
    await loadStatusPosts()
  }

  async function echoStatusPost(post: StatusPost) {
    setMessage('')

    const nextEchoCount = (post.echo_count ?? 0) + 1

    const { error } = await supabase
      .from('status_posts')
      .update({
        echo_count: nextEchoCount,
      })
      .eq('id', post.id)

    if (error) {
      setMessage(`回响失败：${error.message}`)
      return
    }

    await loadStatusPosts()
  }

  async function createSpaceComment() {
    setMessage('')

    if (!user) {
      setMessage('请先登录后再留言')
      return
    }

    if (!profile) {
      setMessage('用户资料还没加载好，请刷新后再试')
      return
    }

    if (!spaceId) {
      setMessage('空间还没加载好，请刷新后再试')
      return
    }

    if (!newCommentText.trim()) {
      setMessage('请输入留言内容')
      return
    }

    setCommenting(true)

    const { error } = await supabase
      .from('space_comments')
      .insert({
        space_id: spaceId,
        author_id: user.id,
        author_code: profile.planet_code,
        text: newCommentText.trim(),
        image_data: null,
        image_mime_type: null,
      })

    setCommenting(false)

    if (error) {
      setMessage(`留言失败：${error.message}`)
      return
    }

    setNewCommentText('')
    setMessage('留言成功')
    await loadSpaceComments()
  }

  if (user) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1>0305</h1>
          <p>你已登录：{user.email}</p>
          {profile && <p style={styles.smallText}>你的星球编号：{profile.planet_code}</p>}

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

          <button
            style={styles.button}
            onClick={createStatusPost}
            disabled={posting}
          >
            {posting ? '发布中...' : '发布动态'}
          </button>

          <button style={styles.button} onClick={loadStatusPosts}>
            刷新动态
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

              <div style={styles.echoRow}>
                <span style={styles.postMeta}>
                  回响：{post.echo_count ?? 0}
                </span>

                <button
                  style={styles.echoButton}
                  onClick={() => echoStatusPost(post)}
                >
                  回响 +1
                </button>
              </div>

              <p style={styles.postDate}>
                {new Date(post.created_at).toLocaleString()}
              </p>
            </div>
          ))}

          <h2 style={styles.sectionTitle}>空间留言</h2>

          <textarea
            style={styles.textarea}
            placeholder="留下一句话..."
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
          />

          <button
            style={styles.button}
            onClick={createSpaceComment}
            disabled={commenting}
          >
            {commenting ? '留言中...' : '发布留言'}
          </button>

          <button style={styles.button} onClick={loadSpaceComments}>
            刷新留言
          </button>

          {loadingComments && <p>正在加载留言...</p>}

          {!loadingComments && comments.length === 0 && (
            <p style={styles.emptyText}>还没有留言</p>
          )}

          {!loadingComments && comments.map((comment) => (
            <div key={comment.id} style={styles.commentCard}>
              <p style={styles.commentAuthor}>
                {comment.author_code || '未知用户'}
              </p>
              <p style={styles.postText}>{comment.text || '无内容'}</p>
              <p style={styles.postDate}>
                {new Date(comment.created_at).toLocaleString()}
              </p>
            </div>
          ))}

          <button style={styles.secondaryButton} onClick={signOut}>
            退出登录
          </button>

          {message && <p style={styles.message}>{message}</p>}
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

        {message && <p style={styles.message}>{message}</p>}
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
    marginTop: 28,
    marginBottom: 12,
    fontSize: 20,
  },
  emptyText: {
    color: '#999',
  },
  smallText: {
    fontSize: 13,
    color: '#999',
  },
  postCard: {
    textAlign: 'left',
    background: '#fff7f7',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  commentCard: {
    textAlign: 'left',
    background: '#f8f8ff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  commentAuthor: {
    fontSize: 13,
    color: '#ff6b81',
    margin: '0 0 6px',
    fontWeight: 700,
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
  echoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  echoButton: {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid #ff6b81',
    background: 'white',
    color: '#ff6b81',
    fontSize: 13,
  },
  message: {
    fontSize: 14,
    color: '#ff6b81',
    marginTop: 8,
    marginBottom: 12,
  },
}

export default App