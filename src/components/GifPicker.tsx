
"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { searchGiphy, type GiphyMedia } from "@/lib/giphy";

export default function GifPicker({
  onChange,
}: {
  onChange: (gifId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GiphyMedia[]>([]);
  const [selected, setSelected] = useState<GiphyMedia | null>(null);
  const [open, setOpen] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch() {
    if (!query.trim() || searching) return;

    setSearching(true);
    setError("");
    setResults([]);

    try {
      const gifs = await searchGiphy(query);
      setResults(gifs);

      if (gifs.length === 0) {
        setError("No GIFs found. Try another search.");
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "GIF search failed. Please try again."
      );
    } finally {
      setSearching(false);
    }
  }

  function selectGif(gif: GiphyMedia) {
    setSelected(gif);
    setOpen(false);
    onChange(gif.id);
  }

  function removeGif() {
    setSelected(null);
    setResults([]);
    setOpen(true);
    onChange(null);
  }

  return (
    <section className="mt-5 rounded-xl border border-[#DCE5F0] bg-[#F7F9FC] p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-[#52647D]">
          Add a GIF
        </p>

        <span className="rounded-full bg-[#E7EEF9] px-2.5 py-1 text-[10px] font-bold text-[#3B5998]">
          G-rated only
        </span>
      </div>

      {selected && !open ? (
        <div className="mt-3">
          <div className="overflow-hidden rounded-lg bg-white">
            <img
              src={selected.imageUrl}
              alt={selected.title}
              className="max-h-56 w-full object-contain"
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <a
              href={selected.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-[#3B5998] hover:underline"
            >
              {selected.creator
                ? `GIF by ${selected.creator}`
                : "View on GIPHY"}
            </a>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="min-h-9 text-xs font-bold text-[#3B5998]"
              >
                Change
              </button>

              <button
                type="button"
                onClick={removeGif}
                className="min-h-9 text-xs font-bold text-red-600"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value.slice(0, 50))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSearch();
                }
              }}
              maxLength={50}
              placeholder="Search GIFs..."
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#DCE5F0] bg-white px-3 text-base outline-none focus:border-[#3B5998] sm:text-sm"
            />

            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={!query.trim() || searching}
              className="min-h-11 rounded-lg bg-[#3B5998] px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>

          {error && (
            <p role="status" className="mt-3 text-xs text-[#75849A]">
              {error}
            </p>
          )}

          {results.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {results.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => selectGif(gif)}
                  className="overflow-hidden rounded-lg border border-[#DCE5F0] bg-white text-left transition hover:border-[#3B5998]"
                >
                  <img
                    src={gif.imageUrl}
                    alt={gif.title}
                    loading="lazy"
                    className="h-28 w-full object-cover"
                  />

                  {gif.creator && (
                    <span className="block truncate px-2 py-1.5 text-[10px] text-[#8492A5]">
                      {gif.creator}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <a
        href="https://giphy.com"
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[#3B5998]"
      >
        Powered by GIPHY
      </a>
    </section>
  );
}
