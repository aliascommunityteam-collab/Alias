"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchGiphyByIds, type GiphyMedia } from "@/lib/giphy";

type ReportRow = {
  id: string;
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
};

type ReportCard = ReportRow & {
  content: string | null;
  nickname: string | null;
  contentStatus: string | null;
  gifId: string | null;
  gif: GiphyMedia | null;
};

const reasonLabels: Record<string, string> = {
  bullying_harassment: "Bullying or harassment",
  personal_information: "Personal information",
  threats: "Threats or safety concern",
  inappropriate_content: "Inappropriate content",
  spam: "Spam",
  other: "Other",
};

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [anonymousSession, setAnonymousSession] = useState(false);
  const [moderator, setModerator] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reports, setReports] = useState<ReportCard[]>([]);

  const loadReports = useCallback(async () => {
    const supabase = createClient();
    const { data, error: reportsError } = await supabase
      .from("reports")
      .select("id, post_id, comment_id, reason, details, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (reportsError) throw reportsError;

    const enriched = await Promise.all((data ?? []).map(async (report) => {
      if (report.post_id) {
        const { data: post } = await supabase
          .from("posts")
          .select("content, author_nickname, status, gif_id")
          .eq("id", report.post_id)
          .maybeSingle();

        return {
          ...report,
          content: post?.content ?? "Content unavailable",
          nickname: post?.author_nickname ?? null,
          contentStatus: post?.status ?? null,
          gifId: post?.gif_id ?? null,
        };
      }

      const { data: comment } = await supabase
        .from("comments")
        .select("content, author_nickname, status")
        .eq("id", report.comment_id ?? "")
        .maybeSingle();

      return {
        ...report,
        content: comment?.content ?? "Content unavailable",
        nickname: comment?.author_nickname ?? null,
        contentStatus: comment?.status ?? null,
        gifId: null,
      };
    }));

    const gifIds = enriched
      .map((report) => report.gifId)
      .filter((id): id is string => Boolean(id));

    let gifMap: Record<string, GiphyMedia> = {};
    if (gifIds.length > 0) {
      try {
        gifMap = await fetchGiphyByIds(gifIds);
      } catch {
        // Keep the report text visible if the GIF provider is unavailable.
      }
    }

    setReports(enriched.map((report) => ({
      ...report,
      gif: report.gifId ? gifMap[report.gifId] ?? null : null,
    })));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void supabase.auth.getUser().then(async ({ data, error: authError }) => {
      if (cancelled) return;

      if (authError || !data.user) {
        setUserId(null);
        setAnonymousSession(false);
        setModerator(false);
        setChecking(false);
        return;
      }

      setUserId(data.user.id);
      setAnonymousSession(
        Boolean((data.user as unknown as { is_anonymous?: boolean }).is_anonymous) ||
        data.user.app_metadata?.provider === "anonymous"
      );

      let moderatorStatus = false;
      try {
        const { data: isModerator, error: roleError } = await supabase.rpc("alias_is_moderator");
        moderatorStatus = !roleError && Boolean(isModerator);
      } catch {
        moderatorStatus = false;
      }

      if (cancelled) return;
      setModerator(moderatorStatus);
      setChecking(false);
    }).catch(() => {
      if (cancelled) return;
      setUserId(null);
      setAnonymousSession(false);
      setModerator(false);
      setChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!moderator) return;

    let cancelled = false;
    async function refreshReports() {
      try {
        await loadReports();
      } catch {
        if (!cancelled) {
          setError("Reports could not be loaded. Check moderator permissions.");
        }
      }
    }

    void refreshReports();
    return () => {
      cancelled = true;
    };
  }, [moderator, loadReports]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      const { data, error: authError } = await supabase.auth.getUser();

      if (authError || !data.user) {
        throw authError ?? new Error("User authentication failed.");
      }

      setUserId(data.user.id);
      setAnonymousSession(
        Boolean((data.user as unknown as { is_anonymous?: boolean }).is_anonymous) ||
        data.user.app_metadata?.provider === "anonymous"
      );

      const { data: isModerator, error: roleError } = await supabase.rpc("alias_is_moderator");
      setModerator(!roleError && Boolean(isModerator));
      setChecking(false);
    } catch {
      setError("Sign-in failed. Check the moderator account details and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUserId(null);
    setAnonymousSession(false);
    setModerator(false);
    setReports([]);
  }

  async function changeReportStatus(reportId: string, status: ReportRow["status"]) {
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.rpc("update_alias_report_status", {
        p_report_id: reportId,
        p_status: status,
      });
      if (updateError) throw updateError;
      await loadReports();
    } catch {
      setError("The report status could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function moderateContent(report: ReportCard, action: "hide" | "remove" | "restore") {
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const result = report.post_id
        ? await supabase.rpc("moderate_post", { p_post_id: report.post_id, p_action: action })
        : await supabase.rpc("moderate_comment", { p_comment_id: report.comment_id as string, p_action: action });
      if (result.error) throw result.error;
      if (!result.data) throw new Error("The content item could not be found.");
      const { error: statusError } = await supabase.rpc("update_alias_report_status", {
        p_report_id: report.id,
        p_status: action === "restore" ? "reviewing" : "resolved",
      });
      if (statusError) throw statusError;
      await loadReports();
    } catch {
      setError("The content moderation action failed. Confirm the item still exists and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function moderateReportedAuthor(reportId: string, days: number) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      const { data, error: moderationError } = await supabase.rpc(
        "moderate_reported_author",
        { p_report_id: reportId, p_days: days }
      );
      if (moderationError) throw moderationError;
      if (!data) throw new Error("The report target could not be found.");
      setNotice(days === 0 ? "Access restored for the account associated with this report." : `Access suspended for ${days} days.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The account moderation action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Clipboard access was blocked. Select and copy the text manually.");
    }
  }

  return (
    <main className="min-h-[100svh] bg-[#F3F6FA] px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[#24344D] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-3xl font-extrabold tracking-tight text-[#3B5998]">alias<span className="text-[#B8D2FF]">.</span></Link>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 sm:mt-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6684B2]">Restricted area</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Moderation</h1>
          </div>
          {moderator && <button type="button" onClick={signOut} className="min-h-10 rounded-lg border border-[#DCE5F0] bg-white px-4 py-2 text-xs font-bold text-[#52647D]">Sign out</button>}
        </div>

        {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

        {checking ? (
          <section className="mt-6 rounded-xl border border-[#DCE5F0] bg-white p-5 text-sm text-[#8492A5] sm:p-8">Checking moderator access...</section>
        ) : !userId ? (
          <section className="mt-6 rounded-2xl border border-[#DCE5F0] bg-white p-5 shadow-sm sm:p-8">
            <h2 className="text-lg font-bold">Moderator sign-in</h2>
            <p className="mt-2 text-sm leading-6 text-[#75849A]">Moderators use a separate email-and-password account. Student anonymous sessions cannot access this area.</p>
            <form onSubmit={signIn} className="mt-6 space-y-4">
              <div>
                <label htmlFor="admin-email" className="mb-1.5 block text-xs font-bold text-[#52647D]">MODERATOR EMAIL</label>
                <input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required className="min-h-12 w-full rounded-lg border border-[#DCE5F0] px-4 py-3 text-base sm:text-sm" />
              </div>
              <div>
                <label htmlFor="admin-password" className="mb-1.5 block text-xs font-bold text-[#52647D]">PASSWORD</label>
                <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="min-h-12 w-full rounded-lg border border-[#DCE5F0] px-4 py-3 text-base sm:text-sm" />
              </div>
              <button disabled={busy} className="min-h-12 w-full rounded-lg bg-[#3B5998] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "Signing in..." : "Sign in"}</button>
            </form>
          </section>
        ) : !moderator && anonymousSession ? (
          <section className="mt-6 rounded-2xl border border-[#DCE5F0] bg-white p-5 shadow-sm sm:p-8">
            <h2 className="text-lg font-bold">Student session detected</h2>
            <p className="mt-2 text-sm leading-6 text-[#75849A]">Moderation must use a separate, adult-owned email-and-password account. Do not promote an anonymous student account.</p>
            <button type="button" onClick={signOut} className="mt-5 min-h-10 w-full rounded-lg bg-[#3B5998] px-4 py-2.5 text-xs font-bold text-white sm:w-auto">Sign out and continue to moderator sign-in</button>
          </section>
        ) : !moderator ? (
          <section className="mt-6 rounded-2xl border border-[#DCE5F0] bg-white p-5 shadow-sm sm:p-8">
            <h2 className="text-lg font-bold">This account is not a moderator.</h2>
            <p className="mt-2 text-sm leading-6 text-[#75849A]">A project owner must explicitly authorize this dedicated moderator account in the private database. Only proceed after confirming that this account belongs to the responsible adult moderator.</p>
            <div className="mt-4 rounded-lg bg-[#F7F9FC] p-3 font-mono text-xs break-all">{userId}</div>
            <button type="button" onClick={() => { if (userId) void copyText(userId); }} className="mt-3 min-h-10 rounded-lg border border-[#DCE5F0] px-4 py-2 text-xs font-bold">Copy account ID</button>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">{`insert into private.alias_moderators (user_id)\nvalues ('${userId}')\non conflict (user_id) do nothing;`}</pre>
            <p className="mt-3 text-xs leading-6 text-[#8492A5]">Run this SQL in the Alias project&apos;s Supabase SQL Editor, then refresh this page.</p>
            <button type="button" onClick={signOut} className="mt-4 inline-flex min-h-10 items-center text-xs font-bold text-[#3B5998]">Sign out</button>
          </section>
        ) : (
          <>

            <section className="mt-6 rounded-2xl border border-[#DCE5F0] bg-white p-5 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Report queue</h2>
                  <p className="mt-1 text-sm text-[#75849A]">Only authorized moderators can load or act on these reports.</p>
                </div>
                <button type="button" onClick={() => loadReports().catch(() => setError("Reports could not be refreshed."))} className="min-h-10 rounded-lg border border-[#DCE5F0] px-3 py-2 text-xs font-bold">Refresh</button>
              </div>

              {reports.length === 0 ? (
                <p className="mt-6 rounded-lg bg-[#F7F9FC] p-5 text-sm text-[#8492A5]">No reports are waiting for review.</p>
              ) : (
                <div className="mt-5 space-y-4">
                  {reports.map((report) => (
                    <article key={report.id} className="min-w-0 rounded-xl border border-[#DCE5F0] p-3 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-[#3B5998]">{reasonLabels[report.reason] ?? report.reason}</p>
                          <p className="mt-1 text-[11px] text-[#9AA6B6]">{report.post_id ? "Post report" : "Comment report"} · {new Date(report.created_at).toLocaleString()}</p>
                        </div>
                        <select aria-label="Report status" value={report.status} disabled={busy} onChange={(event) => void changeReportStatus(report.id, event.target.value as ReportRow["status"])} className="min-h-10 w-full rounded-lg border border-[#DCE5F0] bg-white px-3 py-2 text-base sm:w-auto sm:text-xs">
                          <option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
                        </select>
                      </div>
                      <div className="mt-3 rounded-lg bg-[#F7F9FC] p-3">
                        <p className="text-xs font-semibold text-[#52647D]">{report.nickname || "Anonymous student"} · content status: {report.contentStatus || "unavailable"}</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#34445D]">{report.content}</p>
                        {report.gifId && (
                          report.gif ? (
                            <figure className="mt-3 overflow-hidden rounded-lg border border-[#DCE5F0] bg-white">
                              <a href={report.gif.pageUrl} target="_blank" rel="noreferrer">
                                <img
                                  src={report.gif.imageUrl}
                                  alt={report.gif.title}
                                  className="mx-auto max-h-72 w-full object-contain"
                                />
                              </a>
                              <figcaption className="px-3 py-2 text-[10px] text-[#8492A5]">
                                {report.gif.creator ? `GIF by ${report.gif.creator}` : "GIF from GIPHY"}
                                {" · "}
                                <a href={report.gif.pageUrl} target="_blank" rel="noreferrer" className="font-bold text-[#3B5998] hover:underline">View on GIPHY</a>
                              </figcaption>
                            </figure>
                          ) : (
                            <p className="mt-2 text-xs text-[#8492A5]">GIF temporarily unavailable.</p>
                          )
                        )}
                      </div>
                      {report.details && <p className="mt-3 text-sm leading-6 text-[#75849A]">Reporter&apos;s note: {report.details}</p>}
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <button type="button" disabled={busy || report.contentStatus === "hidden"} onClick={() => void moderateContent(report, "hide")} className="min-h-10 rounded-lg border border-amber-200 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-40">Hide content</button>
                        <button type="button" disabled={busy || report.contentStatus === "removed"} onClick={() => void moderateContent(report, "remove")} className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40">Remove content</button>
                        {(report.contentStatus === "hidden" || report.contentStatus === "removed") && <button type="button" disabled={busy} onClick={() => void moderateContent(report, "restore")} className="min-h-10 rounded-lg border border-[#DCE5F0] px-3 py-2 text-xs font-bold text-[#52647D] disabled:opacity-40">Restore content</button>}
                        <button type="button" disabled={busy} onClick={() => void moderateReportedAuthor(report.id, 7)} className="min-h-10 rounded-lg border border-amber-200 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-40">Suspend account · 7 days</button>
                        <button type="button" disabled={busy} onClick={() => void moderateReportedAuthor(report.id, 0)} className="min-h-10 rounded-lg border border-[#DCE5F0] px-3 py-2 text-xs font-bold text-[#52647D] disabled:opacity-40">Restore account access</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <p className="mt-6 text-xs leading-6 text-[#9AA6B6]">Moderator actions are authorized by database-side role checks. Hiding this page or its buttons is not the security boundary.</p>
        <Link href="/" className="mt-5 inline-block text-sm font-bold text-[#3B5998] hover:underline">← Back to Alias</Link>
      </div>
    </main>
  );
}
