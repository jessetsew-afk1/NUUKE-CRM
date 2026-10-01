import { useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { Eye, EyeOff, Lock, Mail, MousePointer2 } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { Button, Input } from '@/ui/kit';
import { Logo } from '@/shell/Logo';
import { OrbCanvas, type OrbHandle } from '@/scene/OrbCanvas';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const shake = useAnimationControls();
  const orb = useRef<OrbHandle>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    orb.current?.charge(true);
    try {
      await signIn(email, password, {
        beforeEnter: async () => {
          setLeaving(true);
          await orb.current?.warp();
        },
      });
    } catch (err) {
      setLeaving(false);
      orb.current?.error();
      setError((err as Error).message);
      void shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.45 } });
    } finally {
      setBusy(false);
      orb.current?.charge(false);
    }
  };

  const ripple = () => orb.current?.ripple();

  return (
    <>
      <OrbCanvas ref={orb} />

      <motion.div
        className="pointer-events-none relative z-10 grid min-h-dvh lg:grid-cols-[1.15fr_1fr]"
        animate={{ opacity: leaving ? 0 : 1, scale: leaving ? 1.04 : 1 }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      >
        <div className="hidden flex-col justify-between p-12 lg:flex">
          <Logo className="h-7 self-start" />
          <motion.h1
            initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, delay: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="max-w-[600px] text-[64px] font-black leading-[0.98] tracking-[-0.045em] drop-shadow-[0_2px_24px_rgba(255,255,255,0.25)] dark:drop-shadow-[0_2px_24px_rgba(0,0,0,0.5)] xl:text-[76px]"
          >
            Where the whole studio <span className="bg-gradient-to-r from-iris via-sky to-mint bg-clip-text text-transparent">gets things done.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.8 }}
            className="text-2 flex items-center gap-2 text-[13px] font-semibold"
          >
            <MousePointer2 className="size-4" /> Drag to spin the crew · tap an agent to say hi
          </motion.p>
        </div>

        <div className="flex items-end justify-center p-5 pb-8 sm:items-center lg:pb-5">
          <motion.form
            animate={shake}
            onSubmit={submit}
            onKeyDown={ripple}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.2 }}
            className="glass-strong pointer-events-auto w-full max-w-[420px] rounded-[34px] p-8 sm:p-10"
          >
            <div className="mb-6 lg:hidden">
              <Logo className="h-6" />
            </div>
            <h2 className="text-[28px] font-extrabold">Sign in</h2>
            <p className="text-2 mt-1 text-[14px]">Use the email and password your admin gave you.</p>

            <div className="mt-7 space-y-4">
              <Input
                label="Email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@nuuke.com"
                leading={<Mail className="size-4" />}
                className="[&_.field]:h-12"
              />
              <div>
                <Input
                  label="Password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  leading={<Lock className="size-4" />}
                  className="[&_.field]:h-12 [&_.field]:pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="text-3 relative float-right -mt-[38px] mr-3 hover:text-[color:var(--text)]"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl bg-bad/12 px-4 py-3 text-[13px] font-semibold text-bad">
                {error}
              </motion.p>
            )}

            <Button type="submit" variant="primary" size="lg" block loading={busy} className="mt-7">
              Sign in
            </Button>
            <p className="text-3 mt-5 text-center text-[13px]">Forgot your password? Your admin can reset it.</p>
          </motion.form>
        </div>
      </motion.div>
    </>
  );
}
