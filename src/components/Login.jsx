import React, { useState } from 'react';
import { authService } from '../services/authService';

function Login({ onLogin, companyLogo }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setLoginError('');

    try {
      const user = await authService.login(email, password);
      onLogin(user);
    } catch (error) {
      setLoginError(error.message || 'Erro ao fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
      backgroundColor: 'var(--bg-light)'
    }}>
      <div className="login-form" style={{
        backgroundColor: '#fff',
        padding: '30px',
        borderRadius: '8px',
        boxShadow: '0 0 20px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        {companyLogo && (
          <img 
            src={companyLogo} 
            alt="Logo da Empresa" 
            style={{
              maxWidth: '200px',
              maxHeight: '80px',
              marginBottom: '20px'
            }}
          />
        )}
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#3498db' }}>Login</h2>
        {loginError && <p role="alert" style={{ color: 'red', textAlign: 'center', marginBottom: '15px' }}>{loginError}</p>}
        <form onSubmit={handleLogin} style={{ width: '100%' }}>
          <div className="form-group">
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="username"
            required
            style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ddd' }}
          />
        </div>
        <div className="form-group">
          <label htmlFor="login-password">Senha</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            autoComplete="current-password"
            required
            style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ddd' }}
          />
        </div>
        <button 
          type="submit"
          disabled={loading}
          className="ripple-effect btn-hover-effect"
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
