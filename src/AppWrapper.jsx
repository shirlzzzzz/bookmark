import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import App from './App'

export default function AppWrapper() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showBanner, setShowBanner] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [migrating, setMigrating] = useState(false)

  const openAuth = useCallback((mode = 'signin') => {
    setAuthMode(mode)
    setShowAuth(true)
  }, [])

  const closeAuth = useCallback(() => {
    setShowAuth(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)

      if (!session?.user) {
        checkForLocalData()
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const newUser = session?.user ?? null
      const previousUser = user
      setUser(newUser)

      if (newUser && !previousUser) {
        // User just signed in — check if migration is needed
        setShowAuth(false)
        setShowBanner(false)
        await migrateLocalDataToSupabase(newUser)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkForLocalData = () => {
    try {
      const children = JSON.parse(localStorage.getItem('mybookmark_children') || '[]')
      const logs = JSON.parse(localStorage.getItem('mybookmark_logs') || '[]')
      const migrated = localStorage.getItem('migratedToSupabase')

      if ((children.length > 0 || logs.length > 0) && !migrated) {
        setShowBanner(true)
      }
    } catch (error) {
      console.error('Error checking localStorage:', error)
    }
  }

  const migrateLocalDataToSupabase = async (targetUser) => {
    const migrated = localStorage.getItem('migratedToSupabase')
    if (migrated) return

    try {
      const children = JSON.parse(localStorage.getItem('mybookmark_children') || '[]')
      const logs = JSON.parse(localStorage.getItem('mybookmark_logs') || '[]')
      const familyProfile = JSON.parse(localStorage.getItem('mybookmark_family') || 'null')
      const goals = JSON.parse(localStorage.getItem('mybookmark_goals') || '[]')
      const challenges = JSON.parse(localStorage.getItem('mybookmark_challenges') || '[]')
      const classGroups = JSON.parse(localStorage.getItem('mybookmark_classgroups') || '[]')

      if (children.length === 0 && logs.length === 0) {
        localStorage.setItem('migratedToSupabase', 'true')
        return
      }

      setMigrating(true)

      // 1. Migrate children
      const childIdMap = {}

      if (children.length > 0) {
        const childrenToInsert = children.map(child => ({
          user_id: targetUser.id,
          name: child.name,
          grade: child.grade || null,
          child_type: child.childType || 'student',
          goal_minutes: child.goal?.minutesPerDay || 20,
          goal_days: child.goal?.daysPerWeek || 5,
          milestones: child.milestones || []
        }))

        const { data: insertedChildren, error: childrenError } = await supabase
          .from('children')
          .insert(childrenToInsert)
          .select()

        if (childrenError) throw childrenError

        children.forEach((localChild, index) => {
          if (insertedChildren[index]) {
            childIdMap[localChild.id] = insertedChildren[index].id
          }
        })
      }

      // 2. Migrate books (deduplicated)
      const bookMap = {}

      if (logs.length > 0) {
        const uniqueBooks = [...new Map(
          logs.map(log => [`${log.bookTitle}|${log.author || ''}`, log])
        ).values()]

        for (const log of uniqueBooks) {
          const bookData = {
            title: log.bookTitle,
            author: log.author || null,
            cover_url: log.coverUrl || null
          }

          const { data: existingBooks } = await supabase
            .from('books')
            .select('id')
            .eq('title', bookData.title)
            .limit(1)

          if (existingBooks && existingBooks.length > 0) {
            bookMap[log.bookTitle] = existingBooks[0].id
          } else {
            const { data: newBook, error: bookError } = await supabase
              .from('books')
              .insert(bookData)
              .select()
              .single()

            if (bookError) {
              console.warn('Book insert error:', bookError, bookData)
              continue
            }
            bookMap[log.bookTitle] = newBook.id
          }
        }

        // 3. Migrate reading logs
        const logsToInsert = logs
          .filter(log => childIdMap[log.childId] && bookMap[log.bookTitle])
          .map(log => ({
            user_id: targetUser.id,
            child_id: childIdMap[log.childId],
            book_id: bookMap[log.bookTitle],
            book_title: log.bookTitle,
            date: log.date,
            minutes: log.minutes,
            notes: log.notes || null,
            loved: log.loved || false,
            reading_type: log.readingType || 'independent'
          }))

        if (logsToInsert.length > 0) {
          // Insert in batches of 50
          for (let i = 0; i < logsToInsert.length; i += 50) {
            const batch = logsToInsert.slice(i, i + 50)
            const { error: logsError } = await supabase
              .from('reading_logs')
              .insert(batch)

            if (logsError) {
              console.warn('Logs batch insert error:', logsError)
            }
          }
        }
      }

      // 4. Migrate family profile
      if (familyProfile) {
        await supabase
          .from('family_profiles')
          .upsert({
            user_id: targetUser.id,
            family_name: familyProfile.familyName || null,
            baby_emoji: familyProfile.babyEmoji || '👶',
            data: familyProfile
          })
      }

      localStorage.setItem('migratedToSupabase', 'true')
      setMigrating(false)
      setShowBanner(false)

    } catch (error) {
      console.error('Migration error:', error)
      setMigrating(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen" style={{ fontFamily: 'system-ui, sans-serif' }}>
        <div className="text-center">
          <div className="text-4xl mb-4">📚</div>
          <p className="text-gray-500">Loading My Bookmark...</p>
        </div>
      </div>
    )
  }

  if (migrating) {
    return (
      <div className="flex justify-center items-center h-screen" style={{ fontFamily: 'system-ui, sans-serif' }}>
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📚</div>
          <p className="text-purple-600 font-medium">Syncing your reading data to the cloud...</p>
          <p className="text-gray-400 text-sm mt-2">This only happens once</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {showBanner && !user && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-600 to-purple-800 text-white px-4 py-3 shadow-lg">
          <div className="max-w-2xl mx-auto flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span>📚</span>
              <span>Sign in to save your reading data across devices!</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => openAuth('signup')}
                className="px-4 py-1.5 bg-white text-purple-700 rounded-lg text-sm font-medium hover:bg-gray-100 transition-all"
              >
                Sign Up Free
              </button>
              <button
                onClick={() => setShowBanner(false)}
                className="px-4 py-1.5 bg-white bg-opacity-20 text-white rounded-lg text-sm hover:bg-opacity-30 transition-all border border-white border-opacity-40"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: showBanner && !user ? '56px' : '0' }}>
        <App
          user={user}
          onSignOut={handleSignOut}
          onOpenAuth={openAuth}
        />
      </div>

      {showAuth && (
        <Auth startMode={authMode} onClose={closeAuth} />
      )}
    </div>
  )
}
