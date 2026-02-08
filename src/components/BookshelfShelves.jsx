import React from "react";

function BookTile({ book, onOpen }) {
  return (
    <button className="ob-bookTile" onClick={() => onOpen?.(book)} type="button">
      <img
        className="ob-bookCover"
        style={{ objectFit: "contain", backgroundColor: "white" }}
        src={book.coverUrl}
        alt={book.title || "Book cover"}
        loading="lazy"
      />
      {book.timesRead > 1 && (
  <span className="ob-badge" aria-label={`${book.timesRead} rereads`}>
    ↻ {book.timesRead}
  </span>
)}

    </button>
  );
}

function ShelfRow({ title, subtitle, countLabel, books = [], featured = false, onOpenBook }) {
  return (
    <section className={`ob-shelfSection ${featured ? "ob-featured" : ""}`}>
      <div className="ob-shelfHeader">
        <div className="ob-shelfTitleGroup">
          <h3 className="ob-shelfTitle">{title}</h3>
          {subtitle && <p className="ob-shelfSubtitle">{subtitle}</p>}
        </div>

        {countLabel && <span className="ob-count">{countLabel}</span>}
      </div>

      <div className="ob-shelfRow" role="list">
        {books.map((book) => (
          <div role="listitem" key={book.id}>
            <BookTile book={book} onOpen={onOpenBook} />
          </div>
        ))}

        <div className="ob-shelfPlank" aria-hidden="true" />
      </div>
    </section>
  );
}

export default function BookshelfShelves({ childName, favorites = [], allBooks = [], onOpenBook }) {
  return (
    <div className="ob-bookshelfWrap">
        {favorites.length > 0 && (
      <ShelfRow
        featured
        title="Loved & Reread"
        subtitle="This month’s favorites"
        countLabel={`${favorites.length} favorite${favorites.length === 1 ? "" : "s"}`}
        books={favorites}
        onOpenBook={onOpenBook}
        />
        )}

      <ShelfRow
        title={`Everything ${childName} has read`}
        countLabel={`${allBooks.length} book${allBooks.length === 1 ? "" : "s"}`}
        books={allBooks}
        onOpenBook={onOpenBook}
      />
    </div>
  );
}
