import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import App from './App'

export default function AppWrapper() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showBanner, setShowBanner] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    // Check current auth session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
      
      // Check if we should show banner
      if (!session?.user) {
        checkForLocalData()
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      
      if (session?.user) {
        // User just logged in - migrate data
        migrateLocalDataToSupabase(session.user)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkForLocalData = () => {
    try {
      const children = JSON.parse(localStorage.getItem('mybookmark_children') || '[]')
      const logs = JSON.parse(localStorage.getItem('mybookmark_logs') || '[]')
      
      // Show banner if they have data
      if (children.length > 0 || logs.length > 0) {
        setShowBanner(true)
      }
    } catch (error) {
      console.error('Error checking localStorage:', error)
    }
  }

  const migrateLocalDataToSupabase = async (user) => {
    try {
      const children = JSON.parse(localStorage.getItem('mybookmark_children') || '[]')
      const logs = JSON.parse(localStorage.getItem('mybookmark_logs') || '[]')
      
      if (children.length === 0 && logs.length === 0) {
        return // Nothing to migrate
      }

      console.log('Migrating data to Supabase...')
      
      // 1. Migrate children
      const childrenToInsert = children.map(child => ({
           user_id: user.id,
           name: child.name,
           grade: child.childType || child.grade || null,
           avatar_url: child.avatar || null
      }))

      const { data: insertedChildren, error: childrenError } = await supabase
        .from('children')
        .insert(childrenToInsert)
        .select()

      if (childrenError) throw childrenError

      // 2. Create child ID mapping
      const childIdMap = {}
      children.forEach((localChild, index) => {
        childIdMap[localChild.id] = insertedChildren[index].id
      })

      // 3. Migrate books
      const uniqueBooks = [...new Map(
        logs.map(log => [log.bookTitle, log])
      ).values()]

      const booksToInsert = uniqueBooks.map(log => ({
        title: log.bookTitle,
        author: log.author || null,
        cover_url: log.coverUrl || null
      }))

      const { data: insertedBooks, error: booksError } = await supabase
        .from('books')
        .upsert(booksToInsert, { onConflict: 'title,author' })
        .select()

      if (booksError) throw booksError

      // 4. Create book mapping
      const bookMap = {}
      insertedBooks.forEach(book => {
        bookMap[book.title] = book.id
      })

      // 5. Migrate reading logs
      const logsToInsert = logs.map(log => ({
        child_id: childIdMap[log.childId],
        book_id: bookMap[log.bookTitle],
        date: log.date,
        minutes: log.minutes,
        notes: log.notes || null,
        loved: log.loved || false
      }))

      const { error: logsError } = await supabase
        .from('reading_logs')
        .insert(logsToInsert)

      if (logsError) throw logsError

      console.log('Migration complete!')
      
      // Mark as migrated
      localStorage.setItem('migratedToSupabase', 'true')
      setShowBanner(false)

    } catch (error) {
      console.error('Migration error:', error)
      alert('There was an error saving your data. Please try again.')
    }
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontFamily: 'system-ui, sans-serif'
      }}>
        Loading...
      </div>
    )
  }

  if (showAuth) {
    return (
      <div>
        <Auth />
        <button
          onClick={() => setShowAuth(false)}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '10px 20px',
            background: '#f0f0f0',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          ← Back to App
        </button>
      </div>
    )
  }

  return (
    <div>
      {showBanner && !user && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '16px',
          zIndex: 1000,
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>📚</span>
              <span>Save your reading history across all devices! Sign in to keep your data safe and access it anywhere.</span>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowAuth(true)}
                style={{
                  padding: '10px 20px',
                  background: 'white',
                  color: '#667eea',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Sign In to Save
              </button>
              <button
                onClick={() => setShowBanner(false)}
                style={{
                  padding: '10px 20px',
                  background: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  border: '1px solid white',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div style={{ marginTop: showBanner ? '80px' : '0' }}>
        <App />
      </div>
    </div>
  )
}
