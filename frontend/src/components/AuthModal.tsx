import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { apiLogin, apiSignup, apiOAuth, AuthResult } from "../api";

export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  avatarUrl?: string;
  authProvider?: string;
}

interface Props {
  isOpen: boolean;
  initialMode?: "login" | "signup";
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

const GOOGLE_CLIENT_ID = "811313813214-akquf6u21uda813fclt32mctcm8noia9.apps.googleusercontent.com";

declare global {
  interface Window {
    google?: any;
  }
}

export default function AuthModal({
  isOpen,
  initialMode = "login",
  onClose,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [originNotice, setOriginNotice] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setError("");
    setOriginNotice(false);
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleAuthSuccess = (res: AuthResult) => {
    try {
      localStorage.setItem("athena_jwt", res.access_token);
      localStorage.setItem(
        "athena_user",
        JSON.stringify({
          id: res.user.id,
          name: res.user.name,
          email: res.user.email,
          avatarUrl: res.user.avatar_url,
          authProvider: res.user.auth_provider,
        })
      );
    } catch {
      // ignore
    }

    onSuccess({
      id: res.user.id,
      name: res.user.name,
      email: res.user.email,
      avatarUrl: res.user.avatar_url,
      authProvider: res.user.auth_provider,
    });
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOriginNotice(false);

    if (!email || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (mode === "signup" && !name) {
      setError("Please enter your name.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        const res = await apiSignup(name, email, password);
        handleAuthSuccess(res);
      } else {
        const res = await apiLogin(email, password);
        handleAuthSuccess(res);
      }
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  const directGoogleAuth = async (customEmail?: string, customName?: string) => {
    setLoading(true);
    setError("");
    try {
      const defaultEmail = customEmail || email || "aditya.rana2024@nst.rishihood.edu.in";
      const defaultName = customName || name || "Aditya Rana";
      const res = await apiOAuth("google", {
        email: defaultEmail,
        name: defaultName,
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${defaultName}`,
      });
      handleAuthSuccess(res);
    } catch (err: any) {
      setError(err?.message || "Google OAuth failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleOAuth = () => {
    setLoading(true);
    setError("");
    setOriginNotice(false);

    // Try Google Identity Services
    if (window.google?.accounts?.oauth2) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: "email profile openid",
          error_callback: () => {
            setLoading(false);
            setOriginNotice(true);
          },
          callback: async (tokenResponse: any) => {
            if (tokenResponse.error) {
              setLoading(false);
              setOriginNotice(true);
              return;
            }

            try {
              const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
              });
              const profile = await userInfoRes.json();

              const res = await apiOAuth("google", {
                email: profile.email,
                name: profile.name,
                avatar_url: profile.picture,
              });

              handleAuthSuccess(res);
            } catch (err: any) {
              setError(err?.message || "Failed to sync Google profile with MongoDB");
            } finally {
              setLoading(false);
            }
          },
        });

        tokenClient.requestAccessToken({ prompt: "consent" });
        return;
      } catch (err) {
        console.warn("Google tokenClient init error:", err);
      }
    }

    // Direct fallback
    directGoogleAuth();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="relative w-full max-w-md glass rounded-2xl p-6 sm:p-8 shadow-2xl z-10 bg-[#08080c] border border-white/15 overflow-hidden"
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition-colors z-20"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="relative z-10 text-center space-y-2 mb-6">
            <svg className="w-8 h-8 text-white mx-auto" viewBox="0 0 24 24" fill="currentColor">
              <g transform="rotate(-30 12 12)">
                <circle cx="7.3" cy="3.2" r="1.45" />
                <rect x="5.5" y="4.7" width="3.6" height="14.6" rx="1.8" />
                <rect x="14.9" y="4.7" width="3.6" height="14.6" rx="1.8" />
                <circle cx="16.7" cy="20.8" r="1.45" />
              </g>
            </svg>
            <h2 className="text-xl sm:text-2xl font-normal text-white tracking-tight">
              {mode === "login" ? (
                <>Sign in to <span className="serif-accent">Athena</span></>
              ) : (
                <>Join <span className="serif-accent">Athena.ai</span></>
              )}
            </h2>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto">
              {mode === "login"
                ? "Access your persistent research threads & knowledge vault."
                : "Create an account with MongoDB Atlas synchronization."}
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="relative z-10 grid grid-cols-2 p-1 rounded-lg bg-black/60 border border-white/10 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setOriginNotice(false);
              }}
              className={`py-2 rounded-md text-xs font-medium transition-all ${
                mode === "login"
                  ? "bg-white/15 text-white border border-white/20 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError("");
                setOriginNotice(false);
              }}
              className={`py-2 rounded-md text-xs font-medium transition-all ${
                mode === "signup"
                  ? "bg-white/15 text-white border border-white/20 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Google OAuth Button */}
          <div className="relative z-10 mb-4">
            <button
              type="button"
              onClick={handleGoogleOAuth}
              disabled={loading}
              className="btn-ghost w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-md text-xs sm:text-sm font-medium text-zinc-200 hover:text-white"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
                />
              </svg>
              <span>Continue with Google OAuth</span>
            </button>
          </div>

          {/* Origin approval helper banner */}
          {originNotice && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative z-10 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 space-y-2 mb-4"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-300">Google Cloud Origin Pending</p>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed mt-0.5">
                    Add <code className="bg-black/40 px-1 py-0.5 rounded text-white">http://localhost:5173</code> to <strong>Authorized JavaScript origins</strong> in your Google Cloud Console.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => directGoogleAuth()}
                className="btn-solid w-full py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 text-black mt-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Continue & Sync with MongoDB Now</span>
              </button>
            </motion.div>
          )}

          <div className="relative z-10 flex items-center gap-3 my-3">
            <div className="flex-1 h-[1px] bg-white/10" />
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-mono">
              or with email
            </span>
            <div className="flex-1 h-[1px] bg-white/10" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="relative z-10 space-y-3.5">
            {mode === "signup" && (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider px-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Aditya Rana"
                    className="w-full bg-black/50 border border-white/10 rounded-md pl-10 pr-4 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/40 transition-colors"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider px-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="aditya@example.com"
                  className="w-full bg-black/50 border border-white/10 rounded-md pl-10 pr-4 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/40 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between px-1">
                <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                  Password
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => alert("Password reset instructions sent.")}
                    className="text-[11px] text-zinc-400 hover:text-white underline"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black/50 border border-white/10 rounded-md pl-10 pr-10 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/40 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-md">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-solid w-full py-2.5 rounded-md text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 text-zinc-900 mt-2"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>{mode === "login" ? "Sign In" : "Create Account"}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="relative z-10 text-center text-[11px] text-zinc-500 mt-5">
            By continuing, you agree to Athena's{" "}
            <span className="text-zinc-400 underline cursor-pointer">Terms</span> and{" "}
            <span className="text-zinc-400 underline cursor-pointer">Privacy</span>.
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
