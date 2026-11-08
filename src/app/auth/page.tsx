
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type GenderChoice = "girl" | "boy";

function getSafeNextPath() {
  if (typeof window === "undefined") return "/write";

  const requestedPath = new URLSearchParams(window.location.search).get("next");
  if (
    requestedPath &&
    requestedPath.startsWith("/") &&
    !requestedPath.startsWith("//") &&
    !requestedPath.startsWith("/auth")
  ) {
    return requestedPath;
  }

  return "/write";
}

export default function AuthPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [realName, setRealName] = useState("");
  const [nickname, setNickname] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<GenderChoice | "">("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkExistingSession() {
      try {
        const supabase = createClient();
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (!active) return;

        if (sessionError) {
          setError("We couldn't check your session. Please refresh and try again.");
          setCheckingSession(false);
          return;
        }

        // No existing session is normal for a first-time visitor.
        const currentUser = sessionData.session?.user;
        if (!currentUser) {
          setCheckingSession(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("private_profiles")
          .select("user_id, real_name, nickname, age, gender")
          .eq("user_id", currentUser.id)
          .maybeSingle();

        if (!active) return;

        if (profileError) {
          setError("We couldn't check your private profile. Please refresh and try again.");
          setCheckingSession(false);
          return;
        }

        if (profile) {
          const profileIsComplete =
            profile.real_name.trim().length >= 1 &&
            profile.real_name.trim().length <= 100 &&
            profile.nickname.trim().length >= 2 &&
            profile.nickname.trim().length <= 24 &&
            typeof profile.age === "number" &&
            Number.isInteger(profile.age) &&
            profile.age >= 1 &&
            profile.age <= 120 &&
            (profile.gender === "girl" || profile.gender === "boy");

          if (profileIsComplete) {
            router.replace(getSafeNextPath());
            return;
          }

          setError("Complete all four required details to continue.");
        }

        // A missing or incomplete profile must complete onboarding, not skip it.
        setCheckingSession(false);
      } catch {
        if (active) {
          setError("We couldn't check your session. Please refresh and try again.");
          setCheckingSession(false);
        }
      }
    }

    void checkExistingSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function createPrivateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading || checkingSession) return;

    const trimmedRealName = realName.trim();
    const trimmedNickname = nickname.trim();
    const trimmedAge = age.trim();
    const parsedAge = Number(trimmedAge);

    if (!trimmedRealName || trimmedRealName.length > 100) {
      setError("Enter your real name (up to 100 characters).");
      return;
    }

    if (trimmedNickname.length < 2 || trimmedNickname.length > 24) {
      setError("Your nickname must be between 2 and 24 characters.");
      return;
    }

    if (
      !trimmedAge ||
      !Number.isInteger(parsedAge) ||
      parsedAge < 1 ||
      parsedAge > 120
    ) {
      setError("Enter your age (a whole number between 1 and 120).");
      return;
    }

    if (gender !== "girl" && gender !== "boy") {
      setError("Select your gender before continuing.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      // Reuse an existing session, or create an anonymous one for a new visitor.
      let userId: string | null = sessionData.session?.user.id ?? null;

      if (!userId) {
        const { data: anonymousData, error: signInError } =
          await supabase.auth.signInAnonymously();

        if (signInError) throw signInError;
        userId = anonymousData.user?.id ?? null;
      }

      if (!userId) {
        throw new Error("We couldn't create your anonymous session. Please try again.");
      }

      const { data: onboardingComplete, error: profileError } = await supabase.rpc(
        "complete_alias_onboarding",
        {
          p_invite_code: "",
          p_real_name: trimmedRealName,
          p_nickname: trimmedNickname,
          p_age: parsedAge,
          p_gender: gender,
        }
      );

      if (profileError) throw profileError;
      if (!onboardingComplete) {
        throw new Error("We couldn't complete onboarding. Please check your details and try again.");
      }

      router.replace(getSafeNextPath());
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong. Please try again."
      );
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100svh] items-start justify-center bg-[#F3F6FA] px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[#24344D] sm:items-center sm:px-5 sm:py-10">
      <section className="w-full max-w-md rounded-2xl border border-[#DCE5F0] bg-white p-5 shadow-sm sm:p-10">
        <Link href="/" className="text-3xl font-extrabold tracking-tight text-[#3B5998]">
          alias<span className="text-[#B8D2FF">.</span>
        </Link>

        <p className="mt-8 font-[family-name:var(--font-inter)] text-xs font-bold uppercase tracking-[0.18em] text-[#6684B2]">
          Your space. Your voice.
        </p>

        <h1 className="mt-2 font-[family-name:var(--font-inter)] text-2xl font-extrabold tracking-tight text-[#24344D] sm:text-3xl">
          Join the conversation.
        </h1>

        <p className="mt-3 text-sm leading-7 text-[#75849A]">
          Choose the name people will see on your posts; your real name stays off the public feed.
        </p>

        <div className="mt-6 rounded-xl border border-[#DCE5F0] bg-[#F7F9FC] p-4">
          <p className="text-sm font-bold text-[#34445D]">
            Your identity stays off the feed.
          </p>
          <p className="mt-2 text-xs leading-6 text-[#75849A]">
            Your real name, age and gender are stored in your private profile and are not displayed on posts. Alias project administrators can access stored profile information. Your nickname is the name shown publicly.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {checkingSession ? (
          <p className="mt-7 text-center text-sm text-[#8492A5]">
            Checking your private session...
          </p>
        ) : (
          <form onSubmit={createPrivateProfile} className="mt-7 space-y-4">
            <div>
              <label
                htmlFor="realName"
                className="mb-2 block text-xs font-bold text-[#52647D]"
              >
                REAL NAME · PRIVATE · REQUIRED
              </label>
              <input
                id="realName"
                type="text"
                value={realName}
                onChange={(event) => setRealName(event.target.value)}
                autoComplete="name"
                maxLength={100}
                required
                placeholder="Your real name"
                className="min-h-12 w-full rounded-lg border border-[#DCE5F0] px-4 py-3 text-base outline-none transition focus:border-[#3B5998] sm:text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="nickname"
                className="mb-2 block text-xs font-bold text-[#52647D]"
              >
                NICKNAME · PUBLIC · REQUIRED
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                minLength={2}
                maxLength={24}
                required
                placeholder="The name shown with your posts"
                className="min-h-12 w-full rounded-lg border border-[#DCE5F0] px-4 py-3 text-base outline-none transition focus:border-[#3B5998] sm:text-sm"
              />
              <p className="mt-1.5 text-xs text-[#91A0B4]">
                2 to 24 characters. This appears publicly.
              </p>
            </div>

            <div>
              <label
                htmlFor="age"
                className="mb-2 block text-xs font-bold text-[#52647D]"
              >
                AGE · PRIVATE · REQUIRED
              </label>
              <input
                id="age"
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                step={1}
                value={age}
                onChange={(event) => setAge(event.target.value)}
                required
                placeholder="Your age"
                className="min-h-12 w-full rounded-lg border border-[#DCE5F0] px-4 py-3 text-base outline-none transition focus:border-[#3B5998] sm:text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="gender"
                className="mb-2 block text-xs font-bold text-[#52647D]"
              >
                GENDER · PRIVATE · REQUIRED
              </label>
              <select
                id="gender"
                required
                value={gender}
                onChange={(event) =>
                  setGender(event.target.value as GenderChoice | "")
                }
                className="min-h-12 w-full rounded-lg border border-[#DCE5F0] bg-white px-4 py-3 text-base outline-none transition focus:border-[#3B5998] sm:text-sm"
              >
                <option value="" disabled>
                  Select your gender
                </option>
                <option value="girl">Girl</option>
                <option value="boy">Boy</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || checkingSession}
              className="min-h-12 w-full rounded-lg bg-[#3B5998] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#304B85] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating your private profile..." : "Continue anonymously"}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs leading-5 text-[#91A0B4]">
          No email or password for student accounts. Your nickname is public; your other details are private.
        </p>

        <Link
          href="/"
          className="mt-7 flex min-h-10 items-center justify-center text-center text-xs font-semibold text-[#718097] hover:text-[#3B5998]"
        >
          ← Back to homepage
        </Link>
      </section>
    </main>
  );
}
