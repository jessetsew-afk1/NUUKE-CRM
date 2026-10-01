import { useAuth } from '@/app/auth';
import { Button, Panel } from '@/ui/kit';
import { Logo } from '@/shell/Logo';

/** Shown when the app cannot run yet: missing configuration, or a login with no profile. */
export default function SetupPage({ noProfile, inactive }: { noProfile?: boolean; inactive?: boolean }) {
  const { signOut } = useAuth();
  return (
    <div className="relative z-10 grid min-h-dvh place-items-center p-5">
      <Panel strong className="w-full max-w-[560px] !p-9">
        <Logo className="h-6" />
        {inactive ? (
          <>
            <h1 className="mt-8 text-2xl font-extrabold">This login has been switched off</h1>
            <p className="text-2 mt-2">Talk to your admin if you think this is a mistake.</p>
            <Button className="mt-6" variant="primary" onClick={() => void signOut()}>Sign out</Button>
          </>
        ) : noProfile ? (
          <>
            <h1 className="mt-8 text-2xl font-extrabold">Your account is not set up yet</h1>
            <p className="text-2 mt-2">
              You signed in, but there is no NUUKE profile for this login. If you are setting up the company for the first time,
              open the Supabase SQL editor and run:
            </p>
            <pre className="fill mt-4 overflow-x-auto rounded-2xl p-4 font-mono text-[13px]">select public.bootstrap_admin('you@company.com', 'Your Name');</pre>
            <p className="text-2 mt-3">Otherwise, ask your admin to create your account from Team &amp; access.</p>
            <Button className="mt-6" variant="primary" onClick={() => void signOut()}>Sign out</Button>
          </>
        ) : (
          <>
            <h1 className="mt-8 text-2xl font-extrabold">Connect the database</h1>
            <p className="text-2 mt-2">
              This deployment does not know which Supabase project to use yet. In Netlify, open <b>Site configuration → Environment
              variables</b> and add:
            </p>
            <ul className="fill mt-4 space-y-1 rounded-2xl p-4 font-mono text-[13px]">
              <li>VITE_SUPABASE_URL</li>
              <li>VITE_SUPABASE_PUBLISHABLE_KEY</li>
              <li>SUPABASE_URL</li>
              <li>SUPABASE_SECRET_KEY</li>
            </ul>
            <p className="text-2 mt-3">Then trigger a new deploy. The README has the full walkthrough.</p>
          </>
        )}
      </Panel>
    </div>
  );
}
