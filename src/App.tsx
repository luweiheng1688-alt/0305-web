import type { User } from '@supabase/supabase-js'
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import './App.css'
import { supabase } from './supabaseClient'

type Profile = {
  id: string
  email: string
  planet_code: string
  avatar_seed: string
  position_description: string
  tagline: string
  created_at: string
}

type Space = {
  id: string
  owner_id: string
  title: string
  theme_kind: string
  artist_name: string
  song_title: string
  lyric_line: string
  lyric_translation: string | null
  loop_count: number
  progress: number
  mood: string
  topic: string
  is_live: boolean
  listeners: number
  created_at: string
}

type SpaceMessage = {
  id: string
  space_id: string
  sender_id: string | null
  sender_code: string | null
  kind: 'user' | 'system' | 'music' | 'audio'
  text: string
  image_data?: string | null
  image_mime_type?: string | null
  audio_data?: string | null
  audio_mime_type?: string | null
  audio_duration_text?: string | null
  created_at: string
}

type SpaceMember = {
  space_id: string
  user_id: string
  joined_at: string
  last_seen_at: string
}

type SpaceLike = {
  space_id: string
  user_id: string
  created_at: string
}

type SpaceVisit = {
  id: string
  space_id: string
  user_id: string
  created_at: string
}

type SpaceComment = {
  id: string
  space_id: string
  author_id: string
  author_code: string
  text: string
  image_data: string | null
  image_mime_type: string | null
  created_at: string
}

type DirectMessage = {
  id: string
  sender_id: string
  receiver_id: string
  sender_code: string
  receiver_code: string
  text: string
  image_data: string | null
  image_mime_type: string | null
  audio_data: string | null
  audio_mime_type: string | null
  audio_duration_text: string | null
  is_read: boolean
  created_at: string
}

type CreateSpaceForm = {
  title: string
  theme_kind: string
  topic: string
  mood: string
  artist_name: string
  song_title: string
  lyric_line: string
  lyric_translation: string
}

const ACTIVE_MEMBER_WINDOW_MS = 20_000
const PRESENCE_HEARTBEAT_MS = 10_000

const defaultCreateSpaceForm: CreateSpaceForm = {
  title: '',
  theme_kind: '任意主题',
  topic: '',
  mood: '安静',
  artist_name: '',
  song_title: '',
  lyric_line: '',
  lyric_translation: '',
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [spaceMembers, setSpaceMembers] = useState<SpaceMember[]>([])
  const [spaceLikes, setSpaceLikes] = useState<SpaceLike[]>([])
  const [spaceVisits, setSpaceVisits] = useState<SpaceVisit[]>([])
  const [spaceComments, setSpaceComments] = useState<SpaceComment[]>([])
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([])
  const [messages, setMessages] = useState<SpaceMessage[]>([])

  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null)
  const [roomOpenedAt, setRoomOpenedAt] = useState<string | null>(null)

  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [draft, setDraft] = useState('')
  const [directDraft, setDirectDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [taglineDraft, setTaglineDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [createSpaceForm, setCreateSpaceForm] = useState<CreateSpaceForm>(defaultCreateSpaceForm)

  const [message, setMessage] = useState('')
  const [isTextMode, setIsTextMode] = useState(true)
  const [isShowingCreateSpace, setIsShowingCreateSpace] = useState(false)
  const [isShowingSearch, setIsShowingSearch] = useState(false)
  const [isShowingProfile, setIsShowingProfile] = useState(false)
  const [isShowingSettings, setIsShowingSettings] = useState(false)
  const [isShowingDirectList, setIsShowingDirectList] = useState(false)
  const [isShowingDetail, setIsShowingDetail] = useState(false)
  const [isShowingVisits, setIsShowingVisits] = useState(false)
  const [isShowingComments, setIsShowingComments] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [selectedDirectPeerId, setSelectedDirectPeerId] = useState<string | null>(null)
  const [isEditingTagline, setIsEditingTagline] = useState(false)
  const [sending, setSending] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const deferredSearchQuery = useDeferredValue(searchQuery)

  const profileById = useMemo(
    () => Object.fromEntries(profiles.map((item) => [item.id, item])),
    [profiles],
  )

  const selectedSpace = spaces.find((item) => item.id === selectedSpaceId) ?? null
  const selectedProfile = selectedProfileId ? profileById[selectedProfileId] ?? null : null

  const activeMembersBySpace = useMemo(() => {
    const cutoff = Date.now() - ACTIVE_MEMBER_WINDOW_MS
    const map = new Map<string, Profile[]>()
    spaceMembers.forEach((member) => {
      if (new Date(member.last_seen_at).getTime() < cutoff) return
      const memberProfile = profileById[member.user_id]
      if (!memberProfile) return
      const existing = map.get(member.space_id) ?? []
      if (!existing.some((item) => item.id === memberProfile.id)) {
        existing.push(memberProfile)
        map.set(member.space_id, existing)
      }
    })
    return map
  }, [profileById, spaceMembers])

  const likesBySpace = useMemo(() => {
    const map = new Map<string, SpaceLike[]>()
    spaceLikes.forEach((like) => {
      const existing = map.get(like.space_id) ?? []
      existing.push(like)
      map.set(like.space_id, existing)
    })
    return map
  }, [spaceLikes])

  const visitsBySpace = useMemo(() => {
    const map = new Map<string, SpaceVisit[]>()
    spaceVisits.forEach((visit) => {
      const existing = map.get(visit.space_id) ?? []
      existing.push(visit)
      map.set(visit.space_id, existing)
    })
    return map
  }, [spaceVisits])

  const commentsBySpace = useMemo(() => {
    const map = new Map<string, SpaceComment[]>()
    spaceComments.forEach((comment) => {
      const existing = map.get(comment.space_id) ?? []
      existing.push(comment)
      map.set(comment.space_id, existing)
    })
    return map
  }, [spaceComments])

  const unreadDirectCount = useMemo(() => {
    if (!user) return 0
    return directMessages.filter((item) => item.receiver_id === user.id && !item.is_read).length
  }, [directMessages, user])

  const directConversations = useMemo(() => {
    if (!user) return []

    const map = new Map<string, DirectMessage[]>()
    directMessages.forEach((item) => {
      const peerId = item.sender_id === user.id ? item.receiver_id : item.sender_id
      const existing = map.get(peerId) ?? []
      existing.push(item)
      map.set(peerId, existing)
    })

    return Array.from(map.entries())
      .map(([peerId, rows]) => {
        const sorted = [...rows].sort((left, right) => left.created_at.localeCompare(right.created_at))
        const lastMessage = sorted[sorted.length - 1]
        const peer = profileById[peerId] ?? null
        const unreadCount = rows.filter((item) => item.receiver_id === user.id && !item.is_read).length
        return {
          peerId,
          peer,
          rows: sorted,
          lastMessage,
          unreadCount,
        }
      })
      .sort((left, right) => right.lastMessage.created_at.localeCompare(left.lastMessage.created_at))
  }, [directMessages, profileById, user])

  const selectedDirectConversation = useMemo(() => {
    if (!selectedDirectPeerId) return null
    return directConversations.find((item) => item.peerId === selectedDirectPeerId) ?? null
  }, [directConversations, selectedDirectPeerId])

  const visibleMessages = useMemo(() => {
    if (!roomOpenedAt) return messages
    return messages.filter((item) => new Date(item.created_at).getTime() >= new Date(roomOpenedAt).getTime())
  }, [messages, roomOpenedAt])

  const searchableSpaces = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()
    if (!query) return spaces
    return spaces.filter((space) => {
      const ownerCode = profileById[space.owner_id]?.planet_code ?? ''
      return [
        space.title,
        space.topic,
        space.artist_name,
        space.song_title,
        ownerCode,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [deferredSearchQuery, profileById, spaces])

  const myCommentEntries = useMemo(() => {
    if (!profile) return []
    return spaceComments
      .filter((item) => item.author_id === profile.id)
      .map((item) => {
        const space = spaces.find((entry) => entry.id === item.space_id)
        return {
          ...item,
          spaceTitle: space?.title ?? '未知时空',
        }
      })
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
  }, [profile, spaceComments, spaces])

  const loadProfiles = useEffectEvent(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, planet_code, avatar_seed, position_description, tagline, created_at')
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(`读取用户资料失败：${error.message}`)
      return
    }

    startTransition(() => {
      setProfiles((data ?? []) as Profile[])
    })
  })

  const loadSpaces = useEffectEvent(async () => {
    const { data, error } = await supabase
      .from('spaces')
      .select('id, owner_id, title, theme_kind, artist_name, song_title, lyric_line, lyric_translation, loop_count, progress, mood, topic, is_live, listeners, created_at')
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(`读取时空失败：${error.message}`)
      return
    }

    startTransition(() => {
      setSpaces((data ?? []) as Space[])
    })
  })

  const loadSpaceMembers = useEffectEvent(async () => {
    const { data, error } = await supabase
      .from('space_members')
      .select('space_id, user_id, joined_at, last_seen_at')

    if (error) {
      setMessage(`读取在线成员失败：${error.message}`)
      return
    }

    startTransition(() => {
      setSpaceMembers((data ?? []) as SpaceMember[])
    })
  })

  const loadSpaceLikes = useEffectEvent(async () => {
    const { data, error } = await supabase
      .from('space_likes')
      .select('space_id, user_id, created_at')

    if (error) {
      setMessage(`读取喜欢记录失败：${error.message}`)
      return
    }

    startTransition(() => {
      setSpaceLikes((data ?? []) as SpaceLike[])
    })
  })

  const loadSpaceVisits = useEffectEvent(async () => {
    const { data, error } = await supabase
      .from('space_visits')
      .select('id, space_id, user_id, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(`读取来过记录失败：${error.message}`)
      return
    }

    startTransition(() => {
      setSpaceVisits((data ?? []) as SpaceVisit[])
    })
  })

  const loadSpaceComments = useEffectEvent(async () => {
    const { data, error } = await supabase
      .from('space_comments')
      .select('id, space_id, author_id, author_code, text, image_data, image_mime_type, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(`读取留言板失败：${error.message}`)
      return
    }

    startTransition(() => {
      setSpaceComments((data ?? []) as SpaceComment[])
    })
  })

  const loadDirectMessages = useEffectEvent(async () => {
    if (!user) return

    const { data, error } = await supabase
      .from('direct_messages')
      .select('id, sender_id, receiver_id, sender_code, receiver_code, text, image_data, image_mime_type, audio_data, audio_mime_type, audio_duration_text, is_read, created_at')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(`读取私聊失败：${error.message}`)
      return
    }

    startTransition(() => {
      setDirectMessages((data ?? []) as DirectMessage[])
    })
  })

  const loadMessages = useEffectEvent(async (spaceId: string | null) => {
    if (!spaceId) {
      setMessages([])
      return
    }

    const { data, error } = await supabase
      .from('space_messages')
      .select('id, space_id, sender_id, sender_code, kind, text, image_data, image_mime_type, audio_data, audio_mime_type, audio_duration_text, created_at')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(`读取消息失败：${error.message}`)
      return
    }

    startTransition(() => {
      setMessages((data ?? []) as SpaceMessage[])
    })
  })

  const ensureProfile = useEffectEvent(async (authUser: User) => {
    const { data: existing, error } = await supabase
      .from('profiles')
      .select('id, email, planet_code, avatar_seed, position_description, tagline, created_at')
      .eq('id', authUser.id)
      .maybeSingle()

    if (error) {
      setMessage(`读取个人资料失败：${error.message}`)
      return null
    }

    if (existing) {
      setProfile(existing as Profile)
      setTaglineDraft((existing as Profile).tagline ?? '')
      return existing as Profile
    }

    const code = `P-${authUser.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
    const seed = authUser.id.replace(/-/g, '').slice(0, 12)
    const position = `${code}是一颗位于静默星带的小星星，距离地球 ${120 + code.length * 7}.00 光年。`

    const payload = {
      id: authUser.id,
      email: authUser.email ?? '',
      planet_code: code,
      avatar_seed: seed,
      position_description: position,
      tagline: '今天也想安静地待一会儿',
    }

    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .insert(payload)
      .select('id, email, planet_code, avatar_seed, position_description, tagline, created_at')
      .single()

    if (insertError) {
      setMessage(`创建个人资料失败：${insertError.message}`)
      return null
    }

    setProfile(inserted as Profile)
    setTaglineDraft((inserted as Profile).tagline ?? '')
    return inserted as Profile
  })

  const syncAll = useEffectEvent(async (authUser: User | null) => {
    if (!authUser) return
    const ensuredProfile = await ensureProfile(authUser)
    if (!ensuredProfile) return

    await Promise.all([
      loadProfiles(),
      loadSpaces(),
      loadSpaceMembers(),
      loadSpaceLikes(),
      loadSpaceVisits(),
      loadSpaceComments(),
      loadDirectMessages(),
    ])

    if (selectedSpaceId) {
      await loadMessages(selectedSpaceId)
    }
  })

  useEffect(() => {
    let mounted = true

    void supabase.auth.getUser().then(async ({ data }) => {
      if (!mounted) return
      setUser(data.user)
      if (data.user) {
        await syncAll(data.user)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      startTransition(() => {
        setUser(session?.user ?? null)
      })

      if (session?.user) {
        void syncAll(session.user)
      } else {
        startTransition(() => {
          setProfile(null)
          setProfiles([])
          setSpaces([])
          setSpaceMembers([])
          setSpaceLikes([])
          setSpaceVisits([])
          setSpaceComments([])
          setDirectMessages([])
          setMessages([])
          setSelectedSpaceId(null)
          setRoomOpenedAt(null)
          setTaglineDraft('')
          setSelectedDirectPeerId(null)
        })
      }
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [selectedSpaceId, syncAll])

  useEffect(() => {
    const channels = [
      supabase
        .channel('profiles-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          void loadProfiles()
        })
        .subscribe(),
      supabase
        .channel('spaces-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spaces' }, () => {
          void loadSpaces()
        })
        .subscribe(),
      supabase
        .channel('space-members-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'space_members' }, () => {
          void loadSpaceMembers()
        })
        .subscribe(),
      supabase
        .channel('space-likes-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'space_likes' }, () => {
          void loadSpaceLikes()
        })
        .subscribe(),
      supabase
        .channel('space-visits-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'space_visits' }, () => {
          void loadSpaceVisits()
        })
        .subscribe(),
      supabase
        .channel('space-comments-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'space_comments' }, () => {
          void loadSpaceComments()
        })
        .subscribe(),
      supabase
        .channel('space-messages-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'space_messages' }, () => {
          void loadMessages(selectedSpaceId)
        })
        .subscribe(),
      supabase
        .channel('direct-messages-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, () => {
          void loadDirectMessages()
        })
        .subscribe(),
    ]

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel)
      })
    }
  }, [
    loadMessages,
    loadDirectMessages,
    loadProfiles,
    loadSpaceComments,
    loadSpaceLikes,
    loadSpaceMembers,
    loadSpaceVisits,
    loadSpaces,
    selectedSpaceId,
  ])

  useEffect(() => {
    if (!user || !selectedSpaceId) return

    let cancelled = false

    const sendPresence = async () => {
      if (cancelled) return
      await supabase
        .from('space_members')
        .upsert(
          {
            space_id: selectedSpaceId,
            user_id: user.id,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'space_id,user_id' },
        )
    }

    void sendPresence()
    void supabase.from('space_visits').insert({
      space_id: selectedSpaceId,
      user_id: user.id,
    })

    const timer = window.setInterval(() => {
      void sendPresence()
    }, PRESENCE_HEARTBEAT_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      void supabase
        .from('space_members')
        .delete()
        .eq('space_id', selectedSpaceId)
        .eq('user_id', user.id)
    }
  }, [selectedSpaceId, user])

  useEffect(() => {
    if (!selectedDirectPeerId) return
    void markDirectMessagesRead(selectedDirectPeerId)
  }, [directMessages, selectedDirectPeerId])

  async function openSpace(space: Space) {
    setSelectedSpaceId(space.id)
    setRoomOpenedAt(new Date().toISOString())
    setIsShowingDetail(false)
    setMessage('')
    await loadMessages(space.id)
  }

  async function handleCreateSpace() {
    if (!user || !profile) return

    const title = createSpaceForm.title.trim()
    const themeKind = createSpaceForm.theme_kind
    const artist = createSpaceForm.artist_name.trim()
    const song = createSpaceForm.song_title.trim()
    const topic = createSpaceForm.topic.trim()
    const lyric = createSpaceForm.lyric_line.trim()
    const translation = createSpaceForm.lyric_translation.trim()

    const finalTitle =
      title ||
      (themeKind === '歌曲'
        ? [artist, song].filter(Boolean).join(' - ') || '未命名歌曲时空'
        : '未命名时空')

    setIsBusy(true)
    const { data, error } = await supabase
      .from('spaces')
      .insert({
        owner_id: user.id,
        title: finalTitle,
        theme_kind: themeKind,
        artist_name: artist || profile.planet_code,
        song_title: song || finalTitle,
        lyric_line: lyric || (themeKind === '歌曲' ? '暂无歌词' : ''),
        lyric_translation: translation || null,
        loop_count: 1,
        progress: themeKind === '歌曲' ? 0.36 : 0,
        mood: createSpaceForm.mood,
        topic: topic || '随便聊聊',
        is_live: false,
        listeners: 0,
      })
      .select('id, owner_id, title, theme_kind, artist_name, song_title, lyric_line, lyric_translation, loop_count, progress, mood, topic, is_live, listeners, created_at')
      .single()
    setIsBusy(false)

    if (error) {
      setMessage(`创建时空失败：${error.message}`)
      return
    }

    setIsShowingCreateSpace(false)
    setCreateSpaceForm(defaultCreateSpaceForm)
    await loadSpaces()
    await openSpace(data as Space)
  }

  async function sendTextMessage() {
    if (!user || !profile || !selectedSpace) {
      setMessage('请先进入一个时空')
      return
    }

    const text = draft.trim()
    if (!text) return

    setSending(true)
    const { error } = await supabase.from('space_messages').insert({
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
    await loadMessages(selectedSpace.id)
  }

  async function sendWarmEvent() {
    if (!user || !profile || !selectedSpace) return

    const { error } = await supabase.from('space_messages').insert({
      space_id: selectedSpace.id,
      sender_id: null,
      sender_code: null,
      kind: 'system',
      text: '欢迎欢迎👏',
    })

    if (error) {
      setMessage(`发送失败：${error.message}`)
      return
    }

    await loadMessages(selectedSpace.id)
  }

  async function handleLikeSpace() {
    if (!user || !selectedSpace) return

    const alreadyLiked = (likesBySpace.get(selectedSpace.id) ?? []).some((item) => item.user_id === user.id)
    if (alreadyLiked) return

    const { error } = await supabase.from('space_likes').insert({
      space_id: selectedSpace.id,
      user_id: user.id,
    })

    if (error) {
      setMessage(`记录喜欢失败：${error.message}`)
      return
    }

    await loadSpaceLikes()
  }

  async function postComment() {
    if (!user || !profile || !selectedSpace) return
    const text = commentDraft.trim()
    if (!text) return

    const { error } = await supabase.from('space_comments').insert({
      space_id: selectedSpace.id,
      author_id: user.id,
      author_code: profile.planet_code,
      text,
      image_data: null,
      image_mime_type: null,
    })

    if (error) {
      setMessage(`留言失败：${error.message}`)
      return
    }

    setCommentDraft('')
    await loadSpaceComments()
  }

  async function deleteComment(commentId: string) {
    const { error } = await supabase.from('space_comments').delete().eq('id', commentId)
    if (error) {
      setMessage(`删除留言失败：${error.message}`)
      return
    }
    await loadSpaceComments()
  }

  async function saveTagline() {
    if (!user) return
    const nextTagline = taglineDraft.trim() || '今天也想安静地待一会儿'
    const { error } = await supabase
      .from('profiles')
      .update({ tagline: nextTagline })
      .eq('id', user.id)

    if (error) {
      setMessage(`保存个人说明失败：${error.message}`)
      return
    }

    setIsEditingTagline(false)
    await loadProfiles()
    const nextProfile = profileById[user.id]
    if (nextProfile) {
      setProfile({ ...nextProfile, tagline: nextTagline })
    }
  }

  async function signUp() {
    setMessage('')

    if (!authEmail || !authPassword || !inviteCode) {
      setMessage('请填写邮箱、密码和邀请码')
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    if (!data.user) {
      setMessage('注册成功，请登录后继续')
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
      email: authEmail,
      password: authPassword,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('登录成功')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setIsShowingProfile(false)
    setIsShowingSettings(false)
    setIsShowingDirectList(false)
    setSelectedSpaceId(null)
  }

  async function openDirectConversation(peerId: string) {
    setSelectedProfileId(null)
    setIsShowingDirectList(false)
    setSelectedDirectPeerId(peerId)
    await markDirectMessagesRead(peerId)
  }

  async function markDirectMessagesRead(peerId: string) {
    if (!user) return

    const unreadRows = directMessages.filter(
      (item) => item.sender_id === peerId && item.receiver_id === user.id && !item.is_read,
    )

    if (!unreadRows.length) return

    const unreadIDs = unreadRows.map((item) => item.id)
    const { error } = await supabase
      .from('direct_messages')
      .update({ is_read: true })
      .in('id', unreadIDs)

    if (error) {
      setMessage(`更新私聊未读失败：${error.message}`)
      return
    }

    await loadDirectMessages()
  }

  async function sendDirectText() {
    if (!user || !profile || !selectedDirectConversation) return

    const text = directDraft.trim()
    if (!text) return

    setSending(true)
    const { error } = await supabase.from('direct_messages').insert({
      sender_id: user.id,
      receiver_id: selectedDirectConversation.peerId,
      sender_code: profile.planet_code,
      receiver_code: selectedDirectConversation.peer?.planet_code ?? selectedDirectConversation.peerId,
      text,
      image_data: null,
      image_mime_type: null,
      audio_data: null,
      audio_mime_type: null,
      audio_duration_text: null,
      is_read: false,
    })
    setSending(false)

    if (error) {
      setMessage(`发送私聊失败：${error.message}`)
      return
    }

    setDirectDraft('')
    await loadDirectMessages()
  }

  const currentMembers = selectedSpace ? activeMembersBySpace.get(selectedSpace.id) ?? [] : []
  const currentLikes = selectedSpace ? likesBySpace.get(selectedSpace.id) ?? [] : []
  const currentVisits = selectedSpace ? visitsBySpace.get(selectedSpace.id) ?? [] : []
  const currentComments = selectedSpace ? commentsBySpace.get(selectedSpace.id) ?? [] : []
  const likedByMe = !!selectedSpace && !!user && currentLikes.some((item) => item.user_id === user.id)

  if (!user) {
    return (
      <div className="app-shell auth-shell">
        <div className="ambient-grid" />
        <section className="auth-card">
          <p className="eyebrow">0305</p>
          <h1>进入我们的时空</h1>
          <p className="auth-copy">用你自己的小行星代码，在这里安静地连上线。</p>

          <input className="field" placeholder="邮箱" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
          <input className="field" placeholder="密码" type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} />
          <input className="field" placeholder="邀请码" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />

          <div className="auth-actions">
            <button className="primary-button" onClick={signUp}>注册</button>
            <button className="secondary-button" onClick={signIn}>登录</button>
          </div>

          {message ? <p className="feedback-text">{message}</p> : null}
        </section>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="ambient-grid" />

      {selectedSpace ? (
        <section className="room-screen">
          <header className="room-header">
            <div className="room-title-row">
              <h1>{selectedSpace.title}</h1>
              <div className="room-actions">
                <button className="icon-button" onClick={() => setSelectedSpaceId(null)}>↘</button>
                <button className="icon-button" onClick={() => setIsShowingDetail(true)}>•••</button>
              </div>
            </div>

            <div className="member-strip">
              <div className="member-badges">
                {currentMembers.length > 0 ? currentMembers.slice(0, 8).map((member) => (
                  <button
                    key={member.id}
                    className="member-badge"
                    onClick={() => setSelectedProfileId(member.id)}
                  >
                    {member.planet_code.slice(0, 2).toUpperCase()}
                  </button>
                )) : (
                  <div className="member-badge ghost">··</div>
                )}
              </div>

              <div className="count-pill">此刻{currentMembers.length}人</div>
            </div>
          </header>

          <main className="message-stream">
            {roomOpenedAt ? <div className="center-time">{formatTime(roomOpenedAt)}</div> : null}

            {visibleMessages.map((item) => (
              item.kind === 'system' ? (
                <div key={item.id} className="stream-event">
                  <p>{item.text}</p>
                  <span>{formatTime(item.created_at)}</span>
                </div>
              ) : (
                <article key={item.id} className="stream-message">
                  {item.sender_code ? (
                    <button
                      className="sender-chip"
                      onClick={() => {
                        const owner = profiles.find((entry) => entry.planet_code === item.sender_code)
                        if (owner) setSelectedProfileId(owner.id)
                      }}
                    >
                      {item.sender_code}
                    </button>
                  ) : null}
                  {item.text ? <div className="message-bubble">{item.text}</div> : null}
                </article>
              )
            ))}

            {!visibleMessages.length ? <p className="empty-state">你进入之后，这里还没有新的内容。</p> : null}
            {message ? <p className="feedback-text room-feedback">{message}</p> : null}
          </main>

          <footer className="room-input">
            <button className="emoji-control" onClick={sendWarmEvent}>☺</button>

            {isTextMode ? (
              <input
                className="message-field"
                placeholder="一起说会儿话吧..."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void sendTextMessage()
                }}
              />
            ) : (
              <button className="voice-placeholder">按住说话</button>
            )}

            <button className="mode-toggle" onClick={() => setIsTextMode((value) => !value)}>
              {isTextMode ? '⌨' : '字'}
            </button>

            <button className="mode-toggle" disabled title="图片消息将继续迁移">图</button>

            {isTextMode ? (
              <button className="send-button" disabled={sending} onClick={() => void sendTextMessage()}>发</button>
            ) : null}
          </footer>
        </section>
      ) : (
        <section className="home-screen">
          <header className="home-header">
            <button className="icon-button left-icon" onClick={() => setIsShowingProfile(true)}>◌</button>
            <div className="header-actions">
              <button className="icon-button" onClick={() => setIsShowingSearch(true)}>⌕</button>
              <button className="icon-button badge-button" onClick={() => setIsShowingDirectList(true)}>
                私
                {unreadDirectCount > 0 ? <span className="header-badge" /> : null}
              </button>
              <button className="icon-button" onClick={() => setIsShowingCreateSpace(true)}>＋</button>
            </div>
          </header>

          <main className="space-grid">
            {spaces.map((space) => {
              const liveMembers = activeMembersBySpace.get(space.id) ?? []
              const tileTitle = space.theme_kind === '歌曲'
                ? `${space.artist_name} 「${space.song_title}」`
                : space.title

              return (
                <button key={space.id} className="space-tile" onClick={() => void openSpace(space)}>
                  <div className="tile-title">{tileTitle}</div>
                  <div className="tile-sub">此刻{liveMembers.length}人</div>
                </button>
              )
            })}

            <button className="space-tile create-tile" onClick={() => setIsShowingCreateSpace(true)}>＋</button>
          </main>

          {message ? <p className="feedback-text home-feedback">{message}</p> : null}
        </section>
      )}

      {isShowingCreateSpace ? (
        <ModalShell title="创建时空" onClose={() => setIsShowingCreateSpace(false)}>
          <div className="modal-form">
            <input className="field" placeholder="时空标题" value={createSpaceForm.title} onChange={(event) => setCreateSpaceForm((value) => ({ ...value, title: event.target.value }))} />
            <select className="field" value={createSpaceForm.theme_kind} onChange={(event) => setCreateSpaceForm((value) => ({ ...value, theme_kind: event.target.value }))}>
              {['任意主题', '闲聊', '语音室', '歌曲', '电影观后感', '心情', '一起做', '学习', '深夜'].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <input className="field" placeholder="此刻主题" value={createSpaceForm.topic} onChange={(event) => setCreateSpaceForm((value) => ({ ...value, topic: event.target.value }))} />
            <input className="field" placeholder="情绪" value={createSpaceForm.mood} onChange={(event) => setCreateSpaceForm((value) => ({ ...value, mood: event.target.value }))} />

            {createSpaceForm.theme_kind === '歌曲' ? (
              <>
                <input className="field" placeholder="歌手" value={createSpaceForm.artist_name} onChange={(event) => setCreateSpaceForm((value) => ({ ...value, artist_name: event.target.value }))} />
                <input className="field" placeholder="歌名" value={createSpaceForm.song_title} onChange={(event) => setCreateSpaceForm((value) => ({ ...value, song_title: event.target.value }))} />
                <textarea className="field field-area" placeholder="歌词" value={createSpaceForm.lyric_line} onChange={(event) => setCreateSpaceForm((value) => ({ ...value, lyric_line: event.target.value }))} />
                <textarea className="field field-area" placeholder="歌词翻译" value={createSpaceForm.lyric_translation} onChange={(event) => setCreateSpaceForm((value) => ({ ...value, lyric_translation: event.target.value }))} />
              </>
            ) : null}

            <button className="primary-button" disabled={isBusy} onClick={() => void handleCreateSpace()}>
              {isBusy ? '创建中...' : '创建'}
            </button>
          </div>
        </ModalShell>
      ) : null}

      {isShowingSearch ? (
        <ModalShell title="搜索时空" onClose={() => setIsShowingSearch(false)}>
          <div className="modal-form">
            <input className="field" placeholder="搜索时空名" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
            <div className="list-stack">
              {searchableSpaces.map((space) => (
                <button
                  key={space.id}
                  className="list-row"
                  onClick={() => {
                    setIsShowingSearch(false)
                    void openSpace(space)
                  }}
                >
                  <div className="list-row-main">
                    <span>{space.title}</span>
                    <small>{profileById[space.owner_id]?.planet_code ?? '未知'} · 此刻{(activeMembersBySpace.get(space.id) ?? []).length}人</small>
                  </div>
                  <span>↗</span>
                </button>
              ))}
            </div>
          </div>
        </ModalShell>
      ) : null}

      {isShowingProfile && profile ? (
        <ModalShell title="我的主页" onClose={() => setIsShowingProfile(false)}>
          <div className="profile-sheet">
            <div className="profile-position">{profile.position_description}</div>
            <div className="profile-days">来到「0305」第{daysSince(profile.created_at)}天</div>

            <div className="section-head">
              <h3>关于我</h3>
              {!isEditingTagline ? (
                <button className="text-button" onClick={() => setIsEditingTagline(true)}>编辑</button>
              ) : null}
            </div>

            {isEditingTagline ? (
              <div className="modal-form">
                <textarea className="field field-area" value={taglineDraft} onChange={(event) => setTaglineDraft(event.target.value)} />
                <div className="inline-actions">
                  <button className="secondary-button" onClick={() => {
                    setTaglineDraft(profile.tagline)
                    setIsEditingTagline(false)
                  }}>取消</button>
                  <button className="primary-button" onClick={() => void saveTagline()}>保存</button>
                </div>
              </div>
            ) : (
              <button className="tagline-panel" onClick={() => setIsEditingTagline(true)}>
                {profile.tagline}
              </button>
            )}

            <div className="section-head">
              <h3>在各个时空的留言</h3>
            </div>

            <div className="list-stack">
              {myCommentEntries.map((entry) => (
                <article key={entry.id} className="comment-card">
                  <div className="comment-meta">
                    <span>在 {entry.spaceTitle} 留言</span>
                    <small>{formatMonthDay(entry.created_at)}</small>
                  </div>
                  <p>{entry.text || '图片留言'}</p>
                  <button className="text-button danger-text" onClick={() => void deleteComment(entry.id)}>删除</button>
                </article>
              ))}
              {!myCommentEntries.length ? <p className="empty-state">你还没有留下留言。</p> : null}
            </div>

            <button className="secondary-button" onClick={() => setIsShowingSettings(true)}>设置</button>
          </div>
        </ModalShell>
      ) : null}

      {isShowingSettings ? (
        <ModalShell title="设置" onClose={() => setIsShowingSettings(false)}>
          <div className="modal-form">
            <button className="secondary-button danger-soft" onClick={() => void signOut()}>退出账号</button>
          </div>
        </ModalShell>
      ) : null}

      {isShowingDirectList ? (
        <ModalShell title="最近消息" onClose={() => setIsShowingDirectList(false)}>
          <div className="list-stack">
            {directConversations.map((conversation) => (
              <button
                key={conversation.peerId}
                className="list-row"
                onClick={() => void openDirectConversation(conversation.peerId)}
              >
                <div className="list-row-main">
                  <span>{conversation.peer?.planet_code ?? '未知星球'}</span>
                  <small>{conversation.lastMessage.text || '图片/语音消息'}</small>
                </div>
                <div className="conversation-meta">
                  {conversation.unreadCount > 0 ? <span className="unread-dot" /> : null}
                  <small>{formatMonthDay(conversation.lastMessage.created_at)}</small>
                </div>
              </button>
            ))}
            {!directConversations.length ? <p className="empty-state">暂时还没有私聊记录。</p> : null}
          </div>
        </ModalShell>
      ) : null}

      {selectedSpace && isShowingDetail ? (
        <ModalShell title={selectedSpace.title} onClose={() => setIsShowingDetail(false)}>
          <div className="detail-sheet">
            <button className="owner-row" onClick={() => setSelectedProfileId(selectedSpace.owner_id)}>
              <div className="owner-avatar">{(profileById[selectedSpace.owner_id]?.planet_code ?? '??').slice(0, 2).toUpperCase()}</div>
              <div className="owner-copy">
                <div className="owner-name">
                  {profileById[selectedSpace.owner_id]?.planet_code ?? selectedSpace.artist_name}
                  {selectedSpace.owner_id === user.id ? <span className="owner-badge">时空主人</span> : null}
                </div>
                <small>创建于：{formatDate(selectedSpace.created_at)}</small>
              </div>
            </button>

            <div className="topic-block">
              <div className="topic-rule" />
              <p>TA说： {selectedSpace.topic || selectedSpace.lyric_line || selectedSpace.title}</p>
            </div>

            <div className="list-stack">
              <button className="list-row" onClick={() => setIsShowingVisits(true)}>
                <div className="list-row-main">
                  <span>累计来过</span>
                  <small>{currentVisits.length}</small>
                </div>
                <span>›</span>
              </button>

              <button className="list-row" onClick={() => void handleLikeSpace()}>
                <div className="list-row-main">
                  <span>{likedByMe ? '喜欢过这个时空' : '喜欢这个时空'}</span>
                  <small>{currentLikes.length}</small>
                </div>
                <span>{likedByMe ? '♥' : '♡'}</span>
              </button>

              <button className="list-row" onClick={() => setIsShowingComments(true)}>
                <div className="list-row-main">
                  <span>留言板</span>
                  <small>{currentComments.length}</small>
                </div>
                <span>›</span>
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {selectedSpace && isShowingVisits ? (
        <ModalShell title="来过记录" onClose={() => setIsShowingVisits(false)}>
          <div className="list-stack">
            {currentVisits.map((visit) => {
              const visitProfile = profileById[visit.user_id]
              return (
                <button key={visit.id} className="list-row" onClick={() => setSelectedProfileId(visit.user_id)}>
                  <div className="list-row-main">
                    <span>{visitProfile?.planet_code ?? '未知星球'}</span>
                    <small>{formatMonthDay(visit.created_at)}</small>
                  </div>
                  <span>›</span>
                </button>
              )
            })}
            {!currentVisits.length ? <p className="empty-state">还没有来过记录。</p> : null}
          </div>
        </ModalShell>
      ) : null}

      {selectedSpace && isShowingComments ? (
        <ModalShell title="留言板" onClose={() => setIsShowingComments(false)}>
          <div className="modal-form">
            <textarea className="field field-area" placeholder="写一句想留在这里的话" value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} />
            <button className="primary-button" onClick={() => void postComment()}>发送留言</button>

            <div className="list-stack">
              {currentComments.map((comment) => (
                <article key={comment.id} className="comment-card">
                  <div className="comment-meta">
                    <button
                      className="text-button"
                      onClick={() => setSelectedProfileId(comment.author_id)}
                    >
                      {comment.author_code}
                    </button>
                    <small>{formatMonthDay(comment.created_at)}</small>
                  </div>
                  <p>{comment.text || '图片留言'}</p>
                  {comment.author_id === user.id ? (
                    <button className="text-button danger-text" onClick={() => void deleteComment(comment.id)}>删除</button>
                  ) : null}
                </article>
              ))}
              {!currentComments.length ? <p className="empty-state">还没有留言。</p> : null}
            </div>
          </div>
        </ModalShell>
      ) : null}

      {selectedProfile ? (
        <ModalShell title={selectedProfile.planet_code} onClose={() => setSelectedProfileId(null)}>
          <div className="profile-sheet">
            <div className="owner-avatar large">{selectedProfile.planet_code.slice(0, 2).toUpperCase()}</div>
            <div className="profile-meta">
              <p>注册时间：{formatFullDate(selectedProfile.created_at)}</p>
              <p>{selectedProfile.position_description}</p>
              <p>{selectedProfile.tagline}</p>
            </div>
            {selectedProfile.id !== user.id ? (
              <button className="primary-button" onClick={() => void openDirectConversation(selectedProfile.id)}>
                私聊
              </button>
            ) : null}
          </div>
        </ModalShell>
      ) : null}

      {selectedDirectConversation ? (
        <ModalShell
          title={selectedDirectConversation.peer?.planet_code ?? '私聊'}
          onClose={() => setSelectedDirectPeerId(null)}
        >
          <div className="direct-sheet">
            <div className="list-stack direct-thread">
              {selectedDirectConversation.rows.map((item) => {
                const isMine = item.sender_id === user.id
                return (
                  <article
                    key={item.id}
                    className={`direct-message-row ${isMine ? 'mine' : 'theirs'}`}
                  >
                    <button
                      className="sender-chip"
                      onClick={() => setSelectedProfileId(isMine ? user.id : selectedDirectConversation.peerId)}
                    >
                      {isMine ? profile?.planet_code : (selectedDirectConversation.peer?.planet_code ?? '未知')}
                    </button>
                    <div className={`direct-bubble ${isMine ? 'mine' : 'theirs'}`}>
                      {item.text || '图片/语音消息'}
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="room-input modal-room-input">
              <input
                className="message-field"
                placeholder="说点什么"
                value={directDraft}
                onChange={(event) => setDirectDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void sendDirectText()
                }}
              />
              <button className="send-button" disabled={sending} onClick={() => void sendDirectText()}>
                发
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  )
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-card" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  return `${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatTime(value: string) {
  const date = new Date(value)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatMonthDay(value: string) {
  const date = new Date(value)
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatFullDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function daysSince(value: string) {
  const start = new Date(value).getTime()
  const diff = Date.now() - start
  return Math.max(1, Math.floor(diff / 86_400_000) + 1)
}

export default App
