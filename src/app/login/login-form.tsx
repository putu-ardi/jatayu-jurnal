"use client";

import { useActionState } from "react";
import { ArrowRight, KeyRound, LoaderCircle } from "lucide-react";
import { loginWithFallback, type LoginState } from "./actions";

const initialState: LoginState = undefined;

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginWithFallback, initialState);

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

      <button className="btn btn-primary login-submit" type="submit" disabled={pending}>
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
