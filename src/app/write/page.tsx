"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PostCategory } from "@/lib/supabase/database.types";
import GifPicker from "@/components/GifPicker";

export default function WritePage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [nickname, setNickname] = useState("");
  const [category, setCategory] = useState<PostCategory>("Confession");
  const [content, setContent] = useState("");
  const [gifId, setGifId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function verifySessionAndProfile() {
      try {
        const supabase = createClient();
        const { data, error: authError } = await supabase.auth.getUser();

        if (!active) return;

        if (authError || !data.user) {
          router.replace("/auth?next=%2Fwrite");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("private_profiles")
          .select("nickname")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (!active) return;

        if (profileError) {
          setError("We couldn't verify your private profile. Please refresh and try again.");
          setCheckingSession(false);
          return;
        }

        if (!profile) {
          router.replace("/auth?next=%2Fwrite");
          return;
        }

        setNickname(profile.nickname);
        setSignedIn(true);
        setCheckingSession(false);
      } catch {
        if (active) {
          setError("Something went wrong while preparing your writing space.");
          setCheckingSession(false);
        }
      }
    }

    void verifySessionAndProfile();

    return () => {
      active = false;
    };
  }, [router]);

  async function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedContent = content.trim();

    if ((!trimmedContent && !gifId) || publishing || !signedIn) return;

    setPublishing(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) {
        router.replace("/auth?next=%2Fwrite");
        return;
      }

      const { data: isSuspended, error: suspensionCheckError } = await supabase.rpc(
        "alias_user_is_suspended"
      );

      if (suspensionCheckError) {
        throw new Error("We couldn't verify your account status. Please refresh and try again.");
      }

      if (isSuspended) {
        setError("Your account is suspended. You cannot publish posts while your account is suspended.");
        setPublishing(false);
        return;
      }

      // Read the nickname from the private profile. The database policy checks it again.
      const { data: profile, error: profileError } = await supabase
        .from("private_profiles")
        .select("nickname")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        router.replace("/auth?next=%2Fwrite");
        return;
      }

      const { error: insertError } = await supabase.from("posts").insert({
        category,
        content: trimmedContent,
        gif_id: gifId,
        author_nickname: profile.nickname,
      });

      if (insertError) throw insertError;

      router.replace("/");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while publishing. Please try again."
      );
      setPublishing(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F3F6FA] text-[#3B5998]">
        <p className="font-[family-name:var(--font-inter)] text-sm font-semibold">Preparing your writing space...</p>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] bg-[#F3F6FA] px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[#24344D] sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/" className="text-3xl font-extrabold tracking-tight text-[#3B5998]">
          alias<span className="text-[#B8D2FF]">.</span>
        </Link>

        <section className="mt-6 rounded-2xl border border-[#DCE5F0] bg-white p-5 shadow-sm sm:mt-8 sm:p-9">
          <p className="font-[family-name:var(--font-inter)] text-xs font-bold uppercase tracking-[0.18em] text-[#6684B2]">
            Your space. Your voice.
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-inter)] text-2xl font-extrabold tracking-tight text-[#24344D] sm:text-3xl">
            Share your thoughts.
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-[#75849A] sm:text-sm sm:leading-7">
            Your post will appear publicly as <strong className="text-[#3B5998]">{nickname || "your nickname"}</strong>. Don&apos;t include names, phone numbers, addresses or other identifying details.
          </p>

          {error && (
            <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={publishPost} className="mt-7">
            <label htmlFor="category" className="mb-2 block text-xs font-bold text-[#52647D]">
              POST CATEGORY
            </label>
            <select
              id="category"
              value={category}
              onChange={(event) => setCategory(event.target.value as PostCategory)}
              className="mb-5 min-h-12 w-full rounded-lg border border-[#DCE5F0] bg-white px-4 py-3 text-base outline-none focus:border-[#3B5998] sm:text-sm"
            >
              <option value="Confession">Confession</option>
              <option value="Story">Story</option>
              <option value="School life">School life</option>
              <option value="Question">Question</option>
            </select>

            <label htmlFor="content" className="mb-2 block text-xs font-bold text-[#52647D]">
              YOUR THOUGHT
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={1000}
              rows={6}
              placeholder="What's on your mind?"
              className="min-h-44 w-full resize-y rounded-lg border border-[#DCE5F0] px-4 py-3 text-base leading-6 outline-none transition focus:border-[#3B5998] sm:text-sm"
              required={!gifId}
            />

            <GifPicker onChange={setGifId} />

            <div className="mt-2 flex flex-wrap items-start justify-between gap-2 text-xs text-[#9AA6B6]">
              <span>Keep it respectful. Protect everyone&apos;s privacy.</span>
              <span>{content.length}/1000</span>
            </div>

            <button
              type="submit"
              disabled={(!content.trim() && !gifId) || publishing || !signedIn}
              className="mt-6 min-h-12 w-full rounded-lg bg-[#3B5998] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#304B85] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? "Publishing..." : "Publish under my nickname"}
            </button>
          </form>

          <Link href="/" className="mt-5 flex min-h-10 items-center justify-center text-center text-xs font-semibold text-[#718097] hover:text-[#3B5998]">
            ← Back to community feed
          </Link>
        </section>
      </div>
    </main>
  );
}
