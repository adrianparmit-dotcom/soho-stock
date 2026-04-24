// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BigButton } from '@/components/ui/BigButton';
import { LogIn } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [modoEmail, setModoEmail] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setError('');
    setLoadingGoogle(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) {
      setError(error.message);
      setLoadingGoogle(false);
    }
  };

  const handleEmailLogin = async () => {
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/');
    router.refresh();
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-accent/10 border border-accent/30 mb-4">
            <span className="text-3xl font-black text-accent">S</span>
          </div>
          <h1 className="text-2xl font-bold">SOHO Stock</h1>
          <p className="text-neutral-400 text-sm mt-1">Ingresá con tu cuenta</p>
        </div>

        {/* Botón Google */}
        <button
          onClick={handleGoogleLogin}
          disabled={loadingGoogle}
          className="w-full bg-white hover:bg-neutral-100 text-black font-semibold px-6 py-4 rounded-2xl transition active:scale-[0.98] disabled:opacity-50 inline-flex items-center justify-center gap-3 shadow-lg"
        >
          {loadingGoogle ? (
            <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          Continuar con Google
        </button>

        {/* Toggle email */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-border"></div>
          <span className="text-xs text-neutral-500">o</span>
          <div className="flex-1 h-px bg-border"></div>
        </div>

        {!modoEmail ? (
          <button
            onClick={() => setModoEmail(true)}
            className="w-full text-sm text-neutral-400 hover:text-neutral-200 py-2"
          >
            Ingresar con email y contraseña
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full bg-bg-card border border-border rounded-xl px-4 py-3.5 text-base focus:outline-none focus:border-accent"
                placeholder="vos@soho.com.ar"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEmailLogin()}
                autoComplete="current-password"
                className="w-full bg-bg-card border border-border rounded-xl px-4 py-3.5 text-base focus:outline-none focus:border-accent"
              />
            </div>

            <BigButton
              onClick={handleEmailLogin}
              loading={loading}
              size="lg"
              className="w-full"
              icon={<LogIn size={18} />}
            >
              Ingresar
            </BigButton>

            <button
              onClick={() => setModoEmail(false)}
              className="w-full text-xs text-neutral-500 hover:text-neutral-300 py-1"
            >
              Volver a Google
            </button>
          </div>
        )}

        {error && (
          <div className="bg-danger/10 border border-danger/40 text-danger rounded-xl px-4 py-3 text-sm mt-4">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
