import { useEffect, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const FALLBACK_AMAZON_TAG = "YOURTAG-20";

function amazonLink(book, profile) {
  const tag = profile?.affiliate_amazon || FALLBACK_AMAZON_TAG;
  const q = book?.isbn_13 || book?.isbn_10 || book?.title || "";
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}`;
}

function bookshopLink(book, profile) {
  const tag = profile?.affiliate_bookshop || "";
  const q = book?.title || "";
  const base = `https://bookshop.org/search?keywords=${encodeURIComponent(q)}`;
  return tag ? `${base}&a_aid=${encodeURIComponent(tag)}` : base;
}

function libbyLink(book) {
  const q = book?.title || "";
  return `https://www.overdrive.com/search?q=${encodeURIComponent(q)}`;
}

const SPINE_COLORS = [
  ["#C4873A", "#E8A85C"], ["#6B8F71", "#92B89A"], ["#D4826A", "#E8A090"],
  ["#8B6BAE", "#A98CC8"], ["#4A7FA5", "#6EA4C8"], ["#5C7A5C", "#7A9E7A"],
  ["#B5634A", "#D4846A"], ["#4A6A8B", "#6A8BAA"], ["#9B7B4A", "#C4A068"],
  ["#7A5C8B", "#9E7AAE"], ["#5C8B7A", "#7AAAA0"], ["#8B5C4A", "#AA7A68"],
];

function hashColor(title) {
  let h = 0;
  for (let i = 0; i < (title || "").length; i++) h = (h * 31 + title.charCodeAt(i)) | 0;
  return SPINE_COLORS[Math.abs(h) % SPINE_COLORS.length];
}

function spineHeight(title) {
  const base = 110;
  let h = 0;
  for (let i = 0; i < (title || "").length; i++) h = (h * 17 + title.charCodeAt(i)) | 0;
  return base + (Math.abs(h) % 50);
}

function hiResCover(url) {
  if (!url) return null;
  return url.replace("zoom=1", "zoom=0").replace("&edge=curl", "");
}

export default function PublicReadingRoom() {
  const { username: rawUsername } = useParams();
  const username = (rawUsername || "").startsWith("@")
    ? rawUsername.slice(1)
    : rawUsername || "";

  if (!rawUsername?.startsWith("@")) {
    return <Navigate to="/" replace />;
  }

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [shelves, setShelves] = useState([]);
  const [shelfBooks, setShelfBooks] = useState([]);
  const [activeTab, setActiveTab] = useState("shelves");
  const [showSignup, setShowSignup] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [addingToShelf, setAddingToShelf] = useState(null); // shelf id
  const [bookQuery, setBookQuery] = useState("");
  const [bookResults, setBookResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showNewShelf, setShowNewShelf] = useState(false);
  const [newShelfName, setNewShelfName] = useState("");
  const [newShelfDesc, setNewShelfDesc] = useState("");
  const [savingShelf, setSavingShelf] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [editError, setEditError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [editingShelfId, setEditingShelfId] = useState(null);
  const [editingShelfName, setEditingShelfName] = useState("");
  const [editingShelfDesc, setEditingShelfDesc] = useState("");

  // Bio editing (via Edit profile panel)
  const [bioValue, setBioValue] = useState("");
  const [affiliateValue, setAffiliateValue] = useState("");
  const [affiliateBookshopValue, setAffiliateBookshopValue] = useState("");

  // Hero customization
  const [heroEditMode, setHeroEditMode] = useState(false);
  const [headerConfig, setHeaderConfig] = useState({
    stats: { enabled: true },
    currentlyReading: { enabled: false, title: "", author: "", cover_url: "" },
    genreAgeGroup: { enabled: false, value: "" },
    socialLinks: { enabled: false, links: [{ platform: "", url: "" }] },
  });
  const [savingHeader, setSavingHeader] = useState(false);
  const [statsEditMode, setStatsEditMode] = useState(false);

  // Check if current user owns this page
  useEffect(() => {
    async function checkOwner() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && profile?.id === session.user.id) {
        setIsOwner(true);
      } else {
        setIsOwner(false);
      }
    }
    if (profile) checkOwner();
  }, [profile]);

  // Reload data helper
  async function reloadData() {
    if (!profile) return;
    const { data: s } = await supabase
      .from("shelves")
      .select("id, name, description, display_order")
      .eq("user_id", profile.id)
      .eq("is_visible", true)
      .order("display_order", { ascending: true });
    setShelves(s || []);
    if (s && s.length > 0) {
      const shelfIds = s.map((x) => x.id);
      const { data: sb } = await supabase
        .from("shelf_books")
        .select(`id, shelf_id, display_order, curator_note, books:book_id ( id, title, author, isbn_10, isbn_13, google_books_id, cover_url )`)
        .in("shelf_id", shelfIds)
        .order("display_order", { ascending: true });
      setShelfBooks(sb || []);
    } else {
      setShelfBooks([]);
    }
  }

  async function searchBooks() {
    if (!bookQuery.trim()) return;
    setSearching(true);
    try {
      const apiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
      const q = encodeURIComponent(bookQuery.trim());
      const url = apiKey
        ? `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=6&key=${apiKey}`
        : `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=6`;
      const res = await fetch(url);
      const data = await res.json();
      setBookResults((data.items || []).map((item) => {
        const v = item.volumeInfo || {};
        const ids = (v.industryIdentifiers || []);
        return {
          google_books_id: item.id,
          title: v.title || "Untitled",
          author: (v.authors || []).join(", "),
          cover_url: v.imageLinks?.thumbnail?.replace("http:", "https:").replace("zoom=1", "zoom=0") || null,
          isbn_13: ids.find((i) => i.type === "ISBN_13")?.identifier || null,
          isbn_10: ids.find((i) => i.type === "ISBN_10")?.identifier || null,
        };
      }));
    } catch (e) {
      console.warn("Book search error:", e);
      setBookResults([]);
    }
    setSearching(false);
  }

  async function addBookToShelf(book, shelfId) {
    setEditError("");
    let bookId = null;
    const { data: existing } = await supabase.from("books").select("id").eq("title", book.title).limit(1);
    if (existing?.length > 0) {
      bookId = existing[0].id;
    } else {
      const { data: newBook } = await supabase.from("books").insert({
        title: book.title, author: book.author || null, cover_url: book.cover_url || null,
        isbn_13: book.isbn_13 || null, isbn_10: book.isbn_10 || null, google_books_id: book.google_books_id || null,
      }).select().single();
      if (newBook) bookId = newBook.id;
    }
    if (!bookId) { setEditError("Failed to add book"); return; }
    const { data: dup } = await supabase.from("shelf_books").select("id").eq("shelf_id", shelfId).eq("book_id", bookId).limit(1);
    if (dup?.length > 0) { setEditError("Already on this shelf!"); setTimeout(() => setEditError(""), 2000); return; }
    const items = booksByShelf.get(shelfId) || [];
    const { error: err } = await supabase.from("shelf_books").insert({
      shelf_id: shelfId, book_id: bookId, display_order: items.length, user_id: profile.id,
    });
    if (err) { setEditError(err.message); return; }
    setBookQuery(""); setBookResults([]); setAddingToShelf(null);
    await reloadData();
  }

  async function removeBookFromShelf(shelfBookId) {
    await supabase.from("shelf_books").delete().eq("id", shelfBookId);
    await reloadData();
  }

  async function createNewShelf() {
    if (!newShelfName.trim()) return;
    setSavingShelf(true);
    await supabase.from("shelves").insert({
      user_id: profile.id, name: newShelfName.trim(), description: newShelfDesc.trim(),
      is_visible: true, display_order: shelves.length,
    });
    setNewShelfName(""); setNewShelfDesc(""); setShowNewShelf(false); setSavingShelf(false);
    await reloadData();
  }

  async function renameShelf(shelfId) {
    if (!editingShelfName.trim()) return;
    await supabase.from("shelves").update({
      name: editingShelfName.trim(),
      description: editingShelfDesc.trim(),
    }).eq("id", shelfId);
    setEditingShelfId(null);
    setEditingShelfName("");
    setEditingShelfDesc("");
    await reloadData();
  }

  async function moveShelf(shelfId, direction) {
    const idx = shelves.findIndex(s => s.id === shelfId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= shelves.length) return;
    const a = shelves[idx];
    const b = shelves[swapIdx];
    await Promise.all([
      supabase.from("shelves").update({ display_order: swapIdx }).eq("id", a.id),
      supabase.from("shelves").update({ display_order: idx }).eq("id", b.id),
    ]);
    await reloadData();
  }

  async function deleteShelf(shelfId) {
    if (!window.confirm("Delete this shelf and remove all its books? This can't be undone.")) return;
    await supabase.from("shelf_books").delete().eq("shelf_id", shelfId);
    await supabase.from("shelves").delete().eq("id", shelfId);
    await reloadData();
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError("");
    try {
      // Always use a consistent extension-free path so upsert works reliably,
      // then bust the browser cache with a timestamp query param.
      const ext = file.name.split(".").pop().toLowerCase();
      const path = `avatars/${profile.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      // Append cache-buster so the browser fetches the new image immediately
      const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: cacheBustedUrl })
        .eq("id", profile.id);
      if (dbErr) throw dbErr;
      setProfile({ ...profile, avatar_url: cacheBustedUrl });
    } catch (err) {
      console.error("Avatar upload error:", err);
      setAvatarError(err.message || "Upload failed. Please try again.");
    } finally {
      setAvatarUploading(false);
    }
  }

  function handleShare() {
    navigator.clipboard?.writeText(`https://ourbookmark.com/@${profile.username}`);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  async function saveProfileEdit() {
    setSavingHeader(true);
    const trimmed = bioValue.trim();
    await supabase.from("profiles").update({
      bio: trimmed,
      header_widgets: headerConfig,
      affiliate_amazon: affiliateValue.trim() || null,
      affiliate_bookshop: affiliateBookshopValue.trim() || null,
    }).eq("id", profile.id);
    setProfile({ ...profile, bio: trimmed, affiliate_amazon: affiliateValue.trim() || null, affiliate_bookshop: affiliateBookshopValue.trim() || null });
    setSavingHeader(false);
    setHeroEditMode(false);
  }

  async function saveStatsConfig() {
    setSavingHeader(true);
    await supabase.from("profiles").update({ header_widgets: headerConfig }).eq("id", profile.id);
    setSavingHeader(false);
    setStatsEditMode(false);
  }

  const booksByShelf = useMemo(() => {
    const map = new Map();
    for (const sb of shelfBooks) {
      const arr = map.get(sb.shelf_id) || [];
      arr.push(sb);
      map.set(sb.shelf_id, arr);
    }
    return map;
  }, [shelfBooks]);

  const allBooks = useMemo(() => {
    return shelfBooks.filter((sb) => sb.books);
  }, [shelfBooks]);

  const totalBooks = allBooks.length;
  const totalShelves = shelves.length;

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);

      const { data: p } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, room_is_public, affiliate_amazon, affiliate_bookshop, avatar_url, header_widgets")
        .eq("username", username)
        .eq("room_is_public", true)
        .single();

      if (!mounted) return;
      if (!p) {
        setProfile(null);
        setShelves([]);
        setShelfBooks([]);
        setLoading(false);
        return;
      }
      setProfile(p);
      setBioValue(p.bio || "");
      setAffiliateValue(p.affiliate_amazon || "");
      setAffiliateBookshopValue(p.affiliate_bookshop || "");
      if (p.header_widgets) {
        setHeaderConfig((prev) => ({ ...prev, ...p.header_widgets }));
      }

      const { data: s } = await supabase
        .from("shelves")
        .select("id, name, description, display_order")
        .eq("user_id", p.id)
        .eq("is_visible", true)
        .order("display_order", { ascending: true });

      if (!mounted) return;
      if (!s || s.length === 0) {
        setShelves([]);
        setShelfBooks([]);
        setLoading(false);
        return;
      }
      setShelves(s);

      const shelfIds = s.map((x) => x.id);
      const { data: sb } = await supabase
        .from("shelf_books")
        .select(`
          id, shelf_id, display_order, curator_note,
          books:book_id ( id, title, author, isbn_10, isbn_13, google_books_id, cover_url )
        `)
        .in("shelf_id", shelfIds)
        .order("display_order", { ascending: true });

      if (!mounted) return;
      setShelfBooks(sb || []);
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [username]);

  const displayName = profile?.display_name || profile?.username || username;
  const initial = (displayName || "?")[0].toUpperCase();

  /* ─── LOADING / NOT FOUND ─── */
  if (loading) {
    return (
      <div style={styles.page} className="prr-page-wrap">
        <style>{globalCSS}</style>
        <Nav onSignup={() => setShowSignup(true)} />
        <div style={{ padding: "80px 40px", textAlign: "center", color: "#8C7F72" }}>
          Loading…
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={styles.page} className="prr-page-wrap">
        <style>{globalCSS}</style>
        <Nav onSignup={() => setShowSignup(true)} />
        <div style={{ padding: "80px 40px", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", marginBottom: 12 }}>
            Reading Room Not Found
          </h2>
          <p style={{ color: "#8C7F72" }}>
            This Reading Room doesn't exist or isn't public yet.
          </p>
        </div>
      </div>
    );
  }

  const widgetRowStyle = { borderBottom: "1px solid rgba(0,0,0,0.06)", paddingBottom: 16, marginBottom: 16 };
  const widgetLabelStyle = { display: "flex", alignItems: "center", cursor: "pointer", fontSize: "0.9rem", color: "#1C1712", userSelect: "none" };

  /* ─── MAIN RENDER ─── */
  return (
    <div style={styles.page} className="prr-page-wrap">
      <style>{globalCSS}</style>
      <Nav onSignup={() => setShowSignup(true)} isOwner={isOwner} />

      {/* HERO */}
      <div className="prr-hero">
        <div className="prr-avatar-wrap">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="prr-avatar-img"
              style={avatarUploading ? { opacity: 0.5 } : {}} />
          ) : (
            <div className="prr-avatar" style={avatarUploading ? { opacity: 0.5 } : {}}>{initial}</div>
          )}
          {isOwner && (
            <label className="prr-avatar-edit" title="Change photo">
              {avatarUploading ? "⏳" : "📷"}
              <input type="file" accept="image/*" onChange={handleAvatarUpload}
                style={{ display: "none" }} disabled={avatarUploading} />
            </label>
          )}
          {avatarError && (
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6,
              background: "#fff0f0", border: "1px solid #f5c6cb", borderRadius: 8,
              padding: "6px 10px", fontSize: "0.75rem", color: "#c0392b",
              whiteSpace: "nowrap", zIndex: 10 }}>
              {avatarError}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="prr-hero-h1">
            {displayName}'s <span>{" "}Reading Room</span>
          </h1>
          <div className="prr-hero-meta">
            <span>✦ ourbookmark.com/@{profile.username}</span>
          </div>
          {profile.bio && <p className="prr-hero-bio">{profile.bio}</p>}

          {/* Social links display */}
          {headerConfig.socialLinks?.links?.some(l => l.url) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {headerConfig.socialLinks.links.filter(l => l.url).map((link, i) => (
                <a key={i} href={link.url.startsWith("http") ? link.url : `https://${link.url}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ background: "#FDF0E0", border: "1px solid rgba(196,135,58,0.2)", borderRadius: 100, padding: "5px 14px", fontSize: "0.8rem", color: "#C4873A", textDecoration: "none", fontWeight: 500 }}>
                  {link.platform || "🔗 Link"}
                </a>
              ))}
            </div>
          )}

          <div className="prr-profile-actions">
            <button className="prr-btn-share" onClick={handleShare}>
              {shareCopied ? "✓ Link copied!" : "Share 🔗"}
            </button>
            {isOwner && (
              <button className="prr-btn-share" onClick={() => setHeroEditMode(v => !v)}
                style={heroEditMode ? { borderColor: "#C4873A", color: "#C4873A" } : {}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                {heroEditMode ? "Done editing" : "Edit profile"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PROFILE EDIT PANEL */}
      {isOwner && heroEditMode && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 40px 32px" }}>
          <div style={{ background: "white", border: "1.5px solid rgba(196,135,58,0.25)", borderRadius: 16, padding: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", marginBottom: 20, color: "#1C1712" }}>Edit Profile</h3>

            {/* BIO */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#4A4035", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Bio</label>
              <textarea
                value={bioValue}
                onChange={(e) => setBioValue(e.target.value)}
                placeholder="Write a short bio…"
                style={{
                  width: "100%", padding: "10px 14px",
                  border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 12,
                  fontFamily: "'DM Sans', sans-serif", fontSize: "0.95rem",
                  lineHeight: 1.6, color: "#1C1712", background: "#FAF7F2",
                  outline: "none", resize: "vertical", boxSizing: "border-box",
                  minHeight: 80, transition: "border-color 0.2s",
                }}
                onFocus={e => e.target.style.borderColor = "#C4873A"}
                onBlur={e => e.target.style.borderColor = "rgba(0,0,0,0.12)"}
                rows={3}
              />
            </div>

            {/* SOCIAL LINKS */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#4A4035", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Social Links</label>
              {(headerConfig.socialLinks?.links || [{ platform: "", url: "" }]).map((link, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <input className="prr-inline-input" placeholder="Label (e.g. Instagram)" value={link.platform}
                    onChange={(e) => {
                      const links = [...(headerConfig.socialLinks?.links || [])];
                      links[i] = { ...links[i], platform: e.target.value };
                      setHeaderConfig(c => ({ ...c, socialLinks: { ...c.socialLinks, links } }));
                    }}
                    style={{ flex: "1 1 140px" }} />
                  <input className="prr-inline-input" placeholder="URL (e.g. instagram.com/yourname)" value={link.url}
                    onChange={(e) => {
                      const links = [...(headerConfig.socialLinks?.links || [])];
                      links[i] = { ...links[i], url: e.target.value };
                      setHeaderConfig(c => ({ ...c, socialLinks: { ...c.socialLinks, links } }));
                    }}
                    style={{ flex: "2 1 220px" }} />
                  {(headerConfig.socialLinks?.links?.length || 0) > 1 && (
                    <button className="prr-inline-cancel" onClick={() => {
                      const links = (headerConfig.socialLinks?.links || []).filter((_, idx) => idx !== i);
                      setHeaderConfig(c => ({ ...c, socialLinks: { ...c.socialLinks, links } }));
                    }}>✕</button>
                  )}
                </div>
              ))}
              {(headerConfig.socialLinks?.links?.length || 0) < 4 && (
                <button className="prr-inline-add-link" style={{ marginTop: 4 }} onClick={() =>
                  setHeaderConfig(c => ({ ...c, socialLinks: { ...c.socialLinks, links: [...(c.socialLinks?.links || []), { platform: "", url: "" }] } }))
                }>+ Add another link</button>
              )}
            </div>

            {/* AMAZON AFFILIATE TAG */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#4A4035", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Amazon Affiliate Tag</label>
              <p style={{ fontSize: "0.78rem", color: "#8C7F72", marginBottom: 8 }}>Your Associates tracking ID (e.g. <code>yourtag-20</code>). Added to all book links automatically.</p>
              <input className="prr-inline-input" placeholder="e.g. yourtag-20"
                value={affiliateValue}
                onChange={(e) => setAffiliateValue(e.target.value)}
                style={{ maxWidth: 280 }} />
            </div>

            {/* BOOKSHOP.ORG AFFILIATE */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#4A4035", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Bookshop.org Affiliate ID</label>
              <p style={{ fontSize: "0.78rem", color: "#8C7F72", marginBottom: 8 }}>Your Bookshop.org affiliate ID. Don't have one? <a href="https://bookshop.org/affiliates" target="_blank" rel="noopener noreferrer" style={{ color: "#C4873A" }}>Join here</a> (free).</p>
              <input className="prr-inline-input" placeholder="e.g. your-bookshop-id"
                value={affiliateBookshopValue}
                onChange={(e) => setAffiliateBookshopValue(e.target.value)}
                style={{ maxWidth: 280 }} />
            </div>

            {/* LIBRARY NOTE */}
            <div style={{ marginBottom: 20, padding: "12px 16px", background: "rgba(91,126,145,0.08)", borderRadius: 12 }}>
              <p style={{ fontSize: "0.82rem", color: "#5B7E91", fontWeight: 500, marginBottom: 2 }}>📖 Library (Free)</p>
              <p style={{ fontSize: "0.78rem", color: "#8C7F72" }}>A "📖 Library" link is automatically shown on every book — no setup needed. Visitors can search for your recommendations at their local library through OverDrive.</p>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="prr-inline-search-btn" onClick={saveProfileEdit} disabled={savingHeader}>
                {savingHeader ? "Saving…" : "Save changes"}
              </button>
              <button className="prr-inline-cancel-text" onClick={() => { setHeroEditMode(false); setBioValue(profile.bio || ""); setAffiliateValue(profile.affiliate_amazon || ""); setAffiliateBookshopValue(profile.affiliate_bookshop || ""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* SHELF TABS */}
      <div className="prr-shelf-nav">
        <button
          className={`prr-shelf-tab ${activeTab === "shelves" ? "active" : ""}`}
          onClick={() => setActiveTab("shelves")}
        >
          My Shelves
        </button>
        <button
          className={`prr-shelf-tab ${activeTab === "allbooks" ? "active" : ""}`}
          onClick={() => setActiveTab("allbooks")}
        >
          All Books ({totalBooks})
        </button>
      </div>

      {/* MAIN */}
      <div className="prr-main">
        {/* STATS BAR */}
        <div className="prr-stats-bar">
          <div className="prr-stat">
            <div className="prr-stat-num">{totalBooks}</div>
            <div className="prr-stat-label">books</div>
          </div>
          <div className="prr-stat">
            <div className="prr-stat-num">{totalShelves}</div>
            <div className="prr-stat-label">shelves</div>
          </div>

          {/* Currently reading tile */}
          {headerConfig.currentlyReading?.enabled && headerConfig.currentlyReading?.title && (
            <div className="prr-stat" style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 10, borderLeft: "1px solid rgba(196,135,58,0.2)", paddingLeft: 20 }}>
              {headerConfig.currentlyReading.cover_url && (
                <img src={headerConfig.currentlyReading.cover_url} alt="" style={{ width: 28, height: 40, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
              )}
              <div>
                <div className="prr-stat-label" style={{ marginBottom: 2 }}>📖 reading now</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", fontWeight: 500, color: "#1C1712", lineHeight: 1.2 }}>{headerConfig.currentlyReading.title}</div>
                {headerConfig.currentlyReading.author && <div style={{ fontSize: "0.72rem", color: "#8C7F72", marginTop: 1 }}>{headerConfig.currentlyReading.author}</div>}
              </div>
            </div>
          )}

          {/* Genre / age group tile */}
          {headerConfig.genreAgeGroup?.enabled && headerConfig.genreAgeGroup?.value && (
            <div className="prr-stat" style={{ borderLeft: "1px solid rgba(196,135,58,0.2)", paddingLeft: 20 }}>
              <div className="prr-stat-label" style={{ marginBottom: 2 }}>📚 reads</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", fontWeight: 500, color: "#1C1712" }}>{headerConfig.genreAgeGroup.value}</div>
            </div>
          )}

          {/* Owner: customize link */}
          {isOwner && !statsEditMode && (
            <button onClick={() => setStatsEditMode(true)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#C4873A", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", padding: "4px 8px", borderRadius: 8, transition: "background 0.15s", flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(196,135,58,0.08)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              + Customize
            </button>
          )}
          {isOwner && statsEditMode && (
            <button onClick={() => setStatsEditMode(false)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#8C7F72", fontSize: "0.78rem", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", padding: "4px 8px", flexShrink: 0 }}>
              Done
            </button>
          )}
        </div>

        {/* STATS BAR CUSTOMIZE PANEL */}
        {isOwner && statsEditMode && (
          <div style={{ background: "white", border: "1.5px solid rgba(196,135,58,0.2)", borderRadius: 12, padding: "16px 20px", marginBottom: 28, marginTop: -12 }}>
            <p style={{ fontSize: "0.8rem", color: "#8C7F72", marginBottom: 14 }}>Choose what to show in your stats bar:</p>

            {/* Currently reading */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.88rem", fontWeight: 500, color: "#1C1712", cursor: "pointer", marginBottom: 8 }}>
                <input type="checkbox" checked={headerConfig.currentlyReading?.enabled ?? false}
                  onChange={(e) => setHeaderConfig(c => ({ ...c, currentlyReading: { ...c.currentlyReading, enabled: e.target.checked } }))}
                  style={{ accentColor: "#C4873A" }} />
                📖 Currently reading
              </label>
              {headerConfig.currentlyReading?.enabled && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingLeft: 22 }}>
                  <input className="prr-inline-input" placeholder="Book title" value={headerConfig.currentlyReading?.title || ""}
                    onChange={(e) => setHeaderConfig(c => ({ ...c, currentlyReading: { ...c.currentlyReading, title: e.target.value } }))}
                    style={{ flex: "1 1 160px" }} />
                  <input className="prr-inline-input" placeholder="Author (optional)" value={headerConfig.currentlyReading?.author || ""}
                    onChange={(e) => setHeaderConfig(c => ({ ...c, currentlyReading: { ...c.currentlyReading, author: e.target.value } }))}
                    style={{ flex: "1 1 160px" }} />
                  <input className="prr-inline-input" placeholder="Cover image URL (optional)" value={headerConfig.currentlyReading?.cover_url || ""}
                    onChange={(e) => setHeaderConfig(c => ({ ...c, currentlyReading: { ...c.currentlyReading, cover_url: e.target.value } }))}
                    style={{ flex: "2 1 220px" }} />
                </div>
              )}
            </div>

            {/* Genre / age group */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.88rem", fontWeight: 500, color: "#1C1712", cursor: "pointer", marginBottom: 8 }}>
                <input type="checkbox" checked={headerConfig.genreAgeGroup?.enabled ?? false}
                  onChange={(e) => setHeaderConfig(c => ({ ...c, genreAgeGroup: { ...c.genreAgeGroup, enabled: e.target.checked } }))}
                  style={{ accentColor: "#C4873A" }} />
                📚 Favorite genre / age group
              </label>
              {headerConfig.genreAgeGroup?.enabled && (
                <input className="prr-inline-input" placeholder="e.g. Picture books for ages 2–6" value={headerConfig.genreAgeGroup?.value || ""}
                  onChange={(e) => setHeaderConfig(c => ({ ...c, genreAgeGroup: { ...c.genreAgeGroup, value: e.target.value } }))}
                  style={{ marginLeft: 22, width: "calc(100% - 22px)", maxWidth: 380 }} />
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="prr-inline-search-btn" onClick={saveStatsConfig} disabled={savingHeader}>
                {savingHeader ? "Saving…" : "Save"}
              </button>
              <button className="prr-inline-cancel-text" onClick={() => setStatsEditMode(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* TAB: SHELVES */}
        {activeTab === "shelves" && (
          <div>
            {shelves.map((shelf) => {
              const items = booksByShelf.get(shelf.id) || [];
              const isAdding = addingToShelf === shelf.id;
              return (
                <div key={shelf.id} className="prr-shelf-section">
                  <div className="prr-section-header">
                    {editingShelfId === shelf.id ? (
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={editingShelfName}
                          onChange={(e) => setEditingShelfName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && renameShelf(shelf.id)}
                          className="prr-inline-input"
                          autoFocus
                          style={{ fontWeight: 600, fontSize: "1.05rem", marginBottom: 6 }}
                          placeholder="Shelf name"
                        />
                        <input
                          type="text"
                          value={editingShelfDesc}
                          onChange={(e) => setEditingShelfDesc(e.target.value)}
                          className="prr-inline-input"
                          style={{ fontSize: "0.85rem" }}
                          placeholder="Description (optional)"
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button className="prr-inline-search-btn" onClick={() => renameShelf(shelf.id)}>Save</button>
                          <button className="prr-inline-cancel-text" onClick={() => setEditingShelfId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="prr-section-title">
                          <span className="prr-emoji">📚</span> {shelf.name}
                          <span className="prr-section-count">
                            {items.length} {items.length === 1 ? "book" : "books"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {isOwner && (
                            <>
                              <button className="prr-shelf-action" onClick={() => moveShelf(shelf.id, "up")} title="Move up" disabled={shelves.indexOf(shelf) === 0}>↑</button>
                              <button className="prr-shelf-action" onClick={() => moveShelf(shelf.id, "down")} title="Move down" disabled={shelves.indexOf(shelf) === shelves.length - 1}>↓</button>
                              <button className="prr-shelf-action" onClick={() => { setEditingShelfId(shelf.id); setEditingShelfName(shelf.name); setEditingShelfDesc(shelf.description || ""); }} title="Edit shelf">✏️</button>
                              <button className="prr-shelf-action prr-shelf-delete" onClick={() => deleteShelf(shelf.id)} title="Delete shelf">🗑</button>
                            </>
                          )}
                          {isOwner && !isAdding && (
                            <button className="prr-inline-add-btn" onClick={() => { setAddingToShelf(shelf.id); setBookQuery(""); setBookResults([]); setEditError(""); }}>
                              + Add Book
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {shelf.description && (
                    <p style={{ color: "#4A4035", fontSize: "0.9rem", marginBottom: 16, lineHeight: 1.6 }}>
                      {shelf.description}
                    </p>
                  )}

                  {/* INLINE BOOK SEARCH */}
                  {isOwner && isAdding && (
                    <div className="prr-inline-search">
                      <div className="prr-inline-search-row">
                        <input
                          type="text"
                          value={bookQuery}
                          onChange={(e) => setBookQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && searchBooks()}
                          placeholder="Search by title or author…"
                          className="prr-inline-input"
                          autoFocus
                        />
                        <button className="prr-inline-search-btn" onClick={searchBooks} disabled={searching || !bookQuery.trim()}>
                          {searching ? "…" : "Search"}
                        </button>
                        <button className="prr-inline-cancel" onClick={() => { setAddingToShelf(null); setBookResults([]); setEditError(""); }}>✕</button>
                      </div>
                      {editError && <p style={{ color: "#c0392b", fontSize: "0.82rem", margin: "6px 0 0" }}>{editError}</p>}
                      {bookResults.length > 0 && (
                        <div className="prr-inline-results">
                          {bookResults.map((book, i) => (
                            <div key={book.google_books_id || i} className="prr-inline-result">
                              <div className="prr-inline-result-cover">
                                {book.cover_url ? <img src={book.cover_url} alt="" /> : <span>📖</span>}
                              </div>
                              <div className="prr-inline-result-info">
                                <div className="prr-inline-result-title">{book.title}</div>
                                {book.author && <div className="prr-inline-result-author">{book.author}</div>}
                              </div>
                              <button className="prr-inline-result-add" onClick={() => addBookToShelf(book, shelf.id)}>+ Add</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {items.length === 0 && !isAdding ? (
                    <p style={{ color: "#8C7F72", fontStyle: "italic" }}>
                      No books on this shelf yet.
                      {isOwner && <button className="prr-inline-add-link" onClick={() => { setAddingToShelf(shelf.id); setBookQuery(""); setBookResults([]); }}> Add some →</button>}
                    </p>
                  ) : items.length > 0 && (
                    <div className="prr-books-grid">
                      {items.map((sb) => {
                        const book = sb.books;
                        const title = book?.title || "Untitled";
                        const [c1, c2] = hashColor(title);
                        const hasCover = !!book?.cover_url;
                        return (
                          <div key={sb.id} className="prr-book-card-wrap">
                            {isOwner && (
                              <button className="prr-book-remove" onClick={() => removeBookFromShelf(sb.id)} title="Remove from shelf">✕</button>
                            )}
                            <div className="prr-book-card">
                              <div
                                className="prr-book-cover"
                                style={hasCover ? {} : { background: `linear-gradient(160deg, ${c1} 0%, ${c2} 100%)` }}
                              >
                                {hasCover ? (
                                  <img src={hiResCover(book.cover_url)} alt={title} className="prr-book-cover-img" />
                                ) : (
                                  <div className="prr-book-cover-placeholder"><span className="prr-book-cover-placeholder-icon">📖</span><span className="prr-book-cover-title">{title}</span></div>
                                )}
                              </div>
                              <div className="prr-book-card-info">
                                <div className="prr-bci-title">{title}</div>
                                {book?.author && <div className="prr-bci-author">{book.author}</div>}
                                {sb.curator_note && (
                                  <div className="prr-bci-note">"{sb.curator_note}"</div>
                                )}
                              </div>
                              <StoreLinks book={book} profile={profile} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* CREATE NEW SHELF (owner only) */}
            {isOwner && !showNewShelf && (
              <button className="prr-new-shelf-btn" onClick={() => setShowNewShelf(true)}>
                + Create New Shelf
              </button>
            )}
            {isOwner && showNewShelf && (
              <div className="prr-new-shelf-form">
                <h3 style={{ fontFamily: "'Playfair Display', serif", marginBottom: 12 }}>New Shelf</h3>
                <input
                  type="text"
                  value={newShelfName}
                  onChange={(e) => setNewShelfName(e.target.value)}
                  placeholder="Shelf name (e.g. Bedtime Favorites)"
                  className="prr-inline-input"
                  style={{ width: "100%", flex: "none", marginBottom: 8 }}
                  autoFocus
                />
                <input
                  type="text"
                  value={newShelfDesc}
                  onChange={(e) => setNewShelfDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="prr-inline-input"
                  style={{ width: "100%", flex: "none" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="prr-inline-search-btn" onClick={createNewShelf} disabled={!newShelfName.trim() || savingShelf}>
                    {savingShelf ? "Creating…" : "Create"}
                  </button>
                  <button className="prr-inline-cancel-text" onClick={() => { setShowNewShelf(false); setNewShelfName(""); setNewShelfDesc(""); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: ALL BOOKS */}
        {activeTab === "allbooks" && (
          <div className="prr-books-grid">
            {allBooks.map((sb) => {
              const book = sb.books;
              const title = book?.title || "Untitled";
              const [c1, c2] = hashColor(title);
              const hasCover = !!book?.cover_url;
              return (
                <div
                  key={sb.id}
                  className="prr-book-card"
                >
                  <div
                    className="prr-book-cover"
                    style={hasCover ? {} : { background: `linear-gradient(160deg, ${c1} 0%, ${c2} 100%)` }}
                  >
                    {hasCover ? (
                      <img src={hiResCover(book.cover_url)} alt={title} className="prr-book-cover-img" />
                    ) : (
                      <div className="prr-book-cover-placeholder"><span className="prr-book-cover-placeholder-icon">📖</span><span className="prr-book-cover-title">{title}</span></div>
                    )}
                  </div>
                  <div className="prr-book-card-info">
                    <div className="prr-bci-title">{title}</div>
                    {book?.author && <div className="prr-bci-author">{book.author}</div>}
                  </div>
                  <StoreLinks book={book} profile={profile} />
                </div>
              );
            })}
            {allBooks.length === 0 && (
              <p style={{ color: "#8C7F72", fontStyle: "italic" }}>
                No books yet.
              </p>
            )}
          </div>
        )}
      </div>

      {/* SIGNUP MODAL */}
      {showSignup && <SignupModal onClose={() => setShowSignup(false)} />}

      {/* FOOTER */}
      <div className="prr-footer">
        <p>
          Built with{" "}
          <a href="https://ourbookmark.com" target="_blank" rel="noopener noreferrer">OurBookmark</a>
          {" "}·{" "}
          <button
            onClick={() => setShowSignup(true)}
            style={{ background: "none", border: "none", color: "#C4873A", fontWeight: 500, cursor: "pointer", fontSize: "inherit", fontFamily: "inherit", padding: 0 }}
          >
            Start your own reading room
          </button>
          {" "}·{" "}
          <a href="/reading-room-faq" style={{ color: "#C4873A", fontWeight: 500, textDecoration: "none" }}>FAQ</a>
        </p>
        <p style={{ marginTop: 6, fontSize: "0.72rem", color: "#bbb" }}>
          Links on this page may be affiliate links.
        </p>
      </div>
    </div>
  );
}

/* ─── SIGNUP MODAL ─── */
function SignupModal({ onClose }) {
  const [mode, setMode] = useState("info"); // info, signup, signin
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (mode === "signup") {
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) {
        setError(err.message);
      } else {
        setSuccess("Check your email for a confirmation link!");
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
      } else {
        window.location.href = "/setup";
      }
    }
    setLoading(false);
  }

  return (
    <div className="prr-modal-overlay" onClick={onClose}>
      <div className="prr-modal" onClick={(e) => e.stopPropagation()}>
        <button className="prr-modal-close" onClick={onClose}>✕</button>

        {mode === "info" && (
          <>
            <div className="prr-modal-icon">📖</div>
            <h2 className="prr-modal-title">Create Your Reading Room</h2>
            <p className="prr-modal-desc">
              Curate shelves of your favorite books, share recommendations, and earn from affiliate links — all in a beautiful page that's uniquely yours.
            </p>
            <ul className="prr-modal-features">
              <li>✦ Build beautiful, shareable bookshelves</li>
              <li>✦ Add personal notes and recommendations</li>
              <li>✦ Earn through affiliate links</li>
              <li>✦ Get your own ourbookmark.com/@username</li>
            </ul>
            <button className="prr-modal-btn" onClick={() => setMode("signup")}>
              Create your free account
            </button>
            <p className="prr-modal-login">
              Already have an account?{" "}
              <button onClick={() => setMode("signin")} className="prr-modal-link">Sign in</button>
            </p>
          </>
        )}

        {(mode === "signup" || mode === "signin") && (
          <>
            <div className="prr-modal-icon">📖</div>
            <h2 className="prr-modal-title">
              {mode === "signup" ? "Create Your Account" : "Welcome Back"}
            </h2>
            <p className="prr-modal-desc">
              {mode === "signup"
                ? "Sign up to start building your reading room."
                : "Sign in to your reading room."}
            </p>

            <form onSubmit={handleSubmit} className="prr-modal-form">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="prr-modal-input"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="prr-modal-input"
              />

              {error && <p className="prr-modal-error">{error}</p>}
              {success && <p className="prr-modal-success">{success}</p>}

              <button type="submit" className="prr-modal-btn" disabled={loading}>
                {loading
                  ? "One moment…"
                  : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
              </button>
            </form>

            <p className="prr-modal-login">
              {mode === "signup" ? (
                <>Already have an account?{" "}
                  <button onClick={() => { setMode("signin"); setError(""); setSuccess(""); }} className="prr-modal-link">Sign in</button>
                </>
              ) : (
                <>Don't have an account?{" "}
                  <button onClick={() => { setMode("signup"); setError(""); setSuccess(""); }} className="prr-modal-link">Sign up</button>
                </>
              )}
            </p>
            <button onClick={() => setMode("info")} className="prr-modal-back">← Back</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── NAV COMPONENT ─── */
/* ─── STORE LINKS (clean pills) ─── */
function StoreLinks({ book, profile }) {
  return (
    <div className="prr-store-links">
      <a href={amazonLink(book, profile)} target="_blank" rel="noopener noreferrer" className="prr-store-btn prr-store-amazon" title="Buy on Amazon">Amazon</a>
      <a href={bookshopLink(book, profile)} target="_blank" rel="noopener noreferrer" className="prr-store-btn prr-store-bookshop" title="Buy on Bookshop.org">Bookshop</a>
      <a href={libbyLink(book)} target="_blank" rel="noopener noreferrer" className="prr-store-btn prr-store-libby" title="Borrow free from your library">📖 Library</a>
    </div>
  );
}

function Nav({ onSignup, isOwner }) {
  return (
    <nav className="prr-nav">
      <a className="prr-nav-logo" href="https://ourbookmark.com">📖 OurBookmark</a>
      {isOwner && <a href="/" className="prr-nav-back">← Back to app</a>}
      {!isOwner && <button className="prr-nav-cta" onClick={onSignup}>Start your shelf</button>}
    </nav>
  );
}

/* ─── PAGE-LEVEL INLINE STYLE ─── */
const styles = {
  page: {
    minHeight: "100vh",
    background: "#FAF7F2",
    color: "#1C1712",
    fontFamily: "'DM Sans', sans-serif",
  },
};

/* ─── SCOPED CSS ─── */
const globalCSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');

/* ── GLOBAL FONT RESET ── */
.prr-page-wrap, .prr-page-wrap * {
  font-family: 'DM Sans', sans-serif;
  box-sizing: border-box;
}
.prr-page-wrap button, .prr-page-wrap input, .prr-page-wrap textarea, .prr-page-wrap select {
  font-family: 'DM Sans', sans-serif;
}

/* ── GRAIN OVERLAY ── */
.prr-nav ~ *::selection { background: rgba(196,135,58,0.25); }

/* ── NAV ── */
.prr-nav {
  padding: 20px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0,0,0,0.07);
  background: #FDF9F4;
  position: sticky;
  top: 0;
  z-index: 100;
}
.prr-nav-logo {
  font-family: 'Playfair Display', serif;
  font-size: 1.2rem;
  color: #C4873A;
  text-decoration: none;
  letter-spacing: 0.02em;
}
.prr-nav-cta {
  background: #C4873A;
  color: white;
  border: none;
  padding: 9px 20px;
  border-radius: 100px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  text-decoration: none;
}
.prr-nav-cta:hover { background: #E8A85C; }
.prr-nav-back {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
  color: #C4873A;
  text-decoration: none;
  transition: color 0.15s;
}
.prr-nav-back:hover { color: #E8A85C; }

/* ── HERO ── */
.prr-hero {
  padding: 60px 40px 40px;
  max-width: 900px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 32px;
  align-items: end;
  animation: prrFadeUp 0.6s ease both;
}
@keyframes prrFadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.prr-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: linear-gradient(135deg, #C4873A 0%, #D4826A 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Playfair Display', serif;
  font-size: 2rem;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 4px 20px rgba(196,135,58,0.3);
}
.prr-hero-h1 {
  font-family: 'Playfair Display', serif;
  font-size: 2rem;
  font-weight: 600;
  line-height: 1.2;
  color: #1C1712;
}
.prr-hero-h1 span { color: #C4873A; }
.prr-hero-meta {
  display: flex;
  gap: 20px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.prr-hero-meta span {
  font-size: 0.85rem;
  color: #8C7F72;
  display: flex;
  align-items: center;
  gap: 5px;
}
.prr-hero-bio {
  font-size: 0.95rem;
  color: #4A4035;
  margin-top: 12px;
  line-height: 1.6;
  max-width: 480px;
}

/* ── PROFILE ACTIONS ── */
.prr-profile-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.prr-btn-share {
  background: transparent;
  color: #1C1712;
  border: 1.5px solid rgba(0,0,0,0.15);
  padding: 9px 18px;
  border-radius: 100px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}
.prr-btn-share:hover { border-color: rgba(0,0,0,0.3); }

/* ── SHELF TABS ── */
.prr-shelf-nav {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 40px;
  display: flex;
  gap: 4px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  animation: prrFadeUp 0.6s 0.1s ease both;
  overflow-x: auto;
}
.prr-shelf-tab {
  padding: 12px 20px;
  font-size: 0.88rem;
  font-weight: 500;
  color: #8C7F72;
  cursor: pointer;
  border: none;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  white-space: nowrap;
  background: none;
  font-family: 'DM Sans', sans-serif;
}
.prr-shelf-tab:hover { color: #1C1712; }
.prr-shelf-tab.active {
  color: #C4873A;
  border-bottom-color: #C4873A;
}

/* ── MAIN ── */
.prr-main {
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 40px 80px;
  animation: prrFadeUp 0.6s 0.2s ease both;
}

/* ── STATS BAR ── */
.prr-stats-bar {
  background: #FDF0E0;
  border-radius: 12px;
  padding: 16px 24px;
  display: flex;
  gap: 32px;
  margin-bottom: 40px;
  border: 1px solid rgba(196,135,58,0.15);
  flex-wrap: wrap;
}
.prr-stat { text-align: center; }
.prr-stat-num {
  font-family: 'Playfair Display', serif;
  font-size: 1.6rem;
  color: #C4873A;
  font-weight: 600;
  line-height: 1;
}
.prr-stat-label {
  font-size: 0.75rem;
  color: #8C7F72;
  margin-top: 3px;
}

/* ── SHELF SECTION ── */
.prr-shelf-section { margin-bottom: 56px; }
.prr-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 12px;
  flex-wrap: wrap;
}
.prr-section-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.35rem;
  font-weight: 600;
  color: #1C1712;
  display: flex;
  align-items: center;
  gap: 10px;
}
.prr-emoji { font-size: 1.1rem; }
.prr-section-count {
  font-size: 0.82rem;
  color: #8C7F72;
  font-weight: 400;
  font-family: 'DM Sans', sans-serif;
}

/* ── BOOKSHELF (SPINE VIEW) ── */
.prr-bookshelf-wrap {
  background: #FDF9F4;
  border-radius: 16px;
  padding: 32px 28px 20px;
  border: 1px solid rgba(0,0,0,0.06);
  box-shadow: 0 2px 16px rgba(0,0,0,0.04);
  margin-bottom: 20px;
}
.prr-shelf-wood {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  padding-bottom: 12px;
  border-bottom: 6px solid #C9B99A;
  border-radius: 0 0 2px 2px;
  min-height: 160px;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}
.prr-shelf-wood::-webkit-scrollbar { display: none; }
.prr-shelf-shadow {
  height: 8px;
  background: linear-gradient(180deg, rgba(120,90,50,0.15) 0%, transparent 100%);
  border-radius: 0 0 4px 4px;
  margin-bottom: 20px;
}

/* ── BOOK SPINE ── */
.prr-book-spine {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-origin: bottom center;
}
.prr-book-spine:hover {
  transform: translateY(-12px);
  z-index: 10;
}
.prr-spine-inner {
  width: 36px;
  border-radius: 3px 2px 2px 3px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 4px;
  box-shadow: inset -3px 0 8px rgba(0,0,0,0.15), 2px 2px 6px rgba(0,0,0,0.1);
  position: relative;
  overflow: hidden;
}
.prr-spine-inner::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  background: rgba(255,255,255,0.2);
  border-radius: 3px 0 0 3px;
}
.prr-spine-title {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 0.6rem;
  font-weight: 500;
  color: white;
  text-align: center;
  letter-spacing: 0.03em;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  max-height: 100px;
}

/* ── BOOK TOOLTIP ── */
.prr-book-tooltip {
  position: absolute;
  bottom: calc(100% + 14px);
  left: 50%;
  transform: translateX(-50%);
  background: #1C1712;
  color: white;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 0.78rem;
  width: 180px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 50;
  text-align: left;
}
.prr-book-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: #1C1712;
}
.prr-book-tooltip strong {
  display: block;
  font-size: 0.82rem;
  margin-bottom: 2px;
  font-family: 'Playfair Display', serif;
}
.prr-tt-author {
  color: rgba(255,255,255,0.6);
  font-size: 0.72rem;
  margin-bottom: 8px;
}
.prr-tooltip-buy {
  display: inline-block;
  background: #C4873A;
  color: white;
  padding: 4px 10px;
  border-radius: 100px;
  font-size: 0.7rem;
  font-weight: 500;
  margin-top: 4px;
  text-decoration: none;
}
.prr-book-spine:hover .prr-book-tooltip {
  opacity: 1;
  pointer-events: auto;
}

/* ── FEATURED / PINNED ── */
.prr-featured-card {
  background: #FDF9F4;
  border: 1px solid rgba(0,0,0,0.07);
  border-radius: 16px;
  padding: 24px;
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 20px;
  align-items: start;
  box-shadow: 0 2px 12px rgba(0,0,0,0.05);
  margin-bottom: 16px;
  transition: box-shadow 0.2s;
}
.prr-featured-card:hover { box-shadow: 0 4px 24px rgba(0,0,0,0.09); }
.prr-featured-cover {
  width: 100px;
  aspect-ratio: 2/3;
  border-radius: 8px;
  flex-shrink: 0;
  box-shadow: 3px 4px 12px rgba(0,0,0,0.15);
  display: flex;
  align-items: flex-end;
  padding: 10px;
}
.prr-featured-cover-title {
  font-family: 'Playfair Display', serif;
  font-size: 0.7rem;
  color: white;
  font-weight: 600;
  line-height: 1.3;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
}
.prr-featured-info .prr-tag {
  font-size: 0.7rem;
  font-weight: 500;
  color: #C4873A;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
}
.prr-featured-info h3 {
  font-family: 'Playfair Display', serif;
  font-size: 1.1rem;
  color: #1C1712;
  line-height: 1.3;
  margin-bottom: 3px;
}
.prr-fi-author {
  font-size: 0.82rem;
  color: #8C7F72;
  margin-bottom: 10px;
}
.prr-fi-note {
  font-size: 0.88rem;
  color: #4A4035;
  line-height: 1.6;
  margin-bottom: 14px;
  font-style: italic;
}
.prr-buy-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.prr-buy-btn {
  font-size: 0.7rem;
  padding: 4px 10px;
  border-radius: 100px;
  text-decoration: none;
  font-weight: 500;
  border: 1.5px solid;
  transition: all 0.15s;
}
.prr-amazon {
  color: #C45500;
  border-color: #C45500;
  background: transparent;
}
.prr-amazon:hover { background: #C45500; color: white; }

/* ── CARD GRID (horizontal scroll) ── */
.prr-books-grid {
  display: flex;
  overflow-x: auto;
  gap: 16px;
  padding-bottom: 8px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.prr-books-grid::-webkit-scrollbar { display: none; }
.prr-book-card {
  cursor: pointer;
  transition: transform 0.2s;
  display: block;
  flex: 0 0 110px;
  scroll-snap-align: start;
}
.prr-book-card:hover { transform: translateY(-4px); }
.prr-book-cover {
  width: 100%;
  aspect-ratio: 2/3;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 10px;
  position: relative;
  overflow: hidden;
  box-shadow: 3px 4px 16px rgba(0,0,0,0.12);
  background: #f0ebe4;
}
.prr-book-cover-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  height: 100%;
}
.prr-book-cover-placeholder-icon {
  font-size: 1.6rem;
  opacity: 0.4;
}
.prr-book-cover-title {
  font-family: 'Playfair Display', serif;
  font-size: 0.72rem;
  color: white;
  font-weight: 600;
  line-height: 1.3;
  text-shadow: 0 1px 4px rgba(0,0,0,0.3);
  text-align: center;
  max-height: 3.9em;
  overflow: hidden;
}
.prr-book-cover-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
  position: absolute;
  top: 0;
  left: 0;
  background: #f0ebe4;
}
.prr-book-card-info { margin-top: 10px; }
.prr-bci-title {
  font-size: 0.85rem;
  font-weight: 500;
  color: #1C1712;
  line-height: 1.3;
}
.prr-bci-author {
  font-size: 0.75rem;
  color: #8C7F72;
  margin-top: 2px;
}
.prr-bci-note {
  font-size: 0.75rem;
  color: #4A4035;
  font-style: italic;
  margin-top: 4px;
  line-height: 1.4;
}

/* ── STORE LINKS ── */
.prr-store-links {
  display: flex;
  gap: 5px;
  margin-top: 8px;
}
.prr-store-btn {
  padding: 4px 8px;
  border-radius: 100px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.62rem;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.15s;
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: 0.01em;
}
.prr-store-amazon {
  background: #F5EFE7;
  color: #C4873A;
  border: 1px solid rgba(196,135,58,0.2);
}
.prr-store-amazon:hover {
  background: #C4873A;
  color: white;
  border-color: #C4873A;
}
.prr-store-bookshop {
  background: #EEF2EE;
  color: #5C7A5C;
  border: 1px solid rgba(92,122,92,0.2);
}
.prr-store-bookshop:hover {
  background: #5C7A5C;
  color: white;
  border-color: #5C7A5C;
}
.prr-store-libby {
  background: #EDF1F4;
  color: #5B7E91;
  border: 1px solid rgba(91,126,145,0.2);
}
.prr-store-libby:hover {
  background: #5B7E91;
  color: white;
  border-color: #5B7E91;
}

/* ── FOOTER ── */
.prr-footer {
  text-align: center;
  padding: 40px 20px;
  border-top: 1px solid rgba(0,0,0,0.07);
  color: #8C7F72;
  font-size: 0.8rem;
}
.prr-footer a {
  color: #C4873A;
  text-decoration: none;
  font-weight: 500;
}

/* ── SIGNUP MODAL ── */
.prr-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(28,23,18,0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
  animation: prrFadeIn 0.2s ease;
}
@keyframes prrFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.prr-modal {
  background: #FDF9F4;
  border-radius: 20px;
  padding: 40px 36px;
  max-width: 420px;
  width: 100%;
  position: relative;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  text-align: center;
  animation: prrSlideUp 0.3s ease;
}
@keyframes prrSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.prr-modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 1.1rem;
  color: #8C7F72;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.15s;
}
.prr-modal-close:hover { background: rgba(0,0,0,0.06); }
.prr-modal-icon { font-size: 2.5rem; margin-bottom: 12px; }
.prr-modal-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.5rem;
  font-weight: 600;
  color: #1C1712;
  margin-bottom: 10px;
}
.prr-modal-desc {
  font-size: 0.92rem;
  color: #4A4035;
  line-height: 1.6;
  margin-bottom: 20px;
}
.prr-modal-features {
  list-style: none;
  padding: 0;
  text-align: left;
  margin-bottom: 24px;
}
.prr-modal-features li {
  font-size: 0.88rem;
  color: #4A4035;
  padding: 6px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.prr-modal-btn {
  display: inline-block;
  background: #C4873A;
  color: white;
  padding: 14px 32px;
  border-radius: 100px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.95rem;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.2s;
  width: 100%;
  text-align: center;
  box-sizing: border-box;
  border: none;
  cursor: pointer;
}
.prr-modal-btn:hover { background: #E8A85C; }
.prr-modal-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.prr-modal-login {
  margin-top: 14px;
  font-size: 0.82rem;
  color: #8C7F72;
}
.prr-modal-login a {
  color: #C4873A;
  text-decoration: none;
  font-weight: 500;
}
.prr-modal-link {
  background: none;
  border: none;
  color: #C4873A;
  font-weight: 500;
  cursor: pointer;
  font-size: inherit;
  font-family: inherit;
  padding: 0;
  text-decoration: none;
}
.prr-modal-link:hover { text-decoration: underline; }
.prr-modal-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
  text-align: left;
}
.prr-modal-input {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid rgba(0,0,0,0.12);
  border-radius: 12px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.92rem;
  background: white;
  color: #1C1712;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.prr-modal-input:focus { border-color: #C4873A; }
.prr-modal-input::placeholder { color: #8C7F72; }
.prr-modal-error {
  font-size: 0.82rem;
  color: #c0392b;
  text-align: center;
  margin: 0;
}
.prr-modal-success {
  font-size: 0.82rem;
  color: #6B8F71;
  text-align: center;
  margin: 0;
}
.prr-modal-back {
  background: none;
  border: none;
  color: #8C7F72;
  font-size: 0.82rem;
  cursor: pointer;
  margin-top: 8px;
  font-family: 'DM Sans', sans-serif;
  transition: color 0.15s;
}
.prr-modal-back:hover { color: #1C1712; }

/* ── RESPONSIVE ── */
/* ── AVATAR ── */
.prr-avatar-wrap { position: relative; }
.prr-avatar-img {
  width: 96px; height: 96px; border-radius: 50%; object-fit: cover;
  box-shadow: 0 4px 16px rgba(196,135,58,0.3);
}
.prr-avatar-edit {
  position: absolute; bottom: 0; right: 0;
  width: 28px; height: 28px; border-radius: 50%;
  background: white; border: 2px solid #FAF7F2;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  transition: transform 0.15s;
}
.prr-avatar-edit:hover { transform: scale(1.1); }

/* ── INLINE EDITING ── */
.prr-inline-add-btn {
  background: #C4873A; color: white; border: none;
  padding: 6px 16px; border-radius: 100px;
  font-size: 0.8rem; font-weight: 500; cursor: pointer;
  font-family: 'DM Sans', sans-serif; transition: background 0.15s;
}
.prr-inline-add-btn:hover { background: #E8A85C; }
.prr-inline-add-link {
  background: none; border: none; color: #C4873A;
  font-size: inherit; font-family: inherit; font-style: normal;
  cursor: pointer; font-weight: 500; margin-left: 6px;
}
.prr-inline-search {
  background: white; border: 1.5px solid rgba(0,0,0,0.1);
  border-radius: 16px; padding: 16px; margin-bottom: 20px;
}
.prr-inline-search-row {
  display: flex; gap: 8px; align-items: center;
}
.prr-inline-input {
  flex: 1; padding: 10px 14px;
  border: 1.5px solid rgba(0,0,0,0.1); border-radius: 10px;
  font-family: 'DM Sans', sans-serif; font-size: 0.9rem;
  background: #FAF7F2; color: #1C1712; outline: none;
  transition: border-color 0.2s;
}
.prr-inline-input:focus { border-color: #C4873A; }
.prr-inline-input::placeholder { color: #8C7F72; }
.prr-inline-search-btn {
  padding: 10px 18px; background: #C4873A; color: white;
  border: none; border-radius: 10px; font-size: 0.85rem;
  font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif;
  white-space: nowrap; transition: background 0.15s;
}
.prr-inline-search-btn:hover { background: #E8A85C; }
.prr-inline-search-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.prr-inline-cancel {
  background: none; border: 1px solid rgba(0,0,0,0.15);
  width: 36px; height: 36px; border-radius: 50%;
  font-size: 0.85rem; cursor: pointer; color: #8C7F72;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; flex-shrink: 0;
}
.prr-inline-cancel:hover { border-color: #c0392b; color: #c0392b; }
.prr-inline-cancel-text {
  background: none; border: none; color: #8C7F72;
  font-size: 0.88rem; font-family: 'DM Sans', sans-serif;
  cursor: pointer; padding: 8px 16px; transition: color 0.15s;
}
.prr-inline-cancel-text:hover { color: #1C1712; }
.prr-inline-results {
  display: flex; flex-direction: column; gap: 6px;
  margin-top: 12px; max-height: 280px; overflow-y: auto;
}
.prr-inline-result {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 10px;
  transition: background 0.1s;
}
.prr-inline-result:hover { background: rgba(0,0,0,0.03); }
.prr-inline-result-cover {
  width: 36px; height: 50px; flex-shrink: 0;
  border-radius: 4px; overflow: hidden;
  background: rgba(0,0,0,0.04);
  display: flex; align-items: center; justify-content: center;
}
.prr-inline-result-cover img { width: 100%; height: 100%; object-fit: cover; }
.prr-inline-result-info { flex: 1; min-width: 0; }
.prr-inline-result-title {
  font-size: 0.85rem; font-weight: 500; color: #1C1712;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.prr-inline-result-author {
  font-size: 0.73rem; color: #8C7F72; margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.prr-inline-result-add {
  background: #6B8F71; color: white; border: none;
  padding: 5px 12px; border-radius: 100px; font-size: 0.75rem;
  font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif;
  white-space: nowrap; flex-shrink: 0; transition: background 0.15s;
}
.prr-inline-result-add:hover { background: #5C7A5C; }

/* ── BOOK REMOVE ── */
.prr-book-card-wrap { position: relative; flex: 0 0 110px; scroll-snap-align: start; }
.prr-book-remove {
  position: absolute; top: -6px; right: -6px; z-index: 2;
  width: 24px; height: 24px; border-radius: 50%;
  background: rgba(0,0,0,0.6); color: white; border: 2px solid #FAF7F2;
  font-size: 0.65rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s;
}
.prr-book-card-wrap:hover .prr-book-remove { opacity: 1; }
.prr-book-remove:hover { background: #c0392b; }

/* ── NEW SHELF ── */
.prr-new-shelf-btn {
  width: 100%; padding: 16px; margin-top: 20px;
  border: 2px dashed rgba(0,0,0,0.12); border-radius: 16px;
  background: transparent; color: #C4873A;
  font-size: 0.9rem; font-weight: 500; cursor: pointer;
  font-family: 'DM Sans', sans-serif; transition: all 0.15s;
}
.prr-new-shelf-btn:hover { border-color: #C4873A; background: rgba(196,135,58,0.04); }

/* ── SHELF ACTIONS ── */
.prr-shelf-action {
  background: none;
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.72rem;
  color: #8C7F72;
  transition: all 0.15s;
  font-family: 'DM Sans', sans-serif;
}
.prr-shelf-action:hover { background: #F5EFE7; border-color: #C4873A; color: #C4873A; }
.prr-shelf-action:disabled { opacity: 0.3; cursor: default; }
.prr-shelf-action:disabled:hover { background: none; border-color: rgba(0,0,0,0.1); color: #8C7F72; }
.prr-shelf-delete:hover { background: #FEF2F2; border-color: #c0392b; color: #c0392b; }
.prr-new-shelf-form {
  background: white; border: 1.5px solid rgba(0,0,0,0.1);
  border-radius: 16px; padding: 20px; margin-top: 20px;
}

@media (max-width: 600px) {
  .prr-nav { padding: 16px 20px; }
  .prr-hero { padding: 32px 20px 24px; grid-template-columns: auto 1fr; gap: 16px; }
  .prr-avatar { width: 64px; height: 64px; font-size: 1.5rem; }
  .prr-hero-h1 { font-size: 1.4rem; }
  .prr-shelf-nav { padding: 0 20px; }
  .prr-main { padding: 28px 20px 60px; }
  .prr-featured-card { grid-template-columns: 80px 1fr; gap: 14px; }
  .prr-stats-bar { gap: 20px; padding: 14px 18px; }
  .prr-avatar-img { width: 64px; height: 64px; }
  .prr-inline-search-row { flex-wrap: wrap; }
}
`;
