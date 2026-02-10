import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function Auth({ startMode = 'signin', onClose }) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [username, setUsername] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setIsSignUp(startMode === 'signup')
    setMessage('')
  }, [startMode])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
        },
      })

      if (error) setMessage('Error: ' + error.message)
      else {
        setMessage('Account created! You can now sign in.')
        setIsSignUp(false)
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) setMessage('Error: ' + error.message)
      else {
        setMessage('Login successful!')
        if (onClose) setTimeout(onClose, 800)
      }
    }

    setLoading(false)
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 pb-4 border-b">
          <h2 className="text-xl font-semibold text-gray-800">
            {isSignUp ? 'Create an account' : 'Sign in to My Bookmark'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          <form onSubmit={handleSubmit}>
            {isSignUp && (
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-3 text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            )}

            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-3 text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-3 text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Working...' : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>

            <p className="text-center mt-4 text-sm text-gray-600">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setMessage('')
                }}
                className="text-purple-600 hover:text-purple-800 font-medium"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </form>

          {message && (
            <p className={`mt-4 text-sm text-center ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
