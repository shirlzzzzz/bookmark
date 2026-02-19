import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function ReadingRoomSetup() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [shelfName, setShelfName] = useState("");
  const [shelfDesc, setShelfDesc] = useState("");
  const [affiliateAmazon, setAffiliateAmazon] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [activeShelf, setActiveShelf] = useState(null); // { id, name }
  const [bookQuery, setBookQuery] = useState("");
  const [bookResults, setBookResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState("title"); // "title" or "author"
  const [shelfBooksList, setShelfBooksList] = useState([]);

  // Load user & existing profile
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/");
        return;
      }
      setUser(session.user);

      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (p) {
        setProfile(p);
        setUsername(p.username || "");
        setDisplayName(p.display_name || "");
        setBio(p.bio || "");
        setAffiliateAmazon(p.affiliate_amazon || "");

        // Figure out which step to start on based on completeness
        if (!p.username) setStep(1);
        else if (!p.display_name || p.display_name === session.user.email) setStep(2);
        else setStep("checklist");
      } else {
        // Create a bare profile
        await supabase.from("profiles").upsert({
          id: session.user.id,
          username: "",
          display_name: session.user.email,
          room_is_public: false,
        });
        setStep(1);
      }
      setLoading(false);
    }
    init();
  }, [navigate]);

  // Check username availability (debounced)
  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    const timeout = setTimeout(async () => {
      setCheckingUsername(true);
      const clean = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
      setUsername(clean);
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", clean)
        .neq("id", user?.id || "")
        .single();
      setUsernameAvailable(!data);
      setCheckingUsername(false);
    }, 500);
    return () => clearTimeout(timeout);
  }, [username, user]);

  async function saveUsername() {
    if (!username || username.length < 3 || !usernameAvailable) return;
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("profiles")
      .update({ username })
      .eq("id", user.id);
    if (err) setError(err.message);
    else setStep(2);
    setSaving(false);
  }

  async function saveDisplayInfo() {
    if (!displayName.trim()) return;
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim(), bio: bio.trim() })
      .eq("id", user.id);
    if (err) setError(err.message);
    else setStep("checklist");
    setSaving(false);
  }

  async function createShelf() {
    if (!shelfName.trim()) return;
    setSaving(true);
    setError("");
    const { data: newShelf, error: err } = await supabase
      .from("shelves")
      .insert({
        user_id: user.id,
        name: shelfName.trim(),
        description: shelfDesc.trim(),
        is_visible: true,
        display_order: shelves.length,
      })
      .select()
      .single();
    if (err) setError(err.message);
    else {
      setActiveShelf({ id: newShelf.id, name: newShelf.name });
      setShelfName("");
      setShelfDesc("");
      setShelfBooksList([]);
      setStep("shelf-books");
    }
    setSaving(false);
  }

  async function searchBooks() {
    if (!bookQuery.trim()) return;
    setSearching(true);
    try {
      const apiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
      const prefix = searchMode === "author" ? "inauthor" : "intitle";
      const q = encodeURIComponent(`${prefix}:"${bookQuery.trim()}"`);
      const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=20&printType=books&langRestrict=en&key=${apiKey || ''}`;

      const res = await fetch(url);
      const data = await res.json();

      const JUNK = ["summary", "analysis", "guide", "workbook", "boxed set", "phenomenon", "biography", "study", "business", "leadership", "companion", "unofficial"];

      const items = (data.items || [])
        .filter((item) => {
          const info = item.volumeInfo || {};
          const title = (info.title || "").toLowerCase();
          const subtitle = (info.subtitle || "").toLowerCase();
          const categories = (info.categories || []).join(" ").toLowerCase();
          const isEnglish = info.language === 'en';
          const isJunk = JUNK.some(kw =>
            title.includes(kw) ||
            subtitle.includes(kw) ||
            categories.includes("business") ||
            categories.includes("study")
          );
          return isEnglish && !isJunk;
        })
        .map((item) => {
          const v = item.volumeInfo;

          // 1. Get best available ISBN
          const isbn13 = v.industryIdentifiers?.find(i => i.type === "ISBN_13")?.identifier;
          const isbn10 = v.industryIdentifiers?.find(i => i.type === "ISBN_10")?.identifier;
          const bestIsbn = isbn13 || isbn10;

          // 2. Try Google cover first
          let finalCover = v.imageLinks?.thumbnail?.replace("http:", "https:") || null;

          // 3. Fallback to Open Library if Google has no cover but we have an ISBN
          if (!finalCover && bestIsbn) {
            finalCover = `https://covers.openlibrary.org/b/isbn/${bestIsbn}-M.jpg?default=false`;
          }

          return {
            google_books_id: item.id,
            title: v.title,
            author: (v.authors || []).join(", "),
            cover_url: finalCover || null,
            isbn_13: isbn13 || null,
            isbn_10: isbn10 || null,
          };
        });

      setBookResults(items.slice(0, 8));
    } catch (e) {
      console.warn("Search error:", e);
      setBookResults([]);
    }
    setSearching(false);
  }

  async function addBookToShelf(book) {
    setError("");
    // Upsert into books table
    let bookId = null;
    const { data: existing } = await supabase
      .from("books")
      .select("id")
      .eq("title", book.title)
      .limit(1);

    if (existing && existing.length > 0) {
      bookId = existing[0].id;
    } else {
      const { data: newBook } = await supabase
        .from("books")
        .insert({
          title: book.title,
          author: book.author || null,
          cover_url: book.cover_url || null,
          isbn_13: book.isbn_13 || null,
          isbn_10: book.isbn_10 || null,
          google_books_id: book.google_books_id || null,
        })
        .select()
        .single();
      if (newBook) bookId = newBook.id;
    }

    if (!bookId) {
      setError("Failed to add book");
      return;
    }

    // Check if already on this shelf
    const { data: existingLink } = await supabase
      .from("shelf_books")
      .select("id")
      .eq("shelf_id", activeShelf.id)
      .eq("book_id", bookId)
      .limit(1);

    if (existingLink && existingLink.length > 0) {
      setError("This book is already on the shelf!");
      setTimeout(() => setError(""), 2000);
      return;
    }

    const { error: linkErr } = await supabase.from("shelf_books").insert({
      shelf_id: activeShelf.id,
      book_id: bookId,
      display_order: shelfBooksList.length,
      user_id: user.id,
    });

    if (linkErr) {
      setError(linkErr.message);
    } else {
      setShelfBooksList([...shelfBooksList, { ...book, book_id: bookId }]);
      setBookQuery("");
      setBookResults([]);
    }
  }

  async function saveAffiliate() {
    setSaving(true);
    setError("");
    const val = affiliateAmazon.trim() || null;
    const { error: err } = await supabase
      .from("profiles")
      .update({ affiliate_amazon: val })
      .eq("id", user.id);
    if (err) setError(err.message);
    else setStep("checklist");
    setSaving(false);
  }

  async function goPublic() {
    setSaving(true);
    const { error: err } = await supabase
      .from("profiles")
      .update({ room_is_public: true })
      .eq("id", user.id);
    if (!err) {
      navigate(`/@${username}`);
    }
    setSaving(false);
  }

  const [shelves, setShelves] = useState([]);
  useEffect(() => {
    if (!user) return;
    supabase
      .from("shelves")
      .select("id, name")
      .eq("user_id", user.id)
      .then(({ data }) => setShelves(data || []));
  }, [user, step]);

  if (loading) {
    return (
      <div style={pageStyle}>
        <style>{css}</style>
        <div className="rrs-container">
          <p style={{ color: "#8C7F72", textAlign: "center", padding: 60 }}>Loading…</p>
        </div>
      </div>
    );
  }

  const hasUsername = username && username.length >= 3;
  const hasDisplayName = displayName && displayName.trim() && displayName !== user?.email;
  const hasShelves = shelves.length > 0;
  const hasAffiliate = !!affiliateAmazon;

  return (
    <div style={pageStyle}>
      <style>{css}</style>

      {/* NAV */}
      <nav className="rrs-nav">
        <a className="rrs-nav-logo" href="/">📖 OurBookmark</a>
        <button className="rrs-nav-skip" onClick={() => navigate("/")}>
          Skip for now →
        </button>
      </nav>

      <div className="rrs-container">

        {/* ─── STEP 1: USERNAME ─── */}
        {step === 1 && (
          <div className="rrs-card rrs-fade">
            <div className="rrs-step-badge">Step 1 of 2</div>
            <h1 className="rrs-title">Claim your URL</h1>
            <p className="rrs-desc">
              This is your public Reading Room address. Choose something memorable!
            </p>
            <div className="rrs-url-preview">
              ourbookmark.com/<strong>@{username || "yourname"}</strong>
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="yourname"
              className="rrs-input"
              maxLength={30}
              autoFocus
            />
            {checkingUsername && <p className="rrs-hint">Checking availability…</p>}
            {usernameAvailable === true && username.length >= 3 && (
              <p className="rrs-hint rrs-success">✓ @{username} is available!</p>
            )}
            {usernameAvailable === false && (
              <p className="rrs-hint rrs-error">✕ That username is taken</p>
            )}
            {error && <p className="rrs-hint rrs-error">{error}</p>}
            <button
              className="rrs-btn-primary"
              onClick={saveUsername}
              disabled={!username || username.length < 3 || !usernameAvailable || saving}
            >
              {saving ? "Saving…" : "Claim this URL"}
            </button>
          </div>
        )}

        {/* ─── STEP 2: DISPLAY NAME & BIO ─── */}
        {step === 2 && (
          <div className="rrs-card rrs-fade">
            <div className="rrs-step-badge">Step 2 of 2</div>
            <h1 className="rrs-title">Introduce yourself</h1>
            <p className="rrs-desc">
              This is what visitors see when they find your Reading Room.
            </p>
            <label className="rrs-label">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Shirlz"
              className="rrs-input"
              autoFocus
            />
            <label className="rrs-label">Bio <span style={{ color: "#8C7F72", fontWeight: 400 }}>(optional)</span></label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Books I love, books my kids are obsessed with, and everything in between."
              className="rrs-textarea"
              rows={3}
            />
            {error && <p className="rrs-hint rrs-error">{error}</p>}
            <button
              className="rrs-btn-primary"
              onClick={saveDisplayInfo}
              disabled={!displayName.trim() || saving}
            >
              {saving ? "Saving…" : "Continue"}
            </button>
            <button className="rrs-btn-back" onClick={() => setStep(1)}>← Back</button>
          </div>
        )}

        {/* ─── CHECKLIST ─── */}
        {step === "checklist" && (
          <div className="rrs-card rrs-fade">
            <div className="rrs-avatar-row">
              <div className="rrs-avatar">{(displayName || username || "?")[0].toUpperCase()}</div>
              <div>
                <h1 className="rrs-title" style={{ marginBottom: 2 }}>{displayName || username}'s Setup</h1>
                <p style={{ color: "#8C7F72", fontSize: "0.88rem" }}>ourbookmark.com/@{username}</p>
              </div>
            </div>

            <p className="rrs-desc" style={{ marginTop: 16 }}>
              Complete these steps to launch your Reading Room. You can always update these later.
            </p>

            <div className="rrs-checklist">
              {/* Username */}
              <div className={`rrs-check-item ${hasUsername ? "done" : ""}`}>
                <div className="rrs-check-icon">{hasUsername ? "✓" : "1"}</div>
                <div className="rrs-check-text">
                  <div className="rrs-check-label">Choose username</div>
                  <div className="rrs-check-detail">@{username}</div>
                </div>
                {hasUsername && <span className="rrs-check-done">Done</span>}
              </div>

              {/* Display name */}
              <div className={`rrs-check-item ${hasDisplayName ? "done" : ""}`}>
                <div className="rrs-check-icon">{hasDisplayName ? "✓" : "2"}</div>
                <div className="rrs-check-text">
                  <div className="rrs-check-label">Set your name & bio</div>
                  <div className="rrs-check-detail">{hasDisplayName ? displayName : "Not set yet"}</div>
                </div>
                {!hasDisplayName ? (
                  <button className="rrs-check-action" onClick={() => setStep(2)}>Set up</button>
                ) : (
                  <button className="rrs-check-edit" onClick={() => setStep(2)}>Edit</button>
                )}
              </div>

              {/* Create shelf */}
              <div className={`rrs-check-item ${hasShelves ? "done" : ""}`}>
                <div className="rrs-check-icon">{hasShelves ? "✓" : "3"}</div>
                <div className="rrs-check-text">
                  <div className="rrs-check-label">Create shelves & add books</div>
                  <div className="rrs-check-detail">
                    {hasShelves
                      ? `${shelves.length} ${shelves.length === 1 ? "shelf" : "shelves"} created`
                      : "Organize books into themed shelves"}
                  </div>
                </div>
                <button className="rrs-check-action" onClick={() => setStep("shelf")}>
                  {hasShelves ? "+ New shelf" : "Create"}
                </button>
              </div>

              {/* Individual shelves with add books */}
              {shelves.map((shelf) => (
                <div key={shelf.id} className="rrs-check-item rrs-check-sub done">
                  <div className="rrs-check-icon" style={{ width: 24, height: 24, fontSize: "0.65rem" }}>📚</div>
                  <div className="rrs-check-text">
                    <div className="rrs-check-label" style={{ fontSize: "0.85rem" }}>{shelf.name}</div>
                  </div>
                  <button
                    className="rrs-check-action"
                    onClick={() => {
                      setActiveShelf({ id: shelf.id, name: shelf.name });
                      setShelfBooksList([]);
                      setBookQuery("");
                      setBookResults([]);
                      setStep("shelf-books");
                    }}
                  >
                    + Books
                  </button>
                </div>
              ))}

              {/* Affiliate link */}
              <div className={`rrs-check-item ${hasAffiliate ? "done" : ""}`}>
                <div className="rrs-check-icon">{hasAffiliate ? "✓" : "4"}</div>
                <div className="rrs-check-text">
                  <div className="rrs-check-label">Add affiliate link</div>
                  <div className="rrs-check-detail">
                    {hasAffiliate ? `Amazon tag: ${affiliateAmazon}` : "Earn when visitors buy books"}
                  </div>
                </div>
                <button className={hasAffiliate ? "rrs-check-edit" : "rrs-check-action"} onClick={() => setStep("affiliate")}>
                  {hasAffiliate ? "Edit" : "Add"}
                </button>
              </div>
            </div>

            {/* GO PUBLIC */}
            <div className="rrs-launch-section">
              <button
                className="rrs-btn-launch"
                onClick={goPublic}
                disabled={!hasUsername || saving}
              >
                {saving ? "Publishing…" : "🚀 Launch your Reading Room"}
              </button>
              <p className="rrs-launch-note">
                {hasUsername && hasDisplayName && hasShelves
                  ? "You're all set! Click above to go live."
                  : "You can launch now and finish setup later."}
              </p>
            </div>

            <button className="rrs-btn-secondary" onClick={() => navigate("/")}>
              Continue to app →
            </button>
          </div>
        )}

        {/* ─── CREATE SHELF ─── */}
        {step === "shelf" && (
          <div className="rrs-card rrs-fade">
            <h1 className="rrs-title">Create a Shelf</h1>
            <p className="rrs-desc">
              Shelves organize your books by theme — like "Toddler Favorites" or "Books That Changed Me."
            </p>
            <label className="rrs-label">Shelf name</label>
            <input
              type="text"
              value={shelfName}
              onChange={(e) => setShelfName(e.target.value)}
              placeholder="Toddler Favorites"
              className="rrs-input"
              autoFocus
            />
            <label className="rrs-label">Description <span style={{ color: "#8C7F72", fontWeight: 400 }}>(optional)</span></label>
            <textarea
              value={shelfDesc}
              onChange={(e) => setShelfDesc(e.target.value)}
              placeholder="Books we reach for constantly"
              className="rrs-textarea"
              rows={2}
            />
            {error && <p className="rrs-hint rrs-error">{error}</p>}
            <button
              className="rrs-btn-primary"
              onClick={createShelf}
              disabled={!shelfName.trim() || saving}
            >
              {saving ? "Creating…" : "Create shelf"}
            </button>
            <button className="rrs-btn-back" onClick={() => setStep("checklist")}>← Back to checklist</button>
          </div>
        )}

        {/* ─── AFFILIATE ─── */}
        {step === "affiliate" && (
          <div className="rrs-card rrs-fade">
            <h1 className="rrs-title">Add Affiliate Link</h1>
            <p className="rrs-desc">
              When visitors click "Buy on Amazon" from your shelf, you'll earn a commission through the Amazon Associates program.
            </p>
            <label className="rrs-label">Amazon Associates tag</label>
            <input
              type="text"
              value={affiliateAmazon}
              onChange={(e) => setAffiliateAmazon(e.target.value)}
              placeholder="yourtag-20"
              className="rrs-input"
              autoFocus
            />
            <p className="rrs-hint" style={{ marginBottom: 16 }}>
              Don't have one? <a href="https://affiliate-program.amazon.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#C4873A" }}>Sign up for Amazon Associates</a> (it's free).
            </p>
            {error && <p className="rrs-hint rrs-error">{error}</p>}
            <button
              className="rrs-btn-primary"
              onClick={saveAffiliate}
              disabled={saving}
            >
              {saving ? "Saving…" : affiliateAmazon ? "Save tag" : "Skip for now"}
            </button>
            <button className="rrs-btn-back" onClick={() => setStep("checklist")}>← Back to checklist</button>
          </div>
        )}

        {/* ─── ADD BOOKS TO SHELF ─── */}
        {step === "shelf-books" && activeShelf && (
          <div className="rrs-card rrs-fade">
            <h1 className="rrs-title">Add Books to "{activeShelf.name}"</h1>
            <p className="rrs-desc">
              Search for books to add to this shelf. You can always add more later.
            </p>

            {/* Search Mode Toggle */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <button
                onClick={() => setSearchMode("title")}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 12px',
                  borderRadius: '100px',
                  border: '1px solid #C4873A',
                  background: searchMode === "title" ? "#C4873A" : "transparent",
                  color: searchMode === "title" ? "white" : "#C4873A",
                  cursor: 'pointer'
                }}
              >
                Search by Title
              </button>
              <button
                onClick={() => setSearchMode("author")}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 12px',
                  borderRadius: '100px',
                  border: '1px solid #C4873A',
                  background: searchMode === "author" ? "#C4873A" : "transparent",
                  color: searchMode === "author" ? "white" : "#C4873A",
                  cursor: 'pointer'
                }}
              >
                Search by Author
              </button>
            </div>

            {/* Search */}
            <div className="rrs-search-row">
              <input
                type="text"
                value={bookQuery}
                onChange={(e) => setBookQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchBooks()}
                placeholder={searchMode === "author" ? "e.g. J.K. Rowling" : "e.g. Harry Potter"}
                className="rrs-input"
                style={{ marginBottom: 0, flex: 1 }}
                autoFocus
              />
              <button
                className="rrs-btn-search"
                onClick={searchBooks}
                disabled={searching || !bookQuery.trim()}
              >
                {searching ? "…" : "Search"}
              </button>
            </div>

            {error && <p className="rrs-hint rrs-error" style={{ marginTop: 8 }}>{error}</p>}

            {/* Results */}
            {bookResults.length > 0 && (
              <div className="rrs-book-results">
                {bookResults.map((book, i) => (
                  <div key={book.google_books_id || i} className="rrs-book-result">
                    <div className="rrs-book-result-cover">
                      {book.cover_url ? (
                        <img
                          src={book.cover_url}
                          alt=""
                          onError={(e) => {
                            e.target.style.display = "none";
                            e.target.nextSibling.style.display = "flex";
                          }}
                        />
                      ) : null}
                      <div
                        className="rrs-book-result-placeholder"
                        style={{ display: book.cover_url ? "none" : "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
                      >
                        <span style={{ fontSize: "1.4rem" }}>📚</span>
                      </div>
                    </div>
                    <div className="rrs-book-result-info">
                      <div className="rrs-book-result-title">{book.title}</div>
                      {book.author && <div className="rrs-book-result-author">{book.author}</div>}
                    </div>
                    <button
                      className="rrs-btn-add-book"
                      onClick={() => addBookToShelf(book)}
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Books added so far */}
            {shelfBooksList.length > 0 && (
              <div className="rrs-added-books">
                <div className="rrs-added-label">
                  ✓ {shelfBooksList.length} {shelfBooksList.length === 1 ? "book" : "books"} added
                </div>
                {shelfBooksList.map((book, i) => (
                  <div key={i} className="rrs-added-book">
                    <span className="rrs-added-book-dot" />
                    <span>{book.title}</span>
                    {book.author && <span className="rrs-added-book-author">by {book.author}</span>}
                  </div>
                ))}
              </div>
            )}

            <button
              className="rrs-btn-primary"
              onClick={() => setStep("checklist")}
              style={{ marginTop: 20 }}
            >
              {shelfBooksList.length > 0 ? "Done adding books" : "Skip for now"}
            </button>
            <button className="rrs-btn-back" onClick={() => setStep("shelf")}>← Create another shelf</button>
          </div>
        )}
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#FAF7F2",
  color: "#1C1712",
  fontFamily: "'DM Sans', sans-serif",
};

const css = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500&display=swap');

.rrs-nav {
  padding: 20px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0,0,0,0.07);
  background: #FDF9F4;
}
.rrs-nav-logo {
  font-family: 'Playfair Display', serif;
  font-size: 1.2rem;
  color: #C4873A;
  text-decoration: none;
}
.rrs-nav-skip {
  background: none;
  border: none;
  color: #8C7F72;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.88rem;
  cursor: pointer;
  padding: 8px 16px;
  border-radius: 100px;
  transition: color 0.15s;
}
.rrs-nav-skip:hover { color: #1C1712; }

.rrs-container {
  max-width: 520px;
  margin: 0 auto;
  padding: 48px 24px 80px;
}

@keyframes rrsFadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
.rrs-fade { animation: rrsFadeUp 0.4s ease both; }

.rrs-card {
  background: #FDF9F4;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 20px;
  padding: 36px 32px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
}

.rrs-step-badge {
  display: inline-block;
  background: rgba(196,135,58,0.12);
  color: #C4873A;
  font-size: 0.78rem;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 100px;
  margin-bottom: 16px;
}

.rrs-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.6rem;
  font-weight: 600;
  color: #1C1712;
  margin-bottom: 8px;
}

.rrs-desc {
  font-size: 0.92rem;
  color: #4A4035;
  line-height: 1.6;
  margin-bottom: 24px;
}

.rrs-url-preview {
  background: white;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  padding: 14px 18px;
  font-size: 0.95rem;
  color: #8C7F72;
  margin-bottom: 16px;
  font-family: 'DM Sans', sans-serif;
}
.rrs-url-preview strong { color: #C4873A; }

.rrs-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  color: #1C1712;
  margin-bottom: 6px;
}

.rrs-input {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid rgba(0,0,0,0.12);
  border-radius: 12px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.95rem;
  background: white;
  color: #1C1712;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  margin-bottom: 12px;
}
.rrs-input:focus { border-color: #C4873A; }
.rrs-input::placeholder { color: #8C7F72; }

.rrs-textarea {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid rgba(0,0,0,0.12);
  border-radius: 12px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.95rem;
  background: white;
  color: #1C1712;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  margin-bottom: 12px;
  resize: vertical;
}
.rrs-textarea:focus { border-color: #C4873A; }
.rrs-textarea::placeholder { color: #8C7F72; }

.rrs-hint {
  font-size: 0.82rem;
  color: #8C7F72;
  margin-top: -4px;
  margin-bottom: 12px;
}
.rrs-success { color: #6B8F71; }
.rrs-error { color: #c0392b; }

.rrs-btn-primary {
  width: 100%;
  padding: 14px;
  background: #C4873A;
  color: white;
  border: none;
  border-radius: 100px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 8px;
}
.rrs-btn-primary:hover { background: #E8A85C; }
.rrs-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.rrs-btn-back {
  display: block;
  margin: 14px auto 0;
  background: none;
  border: none;
  color: #8C7F72;
  font-size: 0.85rem;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
}
.rrs-btn-back:hover { color: #1C1712; }

.rrs-btn-secondary {
  display: block;
  width: 100%;
  padding: 12px;
  background: transparent;
  color: #8C7F72;
  border: 1.5px solid rgba(0,0,0,0.1);
  border-radius: 100px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  margin-top: 12px;
}
.rrs-btn-secondary:hover { border-color: rgba(0,0,0,0.25); color: #1C1712; }

/* ── AVATAR ROW ── */
.rrs-avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.rrs-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #C4873A 0%, #D4826A 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Playfair Display', serif;
  font-size: 1.5rem;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 4px 16px rgba(196,135,58,0.3);
}

/* ── CHECKLIST ── */
.rrs-checklist {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 28px;
}
.rrs-check-item {
  display: flex;
  align-items: center;
  gap: 14px;
  background: white;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 14px;
  padding: 14px 16px;
  transition: box-shadow 0.15s;
}
.rrs-check-item:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.rrs-check-item.done {
  border-color: rgba(107,143,113,0.3);
  background: rgba(107,143,113,0.04);
}
.rrs-check-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  font-weight: 600;
  color: #8C7F72;
  flex-shrink: 0;
}
.rrs-check-item.done .rrs-check-icon {
  background: #6B8F71;
  color: white;
}
.rrs-check-text { flex: 1; min-width: 0; }
.rrs-check-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #1C1712;
}
.rrs-check-detail {
  font-size: 0.78rem;
  color: #8C7F72;
  margin-top: 1px;
}
.rrs-check-done {
  font-size: 0.75rem;
  color: #6B8F71;
  font-weight: 500;
}
.rrs-check-action {
  background: #C4873A;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 100px;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  white-space: nowrap;
  transition: background 0.15s;
}
.rrs-check-action:hover { background: #E8A85C; }
.rrs-check-edit {
  background: transparent;
  color: #C4873A;
  border: 1px solid #C4873A;
  padding: 5px 12px;
  border-radius: 100px;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  white-space: nowrap;
  transition: all 0.15s;
}
.rrs-check-edit:hover { background: #C4873A; color: white; }

/* ── LAUNCH ── */
.rrs-launch-section {
  text-align: center;
  margin-bottom: 16px;
}
.rrs-btn-launch {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #C4873A 0%, #D4826A 100%);
  color: white;
  border: none;
  border-radius: 100px;
  font-family: 'DM Sans', sans-serif;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 16px rgba(196,135,58,0.3);
}
.rrs-btn-launch:hover { box-shadow: 0 6px 24px rgba(196,135,58,0.4); transform: translateY(-1px); }
.rrs-btn-launch:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
.rrs-launch-note {
  font-size: 0.78rem;
  color: #8C7F72;
  margin-top: 10px;
}

/* ── BOOK SEARCH ── */
.rrs-search-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.rrs-btn-search {
  padding: 12px 20px;
  background: #C4873A;
  color: white;
  border: none;
  border-radius: 12px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.rrs-btn-search:hover { background: #E8A85C; }
.rrs-btn-search:disabled { opacity: 0.5; cursor: not-allowed; }

.rrs-book-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  max-height: 340px;
  overflow-y: auto;
}
.rrs-book-result {
  display: flex;
  align-items: center;
  gap: 12px;
  background: white;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  padding: 10px 12px;
  transition: box-shadow 0.15s;
}
.rrs-book-result:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
.rrs-book-result-cover {
  width: 40px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(0,0,0,0.04);
  display: flex;
  align-items: center;
  justify-content: center;
}
.rrs-book-result-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.rrs-book-result-placeholder {
  font-size: 1.2rem;
}
.rrs-book-result-info { flex: 1; min-width: 0; }
.rrs-book-result-title {
  font-size: 0.88rem;
  font-weight: 500;
  color: #1C1712;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rrs-book-result-author {
  font-size: 0.75rem;
  color: #8C7F72;
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rrs-btn-add-book {
  background: #6B8F71;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 100px;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  white-space: nowrap;
  transition: background 0.15s;
  flex-shrink: 0;
}
.rrs-btn-add-book:hover { background: #5C7A5C; }

.rrs-added-books {
  margin-top: 20px;
  padding: 16px;
  background: rgba(107,143,113,0.06);
  border: 1px solid rgba(107,143,113,0.2);
  border-radius: 14px;
}
.rrs-added-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #6B8F71;
  margin-bottom: 10px;
}
.rrs-added-book {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: #1C1712;
  padding: 4px 0;
}
.rrs-added-book-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6B8F71;
  flex-shrink: 0;
}
.rrs-added-book-author {
  color: #8C7F72;
  font-size: 0.78rem;
}

/* ── CHECKLIST SUB ITEMS ── */
.rrs-check-sub {
  margin-left: 24px;
  border-color: rgba(0,0,0,0.05);
  background: rgba(255,255,255,0.5);
}

@media (max-width: 600px) {
  .rrs-nav { padding: 16px 20px; }
  .rrs-container { padding: 28px 16px 60px; }
  .rrs-card { padding: 28px 22px; }
  .rrs-title { font-size: 1.35rem; }
}
`;
