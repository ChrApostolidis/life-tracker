// Open Library search client — called directly from the browser, never
// through our backend. No API key: Open Library's search and cover endpoints
// are free and keyless. Only the book the user actually picks gets persisted
// (as a cover URL string, not the image itself) via api.createBook.

export type BookSearchResult = {
  key: string; // e.g. "/works/OL27448W" — used only as a React key
  title: string;
  author: string | null;
  year: number | null;
  coverUrl: string | null;
};

type OpenLibraryDoc = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
};

type OpenLibrarySearchResponse = {
  docs: OpenLibraryDoc[];
};

const SEARCH_LIMIT = 8;

export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const url =
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}` +
    `&limit=${SEARCH_LIMIT}&fields=key,title,author_name,first_publish_year,cover_i`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Library search failed (HTTP ${res.status})`);

  const data = (await res.json()) as OpenLibrarySearchResponse;
  return data.docs.map((doc) => ({
    key: doc.key,
    title: doc.title,
    author: doc.author_name?.[0] ?? null,
    year: doc.first_publish_year ?? null,
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
  }));
}
