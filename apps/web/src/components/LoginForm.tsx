import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { ApiError, login, type SessionInfo } from '../api'
import { useText } from '../i18n'
import { Icon } from './Icon'

type LoginValues = {
  username: string
  password: string
}

export function LoginForm({ onLogin }: { onLogin: (session: SessionInfo) => void }) {
  const { text } = useText()
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginValues>({
    defaultValues: { username: 'admin', password: '' },
  })

  async function submit(values: LoginValues) {
    setError('')
    try {
      onLogin(await login(values.username.trim(), values.password))
    } catch (error) {
      setError(error instanceof ApiError ? error.message : text('loginFailed'))
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">
          <Icon name="transfer" size={34} />
        </div>
        <h1 id="login-title">{text('appName')}</h1>
        <p className="muted login-note">{text('loginText')}</p>
        <form onSubmit={(event) => void handleSubmit(submit)(event)}>
          <label>
            <span>{text('username')}</span>
            <input autoComplete="username" {...register('username', { required: true })} />
          </label>
          <label>
            <span>{text('password')}</span>
            <input
              type="password"
              autoComplete="current-password"
              {...register('password', { required: true })}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button full-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? text('signingIn') : text('signIn')}
          </button>
        </form>
      </section>
    </main>
  )
}
