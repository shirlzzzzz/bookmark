import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "ourbookmark-admin";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(null); // book id currently uploading
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text }
  const [filter, setFilter] = useState("missing"); // "missing" | "all"
  const [search, setSearch] = useState("");

  function handleLogin() {
    if (passwordInput === ADMIN_PASSWORD) {
      setAuthed(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  }

  useEffect(() => {
    if (!authed) return;
    loadBooks();
  }, [authed, filter]);

  async function loadBooks() {
    setLoading(true);
    let query = supabase
      .from("books")
      .select("id, title, author, cover_url, isbn_13, isbn_10, google_books_id")
      .order("title", { ascending: true });

    if (filter === "missing") {
      query = query.or("cover_url.is.null,cover_url.eq.");
    }

    const { data, error } = await query;
    if (error) console.warn("Error loading books:", error);
    setBooks(data || []);
    setLoading(false);
  }

  async function handleUpload(book, file) {
    if (!file) return;
    setUploading(book.id);
    setMessage(null);

    try {
      // Upload to Supabase Storage
      const ext = file.name.split(".").pop();
      const path = `covers/${book.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("book-covers")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("book-covers")
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      // Save URL back to books table
      const { error: updateError } = await supabase
        .from("books")
        .update({ cover_url: publicUrl })
        .eq("id", book.id);

      if (updateError) throw updateError;

      // Update local state
      setBooks(prev =>
        prev.map(b =>
          b.id === book.id ? { ...b, cover_url: publicUrl } : b
        )
      );

      setMessage({ type: "success", text: `✓ Cover saved for "${book.title}"` });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: `Failed to upload: ${err.message}` });
    }

    setUploading(null);
  }

  async function handleUrlSave(book, url) {
    if (!url.trim()) return;
    setUploading(book.id);
    setMessage(null);
    try {
      const { error } = await supabase
        .from("books")
        .update({ cover_url: url.trim() })
        .eq("id", book.id);
      if (error) throw error;
      setBooks(prev =>
        prev.map(b => b.id === book.id ? { ...b, cover_url: url.trim() } : b)
      );
      setMessage({ type: "success", text: `✓ Cover URL saved for "${book.title}"` });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: "error", text: `Failed to save URL: ${err.message}` });
    }
    setUploading(null);
  }

  async function clearCover(book) {
    if (!confirm(`Clear cover for "${book.title}"?`)) return;
    await supabase.from("books").update({ cover_url: null }).eq("id", book.id);
    setBooks(prev => prev.map(b => b.id === book.id ? { ...b, cover_url: null } : b));
  }

  const filtered = books.filter(b =>
    b.title?.toLowerCase().includes(search.toLowerCase()) ||
    b.author?.toLowerCase().includes(search.toLowerCase())
  );

  // ─── PASSWORD GATE ───
  if (!authed) {
    return (
      <div style={styles.page}>
        <div style={styles.loginCard}>
          <div style={styles.loginIcon}>🔖</div>
          <h1 style={styles.loginTitle}>OurBookmark Admin</h1>
          <p style={styles.loginSubtitle}>Enter your admin password to continue</p>
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="Password"
            style={{ ...styles.input, borderColor: passwordError ? "#e57373" : "rgba(0,0,0,0.12)" }}
            autoFocus
          />
          {passwordError && (
            <p style={styles.errorText}>Incorrect password</p>
          )}
          <button style={styles.btnPrimary} onClick={handleLogin}>
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // ─── ADMIN DASHBOARD ───
  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <div style={styles.navLogo}>🔖 OurBookmark Admin</div>
        <div style={styles.navStats}>
          {filter === "missing"
            ? `${filtered.length} books missing covers`
            : `${filtered.length} total books`}
        </div>
        <button style={styles.navSignOut} onClick={() => setAuthed(false)}>
          Sign out
        </button>
      </nav>

      <div style={styles.container}>

        {/* Message toast */}
        {message && (
          <div style={{
            ...styles.toast,
            background: message.type === "success" ? "#6B8F71" : "#e57373"
          }}>
            {message.text}
          </div>
        )}

        {/* Controls */}
        <div style={styles.controls}>
          <div style={styles.filterTabs}>
            <button
              style={{ ...styles.filterTab, ...(filter === "missing" ? styles.filterTabActive : {}) }}
              onClick={() => setFilter("missing")}
            >
              Missing Covers
            </button>
            <button
              style={{ ...styles.filterTab, ...(filter === "all" ? styles.filterTabActive : {}) }}
              onClick={() => setFilter("all")}
            >
              All Books
            </button>
          </div>
          <input
            type="text"
            placeholder="Search books..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.searchInput}
          />
          <button style={styles.btnRefresh} onClick={loadBooks}>↻ Refresh</button>
        </div>

        {/* Book list */}
        {loading ? (
          <div style={styles.empty}>Loading books…</div>
        ) : filtered.length === 0 ? (
          <div style={styles.empty}>
            {filter === "missing" ? "🎉 All books have covers!" : "No books found."}
          </div>
        ) : (
          <div style={styles.bookList}>
            {filtered.map(book => (
              <BookRow
                key={book.id}
                book={book}
                uploading={uploading === book.id}
                onUpload={handleUpload}
                onUrlSave={handleUrlSave}
                onClear={clearCover}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BookRow({ book, uploading, onUpload, onUrlSave, onClear }) {
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  return (
    <div style={styles.bookRow}>
      {/* Cover preview */}
      <div style={styles.coverPreview}>
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt=""
            style={styles.coverImg}
            onError={e => { e.target.style.display = "none"; }}
          />
        ) : (
          <div style={styles.coverMissing}>📚</div>
        )}
      </div>

      {/* Book info */}
      <div style={styles.bookInfo}>
        <div style={styles.bookTitle}>{book.title}</div>
        <div style={styles.bookAuthor}>{book.author || "Unknown author"}</div>
        {book.isbn_13 && <div style={styles.bookIsbn}>ISBN: {book.isbn_13}</div>}
        {book.cover_url && (
          <div style={styles.coverStatus}>✓ Has cover</div>
        )}
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        {/* File upload */}
        <label style={styles.btnUpload}>
          {uploading ? "Uploading…" : "📁 Upload"}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            disabled={uploading}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onUpload(book, file);
              e.target.value = "";
            }}
          />
        </label>

        {/* URL input toggle */}
        {!showUrlInput ? (
          <button
            style={styles.btnSecondary}
            onClick={() => setShowUrlInput(true)}
          >
            🔗 Paste URL
          </button>
        ) : (
          <div style={styles.urlRow}>
            <input
              type="text"
              placeholder="https://..."
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              style={styles.urlInput}
              autoFocus
            />
            <button
              style={styles.btnSave}
              onClick={() => { onUrlSave(book, urlInput); setShowUrlInput(false); setUrlInput(""); }}
            >
              Save
            </button>
            <button
              style={styles.btnCancel}
              onClick={() => { setShowUrlInput(false); setUrlInput(""); }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Clear cover */}
        {book.cover_url && (
          <button style={styles.btnClear} onClick={() => onClear(book)}>
            🗑 Clear
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#FAF7F2",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    color: "#1C1712",
  },
  // Login
  loginCard: {
    maxWidth: 400,
    margin: "0 auto",
    padding: "80px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  loginIcon: { fontSize: "2.5rem", marginBottom: 8 },
  loginTitle: { fontSize: "1.6rem", fontWeight: 600, margin: 0 },
  loginSubtitle: { color: "#8C7F72", fontSize: "0.9rem", margin: 0 },
  input: {
    width: "100%",
    padding: "12px 16px",
    border: "1.5px solid rgba(0,0,0,0.12)",
    borderRadius: 12,
    fontSize: "0.95rem",
    fontFamily: "inherit",
    outline: "none",
    background: "white",
    boxSizing: "border-box",
  },
  errorText: { color: "#e57373", fontSize: "0.8rem", margin: 0 },
  btnPrimary: {
    width: "100%",
    padding: "12px",
    background: "#C4873A",
    color: "white",
    border: "none",
    borderRadius: 100,
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  // Nav
  nav: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "16px 32px",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    background: "#FDF9F4",
  },
  navLogo: { fontWeight: 700, fontSize: "1rem", color: "#C4873A", flex: 1 },
  navStats: { fontSize: "0.85rem", color: "#8C7F72" },
  navSignOut: {
    background: "none",
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 100,
    padding: "6px 14px",
    fontSize: "0.8rem",
    cursor: "pointer",
    fontFamily: "inherit",
    color: "#8C7F72",
  },
  // Container
  container: { maxWidth: 900, margin: "0 auto", padding: "32px 24px" },
  toast: {
    padding: "12px 20px",
    borderRadius: 12,
    color: "white",
    fontSize: "0.9rem",
    marginBottom: 20,
    fontWeight: 500,
  },
  // Controls
  controls: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 24,
    flexWrap: "wrap",
  },
  filterTabs: { display: "flex", gap: 8 },
  filterTab: {
    padding: "8px 16px",
    borderRadius: 100,
    border: "1.5px solid rgba(0,0,0,0.12)",
    background: "transparent",
    fontSize: "0.85rem",
    cursor: "pointer",
    fontFamily: "inherit",
    color: "#8C7F72",
  },
  filterTabActive: {
    background: "#C4873A",
    borderColor: "#C4873A",
    color: "white",
  },
  searchInput: {
    flex: 1,
    minWidth: 200,
    padding: "8px 14px",
    border: "1.5px solid rgba(0,0,0,0.12)",
    borderRadius: 100,
    fontSize: "0.85rem",
    fontFamily: "inherit",
    outline: "none",
    background: "white",
  },
  btnRefresh: {
    padding: "8px 16px",
    background: "none",
    border: "1.5px solid rgba(0,0,0,0.12)",
    borderRadius: 100,
    fontSize: "0.85rem",
    cursor: "pointer",
    fontFamily: "inherit",
    color: "#8C7F72",
  },
  // Book list
  bookList: { display: "flex", flexDirection: "column", gap: 12 },
  bookRow: {
    display: "flex",
    gap: 16,
    alignItems: "center",
    background: "white",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 14,
    padding: "14px 16px",
  },
  coverPreview: {
    width: 48,
    height: 64,
    flexShrink: 0,
    borderRadius: 6,
    overflow: "hidden",
    background: "rgba(0,0,0,0.05)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  coverImg: { width: "100%", height: "100%", objectFit: "cover" },
  coverMissing: { fontSize: "1.4rem" },
  bookInfo: { flex: 1, minWidth: 0 },
  bookTitle: { fontWeight: 600, fontSize: "0.9rem", marginBottom: 2 },
  bookAuthor: { fontSize: "0.8rem", color: "#8C7F72" },
  bookIsbn: { fontSize: "0.72rem", color: "#aaa", marginTop: 2 },
  coverStatus: { fontSize: "0.72rem", color: "#6B8F71", marginTop: 2, fontWeight: 500 },
  // Actions
  actions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  btnUpload: {
    padding: "7px 14px",
    background: "#C4873A",
    color: "white",
    border: "none",
    borderRadius: 100,
    fontSize: "0.78rem",
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  btnSecondary: {
    padding: "7px 14px",
    background: "transparent",
    color: "#C4873A",
    border: "1px solid #C4873A",
    borderRadius: 100,
    fontSize: "0.78rem",
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  btnClear: {
    padding: "7px 14px",
    background: "transparent",
    color: "#e57373",
    border: "1px solid #e57373",
    borderRadius: 100,
    fontSize: "0.78rem",
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  urlRow: { display: "flex", gap: 6, alignItems: "center" },
  urlInput: {
    padding: "6px 10px",
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 8,
    fontSize: "0.78rem",
    fontFamily: "inherit",
    outline: "none",
    width: 220,
  },
  btnSave: {
    padding: "6px 12px",
    background: "#6B8F71",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: "0.78rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnCancel: {
    padding: "6px 10px",
    background: "none",
    border: "none",
    color: "#aaa",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  empty: {
    textAlign: "center",
    padding: "60px 0",
    color: "#8C7F72",
    fontSize: "0.95rem",
  },
};
