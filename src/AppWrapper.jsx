import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import App from './App'

export default function AppWrapper() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
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

      if (children.length === 0 && logs.length === 0) {
        localStorage.setItem('migratedToSupabase', 'true')
        return
      }

      setMigrating(true)

      // Safety timeout — if migration takes more than 15s, skip it
      const timeout = setTimeout(() => {
        console.warn('Migration timed out, skipping')
        setMigrating(false)
      }, 15000)

      try {
        const childIdMap = {}

        if (children.length > 0) {
          const childrenToInsert = children.map(child => ({
            user_id: targetUser.id,
            name: child.name,
            grade: child.grade || null,
          }))

          const { data: insertedChildren, error: childrenError } = await supabase
            .from('children')
            .insert(childrenToInsert)
            .select()

          if (!childrenError && insertedChildren) {
            children.forEach((localChild, index) => {
              if (insertedChildren[index]) {
                childIdMap[localChild.id] = insertedChildren[index].id
              }
            })
          } else {
            console.warn('Children migration error:', childrenError)
          }
        }

        if (logs.length > 0) {
          // Migrate books
          const bookMap = {}
          const uniqueBooks = [...new Map(
            logs.map(log => [`${log.bookTitle}|${log.author || ''}`, log])
          ).values()]

          for (const log of uniqueBooks) {
            try {
              const { data: existingBooks } = await supabase
                .from('books')
                .select('id')
                .eq('title', log.bookTitle)
                .limit(1)

              if (existingBooks && existingBooks.length > 0) {
                bookMap[log.bookTitle] = existingBooks[0].id
              } else {
                const { data: newBook, error: bookError } = await supabase
                  .from('books')
                  .insert({
                    title: log.bookTitle,
                    author: log.author || null,
                    cover_url: log.coverUrl || null
                  })
                  .select()
                  .single()

                if (!bookError && newBook) {
                  bookMap[log.bookTitle] = newBook.id
                }
              }
            } catch (e) {
              console.warn('Book insert error:', e)
            }
          }

          // Migrate reading logs
          const logsToInsert = logs
            .filter(log => childIdMap[log.childId] && bookMap[log.bookTitle])
            .map(log => ({
              user_id: targetUser.id,
              child_id: childIdMap[log.childId],
              book_id: bookMap[log.bookTitle],
              date: log.date,
              minutes: log.minutes,
            }))

          if (logsToInsert.length > 0) {
            for (let i = 0; i < logsToInsert.length; i += 50) {
              const batch = logsToInsert.slice(i, i + 50)
              const { error: logsError } = await supabase
                .from('reading_logs')
                .insert(batch)
              if (logsError) console.warn('Logs batch error:', logsError)
            }
          }
        }
      } catch (innerError) {
        console.warn('Migration inner error:', innerError)
      }

      clearTimeout(timeout)
      localStorage.setItem('migratedToSupabase', 'true')
      setMigrating(false)
    } catch (error) {
      console.error('Migration error:', error)
      // Always recover — don't leave user stuck
      localStorage.setItem('migratedToSupabase', 'true')
      setMigrating(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('mybookmark_children')
    localStorage.removeItem('mybookmark_logs')
    localStorage.removeItem('mybookmark_challenges')
    localStorage.removeItem('mybookmark_goals')
    localStorage.removeItem('mybookmark_classgroups')
    localStorage.removeItem('mybookmark_family')
    localStorage.removeItem('migratedToSupabase')
    setUser(null)
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen" style={{ fontFamily: 'system-ui, sans-serif' }}>
        <div className="text-center">
          <div className="text-4xl mb-4">📚</div>
          <p className="text-gray-500">Loading OurBookmark...</p>
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
      
      <App
          user={user}
          onSignOut={handleSignOut}
          onOpenAuth={openAuth}
        />

      {showAuth && (
        <Auth startMode={authMode} onClose={closeAuth} />
      )}
    </div>
  )
}
