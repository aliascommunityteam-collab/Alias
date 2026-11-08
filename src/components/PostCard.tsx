"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PostReaction, ReportReason } from "@/lib/supabase/database.types";
import type { GiphyMedia } from "@/lib/giphy";

type Post = {
  id: string;
  category: string;
  content: string;
  created_at: string;
  author_nickname: string | null;
  gif_id: string | null;
};

type Comment = {
  id: string;
  post_id: string;
  content: string;
  created_at: string;
  author_nickname: string | null;
};

type ReportTarget = { type: "post" | "comment"; id: string } | null;

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "bullying_harassment", label: "Bullying or harassment" },
  { value: "personal_information", label: "Sharing private information" },
  { value: "threats", label: "Threats or safety concern" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
];

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function PostCard({
  post,
  initialLikeCount,
  initialDislikeCount,
  initialCommentCount,
  initialReaction,
  gif,
}: {
  post: Post;
  initialLikeCount: number;
  initialDislikeCount: number;
  initialCommentCount: number;
  initialReaction: PostReaction | null;
  gif: GiphyMedia | null;
}) {
  const router = useRouter();
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [dislikeCount, setDislikeCount] = useState(initialDislikeCount);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [reaction, setReaction] = useState<PostReaction | null>(initialReaction);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("bullying_harassment");
  const [reportDetails, setReportDetails] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");


  const refreshStats = useCallback(async () => {
    const supabase = createClient();
    const { data, error: statsError } = await supabase.rpc("get_post_reaction_stats", {
      p_post_ids: [post.id],
    });
    if (statsError) {
      setError("Engagement counts are temporarily unavailable.");
      return;
    }
    const stats = data?.[0];
    setLikeCount(Number(stats?.like_count ?? 0));
    setDislikeCount(Number(stats?.dislike_count ?? 0));
    setCommentCount(Number(stats?.comment_count ?? 0));
  }, [post.id]);

  async function getOnboardedUser() {
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      router.push("/auth?next=%2F");
      return null;
    }

    const isAnonymous =
      Boolean((authData.user as unknown as { is_anonymous?: boolean }).is_anonymous) ||
      authData.user.app_metadata?.provider === "anonymous";
    if (!isAnonymous) {
      setError("Use an anonymous student session to interact with community posts.");
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from("private_profiles")
      .select("nickname")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      router.push("/auth?next=%2F");
      return null;
    }

    const { data: invited, error: inviteError } = await supabase.rpc(
      "alias_has_active_invite"
    );
    if (inviteError || !invited) {
      setError("Complete private onboarding before interacting with community posts.");
      return null;
    }

    return { supabase, userId: authData.user.id };
  }

  async function toggleReaction(nextReaction: PostReaction) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const context = await getOnboardedUser();
      if (!context) return;

      const { data, error: reactionError } = await context.supabase.rpc(
        "toggle_alias_post_reaction",
        {
          p_post_id: post.id,
          p_reaction: nextReaction,
        }
      );

      if (reactionError) throw reactionError;

      setReaction(data ?? null);
      await refreshStats();
    } catch {
      setError("We couldn't update your reaction. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function loadComments() {
    setCommentsLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("comments")
        .select("id, post_id, content, created_at, author_nickname")
        .eq("post_id", post.id)
        .eq("status", "published")
        .order("created_at", { ascending: true })
        .limit(100);
      if (loadError) throw loadError;
      setComments(data ?? []);
    } catch {
      setError("Comments couldn't be loaded. Please try again.");
    } finally {
      setCommentsLoading(false);
    }
  }

  async function toggleComments() {
    const nextOpen = !commentsOpen;
    setCommentsOpen(nextOpen);
    if (nextOpen) await loadComments();
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = commentText.trim();
    if (!content || content.length > 1000 || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const context = await getOnboardedUser();
      if (!context) return;
      const { error: insertError } = await context.supabase
        .from("comments")
        .insert({ post_id: post.id, content });
      if (insertError) throw insertError;
      setCommentText("");
      await loadComments();
      await refreshStats();
      setNotice("Comment posted.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "We couldn't post your comment. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportTarget || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const context = await getOnboardedUser();
      if (!context) return;
      const { error: reportError } = await context.supabase.from("reports").insert({
        post_id: reportTarget.type === "post" ? post.id : null,
        comment_id: reportTarget.type === "comment" ? reportTarget.id : null,
        reason: reportReason,
        details: reportDetails.trim() || null,
      });
      if (reportError) {
        if (reportError.message.toLowerCase().includes("duplicate")) {
          throw new Error("You've already reported this content.");
        }
        throw reportError;
      }
      setReportTarget(null);
      setReportDetails("");
      setNotice("Report submitted. Thank you for helping keep Alias safer.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "We couldn't submit your report. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  const displayName = post.author_nickname?.trim() || "Anonymous student";

  return (
    <article className="min-w-0 rounded-2xl border border-[#DCE5F0] bg-white p-4 shadow-sm transition hover:shadow-md sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E7EEF9] text-sm font-extrabold text-[#3B5998]">
            {displayName.charAt(0).toUpperCase() || "A"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#34445D]">{displayName}</p>
            <p className="mt-0.5 text-xs text-[#9AA6B6]">{formatTime(post.created_at)}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[#EDF2FA] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#5272A4]">
          {post.category}
        </span>
      </div>

      {post.gif_id && (
        gif ? (
          <figure className="mt-4 overflow-hidden rounded-xl border border-[#DCE5F0] bg-[#F7F9FC]">
            <a href={gif.pageUrl} target="_blank" rel="noreferrer">
              <img
                src={gif.imageUrl}
                alt={gif.title}
                loading="lazy"
                className="mx-auto max-h-[420px] w-full object-contain"
              />
            </a>
            <figcaption className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[10px] text-[#8492A5]">
              <span>{gif.creator ? `GIF by ${gif.creator}` : "GIF from GIPHY"}</span>
              <a href={gif.pageUrl} target="_blank" rel="noreferrer" className="font-bold text-[#3B5998] hover:underline">
                View on GIPHY
              </a>
            </figcaption>
          </figure>
        ) : (
          <div className="mt-4 rounded-lg bg-[#F7F9FC] p-4 text-center text-xs text-[#8492A5]">
            GIF temporarily unavailable.
          </div>
        )
      )}

      {post.content && (
        <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[#4B5C74] sm:text-sm">{post.content}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EDF0F4] pt-3 sm:mt-5 sm:gap-x-5 sm:gap-y-2 sm:pt-4">
        <button
          type="button"
          onClick={() => void toggleReaction("like")}
          disabled={busy}
          aria-pressed={reaction === "like"}
          className={`inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-semibold transition ${reaction === "like" ? "text-[#3B5998]" : "text-[#8492A5] hover:text-[#3B5998]"}`}
        >
          {reaction === "like" ? "♥" : "♡"} {likeCount} {likeCount === 1 ? "like" : "likes"}
        </button>
        <button
          type="button"
          onClick={() => void toggleReaction("dislike")}
          disabled={busy}
          aria-pressed={reaction === "dislike"}
          className={`inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-semibold transition ${reaction === "dislike" ? "text-red-600" : "text-[#8492A5] hover:text-red-600"}`}
        >
          👎 {dislikeCount} {dislikeCount === 1 ? "dislike" : "dislikes"}
        </button>
        <button
          type="button"
          onClick={toggleComments}
          className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-semibold text-[#8492A5] transition hover:text-[#3B5998]"
        >
          {commentsOpen ? "Hide comments" : "Comments"} · {commentCount}
        </button>
        <button
          type="button"
          onClick={() => {
            setReportTarget({ type: "post", id: post.id });
            setError("");
            setNotice("");
          }}
          className="ml-auto inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-semibold text-[#8492A5] transition hover:text-red-600"
        >
          Report
        </button>
      </div>
      {commentsOpen && (
        <section className="mt-4 border-t border-[#EDF0F4] pt-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8492A5]">Comments</h3>
          {commentsLoading ? (
            <p className="py-3 text-sm text-[#8492A5]">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="py-3 text-sm text-[#8492A5]">No comments yet. Keep it kind.</p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="rounded-lg bg-[#F7F9FC] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#34445D]">
                        {comment.author_nickname?.trim() || "Anonymous student"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[#9AA6B6]">{formatTime(comment.created_at)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReportTarget({ type: "comment", id: comment.id });
                        setError("");
                        setNotice("");
                      }}
                      className="inline-flex min-h-9 shrink-0 items-center px-2 text-[11px] font-semibold text-[#9AA6B6] hover:text-red-600"
                    >
                      Report
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#4B5C74]">{comment.content}</p>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={submitComment} className="mt-4">
            <label htmlFor={`comment-${post.id}`} className="sr-only">Write a comment</label>
            <textarea
              id={`comment-${post.id}`}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Write a thoughtful comment..."
              className="min-h-12 w-full resize-y rounded-lg border border-[#DCE5F0] px-3 py-2.5 text-base leading-6 outline-none focus:border-[#3B5998] sm:text-sm"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-[#9AA6B6]">{commentText.length}/1000</span>
              <button
                type="submit"
                disabled={!commentText.trim() || busy}
                className="min-h-10 rounded-lg bg-[#3B5998] px-4 py-2 text-xs font-bold text-white hover:bg-[#304B85] disabled:opacity-50"
              >
                {busy ? "Posting..." : "Post comment"}
              </button>
            </div>
          </form>
        </section>
      )}

      {reportTarget && (
        <form onSubmit={submitReport} className="mt-4 rounded-xl border border-red-100 bg-red-50/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[#34445D]">Report {reportTarget.type}</h3>
            <button type="button" onClick={() => setReportTarget(null)} className="inline-flex min-h-10 items-center px-2 text-xs font-semibold text-[#8492A5] hover:text-[#34445D]">Cancel</button>
          </div>
          <label htmlFor={`reason-${post.id}`} className="mb-1.5 mt-3 block text-xs font-semibold text-[#52647D]">REASON</label>
          <select
            id={`reason-${post.id}`}
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value as ReportReason)}
            className="min-h-12 w-full rounded-lg border border-[#DCE5F0] bg-white px-3 py-2.5 text-base sm:text-sm"
          >
            {REPORT_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
          </select>
          <label htmlFor={`details-${post.id}`} className="mb-1.5 mt-3 block text-xs font-semibold text-[#52647D]">DETAILS · OPTIONAL</label>
          <textarea
            id={`details-${post.id}`}
            value={reportDetails}
            onChange={(event) => setReportDetails(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Add context (up to 500 characters)."
            className="min-h-12 w-full resize-y rounded-lg border border-[#DCE5F0] bg-white px-3 py-2.5 text-base sm:text-sm"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#9AA6B6]">{reportDetails.length}/500</span>
            <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-red-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50">
              {busy ? "Submitting..." : "Submit report"}
            </button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 text-xs text-emerald-700">{notice}</p>}
    </article>
  );
}
