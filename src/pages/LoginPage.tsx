import { useMemo, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { Agent } from '@/agent/Agent';
import { agentFromSeed } from '@/agent/catalog';
import { Button, Input } from '@/ui/kit';
import { Logo } from '@/shell/Logo';

const CREW = ['closer', 'pixel', 'sprint', 'pitch', 'deploy'];

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shake = useAnimationControls();
  const crew = useMemo(
    () => CREW.map((s, i) => ({ ...agentFromSeed(s), hat: ['headset', 'beanie', 'none', 'cap', 'none'][i], held: ['phone', 'pencil', 'laptop', 'coffee', 'none'][i] })),
    [],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError((err as Error).message);
      void shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.45 } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative z-10 grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between p-12 lg:flex">
        <Logo className="h-7 self-start" />
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
            className="max-w-[560px] text-[56px] font-black leading-[1.02] tracking-[-0.04em]"
          >
            Where the whole studio <span className="bg-gradient-to-r from-iris via-sky to-mint bg-clip-text text-transparent">gets things done.</span>
          </motion.h1>
          <p className="text-2 mt-5 max-w-[460px] text-[17px]">
            Dial, design, ship and report from one place — with a little agent by your side.
          </p>
          <div className="mt-10 flex items-end gap-3">
            {crew.map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 200, damping: 18 }}
              >
                <Agent config={c} size={i === 2 ? 118 : 92} mood={i === 2 ? 'wave' : 'idle'} />
              </motion.div>
            ))}
          </div>
        </div>
        <p className="text-3 text-[13px]">© {new Date().getFullYear()} NUUKE</p>
      </div>

      <div className="flex items-center justify-center p-5">
        <motion.form
          animate={shake}
          onSubmit={submit}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 24 }}
          className="glass-strong w-full max-w-[420px] rounded-[34px] p-8 sm:p-10"
        >
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Logo className="h-6" />
            <Agent config={crew[2]} size={56} mood="wave" />
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
    </div>
  );
}
