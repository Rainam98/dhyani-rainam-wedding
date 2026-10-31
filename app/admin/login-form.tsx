"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(login, { error: null });

  return (
    <section aria-labelledby="admin-login">
      <h2 id="admin-login">Admin sign in</h2>
      <form action={formAction} className="stack">
        <label htmlFor="admin-password">Password</label>
        <input id="admin-password" name="password" type="password" autoComplete="current-password" required />
        {state.error ? (
          <p role="alert" className="error">
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={isPending}>
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}
