import Link from "next/link";

const rules = [
  {
    title: "No bullying or harassment",
    body: "Do not insult, target, threaten, humiliate, stalk, or repeatedly contact someone in a way they do not want.",
  },
  {
    title: "No threats or encouragement of harm",
    body: "Threats, intimidation, encouragement of violence, and content that puts someone at risk are not allowed.",
  },
  {
    title: "Protect personal information",
    body: "Never publish real names, phone numbers, addresses, passwords, school records, private conversations, photos, or details that could identify someone without permission.",
  },
  {
    title: "No doxxing or public accusations",
    body: "Do not reveal or attempt to uncover another student's identity. Do not use Alias to target someone or present unverified allegations as fact.",
  },
  {
    title: "Keep it appropriate and useful",
    body: "Spam, impersonation, hateful content, explicit material, and deliberate disruption do not belong here. Keep posts and comments respectful.",
  },
];

export default function RulesPage() {
  return (
    <main className="min-h-[100svh] bg-[#F3F6FA] px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[#24344D] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-3xl font-extrabold tracking-tight text-[#3B5998]">
          alias<span className="text-[#B8D2FF]">.</span>
        </Link>

        <section className="mt-6 rounded-2xl border border-[#DCE5F0] bg-white p-5 shadow-sm sm:mt-8 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6684B2]">A safer student community</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Community rules</h1>
          <p className="mt-4 text-sm leading-7 text-[#75849A]">
            Alias is for stories, confessions, questions and school-life conversations. Anonymity is not permission to hurt people. These rules apply to posts, comments and reports.
          </p>

          <div className="mt-7 space-y-5">
            {rules.map((rule, index) => (
              <div key={rule.title} className="border-b border-[#EDF0F4] pb-5 last:border-0 last:pb-0">
                <h2 className="text-base font-bold">{index + 1}. {rule.title}</h2>
                <p className="mt-2 text-sm leading-7 text-[#75849A]">{rule.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-7 rounded-xl border border-[#DCE5F0] bg-[#F7F9FC] p-4 sm:mt-8 sm:p-5">
            <h2 className="font-bold">See something unsafe?</h2>
            <p className="mt-2 text-sm leading-7 text-[#75849A]">
              Use the Report action on the post or comment and choose the closest reason. Reports are private and are visible only to authorized moderators. Do not confront the person or repost harmful material elsewhere.
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:mt-5 sm:p-5">
            <h2 className="font-bold text-amber-950">Immediate danger or urgent safety concerns</h2>
            <p className="mt-2 text-sm leading-7 text-amber-900">
              Alias is not an emergency service and is not monitored continuously. If someone may be in immediate danger, contact a trusted adult, parent, teacher or school safeguarding lead and local emergency services now. Do not wait for an in-app report to be reviewed.
            </p>
          </div>

          <h2 className="mt-8 text-base font-bold">Understand the privacy boundary</h2>
          <p className="mt-2 text-sm leading-7 text-[#75849A]">
            Other students see your nickname, not your real name, age, gender or internal account ID. Alias is pseudonymous, not completely anonymous: the service stores an internal account identifier and private profile data, and authorized operators may access records for security and moderation. Do not share information you would not want an authorized operator or service provider to process.
          </p>

          <p className="mt-8 text-xs leading-6 text-[#9AA6B6]">
            Content that violates these rules may be hidden or removed. Repeated abuse may result in loss of access to the pilot.
          </p>
          <Link href="/" className="mt-7 inline-flex min-h-10 items-center text-sm font-bold text-[#3B5998] hover:underline">← Back to Alias</Link>
        </section>
      </div>
    </main>
  );
}
