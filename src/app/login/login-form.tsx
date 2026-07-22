"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { ArrowRight, KeyRound, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { CaptchaChallenge } from "@/modules/identity-access/captcha-types";
import { loginWithFallback, type LoginState } from "./actions";

const initialState: LoginState = undefined;

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginWithFallback, initialState);
  const [loadedChallenge, setLoadedChallenge] = useState<{
    requestKey: string;
    value: CaptchaChallenge;
  } | null>(null);
  const [challengeErrorState, setChallengeErrorState] = useState<{
    requestKey: string;
    message: string;
  } | null>(null);
  const [refreshSequence, setRefreshSequence] = useState(0);
  const requestKey = `${refreshSequence}:${state?.attempt ?? 0}`;
  const challenge = loadedChallenge?.requestKey === requestKey ? loadedChallenge.value : null;
  const challengeError = challengeErrorState?.requestKey === requestKey
    ? challengeErrorState.message
    : "";

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/auth/captcha", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("captcha-unavailable");
        return response.json() as Promise<CaptchaChallenge>;
      })
      .then((value) => setLoadedChallenge({ requestKey, value }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setChallengeErrorState({
          requestKey,
          message: "Verifikasi keamanan tidak dapat dimuat. Coba muat soal baru.",
        });
      });

    return () => controller.abort();
  }, [requestKey]);

  return (
    <form className="login-form" action={formAction} noValidate>
      {state?.message ? (
        <div className="alert alert-danger" role="alert" aria-labelledby="login-error-title">
          <KeyRound aria-hidden="true" size={20} />
          <div>
            <strong id="login-error-title">Tidak dapat masuk</strong>
            <p>{state.message}</p>
          </div>
        </div>
      ) : null}

      <div className="field-group">
        <label htmlFor="schoolCode">Kode sekolah</label>
        <input
          className="input"
          id="schoolCode"
          name="schoolCode"
          type="text"
          autoCapitalize="characters"
          autoComplete="organization"
          inputMode="text"
          maxLength={32}
          pattern="[A-Za-z0-9-]+"
          aria-describedby="school-code-help"
          required
        />
        <p className="field-help" id="school-code-help">
          Gunakan kode yang diberikan pengelola sekolah.
        </p>
      </div>

      <div className="field-group">
        <label htmlFor="email">Email</label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          autoCapitalize="none"
          autoComplete="username"
          maxLength={254}
          spellCheck={false}
          required
        />
      </div>

      <div className="field-group">
        <label htmlFor="password">Kata sandi</label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
        />
      </div>

      <fieldset className="captcha-fieldset" aria-describedby="captcha-help captcha-status">
        <legend>Verifikasi keamanan</legend>
        <div className="captcha-heading">
          <span><ShieldCheck aria-hidden="true" size={18} /> Soal matematika lokal</span>
          <button
            className="btn btn-secondary captcha-refresh"
            type="button"
            onClick={() => setRefreshSequence((value) => value + 1)}
            disabled={pending}
          >
            <RefreshCw aria-hidden="true" size={17} />
            Ganti soal
          </button>
        </div>

        <div className="captcha-challenge" aria-busy={!challenge && !challengeError}>
          {challenge ? (
            <Image
              className="captcha-image"
              src={challenge.imageUrl}
              alt="Soal operasi matematika dengan latar bercoret."
              width={240}
              height={88}
              unoptimized
            />
          ) : challengeError ? (
            <p className="captcha-error" role="alert">{challengeError}</p>
          ) : (
            <div className="captcha-loading" role="status">
              <LoaderCircle className="icon-spin" aria-hidden="true" size={20} />
              Menyiapkan soal…
            </div>
          )}
        </div>

        <input name="captchaId" type="hidden" value={challenge?.id ?? ""} />
        <div className="field-group">
          <label htmlFor="captchaAnswer">Hasil perhitungan</label>
          <input
            className="input captcha-answer"
            id="captchaAnswer"
            name="captchaAnswer"
            type="text"
            autoComplete="off"
            inputMode="numeric"
            maxLength={4}
            pattern="-?[0-9]{1,3}"
            disabled={!challenge || pending}
            required
          />
        </div>
        <p className="field-help" id="captcha-help">
          Hitung operasi pada gambar. Soal berlaku 5 menit dan hanya dapat digunakan sekali.
        </p>
        <p className="sr-only" id="captcha-status" aria-live="polite">
          {challenge ? "Soal verifikasi siap." : challengeError || "Soal sedang disiapkan."}
        </p>
      </fieldset>

      <div className="captcha-trap" aria-hidden="true">
        <label htmlFor="website">Jangan isi kolom ini</label>
        <input id="website" name="website" type="text" autoComplete="off" tabIndex={-1} />
      </div>

      <button
        className="btn btn-primary login-submit"
        type="submit"
        disabled={pending || !challenge}
      >
        {pending ? (
          <>
            <LoaderCircle className="icon-spin" aria-hidden="true" size={19} />
            Memeriksa akses…
          </>
        ) : (
          <>
            Masuk dengan akun fallback
            <ArrowRight aria-hidden="true" size={19} />
          </>
        )}
      </button>
    </form>
  );
}
