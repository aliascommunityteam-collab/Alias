"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";
import type { PostCategory, PostReaction } from "@/lib/supabase/database.types";
import { fetchGiphyByIds, type GiphyMedia } from "@/lib/giphy";

type Post = {
  id: string;
  category: PostCategory;
  content: string;
  created_at: string;
  author_nickname: string | null;
  gif_id: string | null;
};

export default function Home() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [postStats, setPostStats] = useState<Record<string, { likes: number; dislikes: number; comments: number }>>({});
  const [reactionsByPostId, setReactionsByPostId] = useState<Record<string, PostReaction | null>>({});
  const [gifMedia, setGifMedia] = useState<Record<string, GiphyMedia>>({});

  useEffect(() => {
    let active = true;
    async function loadPosts() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("posts")
          .select("id, category, content, created_at, author_nickname, gif_id")
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(50);

        if (!active) return;
        if (error) {
          setFeedError("We couldn't load the community feed. Please refresh.");
          setPosts([]);
          return;
        }
        setFeedError("");
        const loadedPosts = (data ?? []).map((post) => ({
          ...post,
          category: post.category as PostCategory,
        }));
        setPosts(loadedPosts);

        const postIds = loadedPosts.map((post) => post.id);
        if (postIds.length === 0) {
          setPostStats({});
          setReactionsByPostId({});
          setGifMedia({});
          return;
        }

        const [{ data: stats }, { data: authData }] = await Promise.all([
          supabase.rpc("get_post_reaction_stats", { p_post_ids: postIds }),
          supabase.auth.getUser(),
        ]);
        if (!active) return;

        const nextStats: Record<string, { likes: number; dislikes: number; comments: number }> = {};
        for (const item of stats ?? []) {
          nextStats[item.post_id] = {
            likes: Number(item.like_count ?? 0),
            dislikes: Number(item.dislike_count ?? 0),
            comments: Number(item.comment_count ?? 0),
          };
        }
        setPostStats(nextStats);

        if (authData.user) {
          const { data: ownReactions } = await supabase
            .from("likes")
            .select("post_id, reaction")
            .in("post_id", postIds)
            .eq("author_id", authData.user.id);

          if (active) {
            const nextReactions: Record<string, PostReaction | null> = {};
            for (const item of ownReactions ?? []) {
              nextReactions[item.post_id] = item.reaction;
            }
            setReactionsByPostId(nextReactions);
          }
        } else {
          setReactionsByPostId({});
        }

        const gifIds = loadedPosts
          .map((post) => post.gif_id)
          .filter((id): id is string => Boolean(id));

        if (gifIds.length > 0) {
          try {
            const resolvedGifs = await fetchGiphyByIds(gifIds);
            if (active) setGifMedia(resolvedGifs);
          } catch {
            // Keep the text feed available if GIPHY is temporarily unavailable.
            if (active) setGifMedia({});
          }
        } else {
          setGifMedia({});
        }
      } catch {
        if (active) {
          setFeedError("Something went wrong while loading the feed.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadPosts();
    return () => { active = false; };
  }, []);

  function openWritingFlow() {
    router.push("/auth?next=%2Fwrite");
  }

  return (
    <main className="min-h-[100svh] bg-[#F3F6FA] text-[#24344D]">
      <header className="sticky top-0 z-30 bg-[#3B5998] pt-[env(safe-area-inset-top)] text-white shadow-sm">
        <div className="mx-auto flex min-h-[64px] max-w-6xl items-center justify-between gap-2 px-3 sm:min-h-[68px] sm:gap-3 sm:px-6">
          <Link href="#top" className="shrink-0 text-2xl font-extrabold tracking-tight sm:text-3xl">
            alias<span className="text-[#B8D2FF]">.</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-3 text-xs font-semibold text-blue-100 sm:gap-6 sm:text-sm sm:font-medium">
            <a href="#feed" className="hidden transition hover:text-white sm:inline">Home</a>
            <Link href="/rules" className="transition hover:text-white">
              <span className="sm:hidden">Rules</span>
              <span className="hidden sm:inline">Community rules</span>
            </Link>
          </nav>
          <button
            type="button"
            onClick={openWritingFlow}
            className="min-h-10 shrink-0 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#3B5998] transition hover:bg-blue-50 sm:px-4 sm:py-2.5 sm:text-sm"
          >
            + Write something
          </button>
        </div>
      </header>

      <div id="top" className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
        <section className="mb-6 rounded-2xl border border-[#DCE5F0] bg-white p-5 shadow-sm sm:mb-8 sm:p-9">
          <div className="max-w-2xl">
            <p className="mb-3 font-[family-name:var(--font-inter)] text-xs font-bold uppercase tracking-[0.18em] text-[#6684B2]">
              Your space. Your voice.
            </p>
            <h1 className="font-[family-name:var(--font-inter)] text-[clamp(1.8rem,7vw,2.25rem)] font-extrabold leading-tight tracking-tight text-[#24344D] sm:text-4xl">
              Say what you<br /><span className="text-[#3B5998]">couldn&apos;t say.</span>
            </h1>
            <p className="mt-4 max-w-lg font-[family-name:var(--font-inter)] text-sm leading-7 text-[#75849A] sm:text-base">
              A space for student confessions, stories and thoughts. Browse freely. When you&apos;re ready to share, join anonymously.
            </p>
            <button type="button" onClick={openWritingFlow} className="mt-5 min-h-12 w-full rounded-lg bg-[#3B5998] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#304B85] sm:mt-6 sm:w-auto">
              Write something →
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
          <aside className="hidden lg:block">
            <div className="rounded-xl border border-[#DCE5F0] bg-white p-5 shadow-sm">
              <p className="mb-4 text-xs font-bold uppercase tracking-wider text-[#91A0B4]">Navigation</p>
              <div className="space-y-2 text-sm">
                <a href="#feed" className="flex items-center gap-3 rounded-lg bg-[#EDF2FA] px-3 py-3 font-bold text-[#3B5998]">⌂ Home</a>
                <a href="#feed" className="flex items-center gap-3 rounded-lg px-3 py-3 text-[#65758D] transition hover:bg-[#F3F6FA]">◷ Latest</a>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-[#DCE5F0] bg-white p-5 shadow-sm">
              <p className="font-[family-name:var(--font-inter)] text-sm font-bold">Community guidelines</p>
              <p className="mt-2 text-xs leading-6 text-[#8190A4]">Respect others. Never share someone&apos;s private information. Keep the community safe.</p>
              <Link href="/rules" className="mt-3 inline-block text-xs font-bold text-[#3B5998] hover:underline">Read all rules →</Link>
            </div>
          </aside>

          <section id="feed" className="min-w-0 scroll-mt-20">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-inter)] text-xl font-bold">Community feed</h2>
                <p className="mt-1 font-[family-name:var(--font-inter)] text-xs text-[#8795A8]">Newest posts appear first</p>
              </div>
              <span className="rounded-lg border border-[#DCE5F0] bg-white px-3 py-2 text-xs font-semibold text-[#3B5998]">Latest</span>
            </div>

            <div className="space-y-4">
              {loading && <div className="rounded-xl border border-[#DCE5F0] bg-white p-6 text-center text-sm text-[#8492A5] sm:p-10">Loading community posts...</div>}
              {!loading && feedError && (
                <div className="rounded-xl border border-[#DCE5F0] bg-white p-6 text-center sm:p-10">
                  <p role="alert" className="text-sm text-red-600">{feedError}</p>
                  <button type="button" onClick={() => window.location.reload()} className="mt-3 inline-flex min-h-10 items-center px-3 text-xs font-bold text-[#3B5998]">Try again</button>
                </div>
              )}
              {!loading && !feedError && posts.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#C9D6E8] bg-white p-6 text-center sm:p-10">
                  <p className="font-bold">The feed is waiting for its first post.</p>
                  <p className="mt-2 text-sm text-[#8492A5]">Be the first to share something.</p>
                  <button type="button" onClick={openWritingFlow} className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-[#3B5998] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#304B85]">Write something</button>
                </div>
              )}
              {!loading && !feedError && posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  initialLikeCount={postStats[post.id]?.likes ?? 0}
                  initialDislikeCount={postStats[post.id]?.dislikes ?? 0}
                  initialCommentCount={postStats[post.id]?.comments ?? 0}
                  initialReaction={reactionsByPostId[post.id] ?? null}
                  gif={post.gif_id ? gifMedia[post.gif_id] ?? null : null}
                />
              ))}
            </div>
          </section>

          <aside className="hidden space-y-4 lg:block">
            <div className="rounded-xl border border-[#DCE5F0] bg-white p-5 shadow-sm">
              <h3 className="font-[family-name:var(--font-inter)] text-sm font-bold">A note about Alias</h3>
              <p className="mt-3 text-xs leading-6 text-[#7F8DA1]">Your nickname is public. Your real name, age and gender are not displayed to other students. Keep conversations respectful and protect everyone&apos;s privacy.</p>
            </div>
            <div className="rounded-xl border border-[#DCE5F0] bg-white p-5 shadow-sm">
              <p className="font-[family-name:var(--font-inter)] text-xs font-bold uppercase tracking-wider text-[#91A0B4]">A little reminder</p>
              <p className="mt-3 font-[family-name:var(--font-inter)] text-sm font-semibold leading-6 text-[#3B5998]">You don&apos;t have to reveal who you are to express what you feel.</p>
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-2 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-center text-xs text-[#9AA6B6] sm:py-10">
          <span>alias. · Speak freely. Protect each other&apos;s privacy.</span>
          <Link href="/rules" className="font-semibold hover:text-[#3B5998]">Community rules</Link>
        </footer>
      </div>
    </main>
  );
}
