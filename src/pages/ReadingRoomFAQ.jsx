import { useNavigate } from "react-router-dom";

export default function ReadingRoomFAQ() {
  const navigate = useNavigate();

  return (
    <div style={styles.page}>
      <style>{globalCSS}</style>

      {/* NAV */}
      <nav className="faq-nav">
        <a className="faq-nav-logo" href="https://ourbookmark.com">📖 OurBookmark</a>
      </nav>

      {/* CONTENT */}
      <div className="faq-content">
        <button className="faq-back" onClick={() => navigate(-1)}>← Back</button>

        <h1 className="faq-title">Reading Room FAQ</h1>
        <p className="faq-subtitle">Everything you need to know about sharing children's and YA book recommendations with OurBookmark Reading Rooms.</p>

        {/* WHAT IS IT */}
        <div className="faq-section">
          <h2 className="faq-section-title">What is a Reading Room?</h2>

          <div className="faq-item">
            <h3>What is an OurBookmark Reading Room?</h3>
            <p>A Reading Room is your personal, public page where you curate and share your favorite children's book recommendations. Think of it as your own mini bookshop — organized into shelves with real covers, personal notes, and direct links to buy. From board books to picture books to middle grade and YA, it's built for the books families and young readers love.</p>
          </div>

          <div className="faq-item">
            <h3>Who can create a Reading Room?</h3>
            <p>Anyone with a free OurBookmark account. Parents, teachers, librarians, book-loving teens sharing YA picks, content creators, homeschool families — anyone who wants to share children's and young adult books they love.</p>
          </div>

          <div className="faq-item">
            <h3>What does my Reading Room URL look like?</h3>
            <p>Your page lives at <strong>ourbookmark.com/@yourusername</strong>. You choose your username during setup.</p>
          </div>

          <div className="faq-item">
            <h3>Can teens create their own Reading Room?</h3>
            <p>Yes! Teens can create a Reading Room to share their favorite YA books, recommend reads to friends, or build a bookstagram-style page. It's a great way for young readers to become curators of the books they love.</p>
          </div>
        </div>

        {/* SHELVES & BOOKS */}
        <div className="faq-section">
          <h2 className="faq-section-title">Shelves & Books</h2>

          <div className="faq-item">
            <h3>How do I add books?</h3>
            <p>Click "+ Add Book" on any shelf. Search by title or author, and we'll pull in the cover and details from Google Books. One tap to add it to your shelf.</p>
          </div>

          <div className="faq-item">
            <h3>Can I create multiple shelves?</h3>
            <p>Yes! Create as many themed shelves as you want — "Bedtime Favorites," "Chapter Books for 8-Year-Olds," "Best YA Fantasy," "Baby Shower Must-Reads," whatever fits your style.</p>
          </div>

          <div className="faq-item">
            <h3>Can I add notes to my recommendations?</h3>
            <p>Yes. Each book can have a curator note — a personal comment about why you love it, what age range it's perfect for, or how your kids responded to it.</p>
          </div>

          <div className="faq-item">
            <h3>Can I remove or rearrange books?</h3>
            <p>Yes. When you're logged in and viewing your own page, hover over any book to see the remove button. You can manage everything right from your public page.</p>
          </div>
        </div>

        {/* AFFILIATE LINKS */}
        <div className="faq-section">
          <h2 className="faq-section-title">Affiliate Links & Earning</h2>

          <div className="faq-item">
            <h3>Can I earn money from my Reading Room?</h3>
            <p>Yes! If you have an Amazon Associates account, you can add your affiliate tag during setup. Every book on your page will link to Amazon with your tag, so you earn a commission when someone buys through your link.</p>
          </div>

          <div className="faq-item">
            <h3>Do I need an affiliate account?</h3>
            <p>No. Affiliate links are completely optional. Your Reading Room works great without them — it's just a bonus if you want to monetize your recommendations.</p>
          </div>

          <div className="faq-item">
            <h3>Which affiliate programs are supported?</h3>
            <p>Currently, Amazon Associates. We may add support for Bookshop.org and other programs in the future.</p>
          </div>
        </div>

        {/* SHARING */}
        <div className="faq-section">
          <h2 className="faq-section-title">Sharing & Privacy</h2>

          <div className="faq-item">
            <h3>Who can see my Reading Room?</h3>
            <p>Once published, your Reading Room is public — anyone with the link can view it. You control what shelves and books appear.</p>
          </div>

          <div className="faq-item">
            <h3>Can I share my Reading Room on social media?</h3>
            <p>Absolutely. Use the "Share shelf" button to copy your link, then paste it anywhere — Instagram bio, Facebook, blog posts, email newsletters, etc.</p>
          </div>

          <div className="faq-item">
            <h3>Is my personal information visible?</h3>
            <p>Only what you choose to share: your display name, bio, and avatar. Your email and account details are never shown publicly.</p>
          </div>
        </div>

        {/* OURBOOKMARK TRACKER */}
        <div className="faq-section">
          <h2 className="faq-section-title">The OurBookmark Reading Tracker</h2>

          <div className="faq-item">
            <h3>Is there more to OurBookmark than Reading Rooms?</h3>
            <p>Yes! OurBookmark is also a full family reading tracker. Log reading sessions in seconds with voice input, track progress for every child from baby's first board book through middle school, set weekly reading goals, and watch streaks grow.</p>
          </div>

          <div className="faq-item">
            <h3>Can I generate reports for school?</h3>
            <p>Absolutely. OurBookmark generates clean, school-ready PDF reports you can hand to teachers, submit for reading programs, or keep for homeschool records. No re-logging — your reading history is always ready to export.</p>
          </div>

          <div className="faq-item">
            <h3>Can I track multiple children?</h3>
            <p>Yes — unlimited children per household, always free. Each child gets their own progress dashboard, reading streak, and book history.</p>
          </div>

          <div className="faq-item">
            <h3>How do I get started with the tracker?</h3>
            <p>Visit <a href="https://ourbookmark.com" style={{ color: "#C4873A", fontWeight: 500, textDecoration: "none" }}>ourbookmark.com</a> and create a free account. Setup takes under 2 minutes — add your kids, log your first story, and you're off.</p>
          </div>
        </div>

        {/* GETTING STARTED */}
        <div className="faq-section">
          <h2 className="faq-section-title">Getting Started</h2>

          <div className="faq-item">
            <h3>How long does setup take?</h3>
            <p>About 2 minutes. Choose a username, name your first shelf, search and add a few books, and you're live.</p>
          </div>

          <div className="faq-item">
            <h3>Is it free?</h3>
            <p>Yes. Reading Rooms are free to create and use. No hidden fees, no premium tiers required.</p>
          </div>

          <div className="faq-item">
            <h3>Can I edit my Reading Room after publishing?</h3>
            <p>Yes. When you're logged in and visit your own page, you can add books, create shelves, remove books, and update your avatar — all inline, no separate dashboard needed.</p>
          </div>
        </div>

        {/* CTA */}
        <div className="faq-cta">
          <h2>Ready to share your favorite children's books?</h2>
          <a href="/setup" className="faq-cta-btn">Create Your Reading Room</a>
        </div>
      </div>

      {/* FOOTER */}
      <div className="faq-footer">
        <p>
          Built with{" "}
          <a href="https://ourbookmark.com">OurBookmark</a>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#FAF7F2",
    color: "#1C1712",
    fontFamily: "'DM Sans', sans-serif",
  },
};

const globalCSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');

.faq-nav {
  padding: 20px 40px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.faq-nav-logo {
  font-family: 'Playfair Display', serif;
  font-size: 1.1rem;
  font-weight: 600;
  color: #C4873A;
  text-decoration: none;
}

.faq-content {
  max-width: 680px;
  margin: 0 auto;
  padding: 40px 24px 60px;
}

.faq-back {
  background: none;
  border: none;
  color: #C4873A;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  padding: 0;
  margin-bottom: 24px;
  display: inline-block;
}
.faq-back:hover { color: #E8A85C; }

.faq-title {
  font-family: 'Playfair Display', serif;
  font-size: 2.2rem;
  font-weight: 600;
  color: #1C1712;
  margin-bottom: 8px;
}
.faq-subtitle {
  color: #8C7F72;
  font-size: 1rem;
  margin-bottom: 40px;
  line-height: 1.6;
}

.faq-section {
  margin-bottom: 36px;
}
.faq-section-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.3rem;
  font-weight: 600;
  color: #C4873A;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(196,135,58,0.2);
}

.faq-item {
  margin-bottom: 20px;
}
.faq-item h3 {
  font-size: 0.95rem;
  font-weight: 500;
  color: #1C1712;
  margin-bottom: 6px;
}
.faq-item p {
  font-size: 0.88rem;
  color: #4A4035;
  line-height: 1.65;
}

.faq-cta {
  text-align: center;
  margin-top: 48px;
  padding: 36px 24px;
  background: white;
  border-radius: 20px;
  border: 1.5px solid rgba(0,0,0,0.06);
}
.faq-cta h2 {
  font-family: 'Playfair Display', serif;
  font-size: 1.4rem;
  font-weight: 600;
  color: #1C1712;
  margin-bottom: 16px;
}
.faq-cta-btn {
  display: inline-block;
  background: #C4873A;
  color: white;
  padding: 12px 32px;
  border-radius: 100px;
  font-size: 0.95rem;
  font-weight: 500;
  text-decoration: none;
  font-family: 'DM Sans', sans-serif;
  transition: background 0.15s;
}
.faq-cta-btn:hover { background: #E8A85C; }

.faq-footer {
  text-align: center;
  padding: 24px;
  font-size: 0.8rem;
  color: #8C7F72;
  border-top: 1px solid rgba(0,0,0,0.06);
}
.faq-footer a {
  color: #C4873A;
  text-decoration: none;
  font-weight: 500;
}

@media (max-width: 600px) {
  .faq-nav { padding: 16px 20px; }
  .faq-content { padding: 28px 20px 48px; }
  .faq-title { font-size: 1.7rem; }
}
`;
