import React, { useState } from 'react';
import { authService } from '../services/authService';

function Login({ onLogin, companyLogo }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleLogin = () => {
    authService.login(username, password)
      .then(user => {
        if (user) {
          onLogin(user);
          setLoginError('');
        } else {
          setLoginError('Credenciais inválidas');
        }
      })
      .catch(error => {
        console.error("Login failed:", error);
        setLoginError('Erro ao fazer login. Tente novamente.');
      });
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
        {loginError && <p style={{ color: 'red', textAlign: 'center', marginBottom: '15px' }}>{loginError}</p>}
        <div className="form-group">
          <label>Usuário</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Usuário"
            style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ddd' }}
          />
        </div>
        <div className="form-group">
          <label>Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ddd' }}
          />
        </div>
        <button 
          onClick={handleLogin}
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
          Entrar
        </button>
      </div>
    </div>
  );
}

export default Login;
